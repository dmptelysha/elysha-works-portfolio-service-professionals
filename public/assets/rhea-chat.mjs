const STOP_WORDS = new Set([
  "a", "an", "and", "are", "about", "can", "do", "does", "for", "her", "i", "is", "me", "my",
  "of", "please", "she", "the", "to", "what", "which", "with", "you", "your"
]);

const CONTEXT_TOOL_PATTERN = /\b(tool|tools|platform|platforms|technology|stack|used|use|built|system)\b/i;
const CONTEXT_PURPOSE_PATTERN = /\b(what is it for|purpose|why|goal|problem|help with|designed for|built for)\b/i;
const BOOKING_PATTERN = /\b(book|schedule|appointment|discovery call|work with elysha|start a project)\b/i;
const UNCONFIRMED_FACT_PATTERN = /\b(home address|phone number|age|married|charges?|rates?|costs?|pricing|guaranteed?|how much|years of experience)\b/i;

export function normalizeQuestion(value = "") {
  return String(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function significantTokens(value) {
  return normalizeQuestion(value)
    .split(" ")
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

function bigrams(value) {
  const compact = normalizeQuestion(value).replace(/\s+/g, " ");
  if (compact.length < 2) return new Set(compact ? [compact] : []);
  const pairs = new Set();
  for (let index = 0; index < compact.length - 1; index += 1) {
    pairs.add(compact.slice(index, index + 2));
  }
  return pairs;
}

function diceSimilarity(left, right) {
  const leftPairs = bigrams(left);
  const rightPairs = bigrams(right);
  if (!leftPairs.size || !rightPairs.size) return 0;
  let overlap = 0;
  leftPairs.forEach((pair) => {
    if (rightPairs.has(pair)) overlap += 1;
  });
  return (2 * overlap) / (leftPairs.size + rightPairs.size);
}

function entryScore(question, entry) {
  const normalized = normalizeQuestion(question);
  const questionTokens = significantTokens(normalized);
  const keywordTokens = new Set((entry.keywords || []).flatMap(significantTokens));
  let patternScore = 0;

  (entry.patterns || []).forEach((pattern) => {
    const normalizedPattern = normalizeQuestion(pattern);
    if (normalized === normalizedPattern) {
      patternScore = Math.max(patternScore, 1);
    } else if (normalized.includes(normalizedPattern) || (normalized.length > 5 && normalizedPattern.includes(normalized))) {
      patternScore = Math.max(patternScore, 0.88);
    } else {
      patternScore = Math.max(patternScore, diceSimilarity(normalized, normalizedPattern) * 0.72);
    }
  });

  const overlap = questionTokens.filter((token) => keywordTokens.has(token)).length;
  const questionCoverage = questionTokens.length ? overlap / questionTokens.length : 0;
  const keywordCoverage = keywordTokens.size ? overlap / Math.min(keywordTokens.size, 5) : 0;
  const keywordScore = Math.min(0.82, questionCoverage * 0.62 + keywordCoverage * 0.34 + Math.min(overlap, 2) * 0.06);

  return Math.min(1, Math.max(patternScore, keywordScore));
}

function cleanActions(actions = []) {
  return actions.map((action) => ({ ...action }));
}

function answerFromEntry(entry, score, kind = "answer", answer = entry.answer) {
  return {
    kind,
    entry,
    answer,
    score,
    closestEntryId: entry.id,
    suggestions: [...(entry.suggestions || [])],
    actions: cleanActions(entry.actions)
  };
}

export function createRheaEngine(entries = []) {
  let contextEntry = null;
  const bookingEntry = entries.find((entry) => entry.id === "booking");
  const fallback = (best = {}) => ({
    kind: "fallback",
    entry: null,
    answer: "I don’t have a confirmed answer for that yet, so I won’t guess. You can ask me about Elysha’s services, projects, process, tools, or book a discovery call.",
    score: best.score || 0,
    closestEntryId: best.entry?.id || null,
    suggestions: ["What does Elysha build?", "Show me her projects"],
    actions: bookingEntry ? cleanActions(bookingEntry.actions) : []
  });

  return {
    answer(question) {
      const normalized = normalizeQuestion(question);
      if (!normalized) {
        return {
          kind: "empty",
          entry: null,
          answer: "Ask me about Elysha, her projects, services, process, tools, or booking.",
          score: 0,
          closestEntryId: null,
          suggestions: [],
          actions: []
        };
      }

      if (UNCONFIRMED_FACT_PATTERN.test(normalized)) return fallback();

      const namedProject = entries.find((entry) => entry.project && (entry.aliases || []).some((alias) =>
        ` ${normalized} `.includes(` ${normalizeQuestion(alias)} `)
      ));
      if (namedProject) {
        contextEntry = namedProject;
        if (CONTEXT_PURPOSE_PATTERN.test(normalized)) return answerFromEntry(namedProject, 1, "context-answer", namedProject.contextAnswers.purpose);
        if (CONTEXT_TOOL_PATTERN.test(normalized)) return answerFromEntry(namedProject, 1, "context-answer", namedProject.contextAnswers.tools);
        return answerFromEntry(namedProject, 1);
      }

      const isGeneralElyshaQuestion = /\belysha\b/.test(normalized);
      if (!isGeneralElyshaQuestion && contextEntry?.contextAnswers && CONTEXT_PURPOSE_PATTERN.test(normalized)) {
        return answerFromEntry(contextEntry, 1, "context-answer", contextEntry.contextAnswers.purpose);
      }

      if (!isGeneralElyshaQuestion && contextEntry?.contextAnswers && CONTEXT_TOOL_PATTERN.test(normalized)) {
        return answerFromEntry(contextEntry, 1, "context-answer", contextEntry.contextAnswers.tools);
      }

      const ranked = entries
        .map((entry) => ({ entry, score: entryScore(normalized, entry) }))
        .sort((left, right) => right.score - left.score);
      const best = ranked[0] || { entry: null, score: 0 };

      if (BOOKING_PATTERN.test(normalized) && bookingEntry && entryScore(normalized, bookingEntry) >= 0.34) {
        contextEntry = null;
        return answerFromEntry(bookingEntry, Math.max(0.9, entryScore(normalized, bookingEntry)), "booking");
      }

      if (best.entry && best.score >= 0.34) {
        contextEntry = best.entry.project ? best.entry : null;
        return answerFromEntry(best.entry, best.score);
      }

      return fallback(best);
    },
    resetContext() {
      contextEntry = null;
    }
  };
}

export function createFallbackPayload(question, result = {}, meta = {}) {
  const sanitized = String(question)
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 280);

  return {
    type: "rhea:fallback",
    question: sanitized,
    normalizedQuestion: normalizeQuestion(sanitized),
    score: Number.isFinite(result.score) ? result.score : 0,
    closestEntryId: result.closestEntryId || null,
    page: meta.page || "/",
    sessionId: meta.sessionId || "anonymous",
    createdAt: new Date().toISOString()
  };
}

function createElement(tagName, className, text) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function getSessionId() {
  const key = "elysha-rhea-session";
  try {
    const current = window.sessionStorage.getItem(key);
    if (current) return current;
    const next = globalThis.crypto?.randomUUID?.() || `rhea-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    window.sessionStorage.setItem(key, next);
    return next;
  } catch {
    return `rhea-${Date.now()}`;
  }
}

function focusableWithin(panel) {
  return [...panel.querySelectorAll("button:not([disabled]), input:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex='-1'])")]
    .filter((element) => !element.hidden && element.getAttribute("aria-hidden") !== "true" && element.getClientRects().length);
}

export function mountRheaChat({ root = document, entries, prompts, bookingUrl = "/booking/?source=rhea" } = {}) {
  const launcher = root.querySelector("[data-portfolio-chat-toggle]");
  const panel = root.querySelector("[data-portfolio-chat-panel]");
  const closeButton = root.querySelector("[data-portfolio-chat-close]");
  const scrim = root.querySelector("[data-rhea-scrim]");
  const form = root.querySelector("[data-rhea-form]");
  const input = root.querySelector("#rhea-question");
  const messages = root.querySelector("[data-rhea-messages]");
  const promptList = root.querySelector("[data-rhea-prompts]");
  const scrollRegion = root.querySelector("[data-rhea-scroll]");
  const submitButton = form?.querySelector("button[type='submit']");
  if (!launcher || !panel || !form || !input || !messages || !promptList) return null;
  if (panel.dataset.rheaMounted === 'true') return null;
  panel.dataset.rheaMounted = 'true';
  if (submitButton) submitButton.disabled = !input.value.trim();

  const engine = createRheaEngine(entries || []);
  const sessionId = getSessionId();
  let priorFocus = null;
  let bookingFlow=null,bookingRoot=null,bookingLoading=false,hasBookingData=false;
  async function showBookingChoice(){
    if(bookingLoading)return;
    hasBookingData=true;input.value='';if(submitButton)submitButton.disabled=true;
    if(bookingFlow){panel.classList.add('rhea-guided-open');panel.setAttribute('aria-labelledby','rhea-booking-title');bookingFlow.resume();return;}
    bookingLoading=true;
    try{
      const {mountRheaBooking}=await import('./rhea-booking.mjs');
      bookingRoot=createElement('section');scrollRegion.append(bookingRoot);
      panel.classList.add('rhea-guided-open');panel.setAttribute('aria-labelledby','rhea-booking-title');
      bookingFlow=mountRheaBooking({root:bookingRoot,bookingUrl,onReturn:()=>{bookingRoot.hidden=true;panel.classList.remove('rhea-guided-open');panel.setAttribute('aria-labelledby','portfolio-chat-title');input.focus();}});
    }catch{
      bookingRoot?.remove();panel.classList.remove('rhea-guided-open');panel.setAttribute('aria-labelledby','portfolio-chat-title');
      const note=createElement('p','','Booking could not load. Please try again or open the booking form.');
      const link=createElement('a','','Open booking form');link.href=bookingUrl;note.append(' ',link);messages.append(note);
    }finally{bookingLoading=false;}
  }

  const scrollToLatest = () => window.requestAnimationFrame(() => {
    if (scrollRegion) scrollRegion.scrollTop = scrollRegion.scrollHeight;
  });
  const emitFallback = (question, result) => {
    if(hasBookingData)return;
    const detail = createFallbackPayload(question, result, { page: `${window.location.pathname}${window.location.hash}`, sessionId });
    window.dispatchEvent(new CustomEvent("rhea:fallback", { detail }));
  };
  const addUserMessage = (question) => {
    const article = createElement("article", "rhea-message rhea-message--user");
    article.append(createElement("p", "", question));
    messages.append(article);
  };
  const addButtonGroup = (className, values, configure) => {
    if (!values?.length) return null;
    const group = createElement("div", className);
    values.forEach((value) => {
      const button = createElement("button", "", value.label || value);
      button.type = "button";
      configure(button, value);
      group.append(button);
    });
    return group;
  };
  function closePanel({ restoreFocus = true } = {}) {
    if (panel.hidden) return;
    panel.hidden = true;
    if (scrim) scrim.hidden = true;
    launcher.setAttribute("aria-expanded", "false");
    document.body.classList.remove("rhea-chat-open");
    if (restoreFocus) (priorFocus || launcher).focus?.();
  }
  const openLinkAction = (action) => {
    if (!action.href) return;
    closePanel({ restoreFocus: false });
    if (action.href.startsWith("#")) {
      const target = document.querySelector(action.href);
      target?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      if (target) {
        if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
        target.focus({ preventScroll: true });
      }
      window.history.replaceState(null, "", action.href);
    } else {
      window.location.href = action.href;
    }
  };
  const addRheaMessage = (question, result) => {
    const article = createElement("article", "rhea-message rhea-message--rhea");
    article.append(createElement("span", "rhea-message-label", "Rhea"), createElement("p", "", result.answer));
    const actions = addButtonGroup("rhea-answer-actions", result.actions, (button, action) => {
      button.dataset.rheaAction = action.type;
      button.addEventListener("click", () => {
        if (action.type === "book") void showBookingChoice();
        if (action.type === "link") openLinkAction(action);
      });
    });
    if (actions) article.append(actions);
    const suggestions = addButtonGroup("rhea-answer-suggestions", result.suggestions, (button, suggestion) => {
      button.dataset.rheaPrompt = "";
      button.addEventListener("click", () => submitQuestion(String(suggestion)));
    });
    if (suggestions) article.append(suggestions);
    if (result.kind === "fallback") {
      emitFallback(question, result);
    } else if (result.score < 0.58) {
      const feedback = addButtonGroup("rhea-answer-feedback", ["This answered it", "Not quite"], (button, label) => {
        button.addEventListener("click", () => {
          button.parentElement?.querySelectorAll("button").forEach((item) => { item.disabled = true; });
          if (label === "Not quite") emitFallback(question, result);
        });
      });
      if (feedback) article.append(feedback);
    }
    messages.append(article);
  };
  const submitQuestion = (rawQuestion) => {
    if(panel.classList.contains('rhea-guided-open')||bookingLoading)return;
    const question = String(rawQuestion || "").trim().slice(0, 240);
    if (!question) return;
    addUserMessage(question);
    const result=engine.answer(question);
    if(result.kind==='booking')void showBookingChoice();
    else addRheaMessage(question, result);
    input.value = "";
    if (submitButton) submitButton.disabled = true;
    scrollToLatest();
  };
  const openPanel = () => {
    if (!panel.hidden) return;
    priorFocus = document.activeElement;
    panel.hidden = false;
    if (scrim) scrim.hidden = false;
    launcher.setAttribute("aria-expanded", "true");
    panel.setAttribute("aria-modal", "true");
    document.body.classList.add("rhea-chat-open");
    if(panel.classList.contains('rhea-guided-open'))bookingFlow?.focus();else input.focus();
  };

  (prompts || []).forEach((prompt) => {
    const button = createElement("button", "", prompt.label);
    button.type = "button";
    button.dataset.rheaPrompt = "";
    button.addEventListener("click", () => submitQuestion(prompt.question));
    promptList.append(button);
  });
  launcher.addEventListener("click", () => panel.hidden ? openPanel() : closePanel());
  closeButton?.addEventListener("click", () => closePanel());
  scrim?.addEventListener("click", () => closePanel());
  input.addEventListener("input", () => { if (submitButton) submitButton.disabled = !input.value.trim(); });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); form.requestSubmit(); }
  });
  form.addEventListener("submit", (event) => { event.preventDefault(); submitQuestion(input.value); });
  panel.addEventListener("keydown", (event) => {
    event.stopPropagation();
    if (event.key === "Escape") { event.preventDefault(); closePanel(); return; }
    if (event.key === "Tab" && panel.getAttribute("aria-modal") === "true") {
      const focusable = focusableWithin(panel);
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  });
  return { open: openPanel, close: closePanel, ask: submitQuestion, engine };
}

async function autoMountRhea() {
  const { RHEA_KNOWLEDGE, RHEA_PROMPTS } = await import("./rhea-knowledge.mjs");
  mountRheaChat({ entries: RHEA_KNOWLEDGE, prompts: RHEA_PROMPTS });
  const hero = document.querySelector('.hero-roadmap');
  const launcher = document.querySelector('.portfolio-chat-launcher');
  if (hero && launcher) {
    const updateLauncherVisibility = () => {
      const rect = hero.getBoundingClientRect();
      launcher.classList.toggle('is-hero-hidden', rect.bottom > 0 && rect.top < innerHeight);
    };
    addEventListener('scroll', updateLauncherVisibility, { passive: true });
    addEventListener('resize', updateLauncherVisibility, { passive: true });
    updateLauncherVisibility();
  }
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", autoMountRhea, { once: true });
  else autoMountRhea();
}
