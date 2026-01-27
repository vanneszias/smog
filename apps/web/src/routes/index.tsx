import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Hero } from "@/components/home/Hero";

export const Route = createFileRoute("/")({
  component: HomeComponent,
});

function HomeComponent() {
  const navigate = useNavigate();

  const handleSearch = (query: string) => {
    navigate({
      to: "/gestures",
      search: { q: query },
    });
  };

  return (
    <div>
      {/* Hero Section with Search */}
      <Hero onSearch={handleSearch} />
    </div>
  );
}
