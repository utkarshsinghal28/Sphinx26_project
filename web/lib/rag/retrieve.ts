import { loadChunks, type Chunk } from "./ingest";

export interface RetrievedChunk {
  chunk: Chunk;
  score: number;
  reason: "keyword" | "lexical" | "intent";
}

export interface RetrievalResult {
  results: RetrievedChunk[];
  confidence: "high" | "medium" | "low";
  matchedSchemes: string[];
  intent: string | null;
}

/** Words that carry no retrieval signal in any of our languages. */
const STOPWORDS = new Set([
  // english
  "the", "a", "an", "is", "are", "was", "were", "of", "to", "in", "on", "for", "and", "or", "how",
  "do", "i", "my", "we", "you", "what", "when", "where", "which", "who", "will", "can", "get",
  "it", "this", "that", "with", "me", "be", "has", "have", "about", "please",
  // hindi / marathi (devanagari)
  "है", "हैं", "का", "की", "के", "को", "में", "से", "और", "या", "क्या", "कैसे", "कब", "कहाँ",
  "मिलता", "मिलती", "मिलेगा", "मिलेगी", "करना", "करें", "करने", "होता", "होती", "होगा", "पर",
  "आहे", "आहेत", "कसे", "कधी", "करायचे", "मिळेल", "मिळतील", "कसे", "मला", "माझ्या",
  // tamil
  "எப்படி", "எப்போது", "என்ன", "என்பது", "பெறுவது", "வேண்டும்", "என்றால்",
]);

const INTENTS: { id: string; headings: string[]; terms: string[] }[] = [
  {
    id: "apply",
    headings: ["how to apply", "how to get", "how to demand", "how to enrol", "how to claim"],
    terms: [
      "apply", "application", "register", "registration", "how do i get",
      "आवेदन", "कैसे करें", "कैसे बनवाएं", "कैसे लें", "कैसे मिलेगा", "फॉर्म",
      "अर्ज", "कसे काढायचे", "कसे मिळतील", "कसा काढायचा", "कसे करावे",
      "விண்ணப்ப", "எப்படி பெறுவது", "எப்படி வாங்குவது",
      "আবেদন", "কীভাবে পাবো", "దరఖాస్తు", "ఎలా పొందాలి",
    ],
  },
  {
    id: "claim",
    headings: ["how to claim", "claim after crop loss"],
    terms: [
      "claim", "compensation", "loss", "damage", "मुआवजा", "नुकसान", "भरपाई", "मुआवजा कैसे",
      "முழு இழப்பு", "இழப்பீடு", "ক্ষতিপূরণ",
    ],
  },
  {
    id: "documents",
    headings: ["documents needed", "documents"],
    terms: [
      "document", "documents", "papers", "कागजात", "कागज", "दस्तावेज", "जरूरी कागजात",
      "ஆவணங்கள்", "কাগজপত্র", "పత్రాలు",
    ],
  },
  {
    id: "eligibility",
    headings: ["who is eligible", "who can enrol", "eligibility"],
    terms: [
      "eligible", "eligibility", "qualify", "पात्रता", "पात्र", "कौन पा सकता है",
      "पात्रता क्या", "தகுதி", "যোগ্যতা", "అర్హత",
    ],
  },
  {
    id: "money",
    headings: ["benefits", "loan limit and interest", "premium paid by the farmer"],
    terms: [
      "benefit", "amount", "money", "instalment", "installment", "how much", "kitna",
      "पैसा", "पैसे", "किस्त", "रकम", "कितना", "लाभ", "फायदा", "ब्याज", "हप्ता",
      "பணம்", "தவணை", "டাকা", "টাকা", "డబ్బు", "సొమ్ము",
    ],
  },
  {
    id: "problem",
    headings: ["common problems", "important points"],
    terms: [
      "problem", "not received", "stopped", "pending", "rejected", "दिक्कत", "समस्या",
      "नहीं आया", "अटका", "रुक गया", "समस्या", "பிரச்சனை",
    ],
  },
];

const PUNCT = /[।॥!?.,;:"'()[\]{}\/\\|–—…*_#`~@$%^&+=<>]/g;

function normalize(s: string): string {
  return s.toLowerCase().replace(PUNCT, " ").replace(/\s+/g, " ").trim();
}

function tokenize(s: string): string[] {
  return normalize(s)
    .split(" ")
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
}

function prefixOverlap(a: string, b: string): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
  return i;
}

/** Devanagari and Dravidian languages inflect heavily: विमा / विम्याचे, காப்பீடு / காப்பீட்டு.
 *  Exact substring matching misses those, so allow a strong shared prefix. */
function tokenMatch(queryToken: string, token: string): boolean {
  if (queryToken === token) return true;
  if (token.includes(queryToken) || queryToken.includes(token)) return true;
  const p = prefixOverlap(queryToken, token);
  const shorter = Math.min(queryToken.length, token.length);
  return shorter >= 3 && p >= 3 && p >= shorter * 0.6;
}

/** A multi-word keyword matches if every meaningful word of it matches some query word. */
function keywordMatchesQuery(keyword: string, queryTokens: string[]): boolean {
  const kwTokens = normalize(keyword)
    .split(" ")
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
  if (kwTokens.length === 0) return false;
  if (!kwTokens.some((t) => t.length >= 3)) return false;
  return kwTokens.every((kt) => queryTokens.some((qt) => tokenMatch(qt, kt)));
}

function detectIntent(question: string): string | null {
  const q = normalize(question);
  let best: { id: string; hits: number } | null = null;
  for (const intent of INTENTS) {
    const hits = intent.terms.filter((t) => q.includes(normalize(t))).length;
    if (hits > 0 && (!best || hits > best.hits)) best = { id: intent.id, hits };
  }
  return best?.id ?? null;
}

function headingMatchesIntent(heading: string, intent: string | null): boolean {
  if (!intent) return false;
  const target = INTENTS.find((i) => i.id === intent);
  if (!target) return false;
  const h = normalize(heading);
  return target.headings.some((x) => h.includes(normalize(x)));
}

/**
 * Hybrid retrieval, deliberately dependency-free so it works offline and at build time:
 *   1. scheme keywords in any script  -> hard boost for that whole document (cross-lingual bridge)
 *   2. lexical overlap within a chunk -> granular ranking
 *   3. query intent vs section heading -> picks "how to apply" over "what is it"
 * Swap step 1+2 for BGE-M3 / Gemini embeddings when keys are available; interface unchanged.
 */
export function retrieve(question: string, topK = 4): RetrievalResult {
  const chunks = loadChunks();
  const q = normalize(question);
  const qTokens = tokenize(question);
  const intent = detectIntent(question);

  if (!q || qTokens.length === 0) {
    return { results: [], confidence: "low", matchedSchemes: [], intent };
  }

  // 1. scheme-level keyword match (works for Marathi/Tamil queries against English docs)
  const schemeBoost = new Map<string, { boost: number; matched: string }>();
  for (const c of chunks) {
    for (const kw of c.keywords) {
      if (kw.length < 3) continue;
      if (!keywordMatchesQuery(kw, qTokens)) continue;
      const prev = schemeBoost.get(c.id);
      // longer, more specific keywords are stronger evidence
      const boost = 10 + Math.min(kw.length / 4, 6);
      if (!prev || boost > prev.boost) schemeBoost.set(c.id, { boost, matched: kw });
    }
  }

  const scored: RetrievedChunk[] = chunks.map((chunk) => {
    let score = 0;
    let reason: RetrievedChunk["reason"] = "lexical";

    for (const t of qTokens) {
      if (chunk.haystack.includes(t)) {
        score += t.length > 4 ? 2 : 1.5;
      } else if (t.length >= 4) {
        // crude stemming: shared prefix, helps "बीमा"/"बीमे", "apply"/"applying"
        const stem = t.slice(0, Math.max(3, t.length - 1));
        if (chunk.haystack.includes(stem)) score += 0.75;
      }
    }

    const sb = schemeBoost.get(chunk.id);
    if (sb) {
      score += sb.boost;
      reason = "keyword";
    }

    if (headingMatchesIntent(chunk.heading, intent)) {
      score += 2.5;
      if (!sb) reason = "intent";
    }

    return { chunk, score, reason };
  });

  const results = scored
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  const top = results[0]?.score ?? 0;
  const matchedSchemes = [...schemeBoost.keys()];
  const confidence: RetrievalResult["confidence"] =
    top >= 10 || matchedSchemes.length > 0 ? (top >= 10 ? "high" : "medium") : top >= 4 ? "medium" : "low";

  return { results, confidence, matchedSchemes, intent };
}
