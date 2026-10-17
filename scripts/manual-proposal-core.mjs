import { createHmac, randomBytes as cryptoRandomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { extname, isAbsolute, relative, resolve } from "node:path";

import { validateManualDraft } from "../supabase/functions/_shared/manual-proposal-model.ts";

const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const VIEWPORTS = ["desktop", "tablet", "mobile"];
const STAGING_ROOT = resolve(".tmp/manual-proposals");
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const HASH_PATTERN = /^[0-9a-f]{64}$/u;
const PNG_MAGIC = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const BUCKET = "manual-proposal-previews";

function inside(parent, candidate) {
  const rel = relative(parent, candidate);
  return rel === "" || (rel !== ".." && !rel.startsWith("../") && !rel.startsWith("..\\") && !isAbsolute(rel));
}
function requireUuid(value, label) {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new Error(label + " must be a UUID");
  }
  return value;
}
function requireRpc(result, label) {
  if (result.error) throw new Error(label + " failed");
  return result.data;
}
function validateManifest(manifest) {
  if (!manifest || typeof manifest !== "object" ||
      typeof manifest.sourceHash !== "string" || !HASH_PATTERN.test(manifest.sourceHash) ||
      typeof manifest.capturedAt !== "string" || Number.isNaN(Date.parse(manifest.capturedAt)) ||
      !manifest.files || typeof manifest.files !== "object") {
    throw new Error("Invalid capture manifest");
  }
  for (const mode of VIEWPORTS) {
    const value = manifest.files[mode];
    if (typeof value !== "string" || extname(value).toLowerCase() !== ".png" ||
        !inside(STAGING_ROOT, resolve(value))) {
      throw new Error("Capture files must be PNGs in ignored staging");
    }
  }
  return manifest;
}
function snapshotFor(draftInput, manifestInput) {
  const draft = validateManualDraft(draftInput);
  const manifest = validateManifest(manifestInput);
  const { captureManifestPath: _localOnly, ...display } = draft;
  return {
    ...display,
    previewCapturedAt: manifest.capturedAt,
    previewSourceHash: manifest.sourceHash,
  };
}
function hashCode(code, pepper) {
  if (typeof pepper !== "string" || pepper.length < 32) throw new Error("Proposal pepper is required");
  return createHmac("sha256", pepper).update("manual-proposal:" + code).digest("hex");
}

export function generateManualAccessCode(randomBytes = cryptoRandomBytes) {
  const bytes = randomBytes(12);
  if (!(bytes instanceof Uint8Array) || bytes.length !== 12) {
    throw new Error("Random source must provide twelve bytes");
  }
  return Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length]).join("");
}

export async function createDraft({ client, draft, manifest, supersedesId = null }) {
  const snapshot = snapshotFor(draft, manifest);
  if (supersedesId !== null) requireUuid(supersedesId, "supersedesId");
  const result = await client.rpc("create_manual_proposal_draft", {
    p_snapshot: snapshot,
    p_expires_at: snapshot.expiresAt,
    p_supersedes_id: supersedesId,
  });
  return requireUuid(requireRpc(result, "Create draft"), "Created draft ID");
}

export async function issueDraft({
  client,
  draftId,
  draft,
  manifest,
  pepper,
  baseUrl,
  randomBytes = cryptoRandomBytes,
  uuid = randomUUID,
  readCapture = readFile,
  write = (message) => process.stdout.write(message),
}) {
  requireUuid(draftId, "draftId");
  const snapshot = snapshotFor(draft, manifest);
  if (typeof baseUrl !== "string") throw new Error("Proposal base URL is required");
  const site = new URL(baseUrl);
  if (site.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(site.hostname)) {
    throw new Error("Proposal base URL must use HTTPS");
  }
  if (site.pathname !== "/" || site.search || site.hash) {
    throw new Error("Proposal base URL must be the site origin");
  }
  hashCode("2".repeat(12), pepper);
  const storage = client.storage.from(BUCKET);
  const uploaded = [];
  const paths = {};
  try {
    for (const mode of VIEWPORTS) {
      const bytes = await readCapture(manifest.files[mode]);
      if (!(bytes instanceof Uint8Array) || bytes.length < PNG_MAGIC.length ||
          bytes.length > 25 * 1024 * 1024 ||
          !Buffer.from(bytes.subarray(0, PNG_MAGIC.length)).equals(PNG_MAGIC)) {
        throw new Error("Capture is not a valid-size PNG");
      }
      const path = "manual/" + draftId + "/" + mode + ".png";
      const result = await storage.upload(path, bytes, { contentType: "image/png", upsert: false });
      if (result.error) throw new Error("Private preview upload failed");
      uploaded.push(path);
      paths[mode] = path;
    }
    const reference = requireUuid(uuid(), "reference");
    const code = generateManualAccessCode(randomBytes);
    const result = await client.rpc("issue_manual_proposal", {
      p_id: draftId,
      p_reference: reference,
      p_access_hash: hashCode(code, pepper),
      p_preview_paths: paths,
      p_issued_at: new Date().toISOString(),
    });
    requireRpc(result, "Issue proposal");
    const link = site.origin + "/proposal/client/?ref=" + encodeURIComponent(reference);
    write("Share link: " + link + "\nAccess code: " + code + "\n");
    return { reference, link };
  } catch (error) {
    if (uploaded.length) await storage.remove(uploaded);
    throw error;
  }
}

export async function rotateCode({
  client,
  id,
  pepper,
  randomBytes = cryptoRandomBytes,
  write = (message) => process.stdout.write(message),
}) {
  requireUuid(id, "id");
  const code = generateManualAccessCode(randomBytes);
  const result = await client.rpc("rotate_manual_proposal_code", {
    p_id: id,
    p_access_hash: hashCode(code, pepper),
  });
  requireRpc(result, "Rotate code");
  write("New access code: " + code + "\n");
}

export async function revokeDraft({ client, id }) {
  requireUuid(id, "id");
  requireRpc(await client.rpc("revoke_manual_proposal", { p_id: id }), "Revoke proposal");
}

export async function cleanupPreviews({ client }) {
  const due = requireRpc(await client.rpc("list_expired_manual_preview_objects"), "List expired previews");
  if (!Array.isArray(due)) throw new Error("Invalid cleanup response");
  let count = 0;
  const storage = client.storage.from(BUCKET);
  for (const row of due) {
    const paths = VIEWPORTS.map((mode) => row.preview_paths?.[mode]);
    if (paths.some((path) => typeof path !== "string" || !/^manual\/[A-Za-z0-9/_-]+[.]png$/u.test(path))) {
      throw new Error("Invalid private preview path");
    }
    const removed = await storage.remove(paths);
    requireRpc(removed, "Remove expired previews");
    requireRpc(await client.rpc("mark_manual_preview_cleaned", { p_id: row.id }), "Record preview cleanup");
    count += 1;
  }
  return count;
}
