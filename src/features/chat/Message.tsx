import { useState } from 'react';
import { Bot, Copy, FileAudio2, FileText, Image as ImageIcon, Pause, Play, Square, User, Volume2 } from 'lucide-react';
import { ArtifactCard } from './ArtifactCard';
import { BlobImage, IconButton, Markdown, useBlobUrl } from '../../components/ui';
import { parseArtifacts } from '../../lib/artifacts';
import { KIND_LABEL, isAudioKind } from '../../lib/files';
import { useToast } from '../../state/toast';
import { useStore } from '../../state/store';
import { plainForSpeech, pauseSpeaking, resumeSpeaking, speak, stopSpeaking, ttsSupported } from '../../lib/tts';
import { copyText, formatBytes, fmtTime } from '../../lib/utils';
import type { AudioRef, ChatMessage } from '../../types';

export function Message({ message, imageNames, assistantName = 'Asistente de estudio' }: { message: ChatMessage; imageNames?: Record<string, string>; assistantName?: string }) {
  const toast = useToast();
  const { state } = useStore();
  const isUser = message.role === 'user';
  const { prose, artifacts } = parseArtifacts(message.content);
  const parts = prose.split(/\[\[ARTIFACT:(\d+)\]\]/g);
  const files = (message.fileIds || []).map((id) => state.chatFiles.find((f) => f.id === id)).filter(Boolean);

  return (
    <div className={`message ${isUser ? 'message--user' : 'message--ai'} ${message.error ? 'message--error' : ''}`}>
      <div className="message__avatar">{isUser ? <User size={16} /> : <Bot size={16} />}</div>
      <div className="message__bubble">
        <div className="message__meta"><strong>{isUser ? 'Tú' : assistantName}</strong><span>{fmtTime(new Date(message.createdAt))}</span></div>
        {message.imageKey && <BlobImage blobKey={message.imageKey} alt="Imagen generada por IA" className="message__image" />}
        {message.imageUrl && <img className="message__image" src={message.imageUrl} alt="Imagen generada por IA" referrerPolicy="no-referrer" />}

        {parts.map((part, i) => {
          if (i % 2 === 1) {
            const artifact = artifacts[Number(part)];
            return artifact ? <ArtifactCard key={`a-${i}`} artifact={artifact} /> : null;
          }
          return part.trim() ? <Markdown key={`t-${i}`} text={part} /> : null;
        })}

        {(message.attachments?.length || files.length || message.audios?.length) ? (
          <div className="message__attachments">
            {(message.attachments || []).map((a) => <span key={a}><ImageIcon size={12} /> {imageNames?.[a] || 'Apunte adjunto'}</span>)}
            {files.map((f) => <span key={f!.id}>{isAudioKind(f!.kind) ? <FileAudio2 size={12} /> : <FileText size={12} />} {f!.name} · {KIND_LABEL[f!.kind]}</span>)}
          </div>
        ) : null}

        {message.audios?.map((a) => <AudioClip key={a.id} audio={a} />)}

        {!isUser && !message.pending && <TTSRow text={plainForSpeech(message.content)} />}

        <div className="message__footer">
          <span className="message__footer-hint">{(message.content || '').length} caracteres</span>
          <IconButton label="Copiar mensaje" onClick={() => void copyText(message.content).then((ok) => toast(ok ? 'success' : 'error', ok ? 'Mensaje copiado' : 'No se pudo copiar'))}><Copy size={13} /></IconButton>
        </div>
      </div>
    </div>
  );
}

function AudioClip({ audio }: { audio: AudioRef }) {
  const { url } = useBlobUrl(audio.blobKey);
  return (
    <div className="message-audio">
      <FileAudio2 size={15} />
      <div><strong>{audio.name}</strong><small>{audio.transcript ? `Transcripción: ${audio.transcript.slice(0, 160)}` : 'Audio sin transcripción'}</small></div>
      {url && <audio controls src={url} />}
    </div>
  );
}

function TTSRow({ text }: { text: string }) {
  const { state } = useStore();
  const [playing, setPlaying] = useState(false);
  const [paused, setPaused] = useState(false);
  const supported = ttsSupported();
  const disabled = !supported || !text;

  const play = () => {
    if (disabled) { toastUnavailable(); return; }
    setPlaying(true); setPaused(false);
    speak(text, {
      rate: state.settings.ttsRate,
      voiceURI: state.settings.ttsVoice,
      onEnd: () => { setPlaying(false); setPaused(false); },
      onError: (e) => { setPlaying(false); setPaused(false); console.warn('TTS:', e); },
    });
  };
  const togglePause = () => {
    if (paused) { resumeSpeaking(); setPaused(false); }
    else { pauseSpeaking(); setPaused(true); }
  };
  return (
    <div className="tts-row">
      <button className="tts-btn" onClick={play} disabled={disabled} title={supported ? 'Escuchar esta respuesta' : 'Tu navegador no admite voz'}><Volume2 size={14} /> Escuchar respuesta</button>
      {playing && <IconButton label={paused ? 'Reanudar' : 'Pausar'} onClick={togglePause}>{paused ? <Play size={13} /> : <Pause size={13} />}</IconButton>}
      {playing && <IconButton label="Detener voz" onClick={() => { stopSpeaking(); setPlaying(false); setPaused(false); }}><Square size={13} /></IconButton>}
      <span>{supported ? 'Voz local · sin coste' : 'Voz no disponible'}</span>
    </div>
  );
}
function toastUnavailable() { /* el botón ya está deshabilitado */ }

export const formatFileSize = formatBytes;
