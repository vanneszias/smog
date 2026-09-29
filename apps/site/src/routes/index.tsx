import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home(): ReactNode {
  return (
    <main className="flex min-h-screen items-center justify-center">
      <h1 className="font-bold text-4xl">SMOG &amp; Co</h1>
    </main>
  );
}
