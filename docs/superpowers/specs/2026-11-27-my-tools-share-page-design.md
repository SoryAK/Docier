# My Tools: share pages

A page about your tools to send someone, as a file: an employer or recruiter,
or a crew. Hosted share links through the relay come later and reuse these
rules.

## What each page shows

- **Employer or recruiter:** each tool's name, maker · model, category (when
  not Tool), how well you use it, the jobs it was used on, and its cover photo.
- **Crew:** name, maker · model, condition, whose it is, the kits it's in, and
  its cover photo.
- **Never, for either:** serial numbers, what you paid, what it's worth, where
  it's kept, notes, and drafts still marked "Needs details".
- **At the top:** "Tools", your name and headline from your profile (unless you
  leave your name off), and the month, e.g. "Nov 2026".

## Where and how

- **Share** beside Export CSV. It shares the tools shown (pick a kit first to
  share a kit), or the picked tools while picking.
- A dialog: who it's for, "Put my name on it", a preview, **Download page**
  (one HTML file, `my-tools-for-employers.html` / `my-tools-for-crew.html`,
  photos built in) and **Print or save as PDF**.
- Photos are shrunk to card size (at most 640px wide) in the browser before
  they go in, so the file stays small; a photo that can't be shrunk goes in as is.

## Approaches

- A file (chosen) vs. a relay-hosted link (later; needs a relay) vs. served
  from this computer (rejected: only while it's on, and against ADR-0002).
- Page built in the browser from `core` rules (chosen: the browser can shrink
  photos; there's no image library on the server) vs. a server route.
