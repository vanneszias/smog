import type {
  account,
  auditLog,
  category,
  consentEvent,
  favorite,
  gesture,
  gestureCategory,
  gestureKeyword,
  invoiceRequest,
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
  user,
  verification,
} from "./schema";

/** Row types (`select`) and insert types (`New…`) for every table. */
export type User = typeof user.$inferSelect;
export type NewUser = typeof user.$inferInsert;
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
