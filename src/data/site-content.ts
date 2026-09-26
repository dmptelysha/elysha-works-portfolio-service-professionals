export const SITE_CONTENT = {
  brand: {
    name: "Elysha Works",
    positioning: "Strategy-first websites, funnels, automation, and custom business systems.",
  },
  navigation: [
    { label: "Projects", href: "#projects" },
    { label: "About", href: "#about" },
    { label: "FAQ", href: "#faq" },
  ],
  hero: {
    eyebrow: "For coaches, educators, service businesses & custom order brands",
    headlineLead: "Before investing in a website, funnel, or automation, discover",
    headlineAccent: "exactly what your business needs to grow.",
    support: "In just 2 minutes, you'll receive a personalized roadmap showing the best solution for your goals.",
    trust: "Strategy-first guidance for growing businesses.",
    benefits: ["Personalized recommendations", "Clear next steps", "No sales pressure", "100% Free"],
    primaryCta: "Get My Personalized Roadmap",
  },
  projects: {
    eyebrow: "Selected systems",
    heading: "Thoughtful work. A practical purpose.",
    intro: "Different businesses need different journeys. Each project begins with what the customer needs to do next.",
  },
  founder: {
    eyebrow: "About Elysha",
    heading: "Strategy first. Then the right system.",
    body: "I’m Elysha Dumpit, the founder of Elysha Works. I design websites, funnels, automations, and custom systems around the way a business actually attracts, serves, and supports its customers. My goal is not to add more tools. It is to create a clearer journey—from first inquiry to an organized client experience.",
    portrait: "/assets/v3-hero/elysha-portrait-cutout.png",
    portraitAlt: "Elysha Dumpit, founder of Elysha Works",
  },
  testimonial: {
    eyebrow: "Client perspective",
    quote: "Client testimonial will be added after review and approval.",
    attribution: null as string | null,
  },
  faq: [
    {
      question: "What does Elysha Works build?",
      answer: "Strategy-led websites, funnels, automations, CRM workflows, and custom business systems shaped around the customer journey and the way the business operates.",
    },
    {
      question: "Which businesses do you work with?",
      answer: "The portfolio is focused on coaches, educators, service-based businesses, and custom-order brands.",
    },
    {
      question: "How does the system qualifier work?",
      answer: "You choose your business type and answer eight focused questions. The local Cortex compares your goals, workflow, complexity, and support needs to produce a practical recommendation.",
    },
    {
      question: "Is the recommendation free?",
      answer: "Yes. You can view the complete planning recommendation without sharing personal information or booking a call.",
    },
    {
      question: "Are the displayed prices final?",
      answer: "No. The result is a planning estimate based on your answers. Final scope and pricing are confirmed before any proposal or payment.",
    },
    {
      question: "Can you work with WordPress, Shopify, Systeme.io, or GoHighLevel?",
      answer: "Yes, when the platform fits the required journey. The recommendation favors the simplest suitable route and explains when a different platform or custom build is a better fit.",
    },
    {
      question: "Do you also build custom portals and business systems?",
      answer: "Yes. Custom applications can include secure portals, operational dashboards, workflows, and role-based experiences when platform-native tools are not enough.",
    },
    {
      question: "What happens after I book a strategy call?",
      answer: "We review your goals, qualifier result, current tools, and scope. If the fit is right, the next step is a clearly defined proposal before any implementation begins.",
    },
  ],
  finalCta: {
    eyebrow: "Ready for clarity?",
    heading: "Your next move starts with the right roadmap.",
    body: "Get a personalized recommendation in about two minutes—free, practical, and pressure-free.",
    primaryLabel: "Get My Personalized Roadmap",
    secondaryLabel: "Book a strategy call",
    secondaryHref: "/booking/",
  },
  footer: {
    links: [
      { label: "Projects", href: "#projects" },
      { label: "About", href: "#about" },
      { label: "FAQ", href: "#faq" },
      { label: "Start the Quiz", href: "/quiz" },
    ],
    legal: [
      { label: "Privacy", href: "/elysha-works-privacy-policy/" },
      { label: "Terms", href: "/elysha-works-terms-of-service/" },
    ],
    social: [] as readonly { label: string; href: string }[],
  },
} as const;
