/**
 * Drizzle relations for the relational query API (`db.query.*` with `with`)
 * and Better Auth's adapter joins. They add no SQL; the foreign keys are
 * declared on the tables.
 */
import { relations } from "drizzle-orm";
import { auditLog, consentEvent } from "./account";
import { account, passkey, session, user } from "./auth";
import {
  category,
  favorite,
  gesture,
  gestureCategory,
  gestureKeyword,
  list,
  listItem,
  listShare,
} from "./learning";
import {
  invoiceRequest,
  payment,
  paymentItem,
  renderJob,
  sponsor,
  sponsorship,
  sponsorshipEvent,
  sponsorshipToken,
} from "./sponsorships";

export const userRelations = relations(user, ({ many }) => ({
  accounts: many(account),
  auditLogs: many(auditLog),
  consentEvents: many(consentEvent),
  favorites: many(favorite),
  lists: many(list),
  passkeys: many(passkey),
  sessions: many(session),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, { fields: [session.userId], references: [user.id] }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, { fields: [account.userId], references: [user.id] }),
}));

export const passkeyRelations = relations(passkey, ({ one }) => ({
  user: one(user, { fields: [passkey.userId], references: [user.id] }),
}));

export const categoryRelations = relations(category, ({ many }) => ({
  gestures: many(gestureCategory),
}));

export const gestureRelations = relations(gesture, ({ many }) => ({
  categories: many(gestureCategory),
  favorites: many(favorite),
  keywords: many(gestureKeyword),
  listItems: many(listItem),
  sponsorships: many(sponsorship),
}));

export const gestureCategoryRelations = relations(
  gestureCategory,
  ({ one }) => ({
    category: one(category, {
      fields: [gestureCategory.categoryId],
      references: [category.id],
    }),
    gesture: one(gesture, {
      fields: [gestureCategory.gestureId],
      references: [gesture.id],
    }),
  })
);

export const gestureKeywordRelations = relations(gestureKeyword, ({ one }) => ({
  gesture: one(gesture, {
    fields: [gestureKeyword.gestureId],
    references: [gesture.id],
  }),
}));

export const favoriteRelations = relations(favorite, ({ one }) => ({
  gesture: one(gesture, {
    fields: [favorite.gestureId],
    references: [gesture.id],
  }),
  user: one(user, { fields: [favorite.userId], references: [user.id] }),
}));

export const listRelations = relations(list, ({ many, one }) => ({
  items: many(listItem),
  owner: one(user, { fields: [list.ownerId], references: [user.id] }),
  shares: many(listShare),
}));

export const listItemRelations = relations(listItem, ({ one }) => ({
  addedByUser: one(user, {
    fields: [listItem.addedBy],
    references: [user.id],
  }),
  gesture: one(gesture, {
    fields: [listItem.gestureId],
    references: [gesture.id],
  }),
  list: one(list, { fields: [listItem.listId], references: [list.id] }),
}));

export const listShareRelations = relations(listShare, ({ one }) => ({
  list: one(list, { fields: [listShare.listId], references: [list.id] }),
}));

export const consentEventRelations = relations(consentEvent, ({ one }) => ({
  user: one(user, { fields: [consentEvent.userId], references: [user.id] }),
}));

export const auditLogRelations = relations(auditLog, ({ one }) => ({
  actor: one(user, { fields: [auditLog.actorId], references: [user.id] }),
}));

export const sponsorRelations = relations(sponsor, ({ many, one }) => ({
  invoiceRequest: one(invoiceRequest),
  sponsorships: many(sponsorship),
}));

export const invoiceRequestRelations = relations(invoiceRequest, ({ one }) => ({
  sponsor: one(sponsor, {
    fields: [invoiceRequest.sponsorId],
    references: [sponsor.id],
  }),
}));

export const sponsorshipRelations = relations(sponsorship, ({ many, one }) => ({
  events: many(sponsorshipEvent),
  gesture: one(gesture, {
    fields: [sponsorship.gestureId],
    references: [gesture.id],
  }),
  paymentItems: many(paymentItem),
  renderJobs: many(renderJob),
  sponsor: one(sponsor, {
    fields: [sponsorship.sponsorId],
    references: [sponsor.id],
  }),
  tokens: many(sponsorshipToken),
}));

export const paymentRelations = relations(payment, ({ many }) => ({
  items: many(paymentItem),
}));

export const paymentItemRelations = relations(paymentItem, ({ one }) => ({
  payment: one(payment, {
    fields: [paymentItem.paymentId],
    references: [payment.id],
  }),
  sponsorship: one(sponsorship, {
    fields: [paymentItem.sponsorshipId],
    references: [sponsorship.id],
  }),
}));

export const renderJobRelations = relations(renderJob, ({ one }) => ({
  sponsorship: one(sponsorship, {
    fields: [renderJob.sponsorshipId],
    references: [sponsorship.id],
  }),
}));

export const sponsorshipEventRelations = relations(
  sponsorshipEvent,
  ({ one }) => ({
    actor: one(user, {
      fields: [sponsorshipEvent.actorId],
      references: [user.id],
    }),
    sponsorship: one(sponsorship, {
      fields: [sponsorshipEvent.sponsorshipId],
      references: [sponsorship.id],
    }),
  })
);

export const sponsorshipTokenRelations = relations(
  sponsorshipToken,
  ({ one }) => ({
    sponsorship: one(sponsorship, {
      fields: [sponsorshipToken.sponsorshipId],
      references: [sponsorship.id],
    }),
  })
);
