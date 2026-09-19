# Payload Migration Plans

**Spec:** [`../specs/2026-09-19-payload-migration-design.md`](../specs/2026-09-19-payload-migration-design.md)

Eleven stages. Each produces working, testable software on its own and each has
its own plan document, per `superpowers:writing-plans`.

| # | Stage | Plan | Depends on |
|---|---|---|---|
| 0 | Foundation and spikes | [`2026-09-19-stage-0-foundation.md`](./2026-09-19-stage-0-foundation.md) | — |
| 1 | Content model | [`2026-09-19-stage-1-content-model.md`](./2026-09-19-stage-1-content-model.md) | 0 |
| 2 | Design system | [`2026-09-19-stage-2-design-system.md`](./2026-09-19-stage-2-design-system.md) | 0 |
| 3 | Public web | written when Stage 2 lands | 1, 2 |
| 4 | Auth | written when Stage 3 lands | 1, 2 |
| 5 | Sponsorships | written when Stage 4 lands | 1, 4 |
| 6 | Video pipeline | written when Stage 0 gate 1 resolves | 0 gate 1, 5 |
| 7 | Email and jobs | written when Stage 5 lands | 5 |
| 8 | Native | written when Stage 4 lands | 4 |
| 9 | Data migration | written when Stages 1, 4, 5 land | 1, 4, 5 |
| 10 | Cutover | written when Stage 9 lands | all |

## Why later plans are not written yet

The spec names three unresolved gates in Stage 0: Remotion in a Cloudflare
Container, Worker bundle size, and bun compatibility with Payload's CLI. A
detailed plan written around an unverified assumption is fiction, and Stage 6
in particular changes shape entirely if the container gate fails and rendering
falls back to Remotion Lambda.

Stages 3 through 5 also consume interfaces that Stages 1 and 2 define. Writing
their step-level code now would mean inventing component and collection
signatures that the earlier stages have not yet settled, which is exactly the
type-drift failure the writing-plans self-review exists to catch.

Each plan is written as its predecessor lands, from the interfaces that
actually shipped.
