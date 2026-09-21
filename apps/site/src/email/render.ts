import type { Locale } from "@/lib/locale";

/**
 * The subject and body of every message this application sends. Pure.
 *
 * ## Why the copy lives in one small module with no dependencies
 *
 * The thing that decides *whether* to send is a queued job, the thing that
 * sends is a Cloudflare binding, and neither is pleasant to assert against.
 * What a sponsor actually reads is neither of those: it is a subject line, a
 * sentence and a URL. Keeping that here makes it a unit test — every locale,
 * every message, no database and no binding — and leaves the job with one
 * decision per message instead of a template.
 *
 * ## Text only, deliberately
 *
 * The shipped product renders React Email components to HTML
 * (`apps/server/src/services/emailQueue.ts`). These two messages are one
 * sentence and one link each, and a text body has three properties an HTML
 * one would have to be given: there is no markup for an interpolated value to
 * escape into, no images or styles for a mail client to strip, and no second
 * copy of the wording to drift out of step with the first. If a future message
 * needs layout, `SendEmailOptions` carries `html` beside `text` and the
 * adapter already passes both through — this returning only `text` is not a
 * limit of anything below it.
 *
 * ## Nothing here reads a token
 *
 * The URL arrives assembled. That is what lets `jobs/sendEmail.ts` fetch the
 * credential at the last possible moment — minted for the address change,
 * read back with `showHiddenFields: true` for the sponsor's re-edit link —
 * without this module, or the queue, ever holding one.
 */

/**
 * Anything a stranger typed, flattened to one line.
 *
 * `sponsorName` is whatever a sponsor entered in the checkout form. It is
 * interpolated into a message whose headers Cloudflare composes for us, and a
 * newline in a value that reaches a header is how a header injection works —
 * so the newline never gets that far. Control characters go with it: they
 * cannot help a reader and they can break a MIME encoder.
 *
 * Applied to every interpolated value rather than to the one that is known to
 * be hostile today, because the next value will be added by somebody who has
 * not read this note.
 */
function oneLine(value: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: stripping them is the point
  return value.replaceAll(/[\u0000-\u001F\u007F]+/g, " ").trim();
}

/**
 * The email-change confirmation, and the sponsor's re-edit invitation.
 *
 * Not exported: `renderEmail` is the only thing that names it, and knip fails
 * the build on an exported symbol nothing imports — the ruling `lib/mollie.ts`
 * records for `CreateMolliePaymentInput`. Callers build the object inline and
 * the signature checks it, which is the same guarantee with one fewer name.
 */
type EmailMessage =
  | {
      kind: "email-change";
      locale: Locale;
      /** The confirmation link, already carrying its token. */
      url: string;
    }
  | {
      kind: "re-edit";
      locale: Locale;
      /** Whatever the sponsor called themselves at checkout. */
      sponsorName: string;
      /** The capability URL, already carrying its token. */
      url: string;
    };

/** What the adapter is handed: nodemailer's shape, minus the recipient. */
interface RenderedEmail {
  subject: string;
  text: string;
}

/**
 * Dutch first, because the product is Flemish and every existing transactional
 * message in `apps/server` is Dutch only. English and French are the two
 * locales the public site already serves (`lib/locale.ts`), so a visitor who
 * read the form in French is answered in French rather than in the language of
 * whoever set the site up.
 */
const EMAIL_CHANGE: Record<Locale, (url: string) => RenderedEmail> = {
  nl: (url) => ({
    subject: "Bevestig je nieuwe e-mailadres",
    text: [
      "Je hebt gevraagd om het e-mailadres van je SMOG-account te wijzigen.",
      "",
      "Bevestig het via deze link:",
      url,
      "",
      "De link is één uur geldig. Heb je dit niet gevraagd? Dan hoef je niets te doen — je adres blijft ongewijzigd.",
    ].join("\n"),
  }),
  en: (url) => ({
    subject: "Confirm your new email address",
    text: [
      "You asked to change the email address on your SMOG account.",
      "",
      "Confirm it with this link:",
      url,
      "",
      "The link is valid for one hour. If you did not ask for this, there is nothing to do — your address stays as it is.",
    ].join("\n"),
  }),
  fr: (url) => ({
    subject: "Confirmez votre nouvelle adresse e-mail",
    text: [
      "Vous avez demandé à modifier l'adresse e-mail de votre compte SMOG.",
      "",
      "Confirmez-la avec ce lien :",
      url,
      "",
      "Le lien est valable une heure. Si vous n'êtes pas à l'origine de cette demande, vous n'avez rien à faire : votre adresse reste inchangée.",
    ].join("\n"),
  }),
};

const RE_EDIT: Record<Locale, (name: string, url: string) => RenderedEmail> = {
  nl: (name, url) => ({
    subject: "Pas je SMOG-sponsoring aan",
    text: [
      `Beste ${name},`,
      "",
      "We vragen je om je sponsoring nog even aan te passen voordat ze online komt.",
      "",
      "Pas ze aan via deze link:",
      url,
      "",
      "De link is zeven dagen geldig en werkt één keer.",
    ].join("\n"),
  }),
  en: (name, url) => ({
    subject: "Please update your SMOG sponsorship",
    text: [
      `Dear ${name},`,
      "",
      "We have asked for a change to your sponsorship before it goes live.",
      "",
      "Make the change with this link:",
      url,
      "",
      "The link is valid for seven days and works once.",
    ].join("\n"),
  }),
  fr: (name, url) => ({
    subject: "Modifiez votre parrainage SMOG",
    text: [
      `Bonjour ${name},`,
      "",
      "Nous vous demandons de modifier votre parrainage avant sa mise en ligne.",
      "",
      "Modifiez-le avec ce lien :",
      url,
      "",
      "Le lien est valable sept jours et ne fonctionne qu'une seule fois.",
    ].join("\n"),
  }),
};

/**
 * One message, in the locale it is addressed to.
 *
 * The locale is a parameter and not a lookup, because the two callers know it
 * from two different places: the address change carries the locale of the form
 * the account holder submitted, and the re-edit invitation has nothing to read
 * it off at all — a `sponsorships` row records no language. See
 * `jobs/sendEmail.ts` for what that means and why guessing from the
 * administrator's own session would be worse than the default.
 */
export function renderEmail(message: EmailMessage): RenderedEmail {
  if (message.kind === "email-change") {
    return EMAIL_CHANGE[message.locale](oneLine(message.url));
  }

  return RE_EDIT[message.locale](
    oneLine(message.sponsorName),
    oneLine(message.url)
  );
}
