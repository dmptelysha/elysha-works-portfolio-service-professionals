"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { SITE_CONTENT } from "@/data/site-content";

export function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <span>&lt;</span> <b>Elysha Works</b> <span>/&gt;</span>
    </span>
  );
}

export function ContextualNav() {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState("projects");
  const [pastHero, setPastHero] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && open) {
        setOpen(false);
        queueMicrotask(() => buttonRef.current?.focus());
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      if (open && rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  useEffect(() => {
    if (!("IntersectionObserver" in window)) return;
    const sections = ["projects", "about", "faq"]
      .map((id) => document.getElementById(id))
      .filter((element): element is HTMLElement => Boolean(element));
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible?.target.id) setActive(visible.target.id);
      },
      { rootMargin: "-20% 0px -60%", threshold: [0, 0.2, 0.5] },
    );
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!("IntersectionObserver" in window)) return;
    const hero = document.getElementById("top");
    if (!hero) return;
    const observer = new IntersectionObserver(
      ([entry]) => setPastHero(!entry.isIntersecting),
      { threshold: 0.01 },
    );
    observer.observe(hero);
    return () => observer.disconnect();
  }, []);

  const close = () => setOpen(false);
  return (
    <div className={`contextual-nav${pastHero ? " contextual-nav--visible" : ""}`} ref={rootRef}>
      <nav className="portfolio-nav" aria-label="Portfolio navigation">
        <Link className="portfolio-nav-brand" href="/#top" aria-label="Elysha Works home" onClick={close}>
          <BrandMark />
        </Link>
        <div className="portfolio-nav-links">
          {SITE_CONTENT.navigation.map((item) => {
            const section = item.href.slice(1);
            return (
              <Link key={item.href} href={`/${item.href}`} aria-current={active === section ? "location" : undefined}>
                {item.label}
              </Link>
            );
          })}
        </div>
        <Link className="nav-roadmap-cta" href="/quiz" onClick={close}>Get My Roadmap</Link>
        <button
          ref={buttonRef}
          className="nav-menu-button"
          type="button"
          aria-label={open ? "Close navigation" : "Open navigation"}
          aria-expanded={open}
          aria-controls="mobile-navigation"
          onClick={() => setOpen((value) => !value)}
        >
          <span aria-hidden="true" />
          <span aria-hidden="true" />
        </button>
        <div
          id="mobile-navigation"
          data-testid="mobile-navigation"
          className="portfolio-mobile-menu"
          hidden={!open}
        >
          {SITE_CONTENT.navigation.map((item) => (
            <Link key={item.href} href={`/${item.href}`} onClick={close}>{item.label}</Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
