# VaaniSeva — वाणी सेवा

**A voice-first RAG assistant for rural India.** Ask about government schemes, crop insurance or
health cover by speaking — get a short, spoken answer in Hindi, Marathi, Tamil, Bengali, Telugu or
English, cited from the official scheme document. Installable as a PWA, so it opens offline on a
low-end Android phone.

> Built for Sphinx26 in 24 hours. Start with [`docs/PLAN_24H.md`](docs/PLAN_24H.md) — the hour-by-hour
> playbook — then [`docs/PLAN.md`](docs/PLAN.md) for the full architecture rationale.

---

## Why

65% of India lives in rural areas. The schemes that could change their lives — ₹6,000 a year from
PM-KISAN, free hospital care up to ₹5 lakh, crop insurance at 2% premium — are published in English
or formal Hindi, as PDFs, on portals. A farmer in Vidarbha cannot read them, and does not trust them.

This is a voice that speaks their language, answers in one breath, and shows where the answer came
from.

## What it does

1. **You tap the mic and speak** in your language.
2. The transcript appears — and stays **editable**, because ASR will sometimes be wrong.
3. The question is matched against a corpus of official scheme documents.
4. A grounded answer is generated **in your language**, then **read aloud**.
5. Every answer carries its **source**, the document's **last-updated date**, and the **helpline**.
6. If the documents do not contain a reliable answer, it says so and refers you to the helpline
   instead of guessing.

## Run it

```bash
cd web
cp .env.example .env.local      # paste a free GEMINI_API_KEY, or leave empty for demo mode
npm install
npm run doctor                  # ← verify the key works from THIS machine (30s)
npm run dev                     # http://localhost:3000
```

Voice needs a Chromium browser (Chrome / Edge / Android Chrome) for the Web Speech API. Firefox
falls back to the text input. The rest works everywhere.

```bash
npm run smoke                   # 8 checks: retrieval across languages + the refusal guardrail
npm run doctor                  # key + network + a real generation
```

### Where the API key has to live

The key is read **server-side only**, never shipped to the browser.

| Where you run it | What to do |
|---|---|
| Your laptop | `web/.env.local` → `GEMINI_API_KEY=...` (gitignored, `chmod 600`) |
| Vercel / Render | Project → Settings → Environment Variables → `GEMINI_API_KEY` |
| A sandbox with no outbound network | Nothing works — the app detects this and answers in `demo` mode |

If answers come back with a `demo` badge, open **"show retrieval trace"** under the answer: it prints
the exact reason (`no GEMINI_API_KEY set`, `could not reach Gemini (fetch failed)`,
`Gemini 403: ...`). That turns "it isn't working" into one sentence you can act on.

`npm run doctor` separates the three failures that otherwise look identical:

```
[1/2] reaching the API ...        HTTP 200 / fetch failed / 403
[2/2] generating a real answer ... "answered: ..."
```

There is also `scripts/fake-gemini.mjs`, a local stand-in for Google's endpoint used to prove the
live request is well-formed (language rule present, CONTEXT injected, 800-token cap) on a machine
that cannot reach the internet:

```bash
node scripts/fake-gemini.mjs &               # :8787
GEMINI_BASE_URL=http://127.0.0.1:8787 npm run dev
```

## Architecture

```
mic → Web Speech API (hi-IN / mr-IN / ta-IN …)  → editable transcript
                                                        │
                              POST /api/ask {question, lang}
                                                        │
                     ┌──────────────────────────────────▼──────────────────────────────┐
                     │ lib/rag/retrieve.ts  hybrid retrieval                         │
                     │   1. multi-script scheme keywords  → cross-lingual bridge     │
                     │   2. lexical overlap per chunk (fuzzy prefix, inflection-safe)│
                     │   3. query intent ("how to apply" / "documents" / "claim")     │
                     │      → section heading boost                                  │
                     └──────────────────────────────────┬──────────────────────────────┘
                                                        │  top-4 chunks
                     ┌──────────────────────────────────▼──────────────────────────────┐
                     │ lib/llm.ts  Gemini 2.5 Flash, language-locked, citation-only   │
                     │   no key / no network → extractive grounded fallback          │
                     │   weak retrieval     → refusal + helpline (never invent)      │
                     └──────────────────────────────────┬──────────────────────────────┘
                                                        │  answer + citations
                                        speechSynthesis → spoken answer
```

| Path | What |
|---|---|
| `web/app/page.tsx` | the whole voice UI: mic, transcript, answer card, language switcher |
| `web/app/api/ask/route.ts` | the one endpoint that matters |
| `web/lib/rag/retrieve.ts` | hybrid retrieval (keyword bridge + lexical + intent) |
| `web/lib/rag/ingest.ts` | markdown → sections → chunks, at boot |
| `web/lib/llm.ts` | provider-agnostic LLM call + guardrails + demo fallback |
| `web/content/schemes/*.md` | the knowledge base — **the actual product** |
| `web/public/sw.js` | offline app shell |
| `scripts/smoke.mjs` | 8-check regression run |

## Design decisions worth defending

- **One codebase, web *is* the app.** No separate Android build. Manifest + service worker = instal­lable
  on any phone, ~40KB shell cached, opens with no network.
- **Browser STT first, not server STT.** A transcript in 300ms beats a 3-second upload round trip in
  front of judges — and it needs no key. Server-side Whisper (Groq, free) is the fallback path.
- **Cross-lingual retrieval without an embedding service.** Multi-script keyword bridges plus
  inflection-tolerant prefix matching mean a Tamil question finds a Hindi/English document at zero
  cost and zero latency. The `retrieve()` interface takes BGE-M3 or Gemini embeddings unchanged when
  we want semantic recall.
- **Refusal is a feature.** Retrieval-score threshold → "I don't have a reliable answer, call 155261."
  A wrong ₹ amount is worse than no answer.
- **Demo mode.** If the key, network, or rate limit dies at hour 23, the app still answers — from the
  document itself — and labels itself `demo` so nobody is misled.

## Status

- [x] Next.js 16 + Tailwind 4 PWA shell, installable, offline app shell
- [x] Voice UI: tap-to-talk, live transcript, auto-play answer, slower/replay, 6 languages
- [x] Knowledge base: 5 schemes, 31 chunks, multi-script keywords
- [x] Hybrid retrieval + intent routing, cross-lingual (verified mr/ta/hi/en)
- [x] Gemini adapter with language-locked, citation-only prompt
- [x] Guardrail: refusal + helpline on weak retrieval, tested
- [x] Demo (extractive) fallback when no key
- [ ] Hindi/Marathi/Tamil content in the docs themselves (needed for good demo-mode answers)
- [ ] Groq Whisper fallback for Firefox
- [ ] Streaming answers
- [ ] 10 more schemes

## Roadmap beyond the hackathon

Bhashini ASR/TTS (production Indic voices, needs ULCA approval) · WhatsApp channel via the same
`/api/ask` core · state-specific scheme packs · ASHA-worker mode for health queries · voice feedback
loop to measure answer quality · deployment through 250k Common Service Centres.
