# GramSaathi — Phase 1

A mobile-friendly, multilingual hackathon prototype for exploring everyday questions about government schemes, farming and family health. It is an **independent demo**, not a government service.

## What is working

- React interface with **Ask Saathi, Explore topics, Saved answers and About** pages.
- English, Hindi, Marathi and Tamil interface text, starter questions and sample responses.
- A small FastAPI backend with a working question endpoint, health check and a curated list of official websites.
- New conversations, recent-chat navigation on desktop and mobile, bookmarks, copy, and browser-local storage with controls to clear it.
- Optional browser speech-to-text and read-aloud buttons. Tap the microphone once to listen, then tap **Stop & show text** to finish and place the recognised words in the editable question box. The app attempts to reconnect if the browser ends a recognition session early. Browser permissions, language support and network interruptions still apply; typing remains available.
- An installable PWA on supported browsers. After an initial online visit, its static interface can open offline. **Questions still require a reachable backend.**

### Important: this is not live AI or RAG yet

The backend returns **prewritten sample responses**, selected by a simple keyword router. It does not connect to Gemini or Groq, retrieve documents, verify scheme eligibility or provide medical advice. Official website links are general starting points, **not retrieved citations**. Responses are labeled as samples in the interface and API.

Do not use the demo for real personal information or decisions about health, benefits or eligibility. Test with public information and invented questions.

## Run on your computer

Requirements: Node.js 20.19+ (or a supported newer version), Python 3.10+, npm and an internet connection to install packages.

From the `gramsaathi` directory:

```bash
npm ci
python -m venv .venv
# macOS / Linux:
source .venv/bin/activate
# Windows PowerShell instead: .venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
npm run build
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

Open **http://localhost:8000** on the same computer. Stop the server with `Ctrl+C`.

The downloadable phase-one ZIP includes a built `dist/`, so you can run the FastAPI server after installing Python requirements without rebuilding first. Run `npm ci` and `npm run build` whenever you change frontend files. The workspace snapshot may omit generated `dist/` and `node_modules/`, so build again after restoring it.

For frontend development, run the FastAPI server on port 8000 in one terminal, then use `npm run dev` in another. Vite proxies `/api` requests to the backend. The service worker is registered in the production build, not Vite development mode.

## Phone and PWA notes

- Install availability depends on the browser. On Android Chrome, use **Install app** or **Add to Home screen** from the browser menu. On iPhone Safari, use **Share → Add to Home Screen**.
- Microphone access and service workers normally require **HTTPS or localhost**. A phone opening `http://<computer-LAN-IP>:8000` may not get microphone access. Use a secure, reachable HTTPS deployment for phone testing.
- The shell cache is for the interface and its static assets only. API calls and responses are not cached by the service worker, and there is no offline AI.
- Browser speech recognition may send audio to the browser vendor; language quality and availability vary. The app requests continuous recognition and tries to restart after silence or browser timeouts, but it cannot guarantee uninterrupted recognition on every device. The mic stops when you leave the Ask page. Read-aloud requires an installed matching voice. These are temporary phase-one conveniences, **not Groq or Gemini speech**.
- Dictation text is kept in full when stopped. The backend accepts questions up to 2,000 characters; longer text must be shortened before sending.

## Privacy and demo limits

- Conversations, saved answers and language preference are stored in this browser on this device. Use **About → Manage this device** to clear conversations or saved answers. Clearing one does not clear the other.
- The demo backend receives questions but does not save messages. Network infrastructure or browser services may have their own logs or data policies. Avoid Aadhaar numbers, bank information, OTPs and real personal health information.
- There is no authentication, access control or production rate limiting. Do not expose the demo publicly without additional protection.
- Health-related answers are not diagnosis or treatment. In an emergency in India, call 112 or contact local emergency services.

## API

All requests use the same origin as the frontend; no keys are sent to the browser.

| Endpoint | Purpose |
|---|---|
| `GET /api/health` | Reports `mode: demo`, backend status and supported languages. |
| `GET /api/resources` | Lists the manually curated official websites. |
| `POST /api/chat` | Accepts `message` and `language`; returns a labeled demo answer and general links. |

Example:

```bash
curl -X POST http://localhost:8000/api/chat \
  -H 'Content-Type: application/json' \
  -d '{"message":"Where can I get help with my crops?","language":"en"}'
```

Supported language codes are `en`, `hi`, `mr` and `ta`. The demo router is deliberately simple and does **not** understand every question.

## Tests

```bash
python -m pytest -q backend/tests
```

Optional end-to-end browser test, with the app already running on port 8000:

```bash
npx playwright install chromium
# On some Linux machines, Playwright may also require: npx playwright install-deps chromium
npm run test:e2e
npm run test:dictation
```

The browser tests stub speech APIs to check tap-to-start/stop, deferred text, reconnects, errors and the editable transcript flow; they do **not** establish real speech accuracy or microphone support.

## Project layout

```text
backend/main.py          Stateless FastAPI endpoints and sample-answer router
backend/tests/           API and multilingual starter-question tests
src/App.jsx              Navigation, conversation UI and local state
src/useDictation.js       Tap-to-stop browser dictation and best-effort reconnect
src/i18n.js              Interface translations and starter questions
src/styles.css           Responsive styling
public/                  App icons, village illustration, manifest and service worker
scripts/build-sw.mjs     Builds the static-shell precache list
scripts/smoke-test.mjs   Optional browser smoke tests
scripts/test-dictation.mjs  Focused dictation-control tests with a simulated recognizer
.env.example             Placeholder comments for phase 2; not read in phase 1
```

## Suggested phase 2

1. Get and test free-tier keys for Gemini and Groq, without enabling paid billing if a zero-charge demo is required. Keep real keys in a server-side `.env`, which is ignored by Git. **Never paste keys into chat or frontend code.** Availability and limits vary by account.
2. Connect Groq speech-to-text for recorded audio and keep editable text as a fallback.
3. Upload a small set of current, official public documents to Gemini File Search; retain their official URLs and last-checked dates. Return actual citations when available and clearly abstain when the documents do not support an answer.
4. Connect a currently available Gemini model for grounded answers, with a clear distinction between real model output and the existing sample mode. Add TTS only after testing language quality and quotas.
5. Test on the demo phone in each language, handle API errors and rate limits, and keep a clearly labeled offline/prerecorded backup.
>>>>>>> origin/master
