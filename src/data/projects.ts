import type { AudienceKey } from "@/features/quiz/types";

export interface PortfolioProject {
  slug: string;
  title: string;
  clientDisplayName: string;
  kind: string;
  status: "concept" | "beta" | "live";
  featured: boolean;
  summary: string;
  problem: string;
  solution: string;
  outcome: string;
  audienceKeys: readonly AudienceKey[];
  serviceKeys: readonly string[];
  platformKeys: readonly string[];
  coverImage: string;
  previewUrl: string;
}

export const PROJECTS: readonly PortfolioProject[] = [
  {
    slug: "teacher-elysha",
    title: "Teacher Elysha",
    clientDisplayName: "Teacher Elysha",
    kind: "Case study",
    status: "concept",
    featured: true,
    summary: "A clear introduction to the tutor, the lessons, and the next step for interested learners.",
    problem: "Parents and learners need a simple way to understand the tutor and available lessons.",
    solution: "A focused tutor website that organizes the offer and gives each visitor a clear next step.",
    outcome: "A more considered discovery journey for parents and interested learners.",
    audienceKeys: ["coaches_educators"],
    serviceKeys: ["website", "lead_generation"],
    platformKeys: ["custom_build"],
    coverImage: "/assets/project-previews/esl-tutor/protected-desktop.jpg",
    previewUrl: "/assets/project-previews/esl-tutor/index.html",
  },
  {
    slug: "la-jaysiedel-cakes",
    title: "La Jaysiedel Cakes",
    clientDisplayName: "La Jaysiedel Cakes",
    kind: "Paid client project",
    status: "live",
    featured: true,
    summary: "A shopping journey that helps customers browse cakes, understand their options, and choose what they need.",
    problem: "Custom cake customers need clarity before they can confidently choose what to order.",
    solution: "A structured product journey that presents cakes and ordering options in a clearer sequence.",
    outcome: "A clearer path from browsing to an informed order choice.",
    audienceKeys: ["custom_order_businesses"],
    serviceKeys: ["website", "custom_orders"],
    platformKeys: ["custom_build"],
    coverImage: "/assets/project-previews/la-jaysiedel-cakes/protected-desktop.jpg",
    previewUrl: "/assets/project-previews/la-jaysiedel-cakes/index.html",
  },
  {
    slug: "client-portal",
    title: "Elysha Works Client Portal",
    clientDisplayName: "Elysha Works",
    kind: "Internal custom application",
    status: "beta",
    featured: false,
    summary: "A dedicated space for the client journey, project steps, and information in one place.",
    problem: "Project information and next steps become harder to follow when they are spread across conversations.",
    solution: "A custom portal that brings the client journey, stages, and project information together.",
    outcome: "A more organized client experience with one place for relevant information and next steps.",
    audienceKeys: ["coaches_educators", "service_businesses", "custom_order_businesses"],
    serviceKeys: ["portal", "onboarding"],
    platformKeys: ["custom_app", "supabase"],
    coverImage: "/assets/project-previews/client-portal/protected-desktop.jpg",
    previewUrl: "/assets/project-previews/client-portal/index.html",
  },
  {
    slug: "growth-crm",
    title: "Elysha Works Growth CRM",
    clientDisplayName: "Elysha Works",
    kind: "Internal custom application",
    status: "beta",
    featured: false,
    summary: "A workspace for organizing leads, conversations, and the next steps in a growing business.",
    problem: "Enquiries and follow-up become difficult to manage when context is scattered.",
    solution: "A focused CRM workspace for leads, conversations, stages, and next actions.",
    outcome: "A clearer internal view of enquiries and the follow-up each one needs.",
    audienceKeys: ["coaches_educators", "service_businesses", "custom_order_businesses"],
    serviceKeys: ["crm", "automation"],
    platformKeys: ["custom_app", "supabase"],
    coverImage: "/assets/project-previews/growth-crm/protected-desktop.jpg",
    previewUrl: "/assets/project-previews/growth-crm/index.html",
  },
] as const;

export const PROJECT_PREVIEW_ALLOWLIST = new Set(PROJECTS.map((project) => project.previewUrl));
