import { strFromU8, unzipSync } from "fflate";

/** The largest `word/document.xml` read, so a crafted file can't fill memory. */
export const DOCX_DOCUMENT_MAX_BYTES = 8 * 1024 * 1024;

const DOCUMENT_PART = "word/document.xml";

/**
 * The text of a .docx file, read on this machine: one line per paragraph,
 * tabs and line breaks kept. Returns null when the file isn't a readable
 * .docx. Only the document part is unpacked, and only up to a size limit.
 */
export function readDocxText(bytes: Uint8Array): string | null {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes, {
      filter: (file) => file.name === DOCUMENT_PART && file.originalSize <= DOCX_DOCUMENT_MAX_BYTES,
    });
  } catch {
    return null;
  }
  const part = entries[DOCUMENT_PART];
  if (!part || part.length > DOCX_DOCUMENT_MAX_BYTES) return null;
  return documentXmlText(strFromU8(part));
}

/** The visible text of a WordprocessingML body. */
export function documentXmlText(xml: string): string {
  return decodeEntities(
    xml
      // Field codes and deleted revisions aren't visible text.
      .replace(/<w:instrText\b[^>]*>[\s\S]*?<\/w:instrText>/g, "")
      .replace(/<w:delText\b[^>]*>[\s\S]*?<\/w:delText>/g, "")
      .replace(/<w:tab\b[^>]*\/>/g, "\t")
      .replace(/<w:(?:br|cr)\b[^>]*\/>/g, "\n")
      .replace(/<\/w:p>/g, "\n")
      .replace(/<[^>]+>/g, ""),
  )
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (match, code: string) => {
    const lower = code.toLowerCase();
    if (lower === "amp") return "&";
    if (lower === "lt") return "<";
    if (lower === "gt") return ">";
    if (lower === "quot") return '"';
    if (lower === "apos") return "'";
    const point = lower.startsWith("#x") ? Number.parseInt(lower.slice(2), 16) : Number.parseInt(lower.slice(1), 10);
    return Number.isFinite(point) && point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : match;
  });
}
