import { useEffect, useState } from "react";
import { Wrench } from "lucide-react";
import { EQUIPMENT_CATEGORY_LABEL } from "@core/role-gear";
import { TOOL_OWNERSHIP_LABEL, toolsForRole, type PersonalTool } from "@core/personal-tools";
import "./tools.css";

const SHOWN = 3;

/**
 * Your own tools used on this role, from My Tools. They're read here and
 * linked or unlinked from the tool itself.
 */
export function RoleOwnTools({ roleId }: { roleId: string }) {
  const [tools, setTools] = useState<PersonalTool[] | null>(null);
  const [failed, setFailed] = useState(false);
  // Goes up on Try again, to read the tools once more.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    // A new role starts empty: the last role's tools never show under it.
    setTools(null);
    setFailed(false);
    void fetch("/api/tools")
      .then(async (response) => {
        if (!response.ok) throw new Error("tools");
        const body = (await response.json()) as { tools: PersonalTool[] };
        if (live) setTools(toolsForRole(body.tools, roleId));
      })
      .catch(() => {
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [roleId, attempt]);

  if (failed) {
    return (
      <section className="role-group is-wide role-own-tools" aria-label="Your own tools">
        <div className="role-group-head">
          <h3>Your own tools</h3>
        </div>
        <p className="role-view-empty">
          Your tools couldn't be read.{" "}
          <button type="button" className="role-view-text" onClick={() => setAttempt((count) => count + 1)}>
            Try again
          </button>
        </p>
      </section>
    );
  }
  if (tools === null) return null;
  const shown = tools.slice(0, SHOWN);
  return (
    <section className={["role-group", "is-wide", "role-own-tools", tools.length ? "" : "is-empty"].filter(Boolean).join(" ")} aria-label="Your own tools">
      <div className="role-group-head">
        <h3>Your own tools</h3>
        <a className="role-edit" href="#/tools">
          Open My Tools
        </a>
      </div>
      {tools.length === 0 ? (
        <a className="role-group-add" href="#/tools">
          None linked yet. Link a tool from My Tools.
        </a>
      ) : (
        <>
          <ul className="role-own-tools-list">
            {shown.map((tool) => {
              const cover = tool.photos.find((photo) => photo.cover) ?? tool.photos[0];
              return (
                <li key={tool.id}>
                  <a href={`#/tools/${encodeURIComponent(tool.id)}`}>
                    <span className="role-own-tools-thumb">
                      {cover ? <img src={cover.url} alt="" loading="lazy" /> : <Wrench size={18} aria-hidden="true" />}
                    </span>
                    <span>
                      <strong>{tool.name}</strong>
                      <small>
                        {TOOL_OWNERSHIP_LABEL[tool.ownership]} · {EQUIPMENT_CATEGORY_LABEL[tool.category]}
                      </small>
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
          {tools.length > SHOWN ? (
            <a className="role-own-tools-more" href="#/tools">
              + {tools.length - SHOWN} more
            </a>
          ) : null}
          <p className="role-group-note">Link or unlink a tool from the tool itself, in My Tools.</p>
        </>
      )}
    </section>
  );
}
