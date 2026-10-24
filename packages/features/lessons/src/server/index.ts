// biome-ignore-all lint/performance/noBarrelFile: the `@smog/lessons/server` entry point (Worker only).
export {
  hasTeacherText,
  type TeacherInfoCoverage,
  teacherInfoCoverage,
} from "./coverage";
export { findDrawing, type StoredDrawing } from "./drawing-read";
export { verifyDrawingUpload } from "./drawing-upload";
export { type DrawingVerdict, inspectDrawing } from "./drawing-verify";
export { LessonExportError } from "./export-plan";
export {
  type ExportDeps,
  type ExportInput,
  type ExportLabels,
  type ExportResult,
  exportLessonPdf,
  LESSON_PDF_MAX_BYTES,
  LESSON_PDF_PREFIX,
  recordLessonExport,
} from "./export-run";
export {
  type DrawingBucket,
  type DrawingCursorStore,
  sweepOrphanDrawings,
} from "./orphan-drawings";
export { type PdfCacheBucket, sweepStalePdfs } from "./pdf-cache-sweep";
export {
  createLessonsRouter,
  createTeacherRouter,
  type LessonsRouter,
  type TeacherRouter,
} from "./router";
