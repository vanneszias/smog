import type { LegalTexts } from "./types";

/** The legal texts in English: a translation of `nl.ts`, which prevails. */
export const en: LegalTexts = {
  privacy: {
    sections: [
      {
        blocks: [
          'This privacy policy describes how SMOG & CO vzw processes personal data when you use the SMOG&Co website, mobile app, accounts, shared lists, sponsorship and related support (together: the "Service").',
        ],
        id: "scope",
        title: "Scope",
      },
      {
        blocks: [
          "SMOG & CO vzw, Arthur Goemaerelei 66, 2018 Antwerp, Belgium, company number 1009 954 991, is the data controller. You can send privacy questions to [info@smog.vlaanderen](mailto:info@smog.vlaanderen).",
        ],
        id: "controller",
        title: "Data controller",
      },
      {
        blocks: [
          {
            list: [
              "**Account and sign-in:** name, email address and whether it is verified, language, role, a profile picture from Google or Apple if any, sessions (with IP address and browser or app details) and timestamps. A password is only stored as an irreversible hash; for a passkey we only store its public key. If you sign in with Google or Apple, they send us an account ID, your name and your email address.",
              "**Use without an account:** favorites, lists, recent searches, preferences and your analytics choice stay on your device. They do not leave your device unless, after signing in, you choose to import them into your account, except for the optional analytics below (for example which gesture you viewed or saved).",
              "**Learning features:** favorite gestures, lists, list descriptions, share links and their rights (view or edit). Recent search terms stay locally on your device.",
              "**Sponsorship:** contact name, sponsor or company name, email, chosen gestures, display name, optional logo, preview and final videos, status, payment reference and term.",
              "**Invoicing:** invoice name, VAT or company number and invoice email address when you ask for an invoice. Mollie processes the payment details; SMOG&Co does not receive full card or bank details.",
              "**Technical data:** IP address, device, browser and app details, security logs, error information and data needed to deliver video and network traffic. When you sign in, sign up, reset your password or use other forms (such as asking for a sign-in code or link), Cloudflare Turnstile checks that the request comes from a human.",
              "**Consent history:** when you are signed in, we keep your analytics choices (yes or no, time and policy version), so we can show which choice applies.",
              "**Optional analytics:** only with consent: screen path, platform, limited event data, gesture IDs, result and category counts, the length of a search and completed playback, with your IP address and browser or app details (see Analytics and identification). We do not send search terms, names or email addresses and do not record sessions.",
            ],
          },
        ],
        id: "data",
        title: "What data we process",
      },
      {
        blocks: [
          {
            list: [
              "**Contract:** providing accounts, favorites, lists, shared lists, sponsorship, payments, video processing and transactional communication.",
              "**Legal obligation:** bookkeeping, invoicing, tax obligations and answering valid legal requests.",
              "**Legitimate interest:** security, fraud and abuse prevention (such as Turnstile and limits on the number of requests), administration, error diagnosis and improving the reliability of the Service. You can object to this.",
              "**Consent:** optional OpenPanel analytics. You can refuse or withdraw later without losing basic features.",
            ],
          },
        ],
        id: "purposes",
        title: "Purposes and legal bases",
      },
      {
        blocks: [
          "Only authorised staff and service providers that support the Service get access, as far as needed:",
          {
            list: [
              "**Cloudflare:** hosting of the website and the API (Workers), the database (D1), file storage such as sponsor logos (R2), temporary data (KV), queues (Queues), rendering sponsor videos with the name and logo (Workflows, Containers), sending email (Email) and abuse prevention (Turnstile). [Privacy policy](https://www.cloudflare.com/privacypolicy/)",
              "**Better Auth:** open-source sign-in software that we run ourselves inside our Cloudflare environment. No data goes to a separate provider for it.",
              "**Mux:** storage, processing and streaming of gesture and sponsor videos. [Privacy policy](https://www.mux.com/privacy)",
              "**Mollie:** hosted payment processing and payment status. [Privacy policy](https://www.mollie.com/legal/privacy)",
              "**Expo:** distribution and updates of the mobile app. [Privacy policy](https://expo.dev/privacy)",
              "**Google and Apple:** only when you choose to sign in with your Google or Apple account. [Google](https://policies.google.com/privacy) · [Apple](https://www.apple.com/legal/privacy/)",
              "**OpenPanel:** self-hosted analytics software at analytics.zias.be, only with analytics consent. The OpenPanel cloud is not used for our event data.",
            ],
          },
          "Personal data is not sold. We only share it on the basis of a contract, a legal obligation or another valid legal framework.",
        ],
        id: "recipients",
        title: "Recipients and service providers",
      },
      {
        blocks: [
          "Analytics is off by default. With consent, the website forwards events through our own server to our self-hosted OpenPanel installation, without third-party scripts or cookies. Our server passes on your IP address and browser details (user agent); OpenPanel derives a pseudonymous device profile and an approximate location (country and region) from them. Our server does not store that data for this purpose. The app sends events directly to the same OpenPanel installation, with a pseudonymous device ID. After you sign in, the profile is only linked to your user ID; your name and email address are not sent to analytics. Signing out or withdrawing consent clears the analytics identity. Withdrawing stops new measurements; data collected lawfully before is not deleted automatically. You can ask for its deletion at our contact address.",
        ],
        id: "analytics",
        title: "Analytics and identification",
      },
      {
        blocks: [
          "SMOG & Co does not track users across apps or websites of other companies. We do not use analytics data for targeted advertising or advertising measurement and do not share analytics data with data brokers.",
        ],
        id: "no-tracking",
        title: "No tracking or advertising",
      },
      {
        blocks: [
          {
            list: [
              "Necessary cookies keep your session active when you are signed in and remember your language and theme.",
              "Local storage keeps, among other things, favorites and lists without an account, recent searches, preferences, the app cache and your analytics choice.",
              "With analytics consent, the app may keep local identification and queue data to deliver events. The website only keeps a temporary marker in your browser's session storage while you sign in, so a completed sign-in is counted once.",
            ],
          },
          "You can change your analytics choice below at any time:",
          { consentControl: true },
        ],
        id: "cookies",
        title: "Cookies and local storage",
      },
      {
        blocks: [
          {
            list: [
              "Account data, favorites, lists and your consent history are kept as long as your account exists or until you delete them.",
              "Administration logs are kept for at most 3 years.",
              "A session expires 7 days after you last used the Service, or at once when you sign out. Sign-in codes and sign-in links are single-use and valid for 5 minutes; links to verify your email address or reset your password for 1 hour. Expired sessions, codes and links are erased within 30 days.",
              "Unpaid sponsorship requests are cancelled after 24 hours. Underlying technical files may disappear later, following operational backup and clean-up cycles.",
              "Payment, sponsor and invoice data is kept as long as needed for the contract and for up to 10 years when Belgian accounting or tax rules require it.",
              "Analytics data is kept according to the retention period set in our OpenPanel installation and no longer than needed for product analysis.",
            ],
          },
        ],
        id: "retention",
        title: "Retention periods",
      },
      {
        blocks: [
          "You can delete your account on the [account page](/account). This immediately deletes your account, sessions, sign-in methods and passkeys, favorites, your own lists with their share links and your consent history. In administration logs you are unlinked as the actor; administration logs about your account remain until the end of their retention period. You are signed out on every device and the data on the device you used is cleared. Sponsor, payment and invoice data is not linked to your account and is kept as long as the law requires (see Retention periods). Backups and data at separate service providers may follow their own deletion cycle.",
        ],
        id: "deletion",
        title: "Account deletion",
      },
      {
        blocks: [
          "Under the GDPR you can, depending on the circumstances, ask for access, rectification, erasure, restriction, portability or object. You can always withdraw consent and lodge a complaint with a supervisory authority. The [account page](/account) offers a machine-readable export (JSON) and account deletion. For other requests, email [info@smog.vlaanderen](mailto:info@smog.vlaanderen). We may ask for information to verify your identity.",
        ],
        id: "rights",
        title: "Your rights",
      },
      {
        blocks: [
          "Some service providers may process personal data outside the European Economic Area. Where needed, we use an adequacy decision, standard contractual clauses or another valid transfer mechanism and appropriate additional security measures.",
        ],
        id: "transfers",
        title: "International transfers",
      },
      {
        blocks: [
          "We use appropriate technical and organisational measures, including access restriction, encrypted connections, hashed passwords and protected secrets. No system is completely free of risk. In case of a notifiable incident we inform the competent authority and, when required, the people concerned.",
        ],
        id: "security",
        title: "Security and incidents",
      },
      {
        blocks: [
          "In Belgium, a child aged 13 or over can give consent themselves for an online service offered to them directly. If the applicable law requires the consent of a parent or guardian, it must be obtained. Contact us if you believe a child's data has been processed unlawfully.",
        ],
        id: "children",
        title: "Children",
      },
      {
        blocks: [
          "We may update this policy when the Service, suppliers or legislation change. The date at the top is updated, and we inform users of important changes in the app or through an appropriate channel. Where needed, we ask for consent again.",
        ],
        id: "changes",
        title: "Changes",
      },
      {
        blocks: [
          {
            lines: [
              "SMOG & CO vzw",
              "Arthur Goemaerelei 66, 2018 Antwerp, Belgium",
              "Email: [info@smog.vlaanderen](mailto:info@smog.vlaanderen)",
              "Phone: +32 3 216 29 90",
              "Company number 1009 954 991",
            ],
          },
          "You can also lodge a complaint with the [Belgian Data Protection Authority](https://www.dataprotectionauthority.be) or with your local supervisory authority.",
        ],
        id: "contact",
        title: "Contact and complaints",
      },
    ],
    title: "Privacy policy",
  },
  terms: {
    sections: [
      {
        blocks: [
          'These terms apply to the SMOG&Co website, mobile app, accounts, lists, sponsorship and related services (the "Service"), offered by SMOG & CO vzw, Arthur Goemaerelei 66, 2018 Antwerp, Belgium, company number 1009 954 991. By using the Service you agree to these terms. Mandatory consumer law always continues to apply.',
        ],
        id: "provider",
        title: "Application and provider",
      },
      {
        blocks: [
          "The Service offers a library of gesture videos, search and filters, favorites, your own and shared lists, use without an account, account synchronisation and the option to sponsor a gesture. Features may differ per platform.",
        ],
        id: "service",
        title: "Description of the Service",
      },
      {
        blocks: [
          "You can create an account with your email address (with a password, a code or a sign-in link), a passkey, or your Google or Apple account. You must provide correct information, keep your account secure and report misuse. Without an account, favorites and lists are only kept on your device; they disappear when you clear your browser or app data. After signing in you can import them into your account. Sharing a list requires an account. You can delete your account on the account page; legal retention obligations and separate sponsorship transactions may require further retention.",
        ],
        id: "accounts",
        title: "Accounts and use without an account",
      },
      {
        blocks: [
          "You may not use the Service to:",
          {
            list: [
              "break the law or infringe the rights of others;",
              "gain unauthorised access or circumvent security;",
              "disrupt the Service, its infrastructure or other users;",
              "request, copy or resell large amounts of content by automated means without permission;",
              "submit misleading, harmful or infringing sponsorship content.",
            ],
          },
          "We may restrict or end access when reasonably needed for security, legal compliance or a serious breach.",
        ],
        id: "use",
        title: "Permitted use",
      },
      {
        blocks: [
          "The Service, software, texts, design and gesture videos are owned by SMOG&Co or its licensors. You get a limited, revocable, non-exclusive and non-transferable licence for personal and educational use. Normal browser or app caching is allowed; downloading, republishing, modifying, commercially exploiting or making a derived video product requires prior permission, except where the law expressly allows it.",
        ],
        id: "ip",
        title: "Intellectual property",
      },
      {
        blocks: [
          {
            list: [
              "A sponsorship links the chosen sponsor name, text and optional logo to one or more gesture videos for the term shown.",
              "The price, term and any logo surcharge are shown before payment. The server checks the amount due. A sponsorship request only counts as paid once Mollie confirms the payment.",
              "SMOG&Co reviews the sponsored video before publication and may refuse content that is unlawful, misleading, harmful, inappropriate or technically unusable. If we refuse it, we contact you about changes or an appropriate handling of the payment.",
              "You guarantee that you hold the necessary rights and permissions for names, brands, logos, text and other submitted content. For carrying out the sponsorship, you grant SMOG&Co a non-exclusive licence to process, render, host and show that content.",
              "Preview and final videos may be adjusted technically for format, legibility and streaming. A re-edit link provided by SMOG&Co is personal, valid for 7 days and may not be shared.",
              "About 30 days before the end of the term you receive an email with a link to renew the sponsorship. A renewal is a new payment for one more year at the price then shown; a sponsorship is never renewed automatically.",
              "Unpaid requests may be cancelled after 24 hours. For cancellation, a refund or a wrong payment, contact us; statutory consumer rights continue to apply.",
            ],
          },
        ],
        id: "sponsoring",
        title: "Sponsorship",
      },
      {
        blocks: [
          "Payments go through Mollie's hosted payment environment and are subject to the terms of the chosen payment method. You are responsible for correct contact and invoice details. Any taxes are applied as required by law. In case of a disputed, reversed or fraudulent payment, we may suspend the sponsorship while the matter is investigated.",
        ],
        id: "payment",
        title: "Payment and invoicing",
      },
      {
        blocks: [
          "Our [privacy policy](/privacy) explains which data the Service needs and which processing rests on another legal basis. Optional analytics is only switched on after separate consent; using the Service does not count as analytics consent.",
        ],
        id: "privacy",
        title: "Privacy",
      },
      {
        blocks: [
          "We aim for a reliable and correct Service, but do not guarantee uninterrupted availability or error-free content. The use of gestures may differ per region, person and context. The Service is an educational tool and not a professional certification, a medical service or a replacement for personal advice.",
        ],
        id: "availability",
        title: "Availability and educational content",
      },
      {
        blocks: [
          "As far as the law allows, SMOG&Co is not liable for indirect damage, consequential damage or loss that was not reasonably foreseeable. Nothing in these terms limits liability that cannot be excluded by law, including liability for intent or gross negligence where the applicable law provides so. Consumers keep their mandatory legal remedies.",
        ],
        id: "liability",
        title: "Liability",
      },
      {
        blocks: [
          "You remain responsible for content you submit. As far as the law allows, a business user compensates SMOG&Co for third-party claims that arise directly from intentionally unlawful use or from submitted sponsorship content for which that user does not hold the required rights. This clause does not limit statutory consumer protection.",
        ],
        id: "indemnity",
        title: "User content and indemnity",
      },
      {
        blocks: [
          "We may change, maintain or discontinue features. If an important change materially affects a running paid sponsorship, we look for a reasonable solution. We may amend these terms and always state the new date. We inform users of material changes through the Service or an appropriate contact channel.",
        ],
        id: "changes",
        title: "Changes and discontinuation",
      },
      {
        blocks: [
          "Belgian law applies. Disputes fall under the competent Belgian courts, except where mandatory consumer law gives you the right to choose another competent court. Please first try to solve a problem with us through [info@smog.vlaanderen](mailto:info@smog.vlaanderen).",
        ],
        id: "law",
        title: "Applicable law and disputes",
      },
      {
        blocks: [
          "If a provision is invalid or unenforceable, the other provisions remain in force. Not enforcing a right immediately is not a waiver of it. These terms and the privacy policy form the agreement on the use of the Service, alongside specific information shown with a purchase.",
        ],
        id: "general",
        title: "Other provisions",
      },
      {
        blocks: [
          {
            lines: [
              "SMOG & CO vzw",
              "Arthur Goemaerelei 66, 2018 Antwerp, Belgium",
              "Email: [info@smog.vlaanderen](mailto:info@smog.vlaanderen)",
              "Phone: +32 3 216 29 90",
              "Company number 1009 954 991",
            ],
          },
        ],
        id: "contact",
        title: "Contact",
      },
    ],
    title: "Terms of service",
  },
};
