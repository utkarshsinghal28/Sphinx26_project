"""Small, stateless API for GramSaathi.

Gemini generates chat answers; Groq Whisper transcribes microphone recordings.
The original demo response remains available when GEMINI_API_KEY is not set.
No user messages or audio are persisted by this API.
"""
from __future__ import annotations

import base64
import mimetypes
import os
from pathlib import Path
from typing import Annotated, Literal
from uuid import uuid4

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, Response, UploadFile
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, StringConstraints

load_dotenv()

Language = Literal["en", "hi", "mr", "ta"]
Topic = Literal["schemes", "farming", "health", "general"]

app = FastAPI(title="GramSaathi API", version="0.2.0")


class ChatRequest(BaseModel):
    message: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)]
    language: Language = "en"


class Resource(BaseModel):
    id: str
    name: str
    category: Literal["schemes", "farming", "health"]
    url: str
    organization: str


class Citation(BaseModel):
    title: str
    url: str


class ChatResponse(BaseModel):
    id: str
    mode: Literal["demo", "live"] = "demo"
    language: Language
    topic: Topic
    answer: str
    links: list[Resource] = Field(default_factory=list)
    citations: list[Citation] = Field(default_factory=list)
    search_suggestions: str | None = None


class SpeakRequest(BaseModel):
    text: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=5000)]
    language: Language = "en"


RESOURCES: list[Resource] = [
    Resource(id="myscheme", name="myScheme", category="schemes", url="https://www.myscheme.gov.in/", organization="Government of India"),
    Resource(id="pmkisan", name="PM-KISAN", category="schemes", url="https://pmkisan.gov.in/", organization="Government of India"),
    Resource(id="kvk", name="Krishi Vigyan Kendras", category="farming", url="https://icar.gov.in/index.php/en/krishi-vigyan-kendras-kvks", organization="Indian Council of Agricultural Research"),
    Resource(id="nhm", name="National Health Mission", category="health", url="https://nhm.gov.in/", organization="Ministry of Health & Family Welfare"),
]
RESOURCE_BY_ID = {resource.id: resource for resource in RESOURCES}

# These are prewritten sample responses, NOT model outputs or retrieved results.
DEMO_ANSWERS: dict[Language, dict[Topic, str]] = {
    "en": {
        "schemes": "To explore government schemes, start with myScheme and search for your state and situation. Check eligibility and application details on the official website.\n\nThis is a sample response. Live AI and document search are not connected yet.",
        "farming": "For questions about crops or farming, contact your nearest Krishi Vigyan Kendra (KVK). Advice can vary with your district and crop.\n\nThis is a sample response. Live AI and document search are not connected yet.",
        "health": "For health questions, speak to a local ASHA worker, primary health centre or qualified professional. This sample cannot diagnose or recommend treatment. In an emergency, call 112.\n\nThis is a sample response. Live AI and document search are not connected yet.",
        "general": "I can help you find starting points for government schemes, farming and family health. Explore the official websites linked below.\n\nThis is a sample response. Live AI and document search are not connected yet.",
    },
    "hi": {
        "schemes": "सरकारी योजनाएँ खोजने के लिए myScheme पर अपने राज्य और ज़रूरत के अनुसार खोज करें। पात्रता और आवेदन की जानकारी आधिकारिक वेबसाइट पर जाँचें।\n\nयह नमूना जवाब है। लाइव AI और दस्तावेज़ खोज अभी जुड़े नहीं हैं।",
        "farming": "फसल या खेती से जुड़े सवालों के लिए अपने नज़दीकी कृषि विज्ञान केंद्र (KVK) से सलाह लें। सलाह आपके क्षेत्र और फसल के अनुसार बदल सकती है।\n\nयह नमूना जवाब है। लाइव AI और दस्तावेज़ खोज अभी जुड़े नहीं हैं।",
        "health": "स्वास्थ्य संबंधी सवालों के लिए स्थानीय आशा कार्यकर्ता, प्राथमिक स्वास्थ्य केंद्र या योग्य स्वास्थ्य विशेषज्ञ से बात करें। यह नमूना निदान या इलाज की सलाह नहीं देता। आपातकाल में 112 पर कॉल करें।\n\nयह नमूना जवाब है। लाइव AI और दस्तावेज़ खोज अभी जुड़े नहीं हैं।",
        "general": "मैं सरकारी योजनाओं, खेती और पारिवारिक स्वास्थ्य के लिए जानकारी के शुरुआती स्रोत ढूँढने में मदद कर सकता हूँ। नीचे दी गई आधिकारिक वेबसाइटें देखें।\n\nयह नमूना जवाब है। लाइव AI और दस्तावेज़ खोज अभी जुड़े नहीं हैं।",
    },
    "mr": {
        "schemes": "सरकारी योजना शोधण्यासाठी myScheme वर तुमच्या राज्यानुसार आणि गरजेनुसार शोधा. पात्रता आणि अर्जाची माहिती अधिकृत संकेतस्थळावर तपासा.\n\nहे नमुना उत्तर आहे. लाइव्ह AI आणि दस्तऐवज शोध अजून जोडलेले नाहीत.",
        "farming": "पीक किंवा शेतीविषयक प्रश्नांसाठी जवळच्या कृषी विज्ञान केंद्राशी (KVK) संपर्क साधा. सल्ला तुमच्या जिल्ह्यानुसार आणि पिकानुसार बदलू शकतो.\n\nहे नमुना उत्तर आहे. लाइव्ह AI आणि दस्तऐवज शोध अजून जोडलेले नाहीत.",
        "health": "आरोग्याच्या प्रश्नांसाठी स्थानिक आशा सेविका, प्राथमिक आरोग्य केंद्र किंवा पात्र आरोग्यतज्ज्ञांशी बोला. हे नमुना उत्तर निदान किंवा उपचार सुचवत नाही. आपत्कालीन स्थितीत 112 वर कॉल करा.\n\nहे नमुना उत्तर आहे. लाइव्ह AI आणि दस्तऐवज शोध अजून जोडलेले नाहीत.",
        "general": "सरकारी योजना, शेती आणि कौटुंबिक आरोग्याविषयी माहिती शोधण्याची सुरुवात करण्यास मी मदत करू शकतो. खाली दिलेली अधिकृत संकेतस्थळे पाहा.\n\nहे नमुना उत्तर आहे. लाइव्ह AI आणि दस्तऐवज शोध अजून जोडलेले नाहीत.",
    },
    "ta": {
        "schemes": "அரசுத் திட்டங்களை அறிய myScheme தளத்தில் உங்கள் மாநிலம் மற்றும் தேவைக்கேற்ப தேடுங்கள். தகுதி மற்றும் விண்ணப்ப விவரங்களை அதிகாரப்பூர்வ இணையதளத்தில் சரிபார்க்கவும்.\n\nஇது ஒரு மாதிரி பதில். நேரடி AI மற்றும் ஆவணத் தேடல் இன்னும் இணைக்கப்படவில்லை.",
        "farming": "பயிர் அல்லது விவசாயம் தொடர்பான கேள்விகளுக்கு அருகிலுள்ள வேளாண் அறிவியல் மையத்தை (KVK) அணுகுங்கள். உங்கள் மாவட்டம் மற்றும் பயிரைப் பொறுத்து ஆலோசனை மாறலாம்.\n\nஇது ஒரு மாதிரி பதில். நேரடி AI மற்றும் ஆவணத் தேடல் இன்னும் இணைக்கப்படவில்லை.",
        "health": "உடல்நலக் கேள்விகளுக்கு உள்ளூர் ஆஷா பணியாளர், ஆரம்ப சுகாதார நிலையம் அல்லது தகுதிபெற்ற மருத்துவரை அணுகுங்கள். இந்த மாதிரி பதில் நோயறிதலோ சிகிச்சைப் பரிந்துரையோ வழங்காது. அவசர நிலையில் 112-ஐ அழைக்கவும்.\n\nஇது ஒரு மாதிரி பதில். நேரடி AI மற்றும் ஆவணத் தேடல் இன்னும் இணைக்கப்படவில்லை.",
        "general": "அரசுத் திட்டங்கள், விவசாயம் மற்றும் குடும்ப நலம் பற்றிய தகவல்களைத் தேடத் தொடங்க நான் உதவலாம். கீழேயுள்ள அதிகாரப்பூர்வ இணையதளங்களைப் பாருங்கள்.\n\nஇது ஒரு மாதிரி பதில். நேரடி AI மற்றும் ஆவணத் தேடல் இன்னும் இணைக்கப்படவில்லை.",
    },
}

KEYWORDS: dict[Topic, tuple[str, ...]] = {
    "health": ("health", "hospital", "doctor", "illness", "medicine", "pregnan", "fever", "asha", "स्वास्थ्य", "बीमारी", "दवा", "बुखार", "आरोग्य", "रुग्ण", "औषध", "गर्भ", "உடல்நல", "சுகாதார", "மருத்துவ", "நோய்", "காய்ச்சல்", "கர்ப்ப"),
    "schemes": ("scheme", "government", "yojana", "pension", "benefit", "eligible", "eligibility", "subsid", "pm kisan", "pm-kisan", "योजना", "सरकार", "पात्रता", "पेंशन", "लाभ", "शासन", "अनुदान", "திட்ட", "அரசு", "உதவித்தொகை", "தகுதி"),
    "farming": ("crop", "farm", "agricultur", "pest", "soil", "irrigation", "seed", "फसल", "खेती", "कृषि", "कीट", "मिट्टी", "शेती", "पीक", "पिक", "माती", "பயிர்", "விவசாய", "வேளாண்", "பூச்சி", "மண்"),
    "general": (),
}


def classify_topic(message: str) -> Topic:
    text = message.casefold()
    for topic in ("health", "schemes", "farming"):
        if any(term in text for term in KEYWORDS[topic]):
            return topic  # type: ignore[return-value]
    return "general"


def resources_for(topic: Topic) -> list[Resource]:
    ids: dict[Topic, list[str]] = {
        "schemes": ["myscheme", "pmkisan"], "farming": ["kvk"],
        "health": ["nhm"], "general": ["myscheme", "kvk", "nhm"],
    }
    return [RESOURCE_BY_ID[item] for item in ids[topic]]


@app.get("/api/health")
def health() -> dict:
    has_gemini = bool(os.getenv("GEMINI_API_KEY"))
    has_groq = bool(os.getenv("GROQ_API_KEY"))
    return {
        "status": "ok", "mode": "live" if has_gemini else "demo",
        "ai_connected": has_gemini, "rag_connected": False,
        "speech": "groq-whisper" if has_groq else "not-configured",
        "languages": ["en", "hi", "mr", "ta"],
    }


@app.get("/api/resources", response_model=list[Resource])
def resources() -> list[Resource]:
    return RESOURCES


OFFICIAL_DOMAINS = ("myscheme.gov.in", "pmkisan.gov.in", "icar.gov.in", "nhm.gov.in")


def generate_with_gemini(message: str, language: Language, topic: Topic) -> tuple[str, list[Citation], str | None]:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("Gemini is not configured")
    model = os.getenv("GEMINI_MODEL", "gemini-3.6-flash")
    language_names = {"en": "English", "hi": "Hindi", "mr": "Marathi", "ta": "Tamil"}
    topic_domains = {
        "schemes": ("myscheme.gov.in", "pmkisan.gov.in"),
        "farming": ("icar.gov.in",),
        "health": ("nhm.gov.in",),
        "general": OFFICIAL_DOMAINS,
    }
    domains = ", ".join(topic_domains[topic])
    system_prompt = (
        "You are GramSaathi, a careful multilingual assistant for rural citizens in India. "
        "Answer clearly and warmly in " + language_names[language] + ". The question topic is " + topic + ". "
        "Use Google Search grounding for current or factual questions. Prioritize official information from these topic sources: " + domains + ". "
        "Base scheme eligibility, benefits, dates, and application steps only on official government pages. "
        "If you cannot find an official source that supports a detail, say you could not verify it and do not guess. "
        "Do not claim that user PDFs have been added; document upload is not connected yet. "
        "Give practical next steps. For health questions, provide general information only, do not diagnose or prescribe, and recommend a qualified health worker; mention 112 for emergencies. "
        "Keep the response concise and easy to understand for a rural reader."
    )
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    try:
        with httpx.Client(timeout=60) as client:
            response = client.post(
                url,
                headers={"x-goog-api-key": api_key},
                json={
                    "systemInstruction": {"parts": [{"text": system_prompt}]},
                    "contents": [{"role": "user", "parts": [{"text": message}]}],
                    "tools": [{"google_search": {}}],
                    "generationConfig": {"temperature": 0.2, "maxOutputTokens": 700},
                },
            )
        if response.status_code >= 400:
            raise RuntimeError(f"Gemini API returned HTTP {response.status_code}")
        data = response.json()
        candidate = data["candidates"][0]
        text = "".join(part.get("text", "") for part in candidate["content"]["parts"]).strip()
        if not text:
            raise RuntimeError("Gemini returned an empty answer")
        grounding = candidate.get("groundingMetadata", {})
        citations: list[Citation] = []
        seen: set[str] = set()
        for chunk in grounding.get("groundingChunks", []):
            web = chunk.get("web") or {}
            uri, title = (web.get("uri") or "").strip(), (web.get("title") or "Web source").strip()
            if uri.startswith("https://") and uri not in seen:
                citations.append(Citation(title=title, url=uri))
                seen.add(uri)
        suggestions = grounding.get("searchEntryPoint", {}).get("renderedContent")
        return text, citations, suggestions
    except RuntimeError:
        raise
    except (httpx.HTTPError, KeyError, IndexError, TypeError, ValueError) as exc:
        raise RuntimeError("Gemini request failed") from exc


@app.post("/api/chat", response_model=ChatResponse)
def chat(payload: ChatRequest) -> ChatResponse:
    topic = classify_topic(payload.message)
    if os.getenv("GEMINI_API_KEY"):
        try:
            answer, citations, suggestions = generate_with_gemini(payload.message, payload.language, topic)
            return ChatResponse(id=str(uuid4()), mode="live", language=payload.language,
                                topic=topic, answer=answer, links=resources_for(topic), citations=citations, search_suggestions=suggestions)
        except RuntimeError as exc:
            raise HTTPException(status_code=502, detail="AI service is unavailable. Please try again shortly.") from exc
    return ChatResponse(id=str(uuid4()), language=payload.language, topic=topic,
                        answer=DEMO_ANSWERS[payload.language][topic], links=resources_for(topic))


@app.post("/api/speak")
def speak(payload: SpeakRequest) -> Response:
    """Generate WAV read-aloud audio with Gemini TTS; the browser may fall back to local TTS."""
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="Gemini speech is not configured.")
    model = os.getenv("GEMINI_TTS_MODEL", "gemini-3.8-flash-lite-tts")
    language_names = {"en": "English", "hi": "Hindi", "mr": "Marathi", "ta": "Tamil"}
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    try:
        with httpx.Client(timeout=75) as client:
            result = client.post(
                url,
                headers={"x-goog-api-key": api_key},
                json={
                    "contents": [{"role": "user", "parts": [{
                        "text": payload.text,
                        "speech_metadata": {"style": f"Speak clearly and warmly in {language_names[payload.language]} at a moderate pace."},
                    }]}],
                    "generationConfig": {
                        "responseModalities": ["AUDIO"],
                        "speechConfig": {"voiceConfig": {"prebuiltVoiceConfig": {"voiceName": "Kore"}}},
                    },
                },
            )
        if result.status_code >= 400:
            raise RuntimeError(f"Gemini TTS returned HTTP {result.status_code}")
        response_data = result.json()
        part = response_data["candidates"][0]["content"]["parts"][0]
        audio_data = part["inlineData"]["data"]
        mime = part["inlineData"].get("mimeType", "audio/wav")
        audio_bytes = base64.b64decode(audio_data, validate=True)
        if not audio_bytes:
            raise RuntimeError("Gemini TTS returned empty audio")
        return Response(content=audio_bytes, media_type=mime, headers={"Cache-Control": "no-store"})
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail="Speech generation failed. Please try again.") from exc
    except (httpx.HTTPError, KeyError, IndexError, TypeError, ValueError) as exc:
        raise HTTPException(status_code=502, detail="Speech generation failed. Please try again.") from exc


@app.post("/api/transcribe")
def transcribe_audio(audio: UploadFile = File(...), language: Language = "en") -> dict:
    """Transcribe a short microphone recording through Groq Whisper; audio is not saved."""
    if not os.getenv("GROQ_API_KEY"):
        raise HTTPException(status_code=503, detail="Voice transcription is not configured.")
    max_bytes = int(os.getenv("MAX_AUDIO_MB", "10")) * 1024 * 1024
    content = audio.file.read(max_bytes + 1)
    if len(content) > max_bytes:
        raise HTTPException(status_code=413, detail="Recording is too large. Please record a shorter question.")
    if not content:
        raise HTTPException(status_code=400, detail="No audio was received.")
    try:
        from groq import Groq
        client = Groq(api_key=os.environ["GROQ_API_KEY"])
        transcription = client.audio.transcriptions.create(
            file=(audio.filename or "recording.webm", content),
            model=os.getenv("GROQ_STT_MODEL", "whisper-large-v3"),
            language=language,
            response_format="json",
        )
        text = (transcription.text or "").strip()
        if not text:
            raise HTTPException(status_code=422, detail="No speech was recognised.")
        return {"text": text, "language": language}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Voice transcription failed. Please try again or type your question.") from exc


# Serve a production frontend from the same origin as /api.
mimetypes.add_type("application/manifest+json", ".webmanifest")
frontend_dir = Path(__file__).resolve().parent.parent / "dist"
app.mount("/", StaticFiles(directory=frontend_dir, html=True, check_dir=False), name="frontend")
