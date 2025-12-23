import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/privacy")({
  component: PrivacyPolicyPage,
});

function PrivacyPolicyPage() {
  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <h1 className="mb-6 font-bold text-4xl">Privacy Policy</h1>
      <p className="mb-4 text-gray-600">
        Last updated: {new Date().toLocaleDateString()}
      </p>

      <div className="space-y-6 text-gray-800">
        <section>
          <h2 className="mb-3 font-semibold text-2xl">1. Introduction</h2>
          <p>
            Welcome to SMOG (&quot;we&quot;, &quot;our&quot;, or
            &quot;us&quot;). We are committed to protecting your personal data
            and respecting your privacy. This Privacy Policy explains how we
            collect, use, and protect your information when you use our sign
            language gesture learning application.
          </p>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-2xl">
            2. Data Controller Information
          </h2>
          <p>
            The data controller responsible for your personal data is SMOG. For
            any privacy-related questions, please contact us at: [Your Contact
            Email]
          </p>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-2xl">3. Data We Collect</h2>

          <h3 className="mt-4 mb-2 font-semibold text-xl">
            3.1 Account Information
          </h3>
          <ul className="ml-6 list-disc space-y-1">
            <li>Email address (via WorkOS authentication)</li>
            <li>First and last name (via WorkOS authentication)</li>
            <li>User ID (unique identifier)</li>
            <li>Account creation and last activity timestamps</li>
          </ul>

          <h3 className="mt-4 mb-2 font-semibold text-xl">
            3.2 Usage Data (if you consent to analytics)
          </h3>
          <ul className="ml-6 list-disc space-y-1">
            <li>Gestures you view and favorite</li>
            <li>Search queries you perform</li>
            <li>App navigation patterns</li>
            <li>Device information (type, OS version)</li>
            <li>Session duration and frequency</li>
            <li>Video playback interactions</li>
          </ul>

          <h3 className="mt-4 mb-2 font-semibold text-xl">
            3.3 User Preferences
          </h3>
          <ul className="ml-6 list-disc space-y-1">
            <li>Favorite gestures</li>
            <li>Search history (stored locally on your device)</li>
            <li>Language and theme preferences</li>
          </ul>

          <h3 className="mt-4 mb-2 font-semibold text-xl">
            3.4 Guest Mode Data
          </h3>
          <ul className="ml-6 list-disc space-y-1">
            <li>Anonymous guest identifier (if using guest mode)</li>
            <li>
              Guest data is deleted after 12 months of inactivity as part of our
              data retention policy
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-2xl">
            4. Legal Basis for Processing (GDPR)
          </h2>
          <ul className="ml-6 list-disc space-y-2">
            <li>
              <strong>Contract Performance:</strong> Processing your account
              information is necessary to provide you with our services
            </li>
            <li>
              <strong>Consent:</strong> Analytics and marketing communications
              (you can withdraw consent at any time in settings)
            </li>
            <li>
              <strong>Legitimate Interest:</strong> Security, fraud prevention,
              and service improvement
            </li>
            <li>
              <strong>Legal Obligation:</strong> Compliance with applicable laws
              and regulations
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-2xl">
            5. How We Use Your Data
          </h2>
          <ul className="ml-6 list-disc space-y-1">
            <li>To provide and maintain our service</li>
            <li>To authenticate your account (via WorkOS)</li>
            <li>To sync your favorites across devices</li>
            <li>
              To improve our app through usage analytics (only if you consent)
            </li>
            <li>To personalize your learning experience</li>
            <li>To provide customer support</li>
            <li>To comply with legal obligations</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-2xl">
            6. Third-Party Services
          </h2>

          <h3 className="mt-4 mb-2 font-semibold text-xl">
            6.1 Authentication - WorkOS
          </h3>
          <p>
            We use WorkOS for secure authentication. WorkOS processes your email
            address and name to create and manage your account. See WorkOS
            Privacy Policy at:{" "}
            <a
              className="text-blue-600 underline"
              href="https://workos.com/privacy"
              rel="noopener noreferrer"
              target="_blank"
            >
              https://workos.com/privacy
            </a>
          </p>

          <h3 className="mt-4 mb-2 font-semibold text-xl">
            6.2 Analytics - PostHog (optional, native app only)
          </h3>
          <p>
            If you consent, we use PostHog (EU-hosted) for usage analytics.
            PostHog helps us understand how users interact with our app. You can
            opt out at any time in settings. See PostHog Privacy Policy at:{" "}
            <a
              className="text-blue-600 underline"
              href="https://posthog.com/privacy"
              rel="noopener noreferrer"
              target="_blank"
            >
              https://posthog.com/privacy
            </a>
          </p>

          <h3 className="mt-4 mb-2 font-semibold text-xl">
            6.3 Video Hosting - Mux
          </h3>
          <p>
            We use Mux to host and stream gesture demonstration videos. Mux may
            collect technical data necessary for video delivery. See Mux Privacy
            Policy at:{" "}
            <a
              className="text-blue-600 underline"
              href="https://mux.com/privacy"
              rel="noopener noreferrer"
              target="_blank"
            >
              https://mux.com/privacy
            </a>
          </p>

          <h3 className="mt-4 mb-2 font-semibold text-xl">
            6.4 Database - Convex
          </h3>
          <p>
            We use Convex to store your account data, favorites, and user
            preferences. Convex is our backend database provider.
          </p>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-2xl">
            7. Data Storage and Security
          </h2>
          <ul className="ml-6 list-disc space-y-1">
            <li>
              Your data is stored securely using industry-standard encryption
            </li>
            <li>
              Analytics data is stored on PostHog servers in the European Union
            </li>
            <li>
              We implement appropriate technical and organizational measures to
              protect your data
            </li>
            <li>
              Access to your personal data is restricted to authorized personnel
              only
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-2xl">8. Data Retention</h2>
          <ul className="ml-6 list-disc space-y-1">
            <li>
              <strong>Active Accounts:</strong> Data retained while your account
              is active
            </li>
            <li>
              <strong>Guest Accounts:</strong> Automatically deleted after 12
              months of inactivity
            </li>
            <li>
              <strong>Admin Logs:</strong> Retained for 3 years for audit
              purposes
            </li>
            <li>
              <strong>Deleted Accounts:</strong> All personal data deleted
              within 30 days of deletion request
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-2xl">9. Your Rights (GDPR)</h2>
          <p className="mb-2">You have the following rights:</p>
          <ul className="ml-6 list-disc space-y-2">
            <li>
              <strong>Right of Access:</strong> Request a copy of your personal
              data (available in Settings → Download My Data)
            </li>
            <li>
              <strong>Right to Rectification:</strong> Correct inaccurate data
              through your account settings
            </li>
            <li>
              <strong>Right to Erasure:</strong> Delete your account and all
              associated data (Settings → Delete My Account)
            </li>
            <li>
              <strong>Right to Restrict Processing:</strong> Limit how we
              process your data
            </li>
            <li>
              <strong>Right to Data Portability:</strong> Receive your data in a
              machine-readable format
            </li>
            <li>
              <strong>Right to Object:</strong> Object to processing based on
              legitimate interests
            </li>
            <li>
              <strong>Right to Withdraw Consent:</strong> Opt out of analytics
              at any time
            </li>
          </ul>
          <p className="mt-3">
            To exercise these rights, use the options in your account settings
            or contact us directly.
          </p>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-2xl">
            10. Children&apos;s Privacy
          </h2>
          <p>
            Our service is intended for users aged 16 and above (or the age of
            digital consent in your country). We do not knowingly collect data
            from children under this age. If you believe we have collected data
            from a child, please contact us immediately.
          </p>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-2xl">
            11. International Data Transfers
          </h2>
          <p>
            Your data may be transferred to and processed in countries outside
            your country of residence. We ensure appropriate safeguards are in
            place, including:
          </p>
          <ul className="ml-6 list-disc space-y-1">
            <li>EU-hosted analytics (PostHog)</li>
            <li>
              Standard Contractual Clauses with third-party processors where
              applicable
            </li>
            <li>
              Adequacy decisions by the European Commission where applicable
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-2xl">
            12. Cookies and Local Storage
          </h2>
          <p>We use local storage (not cookies) to store:</p>
          <ul className="ml-6 list-disc space-y-1">
            <li>Authentication tokens</li>
            <li>User preferences (language, theme)</li>
            <li>Recent searches (local only, not sent to servers)</li>
            <li>Cached gesture data for offline access</li>
          </ul>
          <p className="mt-2">
            You can clear this data at any time through your device/browser
            settings.
          </p>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-2xl">
            13. Changes to This Policy
          </h2>
          <p>
            We may update this Privacy Policy from time to time. We will notify
            you of significant changes by:
          </p>
          <ul className="ml-6 list-disc space-y-1">
            <li>Updating the &quot;Last updated&quot; date</li>
            <li>Displaying an in-app notification</li>
            <li>Requesting renewed consent where legally required</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-2xl">14. Contact Us</h2>
          <p>
            For privacy questions, exercising your rights, or data protection
            concerns, contact us at:
          </p>
          <p className="mt-2">
            <strong>Email:</strong> [Your Privacy Contact Email]
            <br />
            <strong>Address:</strong> [Your Company Address]
          </p>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-2xl">
            15. Supervisory Authority
          </h2>
          <p>
            If you are located in the EEA or UK, you have the right to lodge a
            complaint with your local data protection authority if you believe
            we have not complied with applicable data protection laws.
          </p>
        </section>

        <section className="border-gray-300 border-t pt-6">
          <p className="text-gray-600 text-sm">
            This privacy policy is designed to be GDPR-compliant. By using our
            service, you acknowledge that you have read and understood this
            policy.
          </p>
        </section>
      </div>
    </div>
  );
}
