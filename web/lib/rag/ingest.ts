import fs from "node:fs";
import path from "node:path";

export interface SchemeMeta {
  id: string;
  scheme: string;
  category: string;
  /** official government URL — the citation we show the user */
  source: string;
  sourceName: string;
  lastUpdated: string;
  helpline: string;
  /** pipe-separated multi-script keywords: "फसल बीमा|पीक विमा|crop insurance" */
  keywords: string[];
}

export interface Chunk extends SchemeMeta {
  chunkId: string;
  heading: string;
  text: string;
  /** lowercased searchable text, precomputed once */
  haystack: string;
}

const CONTENT_DIR = path.join(process.cwd(), "content", "schemes");
const MAX_CHUNK = 900;

function parseFrontmatter(raw: string): { meta: Record<string, string>; body: string } {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { meta: {}, body: raw };
  const meta: Record<string, string> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const i = line.indexOf(":");
    if (i === -1) continue;
    meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return { meta, body: m[2] };
}

function splitLong(heading: string, text: string): { heading: string; text: string }[] {
  if (text.length <= MAX_CHUNK) return [{ heading, text }];
  const paras = text.split(/\n\s*\n/);
  const out: { heading: string; text: string }[] = [];
  let buf = "";
  for (const p of paras) {
    if (buf && buf.length + p.length > MAX_CHUNK) {
      out.push({ heading, text: buf.trim() });
      buf = p;
    } else {
      buf = buf ? `${buf}\n\n${p}` : p;
    }
  }
  if (buf.trim()) out.push({ heading, text: buf.trim() });
  return out;
}

function chunksForDoc(meta: Record<string, string>, body: string): Chunk[] {
  const keywords = (meta.keywords ?? "").split("|").map((k) => k.trim().toLowerCase()).filter(Boolean);
  const base: SchemeMeta = {
    id: meta.id ?? "unknown",
    scheme: meta.scheme ?? meta.id ?? "Unknown scheme",
    category: meta.category ?? "general",
    source: meta.source ?? "",
    sourceName: meta.sourceName ?? meta.source ?? "",
    lastUpdated: meta.lastUpdated ?? "",
    helpline: meta.helpline ?? "",
    keywords,
  };

  const sections = body
    .split(/\n(?=##\s)/)
    .map((s) => s.trim())
    .filter(Boolean);

  const chunks: Chunk[] = [];
  for (const section of sections) {
    const firstNl = section.indexOf("\n");
    const heading = (firstNl === -1 ? section : section.slice(0, firstNl))
      .replace(/^##\s*/, "")
      .trim();
    const text = section.trim();
    for (const part of splitLong(heading, text)) {
      chunks.push({
        ...base,
        chunkId: `${base.id}#${chunks.length}`,
        heading: part.heading,
        text: part.text,
        haystack: `${base.scheme} ${part.heading} ${part.text}`.toLowerCase(),
      });
    }
  }
  return chunks;
}

let cache: Chunk[] | null = null;

/** Reads content/schemes/*.md once per process and returns section-level chunks. */
export function loadChunks(): Chunk[] {
  if (cache) return cache;
  let files: string[] = [];
  try {
    files = fs.readdirSync(CONTENT_DIR).filter((f) => f.endsWith(".md"));
  } catch {
    cache = [];
    return cache;
  }
  const chunks: Chunk[] = [];
  for (const f of files.sort()) {
    const raw = fs.readFileSync(path.join(CONTENT_DIR, f), "utf8");
    const { meta, body } = parseFrontmatter(raw);
    chunks.push(...chunksForDoc(meta, body));
  }
  cache = chunks;
  return cache;
}

export function corpusStats() {
  const chunks = loadChunks();
  const docs = new Set(chunks.map((c) => c.id));
  return { documents: docs.size, chunks: chunks.length };
}
