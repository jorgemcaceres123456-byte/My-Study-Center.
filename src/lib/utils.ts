import type { ID } from '../types';

export const uid = (): ID =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

export const clamp = (n: number, min = 0, max = 100) => Math.min(max, Math.max(min, n));
export const pct = (done: number, total: number) => (total <= 0 ? 0 : Math.round((done / total) * 100));
export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export const pad = (n: number) => String(n).padStart(2, '0');
/** Local date key (never UTC, so the user's day is respected). */
export const dateKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayKey = () => dateKey(new Date());
export const fromKey = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};
export const addDays = (d: Date, n: number) => {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
};
export const addMonths = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth() + n, 1);
export const monthLabel = (d: Date) =>
  new Intl.DateTimeFormat('es', { month: 'long', year: 'numeric' }).format(d);
export const shortDate = (d: Date) =>
  new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short' }).format(d);
export const longDate = (d: Date) =>
  new Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric', month: 'long' }).format(d);
export const fmtTime = (d: Date) =>
  new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit' }).format(d);

/** Parses `yyyy-MM-ddTHH:mm` as a LOCAL date (avoids UTC shifting). */
export const parseLocal = (value: string) => {
  const [date, time = '00:00'] = value.split('T');
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0);
};
export const toLocalInput = (d: Date) =>
  `${dateKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

export const isSameDay = (a: Date, b: Date) => dateKey(a) === dateKey(b);

export function relativeDue(value: string): { label: string; tone: 'overdue' | 'soon' | 'normal' } {
  const diff = parseLocal(value).getTime() - Date.now();
  const mins = Math.round(diff / 60000);
  const abs = Math.abs(mins);
  const soon = diff >= 0 && diff <= 48 * 60 * 60000;
  let label: string;
  if (mins < 0) {
    label = abs < 60 ? `Venció hace ${abs} min` : abs < 1440 ? `Venció hace ${Math.round(abs / 60)} h` : `Venció hace ${Math.round(abs / 1440)} d`;
  } else if (mins < 60) label = `En ${Math.max(1, mins)} min`;
  else if (mins < 1440) label = `En ${Math.round(mins / 60)} h`;
  else label = `En ${Math.round(mins / 1440)} d`;
  return { label, tone: mins < 0 ? 'overdue' : soon ? 'soon' : 'normal' };
}

export const reminderLabel = (mins: number) => {
  if (mins === 0) return 'A la hora';
  if (mins < 60) return `${mins} min antes`;
  if (mins < 1440) return `${mins / 60} h antes`;
  return `${mins / 1440} d antes`;
};

export function streak(dates: string[]): number {
  const set = new Set(dates);
  let cursor = new Date();
  // A streak may still be alive if today is not marked yet.
  if (!set.has(dateKey(cursor))) cursor = addDays(cursor, -1);
  let n = 0;
  while (set.has(dateKey(cursor))) {
    n++;
    cursor = addDays(cursor, -1);
  }
  return n;
}

export const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export const formatBytes = (n: number) =>
  n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`;

export async function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export const copyText = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
};

export const safeJson = <T,>(raw: string | null, fallback: T): T => {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

/** Racha REAL: días consecutivos con al menos una sesión de estudio terminada. */
export function sessionStreak(days: string[]): number {
  const set = new Set(days);
  let cursor = new Date();
  if (!set.has(dateKey(cursor))) cursor = addDays(cursor, -1);
  let n = 0;
  while (set.has(dateKey(cursor))) { n++; cursor = addDays(cursor, -1); }
  return n;
}

export const formatDuration = (sec: number) => {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : m > 0 ? `${m}m ${String(ss).padStart(2, '0')}s` : `${ss}s`;
};
export const formatClock = (sec: number) => {
  const s = Math.max(0, Math.round(sec));
  return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};
