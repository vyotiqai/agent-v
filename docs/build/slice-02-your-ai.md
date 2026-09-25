# Slice 2 — Your AI

**Status:** in progress, local part first (D136). Started on 2026-09-25.

Slice 2 connects the person's own AI provider (stage 7, section 3): our own clients for the four
wire formats, with streaming and our own kinds of failure; checking a key and reading the model
list; choosing models; the monthly limit; the Brave Search key; the getting-started screens; and
You → Your AI.

## What it delivers

| Part | Where | Status |
|---|---|---|
| The four provider clients, streaming, error kinds, usage | `server/src/ai/` | Written; requests and refusals tested; the answers are tested against the real providers once the owner's test keys are in place |
| Calls out on someone's behalf, always through the egress gateway | `server/src/egress/client.ts` | Done and tested |
| Cloud KMS and the key bucket, for keeping keys encrypted | `server/src/crypto/cloud.ts` | Written and tested for what they send; against Google Cloud on staging |
| The recommended models and their prices | `server/src/ai/catalog.ts` | Done: chosen from the providers' current models (D155); prices checked against the published ones every night |
| The real-provider check and the captured responses | `server/live/`, `.github/workflows/providers.yml`, `server/src/ai/captures/` | Done; waits for the owner's test keys |
| Keys (checked, stored encrypted), models, the monthly limit, the Brave key: tables and API | `server/`, `shared/` | Next |
| Getting started (Connect your AI, Get a key, Paste your key, Choose models), You, Your AI, Key declined | `app/` | After the API |

## How it was verified

| Check | Result (2026-09-25) |
|---|---|
| The egress client (`server/src/egress/client.test.ts`), through a real gateway to a real HTTPS server | 8 passing: a call is tunnelled with TLS end to end and comes back whole; a POST carries its body; an address inside our own network, and a name that doesn't resolve, are refused and say so; only `https:` without a user name or password is called; an untrusted certificate fails; an answer that doesn't start in time, and silence in the middle of one, end as timeouts; the caller's signal stops a call before or during the answer |
| Server-sent events (`server/src/ai/sse.test.ts`) | 4 passing: named and unnamed events, several data lines, comments and all three line endings; the same stream split at every byte (and one byte at a time) reads the same, multi-byte characters included; an unfinished event is dropped; an endless line or event ends the stream |
| What each client sends, and how it reads refusals (`server/src/ai/requests.test.ts`) | 9 passing: each client's request in its provider's format; a model's own turn sent back unchanged to the same model, and converted (without its reasoning) for another; tool results first for Anthropic; nine-character call ids for compatible servers; each provider's refusals turned into our kinds, including Google's ordinary rate limit (which mentions billing) not being taken for running out of credit, and the provider's requested wait |
| Cloud KMS, the key bucket and the metadata token (`server/src/crypto/cloud.test.ts`) | 4 passing, for what they send and how they read Google's answers |
| Prices (`server/src/ai/catalog.test.ts`) | A call's cost counts fresh input, cache reads and writes, and output, each at its own price; the catalog recommends models for jobs and quick steps |
| A declined key, against the real providers from GitHub's machines (`server/live/`) | Anthropic, OpenAI and Google each decline a key that isn't valid, and our client says so; their real answers are captured (`server/src/ai/captures/`) and replayed by every test run |
| The catalog's prices against the published ones (`server/live/prices.ts`) | Anthropic's, OpenAI's and Google's recommended models match OpenRouter's published per-token prices |

## Decisions made in this slice

| ID | Decision | Why |
|---|---|---|
| D147 | Google's models are called through the Gemini **Interactions API**, with `store: false` and the whole conversation sent each time. Settles the choice stage 6 (section 5) left to this slice | Google's recommended API since June 2026; its stateless mode keeps nothing on Google's side, so the conversation lives only in our record |
| D148 | Every call made on someone's behalf (their AI provider, their custom endpoint, their search key) goes through the egress gateway, tunnelled, with TLS end to end between us and the provider; the server has no other way to call out for someone. A custom endpoint must be `https:`. **Adds to stage 6, section 5** | Enforced in code, not left to settings: a custom endpoint can't reach our own network whatever name it is given; the gateway never sees keys or conversations; a key never crosses the internet in the clear, so a self-hosted model must be served over https |
| D149 | A model's turn is kept two ways: exactly as the provider returned it, sent back unchanged to the same provider and model (thinking, reasoning and their signatures included), and in our own words (text and tool calls), sent to any other provider or model | Providers require their reasoning back unchanged, and only the model that made it can use it; a conversation can still move to another provider when a key is replaced |
| D150 | Provider failures are eight kinds: the five people are told about (key declined, no credit, rate-limited, model gone, provider down), and unreachable, address not allowed (custom endpoints) and bad request. Unreported usage is kept as unknown, never as zero. **Refines stage 6, section 5** | "Couldn't reach Anthropic" and "that address isn't on the public internet" need their own words; a zero would show a false $0 |
| D151 | The clients are checked against the real providers with the owner's test keys, kept as GitHub repository secrets, in a Providers check that runs when the clients change, every night and on request. Real responses are captured there, dated, kept in the repository and replayed by every test run, which also checks that each request is the one captured. **The owner's choice** (test keys as GitHub secrets) | Stage 6, section 22: unit tests against real captured responses; nothing is imitated. Captures are made only on GitHub's machines, whose network reaches the providers directly |
| D152 | The OpenAI-compatible format is checked against every endpoint the owner adds (`COMPATIBLE_TEST_ENDPOINTS`), not one chosen provider. **The owner's choice** | The format has to work with any compatible endpoint, and the owner decides which to test |
| D153 | The catalog's prices are checked in the Providers check against the per-token prices OpenRouter publishes for the same models; a difference fails the check. A model not in the catalog shows usage without a cost | A price table kept by hand goes stale; this one is checked against a published source every night |
| D154 | In slice 2, signing in continues to getting started while no key works yet, with "Not now" (D46); afterwards, and once a key works, the app lands on You, showing only the rows that work so far (Your AI; Privacy and your data) with the name and email from Google. Today takes over in slice 3. **Replaces D138. The owner's choice** | The next screens of J1 belong to this slice; a screen whose slice hasn't come isn't in the app |
| D155 | The models recommended in Choose models: Anthropic, Claude Sonnet 5 for jobs (Claude Opus 5.5 the more capable) and Claude Haiku 4.5 for quick steps; OpenAI, GPT-6 Sol for jobs (GPT-6 Astra the more capable) and GPT-6 Luna for quick steps; Google, Gemini 3.8 Flash for jobs and Gemini 3.1 Flash-Lite for quick steps. Any other model a provider lists can still be picked | Each provider's current models at a similar place in its range, from the list and prices the Providers check read on 2026-09-25. Google's Pro model is only a preview, which Google may withdraw, so it isn't recommended |
