import { getLanguage, type LangCode } from "./languages";
import type { RetrievalResult } from "./rag/retrieve";
import type { Chunk } from "./rag/ingest";

export interface Citation {
  scheme: string;
  source: string;
  sourceName: string;
  lastUpdated: string;
  helpline: string;
}

export interface AskResult {
  answer: string;
  mode: "live" | "demo" | "refusal";
  citations: Citation[];
  confidence: RetrievalResult["confidence"];
  intent: string | null;
  ms: number;
  /** for the UI's debug drawer / our own triage */
  retrieved: { scheme: string; heading: string; score: number; reason: string }[];
  /** added by the route handler */
  totalMs?: number;
  /** why we answered in demo mode instead of live — surfaced in the trace panel */
  llmNote?: string;
}

const SCRIPT_RE: Record<string, RegExp> = {
  devanagari: /[\u0900-\u097F]/,
  tamil: /[\u0B80-\u0BFF]/,
  bengali: /[\u0980-\u09FF]/,
  telugu: /[\u0C00-\u0C7F]/,
  latin: /[a-z]/i,
};

const LABELS: Record<LangCode, { lead: string; source: string; note: string; refuse: string }> = {
  hi: {
    lead: "जानकारी",
    source: "स्रोत",
    note: "यह जानकारी सरकारी दस्तावेज से ली गई है। अपने पंचायत या बैंक में एक बार पुष्टि कर लें।",
    refuse: "माफ करें, मेरे पास इसका भरोसेमंद जवाब नहीं है। कृपया अपने पंचायत कार्यालय से पूछें। किसान हेल्पलाइन 155261 पर भी कॉल कर सकते हैं।",
  },
  mr: {
    lead: "माहिती",
    source: "स्रोत",
    note: "ही माहिती सरकारी दस्तऐवजातून घेतली आहे. कृपया तुमच्या ग्रामपंचायत किंवा बँकेत एकदा खात्री करा.",
    refuse: "माफ करा, माझ्याकडे याचे विश्वासार्ह उत्तर नाही. कृपया तुमच्या ग्रामपंचायत कार्यालयात विचारा. किसान हेल्पलाइन 155261 वरही फोन करू शकता.",
  },
  ta: {
    lead: "தகவல்",
    source: "ஆதாரம்",
    note: "இந்தத் தகவல் அரசு ஆவணத்திலிருந்து எடுக்கப்பட்டது. உங்கள் ஊராட்சி அலுவலகம் அல்லது வங்கியில் ஒருமுறை உறுதிசெய்யவும்.",
    refuse: "மன்னிக்கவும், இதற்கு நம்பகமான பதில் என்னிடம் இல்லை. உங்கள் ஊராட்சி அலுவலகத்தில் கேட்கவும். உதவி எண் 155261.",
  },
  bn: {
    lead: "তথ্য",
    source: "সূত্র",
    note: "এই তথ্য সরকারি নথি থেকে নেওয়া। আপনার পঞ্চায়েত বা ব্যাঙ্কে একবার যাচাই করে নিন।",
    refuse: "দুঃখিত, এর নির্ভরযোগ্য উত্তর আমার কাছে নেই। অনুগ্রহ করে আপনার পঞ্চায়েত অফিসে জিজ্ঞাসা করুন। হেল্পলাইন 155261।",
  },
  te: {
    lead: "సమాచారం",
    source: "మూలం",
    note: "ఈ సమాచారం ప్రభుత్వ పత్రం నుండి తీసుకోబడింది. మీ పంచాయతీ లేదా బ్యాంకులో ఒకసారి నిర్ధారించుకోండి.",
    refuse: "క్షమించండి, దీనికి నమ్మకమైన సమాధానం నా వద్ద లేదు. దయచేసి మీ పంచాయతీ కార్యాలయంలో అడగండి. హెల్ప్‌లైన్ 155261.",
  },
  en: {
    lead: "Here is what the official document says",
    source: "Source",
    note: "This comes from the official scheme document. Please confirm once at your panchayat or bank.",
    refuse: "Sorry, I do not have a reliable answer for that. Please ask at your panchayat office, or call the Kisan helpline on 155261.",
  },
};

function toCitations(results: RetrievalResult["results"]): Citation[] {
  const seen = new Set<string>();
  const out: Citation[] = [];
  for (const r of results) {
    if (seen.has(r.chunk.id)) continue;
    seen.add(r.chunk.id);
    out.push({
      scheme: r.chunk.scheme,
      source: r.chunk.source,
      sourceName: r.chunk.sourceName,
      lastUpdated: r.chunk.lastUpdated,
      helpline: r.chunk.helpline,
    });
  }
  return out;
}

function buildContext(results: RetrievalResult["results"]): string {
  return results
    .map(
      (r, i) =>
        `[${i + 1}] Scheme: ${r.chunk.scheme}\nSection: ${r.chunk.heading}\nSource: ${r.chunk.sourceName} (${r.chunk.source})\nHelpline: ${r.chunk.helpline}\n\n${r.chunk.text}`,
    )
    .join("\n\n---\n\n");
}

function systemPrompt(langName: string, langNative: string): string {
  return [
    `You are VaaniSeva, a voice assistant for rural citizens in India. You answer questions about government schemes, farming and health information.`,
    `The user is often a farmer or an ASHA worker with limited literacy. Your answer will be READ ALOUD by a text-to-speech engine.`,
    ``,
    `LANGUAGE: Reply ONLY in ${langName} (${langNative}), in its native script. Never reply in English unless the user's question is in English.`,
    ``,
    `GROUNDING RULES (absolute):`,
    `1. Use ONLY the CONTEXT below. Do not use outside knowledge about schemes.`,
    `2. If the context does not contain the answer, say in one short sentence that you could not find it, and give the helpline number from the context.`,
    `3. Never invent an amount, date, deadline, eligibility rule or document name. Copy amounts exactly as written in the context.`,
    `4. Quote the scheme name so the listener knows which scheme you mean.`,
    ``,
    `STYLE:`,
    `- Maximum 85 words. Short spoken sentences.`,
    `- No markdown, no asterisks, no bullet characters, no headings, no emoji. The text is spoken, not read.`,
    `- Use simple everyday words a village listener understands, not official jargon.`,
  ].join("\n");
}

/** Deterministic fallback: extract the most relevant sentences from the retrieved chunk.
 *  Not as good as the LLM, but it is always grounded, instant, and free — so the demo survives
 *  a dead network, a rate limit or a missing API key. */
function extractiveAnswer(results: RetrievalResult["results"], lang: LangCode): string {
  const L = LABELS[lang];
  const script = SCRIPT_RE[getLanguage(lang).script];

  const preferred =
    results.find((r) => script.test(r.chunk.text)) ?? results[0];

  const cleaned = preferred.chunk.text
    .replace(/^##\s*[^\n]*/gm, "")
    .replace(/^[-*]\s+/gm, "")
    .replace(/\*\*/g, "")
    .replace(/\n+/g, " ")
    .trim();

  const sentences = cleaned
    .split(/(?<=[.!?।])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 12)
    .slice(0, 4);

  const body = sentences.join(" ") || cleaned.slice(0, 420);

  return `${L.lead}: ${preferred.chunk.scheme}. ${body}\n\n${L.source}: ${preferred.chunk.sourceName} — ${preferred.chunk.source}\n${L.note}`;
}

interface LlmAttempt {
  text: string | null;
  note?: string;
}

async function callGemini(
  question: string,
  lang: LangCode,
  context: string,
): Promise<LlmAttempt> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { text: null, note: "no GEMINI_API_KEY set — using grounded excerpt" };
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const language = getLanguage(lang);

  // overridable so the live path can be tested without leaving the network
  const base = process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com";
  const url = `${base}/v1beta/models/${model}:generateContent`;
  const body = {
    systemInstruction: { parts: [{ text: systemPrompt(language.english, language.native) }] },
    contents: [
      {
        role: "user",
        parts: [{ text: `CONTEXT:\n${context}\n\nUSER QUESTION: ${question}` }],
      },
    ],
    generationConfig: { temperature: 0.15, topP: 0.9, maxOutputTokens: 800 },
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(25_000),
    });
    if (!res.ok) {
      const body = (await res.text()).slice(0, 300);
      console.error("[llm] gemini error", res.status, body);
      return { text: null, note: `Gemini ${res.status}: ${body}` };
    }
    const json = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = (json.candidates?.[0]?.content?.parts ?? [])
      .map((p) => p.text ?? "")
      .join("")
      .trim();
    if (!text) return { text: null, note: "Gemini returned an empty response" };
    return { text };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[llm] gemini failed", msg);
    return { text: null, note: `could not reach Gemini (${msg})` };
  }
}

export async function answerQuestion(
  question: string,
  lang: LangCode,
  retrieval: RetrievalResult,
): Promise<AskResult> {
  const started = Date.now();
  const citations = toCitations(retrieval.results);
  const retrieved = retrieval.results.map((r) => ({
    scheme: r.chunk.scheme,
    heading: r.chunk.heading,
    score: Math.round(r.score * 10) / 10,
    reason: r.reason,
  }));

  const base = {
    citations,
    confidence: retrieval.confidence,
    intent: retrieval.intent,
    retrieved,
  };

  // Guardrail: weak retrieval -> refuse and refer, instead of hallucinating a scheme detail.
  if (retrieval.results.length === 0 || retrieval.confidence === "low") {
    return {
      ...base,
      citations: [],
      answer: LABELS[lang].refuse,
      mode: "refusal",
      ms: Date.now() - started,
    };
  }

  const context = buildContext(retrieval.results);
  const { text: live, note } = await callGemini(question, lang, context);
  if (live) {
    return { ...base, answer: live, mode: "live", ms: Date.now() - started };
  }

  return {
    ...base,
    answer: extractiveAnswer(retrieval.results, lang),
    mode: "demo",
    ms: Date.now() - started,
    llmNote: note,
  };
}

export type { Chunk };
