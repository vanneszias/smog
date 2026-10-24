import type { ReactElement } from "react";
import { LessonScreen } from "@/lessons/lesson-screen";

/** `settings/lessons/<id>`: one lesson, with the PDF export. */
export default function LessonRoute(): ReactElement {
  return <LessonScreen />;
}
