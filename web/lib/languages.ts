export type LangCode = "hi" | "mr" | "ta" | "bn" | "te" | "en";

export interface Language {
  code: LangCode;
  /** label in the language's own script — the only label a user may be able to read */
  native: string;
  english: string;
  /** BCP-47 tag for Web Speech API (STT + TTS) */
  speech: string;
  script: "devanagari" | "tamil" | "bengali" | "telugu" | "latin";
  /** shown as tappable starter questions — voice is primary, this is the training wheels */
  samples: string[];
  ui: {
    listening: string;
    thinking: string;
    speaking: string;
    tapToSpeak: string;
    heard: string;
    edit: string;
    listenAgain: string;
    source: string;
    helpline: string;
    tooShort: string;
    noSpeech: string;
  };
}

export const LANGUAGES: Language[] = [
  {
    code: "hi",
    native: "हिंदी",
    english: "Hindi",
    speech: "hi-IN",
    script: "devanagari",
    samples: [
      "पीएम किसान की किस्त कब आएगी?",
      "फसल बीमा का पैसा कैसे मिलेगा?",
      "आयुष्मान कार्ड कैसे बनवाएं?",
    ],
    ui: {
      listening: "सुन रहा हूँ…",
      thinking: "सोच रहा हूँ…",
      speaking: "बोल रहा हूँ…",
      tapToSpeak: "बोलने के लिए दबाएं",
      heard: "मैंने सुना",
      edit: "ठीक करें",
      listenAgain: "फिर सुनें",
      source: "स्रोत",
      helpline: "हेल्पलाइन",
      tooShort: "आवाज़ नहीं आई, फिर कोशिश करें",
      noSpeech: "माफ करें, समझ नहीं आया",
    },
  },
  {
    code: "mr",
    native: "मराठी",
    english: "Marathi",
    speech: "mr-IN",
    script: "devanagari",
    samples: [
      "पीक विम्याचे पैसे कसे मिळतील?",
      "पीएम किसानचा हप्ता कधी येईल?",
      "आयुष्मान कार्ड कसे काढायचे?",
    ],
    ui: {
      listening: "ऐकत आहे…",
      thinking: "विचार करत आहे…",
      speaking: "बोलत आहे…",
      tapToSpeak: "बोलण्यासाठी दाबा",
      heard: "मी ऐकले",
      edit: "दुरुस्त करा",
      listenAgain: "पुन्हा ऐका",
      source: "स्रोत",
      helpline: "हेल्पलाइन",
      tooShort: "आवाज ऐकू आला नाही, पुन्हा प्रयत्न करा",
      noSpeech: "माफ करा, समजले नाही",
    },
  },
  {
    code: "ta",
    native: "தமிழ்",
    english: "Tamil",
    speech: "ta-IN",
    script: "tamil",
    samples: [
      "பயிர் காப்பீட்டு பணம் எப்படி பெறுவது?",
      "ஆயுஷ்மான் அட்டை எப்படி பெறுவது?",
      "கிஸான் கடன் அட்டை எப்படி வாங்குவது?",
    ],
    ui: {
      listening: "கேட்கிறேன்…",
      thinking: "யோசிக்கிறேன்…",
      speaking: "பேசுகிறேன்…",
      tapToSpeak: "பேச அழுத்தவும்",
      heard: "நான் கேட்டது",
      edit: "திருத்து",
      listenAgain: "மீண்டும் கேட்க",
      source: "ஆதாரம்",
      helpline: "உதவி எண்",
      tooShort: "குரல் கேட்கவில்லை, மீண்டும் முயற்சிக்கவும்",
      noSpeech: "மன்னிக்கவும், புரியவில்லை",
    },
  },
  {
    code: "bn",
    native: "বাংলা",
    english: "Bengali",
    speech: "bn-IN",
    script: "bengali",
    samples: [
      "ফসল বিমার টাকা কীভাবে পাবো?",
      "আয়ুষ্মান কার্ড কীভাবে বানাবো?",
      "কিষাণ ক্রেডিট কার্ড কীভাবে পাবো?",
    ],
    ui: {
      listening: "শুনছি…",
      thinking: "ভাবছি…",
      speaking: "বলছি…",
      tapToSpeak: "বলতে চাপ দিন",
      heard: "আমি শুনেছি",
      edit: "সংশোধন",
      listenAgain: "আবার শুনুন",
      source: "সূত্র",
      helpline: "হেল্পলাইন",
      tooShort: "কোনো শব্দ পাইনি, আবার চেষ্টা করুন",
      noSpeech: "দুঃখিত, বুঝতে পারিনি",
    },
  },
  {
    code: "te",
    native: "తెలుగు",
    english: "Telugu",
    speech: "te-IN",
    script: "telugu",
    samples: [
      "పంట బీమా డబ్బు ఎలా పొందాలి?",
      "ఆయుష్మాన్ కార్డు ఎలా తీసుకోవాలి?",
      "రైతు రుణం ఎలా పొందాలి?",
    ],
    ui: {
      listening: "వింటున్నాను…",
      thinking: "ఆలోచిస్తున్నాను…",
      speaking: "మాట్లాడుతున్నాను…",
      tapToSpeak: "మాట్లాడటానికి నొక్కండి",
      heard: "నేను విన్నది",
      edit: "సరిచేయి",
      listenAgain: "మళ్ళీ వినండి",
      source: "మూలం",
      helpline: "హెల్ప్‌లైన్",
      tooShort: "శబ్దం రాలేదు, మళ్ళీ ప్రయత్నించండి",
      noSpeech: "క్షమించండి, అర్థం కాలేదు",
    },
  },
  {
    code: "en",
    native: "English",
    english: "English",
    speech: "en-IN",
    script: "latin",
    samples: [
      "When will the PM-KISAN instalment arrive?",
      "How do I claim crop insurance?",
      "How do I get an Ayushman card?",
    ],
    ui: {
      listening: "Listening…",
      thinking: "Thinking…",
      speaking: "Speaking…",
      tapToSpeak: "Hold to speak",
      heard: "I heard",
      edit: "Edit",
      listenAgain: "Listen again",
      source: "Source",
      helpline: "Helpline",
      tooShort: "Didn't catch that, try again",
      noSpeech: "Sorry, I didn't understand",
    },
  },
];

export const DEFAULT_LANG: LangCode = "hi";

export function getLanguage(code: string): Language {
  return LANGUAGES.find((l) => l.code === code) ?? LANGUAGES[0];
}
