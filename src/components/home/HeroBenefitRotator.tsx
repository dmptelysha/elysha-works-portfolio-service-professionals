"use client";

import { useEffect, useRef, useState } from "react";

const TYPE_DELAY_MS = 55;
const DELETE_DELAY_MS = 30;
const HOLD_DELAY_MS = 4_000;
const BETWEEN_BENEFITS_MS = 180;

type HeroBenefitRotatorProps = {
  benefits: readonly string[];
};

export function HeroBenefitRotator({ benefits }: HeroBenefitRotatorProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [benefitIndex, setBenefitIndex] = useState(0);
  const [displayedText, setDisplayedText] = useState("");
  const [phase, setPhase] = useState<"typing" | "deleting">("typing");
  const [isVisible, setIsVisible] = useState(true);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncPreference = () => setPrefersReducedMotion(media.matches);
    syncPreference();
    media.addEventListener("change", syncPreference);
    return () => media.removeEventListener("change", syncPreference);
  }, []);

  useEffect(() => {
    if (!("IntersectionObserver" in window) || !rootRef.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => setIsVisible(entry?.isIntersecting ?? true),
      { threshold: 0.05 },
    );
    observer.observe(rootRef.current);
    return () => observer.disconnect();
  }, []);

  const currentBenefit = benefits[benefitIndex] ?? "";
  const canAnimate = Boolean(currentBenefit) && isVisible && !prefersReducedMotion;

  useEffect(() => {
    if (!canAnimate) return;

    let delay = BETWEEN_BENEFITS_MS;
    let nextStep = () => {
      setBenefitIndex((index) => (index + 1) % benefits.length);
      setPhase("typing");
    };

    if (phase === "typing" && displayedText.length < currentBenefit.length) {
      delay = TYPE_DELAY_MS;
      nextStep = () => setDisplayedText(currentBenefit.slice(0, displayedText.length + 1));
    } else if (phase === "typing") {
      delay = HOLD_DELAY_MS;
      nextStep = () => setPhase("deleting");
    } else if (displayedText.length > 0) {
      delay = DELETE_DELAY_MS;
      nextStep = () => setDisplayedText((text) => text.slice(0, -1));
    }

    const timer = window.setTimeout(nextStep, delay);
    return () => window.clearTimeout(timer);
  }, [benefits.length, canAnimate, currentBenefit, displayedText, phase]);

  const accessibleLabel = `What your personalized roadmap includes: ${benefits.join(", ")}`;
  const visibleText = prefersReducedMotion ? (benefits[0] ?? "") : displayedText;

  return (
    <div
      ref={rootRef}
      className={`hero-benefits${canAnimate ? " is-animating" : ""}`}
      role="group"
      aria-label={accessibleLabel}
    >
      <span className="hero-benefit-visual" aria-hidden="true">
        <span className="hero-benefit-text" data-testid="hero-benefit-text">{visibleText}</span>
        <span className="hero-benefit-cursor" />
      </span>
    </div>
  );
}
