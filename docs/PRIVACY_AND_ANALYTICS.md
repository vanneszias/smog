# Privacy and Analytics

> Last updated: June 10, 2026

The public Dutch [privacy policy](../apps/web/src/routes/privacy.tsx) and
[terms](../apps/web/src/routes/terms.tsx) are the canonical legal copy. Legal
text should be reviewed by qualified Belgian counsel before a material launch
or business-model change.

## Data Inventory

| Area | Data |
|---|---|
| WorkOS account | user ID, email, name, session/token data |
| Guest mode | random guest ID and last activity |
| Learning | favorites, lists, list share tokens |
| Sponsorship | contact/sponsor identity, email, text/logo, videos, status |
| Payment/invoice | Mollie ID, amount, invoice name, VAT number, invoice email |
| Operations | admin logs, security/error logs, email queue payloads |
| Analytics | paths and typed events listed below, only after consent |

Recent search strings are stored locally on native. Analytics sends query
length and aggregate counts, not search text.

## Processors and Services

- WorkOS: authentication
- Convex: database, functions, and file storage
- Mux: video processing, hosting, and streaming
- Mollie: hosted payment processing
- Expo: native app distribution and updates
- SMTP/IMAP infrastructure: transactional email
- Redis/BullMQ: temporary email job queue
- OpenPanel software at `https://analytics.zias.be`: self-hosted product
  analytics; event data is not sent to OpenPanel Cloud

## Consent

Analytics is disabled by default on web and native. The SDK is not initialized
until stored consent is `true`. Refusal leaves core functionality available.
Users can change their choice from the privacy page or app settings.

On withdrawal, new events stop and the local SDK identity is cleared. Withdrawal
does not itself erase historical events; handle deletion requests through the
privacy contact.

## Identity

- Web visitors remain anonymous until authentication resolves.
- Native guests use `guest:<guestId>`.
- Authenticated users use the WorkOS user ID with email and name.
- Logout calls `clearAnalyticsIdentity`.

Do not add sensitive, free-text, payment, invoice, authentication, or search
content to analytics properties.

## Event Taxonomy

The single source of truth is `packages/shared/src/analytics.ts`:

- `gesture_viewed`
- `gesture_collection_changed`
- `search_performed`
- `video_playback_completed`
- screen views through each router integration

Add or change events in the shared map before instrumenting either app. Prefer
stable IDs, enums, booleans, and counts.

## Configuration

```env
VITE_OPENPANEL_API_URL=https://analytics.zias.be
VITE_OPENPANEL_CLIENT_ID=

EXPO_PUBLIC_OPENPANEL_API_URL=https://analytics.zias.be
EXPO_PUBLIC_OPENPANEL_CLIENT_ID=
EXPO_PUBLIC_OPENPANEL_CLIENT_SECRET=
```

The web must never receive a client secret. Use separate web/native OpenPanel
clients. Treat the native secret as extractable from the compiled application
and scope it accordingly.

## Retention

- Guest users, favorites, and lists: 12 months after inactivity
- Admin logs: 3 years
- Unpaid sponsorship attempt: cancelled after 24 hours
- Account/favorites/lists: until deletion or account removal
- Payment/invoice records: as required for the agreement and Belgian legal
  retention, up to 10 years where applicable
- Analytics: the configured OpenPanel retention, limited to product analysis

Changing a retention setting requires updating the public policy and this file.

## Legal References

- [Belgian Data Protection Act of July 30, 2018, Article 7](https://www.dataprotectionauthority.be/publications/act-of-30-july-2018.pdf):
  online consent age of 13 in Belgium
- [FPS Finance, accounting and invoicing](https://finance.belgium.be/en/enterprises/vat/accounting-invoicing/accounting-invoicing):
  ten-year retention for invoices and accounting documents
- [European Commission: valid consent](https://commission.europa.eu/law/law-topic/data-protection/rules-business-and-organisations/legal-grounds-processing-data/grounds-processing/when-consent-valid_en)
  and [lawful bases](https://commission.europa.eu/law/law-topic/data-protection/rules-business-and-organisations/legal-grounds-processing-data/grounds-processing/when-can-personal-data-be-processed_en)
- [European Commission: erasure exceptions](https://commission.europa.eu/law/law-topic/data-protection/rules-business-and-organisations/dealing-citizens/do-we-always-have-delete-personal-data-if-person-asks_en)
- [Belgian Data Protection Authority: complaint procedure](https://www.gegevensbeschermingsautoriteit.be/burger/acties/klacht-indienen)

## Verification

1. Confirm no OpenPanel request before consent.
2. Grant consent and navigate on web/native.
3. Verify screen and typed events in OpenPanel real-time view.
4. Confirm search terms and session replay are absent.
5. Sign in, verify identification, then log out and verify identity clearing.
6. Withdraw consent and verify no new events are sent.
