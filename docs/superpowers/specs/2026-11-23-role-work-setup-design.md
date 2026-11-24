# Role work setup

Batch 1 of bringing back the role details the earlier app kept. The later
batches are pay and benefits, equipment and gear, and reflection.

## Why

A role is more than a title and dates. How the work was set up (the schedule,
the shifts, who you reported to, the team, what you learned, and when you were
promoted) is what people forget first and what resumes and interviews ask for.

## Decided

- Batch 1 is the work setup.
- Everything is private by default. Schedule, team, and growth each have their
  own "Show on my page" switch. The name of the person you reported to is never
  published.
- It shows on the role's Overview as a section. Changing it happens in the
  role's settings: a dialog laid out like Settings, with a rail of panels.
  Under Role are Basics, About, and Achievements, and under Work setup are
  Schedule, Shifts, Team, and Growth. One Save covers everything changed.
  School roles have no Work setup panels. Later batches add their own groups
  to the rail.

## Approaches

- **Sections on Overview (picked).** Each batch is one section, with a short
  summary when it is closed and a popout to change it.
- **New tabs.** Rejected: the role view moved away from long tab lists.
- **All in Edit role.** Rejected: that form is already long.

## What a role gains

Stored in the role's existing details (`work_history_details.details_json`),
which already hold the work mode, hours per week, a shift note, skills, growth
notes, and the share switches. Those fields are reused, not duplicated.

| Group | Field | New or existing |
|---|---|---|
| Schedule | Type: full-time, part-time, contract, temporary, seasonal, or freelance | new |
| | Work mode: on site, hybrid, or remote | existing |
| | Days on site a week (hybrid only) | new |
| | Hours a week | existing |
| | Schedule notes, e.g. "Overnight, every other weekend" | existing (`shift`) |
| Shifts | Named shifts, each with a start and end time; an end before the start means overnight | new |
| Team | Reported to (a name; suggestions from the role's people) | new |
| | Department | new |
| | Team size | new |
| Growth | Skills used | existing (`skills`) |
| | Skills gained | new |
| | Promotions: a title and a month | new |
| | Growth notes | existing (`growth`) |

Shifts and promotions can each be added, changed, and removed. The same form
adds and changes them.

## Where it shows

- **Overview:** a "Work setup" section. When it's closed, it shows one line,
  e.g. "Full-time · Hybrid, 3 days on site · 40 h/week · Reports to Dana Kim".
  When it's open, it shows the four groups. With nothing set, it shows one line
  inviting you to add it.
- **History:** each promotion appears in its month as "Promoted to {title}".
- **Published page:** the schedule (when shared, which already happens),
  plus the department and team size (when Team is shared), plus the promotions
  and skills gained (when Growth is shared).

## Rules for the builder

- Checking the inputs lives in `core/` (a new `core/role-work-setup.ts`). The
  server only stores the result.
- Saving the older map panel's details form must not wipe the new fields. Today
  it rebuilds `schedule` from scratch, so it has to merge into the current
  values instead.
- Times are "HH:MM" in 24 hours; promotion months are "YYYY-MM"; team size is a
  whole number from 1 to 100000; days on site run from 1 to 7.
