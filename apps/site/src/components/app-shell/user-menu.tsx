import { useAuthState } from "@smog/auth/react";
import { useTranslation } from "@smog/i18n/react";
import {
  Avatar,
  Button,
  cn,
  IconButton,
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuTrigger,
  Skeleton,
  Text,
  useToast,
} from "@smog/ui-web";
import {
  Link,
  useLocation,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import {
  HeartHandshake,
  LogIn,
  LogOut,
  Settings,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { type ReactNode, useCallback } from "react";
import { useAuthClient } from "@/lib/auth-client";
import { signInReturnPath } from "@/lib/redirect";
import { LanguageMenuItems } from "./language-menu";
import { GREEN_BUTTON, GREEN_ICON_BUTTON } from "./on-green";
import { ThemeMenuItems } from "./theme-menu";

/** Signs out, refreshes the route data and says so. */
export function useSignOut(): () => Promise<void> {
  const client = useAuthClient();
  const router = useRouter();
  const { toast } = useToast();
  const { t } = useTranslation();
  return useCallback(async () => {
    try {
      const { error } = await client.signOut();
      if (error) {
        throw new Error(error.message ?? error.statusText);
      }
      await router.invalidate();
      toast({ title: t("auth.signedOut"), variant: "success" });
    } catch (error) {
      console.error("[auth] Failed to sign out:", error);
      toast({ title: t("auth.errors.generic"), variant: "danger" });
    }
  }, [client, router, t, toast]);
}

/** What a guest and a signed-in user share: the sponsor entry, language, theme. */
function SharedItems(): ReactNode {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const openSponsor = useCallback(() => {
    navigate({ to: "/sponsor" });
  }, [navigate]);
  return (
    <>
      <MenuItem icon={<HeartHandshake />} onSelect={openSponsor}>
        {t("nav.sponsor")}
      </MenuItem>
      <MenuSeparator />
      <LanguageMenuItems />
      <MenuSeparator />
      <ThemeMenuItems />
    </>
  );
}

/** Tall menus (language and theme) scroll inside the viewport on short screens. */
const MENU_CLASS =
  "max-h-(--radix-dropdown-menu-content-available-height) min-w-60 overflow-y-auto";

/**
 * The header's one user and settings menu (phase 10a). Signed in, it is the
 * avatar (account, admin, sign out); as a guest, a settings button (sign
 * in) with a "Sign in" button beside it from `md`. Both end with Sponsor,
 * the language and the theme.
 */
export function UserMenu(): ReactNode {
  const { t } = useTranslation();
  const auth = useAuthState();
  const navigate = useNavigate();
  const signOut = useSignOut();
  const { href } = useLocation();
  const openAccount = useCallback(() => {
    navigate({ to: "/account" });
  }, [navigate]);
  const openAdmin = useCallback(() => {
    navigate({ to: "/admin" });
  }, [navigate]);
  const redirect = signInReturnPath(href);
  const openSignIn = useCallback(() => {
    navigate({ search: redirect ? { redirect } : {}, to: "/sign-in" });
  }, [navigate, redirect]);

  if (auth.status === "loading") {
    return <Skeleton className="size-10" shape="circle" />;
  }
  if (!auth.user) {
    return (
      <>
        <Button
          asChild
          className="hidden border-transparent bg-sidebar-foreground text-sidebar hover:bg-sidebar-foreground/90 focus-visible:ring-sidebar-ring focus-visible:ring-offset-sidebar md:inline-flex dark:hover:bg-sidebar-foreground/90"
          variant="secondary"
        >
          <Link search={redirect ? { redirect } : {}} to="/sign-in">
            <LogIn aria-hidden="true" className="size-5 shrink-0" />
            {t("nav.signIn")}
          </Link>
        </Button>
        <Menu>
          <MenuTrigger asChild>
            <IconButton
              className={GREEN_ICON_BUTTON}
              icon={<Settings />}
              label={t("nav.settings")}
            />
          </MenuTrigger>
          <MenuContent className={MENU_CLASS}>
            <MenuItem icon={<LogIn />} onSelect={openSignIn}>
              {t("nav.signIn")}
            </MenuItem>
            <MenuSeparator />
            <SharedItems />
          </MenuContent>
        </Menu>
      </>
    );
  }
  const { user } = auth;
  return (
    <Menu>
      <MenuTrigger asChild>
        <Button
          aria-label={t("a11y.userMenu")}
          className={cn("px-1", GREEN_BUTTON)}
          variant="ghost"
        >
          <Avatar name={user.name} size="md" src={user.image ?? undefined} />
        </Button>
      </MenuTrigger>
      <MenuContent className={MENU_CLASS}>
        <MenuLabel>
          <Text as="span" className="block" weight="semibold">
            {user.name}
          </Text>
          <Text as="span" className="block" size="body-sm" tone="muted">
            {user.email}
          </Text>
        </MenuLabel>
        <MenuSeparator />
        <MenuItem icon={<UserRound />} onSelect={openAccount}>
          {t("nav.account")}
        </MenuItem>
        {/* Admins only; the admin pages check the role on the server. */}
        {user.role === "admin" ? (
          <MenuItem icon={<ShieldCheck />} onSelect={openAdmin}>
            {t("nav.admin")}
          </MenuItem>
        ) : null}
        <MenuSeparator />
        <SharedItems />
        <MenuSeparator />
        <MenuItem icon={<LogOut />} onSelect={signOut}>
          {t("nav.signOut")}
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}
