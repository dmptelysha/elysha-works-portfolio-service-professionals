export * from "../../../supabase/functions/_shared/quiz-engine/types.ts";

import type { LeadContactInput } from "../../../supabase/functions/_shared/quiz-engine/types.ts";

export type LeadIdentityInput = Omit<LeadContactInput, "consent"> & { consent: boolean };

export interface CustomEmailOtpChallenge {
  id: string;
  email: string;
  expiresAt: string;
  resendAvailableAt: string;
  verified: boolean;
  grantExpiresAt: string | null;
}

export interface CustomEmailOtpVerification {
  verified: true;
  grantExpiresAt: string;
}
