import { ChefHat, ArrowLeft } from "lucide-react";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-base font-bold text-gray-800">{title}</h2>
      <div className="text-sm text-gray-600 leading-relaxed space-y-2">{children}</div>
    </section>
  );
}

export default function PrivacyPolicyPage() {
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
            <div className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center border border-white/30">
              <ChefHat className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight">Privacy Policy</h1>
              <p className="text-white/75 text-xs mt-0.5">Bitebend Restaurant Platform · Effective: January 1, 2025</p>
            </div>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="max-w-3xl mx-auto px-6 py-10 space-y-8">
        <div className="bg-white rounded-2xl border border-orange-100 shadow-sm p-8 space-y-7">

          <Section title="1. Introduction">
            <p>
              Bitebend ("we", "us", "Platform") is committed to protecting your privacy. This Privacy Policy
              explains how we collect, use, store, and share information when you use our restaurant management
              platform. By registering, you consent to the practices described here.
            </p>
          </Section>

          <Section title="2. Information We Collect">
            <p>We collect the following categories of information:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Account information</strong> — name, email address, phone number, and password (stored as a secure hash)</li>
              <li><strong>Restaurant information</strong> — restaurant name, address, city, state, cuisine type, and UPI/payment details</li>
              <li><strong>Menu &amp; order data</strong> — categories, items, prices, and customer orders placed through your QR menu</li>
              <li><strong>Payment records</strong> — transaction IDs, payment method, and subscription history (we do not store full card numbers)</li>
              <li><strong>Usage data</strong> — platform activity logs, device information, and IP addresses for security and analytics</li>
            </ul>
          </Section>

          <Section title="3. How We Use Your Information">
            <p>We use the information we collect to:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Provide, operate, and improve the Platform</li>
              <li>Process payments and manage subscription plans</li>
              <li>Send important account notifications and platform updates</li>
              <li>Provide customer support and resolve disputes</li>
              <li>Detect and prevent fraudulent or illegal activity</li>
              <li>Comply with legal and regulatory obligations under Indian law</li>
            </ul>
          </Section>

          <Section title="4. Information Sharing">
            <p>We do not sell your personal information. We may share data with:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Payment processors</strong> (Razorpay) — to process subscription payments securely</li>
              <li><strong>Service providers</strong> — cloud hosting and infrastructure partners who process data on our behalf under strict confidentiality agreements</li>
              <li><strong>Law enforcement</strong> — when required by law, court order, or regulatory authority in India</li>
            </ul>
          </Section>

          <Section title="5. Data Retention">
            <p>
              We retain your account and restaurant data for as long as your account is active or as needed to
              provide services. If you delete your account, we will remove your personal data within 30 days,
              except where retention is required by law (e.g., payment and tax records may be retained for 7 years
              as required by Indian financial regulations).
            </p>
          </Section>

          <Section title="6. Data Security">
            <p>
              We implement industry-standard security measures including encrypted connections (HTTPS/TLS),
              bcrypt password hashing, and session-based authentication. However, no system is completely secure.
              You are responsible for maintaining the confidentiality of your account credentials.
            </p>
          </Section>

          <Section title="7. Your Rights">
            <p>Under applicable Indian law, you have the right to:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Access the personal data we hold about you</li>
              <li>Request correction of inaccurate data</li>
              <li>Request deletion of your account and associated data</li>
              <li>Object to processing of your data for marketing purposes</li>
            </ul>
            <p>To exercise these rights, contact us at support@bitebend.in.</p>
          </Section>

          <Section title="8. Cookies &amp; Tracking">
            <p>
              We use session cookies to maintain your login state. We do not use third-party advertising cookies.
              You can disable cookies in your browser, but this may affect your ability to use the Platform.
            </p>
          </Section>

          <Section title="9. Children's Privacy">
            <p>
              The Platform is intended for use by restaurant owners and is not directed at children under 18 years
              of age. We do not knowingly collect data from minors.
            </p>
          </Section>

          <Section title="10. Changes to This Policy">
            <p>
              We may update this Privacy Policy from time to time. We will notify you of significant changes via
              the in-platform notification system. Continued use after changes are posted constitutes acceptance.
            </p>
          </Section>

          <Section title="11. Governing Law">
            <p>
              This Privacy Policy is governed by the Information Technology Act, 2000 and the Information
              Technology (Reasonable Security Practices and Procedures and Sensitive Personal Data or Information)
              Rules, 2011, and other applicable laws of India.
            </p>
          </Section>

          <Section title="12. Contact Us">
            <p>
              For any privacy-related queries, please contact our Data Officer at{" "}
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
