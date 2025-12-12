import { SearchBar } from "@smog/ui";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, BookOpen, Heart, Search } from "lucide-react";
import { useState } from "react";
import Logo from "@/components/Logo";
import RecentSearches from "@/components/RecentSearches";

export const Route = createFileRoute("/")({
  component: HomeComponent,
});

function HomeComponent() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [recentSearches] = useState<string[]>([
    "hello",
    "thank you",
    "please",
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
          Learn Sign Language
        </h1>

        <p
          className="mb-8 max-w-2xl text-center text-lg md:mb-12 md:text-xl"
          style={{ color: "var(--text-light)" }}
        >
          Discover and master sign language gestures with our comprehensive
          video library. Search, learn, and practice at your own pace.
        </p>

        {/* Search Section */}
        <div className="w-full max-w-2xl">
          <SearchBar
            autoFocus
            className="mb-6"
            onChange={setSearchQuery}
            onSubmit={handleSearch}
            placeholder="Search for a gesture..."
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
              Browse Gestures
            </h3>
            <p className="mb-4 text-sm" style={{ color: "var(--text-light)" }}>
              Explore our complete library of sign language gestures with
              detailed videos and descriptions.
            </p>
            <div
              className="flex items-center font-medium text-sm"
              style={{ color: "var(--primary)" }}
            >
              Explore now
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
              Save Favorites
            </h3>
            <p className="mb-4 text-sm" style={{ color: "var(--text-light)" }}>
              Create your personal collection of gestures to practice and review
              anytime.
            </p>
            <div
              className="flex items-center font-medium text-sm"
              style={{ color: "var(--liked)" }}
            >
              View favorites
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
              Learn by Category
            </h3>
            <p className="mb-4 text-sm" style={{ color: "var(--text-light)" }}>
              Filter gestures by topic and category to focus on what you need to
              learn.
            </p>
            <div
              className="flex items-center font-medium text-sm"
              style={{ color: "var(--accent)" }}
            >
              Start learning
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
          <p>© 2024 SMOG. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
