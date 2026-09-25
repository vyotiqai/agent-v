# Stage 2 — App map

**Status:** proposed on 2026-09-25, waiting for review.
**Mockups:** [Agent V — App map](https://claude.ai/artifact/7Y2irrycwGs5zc2bZ1oEf9), a canvas
at phone size. Press Play on a screen to click through.

## Review feedback, 2026-09-25

The look of the first mockups was rejected: it followed the reference images too closely (dark
top with a grey-and-white sentence, a floating pill toolbar, document-style cards). **Agent V must
have its own, original look.** The references only describe qualities to aim for: calm,
typographic, premium, uncluttered.

The first mockups are kept on the canvas page "First draft (rejected look)" as a record of the
screen structure only. Three original visual directions are on the page "Visual directions",
each drawn as Home and an approval:

| Direction | Idea | Type and colour | How you approve | Navigation |
|---|---|---|---|---|
| **A · Ledger** | A trusted chief of staff's daily memo: an editorial page with numbered items | Serif headlines (Newsreader) over a clean sans (Instrument Sans); warm paper, ink, one fountain-pen blue for what needs you | "Sign": press and hold to sign and send | No tab bar: a "Hand something off…" line always at the bottom; jobs and search at the top |
| **B · Shift** | The agent works around the clock, so time is the backbone: a live timeline with a NOW line | IBM Plex Sans and Plex Mono; graphite dark with one bright signal colour | Slide to send | Tabs at the top (Timeline, Jobs, Search) and a "New job" button |
| **C · Desk** | Clear your desk: decisions come as a stack you work through one by one; running jobs as tiles with progress rings | Bricolage Grotesque headlines over Instrument Sans; cool light grey, white cards, cobalt | Review, then "Send and go to the next" | A classic bottom bar (Desk, Jobs, Search, You) with a raised New job button |

The chosen direction (or a mix) is recorded as a decision here, and the rest of the app map is
redrawn in it before stage 3. The screen list and navigation rules below stay under review; the
toolbar decision (D17) depends on the direction chosen.

This stage lists every screen in the app and how you move between them. What each screen
contains in every state (empty, loading, error, offline) is stage 4.

## 1. How you move around

- **Floating toolbar** on the three main screens: **Home**, **Jobs**, **Search**, and a
  distinct **+** that opens Ask. It floats above the content, in the style of the references.
- **You** (settings) opens from your initial at the top right of Home. It is visited rarely,
  so it doesn't take a toolbar slot.
- **Sheets for decisions.** Approvals, questions and Ask open as sheets over whatever you are
  looking at, so you never lose your place. Dismissing a sheet never approves anything.
- **Pages for things.** A job, a result, a file and the live browser open as full pages with a
  back button.
- **Every notification opens exactly what it is about:** the approval sheet, the question, or
  the job's result. Links into the app work the same way.
- **Sharing into Agent V:** a link, file or photo shared from any other app opens Ask with it
  attached, and becomes a new job.

## 2. Every screen

Screens marked ◆ are drawn on the canvas.

### Getting started

| Screen | Purpose |
|---|---|
| ◆ Welcome | What Agent V is in one line; sign-in choices |
| Sign in / create account | Methods decided in stage 3 |
| ◆ Connect your AI | Pick a provider (Anthropic, OpenAI, Google, or any OpenAI-compatible address) |
| Get a key | A short illustrated guide per provider, with a button to the provider's key page |
| Paste and test key | The key is tested with a real call before continuing |
| Choose models | Suggested models for jobs and for quick steps, changeable later |
| Connect accounts | Optional: Gmail, Outlook, Google Calendar, Outlook Calendar |
| Notifications | Why they matter (approvals), then the system permission prompt |
| Ready | A first suggested job, based on what was connected |

### Every day

| Screen | Purpose |
|---|---|
| ◆ Home | Briefing on top; Needs you, In progress and Done below |
| ◆ Ask (sheet) | Type or speak; attach a photo, file or link; suggestions |
| ◆ Plan first | Shown only when it matters (decision D2): the plan and why it's asking, with Start or Change |
| ◆ Job page | Goal, plan with live progress, what it did with proof, result; follow-up bar at the bottom |
| Job menu | Pause, stop, change how it repeats, share the result, delete |
| ◆ Approval: acts as you (sheet) | The exact message or action; Send, Edit, Don't send |
| Approval: spend (sheet) | The exact amount and what it buys; confirm with Face ID or fingerprint. Not used until spending arrives |
| ◆ Approval: can't undo (sheet) | What will be lost; confirm with Face ID or fingerprint |
| Question (sheet) | The agent's question, with quick answers and a free answer by text or voice |
| ◆ Live browser | Watch the agent's browser live; Take control to log in or fix something |
| Result viewer | A finished report, document or file, with share and save |

### Find your work

| Screen | Purpose |
|---|---|
| ◆ Jobs | Tabs: Active (Needs you, Working, Coming up), Repeating, Done (including Couldn't finish), Files |
| ◆ Search | One search across jobs, results, files and what it remembers, with filters |

### You and settings

| Screen | Purpose |
|---|---|
| ◆ You | Hub for everything below |
| ◆ Your AI | Providers and keys, models per role, this month's usage and the monthly limit |
| Add provider | The same steps as getting started: guide, paste, test, models |
| Connected accounts | Each account, what it may access, reconnect, remove |
| ◆ Approval rules | The five levels, their settings, and the rules it has learned (each can be undone) |
| What I remember | Everything it remembers, with where it learned it; edit, delete, or turn learning off |
| Morning briefing | Time, days, and what it includes |
| Notifications | What may interrupt you; approvals and questions are always on |
| Privacy and your data | Export everything; delete the account (required by both stores) |
| Appearance | Automatic, light or dark |
| Help and feedback | Guides, contact, report a problem |

### Outside the app

| Surface | Purpose |
|---|---|
| ◆ Notifications | Approvals (acts as you: approve from the notification), can't-undo requests (open the app), briefing, finished jobs, key problems |
| Share into Agent V | Start a job from a link, file or photo in any app |

**Later (not at launch):** home-screen widgets, iPhone Live Activities for running jobs, Siri
and Android assistant shortcuts, tablet layouts.

## 3. Decisions proposed in this stage

| ID | Decision | Why |
|---|---|---|
| D17 | Toolbar: Home, Jobs, Search, and + to ask | The three places you return to, plus the one action that matters most |
| D18 | You (settings) opens from your initial on Home, not from the toolbar | Settings are rare; the toolbar stays for daily use |
| D19 | Decisions (approvals, questions, Ask) are sheets; things (jobs, results, files, browser) are pages | You never lose your place to make a decision |
| D20 | Files live as a tab in Jobs, and in Search | Every file belongs to a job; one less place to learn |
| D21 | Sharing into Agent V from other apps is available at launch | Starting from the thing itself is the fastest way to hand work off |
| D22 | Widgets, Live Activities, assistant shortcuts and tablets come later | Focus; each is added once the core is solid |
