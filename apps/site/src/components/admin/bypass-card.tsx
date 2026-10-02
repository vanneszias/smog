import { useTranslation } from "@smog/i18n/react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  ErrorState,
  Skeleton,
  useToast,
} from "@smog/ui-web";
import { KeyRound } from "lucide-react";
import { type ReactNode, useCallback, useId, useState } from "react";
import type { BypassStatus } from "@/worker/maintenance";
import { useAuditTime } from "./audit-data";

export interface BypassCardProps {
  isError: boolean;
  onRetry: () => void;
  /** Gets this browser's bypass cookie; resolves with its expiry. */
  requestBypass: () => Promise<string>;
  /** This browser's cookie (`getMaintenanceBypassStatus`); loading while undefined. */
  status: BypassStatus | undefined;
}

/**
 * This browser's bypass cookie (ruling 9): whether it is active and until
 * when, and "Bypass for this browser (12 h)". The cookie is HttpOnly, so
 * the status comes from the server.
 */
export function BypassCard({
  isError,
  onRetry,
  requestBypass,
  status,
}: BypassCardProps): ReactNode {
  const { t } = useTranslation();
  const { toast } = useToast();
  const time = useAuditTime();
  const titleId = useId();
  const [busy, setBusy] = useState(false);

  const bypass = useCallback(async () => {
    setBusy(true);
    try {
      const expiresAt = await requestBypass();
      toast({
        title: t("admin.settings.bypass.done", {
          time: time(Date.parse(expiresAt)),
        }),
        variant: "success",
      });
    } catch (error) {
      console.error("[admin] Failed to get the bypass cookie:", error);
      toast({ title: t("admin.settings.bypass.failed"), variant: "danger" });
    } finally {
      setBusy(false);
    }
  }, [requestBypass, t, time, toast]);

  let state: ReactNode;
  if (isError) {
    state = (
      <ErrorState
        description={t("admin.settings.bypass.loadError")}
        level={3}
        onRetry={onRetry}
      />
    );
  } else if (status === undefined) {
    state = <Skeleton aria-busy="true" className="h-6 w-40" />;
  } else if (status.active && status.expiresAt) {
    state = (
      <Badge variant="success">
        {t("admin.settings.bypass.active", {
          time: time(Date.parse(status.expiresAt)),
        })}
      </Badge>
    );
  } else {
    state = (
      <Badge variant="neutral">{t("admin.settings.bypass.inactive")}</Badge>
    );
  }

  return (
    <Card aria-labelledby={titleId} role="region">
      <CardHeader>
        <CardTitle id={titleId} level={2}>
          {t("admin.settings.bypass.title")}
        </CardTitle>
        <CardDescription>
          {t("admin.settings.bypass.description")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div aria-live="polite">{state}</div>
      </CardContent>
      <CardFooter>
        <Button
          icon={<KeyRound />}
          loading={busy}
          onClick={bypass}
          variant="secondary"
        >
          {t("admin.settings.bypass.action")}
        </Button>
      </CardFooter>
    </Card>
  );
}
