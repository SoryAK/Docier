export type ResumePreviewKind = "pdf" | "docx" | "text" | "other";

export const DOCX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** The resume files Docier reads, for a file picker's `accept`. */
export const RESUME_FILE_ACCEPT = `application/pdf,${DOCX_MEDIA_TYPE},text/plain,.pdf,.docx,.txt,.md`;

export function classifyResumePreview(file: {
  name?: string | null;
  type?: string | null;
}): ResumePreviewKind {
  const type = (file.type ?? "").toLowerCase();
  const name = (file.name ?? "").toLowerCase();
  if (type === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (type === DOCX_MEDIA_TYPE || name.endsWith(".docx")) return "docx";
  if (
    type === "text/plain" ||
    type.startsWith("text/") ||
    name.endsWith(".txt") ||
    name.endsWith(".md")
  ) {
    return "text";
  }
  return "other";
}
