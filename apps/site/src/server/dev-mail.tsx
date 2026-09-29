import { DEV_MAIL_LIMIT, readDevMail, type StoredEmail } from "@smog/email";
import { createI18n, resolveLocale } from "@smog/i18n";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { siteEnv } from "./auth";
import { devToolsEnabled } from "./dev-tools";

function notFound(): Response {
  return new Response(null, { status: 404 });
}

/** `GET /dev/mail.json`: `{ messages }`, newest first (the e2e reads it). */
export async function devMailJson(): Promise<Response> {
  const { kv, vars } = siteEnv();
  if (!devToolsEnabled(vars.ENVIRONMENT)) {
    return notFound();
  }
  return Response.json(
    { messages: await readDevMail(kv) },
    { headers: { "cache-control": "no-store" } }
  );
}

function Mailbox({
  empty,
  messages,
  title,
}: {
  empty: string;
  messages: StoredEmail[];
  title: string;
}): ReactNode {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta content="width=device-width, initial-scale=1" name="viewport" />
        <title>{title}</title>
      </head>
      <body>
        <h1>{`${title} (${messages.length}/${DEV_MAIL_LIMIT})`}</h1>
        {messages.length === 0 ? <p>{empty}</p> : null}
        {messages.map((message) => (
          <article key={`${message.sentAt}-${message.to}-${message.subject}`}>
            <h2>{message.subject}</h2>
            <p>
              {message.to} · {new Date(message.sentAt).toISOString()}
            </p>
            <pre>{message.text}</pre>
            <iframe
              height={480}
              sandbox=""
              srcDoc={message.html}
              title={message.subject}
              width="100%"
            />
          </article>
        ))}
      </body>
    </html>
  );
}

/** `GET /dev/mail`: the dev mailbox as a plain HTML list. */
export async function devMailPage(request: Request): Promise<Response> {
  const { kv, vars } = siteEnv();
  if (!devToolsEnabled(vars.ENVIRONMENT)) {
    return notFound();
  }
  const locale = resolveLocale({
    acceptLanguage: request.headers.get("accept-language"),
  });
  const { t } = createI18n(locale);
  const html = renderToStaticMarkup(
    <Mailbox
      empty={t("devTools.noMail")}
      messages={await readDevMail(kv)}
      title={t("devTools.mail")}
    />
  );
  return new Response(`<!DOCTYPE html>${html}`, {
    headers: {
      "cache-control": "no-store",
      "content-type": "text/html; charset=utf-8",
    },
  });
}
