"use client";

import { useEffect } from "react";

const scripts = [
  "/assets/vendor/scrollcraft/scrollcraft.js",
  "/site.js",
  "/assets/v3-project-viewer.js",
  "/assets/v3-content-guard.js",
  "/assets/rhea-chat.mjs?v=hero-20260921",
];

function loadScript(source: string) {
  const selector = `script[data-live-runtime-src="${source}"]`;
  const existing = document.querySelector<HTMLScriptElement>(selector);

  if (existing?.dataset.loaded === "true") {
    return Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    const script = existing ?? document.createElement("script");
    const finish = () => {
      script.dataset.loaded = "true";
      resolve();
    };

    script.addEventListener("load", finish, { once: true });
    script.addEventListener("error", () => reject(new Error(`Unable to load ${source}`)), {
      once: true,
    });

    if (!existing) {
      script.src = source;
      script.dataset.liveRuntimeSrc = source;
      if (source.includes(".mjs")) script.type = "module";
      document.body.append(script);
    }
  });
}

export function LiveRuntime() {
  useEffect(() => {
    document.documentElement.classList.add("js-ready");
    void scripts.reduce(
      (chain, source) => chain.then(() => loadScript(source)),
      Promise.resolve(),
    );
  }, []);

  return null;
}
