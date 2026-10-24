// biome-ignore-all lint/performance/noBarrelFile: Drizzle and drizzle-kit need every table in one schema module.
export { auditLog, consentEvent, guestImport } from "./account";
export { account, passkey, session, user, verification } from "./auth";
export { deadLetter } from "./dead-letter";
export {
  categoryTranslation,
  gestureAudio,
  gestureTranslation,
  legalText,
  uiString,
} from "./i18n";
export { language } from "./language";
export {
  category,
  favorite,
  gesture,
  gestureCategory,
  gestureKeyword,
  list,
  listItem,
  listShare,
} from "./learning";
export {
  lesson,
  lessonItem,
  lessonSection,
  lessonSectionTranslation,
  lessonTranslation,
} from "./lessons";
export * from "./relations";
export { userRole } from "./roles";
export {
  invoiceRequest,
  payment,
  paymentItem,
  renderJob,
  sponsor,
  sponsorship,
  sponsorshipEvent,
  sponsorshipToken,
} from "./sponsorships";
export { gestureDrawing, gestureTeacherInfo } from "./teacher";
