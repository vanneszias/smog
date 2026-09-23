"use client";

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Badge,
  Button,
  EmptyState,
  Skeleton,
  Toast,
  Toaster,
  toast,
} from "@smog/ui-web";
import { Inbox } from "lucide-react";
import { useState } from "react";
import { Note, Section, Specimen } from "./Section";

const BADGE_VARIANTS = [
  "neutral",
  "primary",
  "success",
  "warning",
  "danger",
] as const;
const BADGE_SIZES = ["sm", "md"] as const;
const TOAST_VARIANTS = ["info", "success", "warning", "danger"] as const;
const AVATAR_SIZES = ["sm", "md", "lg"] as const;

export function FeedbackSection() {
  const [dismissed, setDismissed] = useState<string[]>([]);

  return (
    <Section id="feedback" title="Feedback">
      <Toaster />

      <Note>
        <code>Toast</code> is rendered directly here as well as queued through{" "}
        <code>toast()</code>. A queue-only toast cannot be shown in every
        variant at once, which is the whole reason the plain component exists.
      </Note>

      <Specimen label="Badge — variant × size">
        {BADGE_SIZES.map((size) =>
          BADGE_VARIANTS.map((variant) => (
            <Badge key={`${size}-${variant}`} size={size} variant={variant}>
              {variant} / {size}
            </Badge>
          ))
        )}
        <Badge className="max-w-[160px] truncate" size="sm">
          Aangenaam kennis met je te maken
        </Badge>
      </Specimen>

      <Specimen label="Avatar — image, fallback initials, broken source">
        {AVATAR_SIZES.map((size) => (
          <Avatar key={`image-${size}`} size={size}>
            <AvatarImage
              alt="Zias Vannes"
              src="https://raw.githubusercontent.com/payloadcms/payload/main/packages/ui/src/assets/payload-favicon.svg"
            />
            <AvatarFallback name="Zias Vannes" />
          </Avatar>
        ))}
        {AVATAR_SIZES.map((size) => (
          <Avatar key={`fallback-${size}`} size={size}>
            <AvatarFallback name="Zias Vannes" />
          </Avatar>
        ))}
        <Avatar>
          <AvatarImage alt="Kapot" src="/kitchen-sink/no-such-image.png" />
          <AvatarFallback name="Kapotte bron" />
        </Avatar>
        <Avatar>
          <AvatarFallback>?</AvatarFallback>
        </Avatar>
      </Specimen>

      <Specimen className="block w-full" label="Skeleton">
        <div className="flex w-full max-w-md flex-col gap-3">
          <Skeleton className="h-6 w-1/2" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-24 w-full" />
        </div>
      </Specimen>

      <Specimen
        className="grid grid-cols-1 gap-4 md:grid-cols-2"
        label="EmptyState"
      >
        <EmptyState title="Geen gebaren gevonden" />
        <EmptyState
          action={<Button size="sm">Alle gebaren tonen</Button>}
          description="Pas je zoekopdracht aan of kies een andere categorie."
          icon={<Inbox aria-hidden="true" className="size-8" />}
          title="Geen gebaren gevonden"
        />
      </Specimen>

      <Specimen className="block w-full" label="Toast — rendered">
        <div className="flex w-full max-w-md flex-col gap-3">
          {TOAST_VARIANTS.filter((variant) => !dismissed.includes(variant)).map(
            (variant) => (
              <Toast
                description="Het gebaar is opgeslagen en staat nu in de lijst."
                key={variant}
                onDismiss={() => setDismissed((prev) => [...prev, variant])}
                title={`${variant} toast`}
                variant={variant}
              />
            )
          )}
          <Toast title="Zonder beschrijving en zonder sluitknop" />
          {dismissed.length === 0 ? null : (
            <Button onClick={() => setDismissed([])} size="sm" variant="ghost">
              Gesloten meldingen terughalen
            </Button>
          )}
        </div>
      </Specimen>

      <Specimen label="Toast — queued through sonner">
        <Button onClick={() => toast("Gebaar opgeslagen")} size="sm">
          toast()
        </Button>
        <Button
          onClick={() => toast.error("Opslaan mislukt")}
          size="sm"
          variant="danger"
        >
          toast.error()
        </Button>
      </Specimen>
    </Section>
  );
}
