import { readFileSync } from "node:fs";
import { join } from "node:path";

function readLiveHomepageBody() {
  const source = readFileSync(
    join(process.cwd(), "src", "content", "live-home.html"),
    "utf8",
  );
  const body = source.match(/<body[^>]*>([\s\S]*?)<\/body>/i);

  if (!body) {
    throw new Error("The live portfolio snapshot does not contain a body element.");
  }

  return body[1];
}

export default function Home() {
  return (
    <div
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: readLiveHomepageBody() }}
    />
  );
}
