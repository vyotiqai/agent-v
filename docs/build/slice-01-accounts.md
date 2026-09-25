# Slice 1 — Accounts

**Status:** local part done on 2026-09-25 (the Android build compiles in CI). It is done when real
Google sign-in works on staging, which waits for slice 0's cloud part, and on a real phone, which
waits for the domain (D124).

Slice 1 is signing in and out (stage 7, section 3): Sign in with Google; sessions with rotating
tokens; each phone and its signing key; the Welcome screen; signing out, on this phone and on
others. Sign in with Apple arrives with the iPhone slice (D125).

## What it delivers

| Part | Where | Status |
|---|---|---|
| Your phones on Privacy and your data, designed | `docs/design/04-screens.md`, the canvas | Done (D137) |
| The account tables, Google sign-in, sessions, phones, sign-out | `server/`, `shared/` | Done and tested locally; real Google sign-in is checked on staging |
| Welcome, Privacy and your data (phones and sign-out), sign-in on the phone, the phone's signing key | `app/` | Done and tested in a browser and against the real API; the native modules compile in CI; on a real phone once there is a build |
| Real Google sign-in on staging; a copied refresh token signs that phone out; the key never leaves the phone | Staging, a real Android phone | Waits for slice 0's cloud part and a phone build |

## How it was verified

| Check | Result (2026-09-25) |
|---|---|
| Unit tests: Google's tokens (`server/src/auth/google.test.ts`) | 6 passing: a good token gives Google's id, a verified email and the name; 14 kinds of bad token are refused (wrong nonce or none, another app's audience, another issuer, expired, from the future, not yet valid, no subject, signed by another key, an unknown key, `alg: none`, `alg: HS256`, malformed, claims changed after signing); Google's keys are kept as long as Google says, fetched again for a new key at most once a minute, and known keys keep working while Google can't be reached |
| Unit tests: shared checks (`shared/src/accounts.test.ts`) | 3 passing: phones, sign-in and refresh bodies accepted only in the right shape |
| Google's real keys (`server/test/google-live.test.ts`) | Our reader takes every key Google publishes today |
| Integration tests (`server/test/accounts.test.ts`), PostgreSQL 17 | 12 passing, through the API: a person is made once and a phone per sign-in, listed with this phone first; a nonce works once and must be ours; bad tokens, non-P-256 keys and bad bodies are refused; no valid access token means 401; a refresh token is used once and the old access token stops; **a copied refresh token signs that phone out**, for the copy and the phone alike, and is recorded; signing out ends the session; a phone signs out another of the same person's and never someone else's; 20 sign-in attempts a minute per address; bodies must be small JSON; tokens are stored only as hashes and never logged, nor are names or emails; spent nonces are tidied |
| The server image (`server/scripts/smoke-image.sh`) | Builds with the shared package; migrate applies the account tables; the API is ready |
| The app's client against the real API (`server/test/app-client.test.ts`) | 5 passing: signing in keeps only the refresh token, and the next launch is signed in; an expired access token is refreshed **once**, however many requests need it at the same moment; signed out from another phone, the app is told once and forgets the session; a copied refresh token, used after the phone moved on, signs the phone out; signing out forgets the session even offline |
| The screens in a browser (`tools/gallery/interact.ts`) | Welcome: a failed sign-in says so with Try again; a cancelled one says nothing; a phone without a screen lock is told why. Privacy: signing out another phone asks, then removes it and says so; Cancel closes the question; signing out here asks; phones that didn't load say so with Try again |
| The screens against the canvas | Welcome and Privacy and your data, side by side with the canvas in light and dark: the same, apart from what the slice leaves out (Apple, the Back button, and the rows of later slices). Fixed on the way: Welcome's light was too tight (a CSS circle gradient reaches the corners); the settings title sat 4px low |
| The components still match the design system (`tools/gallery/compare.ts`) | 48 comparisons, all match |
| The app compiles (`expo export`, and the Android build in CI) | Bundles for both phones; the native Android project, with our Kotlin modules, is compiled by CI |

## Decisions made in this slice

| ID | Decision | Why |
|---|---|---|
| D136 | A slice's local part may start while an earlier slice's cloud part waits for the owner's outside steps; each slice is still done only when all of stage 7, section 1 is true, including staging. **Changes D117** | The owner's choice on 2026-09-25: the Google Cloud billing account comes later, and the build shouldn't stand still meanwhile |
| D137 | The phones signed in to an account are listed on Privacy and your data, under "Your phones": "This phone" marked, the others with when they were last used, each with Sign out, which asks first and can't be undone. **Adds to stage 4** | The owner's choice. Stage 6 promised the list (section 3) but no screen showed it; it sits beside Sign out, where people look for it |
| D138 | Until slice 2, signing in lands on Privacy and your data, showing only what works: your phones and Sign out. From slice 2, signing in continues to Connect your AI as designed (J1). *Replaced by [D154](slice-02-your-ai.md#decisions-made-in-this-slice) in slice 2* | The owner's choice: the next screen of J1 belongs to slice 2, and a screen whose slice hasn't come isn't in the app |
| D139 | Each sign-in is one `phones` row, holding the phone's session (its access token hash and expiry) and its signing key; refresh tokens are rows of their own, kept after use so a second use is recognised. Stage 6's separate `devices` and `sessions` (section 12) are this one table | A phone that signs out and in again gets a new key, so phone and session always go together; one table can't disagree with itself |
| D140 | Access and refresh tokens are random 32-byte values, stored only as SHA-256 hashes; an access token is checked against the database on each request | Signing out, on this phone or from another, takes effect at once; there is no signing key for tokens to keep safe |
| D141 | A sign-in carries a one-time nonce from the API inside Google's token; the nonce is used up by the sign-in | A Google token caught on the way can't be replayed to sign in |
| D142 | The phone's signing key is P-256 (the only curve the iPhone's Secure Enclave offers, and one every Android chip does); the API refuses any other | One kind of key to check, on both phones |
| D143 | Security events (signed in, signed out, a phone signed out from another, a copied token) are recorded from slice 1, though they are shown in slice 11 | So the list in You → Privacy is complete from the first sign-in |
| D144 | On Android at launch, Continue with Google is the one sign-in button, so it takes the main button's look (light on the dark screen) | With Apple arriving in slice 13 (D125), it is the only choice, and a screen's one main action looks like one |
| D145 | Signing in needs a screen lock on the phone; without one, Welcome says: "Set a screen lock on this phone first. Agent V uses it when you sign for something." | The phone's signing key must ask for the fingerprint, face or PIN on every use (D92), and Android makes such a key only on a phone with a screen lock |
| D146 | The app refreshes its session one request at a time, and forgets it (with the signing key) as soon as the API says the phone is signed out | Two refreshes at once would look like a copied token and sign the phone out (D96) |
