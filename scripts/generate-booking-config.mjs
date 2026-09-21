import nextEnv from "@next/env";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const outputPath = join(root, "public", "booking", "booking-config.mjs");
const { loadEnvConfig } = nextEnv;

export function buildBookingConfig(environment) {
  const apiKey = environment.NEXT_PUBLIC_BOOKING_FIREBASE_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("NEXT_PUBLIC_BOOKING_FIREBASE_API_KEY is required.");
  }

  return `// Generated from ignored local/deployment environment settings.
// This Firebase browser configuration is public after deployment; restrict the key by API and HTTP referrer.
export const bookingConfig=Object.freeze({
 mode:'production',
 apiBaseUrl:'https://crm.elyshaworks.com',
 appCheckSiteKey:'6LcXU6UtAAAAAM17HknLXDs-fD_Ha8jWLtk6tCI-',
 firebaseConfig:Object.freeze({
  projectId:'elyshaworks-fd2dc',
  appId:'1:281424869871:web:5eaa548ffb80404d03de1a',
  apiKey:${JSON.stringify(apiKey)},
  authDomain:'elyshaworks-fd2dc.firebaseapp.com'
 })
});
export function runtimeConfig(){const local=typeof location!=='undefined'&&['127.0.0.1','localhost'].includes(location.hostname);return local&&globalThis.__ELY_BOOKING_TEST_CONFIG__?globalThis.__ELY_BOOKING_TEST_CONFIG__:bookingConfig;}
`;
}

export function generateBookingConfig(environment = process.env, destination = outputPath) {
  const source = buildBookingConfig(environment);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, source, { encoding: "utf8", mode: 0o600 });
  return destination;
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";

if (import.meta.url === invokedPath) {
  loadEnvConfig(root);
  const destination = generateBookingConfig();
  process.stdout.write(`Generated ${destination.replace(`${root}\\`, "")} from environment settings.\n`);
}
