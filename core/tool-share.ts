/**
 * Share pages: a page about your tools to send someone, shaped for who it's for.
 * An employer or recruiter sees what you use and how well; a crew sees what you
 * have, its condition, and the kits it's in. Serials, prices, where things are
 * kept, notes, and unfinished drafts never go on a share page.
 */
import { EQUIPMENT_CATEGORY_LABEL } from "./role-gear";
import { TOOL_CONDITION_LABEL, TOOL_OWNERSHIP_LABEL, type PersonalTool } from "./personal-tools";

export type ShareAudience = "employer" | "crew";

export const SHARE_AUDIENCE_LABEL: Record<ShareAudience, string> = {
  employer: "An employer or recruiter",
  crew: "A crew",
};

export const SHARE_FILE_NAME: Record<ShareAudience, string> = {
  employer: "my-tools-for-employers.html",
  crew: "my-tools-for-crew.html",
};

/** One tool as a share page shows it: only what its audience sees. */
export type SharedTool = {
  id: string;
  name: string;
  makerModel: string;
  /** The tool's cover photo, to put in (as image data) when there is one. */
  hasPhoto: boolean;
  /** Each line under the name, as label and value. */
  facts: Array<{ label: string; value: string }>;
};

/** The tools to share, as the audience sees them. Drafts still needing details stay out. */
export function shareTools(
  tools: PersonalTool[],
  audience: ShareAudience,
  names: { roleName: (id: string) => string | undefined; kitName: (id: string) => string | undefined },
): SharedTool[] {
  return tools
    .filter((tool) => !tool.draft)
    .map((tool) => {
      const facts: SharedTool["facts"] = [];
      if (audience === "employer") {
        if (tool.category !== "tool") facts.push({ label: "Kind", value: EQUIPMENT_CATEGORY_LABEL[tool.category] });
        if (tool.skill) facts.push({ label: "How well I use it", value: `${tool.skill} of 5` });
        const used = tool.roleIds.map(names.roleName).filter((name): name is string => Boolean(name));
        if (used.length) facts.push({ label: "Used at", value: used.join(", ") });
      } else {
        if (tool.condition) facts.push({ label: "Condition", value: TOOL_CONDITION_LABEL[tool.condition] });
        facts.push({ label: "Whose it is", value: TOOL_OWNERSHIP_LABEL[tool.ownership] });
        const kits = tool.kitIds.map(names.kitName).filter((name): name is string => Boolean(name));
        if (kits.length) facts.push({ label: "In", value: kits.join(", ") });
      }
      return {
        id: tool.id,
        name: tool.name,
        makerModel: [tool.maker, tool.model].filter(Boolean).join(" · "),
        hasPhoto: tool.photos.length > 0,
        facts,
      };
    });
}

/** Text made safe to put in a page: never read as markup. */
function escape(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Only image data goes in as a photo: nothing that could load or run something else. */
function safePhoto(value: string | undefined): string | null {
  if (!value || !/^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(value)) return null;
  return value;
}

const STYLE = `
*{box-sizing:border-box}
body{margin:0;padding:32px 24px;background:#fff;color:#171717;font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
header{max-width:960px;margin:0 auto 24px}
h1{margin:0;font-size:26px}
header p{margin:4px 0 0;color:#6b6b70}
ul{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:16px;max-width:960px;margin:0 auto;padding:0;list-style:none}
li{overflow:hidden;border:1px solid #e4e4e7;border-radius:10px;break-inside:avoid}
li img{display:block;width:100%;height:150px;object-fit:cover;background:#efebe5}
li div{padding:10px 12px 12px}
h2{margin:0;font-size:16px}
.made{margin:2px 0 6px;color:#6b6b70;font-size:13px}
dl{margin:0;font-size:13px}
dt{color:#6b6b70}
dd{margin:0 0 4px}
footer{max-width:960px;margin:24px auto 0;color:#8a8a90;font-size:12px}
@media print{body{padding:0}li{border-color:#ccc}}
`;

/** The share page: one self-contained HTML file, photos built in. */
export function toolShareHtml(input: {
  audience: ShareAudience;
  tools: SharedTool[];
  /** Cover photos by tool id, as image data. */
  photos: Record<string, string>;
  owner: { name: string; headline: string } | null;
  /** When it was made, e.g. "Nov 2026". */
  month: string;
}): string {
  const by = input.owner ? [input.owner.name, input.owner.headline].map((part) => part.trim()).filter(Boolean) : [];
  const title = by.length ? `Tools · ${by[0]}` : "Tools";
  const cards = input.tools
    .map((tool) => {
      const photo = tool.hasPhoto ? safePhoto(input.photos[tool.id]) : null;
      const facts = tool.facts.map((fact) => `<dt>${escape(fact.label)}</dt><dd>${escape(fact.value)}</dd>`).join("");
      return [
        "<li>",
        photo ? `<img src="${photo}" alt="${escape(tool.name)}">` : "",
        "<div>",
        `<h2>${escape(tool.name)}</h2>`,
        tool.makerModel ? `<p class="made">${escape(tool.makerModel)}</p>` : "",
        facts ? `<dl>${facts}</dl>` : "",
        "</div></li>",
      ].join("");
    })
    .join("\n");
  return [
    "<!doctype html>",
    '<html lang="en"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escape(title)}</title>`,
    `<style>${STYLE}</style></head><body>`,
    "<header>",
    "<h1>Tools</h1>",
    `<p>${escape([...by, input.month].join(" · "))}</p>`,
    "</header>",
    `<ul>${cards}</ul>`,
    `<footer>${input.tools.length === 1 ? "1 tool" : `${input.tools.length} tools`}</footer>`,
    "</body></html>",
  ].join("\n");
}
