# Sponsorship Feature - Implementation Progress

## Completed Backend Infrastructure ✅

### 1. Database & Schema
- ✅ Added `sponsorships` table to Convex schema with all required fields
- ✅ Created proper indexes for efficient queries
- ✅ Added TypeScript types for sponsorships in `@smog/types`
- ✅ Generated Convex types and API bindings

### 2. Convex Functions
- ✅ `sponsorships.create` - Create new sponsorship (pending payment)
- ✅ `sponsorships.updateAfterPayment` - Activate sponsorship after payment
- ✅ `sponsorships.getByPaymentId` - Query by Mollie payment ID
- ✅ `sponsorships.getById` - Get sponsorship details
- ✅ `sponsorships.getActiveByGesture` - Check if gesture is sponsored
- ✅ `sponsorships.listGesturesWithSponsorship` - List all gestures with status
- ✅ `sponsorships.getExpired` - Query expired sponsorships
- ✅ `sponsorships.expire` - Expire sponsorship and restore original video
- ✅ `sponsorships.updatePaymentId` - Link Mollie payment to sponsorship
- ✅ `sponsorships.generateUploadUrl` - Get file upload URL
- ✅ `sponsorships.getFileUrl` - Get file URL from storage

### 3. Server Services
- ✅ **MUX Service** (`apps/server/src/services/mux.ts`)
  - Upload videos to MUX
  - Poll for asset readiness
  - Delete videos from MUX
  - Get asset status
  
- ✅ **Sponsorship Service** (`apps/server/src/services/sponsorship.ts`)
  - Process successful payments
  - Upload composed video to MUX
  - Activate sponsorship in database
  
- ✅ **Mollie Webhook** (`apps/server/src/webhooks/mollie.ts`)
  - Handle payment status webhooks
  - Process paid payments
  - Trigger video upload workflow
  
- ✅ **Cron Job** (`apps/server/src/cron.ts`)
  - Daily check for expired sponsorships (00:00)
  - Restore original videos
  - Delete sponsored videos from MUX
  - Integrated into server startup

### 4. Dependencies Added
- ✅ `@mux/mux-node` - MUX video API client
- ✅ `node-cron` - Scheduled job runner
- ✅ `convex` - Convex client for server
- ✅ `@smog/convex` workspace package

### 5. Frontend Utilities
- ✅ **Video Composer** (`apps/web/src/lib/video-composer.ts`)
  - Initialize FFmpeg.wasm
  - Compose video with overlay image and text
  - Progress callbacks
  - Resource cleanup
  
- ✅ **Pricing Utility** (`apps/web/src/lib/pricing.ts`)
  - Calculate sponsorship pricing
  - Format prices in EUR
  - Duration options (1, 2, 4, 8, 12 weeks)
  - Price breakdown strings

- ✅ Dependencies: `@ffmpeg/ffmpeg`, `@ffmpeg/util`

---

## Remaining Frontend Work 🚧

### 1. Route Configuration
**File**: `apps/web/src/routes/sponsors/`

Need to create:
- `index.tsx` - Gesture list page
- `$gestureId.tsx` - Sponsorship creation flow

### 2. UI Components
**Directory**: `apps/web/src/components/sponsors/`

Components to build:
- `GestureListItem.tsx` - Display gesture with sponsorship status
- `SponsorshipForm.tsx` - Multi-step form wizard
- `VideoPreview.tsx` - Preview composed video
- `PaymentFlow.tsx` - Mollie payment integration

### 3. Integration Work
- Connect to Convex queries/mutations
- Implement file upload flow:
  1. Get upload URL from Convex
  2. Upload image and video to Convex storage
  3. Create sponsorship record
  4. Create Mollie payment
  5. Redirect to Mollie checkout
- Handle payment callbacks and success/failure states

### 4. UX Flow
**Step 1: Browse Gestures** (`/sponsors`)
- List all gestures
- Show sponsorship status (Available / Sponsored until [date])
- Disable "Sponsor" button if already sponsored

**Step 2: Create Campaign** (`/sponsors/:gestureId`)
1. Upload image (validate size/format)
2. Enter text (max 50 chars, live counter)
3. Select duration (dropdown)
4. Preview composed video (ffmpeg.wasm)
5. Show price breakdown
6. Enter sponsor name/email
7. Authenticate (WorkOS)
8. Pay (Mollie redirect)

**Step 3: Payment Callback**
- Success: Show confirmation
- Failure: Show error, allow retry

---

## Configuration Required ⚙️

### Environment Variables

**Server** (`apps/server/.env`):
```bash
MUX_TOKEN_ID=your_mux_token_id
MUX_TOKEN_SECRET=your_mux_token_secret
MOLLIE_API_KEY=your_mollie_api_key
CONVEX_URL=your_convex_url
```

**Mollie Dashboard**:
- Configure webhook URL: `https://your-domain.com/webhooks/mollie`
- Test webhook in test mode before going live

---

## Testing Checklist 🧪

### Backend Tests
- [ ] Sponsorship creation with valid data
- [ ] Duplicate sponsorship prevention (gesture already sponsored)
- [ ] MUX video upload (test with sample video)
- [ ] Mollie webhook processing (test mode)
- [ ] Cron job expiration (manual trigger or wait for midnight)
- [ ] File storage upload/retrieval

### Frontend Tests
- [ ] FFmpeg initialization and video composition
- [ ] Image upload validation (size, format)
- [ ] Text input validation (50 char limit)
- [ ] Price calculation for all duration options
- [ ] Video preview playback
- [ ] Authentication flow (WorkOS)
- [ ] Payment redirect (Mollie)
- [ ] Success/failure callback handling

### Integration Tests
- [ ] Full end-to-end sponsorship flow
- [ ] Video appears sponsored after payment
- [ ] Original video restored after expiration
- [ ] Multiple gestures can be sponsored simultaneously
- [ ] Error handling at each step

---

## Deployment Steps 📦

1. **Deploy Convex Schema**
   ```bash
   cd packages/convex
   bun run deploy
   ```

2. **Configure MUX**
   - Set environment variables
   - Test video upload with sample file

3. **Configure Mollie**
   - Set webhook URL
   - Test payment flow in test mode
   - Enable live mode when ready

4. **Deploy Server**
   ```bash
   cd apps/server
   bun run build
   # Deploy to your hosting platform
   ```

5. **Deploy Web App**
   ```bash
   cd apps/web
   bun run build
   # Deploy to your hosting platform
   ```

6. **Verify Cron Job**
   - Check server logs for cron job initialization
   - Manually trigger or wait for midnight to verify

---

## Architecture Summary 📐

```
┌─────────────┐
│  Web App    │
│  (React)    │
└──────┬──────┘
       │
       │ 1. Create sponsorship
       │ 2. Compose video (ffmpeg.wasm)
       │ 3. Upload files to Convex
       │ 4. Create payment
       │
       ▼
┌─────────────┐     ┌─────────────┐
│   Convex    │────▶│   Server    │
│  (Database) │     │  (Node.js)  │
└─────────────┘     └──────┬──────┘
                           │
                           │ Webhook
                           ▼
                    ┌─────────────┐
                    │   Mollie    │
                    │  (Payment)  │
                    └─────────────┘
                           │
                           │ Payment Success
                           ▼
┌─────────────┐     ┌─────────────┐
│     MUX     │◀────│   Server    │
│   (Video)   │     │  (Upload)   │
└─────────────┘     └─────────────┘
       │
       │ Playback ID
       ▼
┌─────────────┐
│   Convex    │
│  (Update)   │
└─────────────┘
```

---

## Next Steps 🎯

To complete the feature, we need to:

1. **Create sponsor pages** (`/sponsors` and `/sponsors/:gestureId`)
2. **Build UI components** for the sponsorship flow
3. **Integrate Mollie** payment creation and redirect
4. **Handle payment callbacks** from Mollie
5. **Test end-to-end** flow with test payments
6. **Deploy and configure** webhooks in production

The backend infrastructure is solid and ready. The frontend is the final piece!

---

## File Structure 📁

```
smog/
├── SPONSORS.md (documentation)
├── packages/
│   ├── convex/
│   │   └── convex/
│   │       ├── schema.ts (✅ updated)
│   │       └── sponsorships.ts (✅ new)
│   └── types/
│       └── src/
│           └── index.ts (✅ updated with sponsorship types)
├── apps/
│   ├── server/
│   │   └── src/
│   │       ├── services/
│   │       │   ├── mux.ts (✅ new)
│   │       │   └── sponsorship.ts (✅ new)
│   │       ├── webhooks/
│   │       │   └── mollie.ts (✅ new)
│   │       ├── cron.ts (✅ new)
│   │       └── index.ts (✅ updated)
│   └── web/
│       └── src/
│           ├── lib/
│           │   ├── video-composer.ts (✅ new)
│           │   └── pricing.ts (✅ new)
│           ├── routes/
│           │   └── sponsors/ (🚧 pending)
│           │       ├── index.tsx
│           │       └── $gestureId.tsx
│           └── components/
│               └── sponsors/ (🚧 pending)
│                   ├── GestureListItem.tsx
│                   ├── SponsorshipForm.tsx
│                   ├── VideoPreview.tsx
│                   └── PaymentFlow.tsx
```

---

## Performance Considerations ⚡

- **FFmpeg.wasm** loads ~40MB on first use (cached afterwards)
- **Video composition** takes 10-30 seconds depending on video length
- **MUX upload** takes 2-5 minutes to process video
- **Webhook processing** is async, user sees "Processing..." state
- **Cron job** runs daily, minimal server load

---

## Cost Estimates 💰

- **MUX**: ~$0.005 per minute of video ingested
- **Convex**: File storage and function calls (free tier sufficient for MVP)
- **Mollie**: 1.29% + €0.09 per transaction in EUR
- **Hosting**: Depends on your platform (Vercel, Railway, etc.)

**Example**: 10 sponsorships/month × €50 each = €500 revenue
- Mollie fees: ~€7
- MUX costs: ~€2-5 (assuming 2-minute videos)
- Net: ~€488-491 per month

---

Generated: December 2024
Status: Backend Complete, Frontend Pending
