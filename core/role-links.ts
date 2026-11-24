import { isLinkedEvidenceUrl } from "./work-map";

/**
 * The company's links on a role: its website and its social accounts. They
 * show on the role for you; they are never put on your public page.
 */

export const ROLE_LINK_KINDS = ["website", "linkedin", "instagram", "facebook", "x", "youtube"] as const;
export type RoleLinkKind = (typeof ROLE_LINK_KINDS)[number];
export type RoleLinks = Record<RoleLinkKind, string>;

export const ROLE_LINK_LABEL: Record<RoleLinkKind, string> = {
  website: "Website",
  linkedin: "LinkedIn",
  instagram: "Instagram",
  facebook: "Facebook",
  x: "X",
  youtube: "YouTube",
};

export const EMPTY_ROLE_LINKS: RoleLinks = { website: "", linkedin: "", instagram: "", facebook: "", x: "", youtube: "" };

/** A link as typed, with https:// added to a bare address; "" if it isn't a web link. */
export function roleLink(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  const full = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  if (!isLinkedEvidenceUrl(full)) return "";
  // A bare word with no dot isn't an address.
  try {
    if (!new URL(full).hostname.includes(".")) return "";
  } catch {
    return "";
  }
  return full;
}

/** Checks the links as the form sends them. A missing one is cleared. */
export function prepareRoleLinks(
  input: Partial<Record<RoleLinkKind, unknown>>,
): { ok: true; value: RoleLinks } | { ok: false; error: "url-invalid"; field: RoleLinkKind } {
  const value = { ...EMPTY_ROLE_LINKS };
  for (const kind of ROLE_LINK_KINDS) {
    const typed = typeof input[kind] === "string" ? (input[kind] as string).trim() : "";
    if (!typed) continue;
    const link = roleLink(typed);
    if (!link) return { ok: false, error: "url-invalid", field: kind };
    value[kind] = link;
  }
  return { ok: true, value };
}

/** "giantdirect.com" from "https://www.giantdirect.com/about". */
export function linkHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** The links that are set, in order: the website by its name, the rest by theirs. */
export function roleLinkList(links: RoleLinks): Array<{ kind: RoleLinkKind; url: string; label: string }> {
  return ROLE_LINK_KINDS.filter((kind) => links[kind]).map((kind) => ({
    kind,
    url: links[kind],
    label: kind === "website" ? linkHost(links[kind]) : ROLE_LINK_LABEL[kind],
  }));
}
