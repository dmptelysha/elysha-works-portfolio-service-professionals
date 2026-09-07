const menuButton = document.querySelector(".menu-toggle");
const menu = document.querySelector("#site-menu");
const mobileMenu = matchMedia("(max-width: 900px)");

function setMenu(open, returnFocus = false) {
  if (!menuButton || !menu) return;
  menuButton.setAttribute("aria-expanded", String(open));
  menuButton.setAttribute("aria-label", open ? "Close menu" : "Open menu");
  menu.classList.toggle("is-open", open);
  document.body.classList.toggle("menu-open", open);
  if (returnFocus) menuButton.focus();
}

menuButton?.addEventListener("click", () => setMenu(menuButton.getAttribute("aria-expanded") !== "true"));
menu?.addEventListener("click", event => {
  if (event.target.closest("a")) setMenu(false);
});
document.addEventListener("keydown", event => {
  if (event.key === "Escape") setMenu(false, true);
});
document.addEventListener("pointerdown", event => {
  if (menu?.classList.contains("is-open") && !event.target.closest(".nav")) setMenu(false);
});
mobileMenu.addEventListener("change", event => {
  if (!event.matches) setMenu(false);
});

function setFaq(activeDetails) {
  if (!activeDetails.open) return;
  document.querySelectorAll(".faq-item").forEach(item => {
    if (item !== activeDetails) item.open = false;
  });
}

document.querySelectorAll(".faq-item").forEach(details => {
  details.addEventListener("toggle", () => setFaq(details));
});

document.querySelector("[data-back-to-top]")?.addEventListener("click", event => {
  event.preventDefault();
  window.scrollTo({
    top: 0,
    behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"
  });
});

function initMotion() {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  document.documentElement.dataset.motion = reduced ? "reduced" : "full";
  if (!window.gsap || !window.ScrollTrigger || reduced) return;

  gsap.registerPlugin(ScrollTrigger);
  gsap.utils.toArray(".reveal").forEach(element => {
    gsap.from(element, {
      y: 34,
      opacity: 0,
      duration: 0.8,
      ease: "power3.out",
      scrollTrigger: { trigger: element, start: "top 88%", once: true }
    });
  });
  gsap.utils.toArray(".project-media img").forEach(element => {
    gsap.fromTo(element, { scale: 0.97 }, {
      scale: 1,
      ease: "none",
      scrollTrigger: { trigger: element, start: "top bottom", end: "bottom top", scrub: 0.4 }
    });
  });
}

initMotion();
