import { useTranslation } from "@smog/i18n/react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { type ReactNode, useCallback } from "react";
import { AdminPage } from "@/components/admin/admin-page";
import {
  type DeadLetterSearch,
  DeadLetterTable,
  validateDeadLetterSearch,
} from "@/components/admin/dead-letters/dead-letter-table";
import { pageMeta } from "@/lib/head";

export const Route = createFileRoute("/admin/dead-letters")({
  component: AdminDeadLetters,
  head: ({ matches }) => pageMeta(matches, "admin.deadLetters.title"),
  validateSearch: validateDeadLetterSearch,
});

/**
 * `/admin/dead-letters` (phase 9 task 4): the messages the DLQ consumers
 * stored after every retry failed, with Replay and Discard.
 */
function AdminDeadLetters(): ReactNode {
  const { t } = useTranslation();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const onSearchChange = useCallback(
    (next: DeadLetterSearch) => {
      navigate({ search: next }).catch((error: unknown) => {
        console.error(
          "[admin] Failed to update the dead-letter filters:",
          error
        );
      });
    },
    [navigate]
  );
  return (
    <AdminPage
      description={t("admin.deadLetters.description")}
      title={t("admin.deadLetters.title")}
    >
      <DeadLetterTable onSearchChange={onSearchChange} search={search} />
    </AdminPage>
  );
}
