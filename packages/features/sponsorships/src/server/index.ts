// biome-ignore-all lint/performance/noBarrelFile: the `@smog/sponsorships/server` entry point (Worker only).
/**
 * `@smog/sponsorships/server`: the state machine, the money path, the
 * admin's lifecycle builders, the render seam and the public router
 * (phase 6 ruling 1). The queue consumers and cron handlers that call these
 * are wired in `apps/site/src/worker/*`; the admin gets the builders
 * through `AdminDeps.sponsorships` from `@smog/api`.
 */
export { getAvailability } from "./availability";
export {
  type AfterCommit,
  approveStatements,
  cancelPaymentStatements,
  forceExpireStatements,
  type LifecyclePlan,
  markPaidStatements,
  type PaymentPlan,
  recordRefundStatements,
  regenerateTokenStatements,
  rejectStatements,
  requestChangesStatements,
  SponsorshipActionError,
  type TokenPlan,
} from "./lifecycle";
export {
  PaymentProviderError,
  type StartMolliePaymentInput,
  startMolliePayment,
} from "./mollie-payment";
export type { SponsorshipsDeps, SponsorshipsImplementer } from "./procedure";
export { getQuote } from "./quote";
export {
  type AdminRecipient,
  adminRecipients,
  emailAdmins,
} from "./recipients";
export {
  completeRender,
  createRenderJob,
  createRenderJobStatements,
  failRender,
  fakeRenderStarter,
  markRenderRunning,
  type RenderJobPlan,
  renderStarterFor,
} from "./render";
export { createSponsorshipsRouter } from "./router";
export {
  isRenewable,
  renewStatements,
  type SettleInput,
  type SettleOutcome,
  type SettleResult,
  settleFromMollie,
  settlePayment,
} from "./settle";
export {
  type IssuedToken,
  isGestureTaken,
  isStalePayment,
  issueTokenStatements,
  PAYMENT_STALE_GUARD,
  paymentGuard,
  refundStatement,
  revokeTokensStatement,
} from "./statements";
export {
  eventStatement,
  InvalidTransitionError,
  isStaleTransition,
  SponsorshipEventDataError,
  type SponsorshipPatch,
  STALE_GUARD,
  type TrailEvent,
  type TransitionInput,
  transitionStatements,
} from "./transition";
export {
  isTransitionEvent,
  TRANSITION_EVENTS,
  type TransitionEvent,
  transition,
} from "./transition-table";
