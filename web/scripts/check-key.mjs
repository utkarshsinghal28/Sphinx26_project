#!/usr/bin/env node
/**
 * Doctor: is the Gemini key actually working from THIS machine?
 *
 *   cd web && npm run doctor
 *
 * It separates the three failures that all look identical in the UI:
 *   1. no key / malformed key
 *   2. key is fine but this machine cannot reach Google (proxy, firewall, offline sandbox)
 *   3. key is rejected by Google (expired, revoked, wrong project, billing off)
 */
import fs from "node:fs";
import path from "node:path";

function loadEnvLocal() {
  const file = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(file)) return {};
  const out = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

const env = { ...loadEnvLocal(), ...process.env };
const key = (env.GEMINI_API_KEY || "").trim();
const model = env.GEMINI_MODEL || "gemini-2.5-flash";
const base = env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com";
const line = (s = "") => console.log(s);
let fatal = false;

line("\nVaaniSeva doctor\n───────────────");
line(`model:  ${model}`);
line(`base:   ${base}`);

if (!key) {
  line("key:    x missing");
  line("\n-> Add GEMINI_API_KEY=... to web/.env.local");
  line("   Free key: https://aistudio.google.com/apikey");
  process.exit(1);
}
const looksValid = /^(AIza|AQ\.)[A-Za-z0-9._-]{20,}$/.test(key);
line(
  `key:    ${looksValid ? "ok" : "!! unusual format"} (${key.slice(0, 6)}...${key.slice(-4)}, ${key.length} chars)`,
);

line("\n[1/2] reaching the API ...");
try {
  const res = await fetch(`${base}/v1beta/models`, {
    headers: { "x-goog-api-key": key },
    signal: AbortSignal.timeout(15_000),
  });
  line(`      HTTP ${res.status}`);
  if (res.status === 401 || res.status === 403) {
    fatal = true;
    line("      x the key was rejected by Google (expired, revoked, or wrong project)");
    line("      -> create a fresh key at https://aistudio.google.com/apikey");
  } else if (!res.ok) {
    const body = (await res.text()).slice(0, 200);
    fatal = true;
    line(`      x unexpected: ${body}`);
  } else {
    const json = await res.json();
    const names = (json.models ?? []).map((m) => m.name).slice(0, 60);
    const hasModel = names.some((n) => n.endsWith(model));
    line(`      ok reachable, ${names.length} models visible`);
    if (!hasModel) {
      line(`      !! ${model} not in the list. Available flash models:`);
      names
        .filter((n) => n.includes("flash"))
        .slice(0, 6)
        .forEach((n) => line(`         ${n.replace("models/", "")}`));
      line("      -> set GEMINI_MODEL= to one of the above (no 'models/' prefix)");
    }
  }
} catch (err) {
  fatal = true;
  const msg = err instanceof Error ? err.message : String(err);
  line(`      x could not connect: ${msg}`);
  line("      This machine cannot reach generativelanguage.googleapis.com.");
  line("      Nothing is wrong with the key - run this on a normal network,");
  line("      or deploy and set GEMINI_API_KEY in the host's env vars.");
  line("      Without it the app still answers, from the document itself (mode: demo).");
}

if (!fatal) {
  line("\n[2/2] generating a real answer ...");
  try {
    const res = await fetch(`${base}/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              {
                text: "PM-KISAN योजना में एक साल में कितने रुपये मिलते हैं? एक वाक्य में हिंदी में उत्तर दें।",
              },
            ],
          },
        ],
        generationConfig: { temperature: 0, maxOutputTokens: 120 },
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      fatal = true;
      line(`      x HTTP ${res.status}: ${(await res.text()).slice(0, 240)}`);
    } else {
      const json = await res.json();
      const text = (json.candidates?.[0]?.content?.parts ?? [])
        .map((p) => p.text ?? "")
        .join("")
        .trim();
      line(`      ok answered: "${text.slice(0, 120)}${text.length > 120 ? "..." : ""}"`);
    }
  } catch (err) {
    fatal = true;
    line(`      x ${err instanceof Error ? err.message : String(err)}`);
  }
}

line("");
if (fatal) {
  line("RESULT: FAIL - live mode will not work here. The app falls back to demo mode");
  line("        (answers graded from the official document text, labelled 'demo').");
  process.exit(1);
}
line("RESULT: PASS - live mode is ready. Restart `npm run dev` and answers are generated.");
process.exit(0);
