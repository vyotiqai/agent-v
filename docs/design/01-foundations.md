# Stage 1 — Foundations

**Status:** agreed on 2026-09-25.
This document settles what Agent V is, who it is for, how it behaves, and what it does at launch.
Later stages build on it; anything that changes a decision here is recorded in the later stage's
decision log with a link back.

## 1. Vision

Agent V is a personal AI agent that works for you around the clock. You tell it what you want
done. It writes a plan, does the work in the background, shows you proof of what it did, and
only interrupts you when it truly needs you: to approve something, to answer a question, or to
read a result.

It is not a chat app. Conversation is how you ask, but the product is the work getting done.

## 2. Who it is for

**First audience: busy professionals.** People buried in email, meetings, research and admin.
They feel the value on the first day, and their work runs through a few systems (email,
calendar, the web, documents) that can be connected reliably.

Later audiences, in no fixed order: freelancers and small business owners, personal and family
life admin, students. The design stays general; the audience only sets launch priorities.

## 3. Principles

These settle disagreements in every later stage.

1. **Outcomes, not conversations.** Everything the agent does belongs to a job with a clear
   goal. There is no endless chat log.
2. **Trust is the product.** It never guesses when it matters. It asks before acting in your
   name, spending, or doing anything that can't be undone, and it shows exactly what it is
   about to do.
3. **Quiet by default.** It interrupts only when it needs you. Everything else waits calmly on
   the home screen.
4. **Show the work.** Every job keeps a record of what was done, with proof: drafts, links,
   screenshots, files.
5. **Reliable before broad.** One ability that works every time beats five that sometimes work.
   Abilities are added one at a time, each finished and verified.
6. **Your data, your keys, your control.** You choose the AI provider, you can see and delete
   everything it remembers, and you can export or delete your account at any time.
7. **Calm and crafted.** Typography-led, quick, and quiet. No clutter, no noise, nothing
   bouncy.

## 4. Jobs: the core model

Everything you hand to Agent V becomes a **job**.

### What a job is

Each job has its own page, laid out like a clean document:

- a title and one paragraph describing what "done" means
- the **plan**: steps, each marked as the agent's or yours, with timing
- the **record**: what the agent actually did, with proof
- the **result**, pinned to the top once the job is finished
- follow-up questions and changes, asked on the job itself so every conversation stays attached
  to the thing it is about

### Stages of a job

Every job moves through the same stages, and the home screen, the job page and notifications
always show the same one.

| Stage | Meaning |
|---|---|
| Planning | It is working out how to do it |
| Working | It is doing the work |
| Needs you | One step is waiting on your approval or answer; independent steps keep going |
| Scheduled | A repeating job, waiting for its next run |
| Done | Finished, with the result on top |
| Couldn't finish | It stopped, says why in plain words, and offers what you can do next |
| Stopped | You cancelled it |

### When you see the plan first

Simple work starts right away. It shows you the plan and waits for your OK first only when the
job is big, would spend money, would send something in your name, or would take a long time.
You can edit or stop any job at any moment.

### Repeating jobs

One-time and repeating work are the same thing. A job can repeat on a schedule ("every morning",
"every Friday") or until a condition is met ("until the price drops below $300"). A repeating
job's page shows its next run and its past runs.

### Asking

The **+** in the floating toolbar is always one tap away, by typing or voice. Asking creates a
new job rather than opening a chat.

### Wording

The main flow uses no noun: "What should I take care of?", "Working on: Book dinner for Friday".
The word **Jobs** is used only where a noun is truly needed, such as a list heading.

## 5. Home

The home screen is the agent briefing you: a dark top area with the briefing in plain sentences
(important words bright, the rest muted, small icons inside the text), over a light sheet with
three sections, always in this order:

1. **Needs you:** approvals and questions. The only things that ever wait on you.
2. **In progress:** what it is working on now, with live status.
3. **Done:** recent results, ready to read.

Example briefing: "Good morning, Ajay. I finished 2 things overnight, 1 needs your OK, and I'm
watching 3 prices for you."

## 6. What it may do without asking

### Action levels

Every action the agent takes has one level.

| Level | Examples | Default |
|---|---|---|
| **Look** | read, search, browse, research, compare, summarize | On its own, always |
| **Prepare** | write drafts, fill forms, build a cart, pick options | On its own, then shows the result |
| **Act as you** | send an email or message, accept an invite, submit a form, post | Asks first; can be allowed per area |
| **Spend** | any purchase, paid booking, subscription | Asks first, every time, with the exact amount |
| **Can't undo** | delete, cancel, unsubscribe, share your private information | Asks first, every time; can't be turned off |

At launch, spending always asks. A monthly limit under which it buys without asking may come
later, once people trust it.

### Approvals

- An approval shows exactly what will happen: the real text, the recipient, the exact price. You
  can approve, edit, or decline.
- An approval covers exactly what you saw. If anything changes, even one word or one cent, it
  asks again.
- Only the waiting step pauses; independent steps continue.
- If you haven't answered after 24 hours, it reminds you once. After that it skips the step and
  tells you. It never guesses.
- **Act as you** approvals can be given straight from a notification. **Spend** and **Can't
  undo** always open the app and need Face ID, Touch ID or the phone's fingerprint or PIN.

### Learning to ask less

After you have approved the same kind of action several times (for example, replies to
scheduling emails), it asks once: "Send these without asking next time?" It changes only if you
say yes. Every such rule is listed in Settings, where it can be undone. Spend and Can't undo
never become automatic this way.

### Hard limits

Whatever the settings, it never:

- changes your passwords or security settings
- gives your data to anyone you haven't approved
- acts inside anyone else's account

## 7. What it can do at launch

| Ability | What it covers |
|---|---|
| **Email** (Gmail, Outlook) | Sorts and summarizes, drafts replies, sends after approval, tracks what is waiting on others |
| **Calendar** (Google, Outlook) | Finds times, schedules and reschedules, sends a briefing before each meeting |
| **Research and the web** | Real browsing in a cloud browser you can watch and take over (for logins); compares, finds, fills forms |
| **Documents** | Reads PDFs and photos of paper, fills forms, writes reports and summaries, returns files you can share |
| **Watching and routines** | "Tell me when…", price drops, page changes, daily and weekly briefings |
| **Follow-ups** | "Remind me if Sam hasn't replied by Friday"; keeps track of loose ends |
| **Memory** (underneath everything) | Learns your preferences; you can see and delete everything it remembers |

**Later, one at a time:** a cloud computer for data and spreadsheet work; shopping and payments;
phone calls on your behalf; bills and banking; travel booking; messaging apps; smart home.

Known outside limits on the later list:

- **Phone calls:** the rules for recording and AI callers differ by country and state.
- **Messaging apps:** WhatsApp and iMessage don't let apps act from a personal account, so this
  is limited by the platforms.

### How it works 24/7

Phone apps can't control other apps, and phones suspend apps in the background. So the agent
runs on Agent V's servers, working through your connected accounts, a cloud browser and cloud
services. The phone is where you ask, approve, and watch the work.

## 8. AI models: bring your own key

Agent V is free at launch. People connect their own AI provider with their own API key, so the
cost of the AI goes directly to their own provider account.

### Providers

- **Built in:** OpenAI, Anthropic and Google, each with its own sign-up guide in the app.
- **Any other endpoint** that speaks the OpenAI-compatible API, with a base URL and key. This
  covers services such as OpenRouter, Groq, Together, Mistral, DeepSeek and xAI, and
  self-hosted models (Ollama, vLLM, LM Studio) on a server that Agent V's servers can reach.
  A model running only on your own computer isn't reachable unless you expose it.
- Providers with their own sign-in schemes (for example Azure OpenAI or Amazon Bedrock) are
  considered later.

### Rules for keys

- A key is checked when it is added, with a real test call, and the model list is read from the
  provider where possible.
- Agent jobs need a model that can use tools. Models that can't are marked and can't be picked
  for jobs.
- A key is stored encrypted on the server, used only on the server, and never shown again or
  sent back to the phone after it is saved. It can be replaced or removed at any time.
- Custom endpoints may only point to public internet addresses, so an endpoint can't be used to
  reach Agent V's own internal network.
- If a key stops working (revoked, out of credit, rate-limited), affected jobs pause and a
  **Needs you** item explains what happened and how to fix it. Nothing is silently retried
  against a failing key.

### Cost visibility

Because every job spends from the person's own provider account:

- each job shows the AI usage it consumed, and an estimated cost where the provider's prices are
  known
- people can set a monthly limit; when it is reached, jobs pause and ask

### What remains our cost

Keys cover the AI. Servers, the cloud browser, storage, background running and store fees remain
Agent V's own costs, so fair-use limits on those (for example browser time and how many jobs run
at once) are needed. Their numbers are set in stage 6.

## 9. Business model

- **Free at launch.** No subscription, no in-app purchases.
- Pricing is decided later, based on real usage.
- Because the app is free, Apple's and Google's in-app payment rules don't apply yet.

## 10. Markets and language

- **Launch:** English, in the United States, United Kingdom, Canada, Australia and India.
- **Prepared from day one:**
  - every piece of text ready for translation
  - dates, times, numbers and currencies formatted for each country
  - privacy built to the European GDPR standard: clear consent, export, and deletion

## 11. Name and voice

**Name:** Agent V. Before launch, confirm that the name is available in both stores and not
someone else's trademark.

**Voice:**

- It speaks in the first person, with no separate character name.
- Calm, brief and personal.
- Never chatty, never gushing, no emoji.
- It talks like a very good assistant would.

| Instead of | It says |
|---|---|
| "Great question! I'd be happy to help you with that! 😊" | "On it. I'll have options by 3 pm." |
| "Task 4f2a failed due to error 503." | "The airline's site is down. I'll try again at 6 pm." |
| "Are you sure you want to proceed?" | "Send this to Sam?" |

## 12. Platforms and store requirements

- **Launch:** iPhone and Android phones. Tablets come later.
- Both stores require in-app account deletion, and it is designed in from the start.
- If sign-in with Google is offered, Apple requires Sign in with Apple as well.
- Both stores require privacy disclosures: Apple's privacy labels and Google's data safety form.
  They are written from the real data flows in stage 6.
- App review needs a working test account; review notes include a test API key.

## 13. Outside requirements and risks

| Item | What it means | Plan |
|---|---|---|
| Gmail | Reading Gmail is Google's most sensitive permission. A public app needs a yearly independent security review, typically taking several weeks and costing several hundred to a few thousand dollars a year. Until then, up to 100 test users can use it. | Start the review during the build; beta testers use it meanwhile |
| Google Calendar | Needs Google's app verification | Apply along with the Gmail review |
| Outlook and Outlook Calendar | Needs Microsoft publisher verification | Apply during the build |
| The name | Might be taken in a store or trademarked | Check before launch |
| Running costs | Free app, but servers and the cloud browser cost money | Fair-use limits (stage 6); pricing later |
| Websites blocking automation | Some sites block cloud browsers | Take-over for logins and checks; report honestly when a site can't be used |
| API keys | People's keys are valuable secrets | Encryption, server-only use, no display after saving (section 8) |

## 14. Decision log

| ID | Decision | Why |
|---|---|---|
| D1 | Agent V is a delegation app: you hand it outcomes; home is the briefing plus your work, not a chat log | Matches what people want from an agent: things done, not conversations |
| D2 | The plan is shown first only when it matters (big, spending, sending as you, long); simple work starts right away | Safe without turning every request into homework |
| D3 | One-time and repeating work are the same concept; a job can repeat | One idea to learn; repeat runs sit with the job |
| D4 | No noun in the main flow; "Jobs" only where a noun is needed | "Task" sounds like your own to-do list; "Job" sounds like work handed over |
| D5 | Five action levels: Look, Prepare, Act as you, Spend, Can't undo, with the defaults in section 6 | Clear, predictable rules are the basis of trust |
| D6 | Spending always asks at launch | Safest and clearest while trust is being built |
| D7 | Act-as-you approvals from notifications; Spend and Can't undo need the app plus biometrics | Fast where it's safe, deliberate where it's risky |
| D8 | It offers to ask less after repeated approvals, only with your yes; never for Spend or Can't undo | Earns autonomy instead of assuming it |
| D9 | First audience: busy professionals | Immediate value through a few reliable integrations |
| D10 | Launch abilities: email, calendar, research and the web, documents, watching and routines, follow-ups, memory | Covers most professional work; each can be made reliable |
| D11 | Gmail from the start; the security review begins during the build | Most people use Gmail; the review takes weeks |
| D12 | Free at launch; people bring their own API key for any provider or OpenAI-compatible endpoint; pricing decided later | The user's decision: free to start, AI costs paid by each person's own provider account |
| D13 | Launch in English in the US, UK, Canada, Australia and India; built for translation and GDPR-level privacy | A focused start without blocking later expansion |
| D14 | The name is Agent V; it speaks in the first person, calm and brief | The user's decision on the name; the voice follows the principles |
| D15 | iPhone and Android phones first; tablets later | Focus |
| D16 | The agent runs on servers; the phone is for asking, approving and watching | Phones can't run 24/7 work or control other apps |

## 15. Open questions for later stages

| Question | Answered in |
|---|---|
| Sign-in methods (email, Apple, Google, passkeys) and first-launch steps, including adding an API key | Stage 3 |
| What the app shows before a key is added, and the in-app guide for getting one | Stages 3 and 4 |
| How voice input is transcribed (on the phone, or through the person's provider) | Stage 6 |
| Memory search needs an embedding model, and not every provider offers one (Anthropic doesn't) | Stage 6 |
| Fair-use limits for servers and the cloud browser | Stage 6 |
| Pricing | After launch, from real usage |
