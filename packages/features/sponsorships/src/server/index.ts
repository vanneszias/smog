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
  FANOUT_MARKER_TTL_S,
  markFanout,
  recentFanout,
} from "./fanout-marker";
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
  isLogoContentType,
  LOGO_KEY_PREFIX,
  r2Origin,
  signLogoUpload,
  sniffLogoType,
  verifyLogoUpload,
} from "./logo";
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
export { type ReeditLogo, readReeditLogo } from "./reedit";
export { isRejectedTooLongAgo } from "./rejected-video";
export {
  completeRender,
  createRenderJob,
  createRenderJobStatements,
  failRender,
  fakeRenderStarter,
  isCurrentRenderUpload,
  type MarkRunningState,
  markRenderRunning,
  type RenderJobPlan,
  type RenderJobRecord,
  readRenderJob,
  retryRenderStatements,
  setRenderUpload,
} from "./render";
export {
  instanceErrorSummary,
  RENDER_NEVER_STARTED_MS,
  RENDER_QUEUED_GRACE_MS,
  RENDER_WATCHDOG_BUDGET,
  type RenderWatchdogResult,
  reconcileRenderJobs,
  type WorkflowInstanceState,
  type WorkflowInstanceStatus,
  type WorkflowStatusPort,
} from "./render-watchdog";
export {
  ENGINE_ABORT_PREFIX,
  isEngineAbort,
  nonRetryableMessage,
  RENDER_JOB_FAILURE_CODES,
  RENDER_STEP_CONFIG,
  RENDER_WAITS,
  RENDER_WATCHDOG_CEILING,
  RENDER_WORKFLOW_MAX_MS,
  type ReadLogo,
  type RenderJobDeps,
  RenderJobFailure,
  type RenderJobFailureCode,
  type RenderJobOutcome,
  type RenderStep,
  type RenderStepConfig,
  releaseRenderUpload,
  renderEventType,
  runRenderJob,
  stepWorstCaseMs,
  summariseRenderError,
  toRenderJobFailure,
} from "./render-workflow";
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
export { handlePaymentSettled, queuedRenderJob } from "./settled";
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
  type ExpirySweepResult,
  REMINDER_WINDOW_MS,
  type ReminderSweepResult,
  type RetentionPurgeResult,
  runExpirySweep,
  runReminderSweep,
  runRetentionPurge,
  runStaleSweep,
  STALE_PAYMENT_AGE_MS,
  type StaleSweepResult,
} from "./sweeps";
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
