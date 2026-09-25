# Building Agent V

The build follows the plan agreed in [stage 7](../design/07-build-plan.md): 14 slices, each
working end to end and verified before the next starts (D117, D118). Each slice has a page here:
what it delivers, how it was verified, and the decisions made while building it, numbered on from
the design's (D126 onwards).

| Slice | Page | Status |
|---|---|---|
| 0. Foundations | [slice-00-foundations.md](slice-00-foundations.md) | Local part done; the cloud part waits for the Google Cloud billing account |
| 1. Accounts | [slice-01-accounts.md](slice-01-accounts.md) | Local part done; real Google sign-in waits for staging, and a phone build for the domain |
| 2. Your AI | [slice-02-your-ai.md](slice-02-your-ai.md) | In progress, local part first (D136) |
| 3–13 | — | Not started |

A slice is marked done only when everything in [stage 7, section 1](../design/07-build-plan.md#1-what-done-means-for-a-slice-d118)
is true, including working on staging with real services.
