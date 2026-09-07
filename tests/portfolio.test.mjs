import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("..", import.meta.url));
const required = [
  "index.html", "styles.css", "script.js", "assets/manrope-ew.woff2",
  "assets/elysha-portrait-full.png", "assets/elysha-portrait-cutout.png",
  "assets/projects/la-jaysiedel-cakes.jpg", "assets/projects/client-portal.jpg",
  "assets/projects/growth-crm.jpg", "assets/projects/teacher-elysha.jpg",
  "assets/vendor/gsap.min.js", "assets/vendor/ScrollTrigger.min.js"
];
const assetHashes = {
  "assets/elysha-portrait-full.png": "E956337E8D832AA56AFF367A3481DF423A118FEAE68A344AEF2FC8F3157E494D",
  "assets/elysha-portrait-cutout.png": "C7AD433166BF90814AA17E969F46C0A1A2EC34234F56FA51FE4119ADE53459A0",
  "assets/manrope-ew.woff2": "A30DDCD349703AFF7464C34BEF3FFFDFF405EE50C113440D7C8693C02D210972",
  "assets/vendor/gsap.min.js": "96C01B81F44A3290E2B4532F55E2C9534B2ADC43273A19F3756B2CB41F0FD0B6",
  "assets/vendor/ScrollTrigger.min.js": "308219390E5E3B84CDA0C481E70CAA9820883AE10BDA44E6E9A149A81AAC4B3F",
  "assets/projects/la-jaysiedel-cakes.jpg": "AD83FA18F775A91A3C3CC7AEA07A2EB0CAD86CBAB35E03F9FCE48A178A3307A3",
  "assets/projects/client-portal.jpg": "F00137D48D84884A765BAECDD145A6991E67604A788769358A7CD2B707F50EA4",
  "assets/projects/growth-crm.jpg": "8247D9824218FEAD6C4D15682412EFA5FB5040E7998990E345F2611457A1785F",
  "assets/projects/teacher-elysha.jpg": "51907804964D29F718C95B2A4C2204753E03377F272FBFE83712195B08D84EDC"
};
const sha256 = file => createHash("sha256").update(readFileSync(join(root, file))).digest("hex").toUpperCase();

test("standalone portfolio owns every required file", () => {
  for (const file of required) assert.ok(existsSync(join(root, file)), `missing ${file}`);
  for (const [file, hash] of Object.entries(assetHashes)) assert.equal(sha256(file), hash, `${file} must be an exact approved copy`);
  assert.equal(existsSync(join(root, "firebase.json")), false);
  assert.equal(existsSync(join(root, ".firebaserc")), false);
});

test("the existing portfolio remains byte-for-byte unchanged", () => {
  const existing = join(root, "..", "Elysha Works Portfolio");
  const manifest = readFileSync(join(root, "docs/superpowers/specs/existing-portfolio-production.sha256"), "utf8").trim().split(/\r?\n/);
  const ignoredDirectories = new Set([".firebase", ".local-tools", ".tmp", ".checks", ".git", "node_modules", "tests", "docs", "scripts"]);
  function deployedFiles(directory, prefix = "") {
    return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) return ignoredDirectories.has(entry.name) ? [] : deployedFiles(join(directory, entry.name), relative);
      if (["firebase.json", ".firebaserc"].includes(entry.name) || entry.name.endsWith(".md") || entry.name.endsWith(".log") || entry.name.startsWith(".env")) return [];
      return [relative];
    }).sort();
  }
  const manifestPaths = manifest.map(line => line.slice(66)).sort();
  assert.deepEqual(deployedFiles(existing), manifestPaths, "existing portfolio deployable file set changed");
  for (const line of manifest) {
    const [, hash, file] = line.match(/^([A-F0-9]{64})  (.+)$/) ?? [];
    assert.ok(hash && file, `invalid manifest line: ${line}`);
    const actual = createHash("sha256").update(readFileSync(join(existing, file))).digest("hex").toUpperCase();
    assert.equal(actual, hash, `existing portfolio ${file} changed`);
  }
  const configuration = {
    "firebase.json": "92615881287B6445D8C990FE2843641F729BF819D14D5063F3DA3DCC874148C3",
    ".firebaserc": "C20F1239267FC81A04A6A76100789CD42B319D5C87447BDB549AE3B5A0323A69"
  };
  for (const [file, hash] of Object.entries(configuration)) {
    const actual = createHash("sha256").update(readFileSync(join(existing, file))).digest("hex").toUpperCase();
    assert.equal(actual, hash, `existing portfolio configuration ${file} changed`);
  }
});
