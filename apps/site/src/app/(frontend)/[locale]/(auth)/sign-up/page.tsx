import { Button, Field, Input } from "@smog/ui-web";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocale, resolveLocale } from "@/lib/locale";

export const metadata: Metadata = {
  description: "Maak een account aan bij SMOG & Co.",
  title: "Registreren",
  robots: { follow: true, index: false },
};

/**
 * The password floor, said on the page.
 *
 * One message for both of `hooks/enforcePasswordPolicy`'s rules — too short
 * and too guessable — rather than echoing the hook's own sentence back. The
 * reason is not brevity: the endpoint answers with a *code*, never with text
 * from the server, so that nothing a visitor reads here can be chosen by
 * whoever wrote the link they followed. A `?error=` carrying free text is a
 * phishing surface even though React escapes it.
 */
const PASSWORD_ERROR =
  "Kies een wachtwoord van minstens 12 tekens dat niet makkelijk te raden is.";

const EMAIL_ERROR = "Vul een geldig e-mailadres in.";

const PASSWORD_HELP = "Minstens 12 tekens. Langer mag altijd.";

export default async function SignUpPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { locale } = await params;

  if (!isLocale(locale)) {
    notFound();
  }

  const { error } = await searchParams;
  const current = resolveLocale(locale);
  const emailError = error === "email" ? EMAIL_ERROR : undefined;
  const passwordError = error === "password" ? PASSWORD_ERROR : undefined;

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-6">
      <h1 className="font-bold text-foreground text-xxl">Registreren</h1>

      {error === undefined ? null : (
        <p
          className="rounded-md border border-danger bg-surface px-4 py-3 font-medium text-danger text-sm"
          data-testid="sign-up-error"
          role="alert"
        >
          {emailError ?? PASSWORD_ERROR}
        </p>
      )}

      <form
        action="/auth/sign-up"
        className="flex flex-col gap-4"
        method="post"
      >
        <input name="locale" type="hidden" value={current} />
        <Field error={emailError} label="E-mailadres">
          <Input
            autoComplete="email"
            data-testid="email"
            name="email"
            required
            type="email"
          />
        </Field>
        <Field error={passwordError} help={PASSWORD_HELP} label="Wachtwoord">
          <Input
            autoComplete="new-password"
            data-testid="password"
            /*
             * `minLength` mirrors `hooks/enforcePasswordPolicy`'s floor so the
             * browser catches the common case without a round trip. It is a
             * convenience and nothing more — the hook is the rule, and it runs
             * on every write including the ones that never touch this form.
             */
            minLength={12}
            name="password"
            required
            type="password"
          />
        </Field>
        <Button data-testid="submit" type="submit">
          Account aanmaken
        </Button>
      </form>

      <p className="text-foreground-muted text-sm">
        Heb je al een account?{" "}
        <a
          className="underline hover:no-underline"
          href={`/${current}/sign-in`}
        >
          Aanmelden
        </a>
      </p>
    </div>
  );
}
