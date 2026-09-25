# Captured provider responses

Real answers from each AI provider, recorded by the Providers check
(`.github/workflows/providers.yml`) with the owner's test keys, and replayed by
`../replay.test.ts` on every change (stage 6, section 22). Nothing here is made up: every file is
what a provider really sent, with the date it was captured.

Each file is one exchange: the request as we sent it (without its headers, so without the key)
and the response as it came. They are named `<provider>-<check>.json`, with `-2`, `-3` for the
later calls of a check that makes several (the tool check calls twice). The checks are defined
once, in `server/live/scenarios.ts`, for both the live run and the replay.

## Refreshing them

When a provider changes its format, or when what we send changes on purpose (the replay then
fails, since every request must be the one captured):

- run the Providers workflow by hand with **capture** ticked, or
- push a commit whose message contains `[capture providers]`.

The workflow replaces these files and commits them to the same branch. A push made by the
workflow doesn't start the other checks, so the next push of your own runs them against the new
captures.

Before any file is written, it is checked for every test key; a capture that would contain one
stops the run.
