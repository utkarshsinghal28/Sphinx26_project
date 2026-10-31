import { useCallback, useEffect, useRef, useState } from 'react';

// Records a short question in the browser and sends it to the backend's Groq
// Whisper endpoint. The API key stays on the server; the temporary audio blob
// is not persisted by the app.
export function useDictation({ speechLocale, onTranscript, onError }) {
  const [phase, setPhase] = useState('idle');
  const sessionRef = useRef(null);
  const callbacks = useRef({ onTranscript, onError });
  callbacks.current = { onTranscript, onError };

  const stop = useCallback(() => {
    const session = sessionRef.current;
    if (!session || session.stopping) return;
    session.stopping = true;
    setPhase('stopping');
    try {
      if (session.recorder.state !== 'inactive') session.recorder.stop();
      else session.finish();
    } catch {
      session.finish('error');
    }
  }, []);

  const start = useCallback(async () => {
    if (sessionRef.current) return;
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      callbacks.current.onError('unsupported');
      return;
    }

    const session = { recorder: null, stream: null, chunks: [], stopping: false, done: false };
    sessionRef.current = session;
    setPhase('starting');

    session.finish = async (forcedError) => {
      if (session.done) return;
      session.done = true;
      session.stream?.getTracks().forEach(track => track.stop());
      if (forcedError) {
        if (sessionRef.current === session) sessionRef.current = null;
        setPhase('idle'); callbacks.current.onError(forcedError); return;
      }
      const mime = session.recorder?.mimeType || 'audio/webm';
      const ext = mime.includes('ogg') ? 'ogg' : mime.includes('mp4') ? 'm4a' : 'webm';
      const blob = new Blob(session.chunks, { type: mime });
      if (!blob.size) {
        if (sessionRef.current === session) sessionRef.current = null;
        setPhase('idle'); callbacks.current.onError('empty'); return;
      }
      try {
        const form = new FormData();
        form.append('audio', blob, `question.${ext}`);
        const language = (speechLocale || 'en').split('-')[0].toLowerCase();
        const response = await fetch(`/api/transcribe?language=${encodeURIComponent(language)}`, {
          method: 'POST', body: form,
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          const detail = String(data.detail || '');
          callbacks.current.onError(response.status === 503 ? 'unconfigured' : detail.toLowerCase().includes('no speech') ? 'empty' : 'network');
          return;
        }
        if (data.text?.trim()) callbacks.current.onTranscript(data.text.trim());
        else callbacks.current.onError('empty');
      } catch {
        callbacks.current.onError('network');
      } finally {
        if (sessionRef.current === session) sessionRef.current = null;
        setPhase('idle');
      }
    };

    try {
      session.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (session.done) { session.stream.getTracks().forEach(track => track.stop()); return; }
      const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
      const mimeType = candidates.find(type => MediaRecorder.isTypeSupported?.(type));
      session.recorder = mimeType ? new MediaRecorder(session.stream, { mimeType }) : new MediaRecorder(session.stream);
      session.recorder.ondataavailable = event => { if (event.data?.size) session.chunks.push(event.data); };
      session.recorder.onerror = () => session.finish('error');
      session.recorder.onstop = () => session.finish();
      session.recorder.start();
      setPhase('listening');
    } catch (error) {
      session.stream?.getTracks().forEach(track => track.stop());
      if (sessionRef.current === session) sessionRef.current = null;
      setPhase('idle');
      callbacks.current.onError(error?.name === 'NotAllowedError' || error?.name === 'SecurityError' ? 'permission' : 'error');
    }
  }, [speechLocale]);

  useEffect(() => () => {
    const session = sessionRef.current;
    if (!session) return;
    session.done = true;
    session.stream?.getTracks().forEach(track => track.stop());
    try { if (session.recorder?.state !== 'inactive') session.recorder.stop(); } catch { /* already stopped */ }
    sessionRef.current = null;
  }, []);

  return { phase, start, stop };
}
