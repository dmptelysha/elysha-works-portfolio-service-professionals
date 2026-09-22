import { describe, expect, it, vi } from "vitest";

import {
  createOwnedQuizContext,
  ensureAnonymousSession,
  issueProposal,
  previewProposal,
  saveOwnedQuizProgress,
  submitLeadContact,
  type OwnedQuizContext,
} from "@/features/quiz/quiz-service";

const USER_ID = "10000000-0000-4000-8000-000000000001";
const DEFINITION_ID = "20000000-0000-4000-8000-000000000001";
const VISITOR_ID = "30000000-0000-4000-8000-000000000001";
const PORTFOLIO_SESSION_ID = "40000000-0000-4000-8000-000000000001";
const QUIZ_SESSION_ID = "50000000-0000-4000-8000-000000000001";
const LEAD_ID = "60000000-0000-4000-8000-000000000001";

function thenableBuilder(
  response: { data: unknown; error: unknown },
  calls: Array<{ method: string; args: unknown[] }>,
) {
  let builder: object;
  builder = new Proxy({}, {
    get(_target, property) {
      if (property === "then") return Promise.resolve(response).then.bind(Promise.resolve(response));
      return (...args: unknown[]) => {
        calls.push({ method: String(property), args });
        return builder;
      };
    },
  });
  return builder;
}

function fakeClient(options: {
  sessionUserId?: string | null;
  signInUserId?: string | null;
  tableResponses?: Array<{ data: unknown; error: unknown }>;
  rpcResponse?: { data: unknown; error: unknown };
  functionResponse?: { data: unknown; error: unknown };
} = {}) {
  const tableCalls: Array<{ table: string; chain: Array<{ method: string; args: unknown[] }> }> = [];
  const responses = [...(options.tableResponses ?? [])];
  const getSession = vi.fn(async () => ({
    data: { session: options.sessionUserId ? { user: { id: options.sessionUserId } } : null },
    error: null,
  }));
  const signInAnonymously = vi.fn(async () => ({
    data: { session: options.signInUserId ? { user: { id: options.signInUserId } } : null },
    error: null,
  }));
  const rpc = vi.fn(async () => options.rpcResponse ?? { data: [{ lead_id: LEAD_ID, quiz_session_id: QUIZ_SESSION_ID }], error: null });
  const invoke = vi.fn(async () => options.functionResponse ?? { data: { proposal: { expiresAt: null } }, error: null });
  return {
    client: {
      auth: { getSession, signInAnonymously },
      from: vi.fn((table: string) => {
        const chain: Array<{ method: string; args: unknown[] }> = [];
        tableCalls.push({ table, chain });
        return thenableBuilder(responses.shift() ?? { data: null, error: null }, chain);
      }),
      rpc,
      functions: { invoke },
    },
    getSession,
    signInAnonymously,
    rpc,
    invoke,
    tableCalls,
  };
}

const context: OwnedQuizContext = {
  ownerUserId: USER_ID,
  visitorId: VISITOR_ID,
  portfolioSessionId: PORTFOLIO_SESSION_ID,
  quizSessionId: QUIZ_SESSION_ID,
  questionSetId: DEFINITION_ID,
  questionSetVersion: 1,
  audienceKey: "service_businesses",
};

describe("Supabase quiz service", () => {
  it("reuses an existing anonymous session without signing in again", async () => {
    const fake = fakeClient({ sessionUserId: USER_ID });
    await expect(ensureAnonymousSession(fake.client as never)).resolves.toMatchObject({ user: { id: USER_ID } });
    expect(fake.signInAnonymously).not.toHaveBeenCalled();
  });

  it("silently creates an anonymous session when none exists", async () => {
    const fake = fakeClient({ signInUserId: USER_ID });
    await expect(ensureAnonymousSession(fake.client as never)).resolves.toMatchObject({ user: { id: USER_ID } });
    expect(fake.signInAnonymously).toHaveBeenCalledOnce();
  });

  it("forwards the Turnstile token when creating an anonymous session", async () => {
    const fake = fakeClient({ signInUserId: USER_ID });
    await expect(ensureAnonymousSession(fake.client as never, "turnstile-token")).resolves.toMatchObject({
      user: { id: USER_ID },
    });
    expect(fake.signInAnonymously).toHaveBeenCalledWith({
      options: { captchaToken: "turnstile-token" },
    });
  });

  it("looks up the active definition and validates all returned owned UUIDs", async () => {
    const fake = fakeClient({
      sessionUserId: USER_ID,
      tableResponses: [
        { data: { id: DEFINITION_ID, version: 1, audience_key: "service_businesses" }, error: null },
        { data: null, error: null },
        { data: { id: VISITOR_ID }, error: null },
        { data: { id: PORTFOLIO_SESSION_ID }, error: null },
        { data: { id: QUIZ_SESSION_ID }, error: null },
      ],
    });

    await expect(createOwnedQuizContext("service_businesses", {
      client: fake.client as never,
      landingPath: "/quiz/",
    })).resolves.toEqual(context);

    expect(fake.tableCalls.map((entry) => entry.table)).toEqual([
      "quiz_definitions", "site_visitors", "site_visitors", "portfolio_sessions", "quiz_sessions",
    ]);
    const visitorInsert = fake.tableCalls[2].chain.find((call) => call.method === "insert");
    expect(visitorInsert?.args[0]).toMatchObject({ owner_user_id: USER_ID, landing_path: "/quiz/" });
    const quizInsert = fake.tableCalls[4].chain.find((call) => call.method === "insert");
    expect(quizInsert?.args[0]).toMatchObject({
      owner_user_id: USER_ID,
      visitor_id: VISITOR_ID,
      portfolio_session_id: PORTFOLIO_SESSION_ID,
      question_set_id: DEFINITION_ID,
      question_set_version: 1,
      audience_key: "service_businesses",
    });
  });

  it("reuses the anonymous owner's existing visitor before creating a fresh quiz session", async () => {
    const fake = fakeClient({
      sessionUserId: USER_ID,
      tableResponses: [
        { data: { id: DEFINITION_ID, version: 1, audience_key: "service_businesses" }, error: null },
        { data: { id: VISITOR_ID }, error: null },
        { data: { id: PORTFOLIO_SESSION_ID }, error: null },
        { data: { id: QUIZ_SESSION_ID }, error: null },
      ],
    });

    await expect(createOwnedQuizContext("service_businesses", {
      client: fake.client as never,
      landingPath: "/quiz/",
    })).resolves.toEqual(context);

    const visitorLookup = fake.tableCalls[1];
    expect(visitorLookup.table).toBe("site_visitors");
    expect(visitorLookup.chain).toEqual(expect.arrayContaining([
      { method: "select", args: ["id"] },
      { method: "eq", args: ["owner_user_id", USER_ID] },
      { method: "maybeSingle", args: [] },
    ]));
    expect(visitorLookup.chain.some((call) => call.method === "insert")).toBe(false);
  });

  it("submits only approved contact fields and owned attribution through the RPC", async () => {
    const fake = fakeClient();
    await expect(submitLeadContact(context, {
      firstName: " Mara ", businessName: " Mara Consulting ", email: "MARA@EXAMPLE.COM", consent: true,
    }, fake.client as never)).resolves.toEqual({ leadId: LEAD_ID, quizSessionId: QUIZ_SESSION_ID });

    expect(fake.rpc).toHaveBeenCalledWith("begin_qualified_quiz", {
      p_visitor_id: VISITOR_ID,
      p_portfolio_session_id: PORTFOLIO_SESSION_ID,
      p_quiz_session_id: QUIZ_SESSION_ID,
      p_audience_key: "service_businesses",
      p_first_name: "Mara",
      p_business_name: "Mara Consulting",
      p_email: "mara@example.com",
      p_consent: true,
      p_consent_version: "proposal_followup_v1",
    });
    expect(JSON.stringify(fake.rpc.mock.calls)).not.toContain("owner_user_id");
  });

  it("saves only progress fields against the owned quiz and owner IDs", async () => {
    const fake = fakeClient({ tableResponses: [{ data: null, error: null }] });
    await saveOwnedQuizProgress(context, {
      answers: { q1_goal: ["service_goal_qualified_inquiries"] },
      currentStep: 1,
      lastCompletedStep: 1,
    }, fake.client as never);
    expect(fake.tableCalls[0].table).toBe("quiz_sessions");
    expect(fake.tableCalls[0].chain).toEqual(expect.arrayContaining([
      { method: "update", args: [{ answers: { q1_goal: ["service_goal_qualified_inquiries"] }, current_step: 1, last_completed_step: 1 }] },
      { method: "eq", args: ["id", QUIZ_SESSION_ID] },
      { method: "eq", args: ["owner_user_id", USER_ID] },
    ]));
  });

  it("calls proposal preview and issue with minimal browser-controlled payloads", async () => {
    const fake = fakeClient();
    await previewProposal(context, fake.client as never);
    await issueProposal(context, {
      tierKey: "advanced", platform: "gohighlevel", offerKey: "platform_growth",
    }, fake.client as never);

    expect(fake.invoke).toHaveBeenNthCalledWith(1, "finalize-proposal", {
      body: { operation: "preview", quizSessionId: QUIZ_SESSION_ID },
    });
    expect(fake.invoke).toHaveBeenNthCalledWith(2, "finalize-proposal", {
      body: {
        operation: "issue",
        quizSessionId: QUIZ_SESSION_ID,
        selection: { tierKey: "advanced", platform: "gohighlevel" },
      },
    });
    expect(JSON.stringify(fake.invoke.mock.calls)).not.toMatch(/score|price|ownerUserId|offerKey/i);
  });

  it("returns a generic safe error without leaking credentials or contact PII", async () => {
    const fake = fakeClient({
      rpcResponse: { data: null, error: { message: "mara@example.com sb_secret_should_not_leak" } },
    });
    await expect(submitLeadContact(context, {
      firstName: "Mara", businessName: "Mara Consulting", email: "mara@example.com", consent: true,
    }, fake.client as never)).rejects.toThrow("We could not save your details. Please try again.");
  });
});
