# 02 - Server / API / Auth / Remotion / Infra analysis (old code at /home/user/ref-master)

Stack: Bun + Hono server (`apps/server`), oRPC (`packages/api`), Convex backend (accessed through `ConvexHttpClient` + shared secret), Mollie, Mux, Remotion render service (separate container), BullMQ/Redis email queue, nodemailer SMTP + imapflow IMAP "Sent" append, node-cron, WorkOS AuthKit auth. Emails are all Dutch (nl / nl-BE).

Convention everywhere: every server -> Convex call passes `serviceToken = process.env.INTERNAL_API_KEY` (`withServiceAuth()`); Convex fn does `requireServiceAuth` (throws `[op] Unauthorized` on mismatch). A few Convex fns are public/unauthenticated (marked "no token" below).

---------------------------------------------------------------------------
## 1. oRPC (router root = `appRouter`, `packages/api/src/routers/index.ts`)

Mounted twice in `apps/server/src/index.ts`: `RPCHandler` at prefix `/rpc` (used by web/native clients) and `OpenAPIHandler` at prefix `/api-reference` (with OpenAPIReferencePlugin + ZodToJsonSchemaConverter zod4). onError -> console.error. Context created per request via `createContext` (see Auth).

Procedure kinds (`packages/api/src/index.ts`):
- `publicProcedure` = no auth.
- `protectedProcedure` = requires `context.workosId` else `ORPCError("UNAUTHORIZED")`.
- `adminProcedure` = protected + `requireAdmin`: `convex users.getUserByWorkOSId(serviceToken, workosId)`; if `user?.role !== "admin"` -> `ORPCError("FORBIDDEN", {message:"Admin access required"})`; adds `userId` (Convex user _id) to context.

Shared helper `getCurrentUserId(workosId)` (lists router): getUserByWorkOSId; if none -> `ORPCError("UNAUTHORIZED",{message:"User is not synced to Convex"})`.
`enrichGestures(gestures)`: collects unique categoryIds, `categories.getByIds`, maps each gesture to `{...gesture, categories:[...]}` (filter Boolean).

### Root
| path | auth | input | output | impl |
|---|---|---|---|---|
| healthCheck | public | none | "OK" | - |
| privateData | protected | none | `{message:"This is private", workosId}` | - |

### categories (public, with in-memory cache)
- `categories.getByIds` public. in `{ids: string[]}`. Empty -> `[]`. Cache lookup (key `ids_<sorted,joined>`), else `convex categories.getByIds({ids})`, cache. Out: `{_id,_creationTime,isActive,name}[]`.
- `categories.list` public, no input. Cache key `_all_categories`; else `convex categories.list` (active categories). 
- Cache: `CategoriesCache` singleton, TTL `1000*60*60` (1 h), `invalidate()` clears all; invalidated on admin category create/update/delete. Logging only if NODE_ENV=development.

### favorites (protected; all require `convexUserId` == caller's Convex user else `ORPCError("FORBIDDEN")`, via `requireCurrentUserId`)
- `favorites.getUserFavoriteGestures` in `{convexUserId:string}` -> gestures (Convex `favorites.getUserFavoriteGestures({userId})`) enriched with `categories`.
- `favorites.getUserFavorites` in `{convexUserId}` -> `favorites.getUserFavorites({userId})` (favorite gesture ids).
- `favorites.isFavorite` in `{convexUserId, gestureId}` -> `favorites.isFavorite` boolean.
- `favorites.toggleFavorite` in `{convexUserId, gestureId}` -> `favorites.toggleUserFavorite` (true = added, false = removed).

### gestures (public)
- `gestures.getById` in `{id:string}` -> `gestures.getById`; null if missing else `{...gesture, categories}` (categories.getByIds).
- `gestures.list` in `{cursor?:string, numItems: number min1 max100 default50}` -> `gestures.list({paginationOpts:{cursor:cursor??null,numItems}})`; then parallel `categories.getByIds` and `sponsorships.getActiveByGestures({gestureIds})`; out `{gestures:[{...g, categories, sponsorship: map[g._id]||null}], continueCursor, isDone}` (sponsorship = `{endDate,sponsorName,status}`).
- `gestures.search` in `{searchText:string, limit?: 1..100}` -> `gestures.search` enriched with categories.

### lists (protected unless noted; user resolved via getCurrentUserId)
- `lists.create` in `{name: string 1..80, description?: string max280, visibility:"private"|"shared", allowSharedEditing:boolean}` -> `lists.createList`.
- `lists.delete` `{listId}` -> `lists.deleteList`.
- `lists.rename` `{listId, name 1..80}` -> `lists.renameList`.
- `lists.updateSharing` `{listId, visibility:"private"|"shared", allowSharedEditing}` -> `lists.updateListSharing`.
- `lists.regenerateShareTokens` `{listId}` -> `lists.regenerateShareTokens`.
- `lists.getMyLists` (no input) -> `lists.listUserLists`.
- `lists.getSavedGestureIds` (no input) -> `lists.getSavedGestureIds`.
- `lists.getGestureListIds` `{gestureId}` -> `lists.getGestureListIds` (which of user's lists contain gesture).
- `lists.getListGestures` `{listId}` -> `lists.getListGestures` enriched with categories.
- `lists.addGestureToList` `{gestureId,listId}` -> `lists.addGestureToList`.
- `lists.removeGestureFromList` `{gestureId,listId}` -> `lists.removeGestureFromList`.
- `lists.reorderItems` `{listId, gestureIds:string[]}` -> `lists.reorderListItems`.
- `lists.initialize` (no input) -> `lists.initializeUserLists` (ensures default favorites list).
- `lists.addGestureToEditableSharedList` `{editShareToken, gestureId}` -> `lists.addGestureToSharedEditableList({editShareToken,gestureId,userId})` (NO service token passed).
- `lists.removeGestureFromEditableSharedList` `{editShareToken, gestureId}` -> `lists.removeGestureFromSharedEditableList` (no service token).
- `lists.getSharedList` PUBLIC `{shareToken}` -> `lists.getSharedList` (no token).
- `lists.getSharedListGestures` PUBLIC `{shareToken}` -> `lists.getSharedListGestures` enriched with categories.
Convex list schema: `gesture_lists` {ownerId,name,description?,visibility private|shared,allowSharedEditing,isDefaultFavorites,viewShareToken?,editShareToken?,createdAt,updatedAt}; `gesture_list_items` {listId,gestureId,position,addedBy?,createdAt}.

### users (protected)
- `users.getByWorkOSId` in `{workosId}`; returns `null` if `workosId !== context.workosId`, else `users.getUserByWorkOSId`.
- `users.getOrCreateUser` (no input): find by workosId; if exists -> `users.updateLastActive` and return it; else `users.createUser({workosId})` then re-query and return. (Only workosId is stored; email is NOT stored by this path.) Convex `createUser` also calls `ensureDefaultFavoritesList`.

### sponsorships (all PUBLIC - no login needed; guest sponsors)
Constants: `MAX_SPONSORSHIPS_PER_PAYMENT = 20`, `MAX_LOGO_DATA_URL_LENGTH = 3_000_000`; `logoDataUrlSchema` = string max 3,000,000 and regex `^data:image\/(?:png|jpeg|jpg|webp);base64,[a-zA-Z0-9+/=]+$` (message "Logo must be a PNG, JPEG, or WebP image").
`SPONSOR_OVERLAY_CONFIG` (hardcoded in router, sent to Remotion):
```
animation:{fadeInDuration:1,startTime:5}
image:{height:22,width:22,x:50,y:76}
text:{color:"#00805f",fontSize:3.8,x:50,y:87}
```
(Note: `@smog/types` `SPONSOR_OVERLAY_CONFIG` in presets.ts is an OLDER variant: image 15x15 y78, text fontSize 4 y85; used by legacy `services/sponsorship.ts`. `DEFAULT_OVERLAY_CONFIG` in types/sponsorships.ts = the 22/76/3.8/87 values.)

- `sponsorships.generatePreview` in `{gestureId:string min1, logoImage?: logoDataUrl, overlayText: trim min1 max100, sponsorName: trim min1 max40}`. Flow: `convex gestures.getById` (throws "Gesture not found"); POST `${REMOTION_URL}/api/compose` body `{overlayConfig, overlayImageUrl: logoImage||"", overlayText: input.overlayText, playbackId: gesture.playbackId}` header `Authorization: Bearer REMOTION_API_KEY`; then `pollCompositionJob` -> out `{playbackId}` (composed Mux playback id). NOTE: `sponsorName` input is validated but NOT used; `overlayText` is what is rendered (Remotion enforces overlayText <= 35 chars, so 100 max here can 400 upstream). Errors wrapped `Failed to generate preview: ...`.
- `pollCompositionJob(jobId)`: up to 120 attempts, 1 s sleep before each; GET `${REMOTION_URL}/api/compose/status/{jobId}`; non-ok -> retry; `state==="completed" && result.success` -> return `result.composedVideoPlaybackId` (error if missing); `state==="failed"` -> throw `Video composition failed: <error>`; else `Video composition timed out after 2 minutes`.
- `sponsorships.createBulkSponsorshipsSimplified` in:
  ```
  contactCompany?: trim max120; contactFullName: trim 1..120; durationYears: literal(1);
  gestureIds: string[] 1..20; includeLogo: boolean; invoiceEmail?: trim email max254;
  invoiceName?: trim max160; invoiceRequested?: boolean; invoiceVatNumber?: trim max32;
  logoImage?: logoDataUrl (accepted but NOT persisted); overlayText: trim 1..100;
  previewVideoPlaybackIds: string[] max20 (parallel to gestureIds);
  sponsorEmail: trim email max254; sponsorName: trim 1..40
  ```
  refine: gestureIds unique ("Each gesture can only be sponsored once per payment"); `gestureIds.length === previewVideoPlaybackIds.length` ("Each gesture requires exactly one preview video").
  -> `convex sponsorships.createBulkSimplified` (service auth). Out `{sponsorshipIds: Id[], success:true}`. Side-effect (fire and forget): resolve gesture names (`gestures.getById`, fallback id) + `users.listAdmins`; for every admin with email -> `triggerEmail({type:"admin_new_sponsorship", to:adminEmail, sponsorName, sponsorEmail, contactFullName, contactCompany, durationYears, gestureNames, invoiceRequested, invoiceName, invoiceVatNumber, invoiceEmail})`. Errors wrapped `Failed to create bulk sponsorships: ...`.
  Convex mutation logic (`createBulkSimplified`): validates 1..20 gestures, lengths equal, unique, non-empty preview ids, durationYears===1; per gesture: gesture exists, `checkExistingSponsorship` (conflict if an `active` one exists -> "already sponsored until <date>", or one in `pending_payment`/`pending_approval` -> "already has a pending sponsorship"); price per gesture = 5000 cents (+1000 if includeLogo); inserts `{status:"pending_payment", startDate:0, endDate: now + 365d*durationYears, originalVideoPlaybackId: gesture.playbackId, previewVideoPlaybackId, hasLogo:includeLogo, paymentAmount, ...contact/invoice fields, createdAt, updatedAt}`. If any error -> throws `Failed to create N sponsorship(s): ...` (note: successful earlier inserts in the same mutation roll back because Convex mutation throws).
- `sponsorships.createBulkPayment` in `{amount:int positive (cents), sponsorshipIds: string[] 1..20 unique}` -> see section 5 (Mollie). Out `{checkoutUrl, paymentId}`.
- `sponsorships.getSponsorshipsByPaymentId` in `{paymentId}` -> `convex sponsorships.getAllByPaymentId({molliePaymentId})` (no token, public) -> `[{durationYears,gestureName,paymentAmount,sponsorName,status}]`. Used by success page.
- `sponsorships.listGesturesWithSponsorship` no input -> `convex sponsorships.listGesturesWithSponsorship` (active gestures each with `sponsorship: {endDate, sponsorName (only when active), status}|null` for statuses pending|pending_payment|pending_approval|active).
- `sponsorships.getByReEditToken` in `{token}` -> `convex sponsorships.getByReEditToken` (no token; token is credential) -> `{sponsorship, expired,...}` or null.
- `sponsorships.reSubmitSponsorship` in `{gestureId:min1, logoImage?, overlayText trim 1..100, sponsorName? trim 1..40, token: uuid}`: getByReEditToken; null -> "Invalid re-edit token"; `expired` -> "Re-edit token has expired"; `composeVideo({playbackId: sponsorship.originalVideoPlaybackId, logoImage, overlayText})` (POST Remotion + poll); then `convex sponsorships.reSubmitSponsorshipVideo({overlayText, previewVideoPlaybackId=composed, sponsoredVideoPlaybackId=composed, sponsorName, token})` (requires status `pending_resubmission`; clears token; status -> `pending_approval`). Out `{playbackId, success:true}`. (`gestureId` input unused.)

### admin (all `adminProcedure`); every mutating call writes `adminLogs.logAction(userId, action, targetType, targetId, metadata?)` (fields: action,createdAt,metadata any,targetId,targetType,userId)
admin.categories:
- `create` `{name:string, isActive?:bool}` -> `categories.create`; log `create_category` (target category); cache invalidate; out `{categoryId}`.
- `update` `{categoryId, isActive?, name?}` -> `categories.update`; log `update_category`; invalidate; `{success:true}`.
- `delete` `{categoryId}` -> `categories.deleteCategory`; log `delete_category`; invalidate; `{success:true}`.
- `listAll` -> `categories.listAllForAdmin`.
admin.gestures:
- `create` `{categoryIds:string[], concept:string[], info:string, isActive?:bool, name:string, playbackId:string}` -> `gestures.create`; log `create_gesture`; `{gestureId}`.
- `update` `{gestureId, categoryIds?, concept?, info?, isActive?, name?, playbackId?}` -> `gestures.updateGesture`; log `update_gesture`; `{success:true}`.
- `toggleActive` `{gestureId}` -> `gestures.toggleActive` (returns new bool); log `toggle_gesture_active`; `{isActive, success:true}`.
- `bulkUpdate` `{gestureIds:string[], updates:{categoryIds?:string[], isActive?:bool}}` -> `gestures.bulkUpdate` (returns `{updated:n}`); log `bulk_update_gestures` (targetId = ids joined ",").
- `listAll` `{includeInactive?, limit?}` optional default {} -> `gestures.listAllForAdmin({limit})`.
admin.logs: `getRecent {limit?}` -> `adminLogs.getRecent`; `getByAction {action, limit?}` -> `adminLogs.getByAction`; `getByTarget {targetId, targetType}` -> `adminLogs.getByTarget`.
admin.mux (see `packages/api/src/lib/mux.ts`; requires MUX_TOKEN_ID/SECRET at import or throws):
- `createDirectUpload` -> Mux `video.uploads.create({cors_origin:"*", new_asset_settings:{master_access:"temporary", playback_policy:["public"], test: NODE_ENV==="development"}})` -> `{uploadId, uploadUrl}`.
- `getUploadStatus {uploadId}` -> `{id,status: waiting|asset_created|errored|cancelled|timed_out, assetId?, playbackId? (public policy id), error?}`.
- `getAssetStatus {assetId}` -> `{id, playbackId (first playback id), status: preparing|ready|errored}`.
- `listAssets {limit? (default 20), page? (default 1)}` -> Mux assets.list(limit+1,page); `{assets:[{id,playbackId(public),status,duration,aspectRatio,createdAt}] (only with a public playback id), hasMore}`.
admin.sponsorships:
- `listAll {limit?, status?: string}` -> `sponsorships.listAll(limit,status)`.
- `listPendingApproval` -> `sponsorships.listPendingApproval`.
- `getById {id}` -> `sponsorships.getById`.
- `getActiveByGesture {gestureId}` -> `sponsorships.getActiveByGestureForService`.
- `approve {sponsorshipId}`: fetch sponsorship; `sponsorships.approve({adminUserId, sponsorshipId})` (requires status `pending_approval` and `sponsoredVideoPlaybackId`; sets startDate=now, endDate = now + durationYears*365d, status `active`, reviewedAt/By, and patches gesture.playbackId = sponsoredVideoPlaybackId); log `approve_sponsorship`; fire-and-forget email `sponsorship_live` `{to: sponsorEmail, sponsorName: contactFullName||sponsorName, gestureName, startDate: Date.now(), endDate: sponsorship.endDate (OLD value read BEFORE approve -> stale bug! actual new endDate differs)}`.
- `reject {sponsorshipId, reason}` -> `sponsorships.reject` (no state check; sets rejectionReason, status `rejected`); log `reject_sponsorship`. No email sent.
- `markPaidManually {sponsorshipId}` -> `sponsorships.markAsAwaitingApproval` (pending_payment -> pending_approval; silent no-op otherwise); log `mark_paid_manually`. (Does not set sponsoredVideoPlaybackId; approve requires it - normally set from preview at payment time; manual marking of a pending_payment sponsorship without it would fail on approve.)
- `cancelPendingPayment` -> `sponsorships.cancelPendingPayment` (only pending_payment -> cancelled); log `cancel_pending_payment`.
- `forceExpire {sponsorshipId}` -> `sponsorships.forceExpire` (active only; restores gesture.playbackId = originalVideoPlaybackId; status expired); log `force_expire_sponsorship`. Does NOT delete Mux asset.
- `restoreOriginalVideo {gestureId}` -> getActiveByGestureForService, error "No active sponsorship found for this gesture", then `forceExpire`; log `restore_original_video` (targetType gesture).
- `generateReEditLink {sponsorshipId}`: token=`crypto.randomUUID()`, expiresAt = now + 7d (`7*24*60*60*1000`); `sponsorships.setReEditToken` (allowed statuses: pending_approval, pending_resubmission, rejected; sets status `pending_resubmission`); log `generate_re_edit_link`; out `{expiresAt, url: `${CORS_ORIGIN||"http://localhost:3001"}/sponsors/re-edit?token=<token>`}`.
- `getReEditLink {sponsorshipId}` -> `sponsorships.getReEditLinkForAdmin`; null or `{expired, expiresAt, url}` (same URL pattern).
- `exportToCsv {status: enum all|active|expired|pending|pending_payment|pending_approval|pending_resubmission|rejected|cancelled default all, from?: ms, to?: ms}` -> `sponsorships.listAll({limit:10000,status})`, filter by createdAt in [from,to]; out `{csv}` via `buildCsvString` (every field wrapped in double quotes, `"` doubled, `\n` joins, "" when empty rows). Columns in order: ID, Status, Sponsor name, Sponsor email, Contact name, Company, Invoice name, VAT number, Invoice email, Invoice requested (Yes/No), Has logo (Yes/No), `Payment amount (€)` (cents/100 toFixed(2)), Mollie payment ID, Start date (ISO), End date (ISO), Duration (years), Gesture ID, Created at (ISO).
admin.users: `list {cursor?, limit?}` -> `users.listAllUsers` (limit clamp 1..500, default 50; returns `{users,hasMore,nextCursor}`; cursor is currently ignored by Convex impl); `listAdmins` -> `users.listAdmins`; `updateRole {userId, role:"user"|"admin"}` -> `users.updateUserRole` (NOT logged). `verifyAdmin` -> returns user doc.

### Convex sponsorship status machine (string field)
`pending_payment` -> (Mollie paid) `pending_approval` -> (admin approve) `active` -> (cron/forceExpire) `expired`. Also `rejected`, `cancelled` (stale/admin cancel of pending_payment), `pending_resubmission` (admin re-edit link; resubmit -> pending_approval), legacy `pending`. Index: by_gesture, by_status, by_gesture_and_status, by_end_date, by_payment_id, by_re_edit_token. Extra fields: renewalReminderSentAt, reviewedAt/By, rejectionReason, reEditToken/ExpiresAt, overlayImageStorageId (legacy, holds base64), hasLogo, invoice*.

---------------------------------------------------------------------------
## 2. Server HTTP routes (`apps/server/src/index.ts`, Hono, port `PORT`/3000)

Global middleware order: bodyLimit 5 MiB (413 `{error:"Request body too large"}`), hono logger, CORS (`origin: CORS_ORIGIN||""`, methods GET/POST/OPTIONS, headers Content-Type+Authorization, credentials true).
Rate limits (Redis, see below): `/auth/*` 30 per 900 s (ns "auth") + `Cache-Control: no-store`, `Pragma: no-cache`; `/analytics/track` 120 per 60 s (ns "analytics"); `/rpc/*`: if path includes any of `generatePreview|createBulkSponsorshipsSimplified|createBulkPayment|reSubmitSponsorship` -> 20 per 3600 s (ns "sponsorship") else 300 per 60 s (ns "rpc"). NOT rate limited: /webhooks/mollie, /api/*.
Startup: `requireProductionEnv([...])` throws in production if any missing (list in section 8); `INTERNAL_API_KEY` and `REMOTION_API_KEY` ALWAYS required (throws at boot). Starts 3 crons + email worker.

Routes:
1. `POST /auth/workos/callback` body `{code: string 1..4096, codeVerifier?: string 43..128}`. Exchanges code at `https://api.workos.com/user_management/authenticate` (grant_type authorization_code, client_id, client_secret, code, [code_verifier]). "Native" = codeVerifier present. Web: sets httpOnly cookie `smog_refresh_token` (maxAge 30 d = 2592000, path "/", SameSite=Lax, secure in production). Response JSON `{accessToken, success:true, user, refreshToken (native only)}`. New user detection (fire-and-forget): `convex users.getUserByWorkOSId(serviceToken, workosId)`; if none -> `enqueueEmail({type:"welcome", to:user.email, name:user.firstName})` (no jobId dedupe). Errors -> 400 (validation), 500 (WorkOS creds missing), 401 `{error:"Authentication failed"}`.
2. `POST /auth/token/refresh`: refresh token from cookie (web) else body `{refreshToken (<=8192)}` (native). None -> 401 "No refresh token found". Calls WorkOS authenticate with grant_type refresh_token (+client_secret if set). Web: rotates cookie; native: returns `refreshToken` in body. Out `{accessToken, refreshToken?, user}`. On failure deletes cookie, 401 "Token refresh failed".
3. `POST /auth/token/clear` -> deletes cookie; `{success:true}`.
4. `POST /analytics/track` (OpenPanel relay). Body `{type:"track"|"identify", payload:{...}}`. `track` requires `payload.name` in allowlist {gesture_collection_changed, gesture_viewed, screen_view, search_performed, video_playback_completed} (else 400 "Unknown analytics event"); `identify` requires `payload.profileId` (string 1..512). Forwards `POST ${OPENPANEL_API_URL}/track` with headers openpanel-client-id / openpanel-client-secret / openpanel-sdk-name `smog-server-relay` / openpanel-sdk-version `2.0.0`, x-client-ip (cf-connecting-ip > true-client-ip > x-forwarded-for[0] > x-real-ip), user-agent. Returns 202 `{success:true}`; any internal error still returns 202. If creds missing just warns.
5. `POST /api/video/master-access` (service->service): requires `Authorization: Bearer ${REMOTION_API_KEY}` (plain string compare, not constant-time) else 401. Body `{playbackId}` (400 if missing). Uses Mux: paginates `assets.list({limit:100,page 1..10})` to find asset whose playback_ids include the id (error "Asset not found for playback ID"); ensures `master_access: "temporary"` (`assets.updateMasterAccess`); polls `assets.retrieve` up to 30 x 2 s until `master.status==="ready"` (returns `master.url`; "errored" -> throws; timeout throws). Response `{url, expiresAt: now+24h ISO}`. Errors 500 `Failed to get master access URL: ...`.
6. `POST /webhooks/mollie` -> `handleMollieWebhook` (section 2b).
7. `POST /api/email/trigger`: `Authorization: Bearer ${INTERNAL_API_KEY}` (401 otherwise); body must have `type` and `to` (400 "Invalid email job payload"); `enqueueEmail(job)` (no dedupe id); `{success:true}`. Called by `packages/api/src/lib/emailTrigger.ts` (HTTP loopback to `SERVER_URL||http://localhost:3000`, errors swallowed) and documented as callable from Convex actions.
8. `GET /api/email/preview/:template` admin only (Bearer WorkOS token -> Convex role admin, else 403 `{error:"Admin access required"}`). Templates: welcome, sponsorship_submitted, payment_confirmed, sponsorship_live, renewal_reminder (NOT admin_new_sponsorship; unknown -> 400 listing valid). Sample data: name "Jan Janssen"; gesture "Hond"; sponsor "Acme BV"; payment 5000; live endDate = now+365d; renewal endDate = now+30d. Returns HTML.
9. `/rpc/*` (oRPC RPC protocol) and `/api-reference/*` (OpenAPI + reference UI) via catch-all middleware `app.use("/*")`.
10. `GET /` and `GET /health` -> "OK". (Docker healthcheck curls /health.)
Note: `/api/...` in Caddy is proxied to server; OpenAPI is under `/api-reference` (not routed by Caddy).

### 2b. Mollie webhook (`apps/server/src/webhooks/mollie.ts`) - exact logic
- No signature verification (Mollie doesn't sign). Security = re-fetch payment from Mollie API by id (`mollieClient.payments.get(id)`) - trusted source of truth.
- Body parse: `JSON.parse(rawBody)`; else `URLSearchParams(rawBody).get("id")` (Mollie sends form `id=tr_xxx`). Missing id -> 400 `{error:"Payment ID required"}`.
- If `payment.status !== "paid"` -> 200 `{status:"skipped"}` (so failed/expired/canceled payments do nothing; sponsorships remain pending_payment until the hourly stale cleanup cancels them).
- Reads `payment.metadata`: `isBulkPayment === "true"` and `sponsorshipIds` (JSON string). Bulk branch: parse JSON; must be array, 1..20 entries, all non-empty strings, unique (else 400 "Invalid sponsorship metadata"/"Duplicate sponsorship metadata"); fetch each sponsorship via Convex `sponsorships.getById`; any missing -> 400 "Sponsorship not found"; amount check: `payment.amount.currency === "EUR"` and `Math.round(Number(value)*100) === sum(paymentAmount)` else 400 "Payment amount mismatch". Then for each id (Promise.all) `processSuccessfulPayment({molliePaymentId, sponsorshipId})` then `enqueuePaymentEmails(id)`. Returns 200 `{count, status:"success"}`.
- Legacy single branch: `metadata.sponsorshipId` (no amount check) -> `processSuccessfulPayment` then fire-and-forget emails; 200 `{status:"success"}`; missing -> 400 "Sponsorship ID missing in metadata".
- Any exception -> 500 `{error:"Unable to process payment webhook"}` (Mollie will retry).
- `processSuccessfulPayment` (`services/sponsorship.ts`): getById; missing -> throw; `sponsorship.molliePaymentId !== molliePaymentId` -> throw "Payment does not belong to sponsorship"; **Idempotency**: status `pending_approval` or `active` -> return (no-op success); any status other than `pending_payment` -> throw "Invalid sponsorship status"; if no `sponsoredVideoPlaybackId`: if `previewVideoPlaybackId` -> `sponsorships.updateVideoPlaybackId({sponsoredVideoPlaybackId: previewVideoPlaybackId})` (simplified flow: no re-render), else LEGACY: `triggerVideoComposition` (POST Remotion `/api/compose` with `getSponsorOverlayConfig()` = types preset, overlayImageUrl = `overlayImageStorageId` (base64) if hasLogo, overlayText, playbackId=originalVideoPlaybackId; poll `/api/compose/status/{id}` every 5 s up to 60 attempts = 5 min). Then `sponsorships.markAsAwaitingApproval` (pending_payment -> pending_approval). Payment => admin approval always required; nothing goes live automatically.
- Emails: `enqueuePaymentEmails(id)`: reads sponsorship + gesture name (fallback "your gesture" - English string leaks into Dutch mail), `to = sponsorEmail`, `sponsorName = contactFullName || sponsorName`; enqueues `sponsorship_submitted` (jobId `sponsorship_submitted:<sponsorshipId>`) and `payment_confirmed` (jobId `payment_confirmed:<sponsorshipId>`, `paymentAmount` cents) -> dedupe via BullMQ deterministic jobId (only while job retained: removeOnComplete keeps last 100).
- Note race/gap: bulk branch does not verify each sponsorship belongs to the payment before amount check, but `processSuccessfulPayment` does (molliePaymentId equality).

### Remotion service HTTP (`apps/remotion/src/server/index.ts`, port `PORT||3002`) - section 6.

---------------------------------------------------------------------------
## 3. Background jobs

All in `apps/server/src/cron.ts` using `node-cron` (server process local timezone = container TZ, default UTC; no timezone option), started at boot. Three jobs + BullMQ worker. No distributed lock -> running >1 server replica duplicates jobs (reminders dedupe via renewalReminderSentAt + jobId).

1. Expiration - cron `"0 0 * * *"` (daily 00:00). `sponsorships.getExpired` (status `active` AND `endDate < now`). For each sequentially: `sponsorships.expire` (patch gesture.playbackId = originalVideoPlaybackId; status `expired`), then `deleteVideoFromMux(sponsoredVideoPlaybackId)` (finds asset via paginated list, deletes; failures logged & swallowed). Per-item try/catch.
2. Renewal reminder - cron `"0 8 * * *"` (daily 08:00). `sponsorships.getExpiringSoon({daysUntilExpiry: 30})` = status active AND `endDate > now` AND `endDate <= now + 30 d` AND `renewalReminderSentAt === undefined`. For each: gesture name (fallback "your gesture"), `enqueueEmail({type:"renewal_reminder", to: sponsorEmail, sponsorName: contactFullName||sponsorName, gestureName, endDate}, jobId "renewal_reminder:<sponsorshipId>")`, then `sponsorships.markRenewalReminderSent` (renewalReminderSentAt=now). Only ONE reminder, sent when <=30 days remain (email footer text wrongly says "over ongeveer 7 dagen").
3. Stale pending-payment cleanup - cron `"0 * * * *"` (hourly at :00). `sponsorships.getStalePendingPayments`: status `pending_payment` AND `updatedAt < now - 24*60*60*1000` (24 h; note updatedAt, which updatePaymentId also bumps). Each -> `sponsorships.cancelPendingPayment` (status `cancelled`). No Mollie payment cancel, no email.
4. Email worker (BullMQ) - see section 4.
Convex-side crons (`packages/convex/convex/cron.ts`): monthly `cleanup-inactive-guests` day 1 02:00 UTC (delete users with `guestId` set and `lastActiveAt` < now-365d, incl. favorites, consents, lists and list items); monthly `cleanup-old-admin-logs` day 1 03:00 UTC (delete adminLogs createdAt < now - 3*365d). (comment claims "1st of January", code is monthly).
Remotion service: in-memory job store cleanup `setInterval` every 10 min removing completed/failed jobs older than 1 h (`JOB_RETENTION_MS`).

Rate limiter (`services/rateLimit.ts`): ioredis (`REDIS_URL||redis://localhost:6379/1`, lazyConnect, maxRetriesPerRequest 1), key `rate-limit:<namespace>:<clientIp>`; `INCR`, `EXPIRE windowSeconds` when count===1, `TTL`; headers `RateLimit-Limit/Remaining/Reset`; over limit -> 429 `{error:"Too many requests"}` + `Retry-After`. Client IP order: cf-connecting-ip, true-client-ip, x-forwarded-for[0], x-real-ip, "unknown". OPTIONS skipped. Fail-open if Redis is down (warn once).

---------------------------------------------------------------------------
## 4. Emails

Infra: `services/emailQueue.ts` BullMQ `Queue("email")` + `Worker` sharing one ioredis connection (`REDIS_URL||redis://localhost:6379/1`, `maxRetriesPerRequest:null`). `enqueueEmail(job, jobId?)`: `queue.add(job.type, job, {attempts:3, backoff:{type:"exponential",delay:5000}, jobId, removeOnComplete:{count:100}, removeOnFail:{count:50}})`. Worker default concurrency (1). Job types: welcome | sponsorship_submitted | payment_confirmed | sponsorship_live | renewal_reminder | admin_new_sponsorship.
Sending (`services/email.ts`): nodemailer; if SMTP_HOST/USER/PASS not all set -> `jsonTransport` (log only). Else `createTransport({host, port: SMTP_PORT||587, secure: port===465, auth})`. `from = SMTP_FROM || "Smog <no-reply@smog.app>"`, `replyTo = SMTP_REPLY_TO || "info@smog.vlaanderen"`, html only (no text part). After successful send (only if real SMTP configured), fire-and-forget: build raw RFC822 via `nodemailer/lib/mail-composer`, open `ImapFlow` (host `IMAP_HOST||SMTP_HOST`, port `IMAP_PORT||993`, user/pass `IMAP_USER||SMTP_USER`, `IMAP_PASS||SMTP_PASS`, secure iff port 993, `tls.rejectUnauthorized = IMAP_TLS_REJECT_UNAUTHORIZED !== "false"`), open folder `IMAP_SENT_FOLDER||"Sent"` (create if missing), `append(..., ["\\Seen"], new Date())`, logout; all failures only warn.
Rendering: `@react-email/render` React Email components (`apps/server/src/emails/*.tsx`), `EmailLayout` (html lang="nl"; header green (#00805F) with `${CORS_ORIGIN||"https://app.smog.vlaanderen"}/assets/logo.svg` height 40; footer bar "© <year> SMOG & CO vzw · België" + "SMOG — Spreken Met Ondersteuning van Gebaren"). Brand tokens: primary #00805F, primaryDark #006B4F, secondary #97C699, secondaryLight #ebf4eb (page bg), accent #EE971C, text #333333, textLight #666666, textMuted #8898aa, border #dddddd; system font stack. All web links use `webUrl = CORS_ORIGIN ?? "https://app.smog.vlaanderen"`. Dates `toLocaleDateString("nl-BE",{day:"numeric",month:"long",year:"numeric"})`; money `Intl.NumberFormat("nl-BE",{style:"currency",currency:"EUR"})`. Language: Dutch only (no i18n, no per-user language).

| type | trigger | recipient | subject | content |
|---|---|---|---|---|
| welcome | WorkOS callback when Convex has no user for that workosId (first login; note the Convex user is created later by client via getOrCreateUser so a race can send multiple) | WorkOS user email | `Welkom bij SMOG!` | Preview "Welkom bij SMOG — ontdek en sponsor gebaren uit de gebarentaal"; h1 "Welkom bij SMOG"; greeting `Hallo {name}` or `Welkom`; thanks for registering at SMOG & CO, explore gestures, save favourites, support community by sponsoring at `{webUrl}/sponsor`; button "Ontdek gebaren" -> webUrl; footer "Heb je dit account niet aangemaakt? Dan kun je deze e-mail gerust negeren." |
| sponsorship_submitted | Mollie webhook paid (per sponsorship, jobId `sponsorship_submitted:<id>`) | sponsorEmail | `We hebben je sponsoring ontvangen` | h1 "Sponsoring ontvangen"; `Hallo {sponsorName}`; thanks for sponsoring gesture {gesture}; keeps app free; box "Wat gebeurt er nu?" 3 steps (1 review video, 2 after approval goes live with your branding, 3 confirmation email when live); contact mailto info@smog.vlaanderen; footer "Je ontvangt deze e-mail omdat je onlangs een sponsoring hebt ingediend via SMOG & CO." |
| payment_confirmed | Mollie webhook paid (jobId `payment_confirmed:<id>`) | sponsorEmail | `Betaling bevestigd — bedankt!` | h1 "Betaling bevestigd"; receipt box rows "Gebaar" / "Betaald bedrag" (formatted EUR); "normaal binnen 1 à 2 werkdagen" live; footer "Bewaar deze e-mail als betaalbewijs. Heb je een factuur nodig? Neem dan contact met ons op." (one email per gesture; per-gesture amount, not total) |
| sponsorship_live | admin `approve` (no jobId; fire-and-forget through /api/email/trigger) | sponsorEmail | `Je sponsoring is nu live!` | h1 "Je sponsoring is live!"; receipt rows Gebaar / Actief vanaf (startDate) / Actief tot (endDate); button "Bekijk op SMOG" -> webUrl; thanks paragraph; footer about reminder before expiry |
| renewal_reminder | cron 08:00 daily, <=30 d before endDate, once (jobId `renewal_reminder:<id>`) | sponsorEmail | `Je SMOG-sponsoring verloopt binnenkort` | h1 "Je sponsoring verloopt binnenkort"; expires on {date}; after that gesture returns to original video; button "Verlengen kan via deze link" -> webUrl (just homepage, no real renewal flow); footer "…over ongeveer 7 dagen afloopt…" (inconsistent with 30 d) |
| admin_new_sponsorship | `createBulkSponsorshipsSimplified` (one mail per admin having email, sent at creation BEFORE payment; no jobId) | every `users.listAdmins` with email | `Nieuwe sponsoring van {sponsorName}` | h1 "Nieuwe sponsoring ontvangen"; box "Sponsoring details": Sponsor, E-mail, Gebaar/Gebaren list; box "Facturatie": Contactpersoon (+ (company)), Looptijd `{durationYears??1} jaar`, Factuur gevraagd Ja/Nee, and if requested: Factuurnaam, BTW-nummer, Factuur e-mail (`invoiceEmail ?? sponsorEmail`); button "Bekijk in het admin panel" -> `{webUrl}/admin`; footer "…beheerdersrol hebt bij SMOG & CO." |
No email for: rejection, re-edit link generation (admin copies link manually), payment failure, expiry, cancellation. Admin user emails are only known if Convex `users.email` is set (getOrCreateUser does not set it -> admin email must be populated elsewhere, e.g. client sync/`createUser({email})`).

---------------------------------------------------------------------------
## 5. Payment flow (Mollie) and pricing

Pricing (cents): `PRICE_PER_YEAR_CENTS = 5000` (EUR 50.00), `LOGO_ADDON_CENTS = 1000` (EUR 10.00 add-on when includeLogo), `FIXED_DURATION_YEARS = 1`, `MAX_GESTURES_PER_SPONSORSHIP = 10` (config const; UI) though API allows 20 (`MAX_SPONSORSHIPS_PER_PAYMENT`). Per gesture price = 5000 or 6000; total = sum. Prices duplicated in Convex `createBulkSimplified` (server-authoritative, `paymentAmount` per sponsorship stored). No VAT line, no discounts, no renewals (renewal = user creates a new sponsorship after the old one expired; reminder link is just the homepage). Sponsorship length = 365 d * years (endDate recalculated at approval: now + 365d).
Flow:
1. Wizard: `generatePreview` per gesture (Remotion render, logo baked in) -> preview playback ids.
2. `createBulkSponsorshipsSimplified` -> sponsorships `pending_payment` (locks gesture: conflict check prevents a second pending/active sponsor).
3. `createBulkPayment({amount, sponsorshipIds})`: loads each sponsorship (service auth); every one must exist, be `pending_payment` and have no `molliePaymentId` else Error "Some sponsorships are unavailable or already have a payment"; `input.amount` must equal sum of stored `paymentAmount` ("Payment amount does not match sponsorship pricing"). `baseUrl = CORS_ORIGIN || "http://localhost:3001"`; `isLocalDev = baseUrl.includes("localhost")`. `mollieClient.payments.create({ amount:{currency:"EUR", value:(total/100).toFixed(2)}, description:`Sponsorship for ${n} gesture(s)`, redirectUrl:`${baseUrl}/sponsors/success?paymentId={id}`, webhookUrl:`${baseUrl}/webhooks/mollie` (omitted when localhost), metadata:{isBulkPayment:"true", sponsorshipIds: JSON.stringify(ids)} })`. No `method`, `locale`, `sequenceType`, expiry. Requires `_links.checkout.href` else error. Then `sponsorships.updatePaymentId({sponsorshipId, molliePaymentId})` for all (Promise.all; updatePaymentId also bumps updatedAt). Out `{checkoutUrl, paymentId}`. Mollie client: `createMollieClient({apiKey: MOLLIE_API_KEY||""})` (`@mollie/api-client`), `packages/auth/src/lib/payments.ts`.
4. Redirect to `/sponsors/success?paymentId=tr_...`; page polls `getSponsorshipsByPaymentId` for statuses.
5. Webhook (section 2b) moves to `pending_approval`; admin approves -> active + gesture video swapped. Failed/cancelled payment: nothing happens; stale sponsorships auto-cancelled after 24 h by cron (a payment can only be created once per sponsorship because molliePaymentId check; so user must restart wizard).
Invoices: no automatic invoice; `invoiceRequested/Name/VatNumber/Email` stored and mailed to admin, admin invoices manually.

---------------------------------------------------------------------------
## 6. Remotion (apps/remotion)

Container: separate service `remotion` (image `smog-remotion`, port 3002, expose only), Node 22 bookworm-slim + bun + Chrome Headless Shell via `bunx remotion browser ensure`, libs (libnss3, libdbus-1-3, libatk1.0-0, libgbm-dev, libasound2, libxrandr2, libxkbcommon-dev, libxfixes3, libxcomposite1, libxdamage1, libatk-bridge2.0-0, libpango-1.0-0, libcairo2, libcups2, curl), non-root user nodejs uid 1001, temp dir `/app/apps/remotion/temp`, HEALTHCHECK `curl -f http://localhost:3002/health` (interval 30s, timeout 10s, start-period 60s, retries 3), CMD `bun run src/server/index.ts`. Remotion version ^4.0.484; deps: @remotion/bundler, cli, media, renderer, zod-types, mediabunny, @mux/mux-node, hono. `remotion.config.ts`: `setVideoImageFormat("jpeg")`, `setOverwriteOutput(true)`.

Composition (single): id `SponsoredVideo` (`Root.tsx`), component `SponsoredVideo`, `fps=30` (VIDEO_FPS), default 1080x1920 (9:16; VIDEO_WIDTH/HEIGHT) but `calculateMetadata` overrides width/height with the source video's displayed dimensions (mediabunny `UrlSource`, `computeDuration`, `getPrimaryVideoTrack().displayWidth/Height`) and `durationInFrames = ceil(durationSeconds*30)`; defaultProps durationInFrames 300 placeholder. Sample Studio video: `https://stream.mux.com/VZtzUzGRv02OhRnZCxcNg49OilvolTqdnFLEqBsTwaxU/high.mp4`.
Input props (`SponsoredVideoSchema`, zod):
- `videoSrc: string().url()` (source video URL - Mux master mp4 download URL)
- `sponsorName: string().max(35)` (text shown; receives `overlayText`)
- `logoUrl?: string` (URL or data: URL of logo)
- `overlayConfig?: { animation:{fadeInDuration:number>=0 (s), startTime:number>=0 (s from END of video)}, image:{x,y,width,height : 0..100 (%)}, text:{color: zColor, fontSize: 1..20 (% of video height), x,y: 0..100 (%)} }` defaults to `DEFAULT_OVERLAY_CONFIG` = `{animation:{fadeInDuration:1,startTime:5}, image:{height:22,width:22,x:50,y:76}, text:{color:"#00805f",fontSize:3.8,x:50,y:87}}`.
Rendering visuals: `<AbsoluteFill black>` -> `<Video src=videoSrc objectFit:cover 100%/>` (@remotion/media) + `SponsorOverlay`. Overlay appears at frame `durationInFrames - startTime*fps` (last 5 s), opacity from `spring({damping:200, durationInFrames: fadeInDuration*fps})`, plus slide-up `translateY` 30px -> 0. Logo `<Img objectFit:contain>` centered at (x%,y%) size width%/height% of the video; logo absent -> not rendered. Text two lines, color config.text.color, `system-ui, sans-serif`, weight 600, fontSize = fontSize% * height, `whiteSpace:nowrap`, centered horizontally (left 50%; x is ignored for text): line 1 literal `"Met de warme steun van:"`, line 2 = sponsorName at `top = textY + lineHeight + fontSize*0.3` (`lineHeight = fontSize*1.2`). Container padding-bottom `height - textY - fontSize`.
HTTP API (Hono, all `/api/compose*` and `/api/queue/status` need `Authorization: Bearer REMOTION_API_KEY`; missing key at boot throws; CORS origin `CORS_ORIGIN||"*"`):
- `GET /` "Remotion Video Composer - Ready"; `GET /health` -> `{renderer:"remotion",service:"remotion",status:"healthy",timestamp}`.
- `POST /api/compose` body `{playbackId, overlayImageUrl?, overlayText, overlayConfig?}`; 400 if playbackId/overlayText missing or `overlayText.length > 35` ("Sponsor name must be 35 characters or less"); creates in-memory job (uuid) and starts `processComposition` in background without awaiting; returns `{jobId, message:"Video composition job started", success:true}`. No queue/concurrency limit - unlimited parallel renders; jobs lost on restart (in-memory Map; "replaces BullMQ/Redis").
- `GET /api/compose/status/:jobId` -> `{jobId, progress, result, state}` state waiting|active|completed|failed; 404 if unknown. `result = {success:true, composedVideoPlaybackId}` or `{success:false, error}`.
- `GET /api/queue/status` -> `{active, completed, failed, waiting}`.
Pipeline (`compose.ts`) with progress: active/5 -> get source URL (10) via `POST ${SERVER_URL||http://localhost:3000}/api/video/master-access` `{playbackId}` (Bearer REMOTION_API_KEY) -> temp master mp4 URL -> bundle (15; Remotion `bundle()` of `src/index.ts`, cached in memory, pre-bundled at startup) -> `selectComposition("SponsoredVideo", inputProps)` (20; inputProps `{logoUrl: overlayImageUrl||undefined, overlayConfig, sponsorName: overlayText, videoSrc}`) -> (30) `renderMedia({codec:"h264", composition, inputProps, serveUrl, outputLocation: <cwd>/temp/<jobId>.mp4})` progress mapped 30..80 -> upload to Mux (80-100) -> unlink temp -> `completeJob(success, composedVideoPlaybackId)`. Failure -> `completeJob({success:false,error})`. 
Mux upload (`remotion/src/server/mux.ts`): `video.uploads.create({cors_origin:"*", new_asset_settings:{master_access:"temporary", playback_policy:["public"], test: NODE_ENV==="development"}})`; PUT whole file (read into memory) to upload URL with `Content-Type: video/mp4`; poll upload every 2 s up to 150 attempts (5 min) for `asset_id`; poll asset every 2 s up to 150 attempts until `status==="ready"` (errored -> throw) and take `playback_ids[0].id`. Remotion uses `MUX_TOKEN_ID/SECRET` directly. Output goes ONLY to Mux (public playback id); no other storage. New Mux assets are created per preview (orphan assets never cleaned except sponsored one on expiry). Callers (API/server) poll for completion (API: 1 s x 120; legacy server: 5 s x 60).
Key gap: `master-access` needs the original asset to exist in Mux and `master_access` toggled on; Mux temp master URL valid ~24 h.

---------------------------------------------------------------------------
## 7. Auth

Provider: WorkOS User Management (AuthKit). Config `packages/auth/src/config.ts`: endpoints `authenticate = https://api.workos.com/user_management/authenticate`, `authorize = https://api.workos.com/user_management/authorize`, JWKS `https://api.workos.com/sso/jwks/{clientId}`, issuers `https://api.workos.com/user_management/{clientId}` and `https://api.workos.com/` (SSO). `buildAuthorizationUrl({clientId, redirectUri, state?})` -> `authorize?client_id&provider=authkit&redirect_uri&response_type=code[&state]`. Env lookup order clientId: `WORKOS_CLIENT_ID | VITE_WORKOS_CLIENT_ID | EXPO_PUBLIC_WORKOS_CLIENT_ID`; redirectUri: `WORKOS_REDIRECT_URI | VITE_WORKOS_REDIRECT_URI | EXPO_PUBLIC_WORKOS_REDIRECT_URI`; secret `WORKOS_CLIENT_SECRET` (server only).
Flow: client redirects to AuthKit -> callback route on client gets `code` -> POST server `/auth/workos/callback` (native adds PKCE `codeVerifier` 43..128 chars) -> server exchanges (`exchangeCodeForTokens`) -> returns `accessToken` (JWT) + user `{id,email,emailVerified,firstName,lastName,profilePictureUrl,createdAt,updatedAt}`; refresh token: web = httpOnly cookie `smog_refresh_token` (30 d, Lax, secure in prod); native = returned in body & kept in secure store. Refresh via `/auth/token/refresh`. Client-side token helpers (`tokens.ts`): `parseJWT` (no verification), `getTokenExpiry` (default now+5 min if unparsable), `isTokenExpired(token, bufferMs=60_000)`, `getTokenSubject`, `generateGuestId` -> `guest_<crypto.randomUUID()>` (fallback `guest_<base36 ts>_<random>`).
API auth (`packages/api/src/context.ts`): `Authorization: Bearer <token>`; `jwtVerify` with `jose` `createRemoteJWKSet(jwks(clientId))` cached per clientId, issuer in [user_management issuer, SSO issuer], no audience check; `sub` -> `context.workosId`; invalid/missing -> `workosId=null` (protected procs throw UNAUTHORIZED). Convex validates same JWTs (`auth.config.ts`: two customJwt providers RS256, second with `applicationID=clientId`).
Admin detection: Convex `users.role` (optional `"user"|"admin"`, index `by_role`); `adminProcedure` looks up user by workosId and requires `role==="admin"` (also `/api/email/preview`). Role is changed only via `admin.users.updateRole` (or directly in Convex dashboard); no email allowlist / env-based admin.
Guests: native app only (`AuthContext.continueAsGuest`); guest identity is a locally generated `guest_<uuid>` stored in device; Convex `users.createUser({guestId})` (guestId length >= 32; exactly one of workosId/guestId), `getUserByGuestId`, `migrateGuestToUser({guestId, workosId, email?})` (requires Convex identity subject == workosId; patches guest row with workosId, email; else inserts). Guest users have NO server API access (all oRPC protected procs need WorkOS JWT); guest data (favorites etc.) is handled client-side/Convex direct. Sponsorship purchase flow is anonymous (public procedures, no account). `users.createUser` with workosId can be called either with matching Convex identity or with serviceToken. `getUserByWorkOSId` returns null unless serviceToken valid or identity matches.
Convex `users` fields: workosId?, guestId?, email?, role?, createdAt, lastActiveAt (indexes by_workos_id, by_guest_id, by_role). Convex service auth: `INTERNAL_API_KEY` must also be set in the Convex deployment env (plus `WORKOS_CLIENT_ID`).

---------------------------------------------------------------------------
## 8. Env vars, integrations, infra, maintenance mode

### Env vars (root `.env`, shared by server via `env_file`)
Required in production for server (throws at boot, `requireProductionEnv`): CONVEX_URL, WORKOS_CLIENT_ID, WORKOS_CLIENT_SECRET, MOLLIE_API_KEY, CORS_ORIGIN, MUX_TOKEN_ID, MUX_TOKEN_SECRET, REMOTION_URL, REMOTION_API_KEY, INTERNAL_API_KEY, SERVER_URL, REDIS_URL, SMTP_HOST, SMTP_USER, SMTP_PASS, SMTP_FROM. Always required at import: CONVEX_URL (api/lib/convex.ts), MUX_TOKEN_ID/SECRET (api/lib/mux.ts), INTERNAL_API_KEY & REMOTION_API_KEY (server boot).
Full list with defaults: 
- REGISTRY_IMAGE_PREFIX (compose default `ghcr.io/vanneszias`; .env.example says `vanneszias`), IMAGE_TAG (required, immutable release tag)
- WORKOS_CLIENT_ID, WORKOS_CLIENT_SECRET, (WORKOS_REDIRECT_URI optional), VITE_WORKOS_CLIENT_ID, VITE_WORKOS_REDIRECT_URI (e.g. http://localhost/callback), EXPO_PUBLIC_WORKOS_CLIENT_ID
- MOLLIE_API_KEY
- CORS_ORIGIN (default `http://localhost` in example; compose default for remotion `https://app.smog.vlaanderen`; code fallbacks `http://localhost:3001` for URLs, `""` for CORS, `https://app.smog.vlaanderen` in email templates). Single origin only. Also used as public base URL for redirect/webhook/re-edit/email links.
- CONVEX_URL, VITE_CONVEX_URL, EXPO_PUBLIC_CONVEX_URL; (Convex deployment env: INTERNAL_API_KEY, WORKOS_CLIENT_ID)
- MUX_TOKEN_ID, MUX_TOKEN_SECRET (server + remotion)
- VITE_SERVER_URL, EXPO_PUBLIC_SERVER_URL (http://localhost:3000)
- OPENPANEL_API_URL (default `https://analytics.zias.be/api`; fallbacks VITE_/EXPO_PUBLIC_OPENPANEL_API_URL), OPENPANEL_CLIENT_ID (fallbacks EXPO_PUBLIC_OPENPANEL_CLIENT_ID, VITE_OPENPANEL_CLIENT_ID), OPENPANEL_CLIENT_SECRET (fallback EXPO_PUBLIC_...), EXPO_PUBLIC_OPENPANEL_CLIENT_ID/SECRET
- REMOTION_URL (http://localhost:3002 | http://remotion:3002), REMOTION_API_KEY, INTERNAL_API_KEY (generate `openssl rand -base64 32`), SERVER_URL (http://localhost:3000 | http://server:3000), PORT (server 3000, remotion 3002)
- SMTP_HOST, SMTP_PORT (587; 465 => secure), SMTP_USER, SMTP_PASS, SMTP_FROM (`"Smog <no-reply@example.com>"`), SMTP_REPLY_TO (default info@smog.vlaanderen)
- IMAP_HOST, IMAP_PORT (993), IMAP_USER, IMAP_PASS, IMAP_SENT_FOLDER (Sent), IMAP_TLS_REJECT_UNAUTHORIZED ("false" disables)
- REDIS_URL (`redis://localhost:6379/1`; prod `redis://redis-session:6379/1`)
- OTEL_SERVICE_NAME (smog-server), OTEL_EXPORTER_OTLP_ENDPOINT (unset = disabled; SDK appends /v1/logs), OTEL_EXPORTER_OTLP_HEADERS (`k=v,...`), (OTEL_EXPORTER_OTLP_LOGS_ENDPOINT). Logs-only OTLP via `@smog/shared/otel` `initOtel()` + `createLogger`.
- NODE_ENV (production affects cookie `secure`, requireProductionEnv; `development` sets Mux `test:true`)

### Docker compose (`compose.yml`, production)
Services: `redis-session` (redis:7-alpine, `--appendonly yes`, volume redis_data, healthcheck `redis-cli ping` 30s/5s/3); `remotion` (image smog-remotion, env NODE_ENV=production, PORT 3002, SERVER_URL http://server:3000, CORS_ORIGIN, MUX_TOKEN_ID/SECRET, REMOTION_API_KEY required; expose 3002); `server` (image smog-server, env_file .env + NODE_ENV production, PORT 3000, REDIS_URL redis://redis-session:6379/1, REMOTION_URL http://remotion:3002, SERVER_URL http://server:3000, OPENPANEL_*; depends_on redis healthy + remotion `service_healthy`; expose 3000); `web` (image smog-web; Caddy; ports 80/443; volumes caddy_data, caddy_config; depends_on server healthy). Volumes redis_data, caddy_data, caddy_config. Server image: bun 1.3.14 alpine, `bun build` single ESM `dist/index.js` (externals nodemailer, react, react-dom), non-root uid 1001, HEALTHCHECK /health 30s/10s/start 40s/3. Note: compose remotion service has no explicit healthcheck (image HEALTHCHECK used).
Web Caddyfile (`apps/web/Caddyfile`): site `https://app.smog.vlaanderen`; static /srv with SPA fallback; reverse_proxy `/api/*`, `/rpc/*`, `/analytics/*`, `/auth/*`, `/webhooks/*` -> `server:3000`; `/health` 200 OK; strong security headers incl. CSP (connect-src self, *.convex.cloud, api.workos.com, authkit.workos.com, wss://*.convex.cloud, *.mux.com, inferred.litix.io; media-src mux), HSTS 1 y, X-Frame-Options DENY, `/assets/*` immutable cache, `.well-known/apple-app-site-association` & `assetlinks.json` served as application/json.

### External integrations
WorkOS (auth), Convex (DB/functions), Mollie (payments), Mux (video hosting/master download/direct uploads/asset delete), Remotion (Chrome render), SMTP + IMAP mail server (mailcow/SOGo assumed), Redis (BullMQ + rate limit), OpenPanel (analytics relay at analytics.zias.be), OTLP/Grafana (optional logs), Caddy, GHCR registry. No Sentry, no Mux webhooks (Mux is polled, there is NO Mux webhook route), no Mollie signature.

### Config package (`packages/config`)
constants: VIDEO_COMPLETE_COUNT=7, DEFAULT_PAGE_SIZE=20, MAX_GESTURES_PER_SPONSORSHIP=10, PRICE_PER_YEAR_CENTS=5000, LOGO_ADDON_CENTS=1000, FIXED_DURATION_YEARS=1, SYNC_INTERVAL_MS=2h, SYNC_RETRY_DELAY_MS=5min, MAX_SYNC_RETRIES=3, FORCE_SYNC_INTERVAL_MS=1d, ANALYTICS_CONSENT_STORAGE_KEY="@smog_analytics_consent", SQLITE_DATABASE_NAME="gestures.db", DATABASE_TARGET_VERSION=3. urls: MUX_IMAGE_DOMAIN="image.mux.com", MUX_STREAM_DOMAIN="stream.mux.com", COURSE_URL="https://smog.vlaanderen/volg-een-cursus", SMOG_WEBSITE_URL="https://smog.vlaanderen", API_BASE_PATH="/api".

### Maintenance mode (`maintenance/`)
There is NO in-app maintenance flag/env/middleware. It is an ops procedure: separate static Caddy container. `maintenance/compose.yml` (`docker compose -f maintenance/compose.yml up -d` from /opt/smog; `down` to remove) builds `maintenance/Dockerfile` (caddy:2-alpine, copies index.html, assets/logo.svg, Caddyfile; EXPOSE 80 443) and binds ports 80/443 (so the normal `web` container must be stopped first, since it uses the same ports), volumes caddy_data/caddy_config, env `DOMAIN` (default `app.smog.vlaanderen`, Caddyfile `{$DOMAIN:localhost}`; automatic HTTPS). Caddyfile: `root * /srv`, gzip/zstd, headers X-Content-Type-Options nosniff, X-Frame-Options SAMEORIGIN, Referrer-Policy strict-origin-when-cross-origin, `/health` -> 200 "OK", file_server (any path serves index.html or 404s - no rewrite to index, and status is 200, not 503). `index.html`: lang nl, title "SMOG — Even geduld", Inter font (Google Fonts), light/dark CSS vars (primary #00805f, secondary #97c699, bg #ebf4eb; dark: #00a077/#5a8e5c/#121212), SMOG logo, two decorative hand SVGs, badge "Onderhoud bezig", h1 "We zijn zo terug", text "SMOG is momenteel niet beschikbaar vanwege gepland onderhoud. We zijn hard aan het werk en zijn binnenkort weer online." Documented in docs/RELEASE.md as the step if rollback takes more than a few minutes.

### Notable bugs / gotchas to decide on in rewrite
1. `sponsorship_live` email uses pre-approval endDate (stale) - compute after approve.
2. Renewal email footer says 7 days but cron window is 30 days; renewal CTA links to homepage only.
3. `generatePreview.sponsorName` unused; overlayText max 100 vs Remotion max 35 (400 from Remotion surfaces as error).
4. Two overlay config definitions (types preset 15/78/4/85 vs router 22/76/3.8/87 vs DEFAULT_OVERLAY_CONFIG 22/76/3.8/87); legacy render-at-payment path uses the old preset.
5. Admin new-sponsorship email is sent at creation (pre-payment) even if never paid.
6. Webhook amount-check only in bulk path; no idempotency store other than status checks; email dedupe via BullMQ jobId only while job retained.
7. Remotion jobs in-memory, no concurrency cap, no persistence; API callers hold HTTP requests for up to 2 min polling.
8. Cron uses local TZ, no leader election.
9. `admin.users.updateRole` not audit-logged; admin CSV export limited to 10,000 rows.
10. Stale cleanup uses `updatedAt` (payment creation bumps it, resetting the 24 h clock) and doesn't cancel the Mollie payment (a late "paid" webhook for a `cancelled` sponsorship throws Invalid status -> 500 -> Mollie retries indefinitely; money taken without a sponsorship).
11. Webhook/API-key comparisons are non-constant-time string equality.
12. `lists.addGestureToEditableSharedList` and getSharedList* do not pass service token (Convex fns are token-less/public).
