import * as fs from 'fs/promises';
import { createReadStream, createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import * as path from 'path';
import { parseTransducerTranscript } from './transducer-transcript';
import { TranscriptionResult } from './types';

const RATE = 16000;
export interface AudioChunk { file: string; start: number; end: number }

/** Partition, never trim: detector errors must not cause audio to disappear. */
export function chunkBoundaries(frames: number, gaps: Array<{ start: number; end: number }>): number[] {
  const cuts = new Set([0, frames]);
  for (const gap of gaps) {
    if (!Number.isFinite(gap.start) || !Number.isFinite(gap.end) || gap.start < 0 ||
        gap.end > frames / RATE || gap.end - gap.start < 5) continue;
    // At least one midpoint cut; bound long quiet runs to <=15 s per partition.
    const parts = Math.max(2, Math.ceil((gap.end - gap.start) / 15));
    for (let i = 1; i < parts; i++) {
      const frame = Math.round((gap.start + (gap.end - gap.start) * i / parts) * RATE);
      if (frame > 0 && frame < frames) cuts.add(frame);
    }
  }
  return [...cuts].sort((a, b) => a - b);
}

async function pcmData(file: string): Promise<{ offset: number; bytes: number }> {
  const source = await fs.open(file, 'r');
  try {
    const header = Buffer.alloc(12);
    await source.read(header, 0, 12, 0);
    if (header.toString('ascii', 0, 4) !== 'RIFF' || header.toString('ascii', 8, 12) !== 'WAVE') throw new Error('Invalid normalized WAV');
    const size = (await source.stat()).size;
    let formatOK = false;
    for (let offset = 12; offset + 8 <= size;) {
      const chunk = Buffer.alloc(8);
      await source.read(chunk, 0, 8, offset);
      const bytes = chunk.readUInt32LE(4);
      if (offset + 8 + bytes > size) throw new Error('Truncated normalized WAV');
      const type = chunk.toString('ascii', 0, 4);
      if (type === 'fmt ' && bytes >= 16) {
        const fmt = Buffer.alloc(16);
        await source.read(fmt, 0, 16, offset + 8);
        formatOK = fmt.readUInt16LE(0) === 1 && fmt.readUInt16LE(2) === 1 &&
          fmt.readUInt32LE(4) === RATE && fmt.readUInt16LE(12) === 2 && fmt.readUInt16LE(14) === 16;
      }
      if (type === 'data') {
        if (!formatOK || bytes % 2) throw new Error('Expected mono 16 kHz PCM16 WAV');
        return { offset: offset + 8, bytes };
      }
      offset += 8 + bytes + bytes % 2;
    }
    throw new Error('Normalized WAV has no PCM data');
  } finally { await source.close(); }
}

export async function prepareParakeetChunks(wav: string, gaps: Array<{ start: number; end: number }>): Promise<AudioChunk[]> {
  const data = await pcmData(wav);
  const cuts = chunkBoundaries(data.bytes / 2, gaps);
  if (cuts.length === 2) return [{ file: wav, start: 0, end: data.bytes / 2 / RATE }];
  const chunks: AudioChunk[] = [];
  for (let i = 0; i < cuts.length - 1; i++) {
    const start = cuts[i], end = cuts[i + 1], bytes = (end - start) * 2;
    const file = path.join(path.dirname(wav), `pause-chunk-${i}.wav`);
    const header = Buffer.alloc(44);
    header.write('RIFF'); header.writeUInt32LE(bytes + 36, 4); header.write('WAVEfmt ', 8);
    header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
    header.writeUInt32LE(RATE, 24); header.writeUInt32LE(RATE * 2, 28);
    header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(bytes, 40);
    await fs.writeFile(file, header);
    await pipeline(createReadStream(wav, { start: data.offset + start * 2, end: data.offset + end * 2 - 1 }), createWriteStream(file, { flags: 'a' }));
    chunks.push({ file, start: start / RATE, end: end / RATE });
  }
  return chunks;
}

export function parseParakeetChunks(output: string, chunks: AudioChunk[]): TranscriptionResult {
  const rows = output.split(/\r?\n/).filter(line => line.trim()).map(line => JSON.parse(line)).filter(row => row.type !== 'batch_header');
  if (rows.length !== chunks.length) throw new Error('Speech engine returned an unexpected chunk count');
  const results = rows.map((row, i) => {
    if (path.resolve(row.file || '') !== path.resolve(chunks[i].file)) throw new Error('Speech engine returned chunks out of order');
    return parseTransducerTranscript(JSON.stringify(row));
  });
  const text = results.map(result => result.text.trim()).filter(Boolean).join(' ');
  const alignmentWarning = results.find(result => result.alignmentWarning)?.alignmentWarning;
  return { text,
    ...(alignmentWarning ? { alignmentWarning } : { timingMethod: 'transducer-tokens' as const,
      segments: results.flatMap((result, i) => (result.segments || []).map(segment => ({ ...segment,
        start: segment.start + chunks[i].start, end: segment.end + chunks[i].start }))) }),
    recognitionChunks: chunks.map(({ start, end }) => ({ start, end })),
  };
}
