import pytest
from fastapi.testclient import TestClient
from backend.main import app

client = TestClient(app)


def test_health_is_honest_about_demo_mode():
    data = client.get("/api/health").json()
    assert data["status"] == "ok"
    assert data["mode"] == "demo"
    assert data["ai_connected"] is False
    assert data["rag_connected"] is False


@pytest.mark.parametrize("language, marker", [("en", "sample"), ("hi", "नमूना"), ("mr", "नमुना"), ("ta", "மாதிரி")])
def test_chat_returns_localized_demo(language, marker):
    response = client.post("/api/chat", json={"message": "government schemes for farmers", "language": language})
    assert response.status_code == 200
    data = response.json()
    assert data["mode"] == "demo"
    assert data["language"] == language
    assert data["topic"] == "schemes"
    assert marker in data["answer"]
    assert all(link["url"].startswith("https://") for link in data["links"])


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
