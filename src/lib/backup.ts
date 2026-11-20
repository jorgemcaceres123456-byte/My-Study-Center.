import type { AppState } from '../types';
import { blobToDataUrl, clearBlobs, deleteBlob, getBlob, putBlob } from './imageStore';
import { downloadBlob, uid } from './utils';
import { allTutorMessages } from './tutors';

interface BackupFile {
  app: 'my-study-center';
  version: number;
  exportedAt: string;
  state: AppState;
  /** Binary pages + AI-generated images, as data URLs. */
  blobs: Array<{ key: string; dataUrl: string }>;
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [head, payload] = dataUrl.split(',', 2);
  const mime = /:(.*?);/.exec(head)?.[1] || 'application/octet-stream';
  const binary = atob(payload || '');
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export async function exportBackup(state: AppState) {
  const blobs: BackupFile['blobs'] = [];
  const seen = new Set<string>();
  const archives = state.archives || [];
  const archivedImages = archives.flatMap((a) => a.data?.images || []);
  const archivedFiles = archives.flatMap((a) => a.data?.chatFiles || []);
  const archivedMessages = archives.flatMap((a) => Object.values(a.data?.tutorMessages || {}).flat());
  const addBlob = async (key: string) => {
    if (!key || seen.has(key)) return;
    seen.add(key);
    const blob = await getBlob(key).catch(() => undefined);
    if (blob) blobs.push({ key, dataUrl: await blobToDataUrl(blob) });
  };
  for (const img of [...state.images, ...archivedImages]) {
    await addBlob(img.blobKey);
  }
  // Files sent from the chat (PDF, DOCX, XLSX, PPTX, audio, imágenes…).
  for (const f of [...(state.chatFiles || []), ...archivedFiles]) await addBlob(f.blobKey);
  // Also keep images generated in the chat and audio clips.
  for (const msg of [...allTutorMessages(state), ...archivedMessages]) {
    const keys = [msg.imageKey, ...(msg.audios || []).map((a) => a.blobKey)].filter(Boolean) as string[];
    for (const key of keys) await addBlob(key);
  }
  const file: BackupFile = { app: 'my-study-center', version: state.version || 4, exportedAt: new Date().toISOString(), state, blobs };
  const stamp = new Date().toISOString().slice(0, 10);
  await downloadBlob(new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' }), `my-study-center-respaldo-${stamp}.json`);
  return { images: blobs.length };
}

export async function readBackup(file: File): Promise<{ state: AppState; imageCount: number }> {
  const parsed = JSON.parse(await file.text()) as BackupFile;
  if (parsed.app !== 'my-study-center' || !parsed.state || typeof parsed.state !== 'object') {
    throw new Error('Este archivo no es un respaldo válido de My Study Center.');
  }
  if (!Array.isArray(parsed.state.subjects) || !Array.isArray(parsed.state.tasks)) {
    throw new Error('El respaldo está dañado: faltan las materias o las tareas.');
  }
  // Only after full validation do we replace the binary store.
  await clearBlobs().catch(() => undefined);
  for (const entry of parsed.blobs || []) {
    try { await putBlob(entry.key, dataUrlToBlob(entry.dataUrl)); } catch (e) { console.warn('Blob no restaurado', entry.key, e); }
  }
  return { state: parsed.state, imageCount: (parsed.blobs || []).length };
}

export async function removeImageBlob(key: string) {
  try { await deleteBlob(key); } catch (e) { console.warn(e); }
}

export const newBackupKey = () => `backup-${uid()}`;
