import type { ReactElement } from "react";
import { LessonListScreen } from "@/lessons/lesson-list-screen";

/** `settings/lessons`: the lessons list (teachers and admins; read only). */
export default function LessonsRoute(): ReactElement {
  return <LessonListScreen />;
}
