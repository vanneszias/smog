# Payload Migration Plans

**Spec:** [`../specs/2026-09-19-payload-migration-design.md`](../specs/2026-09-19-payload-migration-design.md)

Eleven stages. Each produces working, testable software on its own and each has
its own plan document, per `superpowers:writing-plans`.

| # | Stage | Plan | Depends on | Status |
|---|---|---|---|---|
| 0 | Foundation and spikes | [`2026-09-19-stage-0-foundation.md`](./2026-09-19-stage-0-foundation.md) | — | landed |
| 1 | Content model | [`2026-09-19-stage-1-content-model.md`](./2026-09-19-stage-1-content-model.md) | 0 | landed |
| 2 | Design system | [`2026-09-19-stage-2-design-system.md`](./2026-09-19-stage-2-design-system.md) | 0 | landed |
| 3 | Public web | [`2026-09-20-stage-3-public-web.md`](./2026-09-20-stage-3-public-web.md) | 1, 2 | landed |
| 4 | Auth | [`2026-09-20-stage-4-auth.md`](./2026-09-20-stage-4-auth.md) | 1, 2 | landed |
| 5 | Sponsorships | [`2026-09-21-stage-5-sponsorships.md`](./2026-09-21-stage-5-sponsorships.md) | 1, 4 | landed |
| 6 | Video pipeline | [`2026-09-21-stage-6-video.md`](./2026-09-21-stage-6-video.md) | 0 gate 1, 5 | landed |
| 7 | Email and jobs | [`2026-09-21-stage-7-email-jobs.md`](./2026-09-21-stage-7-email-jobs.md) | 5 | landed |
| 8 | Native | [`2026-09-21-stage-8-native.md`](./2026-09-21-stage-8-native.md) | 4 | **landed** — nine of ten exit criteria; the tenth needs a device |
| 8.5 | Consent | **next** — write it now that Stage 8 has landed | 1, 4 | — |
| 9 | Data migration | written when Stages 1, 4, 5 land | 1, 4, 5, 8.5 | — |
| 10 | Cutover | written when Stage 9 lands | all | — |

"Landed" means the plan's exit assessment is appended to it with the
measurements, not that every criterion was met — each plan's own exit section
says which were not and why.

## Why a plan is written when its predecessor lands

A detailed plan written around an unverified assumption is fiction. Stage 6
changed shape entirely when Stage 0's container gate failed and rendering
moved to Remotion Lambda; every plan since has been written from the
interfaces that actually shipped rather than the ones the spec imagined.

That is not a formality. Stage 5's implementers found eight errors in their
plan by reading shipped source, Stage 6's found eight, and Stage 7's found
around twenty-eight — every one of them a signature or a behaviour the plan
had reasoned about instead of read. **When the plan and the code disagree,
the code is right**, and the task report is how the next plan gets less
wrong.

Stages 8.5, 9 and 10 remain unwritten for the same reason. Stage 8.5 must
land before Stage 9: `user-consents.analytics_consent` is
`NOT NULL DEFAULT false`, so an import into a table with no defined write
path cannot tell "no answer" from "declined" and would silently record a
refusal for every existing user.
