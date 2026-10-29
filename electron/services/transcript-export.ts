import * as path from 'path';
import * as fs from 'fs/promises';
import type { SaveDialogOptions, SaveDialogReturnValue } from 'electron';

export type TranscriptFormat = 'txt' | 'srt' | 'vtt' | 'json';
const formats = { txt: 'Text', srt: 'SRT subtitles', vtt: 'WebVTT subtitles', json: 'JSON' };

export function exportPath(selected: string, format: TranscriptFormat): string {
  const ext = path.extname(selected).toLowerCase();
  if (ext === '.' + format) return selected;
  if (Object.prototype.hasOwnProperty.call(formats, ext.slice(1))) return selected;
  return selected.replace(/\.+$/, '') + '.' + format;
}

export function serializeTranscript(data: any, format: TranscriptFormat): string {
  const segments = Array.isArray(data?.segments) && data.segments.length ? data.segments : null;
  if (format === 'json') return JSON.stringify(data, null, 2);
  if (format === 'srt') return segments ? convertSegmentsToSRT(segments) : convertToSRT(data?.text || '');
  if (format === 'vtt') return segments ? convertSegmentsToVTT(segments) : convertToVTT(data?.text || '');
  return typeof data?.timestampedText === 'string' ? data.timestampedText : segments ? segments.map((s: any) => s.text).join(' ') : data?.text || JSON.stringify(data);
}

export class TranscriptExporter {
  private lastDirectory?: string;
  private lastStem = 'transcript';
  constructor(private dialogs: {
    directory: () => string;
    choose: (options: SaveDialogOptions) => Promise<SaveDialogReturnValue>;
    confirmOverwrite: (file: string) => Promise<boolean>;
  }) {}

  async save(data: any, requested: unknown = 'txt'): Promise<string | null> {
    if (typeof requested !== 'string' || !Object.prototype.hasOwnProperty.call(formats, requested)) throw new Error('Unsupported transcript format');
    validateExport(data, requested as TranscriptFormat);
    const format = requested as TranscriptFormat;
    const result = await this.dialogs.choose({
      title: 'Save transcript',
      buttonLabel: 'Save transcript',
      defaultPath: path.join(this.lastDirectory || this.dialogs.directory(), this.lastStem + '.' + format),
      filters: [{ name: formats[format], extensions: [format] }],
      properties: ['showOverwriteConfirmation'],
    });
    if (result.canceled || !result.filePath) return null;
    if (!path.isAbsolute(result.filePath)) throw new Error('Expected an absolute export path');
    const file = exportPath(result.filePath, format);
    const suffix = path.extname(file).slice(1).toLowerCase();
    validateExport(data, suffix as TranscriptFormat);
    const content = serializeTranscript(data, suffix as TranscriptFormat);
    if (file === result.filePath) {
      // Native overwrite confirmation covers this exact name.
      await fs.writeFile(file, content, 'utf8');
    } else {
      // GTK can omit or retain another suffix. Its confirmation did not cover
      // the normalized name, so don't overwrite that name without permission.
      try { await fs.writeFile(file, content, { encoding: 'utf8', flag: 'wx' }); }
      catch (error: any) {
        if (error.code !== 'EEXIST') throw error;
        if (!await this.dialogs.confirmOverwrite(file)) return null;
        await fs.writeFile(file, content, 'utf8');
      }
    }
    this.lastDirectory = path.dirname(file);
    this.lastStem = path.basename(file, path.extname(file));
    return file;
  }
}

export function hasTranscriptText(data: any): boolean {
  return Boolean((typeof data?.text === 'string' && data.text.trim()) ||
    data?.segments?.some((segment: any) => typeof segment?.text === 'string' && segment.text.trim()));
}

function validateExport(data: any, format: TranscriptFormat): void {
  if ((format === 'srt' || format === 'vtt') && !hasTranscriptText(data) || format === 'txt' && !serializeTranscript(data, 'txt').trim()) {
    throw new Error('No speech text to export. Use JSON for diagnostics, or record again.');
  }
}

function formatSubtitleTimestamp(seconds: number, separator: ',' | '.'): string {
  if (!Number.isFinite(seconds) || seconds < 0) throw new Error('Invalid subtitle timestamp');
  // Round the full duration first so floating-point fractions and carries across
  // a second/minute/hour use the same millisecond precision as the preview.
  const total = Math.round(seconds * 1000);
  const hh = Math.floor(total / 3600000).toString().padStart(2, '0');
  const mm = Math.floor(total % 3600000 / 60000).toString().padStart(2, '0');
  const ss = Math.floor(total % 60000 / 1000).toString().padStart(2, '0');
  return `${hh}:${mm}:${ss}${separator}${(total % 1000).toString().padStart(3, '0')}`;
}

function formatTimestampForSRT(seconds: number): string { return formatSubtitleTimestamp(seconds, ','); }
function formatTimestampForVTT(seconds: number): string { return formatSubtitleTimestamp(seconds, '.'); }

// Helper function to convert segments array to SRT format
function convertSegmentsToSRT(segments: any[]): string {
  return segments.map((segment, index) => {
    const startTime = formatTimestampForSRT(segment.start);
    const endTime = formatTimestampForSRT(segment.end);
    const text = segment.text.trim();

    return `${index + 1}\n${startTime} --> ${endTime}\n${text}\n`;
  }).join('\n');
}

// Helper function to convert segments array to VTT format
function convertSegmentsToVTT(segments: any[]): string {
  let vttContent = 'WEBVTT\n\n';

  vttContent += segments.map(segment => {
    const startTime = formatTimestampForVTT(segment.start);
    const endTime = formatTimestampForVTT(segment.end);
    const text = segment.text.trim();

    return `${startTime} --> ${endTime}\n${text}\n`;
  }).join('\n');

  return vttContent;
}

// Helper function to convert Whisper timestamp format to SRT (for backward compatibility)
function convertToSRT(text: string): string {
  const lines = text.split('\n').filter((line) => line.trim());
  let srtContent = '';
  let index = 1;

  for (const line of lines) {
    const match = line.match(
      /\[(\d{2}:\d{2}:\d{2}\.\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}\.\d{3})\]\s*(.+)/
    );
    if (match) {
      const [, start, end, subtitle] = match;
      // Convert milliseconds format from . to ,
      const srtStart = start.replace('.', ',');
      const srtEnd = end.replace('.', ',');
      srtContent += `${index}\n${srtStart} --> ${srtEnd}\n${subtitle.trim()}\n\n`;
      index++;
    }
  }

  return srtContent || text; // Fallback to original if no matches
}

// Helper function to convert Whisper timestamp format to VTT
function convertToVTT(text: string): string {
  const lines = text.split('\n').filter((line) => line.trim());
  let vttContent = 'WEBVTT\n\n';

  for (const line of lines) {
    const match = line.match(
      /\[(\d{2}:\d{2}:\d{2}\.\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}\.\d{3})\]\s*(.+)/
    );
    if (match) {
      const [, start, end, subtitle] = match;
      vttContent += `${start} --> ${end}\n${subtitle.trim()}\n\n`;
    }
  }

  return vttContent === 'WEBVTT\n\n' && text.trim() ? text : vttContent;
}

