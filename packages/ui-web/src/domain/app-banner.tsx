import { useTranslation } from "@smog/i18n/react";
import { Download, Smartphone, X } from "lucide-react";
import {
  type ComponentProps,
  type MouseEventHandler,
  type ReactNode,
  useId,
} from "react";
import { Badge } from "../components/badge";
import { buttonVariants } from "../components/button";
import { HandIllustration } from "../components/hand-illustration";
import { IconButton } from "../components/icon-button";
import { TextLink } from "../components/text-link";
import { cn } from "../lib/cn";
import { focusRing, stateLayer, transition } from "../lib/variants";

export interface AppBannerProps
  extends Omit<ComponentProps<"section">, "children" | "title"> {
  /** The App Store page (`APP_STORE_URL`). */
  appStoreUrl: string;
  /** The Google Play page (`PLAY_STORE_URL`). */
  googlePlayUrl: string;
  /** The close button; the app remembers the dismissal. */
  onDismiss: () => void;
}

const storeLink = cn(
  "relative inline-flex min-h-touch items-center gap-3 rounded-full border border-primary-foreground/40 bg-primary-strong px-5 py-2 text-left text-primary-foreground",
  stateLayer.md,
  focusRing,
  transition
);

function StoreLink({
  href,
  icon,
  name,
  prefix,
}: {
  href: string;
  icon: ReactNode;
  name: string;
  prefix: string;
}): ReactNode {
  return (
    <a
      className={storeLink}
      href={href}
      rel="noopener noreferrer"
      target="_blank"
    >
      <span aria-hidden="true" className="*:size-6">
        {icon}
      </span>
      <span className="flex flex-col">
        <span className="text-caption leading-tight">{prefix}</span>
        <span className="font-semibold text-body leading-tight">{name}</span>
      </span>
    </a>
  );
}

/**
 * The app promotion on the site's home (spec §9, §16; inventory L-16): the
 * "new" badge, the headline, both store links (new tab) and a close button.
 * A labelled region in the page flow; the site shows it on mobile browsers
 * once the consent decision is made, so it never stacks with that prompt.
 */
export function AppBanner({
  appStoreUrl,
  className,
  googlePlayUrl,
  onDismiss,
  ...props
}: AppBannerProps): ReactNode {
  const { t } = useTranslation();
  const titleId = useId();
  return (
    <section
      aria-labelledby={titleId}
      className={cn(
        "relative flex animate-fade-in flex-col gap-4 overflow-hidden rounded-2xl bg-primary p-4 pr-16 text-primary-foreground shadow-1 motion-reduce:animate-none md:p-6 md:pr-16",
        className
      )}
      {...props}
    >
      <HandIllustration
        className="pointer-events-none absolute right-16 bottom-0 hidden h-24 translate-y-3 text-primary-foreground/20 lg:inline-flex"
        data-slot="banner-illustration"
        hand={1}
      />
      <div className="relative flex max-w-reading flex-col gap-2">
        <Badge variant="accent">{t("appBanner.badge")}</Badge>
        <p className="font-semibold text-title-3" id={titleId}>
          {t("appBanner.title")}
        </p>
        <p className="text-body">{t("appBanner.description")}</p>
      </div>
      <div className="relative flex flex-wrap gap-2">
        <StoreLink
          href={appStoreUrl}
          icon={<Download />}
          name="App Store"
          prefix={t("appBanner.appStorePrefix")}
        />
        <StoreLink
          href={googlePlayUrl}
          icon={<Smartphone />}
          name="Google Play"
          prefix={t("appBanner.googlePlayPrefix")}
        />
      </div>
      <IconButton
        className="absolute top-2 right-2 text-primary-foreground"
        icon={<X />}
        label={t("appBanner.dismiss")}
        onClick={onDismiss}
      />
    </section>
  );
}

export interface OpenInAppBannerProps
  extends Omit<ComponentProps<"section">, "children" | "title"> {
  /** The page's universal link (`https://<site>/gestures/<slug>`). */
  href: string;
  /** Called on click, before the browser follows `href` (it may prevent that). */
  onOpen?: MouseEventHandler<HTMLAnchorElement>;
  /** A "Get the app" store link beside it (the site passes it on iOS). */
  storeUrl?: string;
}

/**
 * "Open in the app" on a gesture page for mobile browsers (inventory L-15):
 * a short line and a link to the page's universal link, which the app
 * handles when it is installed.
 */
export function OpenInAppBanner({
  className,
  href,
  onOpen,
  storeUrl,
  ...props
}: OpenInAppBannerProps): ReactNode {
  const { t } = useTranslation();
  const titleId = useId();
  return (
    <section
      aria-labelledby={titleId}
      className={cn(
        "flex items-center gap-3 rounded-2xl bg-accent p-3 text-accent-foreground ring-1 ring-foreground/10",
        className
      )}
      {...props}
    >
      <Smartphone
        aria-hidden="true"
        className="size-5 shrink-0 text-primary-strong"
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="font-semibold text-body-sm" id={titleId}>
          {t("openInApp.title")}
        </p>
        <p className="text-body-sm">{t("openInApp.description")}</p>
        {storeUrl ? (
          <TextLink
            className="self-start text-body-sm underline"
            href={storeUrl}
            rel="noopener noreferrer"
            target="_blank"
          >
            {t("openInApp.getApp")}
          </TextLink>
        ) : null}
      </div>
      <a className={buttonVariants()} href={href} onClick={onOpen}>
        {t("openInApp.action")}
      </a>
    </section>
  );
}
