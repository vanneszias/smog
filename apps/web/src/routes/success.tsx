import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/success")({
  component: SuccessPage,
});

function SuccessPage() {
  const { t } = useTranslation();

  return (
    <div className="container mx-auto px-4 py-16 text-center">
      <h1 className="mb-4 font-bold text-3xl">{t("web.success.title")}</h1>
      <p className="mb-8 text-lg text-muted-foreground">
        {t("web.success.reviewMessage")}
      </p>
      <Link
        className="inline-flex items-center justify-center rounded-md bg-primary px-6 py-3 text-primary-foreground transition-colors hover:bg-primary/90"
        to="/"
      >
        {t("web.success.backToHome")}
      </Link>
    </div>
  );
}
