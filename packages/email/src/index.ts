// biome-ignore-all lint/performance/noBarrelFile: the package entry point (`@smog/email`).
export { APP_NAME } from "./app-name";
export { emailLocale } from "./locale";
export type { EmailOutbox, OutboxEmail } from "./outbox";
export {
  type EmailTemplateId,
  type EmailTemplateProps,
  type RenderedEmail,
  renderEmail,
} from "./render";
export { type SendEmailInput, sendEmail } from "./send";
export {
  CloudflareEmailSender,
  createEmailSender,
  DEV_MAIL_KEY,
  DEV_MAIL_LIMIT,
  DevEmailSender,
  type EmailMessage,
  type EmailSender,
  type EmailSenderOptions,
  MemoryEmailSender,
  readDevMail,
  type StoredEmail,
} from "./sender";
