export const CORTEX_VERSION = "business-systems-cortex-2026.09-v2" as const;
export const QUESTION_SET_VERSION = "business-systems-assessment-2026.09-v2" as const;
export const CATALOG_VERSION = "business-systems-catalog-2026.09-v2" as const;
export const ROADMAP_VERSION = "premium-roadmap-2026.09-v1" as const;

export type AudienceKey =
  | "coaches_educators"
  | "service_businesses"
  | "custom_order_businesses";

export type SignalTag =
  | "credibility"
  | "lead_generation"
  | "booking"
  | "enrollment"
  | "checkout"
  | "follow_up"
  | "pipeline"
  | "onboarding"
  | "course_delivery"
  | "disconnected_tools"
  | "multiple_offers"
  | "portal"
  | "dashboard"
  | "custom_orders"
  | "approvals"
  | "inventory"
  | "multiple_roles"
  | "integration"
  | "order_tracking"
  | "migration"
  | "simple_scope"
  | "no_system_effect";

export type ReadinessLevel =
  | "ready_now"
  | "within_30_days"
  | "planning_1_2_months"
  | "researching";

export type PlatformKey = "systeme_io" | "gohighlevel" | "custom_app";
export type BuildRoute = "platform" | "custom";
export type PublicTierKey = "basic" | "advanced" | "complete";

export interface BusinessLocation {
  businessCountry: string;
  countryCode: string;
  displayCurrency: string;
  currencySymbol: string;
  fxRate: number | null;
  fxRateTimestamp: string | null;
}

export interface AssessmentProfile {
  businessModel: string;
  desiredOutcome: string;
  currentJourney: string;
  primaryBottlenecks: readonly string[];
  demandHealth: string;
  customerRequirements: readonly string[];
  postConversionRequirements: readonly string[];
  scopeRequirements: readonly string[];
  timeline: string;
  leadReadiness: ReadinessLevel;
  platformPreference: string;
  requestedAddons: readonly string[];
}
export type RoadmapFeasibility =
  | { available: true }
  | { available: false; reason: string };

export interface RoadmapSelection {
  tierKey: PublicTierKey;
  platform: PlatformKey;
  offerKey: string;
}

export interface LeadContactInput {
  firstName: string;
  lastName: string;
  businessName: string;
  email: string;
  consent: true;
  businessScope?: "same_business" | "another_business";
}

export interface EmailOtpChallenge {
  email: string;
  requestedAt: string;
  resendAvailableAt: string;
}

export type LeadContactSubmissionResult =
  | {
    status: "accepted";
    leadId: string;
    quizSessionId: string;
  }
  | {
    status: "business_scope_required";
    quizSessionId: string;
    existingBusinessName: string;
  };

export interface ClientIdentity {
  firstName: string;
  businessName: string;
}

export interface PointABSummary {
  pointA: { heading: string; summary: string; evidence: readonly string[] };
  pointB: { heading: string; summary: string; evidence: readonly string[] };
}
export type SelectionMode = "single" | "multiple";
export type QuestionScope = "audience" | "universal";
export type SolutionType = "website" | "funnel" | "automation" | "crm" | "custom_app";

export interface QuizOption {
  key: string;
  label: string;
  signals: readonly SignalTag[];
  addonKey?: string;
  readiness?: ReadinessLevel;
  platformPreference?: PlatformKey;
}

export interface QuestionDefinition {
  key: string;
  prompt: string;
  helpText?: string;
  selection: SelectionMode;
  maxSelections?: number;
  scope: QuestionScope;
  required: boolean;
  options: readonly QuizOption[];
}

export interface QuizDefinition {
  audienceKey: AudienceKey;
  label: string;
  description: string;
  resultLabel: string;
  version: typeof CORTEX_VERSION;
  questionSetVersion: typeof QUESTION_SET_VERSION;
  questions: readonly QuestionDefinition[];
}

export type QuizAnswers = Record<string, readonly string[]>;

export interface PackageDefinition {
  offerKey: string;
  name: string;
  buildRoute: BuildRoute;
  supportedPlatforms: readonly PlatformKey[];
  basePriceUsd: number;
  level: number;
  description: string;
  includedCapabilityKeys: readonly string[];
  includedFeatures: readonly string[];
  integrationAllowance: number;
  pageOrScreenLimit: number | null;
  automationLimit: number | null;
  paymentSetupLimit: number | null;
  supportDays: number;
  revisionRounds: number;
  startingPrice?: boolean;
  requiresScopeReview?: boolean;
}

export interface AddonDefinition {
  addonKey: string;
  name: string;
  description: string;
  startingPriceUsd: number;
  pricingUnit: string;
  allowedBuildRoutes: readonly BuildRoute[];
  includedInOfferKeys: readonly string[];
  requiresScopeReview: boolean;
  recurringCostNote?: string;
}

export interface DiagnosticScores {
  acquisitionNeed: number;
  automationNeed: number;
  systemComplexity: number;
}

export interface SolutionScores {
  website: number;
  funnel: number;
  automation: number;
  crm: number;
  customApp: number;
}

export interface PlatformScores {
  systeme: number;
  ghl: number;
  customBuild: number;
}

export interface ExplanationTraceEntry {
  questionKey: string;
  optionKeys: readonly string[];
  signals: readonly SignalTag[];
  before: {
    diagnostic: DiagnosticScores;
    solutions: SolutionScores;
    platforms: PlatformScores;
  };
  after: {
    diagnostic: DiagnosticScores;
    solutions: SolutionScores;
    platforms: PlatformScores;
  };
  flags: readonly string[];
}

export type RecommendationConfidence = "standard" | "low";

export interface DecisionTraceEntry {
  ruleKey: "primary_solution" | "build_route" | "platform" | "base_offer" | "pricing";
  outcome: string;
  reason: string;
}

export interface PricedAddon {
  addonKey: string;
  name: string;
  priceUsd: number;
  startingAt: boolean;
}

export interface ScopeReviewItem {
  key: string;
  label: string;
  startingPriceUsd?: number;
  reason: string;
}

export interface SelectedSupportItem {
  key: string;
  label: string;
  disposition: "included" | "priced" | "scope_review";
}

export interface RoadmapVariant {
  platform: PlatformKey;
  offer: PackageDefinition;
  feasibility: RoadmapFeasibility;
  includedCapabilities: readonly string[];
  selectedSupportItems: readonly SelectedSupportItem[];
  pricedAddons: readonly PricedAddon[];
  scopeReviewItems: readonly ScopeReviewItem[];
  addonTotalUsd: number;
  estimatedProjectInvestmentUsd: number;
  estimatedRecurringCosts: readonly string[];
}

export interface RoadmapTier {
  tierKey: PublicTierKey;
  label: string;
  promise: string;
  recommended: boolean;
  variants: readonly RoadmapVariant[];
}

export interface CortexInput {
  audienceKey: AudienceKey;
  answers: QuizAnswers;
  location?: BusinessLocation;
}

export interface ValidationResult {
  valid: boolean;
  missingQuestionKeys: string[];
}

export interface CortexResult {
  cortexVersion: typeof CORTEX_VERSION;
  questionSetVersion: typeof QUESTION_SET_VERSION;
  catalogVersion: typeof CATALOG_VERSION;
  audienceKey: AudienceKey;
  audienceLabel: string;
  recommendedBuildRoute: BuildRoute;
  recommendedPlatform: PlatformKey;
  recommendedOfferKey: string;
  recommendedOfferName: string;
  recommendedOfferDescription: string;
  recommendedOfferIncludedFeatures: readonly string[];
  primarySolutionType: SolutionType;
  supportingSolutionTypes: readonly SolutionType[];
  recommendedSolutionTitle: string;
  diagnosisSummary: string;
  recommendationReason: string;
  technicalConstraintSignals: readonly SignalTag[];
  selectedSupportOptionKeys: readonly string[];
  includedCapabilities: readonly string[];
  selectedAddons: readonly string[];
  selectedSupportItems: readonly SelectedSupportItem[];
  pricedAddons: readonly PricedAddon[];
  scopeReviewItems: readonly ScopeReviewItem[];
  futurePhaseSuggestions: readonly string[];
  scores: DiagnosticScores & SolutionScores & PlatformScores;
  readinessLevel: ReadinessLevel;
  basePriceUsd: number;
  addonTotalUsd: number;
  adjustmentTotalUsd: 0;
  estimatedProjectInvestmentUsd: number;
  estimatedRecurringCosts: readonly string[];
  explanationTrace: readonly ExplanationTraceEntry[];
  decisionTrace: readonly DecisionTraceEntry[];
  confidenceLevel: RecommendationConfidence;
  confidenceMessage: string;
  roadmapVersion: typeof ROADMAP_VERSION;
  location: BusinessLocation;
  assessmentProfile: AssessmentProfile;
  pointASummary: string;
  problemSummary: string;
  solutionSummary: string;
  pointBSummary: string;
  primaryBottleneck: string;
  secondaryBottleneck: string | null;
  recommendedCustomerJourney: readonly string[];
  recommendedPages: readonly string[];
  recommendedAutomations: readonly string[];
  recommendedPaymentOptions: readonly string[];
  includedPaymentSetupCount: number;
  requiredIntegrations: readonly string[];
  optionalEnhancements: readonly string[];
  clientRequirements: readonly string[];
  thirdPartyCosts: readonly string[];
  platformReasons: readonly string[];
  alternativePlatformReasons: Readonly<Record<PlatformKey, string>>;
  packageReasons: readonly string[];
  displayCurrency: string;
  currencySymbol: string;
  displayPriceLocal: number | null;
  fxRate: number | null;
  fxRateTimestamp: string | null;
  projectDepositLocal: number | null;
  projectBalanceLocal: number | null;
}

export interface ProposalRecommendationView {
  title: string;
  reason: string;
  buildRoute: BuildRoute;
  platform: PlatformKey;
  offerKey: string;
  offerName: string;
  basePriceUsd: number;
  includedFeatures: readonly string[];
  estimatedProjectInvestmentUsd: number;
}

export interface ProposalContentViewModel {
  audienceKey: AudienceKey;
  client: { firstName: string; businessName: string };
  pointA: PointABSummary["pointA"];
  pointB: PointABSummary["pointB"];
  problem: { primary: string; secondary: string | null; summary: string };
  missingSystem: string;
  customerJourney: readonly string[];
  platform: {
    recommended: PlatformKey;
    reasons: readonly string[];
    alternatives: Readonly<Record<PlatformKey, string>>;
  };
  package: { offerName: string; reasons: readonly string[] };
  pages: readonly string[];
  automations: readonly string[];
  payment: { options: readonly string[]; includedSetupCount: number };
  domainAndEmail: {
    domainOwnership: string;
    domainSetup: string;
    businessEmail: string;
  };
  investment: {
    basePriceUsd: number;
    estimatedTotalUsd: number;
    currency: string;
    symbol: string;
    localTotal: number | null;
    fxRate: number | null;
    fxRateTimestamp: string | null;
  };
  includedScope: readonly string[];
  optionalEnhancements: readonly string[];
  ongoingCosts: readonly string[];
  clientRequirements: readonly string[];
  ownership: readonly { item: string; elyshaWorks: string; client: string }[];
  paymentSchedule: {
    depositPercent: 50;
    balancePercent: 50;
    depositAmount: number | null;
    balanceAmount: number | null;
  };
  pathToPointB: { today: string; withSystem: string; target: string };
  disclaimer: string;
  recommendation: ProposalRecommendationView;
  selection: RoadmapSelection;
  tiers: readonly RoadmapTier[];
}

export interface ProposalDraftViewModel extends ProposalContentViewModel {
  expiresAt: null;
}

export interface ProposalViewModel extends ProposalContentViewModel {
  expiresAt: string;
}

export type QuizStatus = "in_progress" | "completed";

export interface SavedQuizAttempt {
    storageVersion: 4;
  cortexVersion: typeof CORTEX_VERSION;
  questionSetVersion: typeof QUESTION_SET_VERSION;
  catalogVersion: typeof CATALOG_VERSION;
  status: QuizStatus;
  audienceKey: AudienceKey | null;
  answers: QuizAnswers;
  currentQuestionIndex: number;
  result: CortexResult | null;
    roadmapSelection: RoadmapSelection | null;
    location: BusinessLocation | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
}
