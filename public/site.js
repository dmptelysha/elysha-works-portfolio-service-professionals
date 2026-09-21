(() => {
  'use strict';
  const ready = () => {
    const controls = [...document.querySelectorAll('[data-service-control]')];
    const panels = [...document.querySelectorAll('[data-service-panel]')];
    const select = (index, focus = false) => {
      controls.forEach((control, i) => {
        control.setAttribute('aria-selected', String(i === index));
        control.tabIndex = i === index ? 0 : -1;
        if (i === index && focus) control.focus();
      });
      panels.forEach((panel, i) => { panel.hidden = i !== index; });
    };
    controls.forEach((control, index) => {
      control.addEventListener('click', () => select(index));
      control.addEventListener('keydown', event => {
        const change = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
        if (!(event.key in change) && !['Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        select(event.key === 'Home' ? 0 : event.key === 'End' ? controls.length - 1 : (index + change[event.key] + controls.length) % controls.length, true);
      });
    });
    if (controls.length) select(0);
    const menu = document.querySelector('[data-menu-toggle]');
    const nav = document.getElementById('site-nav');
    const close = (focus = false) => {
      menu?.setAttribute('aria-expanded', 'false');
      nav?.classList.remove('is-open');
      document.body.classList.remove('menu-open');
      if (focus) menu?.focus();
    };
    menu?.addEventListener('click', () => {
      const open = menu.getAttribute('aria-expanded') !== 'true';
      menu.setAttribute('aria-expanded', String(open));
      nav?.classList.toggle('is-open', open);
      document.body.classList.toggle('menu-open', open);
    });
    nav?.querySelectorAll('a').forEach(link => link.addEventListener('click', () => close()));
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && menu?.getAttribute('aria-expanded') === 'true') close(true);
    });
    matchMedia('(min-width:601px)').addEventListener('change', () => close());
    document.documentElement.classList.add('js-ready');
    // All content is readable before motion is progressively enhanced.
    document.documentElement.classList.add('js-ready');
    const calm = matchMedia('(max-width: 1100px), (max-height: 620px), (prefers-reduced-motion: reduce), (pointer: coarse)');
    const journey = document.getElementById('journey');
    const setMode = () => {
      document.documentElement.classList.toggle('calm-scenes', calm.matches);
      document.querySelectorAll('#problem, #journey').forEach(el => {
        el.setAttribute('data-sc-act', calm.matches ? 'flow' : 'pin');
      });
    };
    setMode();
    if (window.ScrollCraft) ScrollCraft.mount(document);
    // Responsive changes update existing records instead of mounting a second runtime.
    calm.addEventListener('change', () => {
      setMode();
      ScrollCraft.instances.forEach(instance => {
        instance.acts.forEach(act => {
          if (!['problem','journey'].includes(act.el.id)) return;
          act.pinned = !calm.matches;
          act.stage = act.el.querySelector('[data-sc-stage]');
          act.el.classList.toggle('sc-act--pinned', act.pinned);
          act.stage.classList.toggle('sc-stage', act.pinned);
          if (!act.pinned) act.el.style.height = '';
        });
        instance.layout();
      });
      updateAssembly();
    });
    let pending = false;
    function updateAssembly() {
      // Read the engine's published playhead. Do not calculate a rival scroll timeline.
      const p = parseFloat(journey.style.getPropertyValue('--sc-p')) || 0;
      const t = calm.matches ? 1 : Math.min(1, Math.max(0,p / .78));
      const eased = t*t*(3-2*t);
      journey.style.setProperty('--assembly', eased.toFixed(4));
      journey.style.setProperty('--scatter', (1-eased).toFixed(4));
      journey.dataset.assemblyState = eased >= .999 ? 'connected' : 'connecting';
      pending = false;
    }
    const schedule = () => { if (!pending) { pending = true; requestAnimationFrame(updateAssembly); } };
    addEventListener('scroll', schedule, {passive:true});
    addEventListener('resize', schedule, {passive:true});
    updateAssembly();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready); else ready();
})();

// One control pauses both hero layers; each rests when out of view.
(() => {
  const scenes = [...document.querySelectorAll('.hero-work-scene')];
  const button = document.querySelector('.hero-motion-toggle');
  if (!button) return;
  button.addEventListener('click', () => {
    const paused = button.getAttribute('aria-pressed') !== 'true';
    scenes.forEach(scene => scene.classList.toggle('is-paused', paused));
    button.textContent = paused ? 'Play' : 'Pause';
    button.setAttribute('aria-label', paused ? 'Play hero animation' : 'Pause hero animation');
    button.setAttribute('aria-pressed', String(paused));
  });
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => entry.target.classList.toggle('is-offscreen', !entry.isIntersecting));
    });
    scenes.forEach(scene => observer.observe(scene));
  }
})();
