import { processImage } from '../evidence/image';
import { downloadBlob } from '../export/collect';
import { MISSION_EXTENSION, MISSION_MIME } from './mission';
import type { Reencode } from './repository';

/**
 * Where a mission file goes. Chrome and Edge offer the native save dialog (File System Access
 * API), so the user picks the folder and name. Firefox has no such API: the file is downloaded.
 */
export type SaveTarget =
  { kind: 'handle'; name: string; handle: WritableHandle } | { kind: 'download'; name: string };

interface WritableHandle {
  name: string;
  createWritable(): Promise<{
    write(data: Blob): Promise<void>;
    close(): Promise<void>;
  }>;
}

type SavePicker = (options: {
  suggestedName: string;
  id: string;
  types: { description: string; accept: Record<string, string[]> }[];
}) => Promise<WritableHandle>;

const savePicker = (): SavePicker | undefined =>
  (globalThis as { showSaveFilePicker?: SavePicker }).showSaveFilePicker;

export const hasNativeSaveDialog = () => typeof savePicker() === 'function';

/**
 * Asks where to save. Call it straight from a click: browsers only open the dialog during a
 * user gesture. Returns null when the user cancels.
 */
export async function chooseSaveTarget(fileName: string): Promise<SaveTarget | null> {
  const picker = savePicker();
  if (!picker) return { kind: 'download', name: fileName };
  try {
    const handle = await picker({
      suggestedName: fileName,
      id: 'pwnpoint-missions',
      types: [{ description: 'PwnPoint mission', accept: { [MISSION_MIME]: [MISSION_EXTENSION] } }],
    });
    return { kind: 'handle', name: handle.name, handle };
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return null;
    // The dialog is unavailable here (policy, sandbox): fall back to a download.
    return { kind: 'download', name: fileName };
  }
}

export async function writeToTarget(target: SaveTarget, bytes: Uint8Array<ArrayBuffer>) {
  const blob = new Blob([bytes], { type: MISSION_MIME });
  if (target.kind === 'download') {
    downloadBlob(blob, target.name);
    return;
  }
  const stream = await target.handle.createWritable();
  // File System Access API, not document.write: binary data only, no HTML is involved.
  // eslint-disable-next-line no-restricted-syntax
  await stream.write(blob);
  await stream.close();
}

/** The browser re-encode used on import: decode the PNG on a canvas and encode it again. */
export const canvasReencode: Reencode = async (png) => {
  const img = await processImage(new Blob([png], { type: 'image/png' }));
  return { bytes: img.bytes, width: img.width, height: img.height };
};

export const today = (now = new Date()) => now.toISOString().slice(0, 10);
