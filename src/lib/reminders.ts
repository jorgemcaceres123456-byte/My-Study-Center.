import { useEffect, useRef } from 'react';
import { useStore } from '../state/store';
import { useToast } from '../state/toast';
import { parseLocal, reminderLabel, shortDate } from './utils';

/** In-app reminders + browser notifications. Checks every 30 s while the tab is open. */
export function useReminders() {
  const { state, update } = useStore();
  const toast = useToast();
  const busy = useRef(false);

  useEffect(() => {
    const tick = () => {
      if (busy.current) return;
      const now = Date.now();
      const toFire: Array<{ id: string; keys: string[]; title: string; body: string }> = [];

      for (const ev of state.events) {
        if (ev.done) continue;
        const due = parseLocal(ev.date).getTime();
        // Ignore events that expired long ago; the dashboard shows them as overdue instead.
        if (now > due + 30 * 60000) continue;
        const pending = ev.reminders
          .filter((m) => !ev.firedReminders.includes(String(m)))
          .filter((m) => now >= due - m * 60000);
        if (!pending.length) continue;
        const nearest = Math.min(...pending);
        toFire.push({
          id: ev.id,
          keys: pending.map(String),
          title: `⏰ ${ev.title}`,
          body: `${nearest === 0 ? 'Es ahora' : reminderLabel(nearest)} · ${shortDate(new Date(due))}.`,
        });
      }
      if (!toFire.length) return;

      busy.current = true;
      update((d) => {
        for (const f of toFire) {
          const ev = d.events.find((e) => e.id === f.id);
          if (ev) ev.firedReminders = [...ev.firedReminders, ...f.keys];
        }
      });
      toFire.slice(0, 3).forEach((f) => toast('warning', f.title, f.body));
      if (state.notificationsEnabled && 'Notification' in window && Notification.permission === 'granted') {
        for (const f of toFire.slice(0, 3)) {
          try { new Notification(f.title, { body: f.body, tag: `msc-${f.id}` }); } catch (e) { console.warn(e); }
        }
      }
      busy.current = false;
    };
    tick();
    const interval = window.setInterval(tick, 30000);
    return () => window.clearInterval(interval);
  }, [state.events, state.notificationsEnabled, update, toast]);
}

export async function requestNotifications(): Promise<{ ok: boolean; message: string }> {
  if (!('Notification' in window)) return { ok: false, message: 'Este navegador no admite notificaciones.' };
  if (Notification.permission === 'granted') return { ok: true, message: 'Notificaciones activadas.' };
  if (Notification.permission === 'denied') return { ok: false, message: 'Bloqueaste las notificaciones. Habilítalas desde el candado del sitio en tu navegador.' };
  try {
    const permission = await Notification.requestPermission();
    return permission === 'granted'
      ? { ok: true, message: 'Notificaciones activadas. Los avisos aparecerán mientras la pestaña esté abierta.' }
      : { ok: false, message: 'No se concedió el permiso. Puedes intentarlo de nuevo cuando quieras.' };
  } catch {
    return { ok: false, message: 'No se pudo pedir el permiso de notificaciones.' };
  }
}

/** Deadlines that deserve an in-app banner / bell badge. */
export function alertsFor(events: AppState['events']) {
  const now = Date.now();
  return events
    .filter((e) => !e.done && parseLocal(e.date).getTime() > now - 7 * 86400000)
    .filter((e) => parseLocal(e.date).getTime() - now < 72 * 3600000)
    .sort((a, b) => parseLocal(a.date).getTime() - parseLocal(b.date).getTime());
}

// Imported for the type annotation above without a circular runtime dependency.
import type { AppState } from '../types';
