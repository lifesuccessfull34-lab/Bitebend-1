export type ResourceType = "video" | "pdf" | "plan" | "link" | "faq";

export interface VideoResource {
  id: number;
  type: "video";
  title: string;
  description: string;
  url: string;
  thumbnailUrl?: string;
  duration?: string;
  source: "youtube" | "external" | "self-hosted";
}

export interface PdfResource {
  id: number;
  type: "pdf";
  title: string;
  description: string;
  url: string;
  sizeLabel?: string;
}

export interface PlanResource {
  id: number;
  type: "plan";
  name: string;
  price: string;
  period?: string;
  description: string;
  features: string[];
  cta: "trial" | "contact";
  highlight?: boolean;
  badge?: string;
}

export interface LinkResource {
  id: number;
  type: "link";
  title: string;
  description: string;
  url: string;
  iconName: string;
  color: string;
}

export interface FaqResource {
  id: number;
  type: "faq";
  question: string;
  answer: string;
  category?: string;
}

export type AnyResource =
  | VideoResource
  | PdfResource
  | PlanResource
  | LinkResource
  | FaqResource;

export const VIDEOS: VideoResource[] = [
  {
    id: 1,
    type: "video",
    title: "QR Ordering Demo",
    description: "See how customers scan a QR code and place orders directly from their table — no app required.",
    url: "https://www.youtube.com/embed/dQw4w9WgXcQ",
    duration: "3:24",
    source: "youtube",
  },
  {
    id: 2,
    type: "video",
    title: "Restaurant Dashboard Tutorial",
    description: "A complete walkthrough of the owner dashboard — managing orders, tables, and live updates.",
    url: "https://www.youtube.com/embed/dQw4w9WgXcQ",
    duration: "7:15",
    source: "youtube",
  },
  {
    id: 3,
    type: "video",
    title: "Customer Ordering Flow",
    description: "End-to-end customer experience from scanning the QR to receiving order confirmation.",
    url: "https://www.youtube.com/embed/dQw4w9WgXcQ",
    duration: "2:48",
    source: "youtube",
  },
  {
    id: 4,
    type: "video",
    title: "Payment Setup Guide",
    description: "Configure UPI and Razorpay payments, test transactions, and go live with payments.",
    url: "https://www.youtube.com/embed/dQw4w9WgXcQ",
    duration: "5:01",
    source: "youtube",
  },
  {
    id: 5,
    type: "video",
    title: "Bitebend Full Product Walkthrough",
    description: "A comprehensive demo covering every feature — menu, tables, orders, payments, and admin panel.",
    url: "https://www.youtube.com/embed/dQw4w9WgXcQ",
    duration: "14:32",
    source: "youtube",
  },
];

export const PDFS: PdfResource[] = [
  {
    id: 1,
    type: "pdf",
    title: "Restaurant Setup Guide",
    description: "Step-by-step instructions for configuring your restaurant, menu, and tables.",
    url: "/docs/setup-guide.pdf",
    sizeLabel: "2.4 MB",
  },
  {
    id: 2,
    type: "pdf",
    title: "Bitebend Product Brochure",
    description: "Share this one-pager with your team. Covers all features and benefits at a glance.",
    url: "/docs/brochure.pdf",
    sizeLabel: "1.1 MB",
  },
  {
    id: 3,
    type: "pdf",
    title: "QR Setup Manual",
    description: "How to generate, print, and place QR codes on tables for customers to scan.",
    url: "/docs/qr-setup.pdf",
    sizeLabel: "0.8 MB",
  },
  {
    id: 4,
    type: "pdf",
    title: "Pricing Details",
    description: "Full breakdown of subscription plans, customer quotas, and add-on options.",
    url: "/docs/pricing.pdf",
    sizeLabel: "0.5 MB",
  },
  {
    id: 5,
    type: "pdf",
    title: "Terms & Policies",
    description: "Platform terms of service, privacy policy, and refund policy in one document.",
    url: "/docs/terms-policies.pdf",
    sizeLabel: "1.8 MB",
  },
];

export const PLANS: PlanResource[] = [
  {
    id: 1,
    type: "plan",
    name: "Starter",
    price: "₹199",
    period: "per 500 customers",
    description: "Perfect for new restaurants just getting started with digital ordering.",
    features: [
      "Up to 500 unique customers",
      "QR table ordering",
      "Basic menu management",
      "UPI & cash payments",
      "WhatsApp bill sharing",
    ],
    cta: "trial",
  },
  {
    id: 2,
    type: "plan",
    name: "Growth",
    price: "₹499",
    period: "per 2,000 customers",
    description: "Great for growing restaurants that need more capacity and analytics.",
    features: [
      "Up to 2,000 unique customers",
      "Everything in Starter",
      "Customer analytics",
      "Razorpay integration",
      "Priority support",
    ],
    cta: "trial",
    highlight: true,
    badge: "Most Popular",
  },
  {
    id: 3,
    type: "plan",
    name: "Unlimited",
    price: "₹1,999",
    period: "unlimited customers",
    description: "For high-volume restaurants that need no limits and full platform access.",
    features: [
      "Unlimited unique customers",
      "Everything in Growth",
      "Admin panel access",
      "Dedicated onboarding",
      "Custom integrations",
    ],
    cta: "contact",
    badge: "Best Value",
  },
];

export const LINKS: LinkResource[] = [
  {
    id: 1,
    type: "link",
    title: "Book a Demo",
    description: "Schedule a free 30-minute walkthrough with our team.",
    url: "https://calendly.com/bitebend",
    iconName: "calendar",
    color: "bg-blue-50 text-blue-600 border-blue-200",
  },
  {
    id: 2,
    type: "link",
    title: "WhatsApp Support",
    description: "Chat with our support team directly on WhatsApp — typically responds in under 1 hour.",
    url: "https://wa.me/919999999999?text=Hi%20Bitebend%20Support",
    iconName: "message-circle",
    color: "bg-green-50 text-green-600 border-green-200",
  },
  {
    id: 3,
    type: "link",
    title: "FAQ",
    description: "Answers to the most common questions from restaurant owners.",
    url: "#faq",
    iconName: "help-circle",
    color: "bg-amber-50 text-amber-600 border-amber-200",
  },
  {
    id: 4,
    type: "link",
    title: "Website",
    description: "Visit the official Bitebend website to learn more about our platform.",
    url: "https://bitebend.in",
    iconName: "globe",
    color: "bg-orange-50 text-orange-600 border-orange-200",
  },
  {
    id: 5,
    type: "link",
    title: "YouTube Channel",
    description: "Watch tutorials, demos, and tips for getting the most out of Bitebend.",
    url: "https://youtube.com/@bitebend",
    iconName: "play-circle",
    color: "bg-red-50 text-red-600 border-red-200",
  },
  {
    id: 6,
    type: "link",
    title: "Contact Us",
    description: "Reach out by email for billing, partnerships, or technical queries.",
    url: "mailto:support@bitebend.in",
    iconName: "mail",
    color: "bg-purple-50 text-purple-600 border-purple-200",
  },
];

export const FAQS: FaqResource[] = [
  {
    id: 1,
    type: "faq",
    question: "How does QR ordering work?",
    answer:
      "Each table gets a unique QR code generated by Bitebend. When a customer scans it with their phone camera, they're taken directly to your digital menu. They can browse, add items to cart, and place an order — all without downloading any app. The order appears instantly on your dashboard.",
    category: "Ordering",
  },
  {
    id: 2,
    type: "faq",
    question: "How are payments settled?",
    answer:
      "Bitebend supports three payment methods: Cash (customer pays at the counter), Personal UPI (customer pays directly to your UPI ID and you verify the UTR reference number), and Razorpay (online card/UPI payments processed automatically). For Razorpay, settlements go directly to your linked bank account as per Razorpay's settlement schedule.",
    category: "Payments",
  },
  {
    id: 3,
    type: "faq",
    question: "How long does onboarding take?",
    answer:
      "Most restaurants are fully live within 30–60 minutes. You'll need to: create your account, add your menu categories and items, set up your tables and generate QR codes, configure your payment method, and print the QR codes. Our setup guide walks you through every step.",
    category: "Setup",
  },
  {
    id: 4,
    type: "faq",
    question: "Can customers pay inside Bitebend?",
    answer:
      "Yes. Customers can pay via UPI (using any UPI app — GPay, PhonePe, Paytm, etc.) directly from the ordering page if you have Personal UPI or Razorpay enabled. Cash payment is always available as a fallback — the customer pays at the counter and you mark the order as paid on the dashboard.",
    category: "Payments",
  },
  {
    id: 5,
    type: "faq",
    question: "Is UPI supported?",
    answer:
      "Yes. Bitebend supports two UPI flows. Personal UPI lets customers pay directly to your restaurant's UPI ID — the app generates a UPI deep link and QR code so GPay, PhonePe, or Paytm open automatically with the amount prefilled. The customer shares their UTR reference and you verify it from the dashboard. Razorpay integration handles automated UPI collection with instant verification.",
    category: "Payments",
  },
];
