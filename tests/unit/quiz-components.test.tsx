import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { QuizExperience } from "@/features/quiz/QuizExperience";
import { calculateRecommendation } from "@/features/quiz/cortex";
import { EmailOtpStep } from "@/features/quiz/EmailOtpStep";
import { LeadContactStep } from "@/features/quiz/LeadContactStep";
import type { OwnedQuizContext } from "@/features/quiz/quiz-service";
import { QUIZ_DEFINITIONS } from "@/features/quiz/questions";
import { QUIZ_STORAGE_KEY, QUIZ_TTL_MS } from "@/features/quiz/persistence";
import { buildProposalDraft } from "@/features/quiz/proposal-view";
import { defaultRoadmapSelection } from "@/features/quiz/roadmap-options";
import {
  CATALOG_VERSION,
  CORTEX_VERSION,
  QUESTION_SET_VERSION,
  type LeadContactInput,
  type LeadContactSubmissionResult,
  type SavedQuizAttempt,
} from "@/features/quiz/types";

const turnstileControls = vi.hoisted(() => ({
  mounts: 0,
  onError: null as null | (() => void),
  onExpire: null as null | (() => void),
  onSuccess: null as null | ((token: string) => void),
}));

vi.mock("@marsidev/react-turnstile", () => ({
  Turnstile: (props: { onError: () => void; onExpire: () => void; onSuccess: (token: string) => void }) => {
    turnstileControls.mounts += 1;
    turnstileControls.onError = props.onError;
    turnstileControls.onExpire = props.onExpire;
    turnstileControls.onSuccess = props.onSuccess;
    return <div data-testid="turnstile-runtime" />;
  },
}));

const ownedContext: OwnedQuizContext = {
  ownerUserId: "10000000-0000-4000-8000-000000000001",
  visitorId: "30000000-0000-4000-8000-000000000001",
  portfolioSessionId: "40000000-0000-4000-8000-000000000001",
  quizSessionId: "50000000-0000-4000-8000-000000000001",
  questionSetId: "20000000-0000-4000-8000-000000000001",
  questionSetVersion: 1,
  audienceKey: "service_businesses",
};

function createFakeQuizService() {
  let answers: Record<string, readonly string[]> = {};
  let identity = { firstName: "Mara", businessName: "Mara Consulting" };
  const createOwnedQuizContext = vi.fn(async (audienceKey: typeof ownedContext.audienceKey) => ({ ...ownedContext, audienceKey }));
  const submitLeadContact = vi.fn(async (_context: OwnedQuizContext, contact: LeadContactInput): Promise<LeadContactSubmissionResult> => {
    identity = { firstName: contact.firstName, businessName: contact.businessName };
    return { status: "accepted" as const, leadId: "60000000-0000-4000-8000-000000000001", quizSessionId: ownedContext.quizSessionId };
  });
  const saveOwnedQuizProgress = vi.fn(async (_context: OwnedQuizContext, progress: { answers: Record<string, readonly string[]> }) => {
    answers = progress.answers;
  });
  const previewProposal = vi.fn(async (context: OwnedQuizContext) => {
    const result = calculateRecommendation({ audienceKey: context.audienceKey, answers });
    return buildProposalDraft(identity, answers, result, defaultRoadmapSelection(result));
  });
  const issueProposal = vi.fn(async (context: OwnedQuizContext, selection: { tierKey: "basic" | "advanced" | "complete"; platform: "systeme_io" | "gohighlevel" | "custom_app"; offerKey: string }) => {
    const result = calculateRecommendation({ audienceKey: context.audienceKey, answers });
    return {
      proposalReference: "70000000-0000-4000-8000-000000000001",
      accessKey: "ABCD234567",
      proposal: { ...buildProposalDraft(identity, answers, result, selection), expiresAt: "2026-09-25T05:00:00.000Z" },
    };
  });
  const requestEmailOtp = vi.fn(async (email: string) => ({
    email: email.trim().toLowerCase(),
    requestedAt: "2026-09-23T00:00:00.000Z",
    resendAvailableAt: "2026-09-23T00:01:00.000Z",
  }));
  const verifyEmailOtp = vi.fn(async () => ({
    access_token: "test-access-token",
    refresh_token: "test-refresh-token",
    expires_in: 3600,
    token_type: "bearer",
    user: {
      id: ownedContext.ownerUserId,
      email: "mara@example.com",
      is_anonymous: false,
      email_confirmed_at: "2026-09-23T00:00:00.000Z",
    },
  } as never));
  return { requestEmailOtp, verifyEmailOtp, createOwnedQuizContext, submitLeadContact, saveOwnedQuizProgress, previewProposal, issueProposal };
}

async function fillContactStep(
  user: ReturnType<typeof userEvent.setup>,
  values = { firstName: "Mara", lastName: "Santos", businessName: "Mara Consulting", email: "Mara@Example.com" },
) {
  await user.type(screen.getByLabelText(/first name/i), values.firstName);
  await user.type(screen.getByLabelText(/last name/i), values.lastName);
  await user.type(screen.getByLabelText(/business name/i), values.businessName);
  await user.type(screen.getByLabelText(/^email/i), values.email);
  await user.click(screen.getByRole("checkbox", { name: /initial proposal.*up to three follow-ups/i }));
  await user.click(screen.getByRole("button", { name: /send verification code/i }));
}

async function completeContactStep(
  user: ReturnType<typeof userEvent.setup>,
  values = { firstName: "Mara", lastName: "Santos", businessName: "Mara Consulting", email: "Mara@Example.com" },
) {
  await fillContactStep(user, values);
  await user.type(await screen.findByLabelText(/verification code/i), "123456");
  await user.click(screen.getByRole("button", { name: /verify email/i }));
  await screen.findByRole("heading", { name: /your roadmap starts with context/i });
}

async function completeServiceBusinessAssessment(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: /service-based business/i }));
  await completeContactStep(user);
  await user.click(await screen.findByRole("button", { name: /start my assessment/i }));

  const definition = QUIZ_DEFINITIONS.service_businesses;
  for (const [index, question] of definition.questions.entries()) {
    await user.click(screen.getByRole(question.selection === "single" ? "radio" : "button", { name: question.options[0].label }));
    await user.click(screen.getByRole("button", { name: index === 7 ? /see my roadmap/i : /continue/i }));
  }
}

describe("local portfolio quiz", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    turnstileControls.onError = null;
    turnstileControls.onExpire = null;
    turnstileControls.onSuccess = null;
    turnstileControls.mounts = 0;
  });

  it("accepts only a six-digit email code and keeps account state private", async () => {
    const user = userEvent.setup();
    const onVerify = vi.fn(async () => undefined);
    const onResend = vi.fn(async () => undefined);
    const onChangeEmail = vi.fn();
    render(
      <EmailOtpStep
        email="person@example.com"
        resendAvailableAt="2026-09-23T00:01:00.000Z"
        now={() => new Date("2026-09-23T00:00:00.000Z").getTime()}
        onChangeEmail={onChangeEmail}
        onResend={onResend}
        onVerify={onVerify}
      />,
    );

    expect(screen.getByText(/p\*\*\*\*n@example\.com/i)).toBeInTheDocument();
    const verify = screen.getByRole("button", { name: /verify email/i });
    expect(verify).toBeDisabled();
    await user.type(screen.getByLabelText(/verification code/i), "12a34-56");
    expect(screen.getByLabelText(/verification code/i)).toHaveValue("123456");
    await user.click(verify);
    expect(onVerify).toHaveBeenCalledWith("123456");
    expect(screen.getByRole("button", { name: /resend in 60s/i })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: /change email/i }));
    expect(onChangeEmail).toHaveBeenCalledOnce();
  });


  it("shows the three audience choices immediately while the security check initializes", async () => {
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "test-site-key");
    const user = userEvent.setup();
    const service = createFakeQuizService();
    render(<QuizExperience service={service} />);

    const audienceChoices = await screen.findAllByRole("button", { name: /business|coaches|educators/i });
    expect(audienceChoices).toHaveLength(3);
    expect(audienceChoices.every((choice) => !choice.hasAttribute("disabled"))).toBe(true);
    expect(screen.queryByText(/a clear roadmap in three steps/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /service-based business/i }));
    expect(screen.getByRole("heading", { name: /where should we send your proposal/i })).toBeInTheDocument();
    expect(screen.getByText(/securely store your personalized proposal for 72 hours/i)).toBeInTheDocument();
    expect(screen.getByText(/book a discovery call within that window/i)).toBeInTheDocument();
    expect(service.createOwnedQuizContext).not.toHaveBeenCalled();
  });

  it("keeps contact memory-only and creates no owned context until email OTP succeeds", async () => {
    const user = userEvent.setup();
    const service = createFakeQuizService();
    render(<QuizExperience service={service} />);

    await user.click(await screen.findByRole("button", { name: /service-based business/i }));
    await user.type(screen.getByLabelText(/first name/i), "Mara");
    await user.type(screen.getByLabelText(/last name/i), "Santos");
    await user.type(screen.getByLabelText(/business name/i), "Mara Consulting");
    await user.type(screen.getByLabelText(/^email/i), "mara@example.com");
    await user.click(screen.getByRole("checkbox", { name: /initial proposal.*up to three follow-ups/i }));
    await user.click(screen.getByRole("button", { name: /send verification code/i }));

    expect(await screen.findByRole("heading", { name: /check your email/i })).toBeInTheDocument();
    expect(service.requestEmailOtp).toHaveBeenCalledWith("mara@example.com", undefined);
    expect(service.createOwnedQuizContext).not.toHaveBeenCalled();
    expect(service.submitLeadContact).not.toHaveBeenCalled();
    const savedBeforeVerification = localStorage.getItem(QUIZ_STORAGE_KEY) ?? "";
    expect(savedBeforeVerification).not.toContain("mara@example.com");
    expect(savedBeforeVerification).not.toContain("Mara Consulting");

    await user.type(screen.getByLabelText(/verification code/i), "123456");
    await user.click(screen.getByRole("button", { name: /verify email/i }));
    await waitFor(() => expect(service.verifyEmailOtp).toHaveBeenCalledWith("mara@example.com", "123456"));
    await waitFor(() => expect(service.createOwnedQuizContext).toHaveBeenCalledOnce());
    expect(service.submitLeadContact).toHaveBeenCalledOnce();
    expect(await screen.findByRole("heading", { name: /your roadmap starts with context/i })).toBeInTheDocument();
  });

  it("unblocks contact submission on Turnstile success and safely blocks again on expiry or error", async () => {
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "test-site-key");
    const user = userEvent.setup();
    render(<QuizExperience service={createFakeQuizService()} />);

    await user.click(await screen.findByRole("button", { name: /service-based business/i }));
    await user.type(screen.getByLabelText(/first name/i), "Mara");
    await user.type(screen.getByLabelText(/last name/i), "Santos");
    await user.type(screen.getByLabelText(/business name/i), "Mara Consulting");
    await user.type(screen.getByLabelText(/^email/i), "mara@example.com");
    await user.click(screen.getByRole("checkbox", { name: /initial proposal.*up to three follow-ups/i }));
    const submit = screen.getByRole("button", { name: /send verification code/i });

    expect(submit).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent(/preparing the secure assessment/i);

    act(() => turnstileControls.onSuccess?.("valid-turnstile-token"));
    await waitFor(() => expect(submit).toBeEnabled());

    act(() => turnstileControls.onExpire?.());
    await waitFor(() => expect(submit).toBeDisabled());

    act(() => turnstileControls.onSuccess?.("refreshed-turnstile-token"));
    await waitFor(() => expect(submit).toBeEnabled());

    act(() => turnstileControls.onError?.());
    await waitFor(() => expect(submit).toBeDisabled());
    expect(screen.getByRole("status")).toHaveTextContent(/security verification is paused/i);
    const retry = screen.getByRole("button", { name: /retry security check/i });
    const previousMounts = turnstileControls.mounts;
    await user.click(retry);
    await waitFor(() => expect(turnstileControls.mounts).toBe(previousMounts + 1));
    expect(screen.getByRole("status")).toHaveTextContent(/preparing the secure assessment/i);
  });

  it("validates and normalizes required lead contact details without navigating", async () => {
    const user = userEvent.setup();
    const initialUrl = window.location.href;
    let submitted: unknown = null;
    render(<LeadContactStep onSubmit={async (contact) => {
      submitted = contact;
      return { status: "accepted", leadId: "60000000-0000-4000-8000-000000000001", quizSessionId: ownedContext.quizSessionId };
    }} />);

    const submit = screen.getByRole("button", { name: /send verification code/i });
    expect(submit).toHaveTextContent("Send Verification Code →");
    expect(submit).toBeDisabled();
    await user.type(screen.getByLabelText(/first name/i), "  Mara  ");
    await user.type(screen.getByLabelText(/last name/i), "  Santos  ");
    await user.type(screen.getByLabelText(/business name/i), "  Mara Consulting  ");
    await user.type(screen.getByLabelText(/^email/i), "  MARA@EXAMPLE.COM  ");
    expect(submit).toBeDisabled();
    await user.click(screen.getByRole("checkbox", { name: /initial proposal.*up to three follow-ups/i }));
    await user.click(submit);

    await waitFor(() => expect(submitted).toEqual({
      firstName: "Mara",
      lastName: "Santos",
      businessName: "Mara Consulting",
      email: "mara@example.com",
      consent: true,
    }));
    expect(window.location.href).toBe(initialUrl);
  });

  it("asks a verified returning identity whether this is the same or another business", async () => {
    const user = userEvent.setup();
    const service = createFakeQuizService();
    service.submitLeadContact.mockImplementation(async (_context, contact) => contact.businessScope
      ? { status: "accepted" as const, leadId: "60000000-0000-4000-8000-000000000001", quizSessionId: ownedContext.quizSessionId }
      : { status: "business_scope_required" as const, quizSessionId: ownedContext.quizSessionId, existingBusinessName: "Mara Consulting" });
    render(<QuizExperience service={service} />);

    await user.click(await screen.findByRole("button", { name: /service-based business/i }));
    await fillContactStep(user);
    await user.type(await screen.findByLabelText(/verification code/i), "123456");
    await user.click(screen.getByRole("button", { name: /verify email/i }));
    expect(await screen.findByRole("heading", { name: /is this assessment for mara consulting/i })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /same business/i }));
    await waitFor(() => expect(service.submitLeadContact).toHaveBeenLastCalledWith(
      expect.anything(), expect.objectContaining({ businessScope: "same_business" }),
    ));
    expect(await screen.findByRole("heading", { name: /your roadmap starts with context/i })).toBeInTheDocument();
  });

  it("lets a verified returning identity organize a different business separately", async () => {
    const user = userEvent.setup();
    const service = createFakeQuizService();
    service.submitLeadContact.mockImplementation(async (_context, contact) => contact.businessScope
      ? { status: "accepted" as const, leadId: "60000000-0000-4000-8000-000000000001", quizSessionId: ownedContext.quizSessionId }
      : { status: "business_scope_required" as const, quizSessionId: ownedContext.quizSessionId, existingBusinessName: "Mara Consulting" });
    render(<QuizExperience service={service} />);

    await user.click(await screen.findByRole("button", { name: /service-based business/i }));
    await fillContactStep(user, { firstName: "Mara", lastName: "Santos", businessName: "Mara Academy", email: "mara@example.com" });
    await user.type(await screen.findByLabelText(/verification code/i), "123456");
    await user.click(screen.getByRole("button", { name: /verify email/i }));
    await user.click(await screen.findByRole("button", { name: /another business/i }));
    await waitFor(() => expect(service.submitLeadContact).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({
      businessName: "Mara Academy",
      businessScope: "another_business",
    })));
  });

  it("retains contact fields and announces a submission failure", async () => {
    const user = userEvent.setup();
    render(<LeadContactStep onSubmit={async () => { throw new Error("Backend unavailable"); }} />);
    await fillContactStep(user);

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not send a verification code/i);
    expect(screen.getByLabelText(/first name/i)).toHaveValue("Mara");
    expect(screen.getByLabelText(/business name/i)).toHaveValue("Mara Consulting");
    expect(screen.getByLabelText(/^email/i)).toHaveValue("Mara@Example.com");
  });

  it("automatically issues and confirms the emailed proposal after calculation", async () => {
    const user = userEvent.setup();
    const service = createFakeQuizService();
    render(<QuizExperience service={service} />);

    await user.click(await screen.findByRole("button", { name: /service-based business/i }));
    await completeContactStep(user);
    await waitFor(() => expect(service.createOwnedQuizContext).toHaveBeenCalledWith("service_businesses", expect.anything()));
    expect(service.submitLeadContact).toHaveBeenCalledOnce();
    await user.click(screen.getByRole("button", { name: /start my assessment/i }));

    const definition = QUIZ_DEFINITIONS.service_businesses;
    for (const [index, question] of definition.questions.entries()) {
      await user.click(screen.getByRole(question.selection === "single" ? "radio" : "button", { name: question.options[0].label }));
      await user.click(screen.getByRole("button", { name: index === 7 ? /see my roadmap/i : /continue/i }));
    }

    await waitFor(() => expect(service.previewProposal).toHaveBeenCalledWith(expect.objectContaining({ quizSessionId: ownedContext.quizSessionId })));
    expect(service.saveOwnedQuizProgress).toHaveBeenCalled();
    await waitFor(() => expect(service.issueProposal).toHaveBeenCalledWith(
      expect.objectContaining({ quizSessionId: ownedContext.quizSessionId }),
      expect.objectContaining({ tierKey: expect.any(String), platform: expect.any(String) }),
    ));
    const issuePayload = service.issueProposal.mock.calls[0][1];
    expect(Object.keys(issuePayload).sort()).toEqual(["offerKey", "platform", "tierKey"]);
    expect(screen.queryByRole("button", { name: /create my 3-day proposal/i })).not.toBeInTheDocument();

    const successDialog = await screen.findByRole("dialog", { name: /your proposal is ready/i });
    expect(within(successDialog).getByText(/sent.*m\*\*\*@example\.com/i)).toBeInTheDocument();
    expect(within(successDialog).getByText(/available for 72 hours/i)).toBeInTheDocument();
    await user.click(within(successDialog).getByRole("button", { name: /view my roadmap/i }));
    expect(screen.queryByRole("dialog", { name: /your proposal is ready/i })).not.toBeInTheDocument();
  });

  it("keeps an undismissable sending dialog open until durable delivery succeeds", async () => {
    const user = userEvent.setup();
    const service = createFakeQuizService();
    const issue = service.issueProposal.getMockImplementation()!;
    let resolveIssue!: (value: Awaited<ReturnType<typeof issue>>) => void;
    service.issueProposal.mockImplementationOnce(() => new Promise((resolve) => { resolveIssue = resolve; }));
    render(<QuizExperience service={service} />);

    await completeServiceBusinessAssessment(user);

    const sendingDialog = await screen.findByRole("dialog", { name: /preparing and sending your proposal/i });
    expect(within(sendingDialog).getByText(/keep this page open/i)).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.getByRole("dialog", { name: /preparing and sending your proposal/i })).toBeInTheDocument();

    const issued = await issue(ownedContext, defaultRoadmapSelection(calculateRecommendation({
      audienceKey: "service_businesses",
      answers: Object.fromEntries(QUIZ_DEFINITIONS.service_businesses.questions.map((question) => [question.key, [question.options[0].key]])),
    })));
    await act(async () => resolveIssue(issued));

    const successDialog = await screen.findByRole("dialog", { name: /your proposal is ready/i });
    expect(within(successDialog).getByText(/m\*\*\*@example\.com/i)).toBeInTheDocument();
    expect(within(successDialog).getByRole("link", { name: /book a discovery call/i })).toHaveAttribute("href", "/booking/");
  });

  it("keeps the roadmap visible and allows a failed automatic email to be retried", async () => {
    const user = userEvent.setup();
    const service = createFakeQuizService();
    const successfulIssue = service.issueProposal.getMockImplementation()!;
    service.issueProposal.mockRejectedValueOnce(new Error("Email delivery unavailable"));
    render(<QuizExperience service={service} />);

    await completeServiceBusinessAssessment(user);

    const errorDialog = await screen.findByRole("dialog", { name: /roadmap is ready, but the email was not sent/i });
    expect(screen.getByRole("heading", { name: /mara.*roadmap/i })).toBeInTheDocument();
    expect(within(errorDialog).getByText(/roadmap remains available here/i)).toBeInTheDocument();

    service.issueProposal.mockImplementation(successfulIssue);
    await user.click(within(errorDialog).getByRole("button", { name: /retry sending email/i }));

    expect(await screen.findByRole("dialog", { name: /your proposal is ready/i })).toBeInTheDocument();
    expect(service.issueProposal).toHaveBeenCalledTimes(2);
    expect(service.issueProposal.mock.calls[1]).toEqual(service.issueProposal.mock.calls[0]);
  });

  it("disables duplicate contact submissions while the owned RPC is pending", async () => {
    const user = userEvent.setup();
    const service = createFakeQuizService();
    let finishSubmission!: () => void;
    service.submitLeadContact.mockImplementation(() => new Promise((resolve) => {
      finishSubmission = () => resolve({
        status: "accepted",
        leadId: "60000000-0000-4000-8000-000000000001",
        quizSessionId: ownedContext.quizSessionId,
      });
    }));
    render(<QuizExperience service={service} />);

    await user.click(await screen.findByRole("button", { name: /service-based business/i }));
    await fillContactStep(user);
    await user.type(await screen.findByLabelText(/verification code/i), "123456");
    const verify = screen.getByRole("button", { name: /verify email/i });
    await user.click(verify);

    expect(verify).toBeDisabled();
    expect(verify).toHaveTextContent(/verifying/i);
    await waitFor(() => expect(service.submitLeadContact).toHaveBeenCalledOnce());
    finishSubmission();
    expect(await screen.findByRole("heading", { name: /your roadmap starts with context/i })).toBeInTheDocument();
  });

  it("completes all eight questions without navigation or network calls", async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const initialUrl = window.location.href;

    render(<QuizExperience service={createFakeQuizService()} />);
    expect(await screen.findByRole("heading", { name: /which best describes your business/i })).toBeInTheDocument();
    expect(screen.queryByText(/a clear roadmap in three steps/i)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/elysha-works-privacy-policy/");
    expect(screen.getByRole("link", { name: "Terms" })).toHaveAttribute("href", "/elysha-works-terms-of-service/");
    await user.click(screen.getByRole("button", { name: /service-based business/i }));
    expect(screen.getByRole("heading", { name: /where should we send your proposal/i })).toBeInTheDocument();
    await completeContactStep(user);
    expect(screen.getByRole("heading", { name: /your roadmap starts with context/i })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /start my assessment/i }));

    const definition = QUIZ_DEFINITIONS.service_businesses;
    for (const [index, question] of definition.questions.entries()) {
      expect(screen.getByText(`Question ${index + 1} of 8`)).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: question.prompt })).toBeInTheDocument();
      const option = screen.getByRole(question.selection === "single" ? "radio" : "button", { name: question.options[0].label });
      await user.click(option);
      if (question.selection === "single") expect(option).toHaveAttribute("aria-checked", "true");
      await user.click(screen.getByRole("button", { name: index === 7 ? /see my roadmap/i : /continue/i }));
    }

    expect(await screen.findByRole("heading", { name: /Mara.*Mara Consulting/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /compare your roadmap options/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^basic$/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^advanced$/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^complete$/i })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^systeme\.io$/i })).toHaveLength(3);
    expect(screen.getAllByRole("button", { name: /^highlevel$/i })).toHaveLength(3);
    expect(screen.getAllByRole("button", { name: /^custom app$/i })).toHaveLength(3);
    await user.click(screen.getAllByRole("button", { name: /^custom app$/i })[0]);
    const selectedSummary = screen.getByRole("region", { name: /your selected roadmap/i });
    expect(within(selectedSummary).getAllByText("Custom Starter").length).toBeGreaterThan(0);
    expect(within(selectedSummary).getAllByText("$3,000").length).toBeGreaterThan(0);
    await user.click(screen.getAllByRole("button", { name: /^custom app$/i })[2]);
    expect(within(selectedSummary).getAllByText("Custom Growth").length).toBeGreaterThan(0);
    expect(within(selectedSummary).getAllByText("$7,500").length).toBeGreaterThan(0);
    for (const heading of [
      /where Mara Consulting is now/i,
      /where the business wants to go/i,
      /how Complete can exceed the requirement/i,
      /related work/i,
      /turn the roadmap into a practical scope/i,
    ]) expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
    for (const bookingLink of screen.getAllByRole("link", { name: /book a discovery call/i })) {
      expect(bookingLink).toHaveAttribute("href", "/booking/");
    }
    expect(screen.getByRole("navigation", { name: /quiz footer/i })).toBeInTheDocument();
    expect(window.location.href).toBe(initialUrl);
    expect(fetchSpy).not.toHaveBeenCalled();

    const saved = JSON.parse(localStorage.getItem(QUIZ_STORAGE_KEY) ?? "null") as SavedQuizAttempt;
    expect(saved.status).toBe("completed");
    expect(localStorage.getItem(QUIZ_STORAGE_KEY)).not.toContain("Mara Consulting");
    expect(localStorage.getItem(QUIZ_STORAGE_KEY)).not.toContain("mara@example.com");
    expect(saved.result?.recommendedOfferKey).toBeTruthy();
    expect(saved.roadmapSelection).toEqual({ tierKey: "complete", platform: "custom_app", offerKey: "custom_growth" });
  });

  it("supports the complete keyboard pattern for single-choice radio groups", async () => {
    const user = userEvent.setup();
    render(<QuizExperience service={createFakeQuizService()} />);
    await user.click(await screen.findByRole("button", { name: /service-based business/i }));
    await completeContactStep(user);
    await user.click(screen.getByRole("button", { name: /start my assessment/i }));

    const radios = screen.getAllByRole("radio");
    radios[0].focus();
    await user.keyboard("{ArrowDown}");
    expect(radios[1]).toHaveFocus();
    expect(radios[1]).toHaveAttribute("aria-checked", "true");
    expect(radios[0]).toHaveAttribute("tabindex", "-1");
    await user.keyboard("{End}");
    expect(radios.at(-1)).toHaveFocus();
    await user.keyboard("{Home}");
    expect(radios[0]).toHaveFocus();
  });

  it("shows truthful recovery copy when local storage writes are unavailable", async () => {
    const user = userEvent.setup();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Storage full", "QuotaExceededError");
    });
    render(<QuizExperience service={createFakeQuizService()} />);
    await user.click(await screen.findByRole("button", { name: /service-based business/i }));
    await completeContactStep(user);
    expect(await screen.findByRole("status")).toHaveTextContent(/recovery is unavailable/i);
    expect(screen.getByText(/recovery is unavailable in this browser/i)).toBeInTheDocument();
  });

  it("offers resume, start-over, and not-now choices for an unfinished attempt", async () => {
    const user = userEvent.setup();
    const now = Date.now();
    const attempt: SavedQuizAttempt = {
      storageVersion: 3,
      cortexVersion: CORTEX_VERSION,
      questionSetVersion: QUESTION_SET_VERSION,
      catalogVersion: CATALOG_VERSION,
      status: "in_progress",
      audienceKey: "coaches_educators",
      answers: { q1_goal: ["coach_goal_book_calls"] },
      currentQuestionIndex: 1,
      result: null,
      roadmapSelection: null,
      createdAt: new Date(now - 60_000).toISOString(),
      updatedAt: new Date(now - 30_000).toISOString(),
      expiresAt: new Date(now + QUIZ_TTL_MS).toISOString(),
    };
    localStorage.setItem(QUIZ_STORAGE_KEY, JSON.stringify(attempt));

    const { unmount } = render(<QuizExperience service={createFakeQuizService()} />);
    const dialog = await screen.findByRole("dialog", { name: /continue your roadmap/i });
    const resumeButton = within(dialog).getByRole("button", { name: /resume/i });
    expect(resumeButton).toHaveFocus();
    expect(within(dialog).getByRole("button", { name: /start over/i })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: /not now/i })).toBeInTheDocument();
    const notNowButton = within(dialog).getByRole("button", { name: /not now/i });
    notNowButton.focus();
    await user.tab();
    expect(resumeButton).toHaveFocus();
    await user.click(resumeButton);
    expect(screen.getByRole("heading", { name: /where should we send your proposal/i })).toBeInTheDocument();
    await completeContactStep(user);
    await user.click(screen.getByRole("button", { name: /start my assessment/i }));
    expect(screen.getByText("Question 2 of 8")).toBeInTheDocument();

    unmount();
    render(<QuizExperience service={createFakeQuizService()} />);
    await user.click(within(await screen.findByRole("dialog", { name: /continue your roadmap/i })).getByRole("button", { name: /start over/i }));
    expect(screen.getByRole("heading", { name: /which best describes your business/i })).toBeInTheDocument();
    expect(localStorage.getItem(QUIZ_STORAGE_KEY)).toBeNull();
  });

  it("renders a contact-qualified personalized proposal without persisting contact identity", async () => {
    const user = userEvent.setup();
    render(<QuizExperience service={createFakeQuizService()} />);
    await user.click(await screen.findByRole("button", { name: /custom-order business/i }));
    await completeContactStep(user, { firstName: "Mara", lastName: "Santos", businessName: "La Jaysiedel Cakes", email: "mara@example.com" });
    await user.click(screen.getByRole("button", { name: /start my assessment/i }));

    const definition = QUIZ_DEFINITIONS.custom_order_businesses;
    for (const [index, question] of definition.questions.entries()) {
      await user.click(screen.getByRole(question.selection === "single" ? "radio" : "button", { name: question.options[0].label }));
      await user.click(screen.getByRole("button", { name: index === 7 ? /see my roadmap/i : /continue/i }));
    }
    expect(await screen.findByRole("heading", { name: /Mara.*La Jaysiedel Cakes/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /where La Jaysiedel Cakes is now/i })).toBeInTheDocument();

    const saved = localStorage.getItem(QUIZ_STORAGE_KEY);
    expect(saved).not.toBeNull();
    expect(saved).not.toContain("Mara");
    expect(saved).not.toContain("La Jaysiedel Cakes");
    expect(saved).not.toContain("mara@example.com");
  });
});
