import type {
  account,
  auditLog,
  category,
  categoryTranslation,
  consentEvent,
  deadLetter,
  favorite,
  gesture,
  gestureAudio,
  gestureCategory,
  gestureDrawing,
  gestureKeyword,
  gestureTeacherInfo,
  gestureTranslation,
  invoiceRequest,
  language,
  legalText,
  lesson,
  lessonItem,
  lessonSection,
  lessonSectionTranslation,
  lessonTranslation,
  list,
  listItem,
  listShare,
  passkey,
  payment,
  paymentItem,
  renderJob,
  session,
  sponsor,
  sponsorship,
  sponsorshipEvent,
  sponsorshipToken,
  uiString,
  user,
  userRole,
  verification,
} from "./schema";

/** Row types (`select`) and insert types (`New…`) for every table. */
export type User = typeof user.$inferSelect;
export type NewUser = typeof user.$inferInsert;
export type DeadLetter = typeof deadLetter.$inferSelect;
export type NewDeadLetter = typeof deadLetter.$inferInsert;
export type Session = typeof session.$inferSelect;
export type Account = typeof account.$inferSelect;
export type Verification = typeof verification.$inferSelect;
export type Passkey = typeof passkey.$inferSelect;
export type Category = typeof category.$inferSelect;
export type NewCategory = typeof category.$inferInsert;
export type Gesture = typeof gesture.$inferSelect;
export type NewGesture = typeof gesture.$inferInsert;
export type GestureCategory = typeof gestureCategory.$inferSelect;
export type GestureKeyword = typeof gestureKeyword.$inferSelect;
export type Favorite = typeof favorite.$inferSelect;
export type List = typeof list.$inferSelect;
export type NewList = typeof list.$inferInsert;
export type ListItem = typeof listItem.$inferSelect;
export type ListShare = typeof listShare.$inferSelect;
export type ConsentEvent = typeof consentEvent.$inferSelect;
export type AuditLog = typeof auditLog.$inferSelect;
export type Sponsor = typeof sponsor.$inferSelect;
export type InvoiceRequest = typeof invoiceRequest.$inferSelect;
export type Sponsorship = typeof sponsorship.$inferSelect;
export type NewSponsorship = typeof sponsorship.$inferInsert;
export type Payment = typeof payment.$inferSelect;
export type PaymentItem = typeof paymentItem.$inferSelect;
export type RenderJob = typeof renderJob.$inferSelect;
export type SponsorshipEvent = typeof sponsorshipEvent.$inferSelect;
export type SponsorshipToken = typeof sponsorshipToken.$inferSelect;

/** Phase 10b: languages, translations, audio, legal texts and roles. */
export type Language = typeof language.$inferSelect;
export type NewLanguage = typeof language.$inferInsert;
export type UiString = typeof uiString.$inferSelect;
export type NewUiString = typeof uiString.$inferInsert;
export type GestureTranslation = typeof gestureTranslation.$inferSelect;
export type NewGestureTranslation = typeof gestureTranslation.$inferInsert;
export type CategoryTranslation = typeof categoryTranslation.$inferSelect;
export type NewCategoryTranslation = typeof categoryTranslation.$inferInsert;
export type GestureAudio = typeof gestureAudio.$inferSelect;
export type NewGestureAudio = typeof gestureAudio.$inferInsert;
export type LegalText = typeof legalText.$inferSelect;
export type NewLegalText = typeof legalText.$inferInsert;
export type UserRoleRow = typeof userRole.$inferSelect;
export type NewUserRoleRow = typeof userRole.$inferInsert;

/** Phase 10c: private teaching material and lessons. */
export type GestureTeacherInfo = typeof gestureTeacherInfo.$inferSelect;
export type NewGestureTeacherInfo = typeof gestureTeacherInfo.$inferInsert;
export type GestureDrawing = typeof gestureDrawing.$inferSelect;
export type NewGestureDrawing = typeof gestureDrawing.$inferInsert;
export type Lesson = typeof lesson.$inferSelect;
export type NewLesson = typeof lesson.$inferInsert;
export type LessonTranslation = typeof lessonTranslation.$inferSelect;
export type NewLessonTranslation = typeof lessonTranslation.$inferInsert;
export type LessonSection = typeof lessonSection.$inferSelect;
export type NewLessonSection = typeof lessonSection.$inferInsert;
export type LessonSectionTranslation =
  typeof lessonSectionTranslation.$inferSelect;
export type NewLessonSectionTranslation =
  typeof lessonSectionTranslation.$inferInsert;
export type LessonItem = typeof lessonItem.$inferSelect;
export type NewLessonItem = typeof lessonItem.$inferInsert;
