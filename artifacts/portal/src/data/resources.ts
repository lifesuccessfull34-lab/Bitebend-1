// Type definitions for resource cards rendered by the Resources Center.
// All runtime data is now fetched from the API (GET /api/resources).
// Do NOT add mock data back to this file.

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

