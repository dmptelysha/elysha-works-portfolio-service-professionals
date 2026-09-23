/// <reference lib="deno.ns" />

type EnvGetter = (name: string) => string | undefined;

function decodeHexKey(value: string, name: string): Uint8Array {
  if (!/^[0-9a-f]{64}$/iu.test(value)) {
    throw new Error(`Invalid configuration: ${name}`);
  }
  try {
    return Uint8Array.from(
      value.match(/.{2}/gu) ?? [],
      (pair) => Number.parseInt(pair, 16),
    );
  } catch {
    throw new Error(`Invalid configuration: ${name}`);
  }
}

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

export function getEmailOtpEnv(get: EnvGetter = Deno.env.get) {
  const makeWebhookUrl = required(get, "MAKE_OTP_WEBHOOK_URL");
  if (new URL(makeWebhookUrl).protocol !== "https:") {
    throw new Error("MAKE_OTP_WEBHOOK_URL must use HTTPS");
  }
  const turnstileExpectedHostname = required(
    get,
    "TURNSTILE_EXPECTED_HOSTNAME",
  ).toLowerCase();
  if (
    turnstileExpectedHostname.includes(":") ||
    turnstileExpectedHostname.includes("/") ||
    turnstileExpectedHostname.includes(" ")
  ) {
    throw new Error("Invalid configuration: TURNSTILE_EXPECTED_HOSTNAME");
  }
  return {
    otpPepper: required(get, "OTP_PEPPER", 32),
    otpGroupingSecret: required(get, "OTP_GROUPING_SECRET", 32),
    turnstileSecretKey: required(get, "TURNSTILE_SECRET_KEY"),
    turnstileExpectedHostname,
    makeWebhookUrl,
    makeKeyVersion: required(get, "MAKE_OTP_KEY_VERSION"),
    makeEncryptionKey: decodeHexKey(
      required(get, "MAKE_OTP_ENCRYPTION_KEY"),
      "MAKE_OTP_ENCRYPTION_KEY",
    ),
  };
}
