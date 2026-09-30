# Legal texts: owner sign-off

The privacy policy (`/privacy`) and the terms (`/terms`) were rewritten for the new platform (phase 4 task 4). The Dutch text is the one that prevails. It lives in `packages/i18n/src/legal/nl.ts`; the English and French texts (`en.ts`, `fr.ts`) translate it and say so on the page.

**The owner must approve this list before any develop → master merge.** Each item describes an old → new change. Sections not listed are unchanged apart from formatting, and links are now clickable.

## Open decisions

1. **Effective date.** `LEGAL_EFFECTIVE_DATE` (`packages/i18n/src/legal/index.ts`) is the "Laatst bijgewerkt" date of both pages. It is set to 2026-09-30 for now; set the real date at cutover. It no longer depends on the consent version, so changing it never asks anyone for consent again.
2. **Consent history on account deletion.** Deleting an account also deletes its consent history (the log of analytics yes/no decisions), so nothing proves a past consent afterwards. Confirm that this is intended, or keep the log after deletion (a data-model change).
3. **Renewal price wording (terms, sponsoring).** The text says a renewal costs "the price then shown". DECISIONS (D-RENEW) says renewals cost the same price (€50 per gesture, +€10 with a logo). Choose which of the two the text should say.

Also for the owner:
- **Consent version:** `CONSENT_POLICY_VERSION` was **not** bumped, so existing "yes" answers stay valid. What analytics measures did not widen, and less is sent (user id only, no name or email). Confirm this, or bump it (everyone who said yes is asked again).
- **Store links:** the app banner uses text and icons, not the official App Store / Google Play badges. The badges are a design choice.
- **Complaint links:** the English and French pages link to the home page of the Belgian Data Protection Authority, not to its complaint page. Verify these deep links online before swapping them in: `https://www.dataprotectionauthority.be/citizen/actions/lodge-a-complaint` and `https://www.autoriteprotectiondonnees.be/citoyen/agir/introduire-une-plainte`.

## Promises that need work before cutover

The text states retention periods that must be true on day one (PROGRESS carries them into phase 6):
- admin logs are kept for at most 3 years: needs a scheduled purge of `audit_log`;
- expired sessions, codes and links are erased within 30 days: needs a scheduled purge of expired `session` and `verification` rows.

## Privacy policy

**Date**
- **P1.** The date changes from "8 juli 2026" to `LEGAL_EFFECTIVE_DATE` (see open decision 1).

**Section 3: Welke gegevens**
- **P2. Account.** Was "WorkOS-gebruikers-ID, e-mailadres, naam, rol, sessie- en accounttijdstippen". Now "Account en aanmelding" covers:
  - name, email address and whether it is verified;
  - language and role;
  - optionally a profile photo from Google or Apple;
  - sessions, with IP address and browser or app details, and timestamps;
  - passwords, stored only as an irreversible hash, and passkeys, stored only as their public key;
  - with Google or Apple sign-in, the account ID, name and email address they send us.
- **P3. Guests.** Removed: the random guest ID, the last activity, and favorites and lists kept in Convex. Now "Gebruik zonder account": favorites, lists, recent searches, preferences and the analytics choice stay on the device and never leave it. There are two exceptions: an import after sign-in, and the optional analytics (for example, which gesture was viewed or saved).
- **P4. Learning.** "Deelinstellingen en deelcodes" becomes "deellinks en hun rechten (bekijken of bewerken)".
- **P5. Sponsoring.** "Overlaytekst" becomes "weergavenaam", and "voorbeeldvideo's" becomes "voorbeeld- en eindvideo's".
- **P6. Technical data.** Added: Cloudflare Turnstile checks that a request comes from a human. It applies to sign-in, sign-up, password reset and other forms, such as asking for a sign-in code or link.
- **P7. New: Toestemmingsgeschiedenis.** For signed-in users, each analytics choice is kept (yes or no, time and policy version) as proof.
- **P8. Analytics.** Now "geen zoektermen, namen of e-mailadressen". The text also says that the IP address and browser or app details go with the events (see section 6).

**Section 4: Doeleinden en rechtsgronden**
- **P9. Overeenkomst.** "Gastmodus" is removed.
- **P10. Gerechtvaardigd belang.** Now "fraude- en misbruikpreventie (zoals Turnstile en limieten op het aantal verzoeken)". "Misbruikonderzoek" was dropped.

**Section 5: Ontvangers**
- **P11.** Removed: WorkOS, Convex and "E-mail- en queue-infrastructuur".
- **P12.** Added:
  - **Cloudflare:** Workers, D1, R2 (sponsor logos), KV, Queues, rendering sponsor videos with the name and logo (Workflows, Containers), Email and Turnstile. Links to Cloudflare's privacy policy.
  - **Better Auth:** self-hosted open-source software; no data goes to a separate provider for it.
  - **Google and Apple:** only if you choose to sign in with them.
- **P13.** Mux, Mollie, Expo and OpenPanel (self-hosted at analytics.zias.be) are unchanged.

**Section 6: Analytics en identificatie (rewritten)**
- **P14.** Old: an anonymous device profile on the website until sign-in; a guest profile in the app; after sign-in, linked to the WorkOS ID, name and email.
- **P15.** New:
  - Analytics is off by default.
  - With consent, the website sends events through our own server to our self-hosted OpenPanel, without third-party scripts or cookies.
  - Our server passes on the **IP address and browser details (user agent)**. OpenPanel derives a **pseudonymous** device profile and an **approximate location** (country and region) from them. Our server does not keep that data for this purpose.
  - The app sends events directly to the same OpenPanel installation, with a pseudonymous device ID.
  - After sign-in, the profile is linked **only to the user ID**; name and email are not sent.
  - Signing out or withdrawing consent clears the identity.

**Section 8: Cookies en lokale opslag**
- **P16. Cookies.** Now also discloses the language and theme cookies.
- **P17. Local storage.** Now "favorieten en lijsten zonder account, recente zoekopdrachten, voorkeuren, appcache, analyticskeuze". The app-banner dismissal is included under preferences.
- **P18. OpenPanel on the device.** Only the app may keep local identification and queue data. The website keeps only a temporary marker in the browser's session storage while signing in, so that a completed sign-in is counted once.

**Section 9: Bewaartermijnen**
- **P19.** Removed: "Gastaccounts … na 12 maanden inactiviteit verwijderd".
- **P20.** Kept:
  - admin logs for at most 3 years (needs the purge, see above);
  - unpaid requests cancelled after 24 hours;
  - payment, sponsor and invoice data for up to 10 years;
  - analytics data for the retention period set in OpenPanel.
- **P21.** New:
  - account data, favorites, lists and **consent history** are kept while the account exists;
  - a **session** expires 7 days after the Service was last used, or at sign-out;
  - **sign-in codes and links** are single-use and valid for 5 minutes;
  - **verification and reset links** are valid for 1 hour;
  - expired sessions, codes and links are **erased within 30 days** (needs the purge, see above).

**Section 10: Accountverwijdering (rewritten)**
- **P22.** Old:
  - deletes the account, favorites and own lists from Convex;
  - unlinks or anonymises admin references;
  - WorkOS and other providers follow their own deletion cycle;
  - sponsor and payment data are not necessarily erased.
- **P23.** New:
  - deletion happens on the account page and is immediate;
  - it deletes the account, sessions, sign-in methods and passkeys, favorites, own lists with their share links, and the consent history (open decision 2);
  - in admin logs the person is unlinked **as the actor**; admin logs about their account remain until the end of their retention period;
  - the person is signed out on every device, and the device used is cleared;
  - sponsor, payment and invoice data are not linked to the account and are kept as the law requires;
  - backups and separate providers follow their own deletion cycles.

**Section 11: Uw rechten**
- **P24.** The account page is now a link, and the export is described as "(JSON)".

**Section 13: Beveiliging**
- **P25.** Added "gehashte wachtwoorden".

**Translations**
- **P26.** New full English and French translations, with a notice that the Dutch version prevails and a link to show the Dutch text on the same page.

**Unchanged**
- **P27.** The controller and contact details: SMOG & CO vzw, the address, the company number, info@smog.vlaanderen and 03/216 29 90. Sections 1, 7, 12, 14, 15 and 16 are unchanged.

**Consent version**
- **P28.** `CONSENT_POLICY_VERSION` was not bumped (confirm; see above).

## Terms

- **T1.** The date changes from "10 juni 2026" to `LEGAL_EFFECTIVE_DATE` (open decision 1).
- **T2. Section 2.** "Gastgebruik" becomes "gebruik zonder account".
- **T3. Section 3.**
  - The title becomes "Accounts en gebruik zonder account".
  - "Via WorkOS" is replaced by the sign-in methods: email with a password, a code or a sign-in link, a passkey, or a Google or Apple account.
  - Without an account, favorites and lists are kept on the device only. They disappear when the browser or app data is cleared, and they can be imported after sign-in.
  - Sharing a list requires an account.
  - "Via de instellingen" becomes "via de accountpagina".
- **T4. Section 6: Sponsoring.**
  - SMOG&Co reviews **the sponsored video** before publication.
  - The re-edit link is personal and **valid for 7 days**.
  - New: about 30 days before the end of the term, an email arrives with a renewal link. A renewal is a new payment for one more year "at the price then shown" (open decision 3). A sponsorship is **never renewed automatically**.
- **T5. Section 13.** The email address is now a link. There is no substantive change.
- **T6.** New English and French translations.
- **T7.** Sections 1, 4, 5, 7–12, 14 and 15 are unchanged.
