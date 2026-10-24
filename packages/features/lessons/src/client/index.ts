// biome-ignore-all lint/performance/noBarrelFile: the `@smog/lessons/client` entry point.
export {
  type DrawingFile,
  type DrawingProblem,
  DrawingUploadError,
  type DrawingUploadParams,
  drawingFileProblem,
  drawingProblemOf,
  drawingTypeOf,
  uploadDrawingFile,
  useDrawingActions,
  useGestureDrawings,
} from "./drawings";
export {
  TEACHER_STALE_TIME,
  type TeacherClient,
  useInvalidateTeacher,
  useTeacherClient,
  useTeacherKey,
  useTeacherRpc,
} from "./slice";
