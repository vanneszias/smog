# GDPR Compliance Implementation Guide

## Overview

This document outlines the comprehensive GDPR compliance implementation for the SMOG native app and web application. The implementation includes consent management, data export, account deletion, privacy policy, terms of service, and automated data retention policies.

---

## ✅ COMPLETED: Backend Infrastructure

### 1. Database Schema Updates
**File**: `packages/convex/convex/schema.ts`

Added `user_consents` table:
```typescript
user_consents: defineTable({
  userId: v.id("users"),
  analyticsConsent: v.boolean(),
  marketingConsent: v.optional(v.boolean()),
  consentVersion: v.string(),
  consentDate: v.number(),
  ipAddress: v.optional(v.string()),
  userAgent: v.optional(v.string()),
})
```

### 2. GDPR Functions
**File**: `packages/convex/convex/gdpr.ts`

Implemented functions:
- `exportUserData` - GDPR Article 15 (Right of Access)
- `deleteUserAccount` - GDPR Article 17 (Right to Erasure)
- `recordConsent` - Store authenticated user consent
- `recordGuestConsent` - Store guest user consent
- `updateConsent` - Update consent preferences
- `getConsentStatus` - Retrieve current consent
- `getGuestConsentStatus` - Retrieve guest consent

### 3. Automated Data Retention
**Files**:
- `packages/convex/convex/cron.ts` - Cron job definitions
- `packages/convex/convex/gdprCron.ts` - GDPR cleanup functions

**Policies**:
- Guest accounts: Deleted after 12 months of inactivity
- Admin logs: Deleted after 3 years
- Runs monthly (guests) and yearly (admin logs)

### 4. Legal Pages
**Files**:
- `apps/web/src/routes/privacy.tsx` - Comprehensive Privacy Policy
- `apps/web/src/routes/terms.tsx` - Terms of Service

**Features**:
- GDPR-compliant privacy policy with all required disclosures
- Clear data collection and usage explanations
- User rights documentation (access, erasure, portability, etc.)
- Third-party service disclosures (WorkOS, PostHog, Convex, Mux)
- Data retention policies
- Contact information sections

### 5. Translations
**File**: `packages/i18n/src/locales/en.json`

Added comprehensive GDPR translations under `gdpr` namespace:
- Consent modal text
- Account management text
- Data export/deletion text
- All user-facing GDPR-related strings

### 6. GDPR Consent Component
**File**: `apps/native/components/GDPRConsentModal.tsx`

Features:
- Required vs optional consent separation
- Analytics consent toggle
- Links to Privacy Policy and Terms
- Three action options: Accept All, Customize, Required Only
- Prevents dismissal without action

---

## 🚧 TODO: Integration Work

### Priority 1: Native App Integration

#### A. Update Welcome Screen
**File**: `apps/native/app/welcome.tsx`

Add consent flow:
```typescript
import { useState, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import GDPRConsentModal from "@/components/GDPRConsentModal";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";

// Inside component:
const [showConsent, setShowConsent] = useState(false);
const [hasCheckedConsent, setHasCheckedConsent] = useState(false);
const recordGuestConsent = useMutation(api.gdpr.recordGuestConsent);

useEffect(() => {
  checkConsentStatus();
}, []);

const checkConsentStatus = async () => {
  const consent = await AsyncStorage.getItem("@smog_gdpr_consent");
  if (!consent) {
    setShowConsent(true);
  }
  setHasCheckedConsent(true);
};

const handleAcceptAll = async (analyticsConsent: boolean) => {
  await AsyncStorage.setItem("@smog_gdpr_consent", "accepted");
  await AsyncStorage.setItem("@smog_analytics_consent", analyticsConsent.toString());
  
  // If guest mode will be used, record consent
  const guestId = await AsyncStorage.getItem("@smog_guest_id");
  if (guestId) {
    await recordGuestConsent({ guestId, analyticsConsent });
  }
  
  setShowConsent(false);
};

const handleAcceptRequired = async () => {
  await AsyncStorage.setItem("@smog_gdpr_consent", "accepted");
  await AsyncStorage.setItem("@smog_analytics_consent", "false");
  setShowConsent(false);
};

// In render:
{hasCheckedConsent && (
  <GDPRConsentModal
    visible={showConsent}
    onAcceptAll={handleAcceptAll}
    onAcceptRequired={handleAcceptRequired}
  />
)}
```

#### B. Update Analytics Service
**File**: `apps/native/services/analyticsService.ts`

Make PostHog initialization conditional:
```typescript
import AsyncStorage from "@react-native-async-storage/async-storage";

let isAnalyticsEnabled = false;

export const initializeAnalytics = async () => {
  const consent = await AsyncStorage.getItem("@smog_analytics_consent");
  isAnalyticsEnabled = consent === "true";
  
  if (!isAnalyticsEnabled) {
    console.log("[Analytics] User opted out of analytics");
    return;
  }

  // Existing PostHog initialization code...
};

// Wrap all analytics functions:
export const trackEvent = (eventName: string, properties?: any) => {
  if (!isAnalyticsEnabled) return;
  // existing code...
};

export const enableAnalytics = async () => {
  isAnalyticsEnabled = true;
  await AsyncStorage.setItem("@smog_analytics_consent", "true");
  await initializeAnalytics();
};

export const disableAnalytics = async () => {
  isAnalyticsEnabled = false;
  await AsyncStorage.setItem("@smog_analytics_consent", "false");
  PostHog.reset(); // Clear user identity
};
```

#### C. Create Account Management Screen
**File**: `apps/native/screens/settings/AccountSettingsScreen.tsx`

```typescript
import { useState } from "react";
import { View, Text, TouchableOpacity, Switch, Alert, Share } from "react-native";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/context/AuthContext";
import { enableAnalytics, disableAnalytics } from "@/services/analyticsService";

export default function AccountSettingsScreen() {
  const { user, signOut } = useAuth();
  const consentStatus = useQuery(api.gdpr.getConsentStatus);
  const exportData = useQuery(api.gdpr.exportUserData);
  const deleteAccount = useMutation(api.gdpr.deleteUserAccount);
  const updateConsent = useMutation(api.gdpr.updateConsent);
  
  const [analyticsEnabled, setAnalyticsEnabled] = useState(
    consentStatus?.analyticsConsent ?? false
  );

  const handleAnalyticsToggle = async (value: boolean) => {
    setAnalyticsEnabled(value);
    await updateConsent({ analyticsConsent: value });
    
    if (value) {
      await enableAnalytics();
    } else {
      await disableAnalytics();
    }
  };

  const handleExportData = async () => {
    if (!exportData) return;
    
    const jsonString = JSON.stringify(exportData, null, 2);
    await Share.share({
      message: jsonString,
      title: "My SMOG Data Export",
    });
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      "Delete Account?",
      "This will permanently delete your account, favorites, and all associated data. This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            await deleteAccount({ confirmDelete: true });
            await signOut();
          },
        },
      ]
    );
  };

  return (
    <View>
      {/* Analytics Toggle */}
      <View>
        <Text>Usage Analytics</Text>
        <Switch value={analyticsEnabled} onValueChange={handleAnalyticsToggle} />
      </View>

      {/* Export Data */}
      <TouchableOpacity onPress={handleExportData}>
        <Text>Download My Data</Text>
      </TouchableOpacity>

      {/* Delete Account */}
      <TouchableOpacity onPress={handleDeleteAccount}>
        <Text style={{ color: "red" }}>Delete My Account</Text>
      </TouchableOpacity>
    </View>
  );
}
```

Add to settings navigation:
**File**: `apps/native/app/settings/_layout.tsx` (or wherever settings routes are defined)

### Priority 2: Web App Integration

#### A. Add GDPR Consent Banner
**File**: `apps/web/src/components/gdpr-consent-banner.tsx`

```typescript
import { useState, useEffect } from "react";
import { Button } from "./ui/button";
import { Switch } from "./ui/switch";
import { Link } from "@tanstack/react-router";

export function GDPRConsentBanner() {
  const [showBanner, setShowBanner] = useState(false);
  const [analyticsConsent, setAnalyticsConsent] = useState(true);

  useEffect(() => {
    const consent = localStorage.getItem("smog_gdpr_consent");
    if (!consent) {
      setShowBanner(true);
    }
  }, []);

  const handleAcceptAll = () => {
    localStorage.setItem("smog_gdpr_consent", "accepted");
    localStorage.setItem("smog_analytics_consent", "true");
    setShowBanner(false);
  };

  const handleAcceptRequired = () => {
    localStorage.setItem("smog_gdpr_consent", "accepted");
    localStorage.setItem("smog_analytics_consent", "false");
    setShowBanner(false);
  };

  if (!showBanner) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 shadow-lg z-50">
      <div className="container mx-auto max-w-6xl">
        <h3 className="font-semibold text-lg mb-2">Privacy & Data Usage</h3>
        <p className="text-sm text-gray-600 mb-4">
          We respect your privacy and are committed to protecting your personal data.
          Learn more in our{" "}
          <Link to="/privacy" className="text-blue-600 underline">
            Privacy Policy
          </Link>{" "}
          and{" "}
          <Link to="/terms" className="text-blue-600 underline">
            Terms of Service
          </Link>
          .
        </p>

        <div className="flex items-center gap-4 mb-4">
          <label className="flex items-center gap-2">
            <Switch
              checked={analyticsConsent}
              onCheckedChange={setAnalyticsConsent}
            />
            <span className="text-sm">Usage Analytics</span>
          </label>
        </div>

        <div className="flex gap-2">
          <Button onClick={handleAcceptAll}>Accept All</Button>
          <Button variant="outline" onClick={handleAcceptRequired}>
            Required Only
          </Button>
        </div>
      </div>
    </div>
  );
}
```

Add to root layout:
**File**: `apps/web/src/routes/__root.tsx`

```typescript
import { GDPRConsentBanner } from "@/components/gdpr-consent-banner";

// In component return:
<>
  <Outlet />
  <GDPRConsentBanner />
</>
```

#### B. Add Account Management Page
**File**: `apps/web/src/routes/account.tsx`

```typescript
import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/lib/auth-context";

export function AccountPage() {
  const { signOut } = useAuth();
  const consentStatus = useQuery(api.gdpr.getConsentStatus);
  const exportData = useQuery(api.gdpr.exportUserData);
  const deleteAccount = useMutation(api.gdpr.deleteUserAccount);
  const updateConsent = useMutation(api.gdpr.updateConsent);

  const handleExportData = () => {
    if (!exportData) return;
    
    const dataStr = JSON.stringify(exportData, null, 2);
    const dataBlob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `smog-data-export-${new Date().toISOString()}.json`;
    link.click();
  };

  const handleDeleteAccount = async () => {
    if (confirm("Are you sure? This cannot be undone.")) {
      await deleteAccount({ confirmDelete: true });
      signOut();
    }
  };

  return (
    <div className="container mx-auto max-w-2xl p-6">
      <h1 className="text-3xl font-bold mb-6">Account Settings</h1>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">Privacy Preferences</h2>
        <div className="flex items-center justify-between p-4 border rounded-lg">
          <div>
            <p className="font-medium">Usage Analytics</p>
            <p className="text-sm text-gray-600">
              Help us improve by sharing anonymous usage data
            </p>
          </div>
          <Switch
            checked={consentStatus?.analyticsConsent ?? false}
            onCheckedChange={(value) =>
              updateConsent({ analyticsConsent: value })
            }
          />
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">Your Data</h2>
        <Button onClick={handleExportData} className="mb-2">
          Download My Data
        </Button>
      </section>

      <section className="border-t pt-6">
        <h2 className="text-xl font-semibold mb-4 text-red-600">Danger Zone</h2>
        <Button variant="destructive" onClick={handleDeleteAccount}>
          Delete My Account
        </Button>
      </section>
    </div>
  );
}
```

### Priority 3: Backend API Endpoints

#### A. WorkOS Portal Integration
**File**: `apps/server/src/index.ts`

Add endpoint for generating WorkOS portal links:

```typescript
import { WorkOS } from "@workos-inc/node";

const workos = new WorkOS(process.env.WORKOS_API_KEY);

app.post("/api/user/portal-link", async (c) => {
  const authHeader = c.req.header("Authorization");
  const workosId = authHeader?.replace("Bearer ", "");
  
  if (!workosId) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const portalLink = await workos.userManagement.getPortalLink({
      organization: process.env.WORKOS_ORG_ID!,
      returnUrl: `${process.env.APP_URL}/account`,
      intent: "manage_profile",
    });

    return c.json({ portalUrl: portalLink.link });
  } catch (error) {
    console.error("Failed to generate portal link:", error);
    return c.json({ error: "Failed to generate portal link" }, 500);
  }
});
```

#### B. Update WorkOS Webhook Handler
**File**: `apps/server/src/webhooks/workos.ts` (or wherever webhooks are handled)

Handle user deletion events:

```typescript
import { ConvexHttpClient } from "convex/browser";
import { api } from "@convex/_generated/api";

const convex = new ConvexHttpClient(process.env.CONVEX_URL!);

export async function handleWorkOSWebhook(event: any) {
  if (event.event === "user.deleted") {
    const { user } = event.data;
    
    // Trigger account deletion in Convex
    await convex.mutation(api.gdpr.deleteUserAccount, {
      confirmDelete: true,
      // Note: This requires modifying the function to accept workosId directly
      // or implementing a system user context for webhook triggers
    });
  }
}
```

---

## Environment Variables Required

Add to `.env`:

```env
# WorkOS (already present, verify these are set)
WORKOS_CLIENT_ID=your_workos_client_id
WORKOS_CLIENT_SECRET=your_workos_client_secret
WORKOS_API_KEY=your_workos_api_key
WORKOS_ORG_ID=your_workos_org_id
WORKOS_REDIRECT_URI=your_redirect_uri

# App URLs (for privacy/terms links)
APP_URL=https://your-app-domain.com
PRIVACY_POLICY_URL=https://your-app-domain.com/privacy
TERMS_OF_SERVICE_URL=https://your-app-domain.com/terms

# Convex (already present)
CONVEX_URL=your_convex_url
```

---

## Testing Checklist

### Native App
- [ ] GDPR consent modal appears on first launch
- [ ] Can accept all, customize, or accept required only
- [ ] Privacy Policy and Terms links open correctly
- [ ] Analytics only initialize if consented
- [ ] Guest mode records consent properly
- [ ] Account settings screen shows current consent status
- [ ] Can toggle analytics consent in settings
- [ ] Can export data as JSON file
- [ ] Can delete account (with confirmation)
- [ ] Account deletion removes all data and signs out user

### Web App
- [ ] GDPR banner appears on first visit
- [ ] Can dismiss banner after accepting
- [ ] Privacy Policy page loads correctly
- [ ] Terms of Service page loads correctly
- [ ] Account page shows current consent status
- [ ] Can toggle analytics consent
- [ ] Can export data as JSON download
- [ ] Can delete account (with confirmation)
- [ ] Account deletion removes all data and signs out user

### Backend
- [ ] Convex schema deployed successfully
- [ ] GDPR functions work correctly (test in Convex dashboard)
- [ ] Cron jobs scheduled (check Convex dashboard)
- [ ] WorkOS portal link generation works
- [ ] WorkOS webhook handles user deletion
- [ ] Data export includes all user data
- [ ] Account deletion removes all related data
- [ ] Admin logs are anonymized, not deleted

---

## Legal Compliance Notes

### What's Implemented:
✅ GDPR Article 13-14: Privacy information provided
✅ GDPR Article 15: Right of access (data export)
✅ GDPR Article 17: Right to erasure (account deletion)
✅ GDPR Article 21: Right to object (analytics opt-out)
✅ Consent management (opt-in for analytics)
✅ Data retention policies
✅ Privacy policy disclosure
✅ Third-party data processor disclosure

### Required Actions:
⚠️ **Update Privacy Policy and Terms with your actual**:
- Company name and address
- Contact email address
- Data Protection Officer (if applicable)
- Jurisdiction for legal disputes
- Specific data retention periods

⚠️ **Update URLs** in:
- `apps/native/components/GDPRConsentModal.tsx` (lines 64-70)
- Environment variables

⚠️ **Legal Review**:
- Have a lawyer review Privacy Policy and Terms
- Ensure compliance with your specific jurisdiction
- Consider appointing a Data Protection Officer if required
- Register with your local data protection authority if required

⚠️ **User Communication**:
- Notify existing users of the new privacy policy
- Consider email notification for policy changes
- Implement version tracking for policy updates

---

## Deployment Steps

1. **Deploy Convex Changes**:
   ```bash
   cd packages/convex
   npx convex deploy
   ```

2. **Update Environment Variables** in your deployment platforms

3. **Deploy Native App** (with updated code)

4. **Deploy Web App** (with updated code)

5. **Deploy Backend API** (with new endpoints)

6. **Test Everything** using the checklist above

7. **Monitor** for the first few days:
   - Check Convex logs for any errors
   - Monitor consent acceptance rates
   - Verify cron jobs run successfully
   - Check for any user reports of issues

---

## Support & Maintenance

### Monthly Tasks:
- Review consent logs for anomalies
- Check cron job execution logs
- Monitor data deletion requests

### Yearly Tasks:
- Review and update Privacy Policy if needed
- Audit data retention compliance
- Review third-party processor agreements
- Update consent version if substantial changes made

### On Policy Changes:
1. Update consent version in code
2. Notify users of changes
3. Request renewed consent for material changes
4. Update "Last updated" date in legal documents

---

## Summary of Files Created/Modified

### ✅ Created:
- `packages/convex/convex/gdpr.ts`
- `packages/convex/convex/gdprCron.ts`
- `packages/convex/convex/cron.ts`
- `apps/web/src/routes/privacy.tsx`
- `apps/web/src/routes/terms.tsx`
- `apps/native/components/GDPRConsentModal.tsx`

### ✅ Modified:
- `packages/convex/convex/schema.ts`
- `packages/i18n/src/locales/en.json`

### 🚧 Need to Modify:
- `apps/native/app/welcome.tsx`
- `apps/native/services/analyticsService.ts`
- `apps/native/screens/settings/` (create AccountSettingsScreen)
- `apps/web/src/components/gdpr-consent-banner.tsx` (create)
- `apps/web/src/routes/__root.tsx`
- `apps/web/src/routes/account.tsx` (create)
- `apps/server/src/index.ts`
- `apps/server/src/webhooks/` (webhook handler)

---

## Questions & Support

For questions about this implementation:
1. Review this README thoroughly
2. Check Convex dashboard for function logs
3. Test each component individually
4. Consult GDPR documentation for legal questions
5. Seek legal counsel for compliance advice

**Remember**: GDPR compliance is an ongoing process, not a one-time implementation. Regular reviews and updates are essential.

---

## Quick Start Guide

To complete the implementation:

1. **Review** all completed work in this README
2. **Implement** the Priority 1 items (Native App Integration)
3. **Implement** the Priority 2 items (Web App Integration)
4. **Implement** the Priority 3 items (Backend API)
5. **Update** all placeholder text (emails, addresses, URLs)
6. **Test** using the checklist
7. **Get legal review** of Privacy Policy and Terms
8. **Deploy** to production
9. **Monitor** and maintain

Good luck! 🚀
