# Payment and Sponsorship Flow

> Last updated: June 10, 2026

## Purchase

1. The sponsor selects one or more gestures.
2. The sponsor enters contact details, display text, an optional logo, and
   optional invoice details.
3. The API asks Remotion to compose preview videos and stores the resulting Mux
   playback IDs.
4. Convex creates `pending_payment` sponsorship rows. The server calculates the
   authoritative amount from shared pricing rules.
5. The API creates a Mollie payment and redirects to Mollie's hosted checkout.
6. Mollie posts the payment ID to `/webhooks/mollie`.
7. The server retrieves the payment from Mollie and processes it only when
   Mollie reports `paid`.
8. Sponsorships move to `pending_approval`; confirmation/admin emails are
   queued.
9. An admin approves or rejects the content.

## Approval

Approval activates the sponsorship, publishes the sponsored Mux playback ID,
and sends a live confirmation. Rejection records a reason and triggers
correspondence with the sponsor.

Active sponsorships expire after one year in the current flow. The server sends
one renewal reminder approximately 30 days before expiry. Expiry restores the
original gesture video and deletes the sponsored Mux asset when possible.

## Incomplete Payments

The server checks hourly for `pending_payment` rows older than 24 hours and
marks them `cancelled`, freeing the gesture for another sponsor.

## Re-Edit

An admin can generate a random re-edit token valid for 7 days. The sponsor can
update approved fields without another payment. Submission invalidates the
token and returns the sponsorship to review.

## Pricing

Current constants in `packages/config/src/constants.ts`:

| Item | Amount |
|---|---:|
| One gesture for one year | EUR 50.00 |
| Logo option per gesture | EUR 10.00 |

Convex repeats the calculation before creating records; never trust a
client-provided total as the source of truth.

## Data and Security

- `MOLLIE_API_KEY` is server-only.
- Mollie collects card/bank details; SMOG stores the Mollie payment ID, amount,
  status, sponsor contact details, and requested invoice details.
- The webhook fetches payment state from Mollie rather than trusting the
  incoming body.
- Sponsor and invoice records may need to be retained for Belgian accounting
  and tax obligations.

Use Mollie test credentials during development and follow Mollie's official
testing documentation.
