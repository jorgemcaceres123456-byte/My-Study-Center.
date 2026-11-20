import type { AppState, ID, Tutor } from '../types';

/** ID determinista: una materia = un tutor, siempre. */
export const tutorIdFor = (subjectId: ID) => `tutor-${subjectId}`;

/**
 * Mantiene la relación 1 materia ↔ 1 tutor ↔ 1 chat.
 * Se ejecuta al cargar, al importar un respaldo y al crear/borrar materias,
 * así que es imposible que una materia nueva se quede sin tutor.
 */
export function ensureTutors(state: AppState): AppState {
  const previous = state.tutors || [];
  const map = state.tutorMessages || {};
  state.tutors = state.subjects.map<Tutor>((s) => {
    const old = previous.find((t) => t.subjectId === s.id);
    return {
      id: tutorIdFor(s.id),
      subjectId: s.id,
      name: `Tutor de ${s.name}`,
      createdAt: old?.createdAt || s.createdAt || new Date().toISOString(),
    };
  });
  state.tutorMessages = Object.fromEntries(
    state.tutors.map((t) => [t.id, Array.isArray(map[t.id]) ? map[t.id] : []]),
  );
  return state;
}

export const allTutorMessages = (state: AppState) =>
  Object.values(state.tutorMessages || {}).flat();
