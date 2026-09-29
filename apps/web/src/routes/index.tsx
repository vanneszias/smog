import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { Hero } from "@/components/home/Hero";

export const Route = createFileRoute("/")({
  component: HomeComponent,
});

function HomeComponent() {
  const navigate = useNavigate();

  const handleSearch = useCallback(
    (query: string): void => {
      navigate({
        search: { q: query },
        to: "/gestures",
      });
    },
    [navigate]
  );

  return (
    <div>
      {/* Hero Section with Search */}
      <Hero onSearch={handleSearch} />
    </div>
  );
}
