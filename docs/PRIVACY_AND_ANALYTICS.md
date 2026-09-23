# Privacy and Analytics

The public [privacy page](../apps/site/src/app/(frontend)/[locale]/privacy/page.tsx)
in `apps/site` is the canonical copy shown to visitors. Legal text should be
reviewed by qualified Belgian counsel before a material launch or
business-model change.

## Consent

Analytics is disabled by default on web and mobile. `apps/site` sends nothing
to its relay, and `apps/mobile` does not create its OpenPanel client, until the
stored consent is `granted`. Refusal leaves core functionality available.
Users can change their choice from the privacy page or the app's settings.

On withdrawal, new events stop, and on mobile the SDK's device and session ids
are cleared. Neither app identifies a signed-in account to OpenPanel. Withdrawal
does not itself erase historical events; handle deletion requests through the
privacy contact.

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
OPENPANEL_API_URL=https://analytics.zias.be/api
OPENPANEL_CLIENT_ID=
OPENPANEL_CLIENT_SECRET=

EXPO_PUBLIC_OPENPANEL_API_URL=https://analytics.zias.be/api
EXPO_PUBLIC_OPENPANEL_CLIENT_ID=
EXPO_PUBLIC_OPENPANEL_CLIENT_SECRET=
```

`apps/site` sends consent-gated analytics to its own relay,
`POST /api/analytics/track`, which forwards events to OpenPanel with
server-only credentials; `apps/mobile` sends straight to OpenPanel. Use separate web/native
OpenPanel clients. Treat the native secret as extractable from the compiled
application and scope it accordingly.

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

1. Confirm no analytics relay or OpenPanel request before consent.
2. Grant consent and navigate on web/native.
3. Verify screen and typed events in OpenPanel real-time view.
4. Confirm search terms and session replay are absent.
5. Sign in and confirm the events carry no account identifier.
6. Withdraw consent and verify no new events are sent.
