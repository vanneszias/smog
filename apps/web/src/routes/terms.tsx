import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/terms")({
  component: TermsOfServicePage,
});

function TermsOfServicePage() {
  const { t } = useTranslation();

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <h1 className="mb-6 font-bold text-4xl">{t("web.terms.title")}</h1>
      <p className="mb-4 text-gray-600">
        {t("web.terms.lastUpdated", {
          date: new Date().toLocaleDateString(),
        })}
      </p>

      <div className="space-y-6 text-gray-800">
        <section>
          <h2 className="mb-3 font-semibold text-2xl">
            {t("web.terms.acceptance.title")}
          </h2>
          <p>{t("web.terms.acceptance.body")}</p>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-2xl">
            {t("web.terms.description.title")}
          </h2>
          <p>{t("web.terms.description.intro")}</p>
          <ul className="ml-6 list-disc space-y-1">
            <li>{t("web.terms.description.items.library")}</li>
            <li>{t("web.terms.description.items.search")}</li>
            <li>{t("web.terms.description.items.favorites")}</li>
            <li>{t("web.terms.description.items.sync")}</li>
            <li>{t("web.terms.description.items.guest")}</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-2xl">
            {t("web.terms.accounts.title")}
          </h2>

          <h3 className="mt-4 mb-2 font-semibold text-xl">
            {t("web.terms.accounts.create.title")}
          </h3>
          <p>{t("web.terms.accounts.create.body")}</p>

          <h3 className="mt-4 mb-2 font-semibold text-xl">
            {t("web.terms.accounts.guest.title")}
          </h3>
          <p>{t("web.terms.accounts.guest.body")}</p>

          <h3 className="mt-4 mb-2 font-semibold text-xl">
            {t("web.terms.accounts.termination.title")}
          </h3>
          <p>{t("web.terms.accounts.termination.body")}</p>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-2xl">
            {t("web.terms.conduct.title")}
          </h2>
          <p>{t("web.terms.conduct.intro")}</p>
          <ul className="ml-6 list-disc space-y-1">
            <li>{t("web.terms.conduct.items.unlawful")}</li>
            <li>{t("web.terms.conduct.items.access")}</li>
            <li>{t("web.terms.conduct.items.disrupt")}</li>
            <li>{t("web.terms.conduct.items.automated")}</li>
            <li>{t("web.terms.conduct.items.resell")}</li>
            <li>{t("web.terms.conduct.items.notices")}</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-2xl">
            {t("web.terms.intellectual.title")}
          </h2>

          <h3 className="mt-4 mb-2 font-semibold text-xl">
            {t("web.terms.intellectual.ours.title")}
          </h3>
          <p>{t("web.terms.intellectual.ours.body")}</p>

          <h3 className="mt-4 mb-2 font-semibold text-xl">
            {t("web.terms.intellectual.license.title")}
          </h3>
          <p>{t("web.terms.intellectual.license.intro")}</p>
          <ul className="ml-6 list-disc space-y-1">
            <li>{t("web.terms.intellectual.license.items.download")}</li>
            <li>{t("web.terms.intellectual.license.items.modify")}</li>
            <li>{t("web.terms.intellectual.license.items.display")}</li>
            <li>{t("web.terms.intellectual.license.items.commercial")}</li>
          </ul>

          <h3 className="mt-4 mb-2 font-semibold text-xl">
            {t("web.terms.intellectual.education.title")}
          </h3>
          <p>{t("web.terms.intellectual.education.body")}</p>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-2xl">
            {t("web.terms.privacy.title")}
          </h2>
          <p>{t("web.terms.privacy.body")}</p>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-2xl">
            {t("web.terms.disclaimers.title")}
          </h2>

          <h3 className="mt-4 mb-2 font-semibold text-xl">
            {t("web.terms.disclaimers.availability.title")}
          </h3>
          <p>{t("web.terms.disclaimers.availability.body")}</p>

          <h3 className="mt-4 mb-2 font-semibold text-xl">
            {t("web.terms.disclaimers.educational.title")}
          </h3>
          <p>{t("web.terms.disclaimers.educational.body")}</p>

          <h3 className="mt-4 mb-2 font-semibold text-xl">
            {t("web.terms.disclaimers.noAdvice.title")}
          </h3>
          <p>{t("web.terms.disclaimers.noAdvice.body")}</p>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-2xl">
            {t("web.terms.liability.title")}
          </h2>
          <p>{t("web.terms.liability.intro")}</p>
          <ul className="ml-6 list-disc space-y-1">
            <li>{t("web.terms.liability.items.access")}</li>
            <li>{t("web.terms.liability.items.content")}</li>
            <li>{t("web.terms.liability.items.materials")}</li>
            <li>{t("web.terms.liability.items.security")}</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-2xl">
            {t("web.terms.indemnification.title")}
          </h2>
          <p>{t("web.terms.indemnification.body")}</p>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-2xl">
            {t("web.terms.modifications.title")}
          </h2>
          <p>{t("web.terms.modifications.body")}</p>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-2xl">
            {t("web.terms.changes.title")}
          </h2>
          <p>{t("web.terms.changes.intro")}</p>
          <ul className="ml-6 list-disc space-y-1">
            <li>{t("web.terms.changes.items.updated")}</li>
            <li>{t("web.terms.changes.items.notification")}</li>
            <li>{t("web.terms.changes.items.acceptance")}</li>
          </ul>
          <p className="mt-2">{t("web.terms.changes.closing")}</p>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-2xl">
            {t("web.terms.governing.title")}
          </h2>
          <p>{t("web.terms.governing.body")}</p>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-2xl">
            {t("web.terms.severability.title")}
          </h2>
          <p>{t("web.terms.severability.body")}</p>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-2xl">
            {t("web.terms.entire.title")}
          </h2>
          <p>{t("web.terms.entire.body")}</p>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-2xl">
            {t("web.terms.contact.title")}
          </h2>
          <p>{t("web.terms.contact.intro")}</p>
          <p className="mt-2">
            <strong>{t("web.terms.contact.emailLabel")}:</strong>{" "}
            {t("web.terms.contact.emailValue")}
            <br />
            <strong>{t("web.terms.contact.addressLabel")}:</strong>{" "}
            {t("web.terms.contact.addressValue")}
          </p>
        </section>

        <section className="border-gray-300 border-t pt-6">
          <p className="text-gray-600 text-sm">{t("web.terms.footer")}</p>
        </section>
      </div>
    </div>
  );
}
