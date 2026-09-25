# Agent V design

The design is written in stages. Each stage is reviewed and agreed before the next one starts,
and no code is written until the design is complete.

| Stage | Document | Status |
|---|---|---|
| 1. Foundations: vision, audience, principles, launch scope | [01-foundations.md](01-foundations.md) | Agreed 2026-09-25 |
| 2. App map: every screen and how you move between them | [02-app-map.md](02-app-map.md) | Agreed 2026-09-25 |
| 3. Key journeys: first launch, asking, approving, following work, results | [03-journeys.md](03-journeys.md) | Agreed 2026-09-25 |
| 4. Every screen in detail, including empty, loading, error and offline states | [04-screens.md](04-screens.md) | Agreed 2026-09-25 |
| 5. Design system: colour, type, spacing, components, icons, motion, accessibility | [05-design-system.md](05-design-system.md) | Agreed 2026-09-25 |
| 6. Technical design: part 1 the system; part 2 running it safely | [06-technical-design.md](06-technical-design.md) | Agreed 2026-09-25 |
| 7. Build plan: small slices, each working and verified before the next | — | Not started |

Stages 2 to 5 come with clickable phone mockups.

Reference images collected for inspiration, and what we take from them and leave behind, are in
[references/](references/README.md).

## Rules for building Agent V

Set by the owner. They apply to every stage, and bind the technical design (stage 6), the
build plan (stage 7) and all code that follows.

1. **No demos in the production app.** Nothing that ships contains sample data, demo
   accounts, mock services, canned or simulated responses, placeholder screens or features that
   only look like they work. Every screen in the app runs on real data from real services.
   The example person and content on the design canvas (Ajay, his jobs and emails) exist only
   in the design prototypes and never ship.
2. **Quality over quantity.** Only high-quality, fast and reliable code; no unnecessary bloat,
   clutter or complexity. Problems get real root-cause fixes, never workarounds.
3. **Working end to end.** Everything is fully functional, wired together and verified end to
   end before it counts as done: every screen, button and link leads where it should, and every
   action does what it says.
4. **Documented properly.** Every decision, rule and part of the system is written down where
   the next person will look for it.
5. **Ask or recommend; don't rush.** Choices that belong to the owner are asked, with a
   recommendation. Each stage is reviewed and agreed before the next starts.
6. **Everything custom, built by us.** The agent is our own code: its loop, planning, tools,
   tool calling, streaming, retries and record. No AI agent SDK or framework is used (for
   example the Vercel AI SDK, LangChain, LlamaIndex, Mastra, the OpenAI Agents SDK or the Claude
   Agent SDK), and no AI vendor's client library: every AI provider is called over plain HTTPS
   by our own small client. We don't buy what we can build: the cloud browser, the live view and
   Take control, and saved logins run on our own infrastructure, as our own code. Services that
   can't be replaced by anyone's code (the person's own AI provider, including the web search,
   page reading and code sandbox it offers on their key; Gmail and Outlook for their accounts;
   Apple and Google for sign-in and push notifications) are called by our own small clients over
   their standard protocols and REST APIs. Only
   general-purpose libraries are used, such as a Postgres driver, Playwright to drive a browser
   over the Chrome DevTools Protocol, and a PDF library. *Set by the owner on 2026-09-25.*

### How the design prototypes follow these rules

The prototypes are for deciding the design, not for shipping. Even so, every link and button on
the canvas pages "New direction", "Stage 4 · States" and "Stage 5 · Dark appearance" works: it goes
to its screen, or does its job in place (with Undo where D65 says so). Things that happen outside
the app, such as the phone's share sheet or Settings, say in a short bar what would open. This is
checked by automated tests that open every screen in a browser with the canvas's own runtime,
click every link, run every in-place action and measure the contrast of every piece of text. The
source and the checks are in [prototype/](prototype/README.md).

## How decisions are recorded

Every decision has an ID (D1, D2, …) in the decision log at the end of the stage where it was
made, with the reason. A later decision that changes an earlier one says so and links back;
nothing is edited away silently. Questions that belong to a later stage are listed as open
questions with the stage that will answer them.
