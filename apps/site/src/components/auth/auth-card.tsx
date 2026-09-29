import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  Heading,
} from "@smog/ui-web";
import type { ReactNode } from "react";

/** The frame of every auth page: a centred card with the page heading. */
export function AuthCard({
  children,
  description,
  title,
}: {
  children: ReactNode;
  description?: ReactNode;
  title: ReactNode;
}): ReactNode {
  return (
    <div className="flex flex-1 items-start justify-center px-4 py-10 md:items-center md:px-6">
      <Card className="w-full max-w-reading gap-4" variant="raised">
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
  );
}
