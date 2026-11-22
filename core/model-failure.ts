/**
 * Why a model call failed, in words an occupant can act on. The raw message
 * from the model server stays available as detail; it is not the explanation.
 */
export type ModelFailureKind =
  | "unreachable"
  | "stopped"
  | "model-missing"
  | "key-refused"
  | "too-slow"
  | "failed";

export type ModelFailure = {
  kind: ModelFailureKind;
  message: string;
};

const MESSAGES: Record<ModelFailureKind, string> = {
  unreachable: "Docier couldn't reach the model. Check that it's running, then try again.",
  stopped:
    "The model stopped before it finished. It may need more memory than this computer has free. Try a smaller model, or continue without one.",
  "model-missing": "The model server doesn't have that model. Choose another one.",
  "key-refused": "The provider refused that key. Check the key, then try again.",
  "too-slow": "The model took too long to answer. Try again, or choose a smaller model.",
  failed: "The model couldn't finish. Try again, choose another model, or continue without one.",
};

/** Sorts a model server's error into one of a few causes an occupant can act on. */
export function describeModelFailure(raw: unknown): ModelFailure {
  const text = (raw instanceof Error ? raw.message : typeof raw === "string" ? raw : "").toLowerCase();
  const kind: ModelFailureKind =
    /(econnrefused|fetch failed|cannot connect|connect etimedout|enotfound|getaddrinfo)/.test(text) &&
    !/other side closed/.test(text)
      ? "unreachable"
      : /(other side closed|socket hang up|econnreset|terminated|empty reply|out of memory|\boom\b)/.test(text)
        ? "stopped"
        : /(model .*not found|no such model|unknown model|model_not_found|\b404\b)/.test(text)
          ? "model-missing"
          : /(\b401\b|\b403\b|unauthori[sz]ed|invalid api key|incorrect api key|forbidden)/.test(text)
            ? "key-refused"
            : /(timed? ?out|timeout|deadline)/.test(text)
              ? "too-slow"
              : "failed";
  return { kind, message: MESSAGES[kind] };
}
