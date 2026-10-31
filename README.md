# GramSaathi

A multilingual web assistant prototype for rural citizens. The existing React interface is retained; the backend uses Gemini for answers and speech, and Groq Whisper for microphone transcription. It is an independent prototype, not a government service.

## Current scope

- English, Hindi, Marathi and Tamil UI and conversation.
- `POST /api/chat` uses Gemini Google Search grounding. It prioritizes the existing official resources (myScheme, PM-KISAN, ICAR/KVK and NHM) and displays the citations and search suggestions returned by Google. Search is not restricted to those domains, so check the sources shown.
- Microphone input records audio in the browser and sends it to `POST /api/transcribe`, which calls Groq Whisper. The transcript is placed in the editable question box.
- The answer speaker button requests Gemini TTS audio from `POST /api/speak`; if that is unavailable, it tries an installed browser voice.
- **Your PDFs are not connected yet.** Search grounding accesses current web content, not a private document library. Verify important scheme details at their official source. Health answers are not diagnosis or treatment.
- API keys stay on the backend. The app does not save microphone recordings or backend chat requests.

Google Search grounding and TTS consume Gemini API quota and may incur charges depending on your account and current plan. Review your account usage. Google’s Search grounding terms say prompts, context and outputs are retained for 30 days; do not submit sensitive personal details. See [Gemini API terms](https://ai.google.dev/gemini-api/terms#grounding-with-google-search).

Avoid entering Aadhaar numbers, bank details, OTPs or private health information. Provider and network services may have their own data policies.

## Add API keys and run

From the project root:

```bash
npm ci
python -m venv .venv
# macOS / Linux:
source .venv/bin/activate
# Windows PowerShell: .venv\\Scripts\\Activate.ps1
python -m pip install -r requirements.txt
cp .env.example .env
```

Edit `.env` locally and add your keys:

```dotenv
GEMINI_API_KEY=your_gemini_key
GROQ_API_KEY=your_groq_key
```

The default models are `gemini-3.6-flash`, `gemini-3.8-flash-lite-tts` and `whisper-large-v3`; model names can be changed in `.env`. Keep `.env` private; it is ignored by Git. **Never paste keys into chat, commit them, or put them in frontend code.**

Build and start the app:

```bash
npm run build
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000
```

Open http://localhost:8000. On the same computer, use `localhost` for microphone access; `0.0.0.0` is the server bind address, not the browser URL. For phone testing, use a proper HTTPS address. After editing `.env`, restart the backend. For frontend development, run the backend in one terminal and `npm run dev` in another; Vite proxies `/api` to port 8000.

## API

| Endpoint | Purpose |
|---|---|
| `GET /api/health` | Reports whether Gemini and Groq keys are configured. `rag_connected` remains false until PDF retrieval is added. |
| `GET /api/resources` | Lists the four manually curated official starting-point websites. |
| `POST /api/chat` | JSON body: `{"message":"...", "language":"en"}`. Returns a grounded Gemini answer and available approved citations, or the demo answer if Gemini is not configured. |
| `POST /api/transcribe?language=hi` | Multipart form field `audio`; sends the temporary recording to Groq Whisper and returns recognized text. |
| `POST /api/speak` | JSON body: `{"text":"...", "language":"hi"}`; returns Gemini-generated WAV audio. |

Supported language codes: `en`, `hi`, `mr`, `ta`.

## Tests

```bash
python -m pytest -q
npm run build
```

The optional Playwright microphone-flow test uses a fake recorder and mocked transcription response; it does not measure Whisper accuracy or real microphone support. Start the app first, then run `npm run test:dictation` after installing Chromium with `npx playwright install chromium`.
