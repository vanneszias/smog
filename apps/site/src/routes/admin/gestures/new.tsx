import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { GestureEditor } from "@/components/admin/catalog/gesture-editor";
import { pageMeta } from "@/lib/head";

export const Route = createFileRoute("/admin/gestures/new")({
  component: AdminNewGesture,
  head: ({ matches }) => pageMeta(matches, "admin.gestures.editor.newTitle"),
});

/** `/admin/gestures/new` (A-16): the editor for a new gesture. */
function AdminNewGesture(): ReactNode {
  return <GestureEditor gesture={null} />;
}
