import { ArrowLeft } from "lucide-react";
import logo from "@/assets/logo.png";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-base font-bold text-gray-800">{title}</h2>
      <div className="text-sm text-gray-600 leading-relaxed space-y-2">{children}</div>
    </section>
  );
}

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-orange-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-orange-600 via-orange-500 to-amber-500 text-white">
        <div className="max-w-3xl mx-auto px-6 py-8">
          <a href="/portal/restaurant/auth"
            className="inline-flex items-center gap-2 text-white/80 hover:text-white text-sm font-medium mb-5 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back to Registration
          </a>
          <div className="flex items-center gap-3">
            <img src={logo} alt="Bitebend" className="w-32 h-auto object-contain" style={{ filter: "drop-shadow(0 1px 4px rgba(0,0,0,0.45))" }} />
            <div>
              <h1 className="text-2xl font-black tracking-tight">Terms &amp; Conditions</h1>
              <p className="text-white/75 text-xs mt-0.5">Bitebend Restaurant Platform · Effective: January 1, 2025</p>
            </div>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="max-w-3xl mx-auto px-6 py-10 space-y-8">
        <div className="bg-white rounded-2xl border border-orange-100 shadow-sm p-8 space-y-7">

          <Section title="1. Acceptance of Terms">
            <p>
              By registering on Bitebend ("Platform", "we", "us") and using our restaurant management services,
              you ("Restaurant Owner", "you") agree to be bound by these Terms &amp; Conditions. If you do not agree,
              you must not use the Platform.
            </p>
          </Section>

          <Section title="2. Services Provided">
            <p>Bitebend provides a QR-based digital ordering and restaurant management platform, including:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Digital menu creation and management</li>
              <li>QR code generation for table-based ordering</li>
              <li>Live order tracking and dashboard</li>
              <li>Customer analytics and reporting</li>
              <li>Subscription-based customer quota management</li>
            </ul>
          </Section>

          <Section title="3. Account Registration">
            <p>
              You must provide accurate, complete, and current information during registration. You are responsible
              for maintaining the security of your account credentials. Bitebend reserves the right to suspend or
              terminate accounts found to provide false information.
            </p>
          </Section>

          <Section title="4. Subscription Plans &amp; Payments">
            <p>
              Access to certain features requires an active subscription plan. Plans are usage-based, charged per
              customer quota (e.g., ₹199 for 500 customers). Payments are processed via Razorpay or UPI transfer.
              All prices are in Indian Rupees (INR) and are inclusive of applicable taxes.
            </p>
            <p>
              Subscriptions do not auto-renew. Once your customer quota is exhausted, you must recharge to continue
              accepting orders. Refunds are not provided for unused quota.
            </p>
          </Section>

          <Section title="5. Restaurant Responsibilities">
            <p>As a restaurant owner, you agree to:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Maintain accurate and up-to-date menu information including prices and availability</li>
              <li>Fulfil orders placed by customers through the Platform in a timely manner</li>
              <li>Comply with all applicable food safety regulations and local laws</li>
              <li>Not use the Platform for any unlawful purpose</li>
              <li>Not attempt to reverse-engineer, scrape, or misuse Platform systems</li>
            </ul>
          </Section>

          <Section title="6. Intellectual Property">
            <p>
              All content, design, and technology on the Platform belongs to Bitebend. You retain ownership of
              your restaurant's menu data and content but grant Bitebend a licence to display it on the Platform.
            </p>
          </Section>

          <Section title="7. Limitation of Liability">
            <p>
              Bitebend is not liable for any loss of revenue, data, or business opportunity arising from Platform
              downtime, service interruptions, or third-party payment failures. Our total liability to you shall not
              exceed the amount paid by you in the three months preceding the claim.
            </p>
          </Section>

          <Section title="8. Termination">
            <p>
              We reserve the right to suspend or terminate your account if you violate these Terms, engage in
              fraudulent activity, or abuse the Platform. You may delete your account at any time by contacting
              support.
            </p>
          </Section>

          <Section title="9. Modifications">
            <p>
              Bitebend may update these Terms at any time. Continued use of the Platform after changes are posted
              constitutes acceptance of the revised Terms. We will notify registered owners of material changes via
              the in-platform notification system.
            </p>
          </Section>

          <Section title="10. Governing Law">
            <p>
              These Terms are governed by the laws of India. Any disputes shall be subject to the exclusive
              jurisdiction of the courts in Mumbai, Maharashtra, India.
            </p>
          </Section>

          <Section title="11. Contact">
            <p>
              For questions about these Terms, please contact us at{" "}
              <a href="mailto:support@bitebend.in" className="text-orange-600 font-semibold hover:underline">
                support@bitebend.in
              </a>.
            </p>
          </Section>

        </div>

        <p className="text-center text-xs text-gray-400 pb-6">
          © {new Date().getFullYear()} Bitebend. All rights reserved.
        </p>
      </div>
    </div>
  );
}
