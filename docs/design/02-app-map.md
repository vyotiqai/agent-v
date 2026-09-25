# Stage 2 — App map

**Status:** agreed on 2026-09-25. Every screen is drawn in the agreed visual direction (D34).
**Mockups:** [Agent V — App map](https://claude.ai/artifact/7Y2irrycwGs5zc2bZ1oEf9), a canvas
at phone size. The page **"New direction"** is current. It has five rows: every day; finding
your work, goals and ideas; you and settings; getting started; and menus and surfaces outside the
app (the job menu, the spend signature, lock-screen notifications, sharing into Agent V). The
Ledger pages are kept as history. Press Play on a screen to click through.

This stage lists every screen in the app and how you move between them. What each screen
contains in every state (empty, loading, error, offline) is stage 4; the full design system is
stage 5.

## Review history

**2026-09-25, first draft rejected.** The look of the first mockups followed the reference images
too closely (a dark top with a grey-and-white sentence, a floating pill toolbar, document-style
cards). Agent V must have its own, original look. The references only describe qualities to aim
for: calm, typographic, premium, uncluttered. Kept on the canvas page "First draft (rejected
look)".

**2026-09-25, three original directions.** Kept on the canvas page "Visual directions":

| Direction | Idea | How you approve |
|---|---|---|
| **A · Ledger** | A trusted chief of staff's daily memo: an editorial page with numbered items | Press and hold to sign |
| B · Shift | Time as the backbone: a live timeline with a NOW line, graphite dark | Slide to send |
| C · Desk | Clear your desk: decisions as a stack, running jobs as tiles with progress rings | Review, then send and go to the next |

**2026-09-25, Ledger chosen.** The user asked to continue refining without picking, having
delegated earlier choices to the recommendation, so the recommended direction, Ledger, was taken
forward (D23). Every screen was redrawn in it, and the gaps in the first draft were filled: a
question from the agent, a filed result, and a working hold-to-sign.

**2026-09-25, rebalanced.** Feedback: the Ledger screens were a little text-heavy; the look
should be balanced. The owner shared new reference images (kept, with notes, in
[references/](references/README.md)). Their ideas, not their looks, were brought into Ledger:
numbers as anchors, blocks with rhythm, icons in place of labels, round icon buttons, a
full-screen voice page and a warm night appearance (D28–D33, proposed). Six screens are drawn
on the page "Rebalanced (proposal)": Today, Today at night, Hand something off, Speaking to
Agent V, the Job page and For your signature. Two earlier slips against D27 were fixed on the
way: the voice button and the step in progress were blue. They are now ink, because blue only
means waiting on you.

**2026-09-25, rebalanced Ledger rejected; Ledger dropped.** Feedback: "not clean, not
structured, and not as good as the references." The cause: Ledger's paper and serif, with
blocks, chips and icons added on top, made the screens busier rather than cleaner. The owner
chose, when asked:
- drop the Ledger look and start a clean, modern one;
- a mix: dark top areas with light content areas;
- all four groups of references are close to what they want (stat blocks, voice and AI, glow
  screens, day summary);
- see two screens first, checked visually before review.

The first screens of the new direction were drawn and agreed the same day (D34), and the rest of
the everyday flow followed (D35). Sections 1 and 4 below still
describe Ledger; they are rewritten once the new direction is agreed. Screens, navigation and
signing (sections 2 and 3, D18, D20–D22, D24–D26) do not depend on the look and stand.

## 1. Ledger at a glance (replaced by D34)

- **Paper and ink.** Warm paper, near-black ink, fine rules between items. No shadows and no
  floating chrome. Flat paper-tone blocks group things (D29).
- **Glance first, read second.** Each main screen leads with numbers, marks or small pictures.
  Full sentences are kept for what the agent writes: its drafts, answers and reports (D28).
- **Two voices in type.** A serif (Newsreader) for what the agent says and for content; a clean
  sans (Instrument Sans) for controls, labels and data. Small letter-spaced labels head each
  section: WAITING ON YOU, ON MY DESK, FILED THIS MORNING.
- **Colour means something, and only one thing each.**
  - Signature blue: waiting on you. Nothing else is blue.
  - Deep red: can't be undone, and sign out.
  - Green: a working connection (for example a valid API key).
- **Numbered items.** Everything waiting on you is numbered and counted (1 of 3), so you always
  know how much is left.
- **Signing.** Approvals are signatures: press and hold the Sign button. One gesture, but a
  deliberate one. Things that can't be undone add Face ID (fingerprint or PIN on Android).

The exact colours, sizes and spacing are settled in stage 5.

## 2. How you move around

- **No tab bar.** Every main screen ends with a **"Hand something off…"** line, with a +
  (attach) and a voice button, because handing work off is the main action.
- **Speaking** opens a full page (D31): your words in large type as you speak, a live voice
  level, and three buttons: Type, Hand it off, Cancel.
- **The top of Today.** The V mark at the top left always returns to **Today** (the home
  screen). Search, Jobs and your initial (You) sit at the top right.
- **Decisions are pages, in order.** Opening something waiting on you shows it full screen with
  its place in the queue (1 of 3). After signing or answering, "Next" takes you to the following
  one, so clearing everything is a single pass. Closing never approves anything.
- **Things are pages too.** A job, a result, a file and the live browser open with a back
  button. Each ends with "Ask about this, or change it…" so follow-ups stay with the job. While
  a job is working, follow-ups wait in a visible queue on the job page (D42).
- **Ideas** appear on Today, one at a time, when Agent V has one worth your attention; all of them
  are in Ideas (D36). **Goals** and the **agent's computer** are tabs in Jobs (D37, D39).
- **Every notification opens exactly what it is about.** Signatures for acting as you, and
  answers with fixed choices, can be given straight from the notification. Anything that can't
  be undone always opens the app.
- **Sharing into Agent V:** a link, file or photo shared from any other app opens "Hand
  something off" with it attached.

## 3. Every screen

Screens marked ◆ are drawn in the new direction (D34). Not drawn, because they reuse drawn
screens: Add provider (the getting-started steps again). Appearance and Help and feedback were
drawn in stage 4. A full dark appearance is designed in stage 5. Screens marked ✚ were added on
2026-09-25 after comparing Agent V with OpenMuse (D36–D43).

### Getting started

| Screen | Purpose |
|---|---|
| ◆ Welcome | "Hand it off." What Agent V does in one sentence; sign-in choices |
| ◆ Sign in / create account | Methods decided in stage 3. *Since D100 (stage 6): Apple or Google, through the phone's own sign-in sheet, so there is no screen of our own* |
| ◆ Connect your AI | Pick a provider: Anthropic, OpenAI, Google, or any OpenAI-compatible address |
| ◆ Get a key | A short guide per provider, with a button to the provider's key page |
| ◆ Paste and test key | The key is tested with a real call before continuing |
| ◆ Choose models | Suggested models for jobs and for quick steps, changeable later |
| ◆ Connect accounts | Optional: Gmail, Outlook, Google Calendar, Outlook Calendar. *At launch: Outlook mail, Outlook Calendar and Google Calendar ([D121](07-build-plan.md#decisions-in-this-stage))* |
| ◆ Notifications | Why they matter (signatures), then the system permission prompt |
| ◆ Ready | A first suggested job, based on what was connected |

### Every day

| Screen | Purpose |
|---|---|
| ◆ Today | Your day in one sentence; what needs you; what is running; an idea when there is one |
| ◆ Hand something off | Type or speak; attach a photo, file or link; suggestion cards |
| ◆ Speaking to Agent V | Full-page voice: your words as you speak, a live level, Type, Hand it off or Cancel |
| ◆ Before I start | Only when it matters (D2): the plan, which steps need your signature, Start or Change |
| ◆ Job page | Goal, the plan with live progress, the record of what was done, the result; follow-up line with its queue |
| ◆ Job menu | Pause, stop, change how it repeats, rename, add to a goal, share the result, archive, delete |
| ◆✚ Replay | A finished job step by step from its record, with what the agent saw at each step |
| ◆✚ An idea | What it suggests, why, and the evidence; Do it (becomes a job), Change, or Not now |
| ◆ A question | The agent's question with its reason, fixed choices, or an answer by voice |
| ◆ For your signature | The exact message or action; hold to sign; edit or decline |
| ◆ Spend | The exact amount and what it buys; hold to sign, then Face ID. Not used until spending arrives |
| ◆ Can't be undone | What will be lost; hold, then Face ID |
| ◆ Live browser | The agent's browser, live, with where it's pointing; Take control |
| ◆ A filed result | A finished report; share or save as PDF; follow up |
| ◆✚ Spending summary | A filed result from an imported statement: totals by category, recurring charges, a savings goal |
| ◆✚ A watch | A watch's own page: the value now, the last 30 days as a chart with the alert line, recent checks. *Added in stage 4 (D67)* |

### Find your work

| Screen | Purpose |
|---|---|
| ◆ Jobs | Tabs: Active (needs you, working, next up, repeating), Goals, Done (including Couldn't finish and Archived), Computer |
| ◆✚ Ideas | Every open idea, and the ones you set aside |
| ◆✚ Goal | A goal's milestones and target date, the jobs under it, overall progress, suggested next jobs |
| ◆✚ Computer | The agent's own cloud computer: its files (open, edit, share) and the record of commands it ran |
| ◆ Search | One search across jobs, files and what it remembers, with filters; forget a memory in place |

### You and settings

| Screen | Purpose |
|---|---|
| ◆ You | Hub for everything below |
| ◆✚ Profile and tone | Your name and photo; how it writes for you: brief, warm, formal, or in your own words |
| ◆✚ Saved logins | Sites the cloud browser stays signed in to; when each was last used; remove any |
| ◆ Your AI | The provider and key status, models per role, other providers, this month's usage and limit |
| Add provider | The same steps as getting started: guide, paste, test, models |
| ◆ Connected accounts | Each account, what it may access, reconnect, remove |
| ◆ What needs your signature | The five action levels, their settings, learned exceptions (each can be undone), hard limits |
| ◆ What I remember | Everything it remembers and where it learned it; edit, forget, or turn learning off |
| ◆ Morning briefing | Time, days, and what it includes |
| ◆ Notifications | What may interrupt you; signatures and questions are always on |
| ◆ Privacy and your data | Export everything; delete the account (required by both stores) |
| ◆ Appearance | Automatic, light or dark. *Drawn in stage 4* |
| ◆ Help and feedback | Guides, contact, report a problem. *Drawn in stage 4* |

### Outside the app

| Surface | Purpose |
|---|---|
| ◆ Notifications | Signatures (sign from the notification), questions with fixed answers, can't-undo requests (open the app), the briefing, finished jobs, key problems |
| ◆ Share into Agent V | Start a job from a link, file or photo in any app |

**Later (not at launch):** home-screen widgets, iPhone Live Activities for running jobs, Siri
and Android assistant shortcuts, tablet layouts.

## 4. Accessibility of signing

Press and hold must never be the only way:

- VoiceOver and TalkBack users sign with the platform's standard "double-tap and hold" gesture.
- Keyboard and switch users hold Enter or Space.
- A setting, "Sign with a single tap and a confirmation", replaces holding for anyone who
  prefers it.

The hold lasts under a second, fills visibly while held, and cancels if released early.

## 5. Decisions in this stage

| ID | Decision | Why |
|---|---|---|
| D17 | ~~Toolbar: Home, Jobs, Search, and +~~ Replaced by D24 | Came from the rejected first look |
| D18 | You (settings) opens from your initial at the top, not from a tab | Settings are rare |
| D19 | ~~Decisions are sheets~~ Replaced by D26 | Came from the rejected first look |
| D20 | Files live as a tab in Jobs, and in Search | Every file belongs to a job; one less place to learn |
| D21 | Sharing into Agent V from other apps is available at launch | Starting from the thing itself is the fastest way to hand work off |
| D22 | Widgets, Live Activities, assistant shortcuts and tablets come later | Focus; each is added once the core is solid |
| D23 | ~~The visual direction is Ledger~~ Replaced by D34. It was: editorial, paper and ink, serif content with a sans for controls | Original, calm and premium; its signing idea matches the approval rules (stage 1, section 6) |
| D24 | No tab bar: a "Hand something off…" line at the bottom of main screens; the masthead holds Today, Search, Jobs and You | Handing work off is the main action; fewer controls on screen |
| D25 | Approvals are signatures: press and hold to sign; can't-undo adds Face ID or fingerprint; accessible alternatives in section 4 | Deliberate without being slow; one gesture across the app |
| D26 | Everything waiting on you opens as a full page, numbered in a queue (1 of 3) with Next | Clearing decisions becomes one pass; nothing gets lost behind a sheet |
| D27 | Colour carries meaning: blue only for "waiting on you", deep red only for "can't be undone" and sign out, green only for a working connection | People learn what matters at a glance |
| D28 | *Rejected with the rebalanced Ledger (2026-09-25).* Glance first: each main screen leads with numbers, marks or small pictures (Today's tally, a job's 3/5, a price chart, a picture of what the agent saw). Sentences are for what the agent writes | Owner feedback: too text-heavy. People should understand a screen in a second |
| D29 | *Rejected with the rebalanced Ledger (2026-09-25).* Flat paper-tone blocks, with no shadows, group related things. At most one coloured block per screen, and its colour keeps its D27 meaning | Rhythm without clutter; colour still means one thing |
| D30 | *Rejected with the rebalanced Ledger (2026-09-25).* Every item carries a mark for its kind (email, question, web, watch, file) and fits on one line. A second line appears only for risk, such as "Can't be undone" | Marks replace words; risk is never hidden |
| D31 | *Rejected with the rebalanced Ledger (2026-09-25).* Speaking is a full page, always in the night palette: your words large, older words fading, a live voice level drawn as fine rules | Voice is a main way to hand work off, so it gets a proper screen |
| D32 | *Rejected with the rebalanced Ledger (2026-09-25).* Night appearance: warm ink with a soft desk-lamp light at the top of main screens. Blue, red and green keep their meanings; the lamp is never used on controls | Dark mode is already in settings. This makes it feel crafted and warm, not just inverted |
| D33 | *Rejected with the rebalanced Ledger (2026-09-25).* Secondary actions are round icon buttons with a short label under them; the one primary action stays a full-width button | Fewer words, bigger targets, a clear main action |
| D34 | *Agreed 2026-09-25.* New visual direction: one modern sans (Geist), near-black and warm white, one strong blue. Main screens pair a dark top (your day in one sentence, with the key numbers in white) with a light area of a few large rounded blocks. Speaking and handing off are dark, full-screen, with a soft blue light. Blue keeps D27's meaning: it marks what needs you | The owner's choice after the Ledger rounds: clean, structured and modern, drawing on all four groups of references |
| D35 | Refines D27. Blue marks what needs you **and** the agent itself: the microphone, the voice orb, and where it points in the live browser. Red stays only for what can't be undone; green only for a working connection | The agent's presence and your decisions are the two things to notice; a live "recording" dot is blue, not red, so red keeps its single meaning |
| D36 | *Scope, 2026-09-25.* **Ideas.** Agent V suggests jobs on its own, each with why and the evidence. You do it (it becomes a job), change it, or set it aside; it learns from what you set aside. It never acts on an idea without you | Comparison with OpenMuse; an agent that works 24/7 should also notice what's worth doing |
| D37 | *Scope.* **Goals.** A goal has milestones and a target date; jobs can belong to it and its progress rolls up from them; ideas can suggest its next jobs | Longer aims, like saving for something or a job search, need more than single jobs |
| D38 | *Scope.* **Saved logins.** The cloud browser keeps a private, encrypted profile per person. You sign in to a site once through Take control, and it stays signed in. Passwords and two-step codes are always typed by you; each saved site is listed in settings and can be removed. Using a login still follows the action levels | Real tasks happen on sites that need you signed in |
| D39 | *Scope. Changed by [D102](06-technical-design.md#decisions-in-this-stage-part-1) (stage 6, 2026-09-25): the computer runs in the person's own AI provider's code sandbox, on their key, and its files are kept by Agent V; the rest stands.* **The agent's computer**, moved up from "later": a private cloud computer per person with a terminal and workspace files, for data, spreadsheets and scripts. You can open its files and see every command it ran. It is isolated from Agent V's own systems; its fair-use limits (time, storage) are ours to set in stage 6 | Much real work is data work; keys cover the AI, but this compute is Agent V's cost |
| D40 | *Scope.* **Spending summary.** Import a bank or card statement (CSV or PDF) to get totals by category, recurring charges and a savings goal (D37). Read-only: no bank connection and no payments at launch. Statements are kept like other documents, encrypted and deletable | Useful money help without the risk and regulation of connecting to banks |
| D41 | Jobs can be renamed, archived and restored; a finished job can be replayed step by step | Keeps Jobs tidy without losing anything; replay builds trust |
| D42 | Follow-ups sent while a job runs wait in a visible queue on the job page, are taken in order, and can be edited or removed before they're picked up | You can keep talking to a busy agent without interrupting it |
| D43 | You set your name, photo, and the tone it writes in for you (brief, warm, formal, or described in your own words) | Drafts should sound like you |

A web app was considered in the same comparison and not added; phones stay first (D15).
