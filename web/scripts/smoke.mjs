#!/usr/bin/env node
// Smoke test: run after `npm run dev`. Every case here is a claim we make about the product.
//   node scripts/smoke.mjs            (defaults to http://localhost:3000)
const BASE = process.env.BASE_URL || "http://localhost:3000";

const cases = [
  { lang: "hi", q: "पीएम किसान की किस्त कब आएगी?", expect: ["PM-KISAN"], notRefusal: true },
  { lang: "mr", q: "पीक विम्याचे पैसे कसे मिळतील?", expect: ["Fasal Bima"], notRefusal: true },
  { lang: "ta", q: "பயிர் காப்பீட்டு பணம் எப்படி பெறுவது?", expect: ["Fasal Bima"], notRefusal: true },
  { lang: "en", q: "how do I get an ayushman card", expect: ["Ayushman"], notRefusal: true },
  { lang: "hi", q: "kisan credit card ke liye kya documents chahiye", expect: ["Kisan Credit"], notRefusal: true },
  { lang: "hi", q: "मेरी फसल खराब हो गई, मुआवजा कैसे मिलेगा", expect: ["Fasal Bima"], notRefusal: true },
  // guardrail: must refuse, must not cite, must not invent
  { lang: "en", q: "who won the world cup 2023", refuse: true },
  { lang: "hi", q: "मेरे गांव में नया पुल कब बनेगा", refuse: true },
];

let pass = 0;
let fail = 0;

for (const c of cases) {
  const started = Date.now();
  let out = null;
  try {
    const res = await fetch(`${BASE}/api/ask`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question: c.q, lang: c.lang }),
    });
    out = await res.json();
  } catch (err) {
    console.log(`FAIL  ${c.lang}  ${c.q}\n      request failed: ${err.message}`);
    fail += 1;
    continue;
  }
  const ms = Date.now() - started;
  const schemes = (out.citations ?? []).map((x) => x.scheme).join(" | ");
  const problems = [];

  if (c.refuse) {
    if (out.mode !== "refusal") problems.push(`expected refusal, got ${out.mode}`);
    if ((out.citations ?? []).length > 0) problems.push("refusal must not show citations");
  } else {
    if (out.mode === "refusal") problems.push("expected an answer, got refusal");
    if (c.expect && !c.expect.some((e) => schemes.includes(e))) problems.push(`wrong source: ${schemes}`);
    if (!out.answer || out.answer.length < 40) problems.push("answer too short");
  }

  if (problems.length) {
    fail += 1;
    console.log(`FAIL  ${c.lang}  ${c.q}\n      ${problems.join("; ")}`);
  } else {
    pass += 1;
    console.log(`ok    ${c.lang}  ${ms}ms  [${out.mode}]  ${schemes || "—"}`);
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
