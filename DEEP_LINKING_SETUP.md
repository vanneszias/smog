# Deep Linking Implementation - Next Steps

## Implementation Summary

I've successfully implemented deep linking to allow users to share gesture URLs and open them directly in the native app. Here's what was done:

### 1. ✅ Aligned Native Routing
- Renamed `/gesture/[id]` to `/gestures/[id]` in the native app to match the web app
- Updated all navigation references throughout the codebase
- Files modified:
  - Moved `apps/native/app/gesture/` to `apps/native/app/gestures/`
  - Updated `apps/native/app/_layout.tsx`
  - Updated `apps/native/navigation/AppNavigator.tsx`
  - Updated `apps/native/services/analyticsService.ts`
  - Updated all screen components that navigate to gesture details

### 2. ✅ Configured Native App for Deep Linking
- Updated `apps/native/app.json`:
  - Added iOS Associated Domains: `applinks:smog.zias.be`
  - Added Android Intent Filter for HTTPS scheme with host `smog.zias.be`
  - Existing custom scheme `smog://` was already configured

### 3. ✅ Created Verification Files for Web
- Created `apps/web/public/.well-known/apple-app-site-association` (iOS)
- Created `apps/web/public/.well-known/assetlinks.json` (Android)

### 4. ✅ Added "Open in App" Button on Web
- Created device detection utilities in `apps/web/src/utils/deviceDetection.ts`
- Modified `packages/ui/src/gestures/GestureDetail.tsx` to show banner on mobile
- Updated `apps/web/src/routes/gestures_.$id.tsx` to integrate the feature
- Added translations for all languages (EN, NL, FR)

---

## Required Actions Before Deployment

### iOS Configuration
1. **Get Your Apple Team ID**:
   - Log in to your Apple Developer account
   - Go to Membership details
   - Copy your Team ID (looks like: `XXXXXXXXXX`)

2. **Update the Apple App Site Association file**:
   - Replace `TEAM_ID` in `apps/web/public/.well-known/apple-app-site-association`
   - Replace with your actual Team ID

### Android Configuration
1. **Get Your App's SHA-256 Fingerprint**:
   ```bash
   # For debug builds:
   keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android

   # For release builds:
   keytool -list -v -keystore /path/to/your/release.keystore -alias your-key-alias
   ```
   - Copy the SHA256 fingerprint (remove colons)

2. **Update the Asset Links file**:
   - Replace `REPLACE_WITH_YOUR_SHA256_FINGERPRINT` in `apps/web/public/.well-known/assetlinks.json`
   - Add your SHA-256 fingerprint

### Web Server Configuration
1. **Ensure HTTPS is enabled** on `smog.zias.be`
   - Deep linking requires HTTPS

2. **Configure proper Content-Type headers**:
   - `apple-app-site-association` should be served with `application/json` content type
   - `assetlinks.json` should be served with `application/json` content type
   - Both files should be accessible without file extensions

3. **Verify files are accessible**:
   - Test: `https://smog.zias.be/.well-known/apple-app-site-association`
   - Test: `https://smog.zias.be/.well-known/assetlinks.json`

### Native App Rebuild
After updating the configuration files:
1. Rebuild the native app with the updated `app.json`
2. Test on actual devices (simulators may not fully support deep linking)

---

## Testing Deep Linking

### iOS Testing
1. Send yourself a link via Messages or Email: `https://smog.zias.be/gestures/[id]`
2. Long press the link - you should see "Open in SMOG"
3. Tap the link - it should open directly in the app

### Android Testing
1. Send yourself a link via Messages or Email: `https://smog.zias.be/gestures/[id]`
2. Tap the link - Android should show a dialog to open in the app
3. Or it will open directly in the app (depending on settings)

### Web Banner Testing
1. Open `https://smog.zias.be/gestures/[id]` in a mobile browser
2. You should see an "Open in App" banner at the top
3. Tapping "Open" should launch the app

### Custom Scheme Testing (Fallback)
If Universal/App Links don't work, the custom scheme should:
1. Try: `smog://gestures/[id]` in mobile browser
2. Should prompt to open the app

---

## Troubleshooting

### iOS Universal Links Not Working
- Verify Team ID is correct in the association file
- Check that the association file is served with correct content-type
- On iOS, Universal Links only work from external sources (not Safari's address bar)
- Delete and reinstall the app to refresh the association

### Android App Links Not Working
- Verify SHA-256 fingerprint is correct
- Check that assetlinks.json is accessible
- Use Android's Digital Asset Links verification tool
- Clear app data and reinstall

### Banner Not Showing on Web
- Check browser console for JavaScript errors
- Verify mobile device detection is working
- Test on actual mobile devices (not desktop responsive mode)

---

## How It Works

1. **User shares a gesture**: `https://smog.zias.be/gestures/abc123`
2. **Recipient clicks link on mobile**:
   - If app is installed: Opens directly in app (via Universal/App Links)
   - If app is not installed: Opens in mobile browser
3. **If opened in browser**: Shows "Open in App" banner
4. **User taps banner**: Attempts to open app via custom scheme
5. **App opens**: Routes to `/gestures/abc123` and displays the gesture

---

## URLs That Support Deep Linking

- Home: `https://smog.zias.be/` → Opens app home
- Gesture Detail: `https://smog.zias.be/gestures/[id]` → Opens specific gesture

---

## Notes

- The `.well-known` directory is a standard location for verification files
- Both iOS and Android verify these files during app installation
- Deep links work best when tested on actual devices
- The custom scheme `smog://` serves as a fallback mechanism
