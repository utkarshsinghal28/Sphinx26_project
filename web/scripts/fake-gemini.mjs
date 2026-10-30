#!/usr/bin/env node
// A stand-in for generativelanguage.googleapis.com, so the *live* code path can be
// exercised on a machine with no outbound network (CI, restricted sandbox).
// It validates that our request is well-formed and echoes a Gemini-shaped response.
//
//   node scripts/fake-gemini.mjs                 # then set GEMINI_BASE_URL=http://127.0.0.1:8787
import http from "node:http";

const PORT = Number(process.env.FAKE_PORT || 8787);

const server = http.createServer((req, res) => {
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    const raw = Buffer.concat(chunks).toString("utf8");
    const key = req.headers["x-goog-api-key"] || "";

    if (req.url?.includes("/v1beta/models") && !req.url.includes(":generateContent")) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ models: [{ name: "models/gemini-2.5-flash" }] }));
      return;
    }

    if (!key) {
      res.writeHead(401, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { message: "missing x-goog-api-key header" } }));
      return;
    }

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { message: "invalid JSON" } }));
      return;
    }

    const sys = parsed.systemInstruction?.parts?.[0]?.text ?? "";
    const userText = parsed.contents?.[0]?.parts?.[0]?.text ?? "";
    const hasSystem = typeof parsed.systemInstruction === "object" && parsed.systemInstruction !== null;
    const langOk = /Hindi|Marathi|Tamil|Bengali|Telugu|English/.test(sys);
    const grounded = userText.includes("CONTEXT:") && userText.includes("pmkisan.gov.in");
    console.log(
      `[fake-gemini] langRule=${langOk} grounded=${grounded} maxTokens=${parsed.generationConfig?.maxOutputTokens} q="${userText.split("USER QUESTION:")[1]?.trim().slice(0, 36)}"`,
    );

    // mimic a rejected request only when a system prompt was sent but broke the language rule
    if (hasSystem && !langOk) {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { message: "system prompt has no language rule" } }));
      return;
    }

    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        candidates: [
          {
            content: {
              role: "model",
              parts: [
                {
                  text: "पीएम-किसान योजना में हर साल 6,000 रुपये मिलते हैं, जो 2,000 रुपये की तीन किस्तों में बैंक खाते में आते हैं।",
                },
              ],
            },
            finishReason: "STOP",
          },
        ],
      }),
    );
  });
});

server.listen(PORT, "0.0.0.0", () => console.log(`[fake-gemini] listening on :${PORT}`));
