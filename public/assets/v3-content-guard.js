(() => {
  'use strict';
  const dialog = document.createElement('dialog');
  dialog.className = 'portfolio-content-notice';
  dialog.setAttribute('aria-labelledby', 'content-notice-title');
  dialog.innerHTML = `<div class="content-notice-body"><button type="button" class="content-notice-close" aria-label="Close notice">×</button><p class="eyebrow">Elysha Works</p><h2 id="content-notice-title">Please respect<br>the original work.</h2><p>Want something similar for your business? Let’s talk about what you need.</p><a class="button button-signal" href="booking/">Book a Discovery Call <span aria-hidden="true">↗</span></a><button class="content-notice-continue" type="button">Continue browsing</button></div>`;
  document.body.append(dialog);
  let previousFocus;
  const close = () => dialog.close();
  dialog.querySelector('.content-notice-close').addEventListener('click', close);
  dialog.querySelector('.content-notice-continue').addEventListener('click', close);
  dialog.addEventListener('click', event => {
    const box = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom)) close();
  });
  dialog.addEventListener('close', () => {
    if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
  });
  const editable = target => target instanceof Element && Boolean(target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), form'));
  const show = event => {
    if (editable(event.target)) return;
    event.preventDefault();
    if (dialog.open) return;
    previousFocus = document.activeElement;
    dialog.showModal();
    dialog.querySelector('.content-notice-continue').focus({ preventScroll: true });
  };
  document.addEventListener('contextmenu', show, true);
  document.addEventListener('keydown', event => {
    const key = event.key.toLowerCase();
    const command = event.ctrlKey || event.metaKey;
    if (key === 'f12' || (command && event.shiftKey && ['i', 'j', 'c'].includes(key)) || (command && key === 'u')) show(event);
  }, true);
})();

