import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { mkdir, readFile, readdir, realpath, stat, writeFile } from "node:fs/promises";
import { dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { chromium } from "@playwright/test";

const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  tablet: { width: 768, height: 1024 },
  mobile: { width: 390, height: 844 },
};
const WATERMARK = "Prepared for Meghan · Elysha Works concept";
const STAGING_ROOT = resolve(".tmp/manual-proposals");
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function inside(parent, candidate) {
  const rel = relative(parent, candidate);
  return rel === "" || (rel !== ".." && !rel.startsWith(".." + resolve("/").slice(-1)) && !isAbsolute(rel));
}

function localReference(raw, fromFile, sourceRoot) {
  if (!raw || /^(?:https?:|data:|#|javascript:|mailto:|tel:|\/\/)/iu.test(raw)) return null;
  const clean = raw.split(/[?#]/u)[0];
  if (!clean) return null;
  const target = clean.startsWith("/")
    ? resolve(sourceRoot, "." + clean)
    : resolve(dirname(fromFile), clean);
  return inside(sourceRoot, target) ? target : null;
}

async function collectDependencies(sourceRoot, served) {
  const pending = [join(sourceRoot, "index.html"), ...served];
  const seen = new Set();
  while (pending.length) {
    const file = pending.pop();
    if (!file || seen.has(file) || !inside(sourceRoot, file)) continue;
    let bytes;
    try {
      bytes = await readFile(file);
    } catch {
      throw new Error("Referenced local asset is missing: " + relative(sourceRoot, file));
    }
    seen.add(file);
    const extension = extname(file).toLowerCase();
    if (![".html", ".css", ".js"].includes(extension)) continue;
    const content = bytes.toString("utf8");
    const refs = extension === ".html"
      ? [...content.matchAll(/(?:src|href|poster)=["']([^"']+)["']/giu)]
      : extension === ".css"
        ? [...content.matchAll(/url\(\s*["']?([A-Za-z0-9_./-]+(?:[?#][A-Za-z0-9_./?&=-]+)?)["']?\s*\)/giu)]
        : [...content.matchAll(/["'](assets\/[A-Za-z0-9_./-]+\.(?:png|jpe?g|webp|svg|gif|woff2?))["']/giu)];
    for (const match of refs) {
      const target = localReference(match[1], file, sourceRoot);
      if (target && !seen.has(target)) pending.push(target);
    }
  }
  const digest = createHash("sha256");
  for (const file of [...seen].sort()) {
    digest.update(relative(sourceRoot, file).replaceAll("\\", "/"));
    digest.update("\0");
    digest.update(await readFile(file));
    digest.update("\0");
  }
  return digest.digest("hex");
}

async function startSourceServer(sourceRoot, served) {
  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname);
      const file = resolve(sourceRoot, "." + (pathname === "/" ? "/index.html" : pathname));
      if (!inside(sourceRoot, file) || !(await stat(file)).isFile()) {
        response.writeHead(404).end();
        return;
      }
      served.add(file);
      response.writeHead(200, { "content-type": MIME[extname(file).toLowerCase()] ?? "application/octet-stream" });
      response.end(await readFile(file));
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise((done, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", done);
  });
  return server;
}

async function addWatermark(page) {
  await page.evaluate((label) => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="440" height="250"><g transform="rotate(-24 220 125)"><text x="20" y="125" font-family="Arial,sans-serif" font-size="18" font-weight="700" fill="#171717" fill-opacity=".19">' + label + "</text></g></svg>";
    const overlay = document.createElement("div");
    overlay.setAttribute("aria-hidden", "true");
    overlay.style.position = "absolute";
    overlay.style.inset = "0 auto auto 0";
    overlay.style.width = "100%";
    overlay.style.height = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight) + "px";
    overlay.style.zIndex = "2147483647";
    overlay.style.pointerEvents = "none";
    overlay.style.backgroundImage = 'url("data:image/svg+xml,' + encodeURIComponent(svg) + '")';
    overlay.style.backgroundRepeat = "repeat";
    document.body.append(overlay);
  }, WATERMARK);
}

export async function captureManualPreview({ sourceDir, outputDir, browser } = {}) {
  if (typeof sourceDir !== "string" || typeof outputDir !== "string") {
    throw new Error("Source and output directories are required");
  }
  const sourceRoot = await realpath(sourceDir);
  const outputRoot = resolve(outputDir);
  if (!inside(STAGING_ROOT, outputRoot) || inside(sourceRoot, outputRoot)) {
    throw new Error("Captures must stay in ignored staging outside the source");
  }
  await stat(join(sourceRoot, "index.html"));
  await mkdir(outputRoot, { recursive: true });
  const served = new Set();
  const server = await startSourceServer(sourceRoot, served);
  const ownBrowser = !browser;
  const activeBrowser = browser ?? await chromium.launch({ headless: true });
  const files = {};
  const capturedAt = new Date().toISOString();
  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Source server unavailable");
    for (const [mode, viewport] of Object.entries(VIEWPORTS)) {
      const page = await activeBrowser.newPage({ viewport, deviceScaleFactor: 1, reducedMotion: "reduce" });
      try {
        await page.goto("http://127.0.0.1:" + address.port + "/", { waitUntil: "load" });
        await page.evaluate(async () => {
          await document.fonts.ready;
          const step = Math.max(500, window.innerHeight * 0.8);
          for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
            window.scrollTo(0, y);
            await new Promise((done) => setTimeout(done, 40));
          }
          window.scrollTo(0, 0);
        });
        await page.waitForTimeout(200);
        await addWatermark(page);
        const file = join(outputRoot, mode + ".png");
        await page.screenshot({ path: file, fullPage: true, animations: "disabled" });
        files[mode] = file;
      } finally {
        await page.close();
      }
    }
    const sourceHash = await collectDependencies(sourceRoot, served);
    await writeFile(join(outputRoot, "manifest.json"), JSON.stringify({
      sourceHash,
      capturedAt,
      files,
      watermarkText: WATERMARK,
    }, null, 2) + "\n");
    return { sourceHash, capturedAt, files, watermarkText: WATERMARK };
  } finally {
    await new Promise((done) => server.close(done));
    if (ownBrowser) await activeBrowser.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const sourceDir = args[args.indexOf("--source") + 1];
  const outputDir = args[args.indexOf("--output") + 1];
  captureManualPreview({ sourceDir, outputDir }).then((result) => {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  }).catch((error) => {
    process.stderr.write(String(error) + "\n");
    process.exitCode = 1;
  });
}
