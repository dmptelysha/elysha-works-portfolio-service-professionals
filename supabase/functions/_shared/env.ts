/// <reference lib="deno.ns" />

type EnvGetter = (name: string) => string | undefined;

function required(get: EnvGetter, name: string, minimumLength = 1): string {
  const value = get(name)?.trim();
  if (!value || value.length < minimumLength) {
    throw new Error(`Missing required configuration: ${name}`);
  }
  return value;
}

export function getSupabaseEnv(get: EnvGetter = Deno.env.get) {
  return {
    url: required(get, "SUPABASE_URL"),
    publishableKey: required(get, "SUPABASE_ANON_KEY"),
    serviceRoleKey: required(get, "SUPABASE_SERVICE_ROLE_KEY"),
  };
}

export function getProposalEnv(get: EnvGetter = Deno.env.get) {
  const publicBaseUrl = required(get, "PUBLIC_PROPOSAL_BASE_URL");
  const parsed = new URL(publicBaseUrl);
  if (
    parsed.protocol !== "https:" &&
    !["localhost", "127.0.0.1"].includes(parsed.hostname)
  ) {
    throw new Error("PUBLIC_PROPOSAL_BASE_URL must use HTTPS");
  }
  return {
    keyPepper: required(get, "PROPOSAL_KEY_PEPPER", 32),
    stopSigningSecret: required(get, "PROPOSAL_STOP_SIGNING_SECRET", 32),
    publicBaseUrl: publicBaseUrl.replace(/\/$/u, ""),
  };
}

export function getMakeWebhookEnv(get: EnvGetter = Deno.env.get) {
  const webhookUrl = required(get, "MAKE_PROPOSAL_WEBHOOK_URL");
  if (new URL(webhookUrl).protocol !== "https:") {
    throw new Error("MAKE_PROPOSAL_WEBHOOK_URL must use HTTPS");
  }
  return {
    webhookUrl,
    webhookSecret: required(get, "MAKE_PROPOSAL_WEBHOOK_SECRET", 32),
  };
}

export function getMakeAutomationSecret(get: EnvGetter = Deno.env.get) {
  return required(get, "MAKE_AUTOMATION_SECRET", 32);
}
