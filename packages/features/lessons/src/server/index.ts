// biome-ignore-all lint/performance/noBarrelFile: the `@smog/lessons/server` entry point (Worker only).
export {
  hasTeacherText,
  type TeacherInfoCoverage,
  teacherInfoCoverage,
} from "./coverage";
export { createTeacherRouter, type TeacherRouter } from "./router";
