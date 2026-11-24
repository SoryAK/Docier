import { useEffect, useState, type FormEvent } from "react";
import { REQUEST_KIND_LABEL, type RequestKind, type RequestRoleContext } from "@core/requests";
import type { WorkMapRole } from "@core/work-map";
import { BadgeCheck, Link2 } from "lucide-react";

type Ask = {
  kind: string;
  body: string;
  fromName: string;
  fromHeadline: string;
  role: RequestRoleContext | null;
  status: "open" | "answered" | "withdrawn" | "expired";
};

const MESSAGE: Record<string, string> = {
  "link-invalid": "That isn't a request link. It looks like https://…/q/…",
  "link-unreachable": "That link can't be reached right now. Try again soon.",
  "request-closed": "That request was already answered, withdrawn, or has expired.",
  "role-required": "Pick the role you worked together in.",
  "role-missing": "That role isn't in your career history any more.",
};

/**
 * Answers a request someone sent you, from this Docier: paste its link. A
 * "worked together" request confirmed here is recorded on your role too, so it
 * counts on both sides.
 */
export function AnswerRequest({ onAnswered }: { onAnswered?: () => void }) {
  const [link, setLink] = useState("");
  const [ask, setAsk] = useState<Ask | null>(null);
  const [roles, setRoles] = useState<WorkMapRole[]>([]);
  const [suggested, setSuggested] = useState<string[]>([]);
  const [roleId, setRoleId] = useState("");
  const [note, setNote] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [done, setDone] = useState("");

  useEffect(() => {
    if (!ask || ask.kind !== "worked-with") return;
    void fetch("/api/work-map")
      .then(async (response) => (response.ok ? ((await response.json()) as { roles?: WorkMapRole[] }).roles ?? [] : []))
      .then(setRoles)
      .catch(() => setRoles([]));
  }, [ask]);

  async function post(path: string, body: unknown) {
    const response = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) throw new Error(String(json.error ?? "failed"));
    return json;
  }

  async function read(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setDone("");
    try {
      const body = (await post("/api/received-asks/read", { link })) as { ask: Ask; suggestedRoleIds: string[] };
      setAsk(body.ask);
      setSuggested(body.suggestedRoleIds);
      setRoleId(body.suggestedRoleIds[0] ?? "");
      setNote("");
    } catch (error) {
      setAsk(null);
      setMessage(MESSAGE[(error as Error).message] ?? "That link could not be read. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function answer(decision: "approved" | "declined") {
    if (!ask) return;
    setBusy(true);
    setMessage("");
    try {
      await post("/api/received-asks/answer", {
        link,
        decision,
        note,
        roleId: decision === "approved" ? roleId : undefined,
        share: email.trim() ? { email: email.trim() } : undefined,
      });
      const chosen = roles.find((role) => role.id === roleId);
      setDone(
        decision === "declined"
          ? `You declined ${ask.fromName}'s request.`
          : ask.kind === "worked-with"
            ? `Confirmed both ways. ${ask.fromName} is on your ${chosen?.organization || "chosen"} role in Career History.`
            : `You approved ${ask.fromName}'s request.`,
      );
      setAsk(null);
      setLink("");
      setEmail("");
      onAnswered?.();
    } catch (error) {
      setMessage(MESSAGE[(error as Error).message] ?? "Your answer could not be sent. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const worked = ask?.kind === "worked-with";
  const ordered = [...roles].sort((a, b) => Number(suggested.includes(b.id)) - Number(suggested.includes(a.id)));
  const label = ask ? (REQUEST_KIND_LABEL as Record<string, string>)[ask.kind as RequestKind] ?? "Request" : "";

  return (
    <section className="answer-request" aria-label="Answer a request">
      <form className="answer-request-find" onSubmit={read}>
        <Link2 size={15} aria-hidden="true" />
        <input
          aria-label="Request link"
          placeholder="Got a request link from someone? Paste it here"
          value={link}
          onChange={(event) => setLink(event.target.value)}
          disabled={busy}
        />
        <button type="submit" className="answer-request-ghost" disabled={busy || !link.trim()}>
          {busy && !ask ? "Reading…" : "Open"}
        </button>
      </form>
      {message ? <p className="answer-request-error" role="alert">{message}</p> : null}
      {done ? (
        <p className="answer-request-done" role="status">
          <BadgeCheck size={14} aria-hidden="true" /> {done}
        </p>
      ) : null}

      {ask ? (
        <div className="answer-request-card">
          <p className="answer-request-kicker">{label} request</p>
          <h3>
            {ask.fromName}
            {ask.fromHeadline ? <small> · {ask.fromHeadline}</small> : null}
          </h3>
          {ask.role ? (
            <div className="answer-request-role">
              <b>{ask.role.organization}</b>
              {ask.role.title ? <span>{ask.role.title}</span> : null}
              {ask.role.period ? <small>{ask.role.period}</small> : null}
            </div>
          ) : null}
          {ask.body ? <p className="answer-request-body">{ask.body}</p> : null}

          {ask.status !== "open" ? (
            <p className="answer-request-error">{MESSAGE["request-closed"]}</p>
          ) : (
            <>
              {worked ? (
                <label>
                  Your role there
                  <select value={roleId} onChange={(event) => setRoleId(event.target.value)} disabled={busy}>
                    <option value="">Choose a role…</option>
                    {ordered.map((role) => (
                      <option key={role.id} value={role.id}>
                        {[role.organization, role.title].filter(Boolean).join(" · ") || "Untitled"}
                        {suggested.includes(role.id) ? " (same company)" : ""}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <label>
                A note back (optional)
                <textarea rows={2} value={note} onChange={(event) => setNote(event.target.value)} maxLength={2000} disabled={busy} />
              </label>
              <label>
                Share your email with {ask.fromName.split(/\s+/)[0]} (optional)
                <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} disabled={busy} />
              </label>
              <div className="answer-request-actions">
                <button type="button" className="answer-request-ghost" onClick={() => void answer("declined")} disabled={busy}>
                  Decline
                </button>
                <button
                  type="button"
                  className="answer-request-primary"
                  onClick={() => void answer("approved")}
                  disabled={busy || (worked && !roleId)}
                >
                  {worked ? "Confirm both ways" : "Approve"}
                </button>
              </div>
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}
