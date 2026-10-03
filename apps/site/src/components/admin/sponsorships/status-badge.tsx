import type { SponsorshipStatus } from "@smog/db/enums";
import { useTranslation } from "@smog/i18n/react";
import {
  SPONSORSHIP_STATUS_LABEL_KEYS,
  SPONSORSHIP_STATUS_TONES,
} from "@smog/sponsorships/schema";
import { Badge, type BadgeProps } from "@smog/ui-web";
import type { ReactNode } from "react";

/**
 * A sponsorship's status as a kit Badge, from the one label map and the
 * one tone map in `@smog/sponsorships/schema` (ruling 15).
 */
export function StatusBadge({
  className,
  size,
  status,
}: {
  className?: string;
  size?: BadgeProps["size"];
  status: SponsorshipStatus;
}): ReactNode {
  const { t } = useTranslation();
  return (
    <Badge
      className={className}
      size={size}
      variant={SPONSORSHIP_STATUS_TONES[status]}
    >
      {t(SPONSORSHIP_STATUS_LABEL_KEYS[status])}
    </Badge>
  );
}
