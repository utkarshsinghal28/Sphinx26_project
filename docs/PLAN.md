# Sphinx26 — Multilingual Voice Assistant for Rural Citizens

**One-liner:** A voice-first RAG assistant that answers questions about government schemes, crop
advisory and health information in Hindi, Marathi, Tamil, Bengali and more — so a farmer can just
*talk* to it and hear the answer back in their own language.

---

## 1. The key decision up front: website **and** PWA are the same thing

Do **not** plan "build a website, then later make an app."

| Approach | Effort | Verdict |
|---|---|---|
| Website → then rebuild as separate Android/iOS app | 2–3x work, two codebases to keep in sync | ❌ |
| Website → then wrap in Capacitor/Cordova | extra toolchain, still one codebase | ⚠️ only if we need Play Store |
| **Website that *is* a PWA from day one** | one codebase, installable, works offline | ✅ **chosen** |

A PWA = normal web app + `manifest.json` + service worker + HTTPS. On Android Chrome the user gets
"Add to Home Screen" → it opens full-screen, has an icon, and works on flaky rural networks because
the shell and last answers are cached.

**So the workflow is:** build the web app → add manifest + service worker in the *same* sprint (cheap,
~1 day) → ship it as a PWA. There is no "app phase" later. If we ever need a Play Store listing, we
wrap the same PWA with Capacitor in half a day.

> Why this matters for our users: rural connectivity is patchy, phones are low-end Android, and
> literacy is limited. A cached shell + audio-first UI is a *feature*, not a nice-to-have.

---

## 2. Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│  FRONTEND — Next.js (App Router) + React + Tailwind — PWA        │
│                                                                   │
│  [ 🎤 hold to talk ]  [ language: हिं | मरा | த | বাং | EN ]       │
│        │                                                          │
│        │  MediaRecorder → 16kHz wav/webm blob                     │
│        ▼                                                          │
│  1. POST /api/stt      → transcript in user's language            │
│  2. POST /api/ask      → streamed answer tokens + sources         │
│  3. POST /api/tts      → audio for the answer (auto-play)         │
│                                                                   │
│  Big buttons, icons over text, transcript always editable         │
│  (user can fix ASR mistakes by typing/speaking again)             │
└───────────────────────────────┬──────────────────────────────────┘
                                │  JSON + SSE streaming
┌───────────────────────────────▼──────────────────────────────────┐
│  BACKEND — FastAPI (Python 3.11)                                 │
│                                                                   │
│  /api/stt   Bhashini ASR  ┐  provider adapters behind one         │
│  /api/ask   RAG + LLM     ├─ interface: swap provider without     │
│  /api/tts   Bhashini TTS  ┘  touching the UI or business logic     │
│                                                                   │
│  RAG pipeline                                                     │
│    query → multilingual embed → top-k chunks (Chroma/pgvector)    │
│         → prompt (context + language + citation rules)            │
│         → LLM answer in user's language                           │
│         → guardrail: no context ⇒ "I don't know, here's the       │
│           helpline" instead of hallucinating                      │
└───────────────────────────────┬──────────────────────────────────┘
                                │
┌───────────────────────────────▼──────────────────────────────────┐
│  KNOWLEDGE BASE — official scheme documents                       │
│  PM-KISAN, PMFBY, KCC, Ayushman Bharat, MGNREGA, Soil Health      │
│  Card, PM-KUSUM, e-NAM, state schemes …                           │
│  Each doc → cleaned → chunked (500–800 tokens, overlap) →          │
│  embedded once → stored in vector DB                              │
└──────────────────────────────────────────────────────────────────┘
```

### The one non-obvious technical decision: **cross-lingual retrieval**

A Tamil farmer's question must retrieve a Hindi or English document. Two options:

1. Translate the query → English → retrieve → answer in Tamil. (2 LLM calls, lossy, slower)
2. **Use a multilingual embedding model** (BGE-M3, `paraphrase-multilingual-mpnet`, or
   multilingual-e5) so Tamil queries land in the *same vector space* as Hindi/English chunks.
   Then only the final generation call is cross-lingual. (✅ chosen — 1 model, 1 hop)

This is the single thing that makes or breaks multilingual RAG. It also means we index documents
**once**, no matter how many languages we support.

---

## 3. Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | **Next.js 14 + TypeScript + Tailwind** | one app = UI + thin API proxy, PWA plugin support, fast |
| Voice UI | MediaRecorder + `<button>` hold-to-talk | no heavy SDK, works on low-end Android |
| Backend | **FastAPI + Python 3.11** | Whisper/Bhashini/LangChain/embeddings all live in Python |
| STT | **Bhashini ASR** (primary), Whisper `small` via API (fallback), browser Web Speech (dev only) | Bhashini is built for Indic languages and is the credibility win for a govtech pitch |
| TTS | **Bhashini TTS**, fallback `expo`/browser `speechSynthesis` | Indic voices |
| LLM | provider-agnostic adapter: Sarvam / OpenAI / Gemini / on-device small model | don't get locked in before we know the keys |
| Vector DB | **Chroma** (dev, zero-config) → **pgvector** (prod) | same interface |
| Embeddings | BGE-M3 or multilingual-e5-large | cross-lingual retrieval |
| Eval | small golden Q/A set + RAGAS-style faithfulness check | we must prove it doesn't hallucinate |
| Deploy | Vercel (frontend) + Fly.io/Render (backend) or single Docker Compose | |

> ⚠️ **This sandbox has no outbound access to LLM/STT APIs** (only npm/PyPI/GitHub). So the build
> must ship a **`DEMO_MODE=mock` provider** that returns canned, realistic answers + pre-recorded
> audio. That way the app is always demoable, keys or no keys, offline or online. This is a
> requirement, not a fallback — demos break at the worst time.

---

## 4. Workflow / phases

### Phase 0 — Foundations (0.5 day)
- [ ] Repo scaffold: `apps/web` (Next.js), `services/api` (FastAPI), `data/`, `docs/`
- [ ] `docker-compose.yml` to run both with one command
- [ ] Provider adapter interfaces (`stt.py`, `tts.py`, `llm.py`) with a working `mock` impl
- [ ] CI: lint + typecheck + pytest on push
- **Exit:** `docker compose up` → a page that says hello in 5 languages.

### Phase 1 — Knowledge base (1 day)
- [ ] Pick 12–15 high-impact schemes, collect official PDFs/HTML pages
- [ ] Ingestion script: fetch → clean → chunk → metadata (scheme name, state, source URL, last-updated)
- [ ] Embed + index into Chroma; persist the index in the repo artifacts (or a release asset)
- [ ] Sanity-check retrieval with 20 hand-written queries across 5 languages
- **Exit:** `python -m rag.search "मेरी फसल का बीमा कैसे हो"` returns the right PMFBY chunks.

### Phase 2 — RAG API (1 day)
- [ ] `POST /api/ask` → retrieval + grounded prompt + streamed answer + citations
- [ ] `POST /api/stt`, `POST /api/tts` (real + mock)
- [ ] Language detection; answer always in the user's language
- [ ] Guardrail: low retrieval score ⇒ refuse + give the official helpline
- **Exit:** curl an audio file in Tamil, get Tamil audio out.

### Phase 3 — Voice UI (1.5 days) ← the demo lives or dies here
- [ ] Hold-to-talk button, waveform, live "listening / thinking / speaking" states
- [ ] Transcript panel (editable — critical, because ASR on rural dialects *will* err)
- [ ] Answer card: big text + auto-play audio + "listen again" + "slower" + source links
- [ ] Language switcher with native-script labels and flags/icons
- [ ] Offline/low-bandwidth states, skeleton loaders, retry
- [ ] Accessibility: 48px+ touch targets, high contrast, works on 320px width, dark-mode-safe

### Phase 4 — PWA (0.5 day)
- [ ] `manifest.json` (name, icons 192/512, standalone, theme color, `lang`)
- [ ] Service worker: cache app shell + static assets; network-first for API
- [ ] Install prompt + "works offline" indicator
- [ ] Lighthouse PWA audit green, >90 on mobile perf

### Phase 5 — WhatsApp adapter (optional, 1 day)
- [ ] Twilio sandbox webhook → voice note in ⇒ voice note out
- [ ] Same RAG core, zero UI work — this is why the backend is a clean API

### Phase 6 — Polish & pitch (1 day)
- [ ] Eval run on the golden set; record faithfulness + latency numbers
- [ ] Demo script + 2-min video, seeded data for a smooth story
- [ ] Deploy: public URL + installed-on-phone screenshot

**Total: ~6 focused days.** Phases 0–3 give a complete vertical slice; 4–6 make it shippable.

---

## 5. Design principles (rural-first, non-negotiable)

1. **Voice is the primary input, not a bonus.** Text input is the fallback, not the reverse.
2. **Assume the ASR was wrong.** Always show an editable transcript before/while answering.
3. **Assume low literacy.** Icons + audio. No dense paragraphs. Numbers in words where possible.
4. **Assume 3G and a ₹8k phone.** <150KB initial JS, no heavy animation, audio compressed.
5. **Never hallucinate a scheme detail.** Amounts, deadlines and eligibility must be cited from the
   retrieved doc, or the answer says "please confirm at your panchayat / helpline 1551".
6. **Trust signals beat cleverness.** Show the source document name and date. A farmer needs to know
   *where the answer came from*.

---

## 6. Risks and how we handle them

| Risk | Mitigation |
|---|---|
| Bhashini API approval/keys delayed | adapter + mock mode; Whisper fallback ready |
| ASR accuracy on rural dialects is poor | editable transcript, "did you mean" chips, tappa-to-talk re-record, text fallback |
| LLM latencies of 5–10s feel broken | stream tokens, play a filler "one moment" audio, show progress states |
| Hallucinated scheme amounts | retrieval-score threshold + citation-only policy + refuse-and-refer |
| Stale scheme data | store `last_updated` per doc, show it, add a quarterly refresh script |
| No network at demo | mock mode + pre-cached PWA shell + bundled demo audio |

---

## 7. What "done" looks like

A judge hands their phone to a Hindi/Marathi/Tamil speaker who asks, out loud, *"PM-KISAN ke liye
kaise apply karein?"* — and within 4 seconds hears a correct, cited answer in their own language,
with the scheme's official page linked, on a phone that has spotty wifi.
