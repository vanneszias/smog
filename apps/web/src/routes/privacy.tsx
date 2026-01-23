import { createFileRoute } from "@tanstack/react-router";
import { Trans, useTranslation } from "react-i18next";

export const Route = createFileRoute("/privacy")({
  component: PrivacyPolicyPage,
});

function PrivacyPolicyPage() {
  const { t } = useTranslation();

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <h1 className="mb-6 font-bold text-4xl">{t("web.privacy.title")}</h1>
      <p className="mb-4 text-gray-600">
        {t("web.privacy.lastUpdated", {
          date: new Date().toLocaleDateString(),
        })}
      </p>

      <div className="space-y-6 text-gray-800">
        <section>
          <h2 className="mb-3 font-semibold text-2xl">
            {t("web.privacy.introduction.title")}
          </h2>
          <p>{t("web.privacy.introduction.body")}</p>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-2xl">
            {t("web.privacy.controller.title")}
          </h2>
          <p>{t("web.privacy.controller.body")}</p>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-2xl">
            {t("web.privacy.dataCollect.title")}
          </h2>

          <h3 className="mt-4 mb-2 font-semibold text-xl">
            {t("web.privacy.dataCollect.account.title")}
          </h3>
          <ul className="ml-6 list-disc space-y-1">
            <li>{t("web.privacy.dataCollect.account.items.email")}</li>
            <li>{t("web.privacy.dataCollect.account.items.name")}</li>
            <li>{t("web.privacy.dataCollect.account.items.userId")}</li>
            <li>{t("web.privacy.dataCollect.account.items.timestamps")}</li>
          </ul>

          <h3 className="mt-4 mb-2 font-semibold text-xl">
            {t("web.privacy.dataCollect.usage.title")}
          </h3>
          <ul className="ml-6 list-disc space-y-1">
            <li>{t("web.privacy.dataCollect.usage.items.gestures")}</li>
            <li>{t("web.privacy.dataCollect.usage.items.searches")}</li>
            <li>{t("web.privacy.dataCollect.usage.items.navigation")}</li>
            <li>{t("web.privacy.dataCollect.usage.items.device")}</li>
            <li>{t("web.privacy.dataCollect.usage.items.session")}</li>
            <li>{t("web.privacy.dataCollect.usage.items.video")}</li>
          </ul>

          <h3 className="mt-4 mb-2 font-semibold text-xl">
            {t("web.privacy.dataCollect.preferences.title")}
          </h3>
          <ul className="ml-6 list-disc space-y-1">
            <li>{t("web.privacy.dataCollect.preferences.items.favorites")}</li>
            <li>
              {t("web.privacy.dataCollect.preferences.items.searchHistory")}
            </li>
            <li>{t("web.privacy.dataCollect.preferences.items.settings")}</li>
          </ul>

          <h3 className="mt-4 mb-2 font-semibold text-xl">
            {t("web.privacy.dataCollect.guest.title")}
          </h3>
          <ul className="ml-6 list-disc space-y-1">
            <li>{t("web.privacy.dataCollect.guest.items.identifier")}</li>
            <li>{t("web.privacy.dataCollect.guest.items.retention")}</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-2xl">
            {t("web.privacy.legalBasis.title")}
          </h2>
          <ul className="ml-6 list-disc space-y-2">
            <li>
              <strong>
                {t("web.privacy.legalBasis.items.contract.label")}:
              </strong>{" "}
              {t("web.privacy.legalBasis.items.contract.text")}
            </li>
            <li>
              <strong>
                {t("web.privacy.legalBasis.items.consent.label")}:
              </strong>{" "}
              {t("web.privacy.legalBasis.items.consent.text")}
            </li>
            <li>
              <strong>
                {t("web.privacy.legalBasis.items.legitimate.label")}:
              </strong>{" "}
              {t("web.privacy.legalBasis.items.legitimate.text")}
            </li>
            <li>
              <strong>{t("web.privacy.legalBasis.items.legal.label")}:</strong>{" "}
              {t("web.privacy.legalBasis.items.legal.text")}
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-2xl">
            {t("web.privacy.useData.title")}
          </h2>
          <ul className="ml-6 list-disc space-y-1">
            <li>{t("web.privacy.useData.items.provide")}</li>
            <li>{t("web.privacy.useData.items.authenticate")}</li>
            <li>{t("web.privacy.useData.items.sync")}</li>
            <li>{t("web.privacy.useData.items.analytics")}</li>
            <li>{t("web.privacy.useData.items.personalize")}</li>
            <li>{t("web.privacy.useData.items.support")}</li>
            <li>{t("web.privacy.useData.items.legal")}</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-2xl">
            {t("web.privacy.thirdParty.title")}
          </h2>

          <h3 className="mt-4 mb-2 font-semibold text-xl">
            {t("web.privacy.thirdParty.workos.title")}
          </h3>
          <p>
            <Trans
              components={{
                link: (
                  <a
                    className="text-blue-600 underline"
                    href="https://workos.com/privacy"
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    https://workos.com/privacy
                  </a>
                ),
              }}
              i18nKey="web.privacy.thirdParty.workos.body"
            />
          </p>

          <h3 className="mt-4 mb-2 font-semibold text-xl">
            {t("web.privacy.thirdParty.posthog.title")}
          </h3>
          <p>
            <Trans
              components={{
                link: (
                  <a
                    className="text-blue-600 underline"
                    href="https://posthog.com/privacy"
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    https://posthog.com/privacy
                  </a>
                ),
              }}
              i18nKey="web.privacy.thirdParty.posthog.body"
            />
          </p>

          <h3 className="mt-4 mb-2 font-semibold text-xl">
            {t("web.privacy.thirdParty.mux.title")}
          </h3>
          <p>
            <Trans
              components={{
                link: (
                  <a
                    className="text-blue-600 underline"
                    href="https://mux.com/privacy"
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    https://mux.com/privacy
                  </a>
                ),
              }}
              i18nKey="web.privacy.thirdParty.mux.body"
            />
          </p>

          <h3 className="mt-4 mb-2 font-semibold text-xl">
            {t("web.privacy.thirdParty.convex.title")}
          </h3>
          <p>{t("web.privacy.thirdParty.convex.body")}</p>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-2xl">
            {t("web.privacy.storage.title")}
          </h2>
          <ul className="ml-6 list-disc space-y-1">
            <li>{t("web.privacy.storage.items.encryption")}</li>
            <li>{t("web.privacy.storage.items.analytics")}</li>
            <li>{t("web.privacy.storage.items.measures")}</li>
            <li>{t("web.privacy.storage.items.access")}</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-2xl">
            {t("web.privacy.retention.title")}
          </h2>
          <ul className="ml-6 list-disc space-y-1">
            <li>
              <strong>{t("web.privacy.retention.items.active.label")}:</strong>{" "}
              {t("web.privacy.retention.items.active.text")}
            </li>
            <li>
              <strong>{t("web.privacy.retention.items.guest.label")}:</strong>{" "}
              {t("web.privacy.retention.items.guest.text")}
            </li>
            <li>
              <strong>{t("web.privacy.retention.items.logs.label")}:</strong>{" "}
              {t("web.privacy.retention.items.logs.text")}
            </li>
            <li>
              <strong>{t("web.privacy.retention.items.deleted.label")}:</strong>{" "}
              {t("web.privacy.retention.items.deleted.text")}
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-2xl">
            {t("web.privacy.rights.title")}
          </h2>
          <p className="mb-2">{t("web.privacy.rights.intro")}</p>
          <ul className="ml-6 list-disc space-y-2">
            <li>
              <strong>{t("web.privacy.rights.items.access.label")}:</strong>{" "}
              {t("web.privacy.rights.items.access.text")}
            </li>
            <li>
              <strong>
                {t("web.privacy.rights.items.rectification.label")}:
              </strong>{" "}
              {t("web.privacy.rights.items.rectification.text")}
            </li>
            <li>
              <strong>{t("web.privacy.rights.items.erasure.label")}:</strong>{" "}
              {t("web.privacy.rights.items.erasure.text")}
            </li>
            <li>
              <strong>{t("web.privacy.rights.items.restrict.label")}:</strong>{" "}
              {t("web.privacy.rights.items.restrict.text")}
            </li>
            <li>
              <strong>
                {t("web.privacy.rights.items.portability.label")}:
              </strong>{" "}
              {t("web.privacy.rights.items.portability.text")}
            </li>
            <li>
              <strong>{t("web.privacy.rights.items.object.label")}:</strong>{" "}
              {t("web.privacy.rights.items.object.text")}
            </li>
            <li>
              <strong>{t("web.privacy.rights.items.withdraw.label")}:</strong>{" "}
              {t("web.privacy.rights.items.withdraw.text")}
            </li>
          </ul>
          <p className="mt-3">{t("web.privacy.rights.closing")}</p>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-2xl">
            {t("web.privacy.children.title")}
          </h2>
          <p>{t("web.privacy.children.body")}</p>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-2xl">
            {t("web.privacy.transfers.title")}
          </h2>
          <p>{t("web.privacy.transfers.intro")}</p>
          <ul className="ml-6 list-disc space-y-1">
            <li>{t("web.privacy.transfers.items.euHosting")}</li>
            <li>{t("web.privacy.transfers.items.scc")}</li>
            <li>{t("web.privacy.transfers.items.adequacy")}</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-2xl">
            {t("web.privacy.cookies.title")}
          </h2>
          <p>{t("web.privacy.cookies.intro")}</p>
          <ul className="ml-6 list-disc space-y-1">
            <li>{t("web.privacy.cookies.items.auth")}</li>
            <li>{t("web.privacy.cookies.items.consent")}</li>
            <li>{t("web.privacy.cookies.items.preferences")}</li>
            <li>{t("web.privacy.cookies.items.search")}</li>
            <li>{t("web.privacy.cookies.items.cache")}</li>
          </ul>
          <p className="mt-2">{t("web.privacy.cookies.closing")}</p>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-2xl">
            {t("web.privacy.changes.title")}
          </h2>
          <p>{t("web.privacy.changes.intro")}</p>
          <ul className="ml-6 list-disc space-y-1">
            <li>{t("web.privacy.changes.items.updated")}</li>
            <li>{t("web.privacy.changes.items.notification")}</li>
            <li>{t("web.privacy.changes.items.renewal")}</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-2xl">
            {t("web.privacy.contact.title")}
          </h2>
          <p>{t("web.privacy.contact.intro")}</p>
          <p className="mt-2">
            <strong>{t("web.privacy.contact.emailLabel")}:</strong>{" "}
            {t("web.privacy.contact.emailValue")}
            <br />
            <strong>{t("web.privacy.contact.addressLabel")}:</strong>{" "}
            {t("web.privacy.contact.addressValue")}
          </p>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-2xl">
            {t("web.privacy.authority.title")}
          </h2>
          <p>{t("web.privacy.authority.body")}</p>
        </section>

        <section className="border-gray-300 border-t pt-6">
          <p className="text-gray-600 text-sm">{t("web.privacy.footer")}</p>
        </section>
      </div>
    </div>
  );
}
