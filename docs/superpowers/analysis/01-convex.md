# Analysis 01: packages/convex (old code at /home/user/ref-master/packages/convex)

Files: convex/{schema,users,lists,favorites,gestures,categories,sponsorships,adminLogs,gdpr,gdprCron,cron,auth.config}.ts, convex/lib/{serviceAuth,adminAuth,listSharing,listValidation,sponsorshipDates,sponsorshipStatus,sponsorshipValidation}.ts, lib/__tests__/*. NO http.ts / no HTTP actions, NO Convex `action`s, NO scheduler (ctx.scheduler) use. Only 2 Convex crons (GDPR). Sponsorship crons live in apps/server (node-cron), see section 3.
Tests are vitest pure-unit tests of lib helpers only (listSharing, listValidation, serviceAuth, sponsorshipDates, sponsorshipStatus). No function-level/convex-test tests.

## 0. Cross-cutting auth model (important for rewrite)
- Three auth mechanisms coexist:
  1. **Service token**: arg `serviceToken` compared with `process.env.INTERNAL_API_KEY` (`isValidServiceToken`: `Boolean(expected && token && token === expected)`; fails closed if env unset). `requireServiceAuth(token, op)` throws `[op] Unauthorized`. Used by the API server (oRPC, packages/api) which itself checks admin role (`adminProcedure`) and then calls Convex with the token. So **admin checks are NOT in Convex** for almost every admin function; Convex just trusts the service token. Comments say "Admin authentication is handled at the oRPC layer (adminProcedure)".
  2. **WorkOS JWT identity** (`ctx.auth.getUserIdentity()`, `identity.subject` == users.workosId): used in users.ts (requireMatchingIdentity), lists.ts (requireUserAccess), gdpr.ts.
  3. **Guest capability**: guest Convex user `_id` is treated as an unguessable secret; anyone knowing a guest user's `_id` can act as them (lists.requireUserAccess only checks that the user has a guestId). Weak.
  4. **Share/re-edit tokens** as capabilities (list view/edit tokens, sponsorship reEditToken).
- `lib/adminAuth.ts requireAdminAuth(ctx, operation)`: identity -> subject -> users by_workos_id -> `user.role === "admin"`; errors `[op] Unauthorized: No authentication provided | Invalid identity | User not found`, `[op] Forbidden: Admin privileges required`. Returns {userId, workosId}. **Defined but unused** by any function (dead code).
- auth.config.ts (WorkOS): env `WORKOS_CLIENT_ID` (warns if missing). Two customJwt providers, both RS256, jwks `https://api.workos.com/sso/jwks/${clientId}`: (a) issuer `https://api.workos.com/user_management/${clientId}` (User Management); (b) issuer `https://api.workos.com/`, applicationID clientId (SSO). Identity subject = WorkOS user id.
- Roles: `users.role` optional "user"|"admin"; absent means user. Set only via `users.updateUserRole` (service token). Admin list: `users.listAdmins`.
- Many public (no-auth) queries: gestures.*, categories list/getByName/getByIds, sponsorships.getActiveByGesture(s)/listGesturesWithSponsorship/getAllByPaymentId/getByReEditToken, users.getUserByGuestId, lists shared queries, favorites.* (accepts optional serviceToken arg but NEVER checks it: any caller can read/modify any user's favorites by userId. Security smell), gdpr guest consent.

## 1. Schema (schema.ts). All tables also have implicit _id/_creationTime.

### users
- createdAt: number (ms), email?: string, guestId?: string, lastActiveAt: number, role?: "user"|"admin", workosId?: string
- Indexes: by_workos_id[workosId], by_guest_id[guestId], by_role[role]
- Use: one row per registered (WorkOS) or guest (device random id >=32 chars) user. A row can have both guestId and workosId after migration.
- Smells: guest vs real user in one table with all-optional identity fields; role optional (undefined==user); no email index; lastActiveAt only touched by explicit call (updateLastActive) and migrateGuestToUser; `createdAt` duplicates `_creationTime`.

### gestures
- categoryIds: Id<categories>[], concept: string[], info: string, isActive: boolean, lastUpdated: number, name: string, playbackId: string (Mux playback id)
- Indexes: by_name[name], by_category[categoryIds] (index on an array field: useless for membership queries), by_active[isActive], by_last_updated[lastUpdated]; searchIndex search_content{searchField name, filterFields [categoryIds, isActive]}
- Use: the sign-language gesture catalogue. playbackId is MUTATED by the sponsorship lifecycle (swapped to sponsored video, restored to original on expiry). lastUpdated is bumped on every admin edit and sponsorship swap; clients use `getLastUpdated` for cache/sync invalidation.
- Smells: categoryIds array of ids (no join table, no integrity); concept is a string[] (synonyms/keywords); soft-delete via isActive; category *names* used client side (native) instead of ids; original video stored on sponsorship (`originalVideoPlaybackId`) not gesture, so state is spread.

### categories
- isActive: boolean, name: string. Indexes: by_name[name], by_active[isActive]. Soft delete only. No slug/order/translation.

### user_favorites  (LEGACY)
- createdAt: number, gestureId, userId. Indexes: by_user, by_gesture, by_user_gesture[userId,gestureId].
- Being migrated into gesture_lists default list (see lists). Still read by exportUserData, favorites lookups, cleanup crons. Duplicate concept of favorites.

### gesture_lists
- allowSharedEditing: boolean, createdAt: number, description?: string, editShareToken?: string, isDefaultFavorites: boolean, name: string, ownerId: Id<users>, updatedAt: number, viewShareToken?: string, visibility: "private"|"shared"
- Indexes: by_owner[ownerId], by_owner_created_at[ownerId,createdAt], by_owner_default[ownerId,isDefaultFavorites], by_view_share_token, by_edit_share_token
- Use: user-created gesture lists; each user has exactly one `isDefaultFavorites:true` list named "Favorites" (private, not deletable) that replaces user_favorites.
- Smells: share tokens stored in plain, both tokens exist whenever shared (even if !allowSharedEditing); allowSharedEditing meaningless when private; visibility union of only two values; timestamps are manual createdAt/updatedAt.

### gesture_list_items
- addedBy?: Id<users>, createdAt: number, gestureId, listId, position: number
- Indexes: by_list, by_gesture, by_list_gesture[listId,gestureId], by_list_position[listId,position]
- Position: dense 0..n-1 after reorder; new item = last position+1 (or 0). Unique (listId,gestureId) enforced in code only.

### sponsorships
- contactCompany?: string; contactFullName: string; createdAt: number; durationYears: number (always 1 in simplified flow); endDate: number; gestureId; hasLogo?: boolean (paid logo add-on); invoiceEmail?, invoiceName?, invoiceRequested?: boolean, invoiceVatNumber?; molliePaymentId?: string; originalVideoPlaybackId: string (backup of gesture.playbackId at creation); overlayImageStorageId?: string (legacy); overlayText: string; paymentAmount: number (euro CENTS); previewVideoPlaybackId?: string (wizard preview video); reEditToken?: string; reEditTokenExpiresAt?: number; rejectionReason?: string; renewalReminderSentAt?: number; reviewedAt?: number; reviewedBy?: Id<users>; sponsorEmail: string; sponsoredVideoPlaybackId?: string; sponsorName: string; startDate: number (0 = not started); status: string (FREE STRING, comment: pending | pending_payment | pending_approval | pending_resubmission | active | expired | rejected | cancelled); updatedAt: number
- Indexes: by_gesture, by_status, by_gesture_and_status[gestureId,status], by_end_date, by_payment_id[molliePaymentId], by_re_edit_token
- Smells: status is v.string not union; legacy fields (overlayImageStorageId, contactFullName= sponsorName copy, durationWeeks-based create/createBulk); one Mollie payment id shared by MANY sponsorship rows (bulk) so payment is not its own entity; no payment status/refund fields; invoice fields flat; dates in ms with 365-day "year"; startDate 0 sentinel; hasLogo optional; reviewedBy set also by forceExpire; no history/audit of transitions except adminLogs.

### user_consents
- analyticsConsent: boolean, consentDate: number, consentVersion: string, ipAddress?, marketingConsent?: boolean, userAgent?, userId. Indexes by_user, by_consent_date. Append-only history; latest by _creationTime desc = current. consentVersion hardcoded "1.0".

### adminLogs
- action: string (free), createdAt: number, metadata?: any, targetId: string (untyped id as string), targetType: string, userId: Id<users> (the acting admin). Indexes by_user, by_action, by_target[targetType,targetId], by_created_at.
- Smells: v.any metadata; free-string action/targetType. Actions written by API layer (packages/api/src/routers/admin.ts), values seen: create_category, delete_category, update_category, bulk_update_gestures, create_gesture, toggle_gesture_active, update_gesture, approve_sponsorship, cancel_pending_payment, force_expire_sponsorship, generate_re_edit_link, mark_paid_manually, reject_sponsorship, restore_original_video (targetType e.g. "sponsorship", "user").

## 2. Functions

### users.ts
- `getUserById` q {serviceToken, userId} -> user|null. service auth.
- `getUserByWorkOSId` q {serviceToken?, workosId} -> user|null. Returns null unless valid service token OR caller identity.subject === workosId.
- `getUserByGuestId` q {guestId} -> {_id, guestId}|null. PUBLIC, no auth (leaks internal id for a guest id; guest _id is the capability).
- `createUser` m {email?, guestId?, serviceToken?, workosId?} -> id. Exactly one of workosId/guestId required ("Provide exactly one user identity"). workosId: needs valid service token or matching JWT identity. Guest: guestId.length >= 32 else "Invalid guest identity". Idempotent: returns existing row if found (by workosId or guestId). Inserts {createdAt=now,lastActiveAt=now,email,guestId,workosId}; then `ensureDefaultFavoritesList`. No role set at creation.
- `migrateGuestToUser` m {email?, guestId, workosId} (JWT identity must match workosId). Finds guest by guestId; if found patches {workosId, email (only if provided), lastActiveAt} and ensures default list, returns guest _id (so all guest data, lists etc, stay attached: merge = attach workosId to same row, no data copy). If not found inserts new user with BOTH guestId+workosId. Does NOT check whether a user with that workosId already exists (possible duplicate workosId rows -> `.unique()` would throw later). Does not check that guest row has no other workosId (guest takeover by anyone who knows guestId).
- `updateLastActive` m {serviceToken,userId}. `updateUserRole` m {role:"user"|"admin", serviceToken, userId}.
- `listAllUsers` q {cursor?, limit?, serviceToken}: limit = clamp(limit||50, 1, 500); order desc by creation, take limit+1; returns {hasMore, nextCursor: last _id (cursor arg is IGNORED, pagination is broken), users}.
- `listAdmins` q {serviceToken}: users by_role=admin collect.

### lists.ts (constants: DEFAULT_FAVORITES_NAME="Favorites")
Share token: `crypto.randomUUID().replaceAll("-","")` (32 hex chars), separate tokens for view and edit.
Validation (lib/listValidation): name trimmed, 1..80 chars ("List name must be between 1 and 80 characters"); description trimmed, max 280 ("List description cannot exceed 280 characters"), empty -> undefined; reorder payload must contain every current gesture id exactly once ("Reorder payload must include every list item exactly once").
`requireUserAccess(ctx,userId,serviceToken?)`: valid service token passes; else user must exist; if user.workosId then JWT subject must equal it; else must have guestId (guest capability); else Unauthorized.
Helpers exported: ensureDefaultFavoritesList (creates private "Favorites" list if missing AND migrates legacy user_favorites into it ordered by createdAt asc, appending after max position, preserving item createdAt, addedBy=userId, then DELETES the legacy row (even duplicates)), getDefaultFavoriteGestureIdsForUser (union of list items + legacy favorites), getDefaultFavoriteGesturesForUser (active only), isDefaultFavoriteGesture (checks legacy first then default list), add/remove/toggleDefaultFavoriteGesture, toNativeGesture.
Functions (all with {serviceToken?, userId} + requireUserAccess unless noted):
- `initializeUserLists` m -> default list id.
- `listUserLists` q -> owner's lists by_owner_created_at desc.
- `getSavedGestureIds` q -> unique gesture ids across all owned lists.
- `getGestureListIds` q {gestureId} -> ids of the user's lists containing gesture.
- `getListGestures` q {listId} -> active gesture docs in position order (owner only; throws "List not found").
- `getListGesturesForNative` q -> same, native shape; returns [] if not owner.
- `getSharedList` q {shareToken} PUBLIC -> public projection (no ownerId/tokens): fields _creationTime,_id,allowSharedEditing,canEdit (= tokenIsEdit && allowSharedEditing),createdAt,description,isDefaultFavorites,name,updatedAt,visibility:"shared". Token lookup: view token first (canEdit=false), else edit token (canEdit=list.allowSharedEditing). Only if visibility==="shared".
- `getSharedListGestures` q {shareToken} PUBLIC -> active gestures or [].
- `createList` m {allowSharedEditing, description?, name, visibility}: ensures default list; allowSharedEditing = isShared && flag; when shared generates both tokens.
- `renameList` m. `updateListSharing` m: shared -> keep existing tokens or create; private -> both tokens set undefined; returns updated doc. `regenerateShareTokens` m: new view+edit tokens, returns doc (works even if private).
- `deleteList` m: cannot delete default ("Default Favorites list cannot be deleted"); deletes items then list.
- `addGestureToList` m -> boolean (false if already present; error "Gesture not found" if gesture missing/inactive); `removeGestureFromList` m -> boolean.
- `addGestureToSharedEditableList` m {editShareToken, gestureId, userId} and `removeGestureFromSharedEditableList`: NO auth besides edit token (userId arg not validated); requires list visibility shared && allowSharedEditing else "List is not editable".
- `reorderListItems` m {gestureIds}: positions rewritten 0..n-1 by payload order.
- `backfillDefaultFavoritesLists` internalMutation: for all users run ensureDefaultFavoritesList (one-off migration; returns {migratedUsers}).
- addGestureToListInternal: sets position = last+1, addedBy, createdAt; patches list.updatedAt.

### favorites.ts (thin wrappers over the default list; args {serviceToken?, userId} - token unused, NO auth)
getUserFavorites (ids), getUserFavoriteGestures (docs, active), getUserFavoriteGesturesForNative, toggleUserFavorite (bool true=added), addUserFavorite, removeUserFavorite, isFavorite.

### gestures.ts
Public: 
- `list` {paginationOpts}: active, by_active order desc (by _creationTime), paginate; returns v.any.
- `getById`, `getByIds` (max 200 else "Too many gesture IDs"; filters inactive), `listForNative` {limit? default 200, clamp 1..500, desc}, `getByIdForNative`, `getByIdsForNative` (max 200).
- Native shape: {category: string[] active category NAMES, concept, id, info, name, playbackId}.
- `searchForNative` {categories?: string[] names, limit? default 50 clamp 1..100, searchText}: loads first 2000 active gestures (in-memory scan, unindexed), category filter (any selected name matches), text match = case-insensitive `includes` over name, info, each concept, each category name; empty query matches all. Score: name==q 1000; name startsWith 750; name includes 500; concept includes 300; category includes 200; info includes 100; sort score desc then name.localeCompare. slice(limit).
- `relatedForNative` {gestureId, limit? default 5, clamp 1..20}: other active gestures (first 2000, natural index order) sharing >=1 category id; no ranking.
- `search` {limit? default 50 clamp 1..100, searchText}: Convex full-text search_content on name filtered isActive=true (web).
- `getLastUpdated`: max lastUpdated (by_last_updated desc first) or null.
Service-token (admin, API layer checks role):
- `listAllForAdmin` {limit default 1000 clamp 1..2000} all gestures desc; `listAll` (legacy) {includeInactive, limit}; `updateGesture` (partial fields; throws "No fields to update" if none - note gestureId is destructured out but `updates` still contains only supplied optional fields; bumps lastUpdated); `bulkUpdate` {gestureIds, updates:{categoryIds?, isActive?}} -> {updated: n}; `toggleActive` -> new bool ("Gesture not found"); `updatePlaybackId`; `create` {categoryIds, concept, info, isActive? default true, name, playbackId} (no duplicate-name check).

### categories.ts
Public: `list` (active), `getByName` (active, unique), `getByIds` (max 200 "Too many category IDs", active only).
Service: `listAllForAdmin` (by_name), `create` {isActive? default true, name} (dup name -> "Category with this name already exists"), `update` {categoryId, isActive?, name?} ("No fields to update"; dup check), `deleteCategory` (sets isActive=false only; gestures keep the id).

### adminLogs.ts (all service-token)
`logAction` {action, metadata?, targetId, targetType, userId} sets createdAt=Date.now(); `getByUser` {limit default 100} desc; `getRecent` {limit default 100} by_created_at desc; `getByTarget` {targetType,targetId} all desc; `getByAction` {action, limit default 100}. (limit||100, no clamp)

### gdpr.ts (JWT identity based, workosId users only)
- `exportUserData` q: null if unauthenticated/unknown. Returns {adminActivity:{logsCount (logs where target user), sponsorshipsReviewed count (admin only, full-table filter)}, consents[{analyticsConsent,consentDate ISO,consentVersion,marketingConsent??false}], dataProcessing{dataRetention text, purposes ["Account management","Gesture list and favorites synchronization","Security and service operation"], thirdParties ["WorkOS (authentication)","Convex (database and application functions)","Mux (video delivery)","OpenPanel (optional analytics after consent)"]}, exportDate ISO, exportVersion "1.0", favorites (legacy, with gestureName or "Unknown"), lists[{allowSharedEditing,createdAt,description|null,gestures[{addedAt,gestureId,gestureName,position}],isDefaultFavorites,listId,name,updatedAt,visibility}], userData{accountCreated,guestId|null,lastActive,role ?? "user",userId,workosId|null}}. (Sponsorship personal data is NOT exported.)
- `deleteUserAccount` m {confirmDelete:boolean must be true} (errors: "Deletion must be confirmed by setting confirmDelete to true", "Authentication required. Please sign in to delete your account.", "User not found"). Deletes legacy favorites, consents, owned lists + items; adminLogs authored by user are KEPT with metadata += {deletionDate, userDeleted:true}; sponsorships reviewedBy set undefined (admins); deletes user row. Returns {deletedAt ISO, message, success:true}. Does not touch sponsorships (sponsorEmail retained, "legally required transaction records"), nor WorkOS account.
- Consent: `recordConsent` (legacy compat; auth; stores ipAddress, userAgent), `recordGuestConsent` {analyticsConsent, guestId, marketingConsent?} NO AUTH, creates a guest user row if missing (without default favorites list, without guestId length check), `updateConsent` (auth), `getConsentStatus` (auth; null if not authed), `getGuestConsentStatus` {guestId}. All insert new user_consents row with consentVersion "1.0", marketingConsent ?? false. Status = latest row; if none -> {analyticsConsent:false, hasConsent:false, marketingConsent:false}; else adds consentDate ISO, hasConsent true.

### gdprCron.ts (internalMutations)
- `cleanupInactiveGuests`: users with guestId !== undefined AND lastActiveAt < now - 365 days (full scan with filter; NOTE also matches migrated users who still have a guestId AND workosId, if inactive: they'd be DELETED - bug). Deletes favorites, consents, owned lists+items, user. Returns {deletedCount}.
- `cleanupOldAdminLogs`: adminLogs createdAt < now - 3*365 days deleted via by_created_at. Returns {deletedCount}.

## 3. Crons / scheduled / HTTP
Convex cron.ts (cronJobs):
- "cleanup-inactive-guests": monthly day 1, 02:00 UTC -> internal.gdprCron.cleanupInactiveGuests
- "cleanup-old-admin-logs": monthly (comment says yearly/January, but it is monthly day 1 03:00 UTC) -> internal.gdprCron.cleanupOldAdminLogs
No http.ts, no httpAction, no ctx.scheduler.
External (apps/server/src/cron.ts, node-cron, NOT Convex; calls Convex with service token):
- "0 0 * * *" daily 00:00: `sponsorships.getExpired` then `sponsorships.expire` each (restores original video).
- "0 8 * * *" daily 08:00: `getExpiringSoon({daysUntilExpiry:30})` -> enqueue renewal reminder email -> `markRenewalReminderSent`.
- "0 * * * *" hourly: `getStalePendingPayments` -> `cancelPendingPayment` each.
Rewrite note: these should probably become Convex crons.

## 4. Sponsorship lifecycle
Status values (free string): pending, pending_payment, pending_approval, pending_resubmission, active, expired, rejected, cancelled.
lib/sponsorshipStatus: BLOCKING = [pending, pending_payment, pending_approval, active]; PENDING = [pending, pending_payment, pending_approval, pending_resubmission]; TERMINAL = [rejected, expired, cancelled]. (helpers isPending/isTerminal/isBlocking are used only in tests; the actual conflict checks hard-code statuses.)
Pricing (hardcoded in createBulkSimplified): PRICE_PER_YEAR_CENTS = 5000 (EUR 50.00), LOGO_ADDON_CENTS = 1000 (EUR 10). paymentAmount per gesture = 5000 or 6000 with logo. Server-computed (client price ignored). Duration: durationYears must === 1. Year = 365*24*3600*1000 ms.
Creation:
- `createBulkSimplified` (current flow; service token): validation "Invalid sponsorship selection" if gestureIds empty or >20, length mismatch with previewVideoPlaybackIds, duplicate gestureIds, blank preview ids, or durationYears!==1. For each gesture (sequential): gesture must exist (no isActive check); `checkExistingSponsorship` conflict -> collects error; inserts status "pending_payment", startDate 0, endDate = now+1y provisional, originalVideoPlaybackId = gesture.playbackId, previewVideoPlaybackId, hasLogo=includeLogo, contact/invoice fields, sponsorName/overlayText/sponsorEmail. If any errors -> throws `Failed to create N sponsorship(s): ...` (but earlier inserts in the same mutation are rolled back because the mutation throws). Returns ids.
- Conflict rule (`checkExistingSponsorship`): existing `active` -> `Gesture "<name>" is already sponsored until <date>`; existing pending_payment or pending_approval -> `Gesture "<name>" already has a pending sponsorship`. NOTE pending_resubmission and plain pending do NOT block (inconsistent with BLOCKING_STATUSES); strict variant (legacy `create`) also blocks "pending".
- Legacy `create` (durationWeeks, overlayImageStorageId, sponsoredVideoPlaybackId; status "pending", strict check; durationYears=ceil(weeks/52); endDate = now + weeks*7d) and `createBulk` (per-gesture playback ids; same, non-strict check). Legacy, likely unused; can drop.
Payment:
- `updatePaymentId` {sponsorshipId, molliePaymentId}: sets molliePaymentId, status -> "pending_payment" (unconditional, regardless of current status).
- `updateContactInfo` {molliePaymentId, fullName, email, company?}: patches ALL rows with that payment id (contactFullName, contactCompany, sponsorEmail); throws "No sponsorships found for this payment ID".
- `updateVideoPlaybackId` sets sponsoredVideoPlaybackId (composed video after payment, webhook).
- `markAsAwaitingApproval` (webhook after Mollie paid, and admin "mark_paid_manually"): only if status==="pending_payment" -> "pending_approval"; otherwise logs and returns null silently.
- `updateAfterPayment` (LEGACY auto-activation path): sets startDate=now, endDate=now+durationYears(||1) years, molliePaymentId, sponsoredVideoPlaybackId, status "active", and switches gesture.playbackId to sponsored video (no status precondition).
Admin decision:
- `approve` {adminUserId,sponsorshipId}: requires status "pending_approval" (else `Cannot approve sponsorship with status: X`) and sponsoredVideoPlaybackId present ("Sponsored video playback ID is missing"); sets startDate=now, endDate=now+durationYears years, reviewedAt, reviewedBy, status "active"; gesture.playbackId = sponsoredVideoPlaybackId, lastUpdated=now. (Note: if the gesture already has another active sponsorship nothing prevents overwrite.)
- `reject` {adminUserId, reason}: NO status precondition; sets rejectionReason, reviewedAt/By, status "rejected". Does not touch the gesture video (fine if not active; dangerous if called on active - original video never restored).
- `setReEditToken` {expiresAt, token, sponsorshipId}: allowed from pending_approval, pending_resubmission, rejected (else `Cannot generate re-edit link for sponsorship with status: X`); sets reEditToken, reEditTokenExpiresAt, status "pending_resubmission" (token generation + expiry length are decided in API layer, not Convex). Payment is not required again.
- `getByReEditToken` q PUBLIC {token}: null if unknown; `{expired:true}` if now > expiresAt; else {expired:false, sponsorship:{_id, contactCompany, contactFullName, gestureId, gestureName, hasLogo, originalVideoPlaybackId, overlayText, reEditTokenExpiresAt, sponsorEmail, sponsorName, status}} (does not check status).
- `reSubmitSponsorshipVideo` {token, previewVideoPlaybackId, sponsoredVideoPlaybackId, overlayText?, sponsorName?} (service token): errors "Invalid re-edit token", "Re-edit token has expired", `Cannot resubmit video for sponsorship with status: X` (must be pending_resubmission); sets new videos, optional overlayText/sponsorName, CLEARS token+expiry, status "pending_approval". (Reject reason stays set.)
- `getReEditLinkForAdmin` -> {expired, expiresAt, token}|null.
Expiry / cancel / reminders:
- `getExpired` (active with endDate < now, via by_status collect+filter), `expire` {sponsorshipId} (no status check!): restores gesture.playbackId = originalVideoPlaybackId, lastUpdated=now, status "expired"; run by external daily cron. `forceExpire` {adminUserId}: requires status "active" ("Only active sponsorships can be expired"), same restore, sets reviewedAt/By, status "expired".
- `getStalePendingPayments`: pending_payment with updatedAt < now - 24h (cutoff 24*60*60*1000); `cancelPendingPayment`: requires pending_payment else `Cannot cancel sponsorship with status: X`; -> "cancelled".
- Renewal: `getExpiringSoon({daysUntilExpiry})`: active, endDate > now, endDate <= now + days*24h, renewalReminderSentAt undefined (server uses 30 days); `markRenewalReminderSent` sets renewalReminderSentAt=now. NO in-Convex renewal flow: a "renewal" is simply a new sponsorship for the same gesture, possible only after the old one is expired (active blocks). renewalReminderSentAt is never reset.
- Note: original video backup is captured at creation; if two sponsorships were created before either activated, original could be a sponsored video (only prevented by pending_* blocking check).
Transition summary: [create] -> pending_payment -> (webhook/manual) pending_approval -> approve -> active -> (cron / forceExpire) expired; pending_approval|rejected|pending_resubmission -> setReEditToken -> pending_resubmission -> resubmit -> pending_approval; pending_approval -> reject -> rejected; pending_payment -> (24h stale) cancelled; legacy: pending -> ... , updateAfterPayment jumps straight to active.
Queries: `getByPaymentId` (first, service), `getAllByPaymentId` PUBLIC {molliePaymentId} -> [{durationYears, gestureName, paymentAmount, sponsorName, status}] (payment result page), `getById` (service, full doc), `getActiveByGesture` PUBLIC -> {endDate, sponsorName, status}|null, `getActiveByGestureForService` (full doc), `getActiveByGestures` PUBLIC {gestureIds<=200 "Too many gesture IDs"} -> Record<gestureId,{endDate,sponsorName,status}>, `listGesturesWithSponsorship` PUBLIC: all active gestures + `sponsorship` {endDate, sponsorName (only if active, hidden for pending), status} for statuses pending/pending_payment/pending_approval/active (map keyed by gestureId, last wins; full-table scan by 4 statuses; exposes pending status to public), `listAll` {limit default 100 clamp 1..1000, status?} desc, enriched with gestureName, `listPendingApproval` (status pending_approval, desc, with gestureName).

## 5. Search behaviour in Convex
See gestures.search (Convex full-text on name only, filter isActive) and gestures.searchForNative (in-memory scoring described above; case-insensitive substring; scores 1000/750/500/300/200/100; tie-break name.localeCompare; limit 50 default, max 100; scans max 2000 gestures; category filter by category name OR-match). relatedForNative by shared category. No fuzzy/diacritics/tokenization; Dutch/Flemish locale used in date formatting ("nl-BE").

## 6. Users/auth/roles summary
- Identity provider WorkOS (JWT, `sub` = workosId). Users are created by client/API after WorkOS auth via createUser (service token or matching JWT). Guests: client generates random guestId (>=32 chars), createUser(guestId). Guest->user merge = migrateGuestToUser (attach workosId to guest row).
- Admin = users.role==="admin", set through updateUserRole (service token). Enforcement in API server (oRPC adminProcedure), NOT in Convex. lib/adminAuth exists but unused.
- Consent version "1.0" everywhere (recordConsent, updateConsent, recordGuestConsent); exportVersion "1.0".
- GDPR: export/delete only for WorkOS users; guests purged after 365 days inactivity; adminLogs purged after 3*365 days.

## 7. Smells / rewrite recommendations (condensed)
1. status/action/targetType free strings -> unions/enums. 2. gestures.categoryIds array + useless by_category index -> join table or query by category. 3. Favorites duplicated (user_favorites legacy + default list, lazy migration inside reads/writes) -> single model. 4. Guest and registered in one table; guest _id acts as bearer secret; migrate has no workosId uniqueness check; cleanupInactiveGuests may delete migrated users. 5. favorites.* and getUserByGuestId have no auth. 6. Admin authorization outside Convex; unused adminAuth helper. 7. metadata v.any. 8. Mixed timestamps (own createdAt/updatedAt + _creationTime; startDate 0 sentinel; lastUpdated/lastActiveAt). 9. isActive flags for soft delete on gestures & categories. 10. One Mollie payment -> many sponsorship rows, no payments table. 11. Legacy sponsorship mutations (create, createBulk, updateAfterPayment, durationWeeks helpers, overlayImageStorageId). 12. Prices hard-coded in Convex duplicated from @smog/config. 13. Conflict check ignores pending/pending_resubmission. 14. reject/expire lack status guards. 15. listAllUsers cursor ignored. 16. Cron comment says yearly but monthly; sponsorship crons live outside Convex. 17. search: 2000-row in-memory scans.
