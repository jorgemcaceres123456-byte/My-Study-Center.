import { useMemo, useState } from 'react';
import { CalendarRange, Check, ChevronLeft, ChevronRight, Flame, Pencil, Plus, Target, Trash2, TrendingUp } from 'lucide-react';
import { Button, ConfirmModal, EmptyState, Field, GlassCard, IconButton, Modal, ProgressBar, SectionHeader, Segmented } from '../../components/ui';
import { useStore } from '../../state/store';
import { useToast } from '../../state/toast';
import { useQuickAdd } from '../../lib/quickAdd';
import { SUBJECT_COLORS, SUBJECT_ICONS } from '../../data/defaults';
import { addDays, dateKey, fromKey, monthLabel, pct, plural, streak, todayKey, uid } from '../../lib/utils';
import type { Habit } from '../../types';

type Range = 7 | 14 | 30;
const blankHabit = (): Habit => ({ id: '', name: '', icon: '📖', color: SUBJECT_COLORS[0], goal: 5, createdAt: '', dates: [] });

export function Habits() {
  const { state, update } = useStore();
  const toast = useToast();
  const [range, setRange] = useState<Range>(7);
  const [offset, setOffset] = useState(0);
  const [editing, setEditing] = useState<Habit | null>(null);
  const [deleting, setDeleting] = useState<Habit | null>(null);
  const today = todayKey();

  useQuickAdd('habit', () => setEditing(blankHabit()));

  const days = useMemo(() => {
    const now = new Date();
    let base: Date;
    if (range === 7) {
      base = addDays(now, -((now.getDay() + 6) % 7));
      base = addDays(base, offset * 7);
    } else {
      base = addDays(now, -(range - 1) + offset * range);
    }
    return Array.from({ length: range }, (_, i) => addDays(base, i));
  }, [range, offset]);

  const keys = days.map(dateKey);
  const toggleDay = (habitId: string, key: string) => update((d) => {
    const h = d.habits.find((x) => x.id === habitId);
    if (!h) return;
    h.dates = h.dates.includes(key) ? h.dates.filter((x) => x !== key) : [...h.dates, key];
  });

  const saveHabit = (h: Habit) => {
    if (!h.name.trim()) { toast('error', 'Falta el nombre', 'Ponle un nombre a tu hábito.'); return; }
    const next = { ...h, name: h.name.trim() };
    update((d) => {
      if (next.id) { const i = d.habits.findIndex((x) => x.id === next.id); if (i >= 0) d.habits[i] = next; }
      else d.habits.push({ ...next, id: uid(), createdAt: new Date().toISOString() });
    });
    setEditing(null);
    toast('success', next.id ? 'Hábito actualizado' : 'Hábito creado', `${next.name} · objetivo ${next.goal} días/semana`);
  };

  const weeklyDone = state.habits.reduce((n, h) => n + keys.filter((k) => h.dates.includes(k)).length, 0);
  const bestStreak = Math.max(0, ...state.habits.map((h) => streak(h.dates)));
  const last30 = Array.from({ length: 30 }, (_, i) => dateKey(addDays(new Date(), -i))).reverse();
  const globalConsistency = pct(state.habits.reduce((n, h) => n + last30.filter((k) => h.dates.includes(k)).length, 0), state.habits.length * 30);

  return (
    <div className="view">
      <SectionHeader eyebrow="Seguimiento manual" title="Tracker de hábitos" description="Marca a mano los días que cumpliste cada hábito. Mira tu constancia, tus rachas y tu progreso semanal." actions={<Button variant="primary" icon={<Plus size={16} />} onClick={() => setEditing(blankHabit())}>Nuevo hábito</Button>} />

      <div className="habit-stats">
        <GlassCard className="habit-stat"><span className="habit-stat__icon" style={{ color: '#6ee7ff' }}><Target size={18} /></span><div><span>Hábitos activos</span><strong>{state.habits.length}</strong></div></GlassCard>
        <GlassCard className="habit-stat"><span className="habit-stat__icon" style={{ color: '#a78bfa' }}><Check size={18} /></span><div><span>Marcas en el periodo</span><strong>{weeklyDone}</strong></div></GlassCard>
        <GlassCard className="habit-stat"><span className="habit-stat__icon" style={{ color: '#ffc978' }}><Flame size={18} /></span><div><span>Mejor racha</span><strong>{bestStreak} días</strong></div></GlassCard>
        <GlassCard className="habit-stat"><span className="habit-stat__icon" style={{ color: '#7ef0c1' }}><TrendingUp size={18} /></span><div><span>Constancia (30 d)</span><strong>{globalConsistency}%</strong></div></GlassCard>
      </div>

      <GlassCard className="tracker-card">
        <div className="tracker-head">
          <div><span className="eyebrow"><CalendarRange size={13} /> {range === 7 ? 'Vista semanal' : `Últimos ${range} días`}</span><h3>{range === 7 ? `Semana del ${days[0].getDate()} de ${monthLabel(days[0]).split(' ')[0]}` : `${days[0].getDate()} ${monthLabel(days[0]).split(' ')[0]} – ${days[days.length - 1].getDate()} ${monthLabel(days[days.length - 1]).split(' ')[0]}`}</h3></div>
          <div className="tracker-head__controls">
            <Segmented value={String(range) as `${Range}`} onChange={(v) => { setRange(Number(v) as Range); setOffset(0); }} options={[{ value: '7', label: 'Semana' }, { value: '14', label: '14 días' }, { value: '30', label: '30 días' }]} />
            <IconButton label="Periodo anterior" onClick={() => setOffset((o) => o - 1)}><ChevronLeft size={17} /></IconButton>
            <Button size="sm" onClick={() => setOffset(0)}>Hoy</Button>
            <IconButton label="Periodo siguiente" onClick={() => setOffset((o) => o + 1)}><ChevronRight size={17} /></IconButton>
          </div>
        </div>

        {state.habits.length === 0 ? <EmptyState icon={<Flame size={28} />} title="Aún no hay hábitos" description="Crea uno como “Leer 20 páginas” y empieza a marcar tus días." action={<Button variant="primary" icon={<Plus size={15} />} onClick={() => setEditing(blankHabit())}>Crear hábito</Button>} /> : (
          <div className="tracker-scroll">
            <table className="tracker-table">
              <thead><tr><th className="tracker-table__name"><span>Hábito</span><small>Objetivo / semana</small></th>{days.map((d) => {
                const k = dateKey(d);
                return <th key={k} className={`${k === today ? 'is-today' : ''} ${d.getDay() === 0 || d.getDay() === 6 ? 'is-weekend' : ''}`}><span>{['D', 'L', 'M', 'X', 'J', 'V', 'S'][d.getDay()]}</span><small>{d.getDate()}</small></th>;
              })}<th className="tracker-table__total">Total</th></tr></thead>
              <tbody>
                {state.habits.map((h) => {
                  const count = keys.filter((k) => h.dates.includes(k)).length;
                  const goalForRange = range === 7 ? h.goal : Math.round((h.goal / 7) * range);
                  return (
                    <tr key={h.id}>
                      <td className="tracker-table__name">
                        <div className="tracker-habit" style={{ '--habit-color': h.color } as React.CSSProperties}>
                          <span className="tracker-habit__icon">{h.icon}</span>
                          <span className="tracker-habit__text"><strong>{h.name}</strong><small>{plural(count, 'día marcado', 'días marcados')} · racha {streak(h.dates)} d</small></span>
                          <span className="tracker-habit__actions">
                            <IconButton label={`Editar ${h.name}`} onClick={() => setEditing({ ...h })}><Pencil size={13} /></IconButton>
                            <IconButton label={`Eliminar ${h.name}`} onClick={() => setDeleting(h)}><Trash2 size={13} /></IconButton>
                          </span>
                        </div>
                      </td>
                      {keys.map((k) => {
                        const done = h.dates.includes(k);
                        const future = k > today;
                        return <td key={k} className={k === today ? 'is-today' : ''}>
                          <button className={`tracker-cell ${done ? 'is-done' : ''} ${future ? 'is-future' : ''}`} style={{ '--habit-color': h.color } as React.CSSProperties} onClick={() => !future && toggleDay(h.id, k)} disabled={future} aria-label={`${h.name}: ${fromKey(k).toLocaleDateString('es')} ${done ? 'marcado' : 'sin marcar'}`} title={future ? 'Día futuro' : done ? 'Marcado · clic para desmarcar' : 'Clic para marcar'}>{done && <Check size={13} strokeWidth={3} />}</button>
                        </td>;
                      })}
                      <td className="tracker-table__total"><strong>{count}/{goalForRange}</strong><ProgressBar value={pct(count, goalForRange)} color={h.color} height={5} /></td>
                    </tr>
                  );
                })}
                <tr className="tracker-table__footer"><td className="tracker-table__name"><strong>Días completados</strong></td>{keys.map((k) => <td key={k}><span className="tracker-daily">{state.habits.filter((h) => h.dates.includes(k)).length}<small>/{state.habits.length}</small></span></td>)}<td /></tr>
              </tbody>
            </table>
          </div>
        )}
        <p className="tracker-hint">Toca o haz clic en cualquier casilla para marcar o desmarcar el día. Los días futuros están bloqueados.</p>
      </GlassCard>

      <div className="habit-bottom">
        <GlassCard>
          <div className="card__head"><div><span className="eyebrow"><TrendingUp size={13} /> Progreso</span><h3>Objetivo semanal</h3></div></div>
          {state.habits.length === 0 && <p className="muted">Crea un hábito para ver su progreso.</p>}
          {state.habits.map((h) => {
            const weekKeys = Array.from({ length: 7 }, (_, i) => dateKey(addDays(new Date(), -((new Date().getDay() + 6) % 7) + i)));
            const count = weekKeys.filter((k) => h.dates.includes(k)).length;
            return <div key={h.id} className="habit-progress"><div className="habit-progress__head"><span>{h.icon} <strong>{h.name}</strong></span><b style={{ color: h.color }}>{count}/{h.goal}</b></div><ProgressBar value={pct(count, h.goal)} color={h.color} /><div className="habit-progress__dots">{last30.map((k) => <i key={k} className={h.dates.includes(k) ? 'is-done' : ''} style={{ '--habit-color': h.color } as React.CSSProperties} title={k} />)}</div></div>;
          })}
        </GlassCard>
        <GlassCard>
          <div className="card__head"><div><span className="eyebrow"><Flame size={13} /> Rachas</span><h3>Constancia reciente</h3></div></div>
          {state.habits.length === 0 && <p className="muted">Sin datos todavía.</p>}
          {state.habits.map((h) => (
            <div key={h.id} className="streak-row"><span className="streak-row__icon" style={{ background: `${h.color}22`, color: h.color }}><Flame size={17} /></span><div><strong>{h.name}</strong><small>{plural(h.dates.length, 'día cumplido', 'días cumplidos')} en total · objetivo {h.goal}/semana</small></div><b>{streak(h.dates)} <small>días</small></b></div>
          ))}
          <div className="notice-box"><Target size={16} /><div><strong>Consejo</strong><span>La constancia vale más que la intensidad: mejor 20 minutos diarios que 3 horas un solo día.</span></div></div>
        </GlassCard>
      </div>

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title={editing?.id ? 'Editar hábito' : 'Nuevo hábito'} subtitle="Personaliza el nombre, el icono, el color y tu objetivo semanal." size="sm" footer={<>
        <Button variant="ghost" onClick={() => setEditing(null)}>Cancelar</Button>
        <Button variant="primary" onClick={() => editing && saveHabit(editing)}>Guardar hábito</Button>
      </>}>
        {editing && <>
          <Field label="Nombre del hábito"><input className="input" autoFocus value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="Ej. Leer 20 páginas" /></Field>
          <Field label={`Objetivo: ${editing.goal} días por semana`}><input type="range" className="range" min={1} max={7} value={editing.goal} onChange={(e) => setEditing({ ...editing, goal: Number(e.target.value) })} /></Field>
          <Field label="Color"><div className="swatches">{SUBJECT_COLORS.map((c) => <button key={c} className={`swatch ${editing.color === c ? 'is-active' : ''}`} style={{ background: c }} onClick={() => setEditing({ ...editing, color: c })} aria-label={`Color ${c}`} />)}</div></Field>
          <Field label="Icono"><div className="icon-picker">{SUBJECT_ICONS.map((i) => <button key={i} className={editing.icon === i ? 'is-active' : ''} onClick={() => setEditing({ ...editing, icon: i })}>{i}</button>)}</div></Field>
        </>}
      </Modal>

      <ConfirmModal open={Boolean(deleting)} onClose={() => setDeleting(null)} onConfirm={() => {
        if (deleting) { update((d) => { d.habits = d.habits.filter((x) => x.id !== deleting.id); }); toast('info', 'Hábito eliminado'); }
      }} title="¿Eliminar este hábito?" message="Se borrarán también todas sus marcas de días. Esta acción no se puede deshacer." />
    </div>
  );
}
