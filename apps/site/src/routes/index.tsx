import { useTranslation } from "@smog/i18n/react";
import { Heading, Logo, Text } from "@smog/ui-web";
import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";

export const Route = createFileRoute("/")({
  component: Home,
});

/** The home placeholder: the hero, search and categories come in phase 3. */
function Home(): ReactNode {
  const { t } = useTranslation();
  return (
    <section className="mx-auto flex w-full max-w-content flex-1 flex-col items-center justify-center gap-6 px-4 py-16 text-center md:px-6 lg:px-8">
      <Logo decorative size="lg" tone="primary" variant="stacked" />
      <Heading level={1} size="display">
        {t("common.appName")}
      </Heading>
      <Text className="max-w-reading" tone="muted">
        {t("home.tagline")}
      </Text>
    </section>
  );
}
