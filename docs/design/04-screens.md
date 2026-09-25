# Stage 4 — Every screen in detail

**Status:** part 1 (shared states) proposed on 2026-09-25, waiting for review. Part 2 (screen by
screen) follows once part 1 is agreed.
**Builds on:** [stage 2, the app map](02-app-map.md) and [stage 3, the key journeys](03-journeys.md).
Drawings are on the canvas page "Stage 4 · States"; screen names below are the ones drawn there
and on "New direction".

Stage 2 drew every screen in its usual state, with work in it. This stage says what every
screen shows in every other state: while it loads, the first time, when there's nothing to do,
when something fails, and when the phone is offline. It is in two parts:

1. **Shared states** (this part). Most states look the same on every screen, so each is
   defined once here, drawn once, and then applies everywhere.
2. **Screen by screen** (next). For each screen: what it shows and the limits on its text,
   which shared states apply, any state of its own, and every action and where it goes.

A state is drawn only when its layout is different from anything already drawn (D54).
Everything else is described in words, against a drawing that already exists.

---

## Part 1. Shared states

### Loading

| Rule | Detail |
|---|---|
| Open on what the phone knows | Every screen opens at once on what was last stored on the phone, then updates in place. Most of the time there is no loading state to see |
| Grey shapes, only when nothing is stored | The first open on a new phone, or a screen never opened before, shows grey shapes in the layout of the real content (drawn: **Today, loading**). Never a spinner in the middle of a page |
| Not for quick loads | The shapes appear only if loading takes longer than 0.3 seconds, so fast loads don't flash |
| Handing off always works | The "Hand something off…" line works while anything else loads |
| Buttons show their own progress | A button that waits on the servers (test a key, try again) shows progress inside itself and can't be pressed twice |

The status chip next to the V says "Updating" while Today refreshes. Screen readers hear
"Loading your day" once, not every shape.

### Empty

There are two kinds of empty, and they are never confused.

| Kind | What it shows | Drawn |
|---|---|---|
| **First time**: nothing has happened here yet | One sentence on what will be here, and a way to start: suggestions to hand off, or the one step that's missing | **Jobs, first time**; **Today, before your AI is connected** |
| **All clear**: everything is done | A calm confirmation and what's coming up next, so the screen is still useful | **Today, all clear** |

Rules:

- An empty screen always offers something to do. It never shows a blank page.
- "All clear" is white, never blue: blue means something needs you (D27, D35).
- Lists inside a screen, such as "Waiting to send" or "Queued follow-ups", disappear when empty
  instead of showing an empty box.

### Errors

| Rule | Detail |
|---|---|
| Where it happened | The error replaces only the block that failed. The rest of the screen keeps working (drawn: **Search, part of it failed**) |
| Plain words | What happened, and what is still fine: "Files and memory didn't load. The search took too long. Jobs above are complete." Never an error code or technical message |
| One action | Usually Try again. Anything more (reconnect an account, replace a key) is a Needs you item, see below |
| Not red | The warning mark on a light block, in ink. Red keeps its one meaning: can't be undone |
| A reference for support | A short reference such as "Ref. S-4F2A" that support can look up. Nothing personal is in it |
| A full-page error only when nothing loads | For example, a job that has been deleted on another phone: "This job was deleted", with Back |

Short failures inside a job (a slow site, a dropped connection) are not shown at all. The job
retries up to 3 times, waiting longer each time, and only then says it couldn't finish (D50).

### Offline

| Rule | Detail |
|---|---|
| Say it once, where status lives | An "Offline" chip: next to the V on Today (in place of "On duty"), with the other chips at the top of other pages (drawn: **Today, offline**; **Signature, offline**) |
| Say how old it is | Times read "as of 09:12" while offline, so nobody mistakes old for current |
| Reading works | Everything stored on the phone can be read: jobs, results, files already opened, what needs you |
| New hand-offs wait on the phone | Something handed off while offline shows on Today as "Waiting to send · goes when you're online", and can be cancelled. It starts like any other hand-off when the phone is back |
| Anything that lets the agent act needs a connection | Signing, answering a question, taking control and changing settings are shown but turned off, with the reason in words: "Signing needs a connection. So you always sign what's current. It stays here until you're back." Nothing of this kind is ever queued (D53) |
| Work continues | Jobs keep running on the servers; Today catches up the moment the phone is back |

### When a job needs you to step in or fix something

Some problems stop work until you act. Each one is a Needs you item (blue, in the queue with the
others, D26) with the same layout:

1. What happened, in one sentence, naming the thing ("Your Anthropic key was declined").
2. What it affects: how many jobs are paused, and since when.
3. How to fix it, as a short list, most likely fix first.
4. Paused jobs carry on by themselves once it's fixed. Nothing is lost.

| Item | Drawn | Fixes offered |
|---|---|---|
| Key declined (no credit, revoked, rate-limited) | **Key declined** | Add credit at the provider (opens their site), replace the key, use another provider; then "Test the key again" |
| Monthly limit reached (D52) | **Monthly limit reached** | Raise the limit (by $10, $20, or another amount), or wait until the new month |
| An account needs signing in again | Not drawn: same layout as Key declined | Reconnect (the provider's sign-in page), or remove the account |
| A site needs a person (sign-in, code, "are you human") | **Needs you: take control** | Take control, later, or skip this site |

### Taking control (D49)

- The job asks first (**Needs you: take control**): which site, why, the three steps, and a
  switch to stay signed in for next time. It is on by default and the site is then listed in
  Saved logins (D38).
- While you're in control (**You're in control**), the browser has a blue frame and a
  "You're in control" chip. The agent is not watching or recording, so passwords and codes are
  never seen or kept.
- "Done, carry on" hands the browser back. After 10 minutes without a tap it goes back to the
  agent, which checks whether the sign-in worked and asks again if it didn't.
- "Skip this site" returns the job to the agent, to finish without that site or say it couldn't.
- The live browser's "Take control" goes to the same screen, for when you want to step in
  yourself.

### Couldn't finish (D50)

A job that can't finish gets its own page (**Couldn't finish**), with the chip "Couldn't finish"
in place of "Working":

- **Why**, in one sentence, with what it tried: "Their booking page was down all evening. I tried
  3 times; the last was at 21:40."
- **What I did get**: anything useful it found on the way.
- **What next**: Try another way (with a concrete suggestion), Tell me more, or Drop it (the job
  stays in Done under "Couldn't finish").

---

## Part 2. Screen by screen

Next, once part 1 is agreed. Every screen on the app map gets a table in this form, grouped as
on the app map (every day, find your work, you and settings, getting started, outside the app):

| Screen | Content and limits | Shared states | Its own states | Actions |
|---|---|---|---|---|
| *example: Today* | *The day in one sentence (up to 3 lines); Needs you shows the first item and up to 2 more as chips; up to 2 tiles; one idea* | *Loading, first time (before a key), all clear, offline* | *Updating; a waiting hand-off* | *Every tap and where it goes* |

New drawings are added only for states with a layout of their own.

---

## Decisions in this stage

| ID | Decision | Why |
|---|---|---|
| D54 | Stage 4 draws a state only when its layout is new; other states follow the shared patterns and are described in words | Every state is specified without dozens of near-identical drawings |
| D55 | Loading: open at once on what the phone last stored and update in place; grey shapes in the real layout only when nothing is stored, and only after 0.3 seconds; no page spinners; handing off always works | Feels instant; nothing jumps or flashes |
| D56 | Empty has two kinds: first time (what will be here, and a way to start) and all clear (a confirmation and what's coming up). Never blank, never blue | An empty screen should still help; blue keeps meaning "needs you" |
| D57 | Errors replace only the block that failed, in plain words, with one action and a support reference; never red, never codes; a full-page error only when nothing can load | Keeps the rest of the screen useful; red keeps its one meaning |
| D58 | Offline: an "Offline" chip and "as of" times; reading works; new hand-offs wait on the phone and can be cancelled; signing, answering, taking control and settings need a connection and are never queued | Refines D53. Anything that lets the agent act must be about current content |
| D59 | Problems that stop work (key declined, limit reached, an account needs signing in again, a site needs a person) are Needs you items with one layout: what happened, what's paused, how to fix it; paused jobs carry on by themselves once fixed | One pattern to learn; nothing is lost while it waits |
| D60 | Taking control: the job asks first; "Stay signed in" is on by default; a blue frame while you're in control; the agent doesn't watch or record; "Done, carry on", or back to the agent after 10 idle minutes; "Skip this site" | Detail for D49 |
| D61 | A job that couldn't finish has its own page: why (with what it tried), what it did get, and what next: try another way, tell me more, or drop it | Detail for D50; an honest ending that is still useful |

## Open questions for later stages

| Question | Answered in |
|---|---|
| Exact skeleton colours and motion, and the dark appearance of every state | Stage 5 |
| How much is stored on the phone for offline reading, and for how long | Stage 6 |
| How support references map to server logs without holding personal data | Stage 6 |
