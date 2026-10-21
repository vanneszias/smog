import { useTranslation } from "@smog/i18n/react";
import {
  AuthSidePanel,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  Heading,
} from "@smog/ui-web";
import type { ReactNode } from "react";

/**
 * The frame of every auth page: a centred card with the page heading and,
 * from `md`, the green brand panel beside it.
 */
export function AuthCard({
  children,
  description,
  title,
}: {
  children: ReactNode;
  description?: ReactNode;
  title: ReactNode;
}): ReactNode {
  const { t } = useTranslation();
  return (
    <div className="flex flex-1 items-start justify-center px-4 py-10 md:items-center md:px-6">
      <div className="grid w-full max-w-reading overflow-hidden rounded-2xl shadow-1 ring-1 ring-foreground/10 md:max-w-3xl md:grid-cols-[2fr_3fr] dark:ring-border">
        <AuthSidePanel tagline={t("home.tagline")} />
        <Card
          className="gap-4 rounded-none shadow-none ring-0"
          variant="raised"
        >
          <CardHeader>
            <Heading level={1} size="title-2">
              {title}
            </Heading>
            {description ? (
              <CardDescription>{description}</CardDescription>
            ) : null}
          </CardHeader>
          <CardContent className="flex flex-col gap-4">{children}</CardContent>
        </Card>
      </div>
    </div>
  );
}
