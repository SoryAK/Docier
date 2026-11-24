# Role gear and looking back

Batches 3 and 4 of bringing back the role details the earlier app kept. They
follow the work setup and pay batches: a section on the role's Overview,
changed in the role's settings, recorded in Edits, and private unless shared.

## Gear (batch 3)

| Panel | Fields |
|---|---|
| Equipment | Each piece: name; given to me, or worked on (like a machine you serviced); kind (tool, machine, vehicle, computer, software, safety gear, other); maker, model, serial, asset tag; from and until months; notes |
| Uniform | Each item: what it is, color, and who provided it; plus notes |

- Equipment saved before items existed, as names alone, shows as items to fill in.
- The older map panel still saves names; matching items keep their details and new names become items.
- **On my page:** equipment names only, when shared. Serials, asset tags, and notes never. The uniform (items, then notes), when shared.

## Looking back (batch 4)

| Panel | Fields |
|---|---|
| Rating | Overall, then culture, growth, pay, work-life balance, and management, 1 to 5 stars |
| Leaving | Why you left (a better offer, room to grow, moved, laid off, contract ended, the culture, school, personal, something else), would you go back (yes, maybe, no), and why in your words |
| Commute & place | How you got there, minutes and miles one way, and the work environment |

- **On my page:** the overall rating, why you left in your words, and the work environment, each when shared. The area ratings, the reason, whether you'd go back, and the commute never.

## Where it shows

- Overview: "Equipment & gear" and "Looking back" sections under Pay & benefits, each one line when closed.
- Role settings: a "Gear" group (Equipment, Uniform) and a "Looking back" group (Rating, Leaving, Commute & place). School roles don't have them.

Checking the inputs lives in `core/role-gear.ts` and `core/role-reflection.ts`.
