"use client";

import { useState } from "react";

import { SITE_CONTENT } from "@/data/site-content";

export function FaqSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(2);
  return (
    <section className="portfolio-section faq-section" id="faq" aria-labelledby="faq-title">
      <div className="portfolio-shell faq-grid">
        <header className="faq-intro">
          <p className="section-eyebrow">Questions, answered</p>
          <h2 id="faq-title">Clarity before<br /><span>you commit.</span></h2>
          <p>Straight answers to the most common questions, so you can move forward with confidence.</p>
        </header>
        <div className="faq-list">
          {SITE_CONTENT.faq.map((item, index) => {
            const open = openIndex === index;
            const answerId = `faq-answer-${index}`;
            return (
              <article className="faq-item" key={item.question}>
                <button
                  type="button"
                  aria-expanded={open}
                  aria-controls={answerId}
                  onClick={() => setOpenIndex(open ? null : index)}
                >
                  <span className="faq-number">{String(index + 1).padStart(2, "0")}</span>
                  <span>{item.question}</span>
                  <span className="faq-toggle" aria-hidden="true">{open ? "−" : "+"}</span>
                </button>
                <div id={answerId} hidden={!open} className="faq-answer">
                  <p>{item.answer}</p>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
