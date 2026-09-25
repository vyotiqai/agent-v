# Stage 4 — Every screen in detail

**Status:** agreed on 2026-09-25 (part 1 and part 2).
**Builds on:** [stage 2, the app map](02-app-map.md) and [stage 3, the key journeys](03-journeys.md).
Drawings are on the canvas page "Stage 4 · States"; screen names below are the ones drawn there
and on "New direction".

Stage 2 drew every screen in its usual state, with work in it. This stage says what every
screen shows in every other state: while it loads, the first time, when there's nothing to do,
when something fails, and when the phone is offline. It is in two parts:

1. **Shared states.** Most states look the same on every screen, so each is defined once here,
   drawn once, and then applies everywhere.
2. **Screen by screen.** For each screen: what it shows and the limits on its text,
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

Every screen on the app map, grouped as there. For each: what it shows and the limits on its
text, the states it can be in, and every action with where it goes. "Shared" means the patterns
in part 1 apply (loading, empty, errors, offline); only what is particular to the screen is
written out.

Rules that hold on every screen:

- **Text limits.** Titles take up to 2 lines, then end in "…". Rows take 1 line for the title
  and 1 for the detail. With larger text sizes, rows grow taller instead of cutting more.
- **What you sign is never cut short** (D62). Signature, spend and can't-be-undone pages show
  the whole content, scrolling if needed, with the hold button fixed at the bottom.
- **Small, reversible actions happen at once, with Undo** (D65): forgetting a memory, removing
  a saved login, archiving a job. A bar at the bottom says what happened and offers Undo for
  5 seconds. Deleting a job asks first. Deleting the account is a can't-be-undone page (J10).
- **Back and close.** Pages you go into have Back (top left). Pages that interrupt, such as
  Needs you items, have Close; closing keeps the item in the queue.
- **Pull to refresh** on Today and Jobs; everything else updates by itself.

New drawings in this part, on the canvas page "Stage 4 · States", third row: **A watch**,
**Jobs, done**, **Appearance**, **Help and feedback**, **Speaking, microphone off**.
Fourth row, added when every button on the canvas was wired to work: **Goal options** (the
goal's menu), **Delete your account** (the can't-be-undone page from J10) and **Tell us**
(report a problem or send feedback).

### Every day

| Screen | Shows, and limits | States | Actions |
|---|---|---|---|
| **Today** | Date; greeting by time of day and name; the day in one sentence, up to 3 lines, with the counts as links. Needs you: the first item's title (up to 2 lines) and what it does, up to 2 more items as chips, "1 of 3". Up to 2 tiles: the job that changed last and the watch or routine that changed last. One idea, when there is one | Shared. Before a key works (drawn); first time with a key but no jobs: the sentence says "Nothing handed off yet" and the Try one suggestions from Jobs, first time appear; all clear (drawn); updating; offline (drawn), with any waiting hand-offs | The V: back to the top. Search, Jobs, You. Sentence links: the first Needs you item, Jobs, the latest filed result. Needs you arrow: the first item; chips: those items. Tiles: that job or watch. Idea: An idea. The bottom line: Hand something off; the microphone: Speaking |
| **Hand something off** | "What should I take care of?"; the text, growing to 6 lines, then scrolling; attachments as chips (photo, file, link); Start from: up to 6 suggestions that fit what's connected, scrolling sideways | Empty text: the send button is off. An attachment uploading: progress on its chip; failed: "Didn't upload · Try again" on the chip. Offline: sending puts it in Waiting to send on Today. Before a key works: it's taken and waits (D46). An unsent draft is kept on the phone (D66) | Close (the draft stays). +: photo, camera, file or link. Microphone: Speaking. Send: Before I start when it matters (D2), otherwise the new Job page |
| **Speaking to Agent V** | Your words as you speak, older words dimmer; the voice orb moves with your voice | Listening. Quiet for 3 seconds: "I'm listening"; quiet for 10 seconds: it stops and keeps what it heard. Nothing heard: "I didn't catch that · Try again". Microphone off (drawn): Open Settings or Type instead (D70) | Cancel: back, nothing kept. Hand it off: as Send. Type: Hand something off, with the words so far |
| **Before I start** | The job's title; one sentence on why there's a plan; chips for the number of steps and signatures; the steps (up to 8; longer plans group steps under headings), each saying what it does alone and what waits for you | Planning: grey shapes of the steps, "Planning…". A plan that needs an answer first: it asks, as A question. Offline: Start is off, with the reason | Back. Change: Hand something off with the request, to edit it. Start: the Job page |
| **Job page** | Status chip; title (up to 2 lines); 3 numbers (steps done, one number that fits the job, AI cost so far); Now: the current step, with Watch live (browser) or Open (computer); queued follow-ups (up to 5, then "and 2 more"); the plan with each step's state; when finished, the result at the top | Working; waiting for you (the step that waits is blue and opens the item); paused; waiting for your AI (D46); done (Open result, Replay); stopped; couldn't finish (its own page, drawn). Shared | Back. More: Job menu. Watch live: Live browser. Remove a queued follow-up (X, with Undo). The bottom line: a follow-up, queued if the job is busy (D42) |
| **Job menu** | The job's title; only what applies to this job: Pause or Resume; Stop; Repeat… (or Change how it repeats); Rename; Add to a goal; Share the result (when there is one); Archive; Delete | Offline: every item is off except Close | Pause and Resume: at once. Stop: asks "Stop this job? What it did stays filed." Rename: inline. Add to a goal: a list of goals. Archive: at once, with Undo. Delete: asks "Delete this job and its files? This can't be undone." Close |
| **Replay** | The job's title; each step's picture of what the agent saw, with what it did and why; step N of M and the time; a timeline | Loading a step: its shape. A step with no picture (a thought, an email): its text only. A step where you were in control: "You were in control here" and no picture (D60) | Close. Previous, play and pause, next; drag along the timeline |
| **An idea** | The idea (up to 2 lines); the big number it's about, if there is one; Why I think so: the evidence, each with its source; a note when the idea involves signatures | Already done, or no longer true: "This idea is out of date" and it moves to set aside | Back. Evidence rows open their source. Not now: set aside, and it learns from it. Do it: Before I start, or the Job page |
| **A question** | The job it's from; the question (up to 3 lines); why it asks; fixed answers, and "Something else…" for your own words; what it does meanwhile | Answered from a notification: "Already answered", then the next item. Expired (24 hours, after one reminder): out of the queue; the job says what it did without an answer. Offline: Answer is off | Close. Choose an answer. Microphone: answer by voice. Answer: the next item, or Today when the queue is empty |
| **For your signature** | Who it's to and the subject; chips for which account it's sent from and how long it waits; the full content (D62); Edit | Signed (drawn); editing: the text becomes editable and what you edited is what's sent; changed while open: the new version shows and the hold starts again (D63); expired (24 hours, after one reminder): nothing is sent, the step is skipped and the job says so (D64); offline (drawn) | Close, Later: stays in the queue. Edit. Hold to sign. Don't send: the job is told and goes on without it. After signing: Next, or Back to today |
| **Spend** | What it buys and from where; the exact amount, how often, and when the first charge is; how it pays; why this choice | Signed; Face ID fails: falls back to the phone's passcode; the payment is declined afterwards: a Needs you item on the job. Offline, changed while open and expired: as For your signature | Close. Hold, then Face ID. Don't buy |
| **Can't be undone** | What will happen and what will be lost; the full list (up to 3 rows, then "See all") | As For your signature | Close. See all. Hold, then Face ID. Not now |
| **Live browser** | The site's address; the page live, with where the agent points; the step and job | Connecting: the frame's shape and "Opening the browser…"; the agent thinking between pages: a quiet "Thinking" chip; the job finished: "Done here" and Back to the job; connection lost: the last picture, dimmed, with "Reconnecting…" | Back to the job. Take control: You're in control |
| **You're in control** | See part 1 and D60 | Signing in worked: back to Live browser; didn't: the agent asks again | Done, carry on. Skip this site |
| **A filed result** | When it was filed; the title; up to 3 numbers; the result in blocks; each suggested next step as a button | Long results scroll; attached files open in Computer. Shared | Back. Share: share sheet or save as PDF. Next-step buttons: a new job, or For your signature when it acts as you. The bottom line: a follow-up |
| **Spending summary** | Title and month; 3 numbers (spent, recurring, unused); by category with bars; recurring charges; a link to the goal | Reading the statement: "Reading your statement… page 2 of 4". Couldn't read it (for example a scanned PDF): says so and asks for the CSV from the bank's website. Shared | Back. Share. A category: its transactions. A recurring charge: its history, and Cancel it as a new job |
| **A watch** (drawn) | What is watched; the value now and how far from the alert; the last 30 days as a step chart with the alert line; recent checks; the next check | Just started: "First check at 11:00" instead of the chart; the site couldn't be read: that check says why, and after 3 in a row a Needs you item; alert reached: a notification and the chip reads "Reached" | Back. More: Job menu (pause, change how often, stop). Touch and hold the chart: the value on that day. The bottom line: change it ("alert me under ₹92,000") |

### Find your work

| Screen | Shows, and limits | States | Actions |
|---|---|---|---|
| **Jobs · Active** | Needs you (every item, in queue order, D51); Working; Next up; Repeating | First time (drawn); all sections empty but Repeating: only Repeating shows. Shared | Back. Search. Tabs. Rows open their item or job |
| **Jobs · Done** (drawn) | This month; Couldn't finish; Archived, with the count and the latest | Nothing done yet: "Finished jobs show here." Shared | Rows: the result, replay or Couldn't finish page. Restore: back to where it was, with Undo. Search older jobs: Search, filtered to jobs |
| **Jobs · Goals** | Each goal: progress, target and date, milestones and jobs; New goal | First time: "A goal holds bigger aims, like saving for something" and New goal. Shared | A goal: Goal. New goal: Hand something off, starting "A goal:" |
| **Goal** | Target date; amount or measure so far; progress; milestones with their state; an idea for this goal | Reached: "Done" chip and a filed summary. Target date passed: says so, and offers a new date or drop it | Back. More: rename, change the target or date, archive, delete. A milestone: its job. The idea: An idea. The bottom line: ask about the goal |
| **Ideas** | Every open idea: where it came from, the idea, why in one line; how many were set aside | None: "Nothing to suggest right now. I look again each morning." Shared | Back. An idea: An idea. Set aside: the ideas you set aside, each with Bring back |
| **Jobs · Computer** | 3 numbers (files, storage used of the limit, commands); files by last edited; the latest commands | Computer starting: "Starting your computer…"; nothing yet: "Files the agent makes show here"; storage nearly full (90%): a line under the numbers. *Added by D102 (stage 6):* the person's provider has no code sandbox: "Your AI provider doesn't offer a computer. It works with Anthropic or OpenAI, and the desktop app will add your own"; Google: a line saying it does short Python work only. Shared | A file: opens it (preview, edit for text and spreadsheets, share). See all: every command, with its job |
| **Search** | The search field; filters: All, Jobs, Files, Remembered; results grouped, the match in bold; Forget on memories | Before typing: recent searches and the filters. No results: "Nothing for 'Maya'" and a suggestion to search all instead of one filter. Part failed (drawn). Offline: searches what is on the phone, and says so | Cancel. Filters. Results open their job, file or memory. Forget: at once, with Undo |

### You and settings

| Screen | Shows, and limits | States | Actions |
|---|---|---|---|
| **You** | Your photo, name and email; one row per setting with its current value | Your AI not working: its row reads "Declined" and opens Key declined | Each row opens its page |
| **Profile and tone** | Photo and name; how it writes for you, with a sample of each tone | "In my own words": a text box, or "Learn from emails I've sent" (with Gmail) | Change photo. Name. Pick a tone: saved at once |
| **Saved logins** | Each site, when it was last used; how passwords are handled | None: "Sign in to a site once and I stay signed in." A saved login that stopped working: "Signed out · Sign in again" | Remove: at once, with Undo. Sign in to a site: You're in control, on a site you name |
| **Your AI** | This month's spend of the limit; the provider, key's last 4 characters, status; models for jobs and quick steps; other providers | Key declined: status reads "Declined" and opens Key declined. Limit reached: the numbers read "Limit reached". Testing a replaced key: progress on the button | Replace key: Paste and test key. Change limit: amounts. A model: Choose models. Add another provider |
| **Add provider** | The getting started steps 1–2 (Connect your AI, Get a key, Paste and test key, Choose models), without the step bar | As in getting started | As in getting started; it ends back on Your AI |
| **Connected accounts** | By provider: each account, email, status; what the access allows, in plain words | Needs signing in again: "Sign in again" in place of Connected. Connecting: progress on the button | Connect: the provider's own sign-in. Disconnect: asks, and says which jobs will pause |
| **What needs your signature** | The five action levels, what each covers and its setting; learned exceptions; hard limits (Spend always asks; Can't be undone always asks with Face ID) | No exceptions yet: that section is hidden | A level: its setting. Undo on an exception: at once. Locked levels show why they're locked |
| **What I remember** | 3 numbers (things, people, shared); Learn from my work; recent memories with their source | Nothing yet: "What I learn from your work shows here." Learning off: new memories come only from what you tell me | Forget: at once, with Undo. A memory: edit it. Search: Search, filtered to Remembered |
| **Morning briefing** | Time; days; what it includes | Off: one switch, "Morning briefing", and the rest hidden | Time: a time picker. Days. Switches |
| **Notifications** | Always on (signatures and questions; key or account problems); You choose (finished jobs, ideas, watch alerts, quiet hours) | Notifications off for the app in the phone's settings: a block at the top, "Notifications are off for Agent V", with Open Settings | Switches. Quiet hours: times |
| **Privacy and your data** | Export everything; what I remember; files on my computer; how your data is kept; sign out; delete my account | Export being prepared: "Preparing… I'll tell you when it's ready" *(changed by D111, stage 6: no email)* | Export: asks once, then a notification when it's ready; the download opens in the app and stays for 7 days (J10, D111). Sign out: asks. Delete my account: the can't-be-undone page (J10) |
| **Appearance** (drawn) | Automatic, Light, Dark, each with a small picture; text size follows the phone (D69) | — | Pick one: applies at once |
| **Help and feedback** (drawn) | Guides; Report a problem; Send feedback; version, Terms, Privacy Policy | Offline: guides stored on the phone open; reports wait and send when online | A guide: opens it. Report a problem: pick a job; the job's reference and the app's version are added, never your content unless you choose to add it |
| **Tell us** (drawn) | A problem or Feedback; for a problem, which job and a switch to add the job's details (its reference and the app version, never emails or files); what happened | Send is off until something is written. Sent: "Thanks. It's sent." and when to expect a reply. Offline: waits and sends when online | Back. Send. Back to help |

### Getting started

| Screen | Shows, and limits | States | Actions |
|---|---|---|---|
| **Welcome** | "Hand it off." and what it does in one sentence; Apple and Google (email removed by D100, stage 6); the terms line | Sign-in cancelled: back here, nothing said. Failed: one line under the buttons, "Couldn't sign in with Google · Try again" | Continue with Apple or Google |
| ~~**Check your email**~~ | *Removed by D100 (stage 6): there is no email sign-in.* It was: the address the 6-digit code went to; 6 boxes; Send a new code | Checking: progress on Continue. Wrong code: "That code isn't right" under the boxes, boxes cleared. Expired (10 minutes): "That code has expired" and Send a new code. Send a new code: waits 30 seconds between sends | Back: change the address. Paste a whole code: fills the boxes and continues. Continue |
| **Connect your AI** | "Agent V is free…"; Anthropic, OpenAI, Google, another provider | — | Pick one. Get a key: Get a key. I have a key: Paste and test key. Back |
| **Get a key** | Three steps for that provider, each with where to click | — | Open the Console: the provider's site in the phone's browser. I have it: Paste and test key |
| **Paste and test key** | The key field, hidden once pasted; the test result; how the key is kept | Testing: progress on Continue. Works (drawn). Declined: "Anthropic says this key isn't valid" or "has no credit" with what to do. Can't reach the provider: "Couldn't reach Anthropic · Try again". Another provider: an address field and a model field too | Paste. Continue: Choose models |
| **Choose models** | Recommended models for jobs and quick steps, with cost hints; the monthly limit | Only one suitable model: it's picked and the choice is hidden. The provider's list couldn't load: the recommended ones only | Pick. The limit: amounts. Continue |
| **Connect your accounts** | Gmail, Google Calendar, Outlook mail, Outlook Calendar; what access means | Connecting: progress on the button. Refused on the provider's page: back here, "Not connected" | Connect. Skip. Continue |
| **Let me reach you** | Why notifications matter; an example notification | Answered before (on this phone): the step is skipped | Allow notifications: the phone's prompt (D48). Not now |
| **You're set** | A first job that fits what was connected (D47) | Nothing connected: a watch or research job | Start this job: Today, with it running. Hand me something else: Hand something off |

### Outside the app

| Surface | Shows, and limits | States | Actions |
|---|---|---|---|
| **Notifications** | Kind (signature, question, can't be undone, filed, watch, a problem); one line of what it's about; for a signature, the start of the content | Quiet hours: held until they end, except can't-wait items: a signature or question that would expire first. Several of one kind: grouped, "3 things need you". Already handled in the app: removed from the phone | Signature: Sign and send (shows the exact text; works only on an unlocked phone, J4), or Open. Question with fixed answers: the answers. Can't be undone and spend: Open only. Others: open the page they're about |
| **Share into Agent V** | What was shared (a link with its title and picture, a photo, or a file); suggestions that fit it | Not signed in: "Open Agent V to sign in first". Offline: saved as Waiting to send | Cancel. A suggestion, or type. Hand it off: sent, with a short "Handed off" confirmation |

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
| D62 | What you sign is never cut short: signature, spend and can't-be-undone pages show the whole content, scrolling if needed, with the hold button fixed at the bottom | You can only sign what you can read in full |
| D63 | If what you're signing changes while the page is open, the new version shows and the hold starts again | A signature is always for the exact, current content |
| D64 | An item not answered in 24 hours (after one reminder) leaves the queue; nothing is sent, the step is skipped and the job says so | Detail for J4; nothing happens without you, and nothing waits forever |
| D65 | Small, reversible actions (forget a memory, remove a saved login, archive, restore) happen at once with Undo for 5 seconds; deleting a job asks first; deleting the account is a can't-be-undone page | Fast for what can be reversed; a pause only where it matters |
| D66 | Text typed but not handed off is kept on the phone as a draft until it is sent or cleared | Nothing you wrote is lost to a closed page |
| D67 | A watch has its own page: the value now and its distance from the alert, the last 30 days as a step chart with the alert line, and recent checks | A watch is about change over time; a picture says it faster than rows |
| D68 | Jobs · Done groups this month, Couldn't finish and Archived (with Restore); older jobs are found through Search | Keeps Done short; archive never loses anything (D41) |
| D69 | Appearance: Automatic (the default, following the phone), Light or Dark; text size and bold text follow the phone | Respect the phone's settings; the full dark look is stage 5 |
| D70 | If microphone access is off, Speaking says so and offers Open Settings or Type instead; the phone's own prompt is shown only the first time | A dead end becomes a way forward; never nag |

## Open questions for later stages

| Question | Answered in |
|---|---|
| Exact skeleton colours and motion, and the dark appearance of every state | Stage 5 |
| How much is stored on the phone for offline reading, and for how long | Stage 6 |
| How support references map to server logs without holding personal data | Stage 6 |
