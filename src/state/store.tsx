import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AppState, EnglishLevel, StudyImage } from '../types';
import { createDemoState, createEmptyState, defaultSettings, SAMPLE_NOTES } from '../data/defaults';
import { safeJson } from '../lib/utils';
import { clearBlobs, seedSampleNotes } from '../lib/imageStore';
import { ensureTutors } from '../lib/tutors';
import { ensureAcademic } from '../lib/academic';

/** v4 = ciclo escolar, búsqueda web, streaming y respaldo de modelo. */
const STORAGE_KEY = 'my-study-center:v4';

interface StoreValue {
  state: AppState;
  update: (recipe: (draft: AppState) => void) => void;
  replace: (next: AppState) => void;
  loadDemo: () => void;
  clearAll: () => void;
  storageError: string | null;
}

const StoreContext = createContext<StoreValue | null>(null);

function normalize(raw: Partial<AppState> | null): AppState {
  const base = createEmptyState();
  const legacy = Array.isArray(raw?.messages) ? raw.messages : [];
  const next: AppState = {
    ...base,
    subjects: Array.isArray(raw?.subjects) ? raw.subjects : [],
    tutors: Array.isArray(raw?.tutors) ? raw.tutors : [],
    tutorMessages: raw?.tutorMessages && typeof raw.tutorMessages === 'object' ? { ...raw.tutorMessages } : {},
    messages: [],
    tasks: Array.isArray(raw?.tasks) ? raw.tasks : [],
    images: Array.isArray(raw?.images)
      ? raw.images.map((i) => ({ ...i, sentToAi: i.sentToAi ?? false })) as StudyImage[]
      : [],
    chatFiles: Array.isArray(raw?.chatFiles) ? raw.chatFiles : [],
    memories: Array.isArray(raw?.memories) ? raw.memories : [],
    sessions: Array.isArray(raw?.sessions) ? raw.sessions : [],
    activeSession: raw?.activeSession ?? null,
    events: Array.isArray(raw?.events) ? raw.events : [],
    habits: Array.isArray(raw?.habits) ? raw.habits : [],
    quizzes: Array.isArray(raw?.quizzes) ? raw.quizzes : [],
    quizAttempts: raw?.quizAttempts && typeof raw.quizAttempts === 'object' ? { ...raw.quizAttempts } : {},
    englishLevel: (['A1','A2','B1','B2','C1','C2'] as EnglishLevel[]).includes(raw?.englishLevel as EnglishLevel) ? raw!.englishLevel as EnglishLevel : 'B1',
    pentagonSubjectIds: Array.isArray(raw?.pentagonSubjectIds) ? raw.pentagonSubjectIds : [],
    academic: raw?.academic ? { ...base.academic, ...raw.academic } : base.academic,
    archives: Array.isArray(raw?.archives) ? raw.archives : [],
    settings: { ...defaultSettings, ...(raw?.settings || {}) },
    accent: raw?.accent === 'ocean' || raw?.accent === 'sunset' ? raw.accent : 'aurora',
    notificationsEnabled: Boolean(raw?.notificationsEnabled),
    seeded: Boolean(raw?.seeded),
  };
  ensureAcademic(next);
  ensureTutors(next);
  // Migración de chats de la v2: pasan al primer tutor para no perderlos.
  if (legacy.length && !Object.values(next.tutorMessages).some((m) => m.length)) {
    const first = next.tutors[0];
    if (first) next.tutorMessages[first.id] = legacy.slice(-60);
  }
  return next;
}

function load(): AppState {
  const raw = safeJson<Partial<AppState> | null>(localStorage.getItem(STORAGE_KEY), null);
  if (raw) return normalize(raw);
  // Migración suave desde la v2 (si existía).
  const old3 = safeJson<Partial<AppState> | null>(localStorage.getItem('my-study-center:v3'), null);
  if (old3) return normalize(old3);
  const old2 = safeJson<Partial<AppState> | null>(localStorage.getItem('my-study-center:v2'), null);
  return old2 ? normalize(old2) : createEmptyState();
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(load);
  const [storageError, setStorageError] = useState<string | null>(null);

  const update = useCallback((recipe: (draft: AppState) => void) => {
    setState((prev) => {
      const draft: AppState = structuredClone(prev);
      recipe(draft);
      ensureAcademic(draft);
      return ensureTutors(draft);
    });
  }, []);

  const replace = useCallback((next: AppState) => setState(normalize(next)), []);

  const loadDemo = useCallback(() => {
    void (async () => {
      await clearBlobs().catch(() => undefined);
      setState(createDemoState());
      const added: StudyImage[] = [];
      try {
        await seedSampleNotes(SAMPLE_NOTES, (name, blobKey, size) => {
          const meta = SAMPLE_NOTES.find((n) => n.name === name)!;
          added.push({
            id: `sample-${added.length}`, subjectId: meta.subjectId, name: meta.name,
            mime: 'image/svg+xml', size, createdAt: new Date().toISOString(),
            notes: meta.notes, tags: meta.tags, aiSummary: '', blobKey, sentToAi: false,
          });
        });
        if (added.length) update((d) => { d.images = [...added, ...d.images]; });
      } catch (e) { console.warn('No se pudieron crear los apuntes de ejemplo', e); }
    })();
  }, [update]);

  const clearAll = useCallback(() => {
    void clearBlobs().catch(() => undefined);
    setState(createEmptyState());
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        setStorageError(null);
      } catch (e) {
        setStorageError('No se pudo guardar en el navegador. Revisa el espacio disponible o exporta un respaldo.');
        console.error(e);
      }
    }, 200);
    return () => window.clearTimeout(t);
  }, [state]);

  const value = useMemo<StoreValue>(
    () => ({ state, update, replace, loadDemo, clearAll, storageError }),
    [state, update, replace, loadDemo, storageError],
  );
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside StoreProvider');
  return ctx;
}
