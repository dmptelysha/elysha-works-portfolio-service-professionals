export * from "../../../supabase/functions/_shared/quiz-engine/types.ts";

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
