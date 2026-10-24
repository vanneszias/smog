// biome-ignore-all lint/performance/noBarrelFile: the `@smog/lessons/client` entry point (site only).
/** `@smog/lessons/client`: TanStack Query hooks over the typed `teacher` slice. Never imports ./server. */
export {
  teacherConflictOf,
  useSaveTeacherInfo,
  useTeacherInfo,
} from "./hooks";
export { TEACHER_STALE_TIME } from "./slice";
