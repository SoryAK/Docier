export const DEFAULT_LOCAL_BASE_URL = "http://127.0.0.1:11434/v1";
export const LLAMA_CPP_BASE_URL = "http://127.0.0.1:8080/v1";
export const OPENAI_BASE_URL = "https://api.openai.com/v1";
export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

export type ModelHosting = "local" | "cloud";

export type ModelConnectionInput = {
  hosting?: unknown;
  baseUrl?: unknown;
  model?: unknown;
  apiKey?: unknown;
};

export type PreparedModelConnection = {
  hosting: ModelHosting;
  baseUrl: string;
  model: string;
  apiKey: string | null;
};

export type ModelConnectionPrepareError =
  | "hosting-required"
  | "url-required"
  | "url-invalid"
  | "key-required";

export function parseModelHosting(value: unknown): ModelHosting | null {
  return value === "local" || value === "cloud" ? value : null;
}

export function normalizeBaseUrl(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\/+$/, "");
}

export function isHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function prepareModelConnection(
  input: ModelConnectionInput,
):
  | { ok: true; value: PreparedModelConnection }
  | { ok: false; error: ModelConnectionPrepareError } {
  const hosting = parseModelHosting(input.hosting);
  if (!hosting) return { ok: false, error: "hosting-required" };

  const baseUrl = normalizeBaseUrl(input.baseUrl);
  if (!baseUrl) return { ok: false, error: "url-required" };
  if (!isHttpUrl(baseUrl)) return { ok: false, error: "url-invalid" };

  const model = typeof input.model === "string" ? input.model.trim() : "";
  const apiKey =
    typeof input.apiKey === "string" && input.apiKey.trim()
      ? input.apiKey.trim()
      : null;

  if (hosting === "cloud" && !apiKey) {
    return { ok: false, error: "key-required" };
  }

  return { ok: true, value: { hosting, baseUrl, model, apiKey } };
}

/** A cloud provider an occupant can choose in setup. "custom" is any compatible address. */
export type CloudProviderId = "openai" | "openrouter" | "custom";

export const CLOUD_PROVIDERS: ReadonlyArray<{ id: Exclude<CloudProviderId, "custom">; label: string; baseUrl: string }> = [
  { id: "openai", label: "OpenAI", baseUrl: OPENAI_BASE_URL },
  { id: "openrouter", label: "OpenRouter", baseUrl: OPENROUTER_BASE_URL },
];

/** The provider an address belongs to, or "custom" for any other address. */
export function cloudProviderFor(baseUrl: string): CloudProviderId {
  const address = baseUrl.trim().replace(/\/+$/, "");
  return CLOUD_PROVIDERS.find((provider) => provider.baseUrl === address)?.id ?? "custom";
}

/**
 * Where a resume goes when this cloud model reads it, said plainly: the
 * provider's name and host, or just the host for another address.
 */
export function cloudDestination(baseUrl: string): string {
  let host = "";
  try {
    host = new URL(baseUrl.trim()).host;
  } catch {
    return "";
  }
  const provider = CLOUD_PROVIDERS.find((row) => row.id === cloudProviderFor(baseUrl));
  return provider ? `${provider.label} (${host})` : host;
}
