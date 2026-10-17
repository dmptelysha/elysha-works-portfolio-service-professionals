"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";

import type { PreviewBlobs, PreviewMode } from "./service";

const MODES: readonly PreviewMode[] = ["desktop", "tablet", "mobile"];

export function ManualProposalPreviewDialog({
  previewBlobs,
  previewLoading,
  clientName,
  onClose,
}: {
  previewBlobs: PreviewBlobs;
  previewLoading: boolean;
  clientName: string;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<PreviewMode>("desktop");
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previousFocus.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      previousFocus.current?.focus();
    };
  }, []);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
    ) ?? []);
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

  function onTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, current: PreviewMode) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const index = MODES.indexOf(current);
    const next = MODES[(index + (event.key === "ArrowRight" ? 1 : -1) + MODES.length) % MODES.length];
    setMode(next);
    dialogRef.current?.querySelector<HTMLButtonElement>('[data-mode="' + next + '"]')?.focus();
  }

  const image = previewBlobs[mode];
  return createPortal(
    <div className="manual-preview-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <div
        ref={dialogRef}
        className="manual-preview-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Concept preview"
        onKeyDown={onKeyDown}
      >
        <div className="manual-preview-toolbar">
          <div>
            <p className="manual-proposal-eyebrow">Design concept</p>
            <h2>Explore the page</h2>
          </div>
          <div className="manual-preview-actions">
            <div role="tablist" aria-label="Preview size" className="manual-preview-tabs">
              {MODES.map((candidate) => (
                <button
                  type="button"
                  role="tab"
                  key={candidate}
                  data-mode={candidate}
                  aria-selected={mode === candidate}
                  tabIndex={mode === candidate ? 0 : -1}
                  onClick={() => setMode(candidate)}
                  onKeyDown={(event) => onTabKeyDown(event, candidate)}
                >
                  {candidate[0].toUpperCase() + candidate.slice(1)}
                </button>
              ))}
            </div>
            <button ref={closeRef} type="button" className="manual-preview-close" aria-label="Close preview" onClick={onClose}>
              Close <span aria-hidden="true">×</span>
            </button>
          </div>
        </div>
        <p className="manual-preview-note">Prepared for {clientName} as a concept. Service details and claims need confirmation before publication.</p>
        <div className="manual-preview-scroll" role="tabpanel" aria-label={mode[0].toUpperCase() + mode.slice(1) + " preview"}>
          {image ? (
            <div className={"manual-preview-canvas manual-preview-canvas--" + mode}>
              <img src={image} alt={mode[0].toUpperCase() + mode.slice(1) + " concept"} draggable={false} onDragStart={(event) => event.preventDefault()} />
            </div>
          ) : (
            <p className="manual-preview-unavailable">{previewLoading ? "Loading " + mode + " preview…" : mode[0].toUpperCase() + mode.slice(1) + " preview unavailable. You can still review the offers and book a call."}</p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
