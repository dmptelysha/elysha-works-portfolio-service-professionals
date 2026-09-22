"use client";

import { useEffect, useRef, useState } from "react";

import { PROJECT_PREVIEW_ALLOWLIST, type PortfolioProject } from "@/data/projects";

export function isAllowedPreviewUrl(url: string) {
  return PROJECT_PREVIEW_ALLOWLIST.has(url);
}

interface ProjectPreviewDialogProps {
  project: PortfolioProject;
  onClose: () => void;
  returnFocusTo: HTMLElement | null;
}

export function ProjectPreviewDialog({ project, onClose, returnFocusTo }: ProjectPreviewDialogProps) {
  const [device, setDevice] = useState<"desktop" | "tablet" | "mobile">("desktop");
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        returnFocusTo?.focus();
        onClose();
      }
      if (event.key === "Tab" && dialogRef.current) {
        const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>("button, iframe")].filter(
          (element) => !element.hasAttribute("disabled"),
        );
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose, returnFocusTo]);

  if (!isAllowedPreviewUrl(project.previewUrl)) return null;

  const close = () => {
    returnFocusTo?.focus();
    onClose();
  };

  return (
    <div className="project-dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && close()}>
      <div
        className="project-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-dialog-title"
        aria-describedby="project-dialog-description"
        ref={dialogRef}
      >
        <header className="project-dialog-header">
          <div>
            <p>Protected project preview</p>
            <h2 id="project-dialog-title">{project.title} preview</h2>
            <span id="project-dialog-description">Choose a viewport to review the local project presentation.</span>
          </div>
          <button ref={closeRef} type="button" onClick={close} aria-label="Close project preview">×</button>
        </header>
        <div className="project-device-controls" aria-label="Preview size">
          {(["desktop", "tablet", "mobile"] as const).map((value) => (
            <button key={value} type="button" aria-pressed={device === value} onClick={() => setDevice(value)}>
              {value[0].toUpperCase() + value.slice(1)}
            </button>
          ))}
        </div>
        <div className={`project-frame project-frame--${device}`}>
          <iframe
            title={`${project.title} preview`}
            src={project.previewUrl}
            sandbox="allow-scripts allow-same-origin"
            referrerPolicy="no-referrer"
          />
        </div>
      </div>
    </div>
  );
}
