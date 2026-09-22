import { createClient } from "@supabase/supabase-js";

import { getSupabaseEnv } from "./env.ts";

const authOptions = {
  persistSession: false,
  autoRefreshToken: false,
  detectSessionInUrl: false,
} as const;

export function createServiceClient() {
  const environment = getSupabaseEnv();
  return createClient(environment.url, environment.serviceRoleKey, {
    auth: authOptions,
  });
}

export function createRequestClient(request: Request) {
  const environment = getSupabaseEnv();
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    throw new Error("authentication required");
  }
  return createClient(environment.url, environment.publishableKey, {
    auth: authOptions,
    global: { headers: { Authorization: authorization } },
  });
}
