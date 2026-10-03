// biome-ignore-all lint/performance/noBarrelFile: the package entry point (`@smog/email`).
export { APP_NAME } from "./app-name";
export { emailLocale } from "./locale";
export {
  DirectEmailOutbox,
  deliverEmail,
  type EmailDeliveryEnv,
  type EmailOutbox,
  type OutboxEmail,
} from "./outbox";
export {
  EmailRenderError,
  type EmailTemplateId,
  type EmailTemplateProps,
  type RenderedEmail,
  type RenderOptions,
  renderEmail,
} from "./render";
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
