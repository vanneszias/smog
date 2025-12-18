# Admin Dashboard Setup

## Overview

The admin dashboard provides the following features:

1. **Sponsorship Approval** - Review and approve/reject paid sponsorships before they go live
2. **Gesture Management** - Edit gesture details, Mux playback IDs, and manage visibility with bulk operations
3. **Activity Logging** - All admin actions are logged for audit purposes

## Creating the First Admin User

Since there's no admin UI for creating admins, the first admin must be created manually:

### Step 1: Get Your WorkOS User ID

1. Sign in to the web app at `/login`
2. Open browser console
3. Run: `localStorage.getItem('smog_web_token')`
4. Copy the WorkOS ID (it will look like `user_...`)

### Step 2: Update the Database

Use the Convex dashboard to promote your user to admin:

1. Go to your Convex dashboard: https://dashboard.convex.dev
2. Navigate to your project
3. Go to "Data" tab
4. Find the `users` table
5. Find your user by `workosId` (the value from Step 1)
6. Click "Edit"
7. Set `role` to `"admin"` (with quotes)
8. Save

### Step 3: Access the Admin Dashboard

1. Navigate to `/admin`
2. You should now have access to the admin dashboard

## Admin Dashboard Features

### 1. Pending Approvals Tab

Shows sponsorships that have been paid but are awaiting admin approval.

**Actions:**
- **Approve** - Activates the sponsorship and swaps the gesture's video to the sponsored version
- **Reject** - Rejects the sponsorship with a reason (sponsor will be notified)

**Workflow:**
1. User creates sponsorship → video is composed
2. User pays via Mollie
3. Webhook marks sponsorship as "pending_payment"
4. Admin reviews in dashboard
5. Admin approves → sponsorship becomes "active" and gesture video is swapped
6. OR Admin rejects → sponsorship is marked "rejected"

### 2. All Sponsorships Tab

View and filter all sponsorships by status:
- `pending` - Created but not yet paid
- `pending_payment` - Paid, awaiting admin approval
- `active` - Approved and live
- `expired` - Duration ended, video restored
- `rejected` - Rejected by admin

### 3. Gestures Tab

Manage all gestures in the system.

**Features:**
- **Bulk Operations:**
  - Select multiple gestures (or select all)
  - Bulk activate/deactivate gestures
  
- **Individual Editing:**
  - Edit gesture name
  - Update Mux playback ID
  - Edit description
  - Toggle active status

**Fields:**
- `name` - Gesture display name
- `playbackId` - Mux video playback ID
- `info` - Gesture description
- `concept` - Array of concept keywords
- `categoryIds` - Associated categories
- `isActive` - Visibility flag (inactive gestures are hidden from public)

## Admin Roles

To promote additional users to admin:

1. Get their WorkOS ID (same as Step 1 above)
2. Use Convex dashboard to set `role: "admin"` in the users table

OR (future):
- Use the Users tab in admin dashboard (not yet implemented in UI)
- Call API: `orpc.admin.users.updateRole.mutate({ userId, role: "admin" })`

## API Endpoints

All admin endpoints require authentication and admin role:

### User Management
- `admin.users.list` - List all users with pagination
- `admin.users.listAdmins` - List only admin users
- `admin.users.updateRole` - Promote/demote user role

### Gesture Management
- `admin.gestures.listAll` - List all gestures (including inactive)
- `admin.gestures.update` - Update gesture fields
- `admin.gestures.bulkUpdate` - Bulk update gestures
- `admin.gestures.toggleActive` - Toggle active status
- `admin.gestures.create` - Create new gesture

### Sponsorship Management
- `admin.sponsorships.listAll` - List all sponsorships with filters
- `admin.sponsorships.listPendingApproval` - List sponsorships awaiting approval
- `admin.sponsorships.approve` - Approve sponsorship
- `admin.sponsorships.reject` - Reject sponsorship with reason
- `admin.sponsorships.forceExpire` - Manually expire active sponsorship
- `admin.sponsorships.getById` - Get sponsorship details

### Activity Logs
- `admin.logs.getRecent` - Get recent admin actions
- `admin.logs.getByAction` - Filter logs by action type
- `admin.logs.getByTarget` - Get logs for specific target (gesture/sponsorship)

## Security

- All admin routes require authentication (`workosId` in token)
- Admin middleware verifies user has `role: "admin"` in database
- Failed admin access attempts redirect to home page
- All admin actions are logged with timestamp, user, and metadata

## Sponsorship Approval Workflow

The new approval workflow ensures quality control:

**Before (automatic):**
```
Create → Pay → Auto-activate ❌
```

**After (with approval):**
```
Create → Pay → Admin Reviews → Approve/Reject ✅
```

**Benefits:**
- Prevents inappropriate content from going live
- Allows review of overlay quality
- Provides manual override capability
- Maintains payment security (payment happens before approval)

## Monitoring

Admin dashboard data can be viewed in Grafana:
- Navigate to `/admin` tab (if integrated)
- View metrics like:
  - Total sponsorships by status
  - Approval/rejection rates
  - Active vs inactive gestures
  - Admin activity over time

## Troubleshooting

**"Admin access required" error:**
- Verify your user has `role: "admin"` in Convex database
- Clear browser cache and re-login
- Check browser console for specific error messages

**Can't see pending sponsorships:**
- Verify Mollie webhook is configured correctly
- Check server logs for webhook errors
- Ensure sponsorships have `status: "pending_payment"`

**Gesture updates not saving:**
- Check browser console for errors
- Verify Mux playback IDs are valid
- Ensure all required fields are filled

## Future Enhancements

Potential improvements:
- Email notifications for sponsors (approval/rejection)
- Batch sponsorship approval
- Gesture import/export
- Analytics dashboard integration
- User management UI
- Mux asset validation
- Video preview in approval flow
