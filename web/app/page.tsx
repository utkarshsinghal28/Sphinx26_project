"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LANGUAGES, getLanguage, type LangCode } from "@/lib/languages";
import type { AskResult } from "@/lib/llm";

type Status = "idle" | "listening" | "thinking" | "speaking";

interface SRAlternative {
  transcript: string;
}
interface SRResult {
  isFinal: boolean;
  0: SRAlternative;
}
interface SREvent {
  resultIndex: number;
  results: { readonly length: number; [i: number]: SRResult };
}
interface SRInstance {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: SREvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}
type SRConstructor = new () => SRInstance;
interface BIPEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}

function speechRecognition(): SRConstructor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SRConstructor;
    webkitSpeechRecognition?: SRConstructor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function stripForSpeech(text: string): string {
  return text
    .replace(/[*_#`>]/g, "")
    .replace(/^\s*[-•]\s*/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

export default function Home() {
  const [lang, setLang] = useState<LangCode>("hi");
  const [status, setStatus] = useState<Status>("idle");
  const [transcript, setTranscript] = useState("");
  const [result, setResult] = useState<AskResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState("");
  const [slow, setSlow] = useState(false);
  const [voiceReady, setVoiceReady] = useState(true);
  const [installEvt, setInstallEvt] = useState<BIPEvent | null>(null);
  const [showTrace, setShowTrace] = useState(false);

  const recRef = useRef<SRInstance | null>(null);
  const finalRef = useRef("");
  const shouldAskRef = useRef(false);

  const language = getLanguage(lang);

  useEffect(() => {
    setVoiceReady(speechRecognition() !== null);
    const onBip = (e: Event) => {
      e.preventDefault();
      setInstallEvt(e as BIPEvent);
    };
    window.addEventListener("beforeinstallprompt", onBip);
    return () => window.removeEventListener("beforeinstallprompt", onBip);
  }, []);

  useEffect(() => {
    return () => {
      recRef.current?.abort();
      if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    };
  }, []);

  const speak = useCallback(
    (text: string, code: LangCode) => {
      if (typeof window === "undefined" || !("speechSynthesis" in window)) {
        setStatus("idle");
        return;
      }
      const synth = window.speechSynthesis;
      synth.cancel();
      const target = getLanguage(code);
      const utter = new SpeechSynthesisUtterance(stripForSpeech(text));
      utter.lang = target.speech;
      utter.rate = slow ? 0.72 : 0.92;
      utter.pitch = 1;
      const voices = synth.getVoices();
      const base = target.speech.split("-")[0];
      const match =
        voices.find((v) => v.lang.toLowerCase() === target.speech.toLowerCase()) ??
        voices.find((v) => v.lang.toLowerCase().startsWith(base));
      if (match) utter.voice = match;
      utter.onstart = () => setStatus("speaking");
      utter.onend = () => setStatus("idle");
      utter.onerror = () => setStatus("idle");
      setStatus("speaking");
      synth.speak(utter);
    },
    [slow],
  );

  const ask = useCallback(
    async (question: string) => {
      const q = question.trim();
      if (q.length < 2) {
        setError(language.ui.tooShort);
        setStatus("idle");
        return;
      }
      setError(null);
      setStatus("thinking");
      setTyping(false);
      setTranscript(q);
      try {
        const res = await fetch("/api/ask", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ question: q, lang }),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(data.error ?? `HTTP ${res.status}`);
        }
        const data = (await res.json()) as AskResult;
        setResult(data);
        speak(data.answer, lang);
      } catch (err) {
        setError(err instanceof Error ? err.message : language.ui.noSpeech);
        setStatus("idle");
      }
    },
    [lang, language.ui.noSpeech, language.ui.tooShort, speak],
  );

  const startListening = useCallback(() => {
    const SR = speechRecognition();
    if (!SR) {
      setVoiceReady(false);
      setTyping(true);
      setError(null);
      return;
    }
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    finalRef.current = "";
    shouldAskRef.current = false;
    setTranscript("");
    setResult(null);
    setError(null);

    const rec = new SR();
    rec.lang = getLanguage(lang).speech;
    rec.continuous = false;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onstart = () => setStatus("listening");
    rec.onresult = (e: SREvent) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i += 1) {
        const r = e.results[i];
        const text = r[0]?.transcript ?? "";
        if (r.isFinal) {
          finalRef.current += text;
          shouldAskRef.current = true;
        } else {
          interim += text;
        }
      }
      setTranscript((finalRef.current + " " + interim).trim());
    };
    rec.onerror = (e: { error: string }) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        setError(
          lang === "en"
            ? "Microphone permission is blocked. Allow it in the browser, or type your question."
            : "माइक्रोफ़ोन की अनुमति नहीं है। कृपया अनुमति दें, या सवाल टाइप करें।",
        );
      } else if (e.error === "no-speech") {
        setError(getLanguage(lang).ui.tooShort);
      }
      setStatus("idle");
    };
    rec.onend = () => {
      recRef.current = null;
      if (shouldAskRef.current && finalRef.current.trim().length > 1) {
        void ask(finalRef.current);
      } else {
        setStatus("idle");
      }
    };

    recRef.current = rec;
    try {
      rec.start();
      setStatus("listening");
    } catch {
      setStatus("idle");
    }
  }, [ask, lang]);

  const stopListening = useCallback(() => {
    recRef.current?.stop();
  }, []);

  const onMic = useCallback(() => {
    if (status === "listening") {
      stopListening();
    } else if (status === "speaking") {
      window.speechSynthesis?.cancel();
      setStatus("idle");
    } else if (status !== "thinking") {
      startListening();
    }
  }, [startListening, status, stopListening]);

  const reset = useCallback(() => {
    window.speechSynthesis?.cancel();
    recRef.current?.abort();
    recRef.current = null;
    setResult(null);
    setTranscript("");
    setError(null);
    setDraft("");
    setStatus("idle");
  }, []);

  const switchLang = (code: LangCode) => {
    setLang(code);
    setResult(null);
    setTranscript("");
    setError(null);
    setStatus("idle");
    window.speechSynthesis?.cancel();
  };

  const statusText =
    status === "listening"
      ? language.ui.listening
      : status === "thinking"
        ? language.ui.thinking
        : status === "speaking"
          ? language.ui.speaking
          : language.ui.tapToSpeak;

  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col px-4 pb-8">
      <header className="flex items-center gap-3 pt-5 pb-3">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-brand text-cream shadow-sm">
          <MicIcon className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg leading-tight font-semibold">
            वाणी सेवा <span className="text-muted">· VaaniSeva</span>
          </h1>
          <p className="text-muted text-[13px] leading-tight">
            सरकारी योजनाएं, आपकी भाषा में · schemes in your language
          </p>
        </div>
        {installEvt && (
          <button
            onClick={() => {
              void installEvt.prompt();
              setInstallEvt(null);
            }}
            className="rounded-full border border-line bg-white px-3 py-2 text-xs font-medium text-brand-dark"
          >
            ⤓ Install
          </button>
        )}
      </header>

      {/* language switcher — native script only, that is what a user can actually read */}
      <div
        className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="tablist"
        aria-label="Language"
      >
        {LANGUAGES.map((l) => {
          const active = l.code === lang;
          return (
            <button
              key={l.code}
              role="tab"
              aria-selected={active}
              onClick={() => switchLang(l.code)}
              className={`shrink-0 rounded-full border px-4 py-2 text-[15px] font-medium transition ${
                active
                  ? "border-brand bg-brand text-cream shadow-sm"
                  : "border-line bg-white text-ink"
              }`}
            >
              {l.native}
            </button>
          );
        })}
      </div>

      <div className="flex-1">
        {result ? (
          <AnswerCard
            result={result}
            lang={lang}
            onSpeak={() => speak(result.answer, lang)}
            onSlower={() => {
              setSlow(true);
              setTimeout(() => speak(result.answer, lang), 30);
            }}
            onReset={reset}
            showTrace={showTrace}
            onToggleTrace={() => setShowTrace((v) => !v)}
          />
        ) : (
          <div className="pt-2">
            {status === "listening" || transcript ? (
              <div className="fade-up rounded-2xl border border-line bg-white p-4 shadow-sm">
                <p className="text-muted mb-1 text-[12px] font-medium tracking-wide uppercase">
                  {language.ui.heard}
                </p>
                <p className="text-[19px] leading-snug">{transcript || "…"}</p>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-line bg-sand/50 p-4">
                <p className="text-[15px] leading-relaxed text-muted">
                  {lang === "en"
                    ? "Tap the mic and ask your question out loud. Example questions:"
                    : "माइक दबाएं और अपना सवाल बोलें। उदाहरण:"}
                </p>
                <div className="mt-3 flex flex-col gap-2">
                  {language.samples.map((s) => (
                    <button
                      key={s}
                      onClick={() => void ask(s)}
                      className="rounded-xl border border-line bg-white px-3 py-2.5 text-left text-[15px] leading-snug active:scale-[0.99]"
                    >
                      <span className="text-brand-dark">“</span>
                      {s}
                      <span className="text-brand-dark">”</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {status === "thinking" && (
              <div className="mt-3 flex items-center gap-2 px-1 text-[15px] text-muted">
                <span className="flex items-end gap-1">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="bar h-3.5 w-1 rounded-full bg-brand"
                      style={{ animationDelay: `${i * 0.12}s` }}
                    />
                  ))}
                </span>
                {language.ui.thinking}
              </div>
            )}

            {error && (
              <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-[14px] text-amber-900">
                {error}
                <button
                  onClick={() => setTyping(true)}
                  className="ml-2 font-semibold underline underline-offset-2"
                >
                  {lang === "en" ? "type instead" : "टाइप करें"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ---- voice control ---- */}
      <div className="sticky bottom-0 mt-6 bg-gradient-to-t from-cream via-cream to-transparent pt-4">
        {typing && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void ask(draft);
            }}
            className="mb-3 flex gap-2"
          >
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={lang === "en" ? "Type your question…" : "अपना सवाल लिखें…"}
              className="min-w-0 flex-1 rounded-xl border border-line bg-white px-3 py-3 text-[16px] outline-none focus:border-brand"
            />
            <button
              type="submit"
              className="rounded-xl bg-brand px-4 py-3 text-[15px] font-semibold text-cream"
            >
              {lang === "en" ? "Ask" : "पूछें"}
            </button>
          </form>
        )}

        <div className="flex flex-col items-center gap-2">
          <div className="relative">
            {status === "listening" && (
              <span className="ring-pulse pointer-events-none absolute inset-0 rounded-full" />
            )}
            <button
              onClick={onMic}
              aria-label={statusText}
              aria-live="polite"
              className={`relative grid h-20 w-20 place-items-center rounded-full text-cream shadow-lg transition active:scale-95 ${
                status === "listening"
                  ? "bg-brand-dark"
                  : status === "speaking"
                    ? "bg-leaf"
                    : "bg-brand"
              }`}
            >
              {status === "thinking" ? (
                <span className="flex items-end gap-1.5">
                  {[0, 1, 2, 3].map((i) => (
                    <span
                      key={i}
                      className="bar h-6 w-1.5 rounded-full bg-cream/90"
                      style={{ animationDelay: `${i * 0.1}s` }}
                    />
                  ))}
                </span>
              ) : status === "listening" ? (
                <StopIcon className="h-8 w-8" />
              ) : status === "speaking" ? (
                <SpeakerIcon className="h-8 w-8" />
              ) : (
                <MicIcon className="h-9 w-9" />
              )}
            </button>
          </div>
          <p className="text-[15px] font-medium text-ink" aria-live="polite">
            {statusText}
          </p>
          <div className="flex items-center gap-4 text-[13px] text-muted">
            <button onClick={() => setTyping((v) => !v)} className="underline underline-offset-2">
              {lang === "en" ? "Type instead" : "टाइप करें"}
            </button>
            {!voiceReady && (
              <span className="text-amber-700">
                {lang === "en" ? "Voice not supported here" : "इस ब्राउज़र में आवाज़ नहीं"}
              </span>
            )}
          </div>
        </div>
      </div>

      <footer className="mt-6 border-t border-line pt-3 text-center text-[12px] leading-relaxed text-muted">
        {lang === "en"
          ? "Every answer is taken from an official scheme document and cited. When in doubt, confirm at your panchayat. Kisan helpline 155261."
          : "हर जवाब सरकारी दस्तावेज से लिया जाता है और उसका स्रोत दिखाया जाता है। पुष्टि के लिए पंचायत में पूछें। किसान हेल्पलाइन 155261।"}
      </footer>
    </div>
  );
}

function AnswerCard({
  result,
  lang,
  onSpeak,
  onSlower,
  onReset,
  showTrace,
  onToggleTrace,
}: {
  result: AskResult;
  lang: LangCode;
  onSpeak: () => void;
  onSlower: () => void;
  onReset: () => void;
  showTrace: boolean;
  onToggleTrace: () => void;
}) {
  const t = getLanguage(lang).ui;
  const citation = result.citations[0];

  return (
    <div className="fade-up">
      <div className="rounded-2xl border border-line bg-white p-4 shadow-sm">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold tracking-wide uppercase ${
              result.mode === "live"
                ? "bg-leaf-light text-leaf"
                : result.mode === "demo"
                  ? "bg-amber-100 text-amber-800"
                  : "bg-stone-100 text-stone-600"
            }`}
          >
            {result.mode === "live"
              ? "live"
              : result.mode === "demo"
                ? "demo · grounded excerpt"
                : "no reliable answer"}
          </span>
          <span className="text-[11px] text-muted">
            {result.totalMs ?? 0} ms · {result.citations.length} source
            {result.citations.length === 1 ? "" : "s"}
          </span>
        </div>

        <p className="text-[19px] leading-[1.55] whitespace-pre-line">{result.answer}</p>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={onSpeak}
            className="rounded-xl bg-brand px-3.5 py-2.5 text-[14px] font-semibold text-cream"
          >
            🔊 {t.listenAgain}
          </button>
          <button
            onClick={onSlower}
            className="rounded-xl border border-line px-3.5 py-2.5 text-[14px] font-medium"
          >
            🐢 {lang === "en" ? "Slower" : "धीरे"}
          </button>
          <button
            onClick={onReset}
            className="rounded-xl border border-line px-3.5 py-2.5 text-[14px] font-medium"
          >
            🎤 {lang === "en" ? "New question" : "नया सवाल"}
          </button>
        </div>
      </div>

      {citation && (
        <div className="mt-3 rounded-2xl border border-line bg-sand/60 p-3.5">
          <p className="text-muted text-[11px] font-semibold tracking-wide uppercase">
            {t.source}
          </p>
          <a
            href={citation.source}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[15px] font-medium text-brand-dark underline underline-offset-2"
          >
            {citation.sourceName}
          </a>
          <p className="mt-1 text-[12px] text-muted">
            {citation.scheme}
            {citation.lastUpdated ? ` · updated ${citation.lastUpdated}` : ""}
          </p>
          {citation.helpline && (
            <a
              href={`tel:${citation.helpline}`}
              className="mt-2 inline-block rounded-full bg-white px-3 py-1.5 text-[13px] font-medium text-ink"
            >
              ☎ {t.helpline} {citation.helpline}
            </a>
          )}
        </div>
      )}

      <button
        onClick={onToggleTrace}
        className="mt-3 text-[12px] text-muted underline underline-offset-2"
      >
        {showTrace ? "hide" : "show"} retrieval trace
      </button>
      {showTrace && (
        <div className="mt-2 rounded-xl border border-line bg-white p-3 font-mono text-[11px] leading-relaxed">
          <div>
            confidence: <b>{result.confidence}</b> · intent: <b>{result.intent ?? "—"}</b>
          </div>
          {result.llmNote && (
            <div className="mt-1 text-amber-800">llm: {result.llmNote}</div>
          )}
          {result.retrieved.map((r, i) => (
            <div key={i} className="text-muted">
              {r.score.toFixed(1)} · {r.reason} · {r.scheme} → {r.heading}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MicIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <rect x="9" y="2.5" width="6" height="11" rx="3" fill="currentColor" />
      <path
        d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
function StopIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <rect x="6" y="6" width="12" height="12" rx="3" />
    </svg>
  );
}
function SpeakerIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M4 9.5v5h3.5L13 19V5L7.5 9.5H4Z" fill="currentColor" />
      <path
        d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
