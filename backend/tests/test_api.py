import pytest
from fastapi.testclient import TestClient
from backend.main import app
import backend.main as api

client = TestClient(app)


def test_health_is_honest_about_demo_mode(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.delenv("GROQ_API_KEY", raising=False)
    data = client.get("/api/health").json()
    assert data["status"] == "ok"
    assert data["mode"] == "demo"
    assert data["ai_connected"] is False
    assert data["rag_connected"] is False


@pytest.mark.parametrize("language, marker", [("en", "sample"), ("hi", "नमूना"), ("mr", "नमुना"), ("ta", "மாதிரி")])
def test_chat_returns_localized_demo(language, marker, monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    response = client.post("/api/chat", json={"message": "government schemes for farmers", "language": language})
    assert response.status_code == 200
    data = response.json()
    assert data["mode"] == "demo"
    assert data["language"] == language
    assert data["topic"] == "schemes"
    assert marker in data["answer"]
    assert all(link["url"].startswith("https://") for link in data["links"])


def test_live_chat_uses_gemini_provider(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    monkeypatch.setattr(api, "generate_with_gemini", lambda message, language, topic: ("नमस्ते — यह AI उत्तर है।", [], None))
    response = client.post("/api/chat", json={"message": "सरकारी योजना क्या है?", "language": "hi"})
    assert response.status_code == 200
    assert response.json()["mode"] == "live"
    assert response.json()["answer"] == "नमस्ते — यह AI उत्तर है।"
    assert response.json()["language"] == "hi"


def test_whisper_endpoint_needs_groq_key(monkeypatch):
    monkeypatch.delenv("GROQ_API_KEY", raising=False)
    response = client.post("/api/transcribe?language=hi", files={"audio": ("question.webm", b"fake audio", "audio/webm")})
    assert response.status_code == 503


def test_tts_endpoint_needs_gemini_key(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    response = client.post("/api/speak", json={"text": "नमस्ते", "language": "hi"})
    assert response.status_code == 503


def test_routes_health_and_crops():
    assert client.post("/api/chat", json={"message": "Help with my crops", "language": "en"}).json()["topic"] == "farming"
    assert client.post("/api/chat", json={"message": "Health and government help", "language": "en"}).json()["topic"] == "health"
    assert client.post("/api/chat", json={"message": "பயிர் பற்றி", "language": "ta"}).json()["topic"] == "farming"


def test_validate_input():
    assert client.post("/api/chat", json={"message": "   ", "language": "en"}).status_code == 422
    assert client.post("/api/chat", json={"message": "x" * 2001, "language": "en"}).status_code == 422
    assert client.post("/api/chat", json={"message": "hello", "language": "xx"}).status_code == 422


def test_official_resources():
    response = client.get("/api/resources")
    assert response.status_code == 200
    assert {x["id"] for x in response.json()} == {"myscheme", "pmkisan", "kvk", "nhm"}


@pytest.mark.parametrize("language,question,topic", [
    ("en", "What government schemes can farmers explore?", "schemes"),
    ("en", "Where can I get help with my crops?", "farming"),
    ("en", "Where can my family get health support?", "health"),
    ("hi", "किसानों के लिए कौन-सी सरकारी योजनाएँ हैं?", "schemes"),
    ("hi", "फसल के लिए मदद कहाँ मिल सकती है?", "farming"),
    ("hi", "परिवार के स्वास्थ्य के लिए मदद कहाँ मिलेगी?", "health"),
    ("mr", "शेतकऱ्यांसाठी कोणत्या सरकारी योजना आहेत?", "schemes"),
    ("mr", "माझ्या पिकांसाठी मदत कुठे मिळेल?", "farming"),
    ("mr", "कुटुंबाच्या आरोग्यासाठी मदत कुठे मिळेल?", "health"),
    ("ta", "விவசாயிகளுக்கு என்ன அரசுத் திட்டங்கள் உள்ளன?", "schemes"),
    ("ta", "என் பயிர்களுக்கு எங்கே உதவி கிடைக்கும்?", "farming"),
    ("ta", "குடும்பத்தின் உடல்நலத்திற்கு எங்கே உதவி கிடைக்கும்?", "health"),
])
def test_localized_starter_questions_route_to_matching_demo_topic(language, question, topic):
    response = client.post("/api/chat", json={"message": question, "language": language})
    assert response.status_code == 200
    assert response.json()["topic"] == topic


def test_grounded_gemini_extracts_sources_and_search_suggestions(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")

    class FakeResponse:
        status_code = 200
        def json(self):
            return {"candidates": [{
                "content": {"parts": [{"text": "PM-KISAN details are available on the official site."}]},
                "groundingMetadata": {
                    "groundingChunks": [
                        {"web": {"uri": "https://pmkisan.gov.in/", "title": "PM-KISAN"}},
                        {"web": {"uri": "https://example.com/reference", "title": "Example"}},
                    ],
                    "searchEntryPoint": {"renderedContent": "<div>Google search suggestions</div>"},
                },
            }]}

    class FakeClient:
        def __init__(self, **kwargs): pass
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def post(self, *args, **kwargs):
            assert kwargs["json"]["tools"] == [{"google_search": {}}]
            return FakeResponse()

    monkeypatch.setattr(api.httpx, "Client", FakeClient)
    answer, citations, suggestions = api.generate_with_gemini("PM-KISAN eligibility", "en", "schemes")
    assert "official site" in answer
    assert len(citations) == 2
    assert citations[0].url == "https://pmkisan.gov.in/"
    assert "Google search suggestions" in suggestions


def test_gemini_tts_returns_audio_response(monkeypatch):
    import base64
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")

    class FakeResponse:
        status_code = 200
        def json(self):
            return {"candidates": [{"content": {"parts": [{
                "inlineData": {"data": base64.b64encode(b"wav-test").decode(), "mimeType": "audio/wav"}
            }]}}]}

    class FakeClient:
        def __init__(self, **kwargs): pass
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def post(self, url, **kwargs):
            assert "gemini-3.8-flash-lite-tts:generateContent" in url
            assert kwargs["json"]["generationConfig"]["responseModalities"] == ["AUDIO"]
            return FakeResponse()

    monkeypatch.setattr(api.httpx, "Client", FakeClient)
    response = api.speak(api.SpeakRequest(text="नमस्ते", language="hi"))
    assert response.media_type == "audio/wav"
    assert response.body == b"wav-test"
