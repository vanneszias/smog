import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/terms")({
  component: TermsOfServicePage,
});

function TermsOfServicePage() {
  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <h1 className="mb-6 font-bold text-4xl">Terms of Service</h1>
      <p className="mb-4 text-gray-600">
        Last updated: {new Date().toLocaleDateString()}
      </p>

      <div className="space-y-6 text-gray-800">
        <section>
          <h2 className="mb-3 font-semibold text-2xl">
            1. Acceptance of Terms
          </h2>
          <p>
            By accessing and using SMOG (&quot;the Service&quot;), you accept
            and agree to be bound by the terms and conditions of this agreement.
            If you do not agree to these Terms of Service, please do not use the
            Service.
          </p>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-2xl">
            2. Description of Service
          </h2>
          <p>
            SMOG is a sign language gesture learning application that provides:
          </p>
          <ul className="ml-6 list-disc space-y-1">
            <li>Access to a library of sign language gesture videos</li>
            <li>Search and categorization of gestures</li>
            <li>Ability to save favorite gestures</li>
            <li>Cross-device synchronization for registered users</li>
            <li>Guest mode for temporary access without registration</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-2xl">3. User Accounts</h2>

          <h3 className="mt-4 mb-2 font-semibold text-xl">
            3.1 Account Creation
          </h3>
          <p>
            You may create an account using WorkOS authentication. You are
            responsible for maintaining the confidentiality of your account
            credentials and for all activities under your account.
          </p>

          <h3 className="mt-4 mb-2 font-semibold text-xl">3.2 Guest Mode</h3>
          <p>
            You may use the Service as a guest without creating an account.
            Guest data is stored locally on your device and will be
            automatically deleted after 12 months of inactivity.
          </p>

          <h3 className="mt-4 mb-2 font-semibold text-xl">
            3.3 Account Termination
          </h3>
          <p>
            You may delete your account at any time through the settings page.
            Upon deletion, all your personal data will be permanently removed
            within 30 days.
          </p>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-2xl">4. User Conduct</h2>
          <p>You agree NOT to:</p>
          <ul className="ml-6 list-disc space-y-1">
            <li>Use the Service for any unlawful purpose</li>
            <li>
              Attempt to gain unauthorized access to any portion of the Service
            </li>
            <li>
              Interfere with or disrupt the Service or servers or networks
              connected to the Service
            </li>
            <li>
              Use any automated system to access the Service without our prior
              written permission
            </li>
            <li>
              Reproduce, duplicate, copy, or resell any part of the Service
            </li>
            <li>
              Remove or modify any copyright, trademark, or proprietary notices
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-2xl">
            5. Intellectual Property
          </h2>

          <h3 className="mt-4 mb-2 font-semibold text-xl">5.1 Our Content</h3>
          <p>
            All content provided through the Service, including gesture videos,
            text, graphics, logos, and software, is the property of SMOG or its
            licensors and is protected by copyright and other intellectual
            property laws.
          </p>

          <h3 className="mt-4 mb-2 font-semibold text-xl">5.2 License Grant</h3>
          <p>
            We grant you a limited, non-exclusive, non-transferable license to
            access and use the Service for your personal, non-commercial use.
            This license does not include any rights to:
          </p>
          <ul className="ml-6 list-disc space-y-1">
            <li>
              Download or copy gesture videos (except through normal caching)
            </li>
            <li>Modify or create derivative works</li>
            <li>Publicly display or perform the content</li>
            <li>Use the content for commercial purposes</li>
          </ul>

          <h3 className="mt-4 mb-2 font-semibold text-xl">
            5.3 Educational Use
          </h3>
          <p>
            The Service is intended for educational purposes to help users learn
            sign language. Users are encouraged to use the knowledge gained to
            communicate and teach others.
          </p>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-2xl">6. Privacy</h2>
          <p>
            Your use of the Service is also governed by our Privacy Policy. By
            using the Service, you consent to the collection and use of your
            information as described in the Privacy Policy.
          </p>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-2xl">7. Disclaimers</h2>

          <h3 className="mt-4 mb-2 font-semibold text-xl">
            7.1 Service Availability
          </h3>
          <p>
            The Service is provided &quot;as is&quot; and &quot;as
            available&quot; without warranties of any kind. We do not guarantee
            that the Service will be uninterrupted, timely, secure, or
            error-free.
          </p>

          <h3 className="mt-4 mb-2 font-semibold text-xl">
            7.2 Educational Content
          </h3>
          <p>
            While we strive to provide accurate sign language demonstrations, we
            do not guarantee the accuracy, completeness, or usefulness of any
            content. Sign language may vary by region and context.
          </p>

          <h3 className="mt-4 mb-2 font-semibold text-xl">
            7.3 No Professional Advice
          </h3>
          <p>
            The Service is for educational purposes only and does not constitute
            professional sign language instruction or certification.
          </p>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-2xl">
            8. Limitation of Liability
          </h2>
          <p>
            To the maximum extent permitted by law, SMOG shall not be liable for
            any indirect, incidental, special, consequential, or punitive
            damages, or any loss of profits or revenues, whether incurred
            directly or indirectly, or any loss of data, use, goodwill, or other
            intangible losses resulting from:
          </p>
          <ul className="ml-6 list-disc space-y-1">
            <li>
              Your access to or use of or inability to access or use the Service
            </li>
            <li>Any conduct or content of any third party on the Service</li>
            <li>Any content obtained from the Service</li>
            <li>
              Unauthorized access, use, or alteration of your transmissions or
              content
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-2xl">9. Indemnification</h2>
          <p>
            You agree to indemnify and hold harmless SMOG, its officers,
            directors, employees, and agents from any claims, damages,
            obligations, losses, liabilities, costs, or debt, and expenses
            arising from: (i) your use of the Service; (ii) your violation of
            these Terms; or (iii) your violation of any third-party rights.
          </p>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-2xl">
            10. Modifications to Service
          </h2>
          <p>
            We reserve the right to modify or discontinue, temporarily or
            permanently, the Service (or any part thereof) with or without
            notice. We shall not be liable to you or any third party for any
            modification, suspension, or discontinuance of the Service.
          </p>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-2xl">11. Changes to Terms</h2>
          <p>
            We reserve the right to update or modify these Terms at any time. We
            will notify you of material changes by:
          </p>
          <ul className="ml-6 list-disc space-y-1">
            <li>Updating the &quot;Last updated&quot; date above</li>
            <li>Displaying an in-app notification</li>
            <li>Requiring acceptance of new terms upon next login</li>
          </ul>
          <p className="mt-2">
            Your continued use of the Service after such changes constitutes
            your acceptance of the new Terms.
          </p>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-2xl">12. Governing Law</h2>
          <p>
            These Terms shall be governed by and construed in accordance with
            the laws of [Your Jurisdiction], without regard to its conflict of
            law provisions. You agree to submit to the personal jurisdiction of
            the courts located in [Your Jurisdiction] for resolution of any
            disputes.
          </p>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-2xl">13. Severability</h2>
          <p>
            If any provision of these Terms is found to be unenforceable or
            invalid, that provision shall be limited or eliminated to the
            minimum extent necessary so that these Terms shall otherwise remain
            in full force and effect.
          </p>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-2xl">14. Entire Agreement</h2>
          <p>
            These Terms, together with the Privacy Policy, constitute the entire
            agreement between you and SMOG regarding the use of the Service and
            supersede all prior agreements and understandings.
          </p>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-2xl">
            15. Contact Information
          </h2>
          <p>
            If you have any questions about these Terms, please contact us at:
          </p>
          <p className="mt-2">
            <strong>Email:</strong> [Your Contact Email]
            <br />
            <strong>Address:</strong> [Your Company Address]
          </p>
        </section>

        <section className="border-gray-300 border-t pt-6">
          <p className="text-gray-600 text-sm">
            By using SMOG, you acknowledge that you have read, understood, and
            agree to be bound by these Terms of Service.
          </p>
        </section>
      </div>
    </div>
  );
}
