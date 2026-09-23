import {
  deriveOtpDigest,
  deriveOtpGroupingDigest,
  encryptMakeOtpEnvelope,
  generateSixDigitOtp,
  normalizeOtpEmail,
} from "../_shared/email-otp.ts";
import { getEmailOtpEnv } from "../_shared/env.ts";

function assert(
  condition: unknown,
  message = "assertion failed",
): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEquals<T>(actual: T, expected: T, message = "values differ") {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${message}: ${JSON.stringify(actual)} !== ${JSON.stringify(expected)}`,
    );
  }
}

async function assertRejects(
  run: () => unknown | Promise<unknown>,
  pattern: RegExp,
) {
  try {
    await run();
  } catch (error) {
    assert(
      error instanceof Error && pattern.test(error.message),
      `unexpected error: ${error}`,
    );
    return;
  }
  throw new Error("expected function to reject");
}

function hexDecode(value: string): Uint8Array {
  return Uint8Array.from(
    value.match(/.{2}/gu) ?? [],
    (pair) => Number.parseInt(pair, 16),
  );
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return Uint8Array.from(bytes).buffer;
}

const CHALLENGE_ID = "76000000-0000-4000-8000-000000000001";
const OWNER_ID = "71000000-0000-4000-8000-000000000001";
const DELIVERY_ID = "77000000-0000-4000-8000-000000000001";
const SECRET = "s".repeat(32);
const ENCRYPTION_KEY = Uint8Array.from({ length: 32 }, (_, index) => index);

Deno.test("six-digit OTP generation preserves leading zeroes and rejects biased bytes", () => {
  let calls = 0;
  const otp = generateSixDigitOtp((buffer) => {
    calls += 1;
    buffer.fill(255);
    if (calls === 2) buffer.set([0, 1, 2, 3, 4, 5]);
    return buffer;
  });
  assertEquals(otp, "012345");
  assertEquals(calls, 2);
});

Deno.test("email normalization is canonical and rejects malformed addresses", () => {
  assertEquals(
    normalizeOtpEmail(" Person+Quiz@Example.COM "),
    "person+quiz@example.com",
  );
  for (
    const invalid of [
      "",
      "person",
      "person @example.com",
      "@example.com",
      "person@example",
    ]
  ) {
    try {
      normalizeOtpEmail(invalid);
      throw new Error("expected malformed email rejection");
    } catch (error) {
      assert(error instanceof Error && error.message === "invalid_email");
    }
  }
});

Deno.test("OTP digest binds every versioned identity field and code", async () => {
  const input = {
    challengeId: CHALLENGE_ID,
    ownerUserId: OWNER_ID,
    email: "person@example.com",
    purpose: "qualified_quiz" as const,
    otp: "012345",
  };
  const baseline = await deriveOtpDigest(input, SECRET);
  assert(/^[0-9a-f]{64}$/u.test(baseline));
  for (
    const changed of [
      { ...input, challengeId: `${CHALLENGE_ID.slice(0, -1)}2` },
      { ...input, ownerUserId: `${OWNER_ID.slice(0, -1)}2` },
      { ...input, email: "other@example.com" },
      { ...input, purpose: "other" as never },
      { ...input, otp: "012346" },
    ]
  ) {
    assert((await deriveOtpDigest(changed, SECRET)) !== baseline);
  }
  await assertRejects(
    () => deriveOtpDigest({ ...input, otp: "12A456" }, SECRET),
    /invalid_otp/u,
  );
});

Deno.test("rate-limit grouping digests are domain separated", async () => {
  const email = await deriveOtpGroupingDigest(
    "email-rate-v1",
    "person@example.com",
    SECRET,
  );
  const ip = await deriveOtpGroupingDigest(
    "ip-rate-v1",
    "203.0.113.10",
    SECRET,
  );
  assert(/^[0-9a-f]{64}$/u.test(email));
  assert(/^[0-9a-f]{64}$/u.test(ip));
  assert(email !== ip);
});

Deno.test("Make envelope is AES-256-GCM ciphertext-only and authenticates its tag", async () => {
  const payload = {
    deliveryId: DELIVERY_ID,
    timestamp: "2026-09-23T04:00:00.000Z",
    nonce: "78000000-0000-4000-8000-000000000001",
    keyVersion: "v1",
    to: "person@example.com",
    otp: "012345",
    expiresInMinutes: 10,
    templateVersion: "elysha_otp_v1" as const,
  };
  const encrypted = await encryptMakeOtpEnvelope(
    payload,
    ENCRYPTION_KEY,
    Uint8Array.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]),
  );
  assertEquals(encrypted.iv, "000102030405060708090a0b");
  assert(/^[0-9a-f]+$/u.test(encrypted.ciphertext));
  assert(/^[0-9a-f]{32}$/u.test(encrypted.tag));
  const key = await crypto.subtle.importKey(
    "raw",
    ENCRYPTION_KEY,
    "AES-GCM",
    false,
    ["decrypt"],
  );
  const ciphertext = hexDecode(encrypted.ciphertext);
  const tag = hexDecode(encrypted.tag);
  const joined = new Uint8Array(ciphertext.length + tag.length);
  joined.set(ciphertext);
  joined.set(tag, ciphertext.length);
  const plaintext = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: toArrayBuffer(hexDecode(encrypted.iv)),
      tagLength: 128,
    },
    key,
    joined,
  );
  assertEquals(JSON.parse(new TextDecoder().decode(plaintext)), payload);
  joined[joined.length - 1] ^= 1;
  await assertRejects(
    () =>
      crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: toArrayBuffer(hexDecode(encrypted.iv)),
          tagLength: 128,
        },
        key,
        joined,
      ),
    /.*/u,
  );
});

Deno.test("Make encryption uses fresh IVs and authenticated outer JSON leaks no mailbox data", async () => {
  const payload = {
    deliveryId: DELIVERY_ID,
    timestamp: "2026-09-23T04:00:00.000Z",
    nonce: "78000000-0000-4000-8000-000000000001",
    keyVersion: "v1",
    to: "person@example.com",
    otp: "012345",
    expiresInMinutes: 10,
    templateVersion: "elysha_otp_v1" as const,
  };
  const first = await encryptMakeOtpEnvelope(payload, ENCRYPTION_KEY);
  const second = await encryptMakeOtpEnvelope(payload, ENCRYPTION_KEY);
  assert(first.iv !== second.iv);
  const envelope = {
    deliveryId: DELIVERY_ID,
    timestamp: "2026-09-23T04:00:00.000Z",
    nonce: "78000000-0000-4000-8000-000000000001",
    keyVersion: "v1",
    ...first,
  };
  const serialized = JSON.stringify(envelope);
  assert(!serialized.includes(payload.to));
  assert(!serialized.includes(payload.otp));
});

Deno.test("email OTP environment validates secrets, HTTPS, hostname, and 32-byte key", async () => {
  const values: Record<string, string> = {
    OTP_PEPPER: "p".repeat(32),
    OTP_GROUPING_SECRET: "g".repeat(32),
    TURNSTILE_SECRET_KEY: "turnstile-test-secret",
    TURNSTILE_EXPECTED_HOSTNAME: " ElyshaWorks.COM ",
    MAKE_OTP_WEBHOOK_URL: "https://hook.us2.make.com/example",
    MAKE_OTP_KEY_VERSION: "v1",
    MAKE_OTP_ENCRYPTION_KEY: Array.from(ENCRYPTION_KEY, (byte) =>
      byte.toString(16).padStart(2, "0")
    ).join(""),
  };
  const environment = getEmailOtpEnv((name) => values[name]);
  assertEquals(environment.turnstileExpectedHostname, "elyshaworks.com");
  assertEquals([...environment.makeEncryptionKey], [...ENCRYPTION_KEY]);
  assertEquals(environment.makeWebhookUrl, values.MAKE_OTP_WEBHOOK_URL);
  assertEquals(environment.makeKeyVersion, "v1");
  await assertRejects(
    () =>
      getEmailOtpEnv((name) =>
        name === "MAKE_OTP_WEBHOOK_URL" ? "http://make.test/hook" : values[name]
      ),
    /HTTPS/u,
  );
  await assertRejects(
    () =>
      getEmailOtpEnv((name) => name === "OTP_PEPPER" ? "short" : values[name]),
    /OTP_PEPPER/u,
  );
  await assertRejects(
    () =>
      getEmailOtpEnv((name) =>
        name === "MAKE_OTP_ENCRYPTION_KEY" ? "AAAA" : values[name]
      ),
    /MAKE_OTP_ENCRYPTION_KEY/u,
  );
});
