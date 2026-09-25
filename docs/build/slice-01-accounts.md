# Slice 1 — Accounts

**Status:** in progress, local part first. Started on 2026-09-25, while slice 0's cloud part waits
for the Google Cloud billing account (D136).

Slice 1 is signing in and out (stage 7, section 3): Sign in with Google; sessions with rotating
tokens; each phone and its signing key; the Welcome screen; signing out, on this phone and on
others. Sign in with Apple arrives with the iPhone slice (D125).

## What it delivers

| Part | Where | Status |
|---|---|---|
| Your phones on Privacy and your data, designed | `docs/design/04-screens.md`, the canvas | Done (D137) |
| The account tables, Google sign-in, sessions, phones, sign-out | `server/`, `shared/` | Done and tested locally; real Google sign-in is checked on staging |
| Welcome, Privacy and your data (phones and sign-out), sign-in on the phone, the phone's signing key | `app/` | Next |
| Real Google sign-in on staging; a copied refresh token signs that phone out; the key never leaves the phone | Staging, a real Android phone | Waits for slice 0's cloud part and a phone build |

## How it was verified

| Check | Result (2026-09-25) |
|---|---|
| Unit tests: Google's tokens (`server/src/auth/google.test.ts`) | 6 passing: a good token gives Google's id, a verified email and the name; 14 kinds of bad token are refused (wrong nonce or none, another app's audience, another issuer, expired, from the future, not yet valid, no subject, signed by another key, an unknown key, `alg: none`, `alg: HS256`, malformed, claims changed after signing); Google's keys are kept as long as Google says, fetched again for a new key at most once a minute, and known keys keep working while Google can't be reached |
| Unit tests: shared checks (`shared/src/accounts.test.ts`) | 3 passing: phones, sign-in and refresh bodies accepted only in the right shape |
| Google's real keys (`server/test/google-live.test.ts`) | Our reader takes every key Google publishes today |
| Integration tests (`server/test/accounts.test.ts`), PostgreSQL 17 | 12 passing, through the API: a person is made once and a phone per sign-in, listed with this phone first; a nonce works once and must be ours; bad tokens, non-P-256 keys and bad bodies are refused; no valid access token means 401; a refresh token is used once and the old access token stops; **a copied refresh token signs that phone out**, for the copy and the phone alike, and is recorded; signing out ends the session; a phone signs out another of the same person's and never someone else's; 20 sign-in attempts a minute per address; bodies must be small JSON; tokens are stored only as hashes and never logged, nor are names or emails; spent nonces are tidied |
| The server image (`server/scripts/smoke-image.sh`) | Builds with the shared package; migrate applies the account tables; the API is ready |

## Decisions made in this slice

| ID | Decision | Why |
|---|---|---|
| D136 | A slice's local part may start while an earlier slice's cloud part waits for the owner's outside steps; each slice is still done only when all of stage 7, section 1 is true, including staging. **Changes D117** | The owner's choice on 2026-09-25: the Google Cloud billing account comes later, and the build shouldn't stand still meanwhile |
| D137 | The phones signed in to an account are listed on Privacy and your data, under "Your phones": "This phone" marked, the others with when they were last used, each with Sign out, which asks first and can't be undone. **Adds to stage 4** | The owner's choice. Stage 6 promised the list (section 3) but no screen showed it; it sits beside Sign out, where people look for it |
| D138 | Until slice 2, signing in lands on Privacy and your data, showing only what works: your phones and Sign out. From slice 2, signing in continues to Connect your AI as designed (J1) | The owner's choice: the next screen of J1 belongs to slice 2, and a screen whose slice hasn't come isn't in the app |
| D139 | Each sign-in is one `phones` row, holding the phone's session (its access token hash and expiry) and its signing key; refresh tokens are rows of their own, kept after use so a second use is recognised. Stage 6's separate `devices` and `sessions` (section 12) are this one table | A phone that signs out and in again gets a new key, so phone and session always go together; one table can't disagree with itself |
| D140 | Access and refresh tokens are random 32-byte values, stored only as SHA-256 hashes; an access token is checked against the database on each request | Signing out, on this phone or from another, takes effect at once; there is no signing key for tokens to keep safe |
| D141 | A sign-in carries a one-time nonce from the API inside Google's token; the nonce is used up by the sign-in | A Google token caught on the way can't be replayed to sign in |
| D142 | The phone's signing key is P-256 (the only curve the iPhone's Secure Enclave offers, and one every Android chip does); the API refuses any other | One kind of key to check, on both phones |
| D143 | Security events (signed in, signed out, a phone signed out from another, a copied token) are recorded from slice 1, though they are shown in slice 11 | So the list in You → Privacy is complete from the first sign-in |
