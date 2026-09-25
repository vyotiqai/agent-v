# Stage 3 — Key journeys

**Status:** proposed on 2026-09-25, waiting for review.
**Builds on:** [stage 1, foundations](01-foundations.md) and [stage 2, the app map](02-app-map.md).
Screen names below are the ones drawn on the canvas page "New direction".

A journey is one real thing a person does, from the moment it starts to the moment it's done,
including what happens when it goes wrong. Each journey lists its steps, the rules that apply,
and how we know it works. What every screen shows in each state (empty, loading, error, offline)
is stage 4.

The example person is the same as on the canvas: Ajay, a busy professional in India, using Gmail
and Google Calendar, with an Anthropic key.

## The journeys

| # | Journey | Why it matters |
|---|---|---|
| J1 | The first five minutes | If this fails, nothing else happens |
| J2 | Hand off a simple job | The everyday action |
| J3 | Hand off a job that matters | Plans and signatures are where trust is built |
| J4 | Clear what needs you | The only thing that blocks the agent is you |
| J5 | Follow a job and step in | Watching, taking control, adding to a running job |
| J6 | Repeating jobs and watches | The 24/7 part |
| J7 | Ideas and goals | Agent V noticing what's worth doing |
| J8 | Data work on the agent's computer | Files, statements, the spending summary |
| J9 | When something goes wrong | Keys, limits, sites, jobs that can't finish |
| J10 | Leaving | Export and delete, as both stores require |

---

## J1. The first five minutes

**Goal:** from installing the app to a first job running, in under five minutes, with nothing
confusing on the way.

| Step | Screen | What happens |
|---|---|---|
| 1 | Welcome | "Hand it off." Continue with Apple, Google, or email |
| 2 | Check your email *(email only)* | A 6-digit code, no password. The phone offers to fill in the code where the system supports it |
| 3 | Connect your AI (step 1) | Pick a provider. "Get a key" opens a two-minute guide; "I have a key" goes straight to pasting |
| 4 | Get a key *(if needed)* | Three short steps and a button that opens the provider's key page in the browser. Coming back to the app lands on Paste your key |
| 5 | Paste your key | Pasted keys are tested at once with a real call. Success shows how many models can run jobs |
| 6 | Choose models (step 2) | Recommended models are already picked, with a $20 monthly limit. Most people just tap Continue |
| 7 | Connect accounts (step 3) | Optional. Each account opens the provider's own sign-in. Skip is always there |
| 8 | Notifications (step 4) | An example notification, then the system prompt. "Not now" is fine |
| 9 | Ready | A first job that fits what was connected. Start it, or hand off something else |
| 10 | Today | The first job is on Today, running |

**Rules**

- No passwords. Sign-in is Apple, Google, or an email code (D44).
- The key can be skipped with "Later" in step 3. Nothing is lost: see "Before there's a key" below.
- The first job must be one that can't do harm: it only reads (Look level). With Gmail
  connected it's the inbox and calendar briefing; with nothing connected it's a research or
  watch job (for example "Tell me when the MacBook Air drops below ₹90,000") (D47).
- Every step can be left and resumed; the app remembers where you stopped.

**Before there's a key (D46)**

- Today shows one blue block: "Connect your AI to start", with a short reason.
- You can still hand things off. Jobs are saved as "Waiting for your AI" and start by
  themselves once a key works.

**Notification permission (D48)**

- Asked at the end of getting started, with an example of why.
- If declined, it's asked once more at the first moment it matters: the first time something
  needs your signature while the app is closed, Today says "Turn on notifications so this doesn't
  wait" with a button to the system settings. After that, never again; Settings has it.

**Done when:** a first job is running and Today shows it. Target: 80% of people who start
getting started reach Today with a working key.

---

## J2. Hand off a simple job

**Goal:** say what you want in a sentence; it gets done with no further questions.

| Step | Screen | What happens |
|---|---|---|
| 1 | Today → Hand something off, or Speaking | Type, or tap the microphone and talk. Attach a photo, file or link with + |
| 2 | *(no plan screen)* | Simple jobs that only look and prepare start at once (D2). Today shows it under "running" |
| 3 | Job page *(optional)* | Progress and the plan, if you want to look |
| 4 | Notification "Filed" | When done, one notification if you allowed it |
| 5 | A filed result | The answer, the files, and "Ask about this, or follow up…" |

**Rules**

- A job starts without a plan only if every step is Look or Prepare, and it's expected to take
  minutes, not hours. Anything else goes through J3.
- If the request is unclear in a way that changes the outcome, it asks one question first (A
  question); otherwise it makes a sensible choice and says which in the result.
- Voice: what you said is shown as text before it's handed off, so you can fix a misheard word.

**Done when:** the result is filed and Today counts it under "filed".

---

## J3. Hand off a job that matters

**Goal:** for anything that acts as you, spends, can't be undone, or runs long, you see the plan
before it starts.

| Step | Screen | What happens |
|---|---|---|
| 1 | Hand something off | "Find a time next week for a 30-minute call with Maya and send her an invite." |
| 2 | Before I start | The plan in plain steps. The step that acts as you is marked blue ("Needs your signature first"). Start, or Change |
| 3 | Today / Job page | It works through the steps it can do on its own |
| 4 | Needs you: signature | At the step that sends the invite: the exact invite, hold to sign |
| 5 | Job page → Filed | It finishes, tells you, and remembers Maya's answer |

**Rules**

- "Change" goes back to Hand something off with the request filled in; you edit it in your own
  words.
- Starting a plan is not signing its steps. Each step that acts as you, spends, or can't be
  undone still asks when it's reached, showing the exact content (foundations, section 6).
- If the plan changes while working (for example Maya has no free mornings), a changed step that
  needs a signature asks again; a changed plan that only looks and prepares just updates.

**Done when:** every signed step happened exactly as signed, and the result is filed.

---

## J4. Clear what needs you

**Goal:** decide everything waiting on you in one pass, in the app or from notifications.

**In the app**

| Step | Screen | What happens |
|---|---|---|
| 1 | Today, blue block "Needs you · 1 of 3" | Tap the round button, or any chip |
| 2 | Needs you: signature (1 of 3) | Hold to sign and send. Or Edit, Later, Don't send |
| 3 | Needs you: a question (2 of 3) | Pick an answer, type, or speak it |
| 4 | Needs you: can't be undone (3 of 3) | Hold, then Face ID. Or Not now |
| 5 | Back to Today | The blue block is gone when nothing is waiting |

**From notifications**

- A signature (Act as you) can be given from the notification: it shows the exact text, and its
  Sign and send action works only on an unlocked phone.
- A question with fixed answers can be answered from the notification.
- Spend and can't-be-undone requests always open the app, with Face ID (D7).

**Rules**

- Order: oldest first, except that anything close to its 24-hour limit moves to the front.
- "Later" moves the item to the end of the queue; it doesn't approve or decline.
- Closing a page never approves anything.
- After 24 hours without an answer it reminds you once; after that the step is skipped and the
  job says so (foundations, section 6).
- Signing works only online; offline, the button says "You're offline" and nothing is queued to
  send later (D53).

**Done when:** the queue is empty and every decision is recorded on its job.

---

## J5. Follow a job and step in

**Goal:** see what it's doing, add to it, or take over for a moment, without stopping it.

| Moment | Screen | What happens |
|---|---|---|
| Curious | Job page | Now, the plan, the cost so far |
| Watch | Live browser | The page it's reading, where it's pointing |
| A login, a two-step code, a CAPTCHA | Needs you: take control | The job pauses at that step and asks you to take control |
| Take control | Live browser, in your hands | You type or tap in the cloud browser. "Done, carry on" hands it back |
| Add something | Job page, "Ask about this, or change it…" | Your message joins the queue and is taken after the current step (D42) |
| Stop or pause | Job options | Pause, Stop, Rename, Add to a goal, Archive, Delete |

**Rules (D49)**

- Passwords and codes are always typed by you. While you have control, the agent doesn't act,
  and it doesn't record what you type into password fields.
- If you signed in, the site is added to Saved logins (D38), so next time it won't ask.
- Taking control times out after 10 minutes of no activity; the job waits and it's still in
  Needs you.
- A queued message that changes the goal ("use 12 seats, not 10") may change the plan. If a
  changed step needs a signature, it asks (J3).

**Done when:** the job continues on its own after you hand back.

---

## J6. Repeating jobs and watches

**Goal:** things happen on schedule, or when something changes, without you remembering.

| Step | Screen | What happens |
|---|---|---|
| 1 | Hand something off | "Brief me every weekday at 7:30" or "Tell me when the MacBook Air drops below ₹90,000" |
| 2 | Jobs → Repeating | It appears with its schedule |
| 3 | Each run | The briefing is filed and notified; a watch checks quietly |
| 4 | The condition is met | One notification ("₹89,400 at …") and an item on Today. It doesn't buy anything |
| 5 | Job options | Change how it repeats, pause, or stop |

**Rules**

- A watch notifies once per change, not on every check.
- If a watched page fails several checks in a row, it waits longer between checks and tells you
  once, rather than every time.
- Repeating runs that act as you (for example "send the weekly report") ask for a signature every
  time, unless you've let it stop asking for that kind of action (learning to ask less).

**Done when:** each run is filed under its job, and alerts arrive once.

---

## J7. Ideas and goals

**Goal:** Agent V notices something worth doing; you decide.

| Step | Screen | What happens |
|---|---|---|
| 1 | Today, "An idea · 1 of 3" | At most one idea shows on Today at a time |
| 2 | An idea | What, why, the evidence with its sources, what it would take |
| 3a | Do it | Becomes a job, going through J2 or J3 like any other |
| 3b | Not now | Set aside. It learns what you don't want and suggests fewer like it |
| 4 | A goal | If the idea belongs to a goal, the job counts toward it |

**Rules**

- Ideas come only from your own connected data and your goals, and each shows where it came
  from. No idea is ever acted on without you.
- At most one idea notification a day, and only if you turned idea notifications on.
- A goal is made from Hand something off ("I want to save ₹1,50,000 by March"). It proposes
  milestones; you accept or edit them before it's saved.

**Done when:** each idea is either a job or set aside; goals show progress from their jobs.

---

## J8. Data work on the agent's computer

**Goal:** give it a statement or spreadsheet; get an answer and a file back.

| Step | Screen | What happens |
|---|---|---|
| 1 | Hand something off, + File | Attach a bank statement (CSV or PDF) or a spreadsheet |
| 2 | Job page | It works on its own computer: reads, cleans, calculates |
| 3 | Spending summary | Totals by category, recurring charges, what looks unused |
| 4 | Jobs → Computer | The files it made, and every command it ran |
| 5 | Ideas / Goal | Unused subscriptions become an idea; savings feed a goal |

**Rules**

- Statements are read-only data. There's no bank connection and no payment from this flow (D40).
- Files on the computer count toward its storage allowance; old working files can be cleared,
  and filed results are kept.

**Done when:** the summary is filed and the files it made are in Computer.

---

## J9. When something goes wrong

Every problem ends up as one clear item, in words, with what to do next. Nothing fails silently
and nothing is retried forever.

| Problem | What you see | What you can do |
|---|---|---|
| **Key stops working** (revoked, no credit, rate-limited) | Jobs pause. One Needs you item: "Your Anthropic key was declined: no credit left." | Add credit, replace the key, or switch provider |
| **Monthly limit reached** | Jobs pause. One Needs you item with this month's spend (D52) | Raise the limit, or wait for the new month |
| **An account disconnects** | Jobs using it pause. One item: "Gmail needs you to sign in again." | Reconnect |
| **A site blocks it or needs a human** | J5: take control | Take control, or tell it to skip that site |
| **A job can't finish** | The job moves to "Couldn't finish" with one sentence on why and what it did get (D50) | Try another way, tell it more, or drop it |
| **A short failure** (network, a slow site) | Nothing, unless it keeps happening | It retries up to 3 times, waiting longer each time, then treats it as a job that can't finish |
| **Your phone is offline** | An "Offline" chip on Today; everything shows its last known state (D53) | Work continues on the servers; signing waits until you're back online |

---

## J10. Leaving

| Step | Screen | What happens |
|---|---|---|
| 1 | You → Privacy and your data | Export everything, or delete the account |
| 2 | Export | A zip of jobs, results, files, memory and settings, sent by email link when ready |
| 3 | Delete my account | Like any can't-be-undone step: what will be lost, hold, then Face ID |
| 4 | After deleting | Running jobs stop, connected accounts are disconnected, keys and saved logins are erased at once; everything else is erased within 30 days |

Both app stores require deleting the account from inside the app; this meets that.

---

## Decisions in this stage

| ID | Decision | Why |
|---|---|---|
| D44 | Sign in with Apple, Google, or an email code. No passwords; passkeys can come later | Fast and safe. Apple's App Store rules require a privacy-focused option such as Sign in with Apple when Google sign-in is offered |
| D45 | Getting started order: account, AI key, models, accounts (optional), notifications, a first job | The key is the one thing it can't work without; everything else can wait |
| D46 | The key step can be skipped. Before a key works, Today shows "Connect your AI to start", and handed-off jobs wait and start by themselves once it works | Nobody is stuck at a form, and nothing handed off is lost |
| D47 | The first suggested job only reads, and fits what was connected (the inbox briefing with Gmail; a watch or research job without) | A first job must be useful and can't do harm |
| D48 | Notifications are asked for at the end of getting started, and once more at the first signature that waits; never again after that | Explain first, ask at the moment it matters, don't nag |
| D49 | Take control: logins, codes and CAPTCHAs pause the job and ask you to take control; you type, then hand back with "Done, carry on". Passwords are never recorded; control times out after 10 idle minutes | Real sites need a human at these moments; your secrets stay yours |
| D50 | A job that can't finish says why in one sentence and what it did get, and offers: try another way, tell me more, or drop it. Short failures are retried up to 3 times first | Honest endings; no silent failures, no endless retries |
| D51 | Needs you is ordered oldest first, except items close to their 24-hour limit, which move to the front; "Later" moves an item to the end | One pass clears the queue; nothing expires unseen |
| D52 | Reaching the monthly limit pauses jobs with one item showing the month's spend; you raise the limit or wait | Spending on your key is always your choice |
| D53 | Offline, the app shows the last known state with an "Offline" chip; work continues on the servers; signing needs a connection and is never queued | Signatures must be about the exact, current content |

## Open questions for later stages

| Question | Answered in |
|---|---|
| The exact empty, loading, error and offline state of every screen | Stage 4 |
| The full dark appearance | Stage 5 |
| How voice is turned into text (on the phone, or through the person's provider) | Stage 6 |
| Timeouts and limits: browser time, computer time and storage, how many jobs run at once | Stage 6 |
