# The January release: concept

**Target:** end of January 2027.
**Status:** agreed in conversation on 2026-11-27. Each project below gets its
own design and plan before it is built.

## The idea

A resume lists jobs. Docier shows a career: where you worked and travelled,
what you accomplished, the proof, and the stories behind it. You share it as
a page people can explore.

What resumes have always missed is **external impact**: a problem the outside
world could see, what you did about it, and how the world responded. Some
examples:

- A product designer fixes a hinge that was cracking screens. Reviews of the
  broken hinge show the problem was real. Later reviews, customer feedback and
  product demonstrations show the fix worked.
- A teacher protected her students during a school shooting. News coverage
  shows what happened, and parents' letters or a news story about her show
  her part.
- A security engineer helped contain a major cyber attack. Coverage shows how
  serious the attack was, and the outcome shows what their response achieved.

Outside sources do two jobs. Some prove **the problem was real and mattered**,
even when they never name the person. Others prove **the person's part**. A
good story usually has both.

## Who it is for

Early testers who can run their own relay. Sharing is self-hosted for this
release and is the testing ground for a hosted relay later. Setting up the
relay and seeing whether it is online have to be solid. Other parts can still
have rough edges.

## The journey

1. **Bring in your material.** Resumes and onboarding documents come from My
   Docs, and photos come from Gallery. Fresh uploads land there too.
2. **Get a full career history.** Docier reads every resume, compares what it
   finds with the history you already have, and lets you review and merge the
   results job by job.
3. **Preview your career page.** It already works with nothing more than your
   imported history.
4. **Enrich it at your own pace.** Add places and travel, accomplishments,
   evidence, photos and tools. Gentle nudges suggest a next step for each job.
5. **Work toward stories.** Sketch a story on a job's Canvas, then finish it
   as an impact story.
6. **Share it** from your own relay.

## Decisions

- **History leads the career page.** The timeline and map come first, and
  stories sit inside the jobs they belong to. Most people need time to write
  stories well, so a page that led with stories would often look empty and
  discourage them. Stories are the wow factor people work toward. Once one
  exists, the strongest can be featured at the top.
- **Empty sections are never shown publicly,** and nudges never block
  anything.
- **The Canvas is the workbench.** It is a place to gather material and sketch
  a story freely, and it will change a lot. The finished, professional piece
  is a structured impact story. The Canvas will not be published in this
  release.
- **Publish asks before a story goes public.** The first time a story goes
  on the career page, or after it changes, publishing stops on it once. The
  owner confirms three things: nothing is under an NDA or confidential to an
  employer, no one can be identified without consent (children especially),
  and the sources are public. They can confirm it or leave the story off.
  Docier asks; it does not judge the content.
- **Sources are marked as outside material.** A source shows its title, outlet,
  date, a short quote the owner picked, and a link to the original. It is
  never presented as the owner's own claim. Stories reuse Linked Evidence,
  which already captures a public link privately, records what the owner
  did, and records whether the source names them or is about work they
  contributed to.
- **Numbers and before-and-after photos** belong in a story's result, as the
  usual measures.

## What is in the release

In: Home, Career History, My Network, My Tools, My Docs, Gallery, Canvas,
the assistant panel and Chat, the career page and relay.

Hidden for now (out of the sidebar, not deleted): Opportunities, Resume
Studio.

## Projects, in order

1. **Clear the deck.** Merge the waiting My Tools and career page pull
   requests into main, and hide Opportunities and Resume Studio.
2. **My Docs and Gallery as sources for your history.** Make the path from
   documents and photos to a reviewed history, and then a preview of the
   page, work end to end. Much of it exists, so this is mostly checking and
   smoothing. It is the core of the release.
3. **Impact stories.** Covers the record (problem, what I did, result, and
   sources for the problem and for the response, tied to one or more jobs),
   how stories show inside jobs on the career page, and the check at
   publish.
4. **Board to story.** "Make a story from this board" carries Canvas cards
   into a story draft: Page and Event cards become sources, and Photo cards
   become before-and-after photos.
5. **Nudges.** A gentle next step for each job.
6. **Ready for testers.** A relay setup guide and a clear offline status,
   plus the tour and welcome card review every release starts with
   (docs/release.md).

If time runs short, 4 and 5 are cut first. The release still holds together
without them.

## Later

- A hosted relay that people publish to directly.
- An optional "Explore the board" on a published story.
- Opportunities and Resume Studio back in the sidebar.
