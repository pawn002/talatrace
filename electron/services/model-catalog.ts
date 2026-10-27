import { referencePerformance } from './model-benchmarks';

export interface SpeechModel {
  name: string;
  displayName: string;
  engine: 'whisper.cpp' | 'transcribe.cpp';
  filename: string;
  url: string;
  sizeBytes: number;
  sha256: string;
  revision: string;
  license: string;
  source: string;
  repository: string;
  repositoryUrl: string;
  languages?: readonly string[];
  speed: string;
  accuracy: string;
  speedRatio?: number;
  wordErrorRate?: number;
  description: string;
}

const whisperRevision = '5359861c739e955e79d9a303bcbc70fb988958b1';
function artifactRepository(url: string) {
  const source = new URL(url);
  const repository = source.pathname.split('/').slice(1, 3).join('/');
  return { repository, repositoryUrl: `${source.origin}/${repository}` };
}
function whisper(name: string, displayName: string, sizeBytes: number, sha256: string, file = `ggml-${name}.bin`): SpeechModel {
  const url = `https://huggingface.co/ggerganov/whisper.cpp/resolve/${whisperRevision}/${file}`;
  return { name, displayName, sizeBytes, sha256, ...referencePerformance(name), filename: `ggml-${name}.bin`,
    engine: 'whisper.cpp', revision: whisperRevision, license: 'MIT', source: 'https://github.com/openai/whisper',
    url, ...artifactRepository(url),
    description: name === 'large-v3-turbo-q5_0' ? 'Faster Whisper decoder with quantized weights. Compare accuracy on your recordings.' :
      name === 'large' ? 'Segment-level timestamps.' : '' };
}

const parakeetUrl = 'https://huggingface.co/handy-computer/parakeet-tdt-0.6b-v3-gguf/resolve/d8d8c32cb2017c57e5307767343e97870f8a7f53/parakeet-tdt-0.6b-v3-Q8_0.gguf';

/** Curated IDs only: neither paths nor URLs are accepted from the renderer. */
export const SPEECH_MODELS: readonly SpeechModel[] = [
  whisper('tiny', 'Whisper Tiny', 77691713, 'be07e048e1e599ad46341c8d2a135645097a538221678b7acdd1b1919c6e1b21'),
  whisper('base', 'Whisper Base', 147951465, '60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe'),
  whisper('small', 'Whisper Small', 487601967, '1be3a9b2063867b937e64e2ec7483364a79917e157fa98c5d94b5c1fffea987b'),
  whisper('medium', 'Whisper Medium', 1533763059, '6c14d5adee5f86394037b4e4e8b59f1673b6cee10e3cf0b11bbdbee79c156208'),
  // Keep the historical ID/filename; newly downloaded weights are explicitly v3.
  whisper('large', 'Whisper Large v3', 3095033483, '64d182b440b98d5203c4f9bd541544d84c605196c4f7b845dfa11fb23594d1e2', 'ggml-large-v3.bin'),
  whisper('large-v3-turbo-q5_0', 'Whisper Large v3 Turbo · Q5_0', 574041195, '394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2'),
  { name: 'parakeet-tdt-0.6b-v3', displayName: 'Parakeet TDT 0.6B v3 · Q8_0', engine: 'transcribe.cpp',
    filename: 'parakeet-tdt-0.6b-v3-Q8_0.gguf', sizeBytes: 739508576,
    sha256: '5859f77944efcd8eafa23a6350731960b2b55b2203df51f319665c807d802cc7',
    revision: 'd8d8c32cb2017c57e5307767343e97870f8a7f53', license: 'CC-BY-4.0',
    source: 'https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3',
    url: parakeetUrl, ...artifactRepository(parakeetUrl),
    languages: ['bg','hr','cs','da','nl','en','et','fi','fr','de','el','hu','it','lv','lt','mt','pl','pt','ro','ru','sk','sl','es','sv','uk'],
    ...referencePerformance('parakeet-tdt-0.6b-v3'), description: 'Local transcription in 25 European languages with token timings. No translation. NVIDIA; GGUF conversion by handy-computer (CC-BY-4.0).' },
];

export function speechModel(name: string): SpeechModel {
  const model = SPEECH_MODELS.find(model => model.name === name);
  if (!model) throw new Error(`Unknown speech model: ${name}`);
  return model;
}

export function modelSize(bytes: number): string {
  return bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(2)} GiB` : `${Math.ceil(bytes / 1024 ** 2)} MiB`;
}
