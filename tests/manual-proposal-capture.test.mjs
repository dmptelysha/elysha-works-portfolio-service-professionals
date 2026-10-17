import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import test from "node:test";

import { captureManualPreview } from "../scripts/capture-manual-proposal.mjs";

const stagingRoot = resolve(".tmp/manual-proposals");

function pngWidth(bytes) {
  assert.equal(bytes.toString("ascii", 1, 4), "PNG");
  return bytes.readUInt32BE(16);
}

function hash(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

test("three watermarked viewport captures preserve the source and track CSS and asset changes", async (t) => {
  const sourceDir = await mkdtemp(join(tmpdir(), "manual-proposal-capture-"));
  const outputDir = join(stagingRoot, "capture-test");
  const sourceRelative = relative(tmpdir(), sourceDir);
  const outputRelative = relative(stagingRoot, outputDir);
  assert.ok(sourceRelative && !sourceRelative.startsWith("..") && !isAbsolute(sourceRelative));
  assert.ok(outputRelative && !outputRelative.startsWith("..") && !isAbsolute(outputRelative));
  t.after(async () => {
    await rm(sourceDir, { recursive: true, force: true });
    await rm(outputDir, { recursive: true, force: true });
  });
  await mkdir(join(sourceDir, "assets"), { recursive: true });
  const html = '<!doctype html><html><head><link rel="stylesheet" href="style.css"><script src="code.js" defer></script></head><body><main><h1>Meghan concept</h1><img src="assets/dot.svg" alt=""></main></body></html>';
  await writeFile(join(sourceDir, "index.html"), html);
  await writeFile(join(sourceDir, "style.css"), "body{margin:0;background:#eee}main{height:1300px}");
  await writeFile(join(sourceDir, "code.js"), 'const minifiedText = "url(===c){b.push(gr,0,k[gr]),o=ge(o),v.svg)";');
  await writeFile(join(sourceDir, "assets/dot.svg"), '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><circle cx="16" cy="16" r="16" fill="red"/></svg>');
  const sourceBefore = await readFile(join(sourceDir, "index.html"));

  const first = await captureManualPreview({ sourceDir, outputDir, clientName: "Avery" });
  assert.equal(first.sourceHash.length, 64);
  assert.deepEqual(await readFile(join(sourceDir, "index.html")), sourceBefore);
  for (const [mode, width] of [["desktop", 1440], ["tablet", 768], ["mobile", 390]]) {
    assert.equal(pngWidth(await readFile(first.files[mode])), width);
  }
  assert.notEqual(hash(await readFile(first.files.desktop)), hash(await readFile(first.files.tablet)));
  assert.equal(first.watermarkText, "Prepared for Avery · Elysha Works concept");

  await writeFile(join(sourceDir, "style.css"), "body{margin:0;background:#ddd}main{height:1300px}");
  const cssChange = await captureManualPreview({ sourceDir, outputDir, clientName: "Avery" });
  assert.notEqual(cssChange.sourceHash, first.sourceHash);
  await writeFile(join(sourceDir, "assets/dot.svg"), '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><circle cx="16" cy="16" r="16" fill="blue"/></svg>');
  const assetChange = await captureManualPreview({ sourceDir, outputDir, clientName: "Avery" });
  assert.notEqual(assetChange.sourceHash, cssChange.sourceHash);
});

test("capture refuses output outside ignored staging or inside the source", async () => {
  await assert.rejects(() => captureManualPreview({
    sourceDir: process.cwd(),
    outputDir: resolve("public/manual"),
  }));
});

test("browser launch failure closes the temporary source server", async (t) => {
  const sourceDir = await mkdtemp(join(tmpdir(), "manual-proposal-launch-"));
  const outputDir = join(stagingRoot, "launch-test");
  let server;
  assert.ok(relative(tmpdir(), sourceDir) && !relative(tmpdir(), sourceDir).startsWith(".."));
  assert.ok(relative(stagingRoot, outputDir) && !relative(stagingRoot, outputDir).startsWith(".."));
  t.after(async () => {
    if (server?.listening) await new Promise((done) => server.close(done));
    await rm(sourceDir, { recursive: true, force: true });
    await rm(outputDir, { recursive: true, force: true });
  });
  await writeFile(join(sourceDir, "index.html"), "<!doctype html><title>Concept</title>");
  await assert.rejects(() => captureManualPreview({
    sourceDir, outputDir, clientName: "Avery",
    onServerStarted: (started) => { server = started; },
    launchBrowser: async () => { throw new Error("Chromium unavailable"); },
  }), /Chromium unavailable/);
  assert.equal(server?.listening, false);
});
