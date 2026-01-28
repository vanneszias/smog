import { Link, useNavigate } from "@tanstack/react-router";
import { Settings } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/lib/auth";
import { Button } from "./ui/button";
import { Skeleton } from "./ui/skeleton";

export default function UserMenu() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, isLoading, signOut } = useAuth();

  if (isLoading) {
    return <Skeleton className="h-5 w-20" />;
  }

  if (!user) {
    return (
      <Link className="text-primary hover:underline" to="/login">
        {t("web.signIn.link")}
      </Link>
    );
  }

  const displayName = user.firstName
    ? `${user.firstName} ${user.lastName || ""}`.trim()
    : user.email;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="text-primary hover:underline" type="button">
          {displayName}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="bg-card">
        <DropdownMenuLabel>{t("web.userMenu.myAccount")}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem>{user.email}</DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link className="flex items-center gap-2" to="/account">
            <Settings className="h-4 w-4" />
            {t("web.userMenu.accountSettings")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Button
            className="w-full"
            onClick={() => {
              signOut();
              navigate({ to: "/" });
            }}
            variant="destructive"
          >
            {t("web.userMenu.signOut")}
          </Button>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
