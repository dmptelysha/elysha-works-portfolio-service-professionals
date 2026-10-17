import { createHash, randomBytes } from "node:crypto";
import { readFile, realpath, writeFile, mkdir } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";

import { validateManualDraft } from "../supabase/functions/_shared/manual-proposal-model.ts";
import {
  cleanupPreviews,
  createDraft,
  issueDraft,
  revokeDraft,
  rotateCode,
} from "./manual-proposal-core.mjs";

const STAGING = resolve(".tmp/manual-proposals");
const RECEIPTS = join(STAGING, "receipts");
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function inside(parent, candidate) {
  const rel = relative(parent, candidate);
  return rel === "" || (rel !== ".." && !rel.startsWith("../") && !rel.startsWith("..\\") && !isAbsolute(rel));
}
function option(args, name) {
  const index = args.indexOf("--" + name);
  return index < 0 ? null : args[index + 1];
}
function required(value, name) {
  if (!value) throw new Error(name + " is required");
  return value;
}
export async function reviewedInputDigest(draft, manifest, readCapture = readFile, resolveCapture = realpath) {
  const realStage = await realpath(STAGING);
  const hash = createHash("sha256").update(JSON.stringify({ draft, manifest }));
  for (const mode of ["desktop", "tablet", "mobile"]) {
    const path = manifest.files?.[mode];
    if (typeof path !== "string") throw new Error("Capture manifest is incomplete");
    const realCapture = await resolveCapture(resolve(path));
    if (!inside(realStage, realCapture)) throw new Error("Captures must stay in ignored staging");
    hash.update(mode);
    hash.update(await readCapture(realCapture));
  }
  return hash.digest("hex");
}
async function checkedLocalJson(path) {
  const realStage = await realpath(STAGING);
  const realFile = await realpath(resolve(path));
  if (!inside(realStage, realFile)) throw new Error("Authoring files must stay in ignored staging");
  return JSON.parse(await readFile(realFile, "utf8"));
}
async function inputAndManifest(inputPath) {
  const draft = validateManualDraft(await checkedLocalJson(inputPath));
  const manifest = await checkedLocalJson(draft.captureManifestPath);
  return { draft, manifest };
}
function clientFromEnv() {
  const url = required(process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL, "SUPABASE_URL");
  const key = required(process.env.SUPABASE_SERVICE_ROLE_KEY, "SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export async function main(args = process.argv.slice(2)) {
  const [verb] = args;
  if (verb === "--help" || verb === "help" || !verb) {
    process.stdout.write("Usage: manual-proposal <validate|draft|issue|rotate|revoke|cleanup> [--input staged.json] [--id uuid] [--supersedes uuid]\n");
    return;
  }
  if (!["validate", "draft", "issue", "rotate", "revoke", "cleanup"].includes(verb)) {
    throw new Error("Unknown manual proposal command");
  }
  if (verb === "validate") {
    const { draft, manifest } = await inputAndManifest(required(option(args, "input"), "--input"));
    if (!manifest.sourceHash || !manifest.files?.desktop || !manifest.files?.tablet || !manifest.files?.mobile) {
      throw new Error("Capture manifest is incomplete");
    }
    process.stdout.write(draft.clientName + " draft valid with " + draft.offers.length + " offers and 3 captures.\n");
    return;
  }
  const client = clientFromEnv();
  if (verb === "draft") {
    const { draft, manifest } = await inputAndManifest(required(option(args, "input"), "--input"));
    const supersedesId = option(args, "supersedes");
    if (supersedesId && !UUID_PATTERN.test(supersedesId)) throw new Error("Invalid superseded ID");
    const inputDigest = await reviewedInputDigest(draft, manifest);
    const id = await createDraft({ client, draft, manifest, supersedesId });
    await mkdir(RECEIPTS, { recursive: true });
    await writeFile(join(RECEIPTS, id + ".json"), JSON.stringify({
      id,
      inputDigest,
    }, null, 2) + "\n", { flag: "wx" });
    process.stdout.write("Draft created: " + id + "\nReceipt: .tmp/manual-proposals/receipts/" + id + ".json\n");
    return;
  }
  if (verb === "issue") {
    const id = required(option(args, "id"), "--id");
    if (!UUID_PATTERN.test(id)) throw new Error("Invalid draft ID");
    const { draft, manifest } = await inputAndManifest(required(option(args, "input"), "--input"));
    const receipt = await checkedLocalJson(join(RECEIPTS, id + ".json"));
    if (receipt.id !== id || receipt.inputDigest !== await reviewedInputDigest(draft, manifest)) {
      throw new Error("Draft changed after creation; create a new revision");
    }
    await issueDraft({
      client, draftId: id, draft, manifest,
      pepper: required(process.env.PROPOSAL_KEY_PEPPER, "PROPOSAL_KEY_PEPPER"),
      baseUrl: required(process.env.PUBLIC_PROPOSAL_BASE_URL, "PUBLIC_PROPOSAL_BASE_URL"),
      randomBytes,
    });
    return;
  }
  if (verb === "rotate") {
    await rotateCode({
      client,
      id: required(option(args, "id"), "--id"),
      pepper: required(process.env.PROPOSAL_KEY_PEPPER, "PROPOSAL_KEY_PEPPER"),
    });
    return;
  }
  if (verb === "revoke") {
    await revokeDraft({ client, id: required(option(args, "id"), "--id") });
    process.stdout.write("Proposal revoked.\n");
    return;
  }
  const count = await cleanupPreviews({ client });
  process.stdout.write("Cleaned preview sets: " + count + "\n");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(String(error) + "\n");
    process.exitCode = 1;
  });
}
