import { Link } from "@tanstack/react-router";
import { Heart } from "lucide-react";
import { useFavorites } from "@/lib/favorites-context";
import { ModeToggle } from "./mode-toggle";
import UserMenu from "./user-menu";

export default function Header() {
  const { favoriteIds } = useFavorites();

  const links = [
    { to: "/", label: "Home" },
    { to: "/dashboard", label: "Dashboard" },
    { to: "/gestures", label: "Gestures" },
  ] as const;

  return (
    <div>
      <div className="flex flex-row items-center justify-between px-2 py-1">
        <nav className="flex gap-4 text-lg">
          {links.map(({ to, label }) => (
            <Link key={to} to={to}>
              {label}
            </Link>
          ))}
          <Link className="flex items-center gap-1.5" to="/favorites">
            <Heart className="h-4 w-4" style={{ color: "var(--liked)" }} />
            Favorites
            {favoriteIds.length > 0 ? (
              <span className="ml-1 rounded-full bg-[var(--liked)] px-2 py-0.5 font-medium text-white text-xs">
                {favoriteIds.length}
              </span>
            ) : null}
          </Link>
        </nav>
        <div className="flex items-center gap-2">
          <ModeToggle />
          <UserMenu />
        </div>
      </div>
      <hr />
    </div>
  );
}
