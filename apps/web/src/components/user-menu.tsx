import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/auth";
import { Skeleton } from "./ui/skeleton";

export default function UserMenu() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, isLoading, signOut } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Handle click outside to close menu
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  // Handle escape key to close menu
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
    }

    return () => {
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

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
    <div className="relative" ref={menuRef}>
      <button
        className="cursor-pointer text-primary hover:underline"
        onClick={() => setIsOpen(!isOpen)}
        type="button"
      >
        {displayName}
      </button>

      {isOpen === true && (
        <div className="absolute top-full right-0 z-50 mt-2 w-48 rounded-lg border border-border bg-background shadow-lg">
          <div className="flex flex-col p-2">
            <Link
              className="flex items-center gap-2 rounded-md px-3 py-2.5 text-left text-base text-foreground transition-colors hover:bg-secondary"
              onClick={() => setIsOpen(false)}
              to="/account"
            >
              {t("web.userMenu.accountSettings")}
            </Link>
            <button
              className="flex cursor-pointer items-center rounded-md px-3 py-2.5 text-left text-base text-destructive transition-colors hover:bg-secondary"
              onClick={() => {
                signOut();
                setIsOpen(false);
                navigate({ to: "/" });
              }}
              type="button"
            >
              {t("web.userMenu.signOut")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
