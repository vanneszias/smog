import { createFileRoute, redirect } from "@tanstack/react-router";
import { TRANSLATION_HOME } from "@/lib/admin-access";

/** `/admin/translation`: the strings are the translation home. */
export const Route = createFileRoute("/admin/translation/")({
  beforeLoad: () => {
    throw redirect({ replace: true, to: TRANSLATION_HOME });
  },
});
