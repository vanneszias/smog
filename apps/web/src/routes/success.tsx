import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/success")({
  component: SuccessPage,
  validateSearch: (search) => ({
    checkout_id: search.checkout_id as string,
  }),
});

function SuccessPage() {
  const { t } = useTranslation();
  const { checkout_id } = useSearch({ from: "/success" });

  return (
    <div className="container mx-auto px-4 py-8">
      <h1>{t("web.success.title")}</h1>
      {checkout_id ? (
        <p>
          {t("web.success.checkoutId")}
          {checkout_id}
        </p>
      ) : null}
    </div>
  );
}
