import { readFile } from "node:fs/promises";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import firebase from "firebase/compat/app";
import "firebase/compat/firestore";

const projectId = "elyshaworks-fd2dc";
let environment;
let db;

const now = () => new Date();
const serverTimestamp = () => firebase.firestore.FieldValue.serverTimestamp();

const validDocuments = {
  site_visitors: {
    visitor_id: "visitor_01",
    first_seen_at: serverTimestamp(),
    last_seen_at: serverTimestamp(),
    first_touch_source: "direct",
    first_touch_medium: "none",
    first_touch_campaign: "",
    landing_path: "/",
    referrer_domain: "",
    consent_status: "pending",
    quiz_started_count: 0,
    quiz_completed_count: 0,
    booking_click_count: 0,
    latest_quiz_session_id: null,
  },
  portfolio_sessions: {
    session_id: "session_01",
    visitor_id: "visitor_01",
    started_at: serverTimestamp(),
    last_activity_at: serverTimestamp(),
    landing_path: "/",
    audience_key: "service_professional",
    utm_source: "",
    utm_medium: "",
    utm_campaign: "",
    referrer_domain: "",
    device_category: "desktop",
    result_viewed: false,
    booking_cta_clicked: false,
    converted_to_lead: false,
    lead_id: null,
  },
  quiz_sessions: {
    quiz_session_id: "quiz_01",
    visitor_id: "visitor_01",
    portfolio_session_id: "session_01",
    lead_id: null,
    audience_key: "service_professional",
    question_set_version: "1.0",
    status: "in_progress",
    current_step: 1,
    last_completed_step: 0,
    started_at: serverTimestamp(),
    completed_at: null,
    last_activity_at: serverTimestamp(),
    resume_expires_at: now(),
    resumed_count: 0,
    last_resumed_at: null,
    answers: {},
    acquisition_need_score: 0,
    automation_need_score: 0,
    system_complexity_score: 0,
    website_score: 0,
    funnel_score: 0,
    automation_score: 0,
    crm_score: 0,
    custom_app_score: 0,
    systeme_fit_score: 0,
    ghl_fit_score: 0,
    custom_build_fit_score: 0,
    readiness_level: "",
    recommended_build_route: "",
    recommended_platform: "",
    recommended_offer_key: "",
    primary_solution_type: "",
    supporting_solution_types: [],
    selected_addon_keys: [],
    priced_addons: [],
    base_price_usd: 0,
    addon_total_usd: 0,
    adjustment_total_usd: 0,
    estimated_project_investment_usd: 0,
    result_snapshot: {},
    result_viewed_at: null,
  },
  leads: {
    lead_id: "lead_01",
    visitor_id: "visitor_01",
    first_name: "Test",
    last_name: null,
    email: "test@example.com",
    phone: null,
    business_name: null,
    business_url: null,
    audience_key: "service_professional",
    source: "contact_form",
    source_session_id: "session_01",
    source_quiz_session_id: null,
    crm_stage: "new",
    lead_status: "new",
    assigned_to_user_id: null,
    created_at: serverTimestamp(),
    updated_at: serverTimestamp(),
    last_contact_at: null,
    lost_reason: null,
    notes_summary: null,
  },
  analytics_events: {
    event_id: "event_01",
    event_name: "portfolio_viewed",
    occurred_at: serverTimestamp(),
    visitor_id: "visitor_01",
    portfolio_session_id: "session_01",
    quiz_session_id: null,
    lead_id: null,
    audience_key: "service_professional",
    page_path: "/",
    properties: {},
  },
};

before(async () => {
  environment = await initializeTestEnvironment({
    projectId,
    firestore: {
      host: process.env.FIRESTORE_EMULATOR_HOST?.split(":")[0] ?? "127.0.0.1",
      port: Number(process.env.FIRESTORE_EMULATOR_HOST?.split(":")[1] ?? 8085),
      rules: await readFile("firestore.rules", "utf8"),
    },
  });
  db = environment.unauthenticatedContext().firestore();
});

after(async () => environment?.cleanup());

test("anonymous visitors can create each approved document type", async () => {
  for (const [collection, data] of Object.entries(validDocuments)) {
    const id = data[`${collection === "site_visitors" ? "visitor" : collection === "portfolio_sessions" ? "session" : collection === "quiz_sessions" ? "quiz_session" : collection === "leads" ? "lead" : "event"}_id`];
    await assertSucceeds(db.collection(collection).doc(id).set(data));
  }
});

test("anonymous visitors cannot read or list approved collections", async () => {
  for (const [collection, data] of Object.entries(validDocuments)) {
    const idField = collection === "site_visitors" ? "visitor_id" : collection === "portfolio_sessions" ? "session_id" : collection === "quiz_sessions" ? "quiz_session_id" : collection === "leads" ? "lead_id" : "event_id";
    await assertFails(db.collection(collection).doc(data[idField]).get());
    await assertFails(db.collection(collection).limit(1).get());
  }
});

test("anonymous visitors cannot update or delete", async () => {
  await environment.withSecurityRulesDisabled(async (context) => {
    await context.firestore().collection("leads").doc("locked_lead").set({
      ...validDocuments.leads,
      lead_id: "locked_lead",
    });
  });

  await assertFails(db.collection("leads").doc("locked_lead").update({ first_name: "Changed" }));
  await assertFails(db.collection("leads").doc("locked_lead").delete());
});

test("authenticated clients receive the same write-only restrictions", async () => {
  const authenticatedDb = environment.authenticatedContext("user_01").firestore();
  await assertFails(authenticatedDb.collection("leads").doc("lead_01").get());
  await assertFails(authenticatedDb.collection("leads").doc("locked_lead").update({ first_name: "Changed" }));
});

test("unknown fields, mismatched ids, and unlisted collections are denied", async () => {
  await assertFails(db.collection("leads").doc("extra_field").set({
    ...validDocuments.leads,
    lead_id: "extra_field",
    is_admin: true,
  }));
  await assertFails(db.collection("leads").doc("path_id").set({
    ...validDocuments.leads,
    lead_id: "different_id",
  }));
  await assertFails(db.collection("bookings").doc("booking_01").set({ booking_id: "booking_01" }));
});

test("invalid lead defaults and oversized analytics properties are denied", async () => {
  await assertFails(db.collection("leads").doc("privileged_lead").set({
    ...validDocuments.leads,
    lead_id: "privileged_lead",
    crm_stage: "won",
  }));
  await assertFails(db.collection("analytics_events").doc("large_event").set({
    ...validDocuments.analytics_events,
    event_id: "large_event",
    properties: Object.fromEntries(Array.from({ length: 21 }, (_, index) => [`key_${index}`, index])),
  }));
});
