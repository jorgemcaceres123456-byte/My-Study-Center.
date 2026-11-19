/** IndexedDB store for image blobs. localStorage holds metadata only (its 5 MB cap is too small for photos). */
const DB_NAME = 'my-study-center';
const STORE = 'blobs';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDB();
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = run(t.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('Transacción cancelada'));
    t.oncomplete = () => db.close();
  });
}

export const putBlob = (key: string, blob: Blob) => tx('readwrite', (s) => s.put(blob, key));
export const getBlob = (key: string) => tx<Blob | undefined>('readonly', (s) => s.get(key));
export const deleteBlob = (key: string) => tx('readwrite', (s) => s.delete(key));
export const listBlobKeys = () => tx<IDBValidKey[]>('readonly', (s) => s.getAllKeys());

export async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

export async function seedSampleNotes(notes: Array<{ name: string; svg: string }>, onSeed: (name: string, key: string, size: number) => void) {
  for (const note of notes) {
    const key = `sample-${note.name}`;
    const existing = await getBlob(key).catch(() => undefined);
    if (!existing) {
      const blob = new Blob([note.svg], { type: 'image/svg+xml' });
      await putBlob(key, blob);
      onSeed(note.name, key, blob.size);
    }
  }
}

export async function clearBlobs(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, 'readwrite');
    t.objectStore(STORE).clear();
    t.oncomplete = () => { db.close(); resolve(); };
    t.onerror = () => reject(t.error);
  });
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const [head, payload] = dataUrl.split(',', 2);
  const mime = /:(.*?);/.exec(head)?.[1] || 'image/png';
  const binary = atob(payload || '');
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}
