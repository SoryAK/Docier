# Tools and photos on the career page

## Why

The career page already goes out through the relay. People want the tools
they choose to show there too, beside the jobs they used them on. And the
role photos they upload never reach the page: their addresses point back at
this computer, which the relay can't reach.

## What it does

- Each tool gets **Show on my career page** (off by default). It's a field
  of the tool, so it's in the add and edit forms alike, and the bulk bar can
  set it for many tools at once. Drafts never show, even when switched on.
- Publish settings get a **Tools** section. It's in the defaults for a new
  page; a page saved before this keeps its sections until the owner turns
  Tools on. A link (grant) that doesn't open Tools doesn't show them.
- The page shows a **Tools** section (cover photo, name, maker and model,
  kind, how well I use it, used at), and under each job, the names of the
  shown tools used there. Only the employer facts go out: never serial,
  paid, worth, where it's kept, notes, tags, condition, kits or when it was
  got.
- **Photos are embedded**: role photos marked public and the cover of each
  shown tool. The browser frames, shrinks (640px wide) and re-encodes each
  as JPEG on white, which drops what the file carried (like where it was
  taken), and sends them with the publish request.
- **The server checks** before anything goes out. It takes only
  `data:image/jpeg;base64,…`, at most 400,000 characters each and 8,000,000
  in all (the relay takes 10 MB). Too much in all is refused with a plain
  message. A photo goes only on an item already in the page; anything else
  sent is ignored.
- **Never sent**: an address pointing back to this computer, or an original
  photo file. A photo that wasn't prepared is left off. Web links (http,
  https) the owner added as role photos stay as they are.
- **The preview** prepares photos the same way and shows the result, so
  what's previewed is what publishes.
- The relay draws only `data:image/jpeg` or `https`/`http` images, for old
  pages too.
- "Changed since publish" notices a tool switched on or off, or edited
  while shown.

## Approaches

1. **Browser prepares photos, server checks (chosen).** Uses what the share
   pages already do; no new dependency. Publishing without the app open
   leaves local photos off.
2. Server image library. Works without the app, but a native dependency to
   install and keep working everywhere, for a case that doesn't happen.
3. Relay file storage. A second store to keep in step with revoke and
   remove; the relay stays projection-only per ADR-0002.

## Calls made

- Prepared photos live only in the stored projection (one row per page),
  not in every saved snapshot, so the vault doesn't grow a copy per publish.
- Old snapshots have no `tools`; everything reads `tools ?? []`.
- The fingerprint only counts tools when some are shown, so pages
  published before this aren't marked changed.
- "Used at" names come from the page's own roles, so a stealth or
  anonymous page shows its redacted names.
