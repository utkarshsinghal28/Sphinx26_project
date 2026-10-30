import { NextResponse } from "next/server";
import { retrieve } from "@/lib/rag/retrieve";
import { answerQuestion } from "@/lib/llm";
import { LANGUAGES, type LangCode } from "@/lib/languages";


interface Body {
  question?: unknown;
  lang?: unknown;
}

function isLang(v: unknown): v is LangCode {
  return typeof v === "string" && LANGUAGES.some((l) => l.code === v);
}

export async function POST(req: Request) {
  const started = Date.now();
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const question = typeof body.question === "string" ? body.question.trim() : "";
  const lang: LangCode = isLang(body.lang) ? body.lang : "hi";

  if (question.length < 2) {
    return NextResponse.json({ error: "Question is too short" }, { status: 400 });
  }
  if (question.length > 500) {
    return NextResponse.json({ error: "Question is too long" }, { status: 413 });
  }

  try {
    const retrieval = retrieve(question, 4);
    const result = await answerQuestion(question, lang, retrieval);
    return NextResponse.json(
      { ...result, question, lang, totalMs: Date.now() - started },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (err) {
    console.error("[api/ask] failed", err);
    return NextResponse.json({ error: "Something went wrong on our side" }, { status: 500 });
  }
}
