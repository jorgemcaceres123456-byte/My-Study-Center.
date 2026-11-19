import type { AppState, StudyImage } from '../types';
import { uid } from './utils';

/** Guarda (o actualiza) el recuerdo permanente de una página analizada por la IA. */
export function upsertMemory(draft: AppState, image: Pick<StudyImage, 'id' | 'blobKey' | 'name' | 'subjectId'>, summary: string) {
  const clean = summary.trim();
  if (!clean) return;
  const existing = draft.memories.find((m) => m.imageId === image.id);
  if (existing) {
    existing.summary = clean;
    existing.createdAt = new Date().toISOString();
  } else {
    draft.memories.push({
      id: uid(), imageId: image.id, blobKey: image.blobKey, name: image.name,
      subjectId: image.subjectId, summary: clean, createdAt: new Date().toISOString(),
    });
  }
  const img = draft.images.find((i) => i.id === image.id);
  if (img) { img.aiSummary = clean; img.sentToAi = true; }
}

export function markSentToAi(draft: AppState, imageIds: string[]) {
  draft.images.forEach((i) => { if (imageIds.includes(i.id)) i.sentToAi = true; });
}
