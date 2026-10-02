import { useMaintenance, useSetMaintenance } from "@smog/admin/client";
import {
  MAINTENANCE_MESSAGE_MAX,
  type MaintenanceSetInput,
  type MaintenanceSetting,
  maintenanceSetInputSchema,
} from "@smog/admin/schema";
import { useTranslation } from "@smog/i18n/react";
import {
  AlertDialog,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  cn,
  ErrorState,
  Field,
  Input,
  Skeleton,
  Text,
  Textarea,
  useToast,
} from "@smog/ui-web";
import { Construction, Power } from "lucide-react";
import {
  type ChangeEvent,
  type ReactNode,
  useCallback,
  useId,
  useState,
} from "react";
import { useAuditTime } from "./audit-data";

/**
 * A `datetime-local` value (the browser's time zone) as ISO 8601; `null`
 * for an empty field, `undefined` for a value that is not a time.
 */
function localInputToIso(value: string): string | null | undefined {
  if (value.trim() === "") {
    return null;
  }
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? undefined : new Date(ms).toISOString();
}

function Row({
  children,
  className,
  label,
}: {
  children: ReactNode;
  className?: string;
  label: ReactNode;
}): ReactNode {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1", className)}>
      <dt>
        <Text as="span" size="caption" tone="muted" weight="semibold">
          {label}
        </Text>
      </dt>
      <dd className="min-w-0 break-words text-body-sm">{children}</dd>
    </div>
  );
}

function SettingFacts({ setting }: { setting: MaintenanceSetting }): ReactNode {
  const { t } = useTranslation();
  const time = useAuditTime();
  return (
    <dl className="grid gap-4 sm:grid-cols-3">
      <Row label={t("admin.settings.maintenance.status")}>
        {setting.enabled ? (
          <Badge variant="warning">{t("admin.settings.maintenance.on")}</Badge>
        ) : (
          <Badge variant="success">{t("admin.settings.maintenance.off")}</Badge>
        )}
      </Row>
      {setting.enabled ? (
        <>
          <Row label={t("admin.settings.maintenance.message")}>
            {setting.message ?? t("admin.settings.maintenance.noMessage")}
          </Row>
          <Row label={t("admin.settings.maintenance.until")}>
            {setting.until
              ? time(Date.parse(setting.until))
              : t("admin.settings.maintenance.noUntil")}
          </Row>
        </>
      ) : null}
    </dl>
  );
}

export interface MaintenanceCardProps {
  /** After a change: the bypass card refetches its status. */
  onChanged?: () => void;
  /**
   * Gets this browser's bypass cookie (`POST /api/maintenance/bypass`);
   * resolves with its expiry. Enabling waits for it, so the acting admin
   * is never locked out.
   */
  requestBypass: () => Promise<string>;
}

/**
 * The maintenance toggle (A-26, P-11, ruling 9). Off: a note and an
 * expected end, then "Enable", which first gets the acting admin's bypass
 * cookie and only then turns maintenance on. On: the window, and
 * "Disable" behind an AlertDialog that says every bypass cookie is
 * revoked. The note on propagation is always shown: other isolates follow
 * within about a minute.
 */
export function MaintenanceCard({
  onChanged,
  requestBypass,
}: MaintenanceCardProps): ReactNode {
  const { t } = useTranslation();
  const { toast } = useToast();
  const query = useMaintenance();
  const setMaintenance = useSetMaintenance();
  const [message, setMessage] = useState("");
  const [until, setUntil] = useState("");
  const [untilError, setUntilError] = useState(false);
  const [confirmOff, setConfirmOff] = useState(false);
  const [enabling, setEnabling] = useState(false);
  const titleId = useId();

  const change = useCallback(
    async (input: MaintenanceSetInput, done: string): Promise<boolean> => {
      try {
        await setMaintenance.mutateAsync(input);
        toast({ title: done, variant: "success" });
        return true;
      } catch (error) {
        console.error("[admin] Failed to change maintenance mode:", error);
        toast({
          title: t("admin.settings.maintenance.failed"),
          variant: "danger",
        });
        return false;
      } finally {
        onChanged?.();
      }
    },
    [onChanged, setMaintenance, t, toast]
  );

  const enable = useCallback(async () => {
    const iso = localInputToIso(until);
    const input: MaintenanceSetInput = {
      enabled: true,
      ...(message.trim() ? { message: message.trim() } : {}),
      ...(iso ? { until: iso } : {}),
    };
    const parsed = maintenanceSetInputSchema.safeParse(input);
    const badUntil =
      iso === undefined ||
      (!parsed.success &&
        parsed.error.issues.some((issue) => issue.path[0] === "until"));
    setUntilError(badUntil);
    if (badUntil || !parsed.success) {
      return;
    }
    setEnabling(true);
    try {
      try {
        await requestBypass();
      } catch (error) {
        console.error("[admin] Failed to get the bypass cookie:", error);
        toast({
          title: t("admin.settings.maintenance.bypassFailed"),
          variant: "danger",
        });
        onChanged?.();
        return;
      }
      if (await change(parsed.data, t("admin.settings.maintenance.enabled"))) {
        setMessage("");
        setUntil("");
      }
    } finally {
      setEnabling(false);
    }
  }, [change, message, onChanged, requestBypass, t, toast, until]);

  const disable = useCallback(async () => {
    if (
      await change({ enabled: false }, t("admin.settings.maintenance.disabled"))
    ) {
      setConfirmOff(false);
    }
  }, [change, t]);

  const onMessage = useCallback((event: ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(event.target.value);
  }, []);
  const onUntil = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setUntil(event.target.value);
    setUntilError(false);
  }, []);
  const askOff = useCallback(() => setConfirmOff(true), []);
  const retry = useCallback(() => {
    query.refetch().catch((error: unknown) => {
      console.error("[admin] Failed to reload maintenance mode:", error);
    });
  }, [query]);

  let body: ReactNode;
  if (query.isPending) {
    body = (
      <div aria-busy="true" className="flex flex-col gap-3">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  } else if (query.isError) {
    body = (
      <ErrorState
        description={t("admin.settings.maintenance.loadError")}
        level={3}
        onRetry={retry}
      />
    );
  } else {
    const setting = query.data;
    body = (
      <>
        <SettingFacts setting={setting} />
        {setting.enabled ? null : (
          <div className="grid gap-4 md:grid-cols-2">
            <Field
              counter={{ count: message.length, max: MAINTENANCE_MESSAGE_MAX }}
              hint={t("admin.settings.maintenance.messageHint", {
                max: MAINTENANCE_MESSAGE_MAX,
              })}
              label={t("admin.settings.maintenance.message")}
            >
              <Textarea
                maxLength={MAINTENANCE_MESSAGE_MAX}
                onChange={onMessage}
                rows={3}
                value={message}
              />
            </Field>
            <Field
              error={
                untilError
                  ? t("admin.settings.maintenance.untilInvalid")
                  : undefined
              }
              hint={t("admin.settings.maintenance.untilHint")}
              label={t("admin.settings.maintenance.until")}
            >
              <Input onChange={onUntil} type="datetime-local" value={until} />
            </Field>
          </div>
        )}
        <CardFooter className="justify-between">
          {setting.enabled ? (
            <Button icon={<Power />} onClick={askOff} variant="secondary">
              {t("admin.settings.maintenance.disable")}
            </Button>
          ) : (
            <div className="flex flex-col items-start gap-1">
              <Button
                icon={<Construction />}
                loading={enabling}
                onClick={enable}
                variant="danger"
              >
                {t("admin.settings.maintenance.enable")}
              </Button>
              <Text size="caption" tone="muted">
                {t("admin.settings.maintenance.enableNote")}
              </Text>
            </div>
          )}
        </CardFooter>
      </>
    );
  }

  return (
    <Card aria-labelledby={titleId} role="region">
      <CardHeader>
        <CardTitle id={titleId} level={2}>
          {t("admin.settings.maintenance.title")}
        </CardTitle>
        <CardDescription>
          {t("admin.settings.maintenance.description")}
        </CardDescription>
      </CardHeader>
      <CardContent className="gap-4">
        {body}
        <Text size="body-sm" tone="muted">
          {t("admin.settings.maintenance.propagation")}
        </Text>
      </CardContent>
      <AlertDialog
        confirmLabel={t("admin.settings.maintenance.disable")}
        description={t("admin.settings.maintenance.disableDescription")}
        loading={setMaintenance.isPending}
        onConfirm={disable}
        onOpenChange={setConfirmOff}
        open={confirmOff}
        title={t("admin.settings.maintenance.disableTitle")}
      />
    </Card>
  );
}
