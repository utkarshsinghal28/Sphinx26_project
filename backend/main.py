"""Small, stateless API for the GramSaathi phase-one demo.

No user messages are stored, and no external model is called in this phase.
Replace the demo answer provider in a later phase; keep keys on the server.
"""
from __future__ import annotations

import mimetypes
from pathlib import Path
from typing import Annotated, Literal
from uuid import uuid4

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, StringConstraints

Language = Literal["en", "hi", "mr", "ta"]
Topic = Literal["schemes", "farming", "health", "general"]

app = FastAPI(title="GramSaathi API", version="0.1.0")


class ChatRequest(BaseModel):
    message: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)]
    language: Language = "en"


class Resource(BaseModel):
    id: str
    name: str
    category: Literal["schemes", "farming", "health"]
    url: str
    organization: str


class ChatResponse(BaseModel):
    id: str
    mode: Literal["demo"] = "demo"
    language: Language
    topic: Topic
    answer: str
    links: list[Resource] = Field(default_factory=list)


RESOURCES: list[Resource] = [
    Resource(id="myscheme", name="myScheme", category="schemes", url="https://www.myscheme.gov.in/", organization="Government of India"),
    Resource(id="pmkisan", name="PM-KISAN", category="schemes", url="https://pmkisan.gov.in/", organization="Government of India"),
    Resource(id="kvk", name="Krishi Vigyan Kendras", category="farming", url="https://icar.gov.in/index.php/en/krishi-vigyan-kendras-kvks", organization="Indian Council of Agricultural Research"),
    Resource(id="nhm", name="National Health Mission", category="health", url="https://nhm.gov.in/", organization="Ministry of Health & Family Welfare"),
]
RESOURCE_BY_ID = {resource.id: resource for resource in RESOURCES}

# These are prewritten sample responses, NOT model outputs or retrieved results.
# The language is chosen by the user, not automatically detected.
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
    # Health takes priority for safety; scheme before farming handles scheme queries
    # mentioning farmers. This is only a simple demo router, not language understanding.
    for topic in ("health", "schemes", "farming"):
        if any(term in text for term in KEYWORDS[topic]):
            return topic  # type: ignore[return-value]
    return "general"


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok", "mode": "demo", "ai_connected": False, "rag_connected": False, "speech": "optional-browser-feature", "languages": ["en", "hi", "mr", "ta"]}


@app.get("/api/resources", response_model=list[Resource])
def resources() -> list[Resource]:
    return RESOURCES


@app.post("/api/chat", response_model=ChatResponse)
def chat(payload: ChatRequest) -> ChatResponse:
    topic = classify_topic(payload.message)
    resource_ids: dict[Topic, list[str]] = {
        "schemes": ["myscheme", "pmkisan"],
        "farming": ["kvk"],
        "health": ["nhm"],
        "general": ["myscheme", "kvk", "nhm"],
    }
    return ChatResponse(
        id=str(uuid4()), language=payload.language, topic=topic,
        answer=DEMO_ANSWERS[payload.language][topic],
        links=[RESOURCE_BY_ID[id_] for id_ in resource_ids[topic]],
    )


# Serve a production frontend from the same origin as /api. The directory is
# generated with `npm run build`; check_dir=False allows API-only development.
mimetypes.add_type("application/manifest+json", ".webmanifest")
frontend_dir = Path(__file__).resolve().parent.parent / "dist"
app.mount("/", StaticFiles(directory=frontend_dir, html=True, check_dir=False), name="frontend")
