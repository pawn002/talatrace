"""Prepare a deterministic small LibriSpeech evaluation without extracting arbitrary tar paths."""
import argparse, array, hashlib, json, math, pathlib, random, subprocess, tarfile, urllib.request, wave

ROOT = pathlib.Path(__file__).resolve().parents[1]
CACHE = ROOT / 'benchmarks/cache'
EXPECTED_MD5 = '32fa31d27d2e1cad72775fee3f4849a9'

def digest(path, algorithm='sha256'):
    h = hashlib.new(algorithm)
    with path.open('rb') as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b''): h.update(chunk)
    return h.hexdigest()

def write_wav(path, samples):
    with wave.open(str(path), 'wb') as out:
        out.setparams((1, 2, 16000, 0, 'NONE', 'not compressed'))
        out.writeframes(array.array('h', samples).tobytes())

def prepare(count):
    archive = CACHE / 'test-clean.tar.gz'
    if not archive.exists():
        CACHE.mkdir(parents=True, exist_ok=True)
        staging = archive.with_suffix('.download')
        print('Downloading public LibriSpeech test-clean (about 346 MB)...', flush=True)
        urllib.request.urlretrieve('https://www.openslr.org/resources/12/test-clean.tar.gz', staging)
        if digest(staging, 'md5') != EXPECTED_MD5: raise ValueError('Downloaded archive checksum mismatch')
        staging.replace(archive)
    if digest(archive, 'md5') != EXPECTED_MD5: raise ValueError('OpenSLR archive checksum mismatch')
    target = CACHE / f'librispeech-{count}'
    target.mkdir(parents=True, exist_ok=True)
    with tarfile.open(archive) as tar:
        speakers = {}
        for line in tar.extractfile('LibriSpeech/SPEAKERS.TXT').read().decode().splitlines():
            if line.startswith(';') or not line.strip(): continue
            fields = [field.strip() for field in line.split('|')]
            if fields[2] == 'test-clean': speakers[fields[0]] = fields[1]
        transcripts = {}
        for member in tar.getmembers():
            if member.name.endswith('.trans.txt'):
                for line in tar.extractfile(member).read().decode().splitlines():
                    key, text = line.split(' ', 1)
                    if 14 <= len(text.split()) <= 30:
                        transcripts[key] = (text, str(pathlib.PurePosixPath(member.name).parent / (key + '.flac')))
        # Equal male/female speaker counts; deterministic hash order, one utterance per speaker.
        key = lambda value: hashlib.sha256(('speech-eval-v1:' + value).encode()).hexdigest()
        selected = []
        for gender in ['F', 'M']:
            ids = sorted([s for s, g in speakers.items() if g == gender and any(t.startswith(s + '-') for t in transcripts)], key=key)
            for speaker in ids[:count // 2]:
                utterance = min([t for t in transcripts if t.startswith(speaker + '-')], key=key)
                selected.append(utterance)
        if len(selected) != count: raise ValueError('Not enough eligible distinct speakers')
        items = []
        for utterance in selected:
            text, member = transcripts[utterance]
            flac = target / (utterance + '.flac')
            flac.write_bytes(tar.extractfile(member).read())
            wav = target / (utterance + '.wav')
            subprocess.run([str(ROOT / 'ffmpeg/bin/ffmpeg.exe'), '-hide_banner', '-loglevel', 'error', '-y', '-i', str(flac), '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', str(wav)], check=True)
            items.append(dict(id=utterance, condition='clean', reference=text, file=wav.name,
                              speaker=utterance.split('-')[0], gender=speakers[utterance.split('-')[0]]))
        first = items[0]
        chapter = str(pathlib.PurePosixPath(transcripts[first['id']][1]).parent)
        second_id = min([t for t, (_, member) in transcripts.items() if t != first['id'] and str(pathlib.PurePosixPath(member).parent) == chapter], key=key)
        second_text, member = transcripts[second_id]
        flac = target / (second_id + '.flac')
        flac.write_bytes(tar.extractfile(member).read())
        second_wav = target / (second_id + '.wav')
        subprocess.run([str(ROOT / 'ffmpeg/bin/ffmpeg.exe'), '-hide_banner', '-loglevel', 'error', '-y', '-i', str(flac), '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', str(second_wav)], check=True)
    clean = list(items)
    for index, item in enumerate(clean[:3]):
        with wave.open(str(target / item['file'])) as source: samples = array.array('h', source.readframes(source.getnframes()))
        gap = len(samples) // 2
        pause = target / (item['id'] + '-pause.wav')
        write_wav(pause, samples[:gap] + array.array('h', [0]) * (16000 * 30) + samples[gap:])
        items.append(dict(item, id=item['id'] + '-pause', condition='pause-30s', file=pause.name, pauseStart=gap/16000, pauseEnd=gap/16000+30))
        rms = math.sqrt(sum(x*x for x in samples) / len(samples))
        rng = random.Random(1729 + index)
        noisy = target / (item['id'] + '-noise.wav')
        noise = [rng.gauss(0, 1) for _ in samples]
        noise_rms = math.sqrt(sum(x*x for x in noise) / len(noise))
        mixed = [x + n * rms / math.sqrt(10) / noise_rms for x, n in zip(samples, noise)]
        gain = min(1, 32767 / max(abs(x) for x in mixed))
        write_wav(noisy, [round(x * gain) for x in mixed])
        items.append(dict(item, id=item['id'] + '-noise', condition='white-noise-10dB', file=noisy.name))
    for condition in ['silence', 'noise-only']:
        wav = target / (condition + '.wav')
        rng = random.Random(1729)
        write_wav(wav, [0 if condition == 'silence' else round(rng.gauss(0, 327)) for _ in range(16000 * 30)])
        items.append(dict(id=condition, condition=condition, reference='', file=wav.name))
    for item in items:
        file = target / item['file']
        with wave.open(str(file)) as source: item['duration'] = source.getnframes() / source.getframerate()
        item['sha256'] = digest(file)
    manifest = dict(version=1, corpus='LibriSpeech test-clean', source='https://www.openslr.org/12/',
                    license='CC BY 4.0', archiveMD5=EXPECTED_MD5, archiveSHA256=digest(archive),
                    selection=f'v1: {count//2} female + {count//2} male speakers, sha256 order, one 14–30-word utterance each', items=items)
    (target / 'manifest.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
    # Confirm midpoint-cut findings using two complete utterances from the same speaker.
    with wave.open(str(target / first['file'])) as source: aa = array.array('h', source.readframes(source.getnframes()))
    with wave.open(str(second_wav)) as source: bb = array.array('h', source.readframes(source.getnframes()))
    boundary_items = []
    for gap in [1, 30]:
        file = target / f'boundary-pause-{gap}.wav'
        write_wav(file, aa + array.array('h', [0]) * (16000 * gap) + bb)
        boundary_items.append(dict(id=f'boundary-pause-{gap}', condition=f'boundary-pause-{gap}s',
                                   reference=first['reference'] + ' ' + second_text, file=file.name,
                                   duration=(len(aa)+len(bb))/16000+gap, sha256=digest(file),
                                   sourceIds=[first['id'], second_id], pauseStart=len(aa)/16000, pauseEnd=len(aa)/16000+gap))
    boundary_manifest = dict(manifest, items=boundary_items,
                             selection=f'Two complete utterances from speaker {first["speaker"]}, identical speech with 1s versus 30s inserted gap; no mid-word cut.')
    (target / 'boundary-manifest.json').write_text(json.dumps(boundary_manifest, indent=2), encoding='utf-8')
    print(f"Prepared {len(items)} items in {target}; {sum(x['duration'] for x in items):.1f}s audio")

if __name__ == '__main__':
    parser = argparse.ArgumentParser(); parser.add_argument('--count', type=int, default=12)
    args = parser.parse_args()
    if args.count < 2 or args.count % 2: parser.error('count must be a positive even number >= 2')
    prepare(args.count)
