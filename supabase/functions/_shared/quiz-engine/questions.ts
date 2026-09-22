import {
  CORTEX_VERSION,
  QUESTION_SET_VERSION,
  type AudienceKey,
  type QuestionDefinition,
  type QuizDefinition,
  type QuizOption,
  type SignalTag,
} from "./types.ts";

export const APPROVED_SIGNAL_TAGS = [
  "credibility",
  "lead_generation",
  "booking",
  "enrollment",
  "checkout",
  "follow_up",
  "pipeline",
  "onboarding",
  "course_delivery",
  "disconnected_tools",
  "multiple_offers",
  "portal",
  "dashboard",
  "custom_orders",
  "approvals",
  "inventory",
  "multiple_roles",
  "integration",
  "order_tracking",
  "migration",
  "simple_scope",
  "no_system_effect",
] as const satisfies readonly SignalTag[];

const option = (
  key: string,
  label: string,
  signals: readonly SignalTag[],
  extra: Omit<QuizOption, "key" | "label" | "signals"> = {},
): QuizOption => ({ key, label, signals, ...extra });

const question = (
  key: string,
  prompt: string,
  options: readonly QuizOption[],
  selection: "single" | "multiple" = "single",
  scope: "audience" | "universal" = "audience",
  helpText?: string,
): QuestionDefinition => ({
  key,
  prompt,
  options,
  selection,
  scope,
  helpText,
  required: true,
});

const readinessQuestion = question(
  "q6_readiness",
  "When do you want to begin?",
  [
    option("readiness_ready_now", "Ready now.", [], { readiness: "ready_now" }),
    option("readiness_within_30_days", "Within 30 days.", [], {
      readiness: "within_30_days",
    }),
    option("readiness_within_1_2_months", "Within 1–2 months.", [], {
      readiness: "planning_1_2_months",
    }),
    option("readiness_researching", "Researching for later.", [], {
      readiness: "researching",
    }),
  ],
  "single",
  "universal",
);

const platformQuestion = question(
  "q7_platform",
  "Do you already have a preferred platform?",
  [
    option("platform_systeme", "Systeme.io.", [], { platformPreference: "systeme_io" }),
    option("platform_gohighlevel", "GoHighLevel.", [], {
      platformPreference: "gohighlevel",
    }),
    option("platform_custom_app", "I want a custom-built app.", [], {
      platformPreference: "custom_app",
    }),
    option("platform_recommend", "I am not sure—recommend the best fit for me.", []),
  ],
  "single",
  "universal",
);

const supportQuestion = question(
  "q8_support",
  "What additional support do you need for this project?",
  [
    option("support_conversion_copywriting", "Conversion copywriting.", ["no_system_effect"], {
      addonKey: "conversion_copywriting",
    }),
    option("support_image_sourcing", "Image sourcing and selection.", ["no_system_effect"], {
      addonKey: "image_sourcing_selection",
    }),
    option("support_image_editing", "Image editing and optimization.", ["no_system_effect"], {
      addonKey: "image_editing_optimization",
    }),
    option("support_brand_direction", "Brand styling or mini visual direction.", ["no_system_effect"], {
      addonKey: "mini_brand_direction",
    }),
    option("support_additional_pages", "Additional pages or funnel steps.", ["credibility"], {
      addonKey: "additional_page_step",
    }),
    option("support_booking", "Appointment booking setup.", ["booking"], {
      addonKey: "advanced_booking_setup",
    }),
    option("support_checkout", "Checkout or payment integration.", ["checkout"], {
      addonKey: "checkout_payment_integration",
    }),
    option("support_follow_up", "Email or SMS follow-up automation.", ["follow_up"], {
      addonKey: "additional_email_automation",
    }),
    option("support_crm", "CRM or pipeline setup.", ["pipeline"], {
      addonKey: "additional_crm_pipeline",
    }),
    option("support_onboarding", "Client/student onboarding.", ["onboarding"], {
      addonKey: "advanced_onboarding_workflow",
    }),
    option("support_portal", "Client/student portal.", ["portal"]),
    option("support_order_management", "Order-management workflow.", ["custom_orders", "order_tracking"], {
      addonKey: "custom_order_management_module",
    }),
    option("support_dashboard", "Dashboard or reporting.", ["dashboard"], {
      addonKey: "custom_dashboard_reporting_module",
    }),
    option("support_inventory", "Inventory or production tracking.", ["inventory"], {
      addonKey: "inventory_production_module",
    }),
    option("support_integration", "Third-party integration.", ["integration"], {
      addonKey: "standard_third_party_integration",
    }),
    option("support_migration", "Data/content migration.", ["migration"], {
      addonKey: "content_data_migration",
    }),
    option(
      "support_client_assets",
      "I will provide final copy, images, and brand assets.",
      ["no_system_effect"],
    ),
  ],
  "multiple",
  "universal",
  "Select all that apply.",
);

const universalQuestions = [readinessQuestion, platformQuestion, supportQuestion] as const;

const coachesQuestions = [
  question("q1_goal", "What result matters most right now?", [
    option("coach_goal_book_calls", "Book more discovery or coaching calls.", ["booking", "lead_generation"]),
    option("coach_goal_enroll_students", "Enroll more students in a course or program.", ["enrollment", "lead_generation"]),
    option("coach_goal_sell_digital_offer", "Sell a workshop, membership, or digital offer.", ["enrollment", "checkout"]),
    option("coach_goal_organized_material_access", "Give learners an organized place to access materials.", ["course_delivery", "onboarding"]),
  ]),
  question("q2_setup", "How do people currently discover and join your offer?", [
    option("coach_setup_social_dm", "Mostly through social media and direct messages.", ["lead_generation"]),
    option("coach_setup_unclear_website", "Through a website, but the path is unclear.", ["credibility", "lead_generation"]),
    option("coach_setup_funnel_needs_improvement", "Through a landing page or funnel that needs improvement.", ["lead_generation", "follow_up"]),
    option("coach_setup_disconnected_tools", "I have multiple tools, but they are disconnected.", ["disconnected_tools"]),
  ]),
  question("q3_blocker", "Where does the journey usually get stuck?", [
    option("coach_blocker_few_qualified_inquiries", "Not enough qualified inquiries.", ["lead_generation"]),
    option("coach_blocker_questions_no_booking", "People ask questions but do not book or enroll.", ["booking", "lead_generation"]),
    option("coach_blocker_manual_follow_up", "Follow-up is inconsistent or manual.", ["follow_up"]),
    option("coach_blocker_disorganized_onboarding", "Onboarding and content access are disorganized.", ["onboarding", "course_delivery"]),
  ]),
  question("q4_capabilities", "What should the new system handle?", [
    option("coach_capability_offer_page", "Offer or program page.", ["credibility"]),
    option("coach_capability_lead_capture", "Lead capture.", ["lead_generation"]),
    option("coach_capability_booking", "Discovery-call booking.", ["booking"]),
    option("coach_capability_enrollment_payment", "Enrollment and payment.", ["enrollment", "checkout"]),
    option("coach_capability_email_follow_up", "Email follow-up.", ["follow_up"]),
    option("coach_capability_student_onboarding", "Student onboarding or portal.", ["onboarding", "course_delivery"]),
    option("coach_capability_progress_resources", "Progress or resource access.", ["course_delivery"]),
  ], "multiple", "audience", "Select all that apply."),
  question("q5_complexity", "How complex is your offer setup?", [
    option("coach_complexity_one_offer", "One offer and one clear action.", ["simple_scope"]),
    option("coach_complexity_multiple_offers", "Multiple offers or audience segments.", ["multiple_offers"]),
    option("coach_complexity_program_delivery", "A program with enrollment, onboarding, and content access.", ["enrollment", "onboarding", "course_delivery"]),
    option("coach_complexity_custom_experience", "A custom learning or client experience with integrations.", ["portal", "integration"]),
  ]),
  ...universalQuestions,
] as const;

const serviceQuestions = [
  question("q1_goal", "What result matters most right now?", [
    option("service_goal_qualified_inquiries", "Receive more qualified inquiries.", ["lead_generation"]),
    option("service_goal_book_appointments", "Book more appointments or consultations.", ["booking", "lead_generation"]),
    option("service_goal_reduce_no_shows", "Reduce no-shows and repetitive follow-up.", ["follow_up", "booking"]),
    option("service_goal_organize_delivery", "Organize client intake and service delivery.", ["onboarding", "pipeline", "dashboard"]),
  ]),
  question("q2_setup", "How do clients currently contact or book you?", [
    option("service_setup_social_calls_dm", "Social media, calls, or direct messages.", ["lead_generation"]),
    option("service_setup_basic_website_manual", "A basic website and manual follow-up.", ["credibility", "follow_up"]),
    option("service_setup_disconnected_booking", "A booking tool that is not connected to the rest of the workflow.", ["booking", "disconnected_tools"]),
    option("service_setup_tools_spreadsheets", "Several tools and spreadsheets that do not work together.", ["disconnected_tools", "pipeline"]),
  ]),
  question("q3_blocker", "Where does the process usually break down?", [
    option("service_blocker_unclear_offer", "Visitors do not understand the offer.", ["credibility", "lead_generation"]),
    option("service_blocker_inquiries_no_booking", "Inquiries do not consistently become bookings.", ["booking", "lead_generation"]),
    option("service_blocker_manual_intake_follow_up", "Intake, reminders, and follow-up take too much time.", ["follow_up", "onboarding"]),
    option("service_blocker_tracking_status", "Client information and project status are difficult to track.", ["pipeline", "dashboard"]),
  ]),
  question("q4_capabilities", "What should the new system handle?", [
    option("service_capability_website", "Professional service website.", ["credibility"]),
    option("service_capability_qualification", "Lead qualification form.", ["lead_generation", "pipeline"]),
    option("service_capability_booking", "Appointment booking.", ["booking"]),
    option("service_capability_reminders", "Automated reminders and follow-up.", ["follow_up"]),
    option("service_capability_onboarding", "Client intake and onboarding.", ["onboarding"]),
    option("service_capability_crm", "CRM pipeline.", ["pipeline"]),
    option("service_capability_portal_dashboard", "Client portal or dashboard.", ["portal", "dashboard"]),
  ], "multiple", "audience", "Select all that apply."),
  question("q5_complexity", "How complex is your service workflow?", [
    option("service_complexity_one_service", "One service and a simple booking flow.", ["simple_scope", "booking"]),
    option("service_complexity_multiple_services", "Several services, locations, or team members.", ["multiple_offers", "pipeline"]),
    option("service_complexity_multistep_approval", "Multi-step intake, approval, or onboarding.", ["onboarding", "approvals"]),
    option("service_complexity_custom_operations", "Custom operations, permissions, or integrations.", ["multiple_roles", "integration"]),
  ]),
  ...universalQuestions,
] as const;

const customOrderQuestions = [
  question("q1_goal", "What result matters most right now?", [
    option("order_goal_more_orders", "Receive more custom orders.", ["lead_generation", "custom_orders"]),
    option("order_goal_easier_ordering", "Make ordering easier for customers.", ["custom_orders", "checkout"]),
    option("order_goal_reduce_questions_errors", "Reduce repetitive questions and order mistakes.", ["follow_up", "custom_orders"]),
    option("order_goal_organize_operations", "Organize orders, payments, and customer updates.", ["pipeline", "order_tracking"]),
  ]),
  question("q2_setup", "How do customers currently place orders?", [
    option("order_setup_social_messaging", "Mostly through social media or messaging.", ["lead_generation"]),
    option("order_setup_form_manual_confirmation", "Through a form, but confirmation is manual.", ["custom_orders", "follow_up"]),
    option("order_setup_store_limited", "Through an online store that does not support the full custom-order process.", ["checkout", "custom_orders"]),
    option("order_setup_disconnected_tools", "Through several disconnected tools or spreadsheets.", ["disconnected_tools", "order_tracking"]),
  ]),
  question("q3_blocker", "Where does the process usually get stuck?", [
    option("order_blocker_options_unclear", "Customers do not know what options to choose.", ["credibility", "custom_orders"]),
    option("order_blocker_quotes_payments_slow", "Quotes, deposits, and payment confirmation take too long.", ["checkout", "follow_up"]),
    option("order_blocker_details_scattered", "Order details are incomplete or scattered across messages.", ["pipeline", "custom_orders"]),
    option("order_blocker_production_updates", "Production status, delivery, and customer updates are difficult to track.", ["order_tracking", "follow_up"]),
  ]),
  question("q4_capabilities", "What should the new system handle?", [
    option("order_capability_catalog", "Product or service catalog.", ["credibility"]),
    option("order_capability_customization", "Customization options.", ["custom_orders"]),
    option("order_capability_request", "Quote or order request.", ["lead_generation", "custom_orders"]),
    option("order_capability_checkout", "Checkout, deposit, or payment instructions.", ["checkout"]),
    option("order_capability_updates", "Automated confirmation and updates.", ["follow_up", "order_tracking"]),
    option("order_capability_dashboard", "Order-management dashboard.", ["dashboard", "order_tracking"]),
    option("order_capability_crm", "Customer history or CRM.", ["pipeline"]),
    option("order_capability_inventory", "Inventory or production tracking.", ["inventory"]),
  ], "multiple", "audience", "Select all that apply."),
  question("q5_complexity", "How complex is your order workflow?", [
    option("order_complexity_simple_options", "A few products and simple options.", ["simple_scope", "custom_orders"]),
    option("order_complexity_many_combinations", "Many options, add-ons, or pricing combinations.", ["custom_orders"]),
    option("order_complexity_production_stages", "Deposits, approvals, production stages, and delivery coordination.", ["approvals", "order_tracking"]),
    option("order_complexity_roles_inventory", "Custom operations, staff roles, inventory, or integrations.", ["multiple_roles", "inventory", "integration"]),
  ]),
  ...universalQuestions,
] as const;

const definition = (
  audienceKey: AudienceKey,
  label: string,
  description: string,
  resultLabel: string,
  questions: readonly QuestionDefinition[],
): QuizDefinition => ({
  audienceKey,
  label,
  description,
  resultLabel,
  version: CORTEX_VERSION,
  questionSetVersion: QUESTION_SET_VERSION,
  questions,
});

export const QUIZ_DEFINITIONS: Record<AudienceKey, QuizDefinition> = {
  coaches_educators: definition(
    "coaches_educators",
    "Coaches & Educators",
    "Sell expertise, enroll students, and deliver a smoother learning journey.",
    "Book and Enroll",
    coachesQuestions,
  ),
  service_businesses: definition(
    "service_businesses",
    "Service-Based Businesses",
    "Turn inquiries into appointments and reduce repetitive admin work.",
    "Attract and Book",
    serviceQuestions,
  ),
  custom_order_businesses: definition(
    "custom_order_businesses",
    "Custom-Order Businesses",
    "Simplify custom orders, payments, updates, and customer tracking.",
    "Order and Organize",
    customOrderQuestions,
  ),
};

export function getQuestionDefinition(audienceKey: AudienceKey, questionKey: string) {
  return QUIZ_DEFINITIONS[audienceKey].questions.find((item) => item.key === questionKey);
}
