import * as fs from 'fs/promises';
import * as path from 'path';

export const MAX_RECORDING_BYTES = 64 * 1024 * 1024;

export async function removeStaleRecordings(root: string, now = Date.now()): Promise<void> {
  const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith('recording-')) continue;
    const workspace = path.join(root, entry.name);
    const stat = await fs.stat(workspace);
    if (now - stat.mtimeMs > 24 * 60 * 60 * 1000) await fs.rm(workspace, { recursive: true, force: true });
  }
}

/** Only app-created workspaces are deleted; renderer input never chooses a path. */
export async function storeRecording(bytes: unknown, root: string): Promise<{ audioPath: string; cleanup: () => Promise<void> }> {
  if (!(bytes instanceof Uint8Array) || !bytes.byteLength || bytes.byteLength > MAX_RECORDING_BYTES) {
    throw new Error('Recording must contain WebM audio between 1 byte and 64 MB.');
  }
  if (bytes[0] !== 0x1a || bytes[1] !== 0x45 || bytes[2] !== 0xdf || bytes[3] !== 0xa3) {
    throw new Error('Unsupported recording format. Expected WebM audio.');
  }
  await fs.mkdir(root, { recursive: true });
  const workspace = await fs.mkdtemp(path.join(root, 'recording-'));
  const cleanup = () => fs.rm(workspace, { recursive: true, force: true });
  const audioPath = path.join(workspace, 'interview.webm');
  try {
    await fs.writeFile(audioPath, bytes, { flag: 'wx' });
    return { audioPath, cleanup };
  } catch (error) {
    await cleanup();
    throw error;
  }
}
