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
      <DropdownMenuContent align="end" className="bg-card">
        <DropdownMenuLabel>{t("web.userMenu.myAccount")}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="px-2 py-1.5 text-muted-foreground text-sm">
          {user.email}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link className="flex items-center gap-2" to="/account">
            <Settings className="h-4 w-4" />
            {t("web.userMenu.accountSettings")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="cursor-pointer"
          onClick={() => {
            signOut();
            navigate({ to: "/" });
          }}
          variant="destructive"
        >
          {t("web.userMenu.signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
