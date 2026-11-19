import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle, Bell, BellRing, Check, CircleHelp, Database, Download, Eye, EyeOff,
  HardDrive, KeyRound, LoaderCircle, Palette, Play, RefreshCw, Save, ShieldCheck, Sparkles, Trash2, Upload, Zap,
} from 'lucide-react';
import { Button, ConfirmModal, Field, GlassCard, IconButton, SectionHeader, Segmented, Toggle } from '../../components/ui';
import { useStore } from '../../state/store';
import { useToast } from '../../state/toast';
import { BASE_URLS, MODEL_SUGGESTIONS, USE_PROXY } from '../../data/defaults';
import { testConnection } from '../../lib/ai';
import { exportBackup, readBackup } from '../../lib/backup';
import { requestNotifications } from '../../lib/reminders';
import { speak, stopSpeaking, ttsSupported } from '../../lib/tts';
import type { AIProvider } from '../../types';

export function Settings() {
  const { state, update, replace, loadDemo, clearAll, storageError } = useStore();
  const toast = useToast();
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [confirmDemo, setConfirmDemo] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const s = state.settings;

  useEffect(() => {
    if (!ttsSupported()) return;
    const load = () => setVoices(window.speechSynthesis.getVoices().filter((v) => /^(es|en)/i.test(v.lang)));
    load();
    window.speechSynthesis.addEventListener?.('voiceschanged', load);
    return () => window.speechSynthesis.removeEventListener?.('voiceschanged', load);
  }, []);

  const set = <K extends keyof typeof s>(key: K, value: (typeof s)[K]) => update((d) => { d.settings[key] = value; });
  const changeProvider = (p: AIProvider) => update((d) => {
    d.settings.provider = p;
    d.settings.baseUrl = BASE_URLS[p];
    d.settings.model = MODEL_SUGGESTIONS[p][0];
  });

  const doTest = async () => {
    if (!s.apiKey.trim() && !USE_PROXY) { toast('error', 'Falta la API Key', 'Pega tu clave antes de probar la conexión.'); return; }
    setTesting(true);
    try { const text = await testConnection(s); toast('success', 'Conexión correcta ✓', text); }
    catch (e) { toast('error', 'No se pudo conectar', e instanceof Error ? e.message : 'Revisa la configuración.'); }
    finally { setTesting(false); }
  };

  const doExport = async () => {
    setExporting(true);
    try { const r = await exportBackup(state); toast('success', 'Respaldo descargado', `Incluye todos tus datos y ${r.images} archivos. Guárdalo en un lugar seguro.`); }
    catch (e) { toast('error', 'No se pudo exportar', e instanceof Error ? e.message : ''); }
    finally { setExporting(false); }
  };

  const doImport = async () => {
    if (!importFile) return;
    try {
      const { state: restored, imageCount } = await readBackup(importFile);
      replace(restored);
      toast('success', 'Respaldo restaurado', `${restored.subjects.length} materias y ${imageCount} archivos recuperados.`);
    } catch (e) { toast('error', 'No se pudo importar', e instanceof Error ? e.message : 'Archivo ilegible.'); }
    finally { setImportFile(null); if (fileRef.current) fileRef.current.value = ''; }
  };

  const doNotifications = async () => {
    const r = await requestNotifications();
    if (r.ok) update((d) => { d.notificationsEnabled = true; });
    toast(r.ok ? 'success' : 'error', r.ok ? 'Notificaciones activadas' : 'No se pudieron activar', r.message);
  };

  return (
    <div className="view view--settings">
      <SectionHeader eyebrow="Configuración" title="Ajustes" description="IA, voz, notificaciones y datos. Todo se guarda automáticamente en este navegador." actions={<Button variant="primary" icon={<Save size={16} />} onClick={() => toast('success', 'Cambios guardados', 'La configuración se guarda automáticamente al instante.')}>Guardado automático</Button>} />

      {storageError && <div className="chat-warning"><AlertTriangle size={18} /><div><strong>Problema de almacenamiento</strong><span>{storageError}</span></div></div>}

      <div className="settings-grid">
        <GlassCard className="settings-card">
          <div className="settings-card__head"><span className="settings-card__icon"><KeyRound size={18} /></span><div><h3>Inteligencia Artificial</h3><p>Tu clave, tu modelo, tus reglas.</p></div></div>

          <Field label="Proveedor"><Segmented value={s.provider} onChange={changeProvider} options={[{ value: 'openrouter', label: 'OpenRouter' }, { value: 'openai', label: 'OpenAI' }, { value: 'gemini', label: 'Gemini' }, { value: 'custom', label: 'Otro' }]} /></Field>

          <Field label="API Key" hint={USE_PROXY ? 'Modo proxy activo: la clave vive en el servidor de Vercel (AI_API_KEY), no en el navegador.' : s.provider === 'gemini' ? 'Clave de Google AI Studio.' : 'Se envía como Authorization: Bearer … directamente al proveedor.'}>
            <div className="key-input"><input className="input" type={showKey ? 'text' : 'password'} value={s.apiKey} onChange={(e) => set('apiKey', e.target.value)} placeholder={USE_PROXY ? 'Gestionada por /api/ai' : s.provider === 'gemini' ? 'AIza…' : 'sk-or-v1-…'} autoComplete="off" spellCheck={false} /><IconButton label={showKey ? 'Ocultar clave' : 'Mostrar clave'} onClick={() => setShowKey((v) => !v)}>{showKey ? <EyeOff size={16} /> : <Eye size={16} />}</IconButton></div>
          </Field>

          <div className="form-row">
            <Field label="Modelo" hint="Modelo con visión para leer las fotos del cuaderno."><input className="input" list="model-list" value={s.model} onChange={(e) => set('model', e.target.value)} placeholder="nvidia/nemotron-3.5-super-vl:free" /><datalist id="model-list">{MODEL_SUGGESTIONS[s.provider].map((m) => <option key={m} value={m} />)}</datalist></Field>
            <Field label="Modelo de imágenes"><input className="input" value={s.imageModel} onChange={(e) => set('imageModel', e.target.value)} placeholder="google/gemini-2.5-flash-image-preview" /></Field>
          </div>
          <div className="form-row">
            <Field label="URL base del API"><input className="input" value={s.baseUrl} onChange={(e) => set('baseUrl', e.target.value)} spellCheck={false} /></Field>
            <Field label="Modelo de transcripción" hint="Para audios (endpoint /audio/transcriptions)."><input className="input" value={s.transcribeModel} onChange={(e) => set('transcribeModel', e.target.value)} placeholder="whisper-1" /></Field>
          </div>

          <Field label={`Temperatura: ${s.temperature.toFixed(1)}`}><input type="range" className="range" min={0} max={1.2} step={0.1} value={s.temperature} onChange={(e) => set('temperature', Number(e.target.value))} /></Field>
          <Field label="Instrucción personal"><textarea className="textarea" rows={2} value={s.persona} onChange={(e) => set('persona', e.target.value)} /></Field>

          <Toggle checked={s.vision} onChange={(v) => set('vision', v)} label="Enviar imágenes al modelo (visión)" description="Necesario para analizar las fotos de tu cuaderno y para adjuntar páginas al chat." />
          <Toggle checked={s.autoAbsorb} onChange={(v) => set('autoAbsorb', v)} label="Absorber fotos automáticamente" description="Al subir una página a Fotos y apuntes, la IA la analiza y la graba en su memoria sin que tengas que pulsar nada." />

          <div className="settings-card__actions">
            <Button variant="primary" icon={testing ? <LoaderCircle size={15} className="spin" /> : <Zap size={15} />} disabled={testing} onClick={() => void doTest()}>{testing ? 'Probando…' : 'Probar conexión'}</Button>
            <span className="muted">{USE_PROXY ? 'Proxy /api/ai activo' : s.apiKey ? `Clave configurada (${s.apiKey.length} caracteres)` : 'Sin clave'}</span>
          </div>
          <div className="notice-box"><ShieldCheck size={16} /><div><strong>Sobre la clave incluida</strong><span>La app trae configurada tu clave de OpenRouter (en `.env.local`, fuera del repo) y el modelo <b>nvidia/nemotron-3.5-super-vl:free</b> para que funcione al abrir. Cualquier clave dentro del JavaScript es pública: si vas a publicar en Vercel, define <b>VITE_AI_PROXY=1</b> y <b>AI_API_KEY</b> en el panel; así el bundle no contiene el secreto y <b>api/ai.mjs</b> lo inyecta en el servidor. Considera rotar la clave si estuvo expuesta.</span></div></div>
        </GlassCard>

        <div className="settings-side">
          <GlassCard className="settings-card">
            <div className="settings-card__head"><span className="settings-card__icon"><Play size={18} /></span><div><h3>Voz (text to speech)</h3><p>Escucha las respuestas de la IA.</p></div></div>
            <Field label={`Velocidad: ${s.ttsRate.toFixed(1)}×`}><input type="range" className="range" min={0.6} max={1.6} step={0.1} value={s.ttsRate} onChange={(e) => set('ttsRate', Number(e.target.value))} /></Field>
            <Field label="Voz" hint={ttsSupported() ? 'Voces del sistema disponibles en tu navegador.' : 'Tu navegador no admite síntesis de voz.'}>
              <select className="select" value={s.ttsVoice} onChange={(e) => set('ttsVoice', e.target.value)}>
                <option value="">Automática (español)</option>
                {voices.map((v) => <option key={v.voiceURI} value={v.voiceURI}>{v.name} · {v.lang}</option>)}
              </select>
            </Field>
            <div className="settings-card__actions">
              <Button size="sm" icon={<Play size={14} />} onClick={() => speak('Hola, soy tu asistente de estudio. Vamos a repasar tus apuntes.', { rate: s.ttsRate, voiceURI: s.ttsVoice, onError: (e) => toast('error', 'No se pudo reproducir', e) })}>Probar voz</Button>
              <Button size="sm" variant="ghost" onClick={() => { stopSpeaking(); toast('info', 'Voz detenida'); }}>Detener</Button>
            </div>
            <p className="field__hint">Cada mensaje de la IA trae su propio botón 🔊 debajo. La síntesis es local y no consume tokens.</p>
          </GlassCard>

          <GlassCard className="settings-card">
            <div className="settings-card__head"><span className="settings-card__icon"><Bell size={18} /></span><div><h3>Recordatorios</h3><p>Avisos claros, a tiempo.</p></div></div>
            <div className="setting-row"><div><strong>Notificaciones del navegador</strong><small>{state.notificationsEnabled ? 'Permiso concedido' : 'Aún sin permiso'}</small></div><Button size="sm" icon={state.notificationsEnabled ? <BellRing size={14} /> : <Bell size={14} />} onClick={() => void doNotifications()}>{state.notificationsEnabled ? 'Verificar' : 'Activar'}</Button></div>
            <div className="notice-box"><CircleHelp size={16} /><div><strong>Cómo funcionan</strong><span>La app revisa cada 30 s tus entregas y muestra avisos internos + notificaciones del sistema. Solo se disparan mientras la pestaña esté abierta.</span></div></div>
          </GlassCard>

          <GlassCard className="settings-card">
            <div className="settings-card__head"><span className="settings-card__icon"><Palette size={18} /></span><div><h3>Apariencia</h3><p>Ambiente de luz del cristal.</p></div></div>
            <div className="accent-picker">{([
              { id: 'aurora', label: 'Aurora', colors: ['#6ee7ff', '#a78bfa', '#5b9cff'] },
              { id: 'ocean', label: 'Océano', colors: ['#4fd6c9', '#3f8cff', '#6ee7ff'] },
              { id: 'sunset', label: 'Atardecer', colors: ['#ff9a9e', '#c084fc', '#ffc978'] },
            ] as const).map((a) => (
              <button key={a.id} className={state.accent === a.id ? 'is-active' : ''} onClick={() => update((d) => { d.accent = a.id; })}>
                <span className="accent-picker__blob" style={{ background: `radial-gradient(circle at 30% 30%, ${a.colors[0]}, ${a.colors[1]}, ${a.colors[2]})` }} />
                <strong>{a.label}</strong>{state.accent === a.id && <Check size={14} />}
              </button>
            ))}</div>
          </GlassCard>

          <GlassCard className="settings-card">
            <div className="settings-card__head"><span className="settings-card__icon"><Database size={18} /></span><div><h3>Datos y respaldos</h3><p>Tu información te pertenece.</p></div></div>
            <div className="setting-row"><div><strong>Exportar respaldo</strong><small>JSON con materias, apuntes, memoria, sesiones, entregas, chat y archivos.</small></div><Button size="sm" variant="primary" icon={exporting ? <LoaderCircle size={14} className="spin" /> : <Download size={14} />} disabled={exporting} onClick={() => void doExport()}>{exporting ? 'Preparando…' : 'Exportar'}</Button></div>
            <div className="setting-row"><div><strong>Importar respaldo</strong><small>Reemplaza los datos actuales por los del archivo.</small></div><Button size="sm" icon={<Upload size={14} />} onClick={() => fileRef.current?.click()}>Elegir archivo</Button></div>
            <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => setImportFile(e.target.files?.[0] || null)} />
            <div className="setting-row"><div><strong>Cargar datos de ejemplo</strong><small>Opcional. Por defecto la app arranca vacía para que crees todo tú.</small></div><Button size="sm" icon={<RefreshCw size={14} />} onClick={() => setConfirmDemo(true)}>Cargar</Button></div>
            <div className="setting-row"><div><strong className="danger-text">Borrar todo</strong><small>Elimina absolutamente todos los datos locales.</small></div><Button size="sm" variant="danger" icon={<Trash2 size={14} />} onClick={() => setConfirmClear(true)}>Borrar</Button></div>
            <div className="storage-note"><HardDrive size={14} /><span>Guardado automático en localStorage + IndexedDB. Sin cuentas, sin sincronización, sin telemetría.</span></div>
          </GlassCard>

          <GlassCard className="settings-card settings-card--tip">
            <Sparkles size={20} /><div><h3>Todo se crea manualmente</h3><p>Materias, tareas, hábitos, proyectos y sesiones empiezan vacíos. Registra sesiones reales para subir tu racha.</p></div>
          </GlassCard>
        </div>
      </div>

      <ConfirmModal open={Boolean(importFile)} onClose={() => setImportFile(null)} onConfirm={() => void doImport()} title="¿Importar este respaldo?" message={`Se reemplazarán todos los datos actuales por el contenido de "${importFile?.name || 'archivo'}". Te recomendamos exportar antes un respaldo.`} confirmLabel="Importar y reemplazar" />
      <ConfirmModal open={confirmDemo} onClose={() => setConfirmDemo(false)} onConfirm={() => { loadDemo(); toast('success', 'Datos de ejemplo cargados'); }} title="¿Cargar datos de ejemplo?" message="Se reemplazarán tus datos actuales por materias, tareas, hábitos y entregas de demostración. Podrás borrarlos cuando quieras." confirmLabel="Cargar ejemplos" />
      <ConfirmModal open={confirmClear} onClose={() => setConfirmClear(false)} onConfirm={() => { clearAll(); toast('info', 'Todos los datos fueron borrados'); }} title="¿Borrar absolutamente todo?" message="Se eliminarán materias, tareas, apuntes, memoria de la IA, sesiones, entregas, hábitos, mensajes y archivos. Solo se puede deshacer con un respaldo exportado." confirmLabel="Borrar todo" />
    </div>
  );
}
