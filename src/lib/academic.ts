import type { AcademicArchive, AcademicArchiveCounts, AcademicArchiveData, AcademicCycle, AppState } from '../types';
import { ensureTutors } from './tutors';
import { uid } from './utils';

export const START_GRADE = 7;

export const gradeLabel = (grade: number) => `${grade}.º grado`;
export const schoolYearLabel = (year: number) => `${year}–${year + 1}`;
export const makePeriodId = (grade: number, year: number, partial: number) => `g${grade}-y${year}-p${partial}`;

export const periodLabel = (cycle: AcademicCycle) =>
  `${gradeLabel(cycle.grade)} · Parcial ${cycle.partial} · Ciclo ${schoolYearLabel(cycle.schoolYear)}`;

export const shortPeriodLabel = (cycle: AcademicCycle) =>
  `${gradeLabel(cycle.grade)} · P${cycle.partial}`;

export function createAcademicCycle(): AcademicCycle {
  const year = new Date().getFullYear();
  return {
    grade: START_GRADE,
    schoolYear: year,
    partial: 1,
    periodId: makePeriodId(START_GRADE, year, 1),
    startedAt: new Date().toISOString(),
  };
}

/** Garantiza que todo estado (incluido un respaldo antiguo) tenga ciclo y archivo. */
export function ensureAcademic(state: AppState): AppState {
  if (!state.academic || typeof state.academic.grade !== 'number') state.academic = createAcademicCycle();
  if (!state.academic.periodId) {
    state.academic.periodId = makePeriodId(state.academic.grade, state.academic.schoolYear, state.academic.partial);
  }
  if (!Array.isArray(state.archives)) state.archives = [];
  state.version = 4;
  return state;
}

const clone = <T>(value: T): T => structuredClone(value);

function currentTopics(state: AppState): string[] {
  const raw = [
    ...state.images.map((i) => i.name),
    ...state.memories.map((m) => m.name),
    ...state.quizzes.map((q) => q.title),
    ...state.tasks.map((t) => t.title),
    ...state.events.map((e) => e.title),
    ...state.images.flatMap((i) => i.tags),
  ];
  return Array.from(new Set(raw.map((x) => x.trim()).filter(Boolean))).slice(0, 24);
}

function snapshot(state: AppState): AcademicArchiveData {
  return {
    images: clone(state.images),
    memories: clone(state.memories),
    chatFiles: clone(state.chatFiles),
    tasks: clone(state.tasks),
    events: clone(state.events),
    quizzes: clone(state.quizzes),
    quizAttempts: clone(state.quizAttempts),
    tutorMessages: clone(state.tutorMessages),
  };
}

function countsOf(state: AppState): AcademicArchiveCounts {
  return {
    images: state.images.length,
    memories: state.memories.length,
    files: state.chatFiles.length,
    tasks: state.tasks.length,
    events: state.events.length,
    quizzes: state.quizzes.length,
    messages: Object.values(state.tutorMessages).reduce((n, list) => n + (list?.length || 0), 0),
  };
}

/**
 * Separa TODOS los temas del periodo actual: apuntes, memoria de los tutores,
 * archivos del chat, tareas, entregas y quizzes. Los conserva en `archives` y
 * deja los arrays activos vacíos para que ningún tutor ni quiz mezcle temas
 * del parcial/año anterior.
 */
function archiveCurrentPeriod(state: AppState, kind: AcademicArchive['kind'], label: string): AcademicArchive {
  const cycle = state.academic;
  const archive: AcademicArchive = {
    id: uid(),
    kind,
    label,
    grade: cycle.grade,
    schoolYear: cycle.schoolYear,
    partial: cycle.partial,
    periodId: cycle.periodId,
    closedAt: new Date().toISOString(),
    counts: countsOf(state),
    topics: currentTopics(state),
    data: snapshot(state),
  };
  state.archives.push(archive);
  if (state.archives.length > 24) state.archives = state.archives.slice(-24);

  // Los temas anteriores ya están archivados: el ciclo activo arranca limpio.
  state.images = [];
  state.memories = [];
  state.chatFiles = [];
  state.tasks = [];
  state.events = [];
  state.quizzes = [];
  state.quizAttempts = {};
  state.tutorMessages = {};
  state.messages = [];
  ensureTutors(state);
  return archive;
}

export function closePartial(state: AppState, customLabel = ''): AcademicArchive {
  const cycle = state.academic;
  const label = customLabel.trim() || `Parcial ${cycle.partial} · ${gradeLabel(cycle.grade)}`;
  const archive = archiveCurrentPeriod(state, 'partial', label);
  const nextPartial = cycle.partial + 1;
  state.academic = {
    ...cycle,
    partial: nextPartial,
    periodId: makePeriodId(cycle.grade, cycle.schoolYear, nextPartial),
    startedAt: new Date().toISOString(),
  };
  return archive;
}

export function closeSchoolYear(state: AppState, customLabel = ''): AcademicArchive {
  const cycle = state.academic;
  const label = customLabel.trim() || `Año escolar ${gradeLabel(cycle.grade)} · Ciclo ${schoolYearLabel(cycle.schoolYear)}`;
  const archive = archiveCurrentPeriod(state, 'year', label);
  const nextGrade = cycle.grade + 1;
  const nextYear = cycle.schoolYear + 1;
  state.academic = {
    grade: nextGrade,
    schoolYear: nextYear,
    partial: 1,
    periodId: makePeriodId(nextGrade, nextYear, 1),
    startedAt: new Date().toISOString(),
  };
  return archive;
}
