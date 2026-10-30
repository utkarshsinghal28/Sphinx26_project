import { NextResponse } from "next/server";
import { corpusStats } from "@/lib/rag/ingest";


export async function GET() {
  return NextResponse.json({
    ok: true,
    llm: process.env.GEMINI_API_KEY ? "gemini" : "demo (extractive, no API key)",
    corpus: corpusStats(),
  });
}
