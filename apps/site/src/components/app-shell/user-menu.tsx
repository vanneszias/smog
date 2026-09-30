import { useAuthState } from "@smog/auth/react";
import { useTranslation } from "@smog/i18n/react";
import {
  Avatar,
  Button,
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
import { LogIn, LogOut, UserRound } from "lucide-react";
import { type ReactNode, useCallback } from "react";
import { useAuthClient } from "@/lib/auth-client";
import { signInReturnPath } from "@/lib/redirect";

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

/** The header's account entry: the user menu, or "Sign in". */
export function UserMenu(): ReactNode {
  const { t } = useTranslation();
  const auth = useAuthState();
  const navigate = useNavigate();
  const signOut = useSignOut();
  const { href } = useLocation();
  const openAccount = useCallback(() => {
    navigate({ to: "/account" });
  }, [navigate]);

  if (auth.status === "loading") {
    return <Skeleton className="size-10" shape="circle" />;
  }
  if (!auth.user) {
    const redirect = signInReturnPath(href);
    return (
      <Button asChild icon={<LogIn />} variant="secondary">
        <Link search={redirect ? { redirect } : {}} to="/sign-in">
          {t("nav.signIn")}
        </Link>
      </Button>
    );
  }
  const { user } = auth;
  return (
    <Menu>
      <MenuTrigger asChild>
        <Button
          aria-label={t("a11y.userMenu")}
          className="px-1"
          variant="ghost"
        >
          <Avatar name={user.name} size="md" src={user.image ?? undefined} />
        </Button>
      </MenuTrigger>
      <MenuContent>
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
        <MenuItem icon={<LogOut />} onSelect={signOut}>
          {t("nav.signOut")}
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}
