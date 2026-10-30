import { useCallback, useEffect, useRef, useState } from 'react';

// Browser recognition services may end a session after silence or a time limit,
// even with continuous=true. Keep completed segments and try to restart until
// the user stops. This is best-effort: permission, device, network and browser
// limitations can still interrupt recognition.
const joinSegments = parts => parts.map(part => (part || '').trim()).filter(Boolean).join(' ');
const RESTART_DELAY_MS = 350;
const STOP_TIMEOUT_MS = 5000;
const START_TIMEOUT_MS = 60000; // Allow time for the user to respond to a permission prompt.

export function useDictation({ speechLocale, onTranscript, onError }) {
  const [phase, setPhase] = useState('idle');
  const sessionRef = useRef(null);
  const callbacks = useRef({ onTranscript, onError });
  callbacks.current = { onTranscript, onError };

  const stop = useCallback(() => sessionRef.current?.stop(), []);

  const start = useCallback(() => {
    if (sessionRef.current) return;
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) { callbacks.current.onError('unsupported'); return; }

    let recognition;
    try { recognition = new Recognition(); }
    catch { callbacks.current.onError('error'); return; }
    recognition.lang = speechLocale;
    recognition.continuous = true;
    recognition.interimResults = true;

    const session = {
      recognition, done: false, stopRequested: false, engineState: 'idle',
      segments: [], finalText: '', interimText: '', error: null,
      restartTimer: null, stopTimer: null, startTimer: null,
      startedAt: 0, quickEnds: 0, startFailures: 0,
    };
    sessionRef.current = session;

    const clearTimers = () => {
      clearTimeout(session.restartTimer);
      clearTimeout(session.stopTimer);
      clearTimeout(session.startTimer);
    };
    const flushCurrent = () => {
      const text = joinSegments([session.finalText, session.interimText]);
      if (text) session.segments.push(text);
      session.finalText = ''; session.interimText = '';
    };
    const finish = () => {
      if (session.done) return;
      session.done = true;
      clearTimers();
      flushCurrent();
      recognition.onstart = null; recognition.onresult = null;
      recognition.onerror = null; recognition.onend = null;
      if (sessionRef.current === session) sessionRef.current = null;
      setPhase('idle');
      const text = joinSegments(session.segments);
      if (text) callbacks.current.onTranscript(text);
      if (session.error) callbacks.current.onError(session.error);
      else if (!text) callbacks.current.onError('empty');
    };
    const finishIfStuck = () => {
      clearTimeout(session.stopTimer);
      session.stopTimer = setTimeout(() => {
        if (session.done) return;
        try { recognition.abort(); } catch { /* The browser may already be stopped. */ }
        finish();
      }, STOP_TIMEOUT_MS);
    };
    session.stop = () => {
      if (session.done || session.stopRequested) return;
      session.stopRequested = true;
      clearTimeout(session.restartTimer);
      clearTimeout(session.startTimer);
      setPhase('stopping');
      if (session.engineState === 'idle') { finish(); return; }
      // stop() requests final recognition results; onend commits them to the input.
      finishIfStuck();
      try { recognition.stop(); }
      catch {
        // Some engines cannot stop while their permission prompt is starting.
        // onstart will try again; the timeout prevents a stuck interface.
        if (session.engineState !== 'starting') finish();
      }
    };
    session.dispose = () => {
      if (session.done) return;
      session.done = true;
      clearTimers();
      recognition.onstart = null; recognition.onresult = null;
      recognition.onerror = null; recognition.onend = null;
      try { recognition.abort(); } catch { /* Already stopped. */ }
      if (sessionRef.current === session) sessionRef.current = null;
    };

    const scheduleRestart = () => {
      if (session.done) return;
      if (session.stopRequested) { finish(); return; }
      setPhase('reconnecting');
      clearTimeout(session.restartTimer);
      session.restartTimer = setTimeout(begin, RESTART_DELAY_MS);
    };
    const begin = () => {
      if (session.done) return;
      if (session.stopRequested) { finish(); return; }
      session.engineState = 'starting';
      clearTimeout(session.startTimer);
      session.startTimer = setTimeout(() => {
        if (session.done || session.engineState !== 'starting') return;
        session.error = 'interrupted';
        try { recognition.abort(); } catch { /* Already stopped. */ }
        finish();
      }, START_TIMEOUT_MS);
      try { recognition.start(); }
      catch {
        clearTimeout(session.startTimer);
        session.engineState = 'idle';
        session.startFailures += 1;
        if (session.startFailures < 3) scheduleRestart();
        else { session.error = 'interrupted'; finish(); }
      }
    };

    recognition.onstart = () => {
      if (session.done) return;
      clearTimeout(session.startTimer);
      session.engineState = 'running';
      session.startedAt = Date.now();
      session.startFailures = 0;
      if (session.stopRequested) {
        try { recognition.stop(); } catch { finish(); }
      } else setPhase('listening');
    };
    recognition.onresult = event => {
      if (session.done) return;
      const finals = [], interims = [];
      for (const result of Array.from(event.results || [])) {
        const text = result?.[0]?.transcript || '';
        (result.isFinal ? finals : interims).push(text);
      }
      // Each event contains the current result list. Replace, don't append, so
      // revised interim results do not duplicate words.
      session.finalText = joinSegments(finals);
      session.interimText = joinSegments(interims);
    };
    recognition.onerror = event => {
      if (session.done) return;
      // Silence or an aborted recognition session can be retried on onend.
      if (event.error === 'no-speech' || event.error === 'aborted') return;
      session.error = event.error === 'not-allowed' || event.error === 'service-not-allowed'
        ? 'permission' : event.error === 'network' ? 'network' : 'interrupted';
      session.stopRequested = true;
      clearTimeout(session.restartTimer);
      clearTimeout(session.startTimer);
      setPhase('stopping');
      // Most engines emit onend after an error; a timeout handles those that do not.
      finishIfStuck();
    };
    recognition.onend = () => {
      if (session.done) return;
      clearTimeout(session.startTimer);
      session.engineState = 'idle';
      const hadSpeech = Boolean(session.finalText || session.interimText);
      const duration = session.startedAt ? Date.now() - session.startedAt : 0;
      flushCurrent();
      if (session.stopRequested) { finish(); return; }
      // Avoid an endless rapid restart loop if the browser cannot start normally.
      session.quickEnds = !hadSpeech && duration < 800 ? session.quickEnds + 1 : 0;
      if (session.quickEnds >= 4) { session.error = 'interrupted'; finish(); return; }
      scheduleRestart();
    };

    setPhase('starting');
    begin();
  }, [speechLocale]);

  useEffect(() => () => sessionRef.current?.dispose(), []);
  return { phase, start, stop };
}
