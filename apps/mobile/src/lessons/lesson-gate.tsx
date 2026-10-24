import { useAuthState } from "@smog/auth/react";
import { useTranslation } from "@smog/i18n/react";
import { EmptyState, Skeleton } from "@smog/ui-native";
import type { ReactElement, ReactNode } from "react";
import { View } from "react-native";

/** `loading` until the session is known, then whether the account may see lessons. */
export type LessonAccess = "allowed" | "denied" | "loading";

/**
 * Lessons are for the `teacher` and `admin` roles (`session.user.roles`,
 * read from D1 on every session fetch, so a demotion applies at once). The
 * server refuses every other account on its own (`lessons.*` and the PDF
 * route); this only keeps the screens out of everyone else's way.
 */
export function useLessonAccess(): LessonAccess {
  const { status, user } = useAuthState();
  if (status === "loading") {
    return "loading";
  }
  if (
    user &&
    (user.role === "admin" ||
      user.roles.includes("teacher") ||
      user.roles.includes("admin"))
  ) {
    return "allowed";
  }
  return "denied";
}

/** The children for a teacher or admin; a skeleton while the session loads; a notice for anyone else. */
export function LessonGate({
  children,
}: {
  children: ReactNode;
}): ReactElement {
  const { t } = useTranslation();
  const access = useLessonAccess();
  if (access === "allowed") {
    return <>{children}</>;
  }
  if (access === "loading") {
    return (
      <View className="gap-3 px-4 pt-2" testID="lessons-gate-loading">
        <Skeleton className="h-12" />
        <Skeleton className="h-12" />
      </View>
    );
  }
  return (
    <View className="flex-1 bg-background" testID="lessons-forbidden">
      <EmptyState
        description={t("teacherLessons.forbidden.description")}
        title={t("teacherLessons.forbidden.title")}
      />
    </View>
  );
}
