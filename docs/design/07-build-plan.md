# Stage 7 — Build plan

**Status:** proposed on 2026-09-25, waiting for review.
**Builds on:** stages [1](01-foundations.md) to [6](06-technical-design.md), and the
[rules for building Agent V](README.md#rules-for-building-agent-v).

Stage 7 is the order in which Agent V is built: small slices, each working end to end and verified
before the next starts (D117, D118). It ends with Agent V on Google Play, then the App Store.

### The owner's choices for this stage

Asked on 2026-09-25 and recorded as decisions below:

| Choice | Decision |
|---|---|
| When the owner first uses it | When everything in launch scope works (D119) |
| Who tests before launch | Only the owner, until the Google Play closed test just before launch (D119) |
| Google Play's rule for new personal accounts (12 testers opted in for 14 days in a row before going public) | Met at the very end, with 12 or more people the owner invites (D119) |
| Which phone first | Android, the owner's own phone; iPhone next, once tested on a real iPhone. **Changes D15** (D120) |
| Gmail | Built and working for the owner in Google's test mode; public once its yearly security assessment (about $540–$1,800) can be paid for. Launch has Outlook mail, Outlook Calendar and Google Calendar. **Changes D11** (D121) |
| The domain | Decided later; it's needed before slice 5 (D124) |
| Sign-in on Android at launch | Google; Apple arrives with the iPhone slice (D125, following from D120) |

---

## 1. What "done" means for a slice (D118)

A slice is done only when all of this is true. Nothing moves on with a known gap.

1. **It works end to end** on staging (stage 6, section 22), with real services and real accounts:
   every screen in the slice looks and behaves as stage 4 specifies, in light and dark, and every
   button and link does what it says.
2. **Tested at every level that applies:** unit, integration, end to end on an Android emulator and
   on real Android phones in Google's device lab (Firebase Test Lab, within its free daily quota),
   and the attack and accessibility checks for what the slice touches. The tests are part of the
   slice and run on every change from then on.
3. **Nothing pretend:** no placeholder screens, sample data, demo accounts or imitated services
   (rule 1). A screen whose slice hasn't come yet is simply not in the app.
4. **Earlier slices still pass,** in full.
5. **Documented:** each part's README says what it does and how to run and test it; new decisions
   are recorded where the next person will look (rule 4).
6. **Reviewed:** the whole change is read again, looking for what would break, before it's merged.
7. **The owner is told** what the slice does and how it was verified, in plain words.

## 2. The repository (D123)

One repository, one language (TypeScript) for the app and the server:

| Folder | What it holds |
|---|---|
| `app/` | The Expo app: screens, our own components, the offline store, the native modules (device signing key, speech) |
| `server/` | The API and the workers, one codebase with two entry points |
| `shared/` | The types and checks shared by the app and the server |
| `browser/` | The browser container image and its small control program |
| `infra/` | Everything on Google Cloud, described as code, for staging and production |
| `tools/` | The support lookup, the token-theme generator, the release scripts |
| `docs/` | The design (this folder) and the operations runbooks |

Tools are general-purpose only (rule 6): TypeScript, Node, Expo's open-source framework, a
Postgres driver, Playwright, a PDF library, a test runner, a mobile end-to-end tool, and an
open-source tool for describing cloud setups as code.

## 3. The slices, in order (D117)

Each slice lists what it delivers, the screens it completes (stage 4) and how it's verified.

| # | Slice | Delivers | Verified by |
|---|---|---|---|
| 0 | **Foundations** | The repository and its checks; staging and production on Google Cloud, as code; budget alerts; the database and its migrations; Cloud KMS and per-person data keys; the egress gateway; content-free logging; the release pipeline to staging; the app shell with the theme generated from `tokens.py` and the 24 components built to the stage 5 specification | Components match the design system's previews in both themes; contrast check on the app theme; a deploy to staging from a merge; the egress gateway refuses private addresses |
| 1 | **Accounts** | Sign in with Google; sessions with rotating tokens; devices and the device signing key; Welcome; sign out. Sign in with Apple comes in slice 13, when the Apple developer account exists | Real Google sign-in on staging; a copied refresh token signs that device out; the key never leaves the phone |
| 2 | **Your AI** | Our own clients for the four wire formats, with streaming and error kinds; key check and model list; choose models; the monthly limit; the Brave Search key; the getting-started screens; You → Your AI | Each client against the real provider with a real key; a declined key, no credit and a rate limit each produce the right Needs you item |
| 3 | **Jobs** | Hand something off (typed); the plan and when it's shown first; the run loop and its record; research (provider tools, page fetch); Today, Jobs, the job page, results, follow-ups, Couldn't finish, stop and pause; the live stream; the offline store and drafts | Journeys J1 (without accounts) and J2 end to end; a worker killed mid-job resumes with nothing lost or repeated; offline reading and queued hand-offs |
| 4 | **Needs you and signatures** | Questions and signatures with fingerprints and versions; action levels and hard limits in code; Spend and Can't undo signed by the phone's key after the fingerprint or PIN; notifications through FCM with Sign and answer actions; the 24-hour limit and reminder; "ask less" rules | J3 and J4; a changed word or cent restarts the hold; a forged or replayed signature is refused; the section 18 attack set for what exists so far |
| 5 | **Email and calendar** | Outlook mail and calendar (Microsoft Graph, change notifications, drafts-then-send, `transactionId`); Google Calendar; Gmail built and verified in Google's test mode for the owner; Connect accounts; the briefing | Real test accounts on staging; nothing sends twice when a worker dies between "about to send" and "sent"; a revoked token pauses jobs with one Needs you item |
| 6 | **Repeating jobs and watches** | Repeat rules, runs filed under the job, watches with the page fetch, the watch page and its chart, backing off after failures, one alert per change | J6; a watch alerts exactly once per change; schedules survive deploys |
| 7 | **The cloud browser** | The browser fleet on GKE Autopilot with gVisor; driving over the DevTools Protocol; our own live view and Take control; saved logins as encrypted profiles; the per-person minutes and the $10 ceiling | J5; a hostile test page can't reach our network; Take control records no keystrokes; the ceiling stops browser steps and nothing else |
| 8 | **The agent's computer and documents** | Anthropic's and OpenAI's code sandboxes and Google's short Python; files kept in Cloud Storage; Jobs → Computer; reading PDFs and photos; filling PDF forms; the spending summary | J8 with each provider; a container ending loses no files; a provider without a sandbox shows the right line |
| 9 | **Memory, ideas and goals** | The embedding service (the model chosen by measurement); memory and its screen; the daily ideas run with its cost cap; goals and milestones | J7; memory is never written from a web page or incoming email; forgetting removes the vector |
| 10 | **Voice, sharing and settings** | On-device speech; Speaking and microphone-off; the Android share target; Appearance; Help; Report a problem; notification settings | Speech never leaves the phone (checked on the network); every settings screen end to end |
| 11 | **Privacy and your data** | Export by notification and in-app download; deleting the account, destroying the data key; security events; crash reports; the support lookup | J10; after deletion, nothing of the person is readable, backups included within their window |
| 12 | **Ready for Android launch** | The full attack set; an accessibility pass; a load test at ten times the expected launch use; a practised restore; the privacy policy and terms on the domain; the Play listing and data safety form; the owner's own use of everything; the 12-tester closed test for 14 days; Play review with a real reviewer account | Every journey and screen on the owner's phone and on staging; the closed test's reports resolved |
| 13 | **iPhone** | Apple Push Notification service; Sign in with Apple, on iPhone and, through its web sign-in, on Android; Face ID and the Secure Enclave key; the iOS share extension; TestFlight on a real iPhone; App Store review | Every journey on a real iPhone; the App Store privacy labels from the stage 6 table |

After launch, in an order chosen then: Gmail made public (D121), the desktop app (D103), an EU
region, passkeys, widgets and Live Activities (D22).

## 4. Outside steps, and when they start (D122)

Some things only the owner can do, and some take weeks. Each starts early enough not to hold a
slice up.

| Step | Who | Cost | Start | Needed by |
|---|---|---|---|---|
| Google Cloud billing account, with budget alerts | Owner | Pay as you go | Before slice 0 | Slice 0 |
| The domain, with an email address on it (D124) | Owner | ~$10–15 a year | Before slice 5 | Google's app verification; the privacy policy |
| Google Play developer account (identity check) | Owner | $25 once | During slice 10 | The owner's own use and the closed test in slice 12 |
| Microsoft publisher verification (Partner Center, the domain) | Owner, with help | Free | Slice 5 | Outlook for people outside the test |
| Google app verification for Google Calendar (sensitive scopes) | Owner, with help | Free | Slice 5 | Google Calendar for people outside the test |
| Google for Startups Start tier ($2,000 credit) | Owner | Free | Once slice 4 works, with the domain | Lowers running costs |
| Name and trademark check for "Agent V" | Owner | Free search; a lawyer's opinion optional | Before slice 12 | The store listings |
| 12 testers for the Play closed test | Owner invites | Free | Start of slice 12 | Going public on Play |
| Apple developer account | Owner | $99 a year | Slice 13 | The App Store |
| Gmail's security assessment (CASA) | Owner, with help | ~$540–$1,800 a year | When budget or credits allow | Gmail for everyone |

## 5. How the work runs

- **One slice at a time.** When a slice is done (section 1), the owner is told what it does and how
  it was verified, and the next starts. Nothing is merged that isn't done.
- **Questions that belong to the owner are asked** as they come up, with a recommendation (rule 5).
- **Changes to agreed decisions** are recorded with a new decision that says what it changes, in
  the stage where it was made.
- **Real money stays small:** staging uses the smallest sizes and the owner's AI keys with small
  spend limits; production starts at the sizes in stage 6, section 13.

## 6. Risks

| Risk | What we do |
|---|---|
| A provider changes its API or prices | Our own clients are small and tested against the real provider on every release; prices are checked again before launch |
| Sites block the cloud browser | Take control for sign-ins and checks; honest reports when a site can't be used |
| Hidden instructions get past the model | The server enforces signatures and the rules in stage 6, section 18; the attack set grows with every new trick found |
| The $10 ceiling is reached early | Alerts at 50% and 90%; the owner can raise it; only browser steps wait |
| Google Play's closed test or review is slow | The 12 testers are invited at the start of slice 12, not the end |
| Gmail stays test-only for long | Outlook and Google Calendar work fully at launch; people are told plainly that Gmail comes later |
| The work takes longer than hoped | Slices are small and each ends working; the order puts the heart of Agent V (slices 1–4) first |

---

## Decisions in this stage

| ID | Decision | Why |
|---|---|---|
| D117 | Build in 14 slices, in the order of section 3, each finished before the next starts | Each slice ends working; the heart of Agent V comes first |
| D118 | A slice is done only when it works end to end on staging with real services, is tested at every level that applies, has nothing pretend, keeps every earlier slice passing, is documented and reviewed, and the owner is told how it was verified | The owner's rules 1 to 4, made checkable |
| D119 | The owner first uses Agent V when everything in launch scope works, and is the only tester until the 12-tester Google Play closed test just before launch | The owner's choice; Google Play requires the closed test from new personal accounts |
| D120 | Android first, on the owner's phone; iPhone next, once tested on a real iPhone. **Changes D15** (stage 1) | The owner uses Android; a real iPhone is needed to verify Face ID, notifications and the secure chip |
| D121 | Gmail is built and verified, used by the owner in Google's test mode, and made public once its yearly security assessment can be paid for; launch has Outlook mail, Outlook Calendar and Google Calendar. **Changes D11** (stage 1) | The owner's choice: the assessment costs about $540–$1,800 a year, and the other accounts are free to verify |
| D122 | Outside steps start as in section 4, early enough not to hold a slice up | Some take weeks, and only the owner can do them |
| D123 | One repository with `app`, `server`, `shared`, `browser`, `infra`, `tools` and `docs`; general-purpose tools only | One language and one place for everything; rule 6 |
| D124 | The domain is chosen later, before slice 5 | The owner's choice; it's first needed for Google's and Microsoft's verification |
| D125 | Android launches with Sign in with Google; Sign in with Apple arrives in slice 13 on both phones, with the Apple developer account. **Refines D100** (stage 6) | Apple sign-in, even on Android, needs the Apple developer account, which comes with the iPhone slice |
