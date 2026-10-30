# 24-Hour Hackathon Playbook — VaaniSeva

> Working name: **VaaniSeva** (वाणी सेवा — "voice service"). Rename freely.
> Read `PLAN.md` for the full architecture and rationale. This file is the **schedule**.

---

## 0. The one thing that decides this hackathon

**Don't build the textbook stack. Build the demo that cannot fail.**

The brief says "Whisper or Bhashini, LangChain, vector DB". Here's the honest 24-hour reality:

| Provider | Free? | Setup time | Verdict for 24h |
|---|---|---|---|
| **Bhashini (ULCA)** | Free (govt) | **Days of manual approval** | ❌ Dead on arrival. Mention in slides as the production path. |
| **Groq — `whisper-large-v3-turbo`** | Free tier | 2 min, instant key | ✅ Fallback STT, very fast |
| **Google Gemini 2.5 Flash** | Free tier (~1500 req/day) | 2 min | ✅ **Primary LLM** — strong Hindi/Marathi/Tamil |
| **Gemini `text-embedding-004`** | Free tier | same key | ✅ Multilingual embeddings, precomputed at build |
| **Sarvam AI (Saarika/Bulbul)** | Free credits on signup | 5 min | ⚠️ Best Indic ASR+TTS, but one more signup + docs to read. Nice-to-have, not critical path. |
| **Browser `SpeechRecognition`** | Free, no key | **0 min** | ✅ **Primary STT** — Chrome/Android handle `hi-IN`, `mr-IN`, `ta-IN` on-device-ish |
| **Browser `speechSynthesis`** | Free, no key | **0 min** | ✅ **Primary TTS** — Android Chrome has Hindi/Tamil voices |

### Therefore the minimal-risk pipeline:

```
🎤 mic → Browser SpeechRecognition (lang=hi-IN)   ← zero keys, zero latency, instant demo
        ↓ transcript (editable by user)
        → Gemini 2.5 Flash + retrieved scheme chunks   ← ONE api key total
        ↓ answer in user's language
        → Browser speechSynthesis (hi-IN voice)     ← zero keys, instant
        ↑
   Chroma/JSON vector index, embeddings precomputed at build time
```

**Exactly one API key needed. One.** Everything else is browser-native or precomputed.
Groq Whisper gets wired in as the fallback for browsers without Web Speech (Firefox) — do it only
if we have spare hours.

> Why browser STT first, not a server STT: it's a demo. Latency is what judges feel. Web Speech
> returns a transcript in ~300ms; a server round-trip + upload + Whisper inference is 2–4s and can
> fail on bad podcast wifi. Ship the fast one, keep the robust one as fallback.

---

## 1. Scope: what we build vs what we cut

### MUST HAVE (the vertical slice — if this works, we place)
- [ ] Voice in → transcript in Hindi/Marathi/Tamil
- [ ] Grounded answer from a real scheme document, **with source citation**
- [ ] Answer spoken back in the same language
- [ ] Language switcher (5 languages)
- [ ] Installable PWA on a phone
- [ ] Deployed public URL

### SHOULD HAVE (adds polish / points)
- [ ] Streaming answer text (feels 3x faster)
- [ ] "Listen again / slower" controls
- [ ] Editable transcript (recover from ASR errors — also a great talking point)
- [ ] Offline shell after first load
- [ ] Helpline numbers + "confirm at your panchayat" trust footer

### WON'T DO (say no now, thank yourself at hour 20)
- ❌ WhatsApp/Twilio adapter
- ❌ User accounts, auth, database of users
- ❌ Bhashini integration
- ❌ Fine-tuning anything
- ❌ Admin panel / CMS
- ❌ More than ~20 scheme documents
- ❌ Native app, Play Store, Capacitor

---

## 2. Hour-by-hour

Hours are wall-clock from start. `🧑 = human only`, `🤖 = AI does it`, `🧑‍🤝‍🧑 = human verifies`.

### H0 → H1 · Keys & foundation
| | |
|---|---|
| 🧑 | Create `aistudio.google.com` API key (2 min). Paste into `.env.local`. **Do not share it in chat.** |
| 🧑 | Create GitHub repo permissions / confirm deploy accounts (Vercel + Render) |
| 🤖 | Scaffold repo, install deps, working "hello" page with the 5 language buttons |
| ✅ | **Gate:** app runs locally, one page loads. If not, fix now — never scaffold at H6. |

### H1 → H3 · Knowledge base (the part that makes it real, not a wrapper)
| | |
|---|---|
| 🧑 | Pick **12–15 schemes**. Copy official text (pmkisan.gov.in, pmfby.gov.in, etc.) into `data/raw/*.md` |
| | Priority list: PM-KISAN, PMFBY (crop insurance), KCC (Kisan Credit Card), Ayushman Bharat, MGNREGA, Soil Health Card, PM-KUSUM (solar pump), e-NAM, PM Fasal Bima claims process, Kisan Samman Nidhi status check, PM-KISAN e-KYC, state-specific (e.g. Rajasthan/Maharashtra) |
| 🤖 | Ingestion script: clean → chunk (600 tokens, 80 overlap) → embed → store |
| 🤖 | `npm run ingest` prints "18 chunks from 6 docs" |
| 🧑‍🤝‍🧑 | **Fact-check every chunk.** Amounts (₹6000/year), deadlines, eligibility. One wrong number in a demo is fatal. |
| ✅ | **Gate:** `npx tsx scripts/search.ts "फसल बीमा"` returns PMFBY chunks, not garbage |

> ⚠️ Do NOT let AI invent scheme facts. It must copy from the official page. Verify ₹ amounts yourself.

### H3 → H6 · RAG core + API
| | |
|---|---|
| 🤖 | `POST /api/ask` — retrieve top-5, build grounded prompt, stream answer, return citations |
| 🤖 | Language-locked system prompt + refusal rule when retrieval is weak |
| 🤖 | `POST /api/transcribe` (Groq Whisper) as the fallback path — stub it, wire later if time |
| 🧑 | Test 10 questions by curl/text, across 3 languages |
| ✅ | **Gate:** Hindi question about crop insurance gets a correct cited Hindi answer. This is the product. |

### H6 → H12 · Voice UI (this is where the demo is won)
> Take a 1-hour break around H10. You will write better UI tired-but-rested than exhausted.

| | |
|---|---|
| 🤖 | Big hold-to-talk mic button with listening/thinking/speaking states |
| 🤖 | Editable transcript chip ("did I hear: …? tap to fix") |
| 🤖 | Answer card: large text, auto-playing audio, source badge, helpline footer |
| 🤖 | Language switcher w/ native script labels (हिंदी, मराठी, தமிழ், বাংলা, తెలుగు) |
| 🤖 | Mobile-first layout, 48px targets, high contrast, works at 320px |
| 🧑 | Open on your actual phone. Real thumb. Real sunlight. |
| ✅ | **Gate:** a stranger can use it without instructions. |

### H12 → H15 · PWA + deploy
| | |
|---|---|
| 🤖 | `manifest.json`, icons (generate 192/512), service worker, install prompt |
| 🤖 | Deploy to Vercel; env vars set |
| 🧑 | Install on Android/iOS from the public URL. Screenshot it. |
| ✅ | **Gate:** public HTTPS URL, installable, offline shell loads |

### H15 → H18 · Hardening (the unglamorous hours that win prizes)
| | |
|---|---|
| 🤖 | Error states: mic denied, no network, LLM timeout, empty retrieval |
| 🤖 | Mock mode (`DEMO_MODE=mock`) with canned answers → **the demo cannot break on stage** |
| 🧑 | **Failure rehearsal:** airplane mode, deny mic, ask an off-topic question ("who won the World Cup"), ask in a language you don't have. Confirm graceful behaviour. |
| ✅ | **Gate:** 15 minutes of adversarial testing, zero crashes |

### H18 → H21 · Story & assets
| | |
|---|---|
| 🧑 | Record 90-sec demo video (do 3 takes, keep take 2) |
| 🧑 | 6 slides: problem → insight → demo → how it works → impact → roadmap |
| 🤖 | README with architecture diagram, screenshots, setup steps (judges read this) |
| 🤖 | Impact numbers: 65% of India is rural, 22 official languages, 5 scheme pages we cover |

### H21 → H24 · Buffer
Leave it empty. Something will break. This is the buffer that saves you.

---

## 3. Cut ladder — when you're behind, cut in THIS order

1. Telugu + Bengali (keep Hindi, Marathi, Tamil)
2. Streaming (fall back to full response)
3. Groq Whisper fallback (browser STT only)
4. PWA offline caching (keep manifest, skip SW)
5. "Listen slower" control
6. Anything on the SHOULD list

**Never cut:** grounded citations, the refusal guardrail, the language switcher, mobile layout.
**Never cut:** the 3 hours of buffer.

---

## 4. How to work with AI on this (99% AI-built means managing the AI)

Your job is **not** writing code. It's:
1. **Providing ground truth** — real scheme documents, ₹ amounts, deadlines. AI guesses these. Don't let it.
2. **Running it on real hardware** — a phone, a bad network, a real thumb.
3. **Saying no to scope** — every "wouldn't it be cool if" costs an hour you don't have.
4. **Pasting the actual error** — full stack trace, not "it's broken". Errors are the highest-value input.

Rules that keep AI-built code from collapsing at H20:
- **Vertical slices, not layers.** Get one question answering end-to-end before adding a second language.
- **One provider interface, two implementations.** `LLMProvider`, `STTProvider`, `TTSProvider`. If Gemini dies at H19 you swap one file.
- **No new dependencies after H15.** Every `npm install` is a coin flip on a fresh machine.
- **Mock mode from H1.** Not a nice-to-have. It's your insurance policy.
- **Commit at every gate.** Rollback beats debugging at 3am.

---

## 5. Demo script (memorise this, 90 seconds)

> "Sixty-five percent of India lives in rural areas. Government schemes that could change their lives
> are published in English or formal Hindi — on PDFs, on websites. A farmer in Vidarbha can't read
> them and doesn't trust them.
>
> **Watch.** *[press mic, speak Marathi]* — "पीक विमा कसा काढायचा?" (how do I claim crop insurance?)
>
> *[answer streams in Marathi, then plays aloud, source badge: PMFBY.gov.in]*
>
> The answer came from the official document — not from the model's imagination. There's the source,
> the amount, the deadline, and the helpline.
>
> It works in five languages, it's free, and **it installs as an app on any phone** — no Play Store,
> no 90MB download. *[show installed icon]* 40 kilobytes of shell, cached, works when the network
> drops.
>
> This is the last mile of Digital India: not more portals — a voice that speaks your language."

Then: risk slide (hallucination → citation-only policy; ASR errors → editable transcript; connectivity → PWA offline shell).

---

## 6. Judge questions to be ready for

| Q | A |
|---|---|
| Why not just ChatGPT/WhatsApp? | ChatGPT doesn't know your state's scheme deadlines, hallucinates ₹ amounts, and needs literacy + a paid plan. We ground every answer in the official doc and cite it. |
| How do you stop hallucination? | Retrieval-score threshold + citation-only prompt + refuse-and-refer. If retrieval is weak we say "confirm at your panchayat, call 1551" instead of guessing. |
| Is the ASR good enough for dialects? | No, and we designed for that: the transcript is always visible and editable, and every answer can be re-spoken. Voice is the input, not a black box. |
| What about Bhashini? | It's the production path — better Indic ASR/TTS, and we have a provider adapter ready. Approval takes days, so the hackathon build uses browser STT + Gemini and stays swappable. |
| Scalability? | Stateless API, precomputed vector index, RAG is per-request. Cost per query ≈ ₹0.02. |
| Business model? | Free for citizens; funded by CSR/govt partnerships; potential panchayat/CSC deployment channel (250k Common Service Centres). |

---

## 7. Definition of done (all 6 = you placed)

1. Public URL that loads on a phone in under 3s
2. Voice question in 3 languages → correct cited answer spoken back
3. Installed as a PWA on an actual phone
4. Graceful under airplane mode, denied mic, and off-topic questions
5. Demo video under 90 seconds
6. The team can explain the retrieval flow on a whiteboard
