import { SearchBar } from "@smog/ui";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, BookOpen, Heart, Search } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import Logo from "@/components/Logo";
import RecentSearches from "@/components/RecentSearches";

export const Route = createFileRoute("/")({
  component: HomeComponent,
});

function HomeComponent() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [recentSearches] = useState<string[]>([
    "hallo",
    "dank u",
    "alstublieft",
    "sorry",
  ]);

  const handleSearch = (query: string) => {
    if (query.trim()) {
      navigate({
        to: "/gestures",
        search: { q: query },
      });
    }
  };

  const handleRecentSearchSelect = (search: string) => {
    setSearchQuery(search);
    handleSearch(search);
  };

  return (
    <div className="flex min-h-full flex-col bg-background">
      {/* Hero Section */}
      <div className="container mx-auto flex flex-1 flex-col items-center justify-center px-4 py-12 md:py-20">
        <div className="mb-8 md:mb-12">
          <Logo height={100} width={300} />
        </div>

        <h1
          className="mb-4 text-center font-bold text-3xl leading-tight md:text-5xl"
          style={{ color: "var(--text)" }}
        >
          {t("web.home.title")}
        </h1>

        <p
          className="mb-8 max-w-2xl text-center text-lg md:mb-12 md:text-xl"
          style={{ color: "var(--text-light)" }}
        >
          {t("web.home.subtitle")}
        </p>

        {/* Search Section */}
        <div className="w-full max-w-2xl">
          <SearchBar
            autoFocus
            className="mb-6"
            onChange={setSearchQuery}
            onSubmit={handleSearch}
            placeholder={t("web.home.searchPlaceholder")}
            value={searchQuery}
          />

          <RecentSearches
            className="mb-8"
            onSelect={handleRecentSearchSelect}
            searches={recentSearches}
          />
        </div>

        {/* Feature Cards */}
        <div className="mt-12 grid w-full max-w-4xl gap-6 md:grid-cols-3">
          <Link
            className="group rounded-xl border border-border bg-card p-6 transition-all hover:shadow-lg"
            to="/gestures"
          >
            <div
              className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg"
              style={{ backgroundColor: "var(--primary)" }}
            >
              <Search className="h-6 w-6 text-white" />
            </div>
            <h3
              className="mb-2 font-semibold text-lg"
              style={{ color: "var(--text)" }}
            >
              {t("web.home.browseGestures.title")}
            </h3>
            <p className="mb-4 text-sm" style={{ color: "var(--text-light)" }}>
              {t("web.home.browseGestures.description")}
            </p>
            <div
              className="flex items-center font-medium text-sm"
              style={{ color: "var(--primary)" }}
            >
              {t("web.home.browseGestures.action")}
              <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
            </div>
          </Link>

          <Link
            className="group rounded-xl border border-border bg-card p-6 transition-all hover:shadow-lg"
            to="/favorites"
          >
            <div
              className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg"
              style={{ backgroundColor: "var(--liked)" }}
            >
              <Heart className="h-6 w-6 text-white" />
            </div>
            <h3
              className="mb-2 font-semibold text-lg"
              style={{ color: "var(--text)" }}
            >
              {t("web.home.saveFavorites.title")}
            </h3>
            <p className="mb-4 text-sm" style={{ color: "var(--text-light)" }}>
              {t("web.home.saveFavorites.description")}
            </p>
            <div
              className="flex items-center font-medium text-sm"
              style={{ color: "var(--liked)" }}
            >
              {t("web.home.saveFavorites.action")}
              <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
            </div>
          </Link>

          <Link
            className="group rounded-xl border border-border bg-card p-6 transition-all hover:shadow-lg"
            to="/gestures"
          >
            <div
              className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg"
              style={{ backgroundColor: "var(--accent)" }}
            >
              <BookOpen className="h-6 w-6 text-white" />
            </div>
            <h3
              className="mb-2 font-semibold text-lg"
              style={{ color: "var(--text)" }}
            >
              {t("web.home.learnByCategory.title")}
            </h3>
            <p className="mb-4 text-sm" style={{ color: "var(--text-light)" }}>
              {t("web.home.learnByCategory.description")}
            </p>
            <div
              className="flex items-center font-medium text-sm"
              style={{ color: "var(--accent)" }}
            >
              {t("web.home.learnByCategory.action")}
              <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
            </div>
          </Link>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-border border-t py-6">
        <div
          className="container mx-auto px-4 text-center text-sm"
          style={{ color: "var(--text-light)" }}
        >
          <p>{t("web.home.footer")}</p>
        </div>
      </footer>
    </div>
  );
}
