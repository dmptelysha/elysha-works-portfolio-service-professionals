import { copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const exportRoot = join(process.cwd(), "out");
const compatibilityFiles = [
  {
    source: join(exportRoot, "quiz", "__next.quiz", "__PAGE__.txt"),
    target: join(exportRoot, "quiz", "__next.quiz.__PAGE__.txt"),
  },
];

for (const { source, target } of compatibilityFiles) {
  if (!existsSync(source)) {
    throw new Error(`Expected static export payload is missing: ${source}`);
  }
  copyFileSync(source, target);
}

console.log("Prepared Firebase-compatible Next static route payloads.");
