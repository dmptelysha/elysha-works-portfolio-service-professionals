(() => {
  'use strict';
  if (!window.HTMLDialogElement || !HTMLDialogElement.prototype.showModal) return;
  const script = document.currentScript;
  const previewRoot = new URL('project-previews/', script.src);
  const projects = new Set(['esl-tutor', 'la-jaysiedel-cakes', 'client-portal', 'growth-crm']);
  const projectInfo = {
    'esl-tutor': { kind: 'Case study', purpose: 'Introduces Teacher Elysha, the lessons, and the next step for interested learners.', audience: 'Parents and learners looking for an English tutor.' },
    'la-jaysiedel-cakes': { kind: 'Paid client project', purpose: 'Helps customers browse cakes, understand their options, and choose what to order.', audience: 'Customers exploring cakes for their celebrations.' },
    'client-portal': { kind: 'Custom application · Internal project', purpose: 'Brings the client journey, project stages, and project information into one dedicated space.', audience: 'Elysha Works clients following their project’s next steps.' },
    'growth-crm': { kind: 'Custom application · Internal project', purpose: 'Organizes leads, conversations, and the next steps in the business.', audience: 'Elysha Works, for managing enquiries and follow-up.' }
  };
  const dialog = document.createElement('dialog');
  dialog.className = 'v3-project-viewer';
  dialog.setAttribute('aria-labelledby', 'v3-viewer-title');
  dialog.setAttribute('aria-describedby', 'v3-viewer-description v3-viewer-instructions');
  dialog.innerHTML = `<header class="v3-viewer-bar"><h2 class="v3-viewer-title" id="v3-viewer-title">Project preview</h2><div class="v3-viewer-controls"><div class="v3-viewer-devices" role="group" aria-label="Preview viewport"><button type="button" data-viewer-device="desktop" aria-pressed="true">Desktop</button><button type="button" data-viewer-device="tablet" aria-pressed="false">Tablet</button><button type="button" data-viewer-device="mobile" aria-pressed="false">Mobile</button></div><button type="button" data-viewer-expand aria-expanded="false" aria-controls="v3-viewer-canvas" aria-label="Expand project preview">Expand</button><button type="button" data-viewer-close aria-label="Close project preview">Close</button></div></header><div id="v3-viewer-description" class="v3-viewer-description"><div><p class="v3-viewer-kind" data-viewer-kind></p><p data-viewer-purpose></p></div><p class="v3-viewer-audience"><span>For</span><span data-viewer-audience></span></p></div><p id="v3-viewer-instructions" class="v3-viewer-instructions">Screenshot preview. Scroll inside the preview to explore. Escape closes the viewer.</p><div class="v3-viewer-stage" id="v3-viewer-canvas"><div class="v3-viewer-viewport" data-device="desktop"><iframe class="v3-viewer-frame" title="Project screenshot preview" sandbox="allow-same-origin" referrerpolicy="no-referrer"></iframe><div class="v3-viewer-watermark" aria-hidden="true"></div></div></div>`;
  document.body.append(dialog);
  const title = dialog.querySelector('h2');
  const stage = dialog.querySelector('.v3-viewer-stage');
  const viewport = dialog.querySelector('.v3-viewer-viewport');
  const frame = dialog.querySelector('iframe');
  const devices = [...dialog.querySelectorAll('[data-viewer-device]')];
  const closeButton = dialog.querySelector('[data-viewer-close]');
  const expandButton = dialog.querySelector('[data-viewer-expand]');
  const description = dialog.querySelector('#v3-viewer-description');
  let origin = null;
  let device = 'desktop';

  const block = event => { event.preventDefault(); event.stopImmediatePropagation(); };
  const restricted = event => {
    const key = event.key.toLowerCase();
    const command = event.ctrlKey || event.metaKey;
    return key === 'f12' || (command && ['a', 'c', 'x', 's', 'p', 'u'].includes(key)) ||
      (command && event.shiftKey && ['i', 'j', 'c'].includes(key)) ||
      (event.metaKey && event.altKey && ['i', 'j', 'c'].includes(key));
  };
  const close = () => {
    if (!dialog.open) return;
    dialog.close();
  };
  const focusPreview = () => {
    frame.focus();
    frame.contentDocument?.body?.focus({ preventScroll: true });
  };
  const size = () => {
    if (!dialog.open) return;
    const available = stage.clientWidth;
    const width = device === 'desktop' ? available : device === 'tablet' ? 768 : 390;
    const scale = Math.min(1, available / width);
    viewport.style.width = `${width * scale}px`;
    frame.style.width = `${width}px`;
    frame.style.height = `${stage.clientHeight / scale}px`;
    frame.style.transform = `scale(${scale})`;
  };
  const setDevice = value => {
    if (!['desktop', 'tablet', 'mobile'].includes(value)) return;
    device = value;
    viewport.dataset.device = value;
    devices.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.viewerDevice === value)));
    const doc = frame.contentDocument;
    const img = doc?.querySelector('.protected-preview img');
    if (img) {
      doc.querySelectorAll('picture source').forEach(source => source.remove());
      const dashboard = /\/(client-portal|growth-crm)\//.test(doc.URL);
      // Existing tablet dashboard captures use a portrait mobile layout.
      // Keep their actual landscape desktop capture in the 768px canvas.
      img.src = `protected-${dashboard && value === 'tablet' ? 'desktop' : value}.jpg`;
      doc.documentElement.dataset.previewDevice = value;
    }
    size();
  };
  const setExpanded = expanded => {
    description.hidden = expanded;
    expandButton.textContent = expanded ? 'Collapse' : 'Expand';
    expandButton.setAttribute('aria-expanded', String(expanded));
    expandButton.setAttribute('aria-label', expanded ? 'Collapse project preview' : 'Expand project preview');
    size();
  };
  const protect = (surface, isFrame = false) => {
    ['contextmenu', 'copy', 'cut', 'dragstart', 'selectstart'].forEach(type => surface.addEventListener(type, block, true));
    surface.addEventListener('keydown', event => {
      if (!dialog.open) return;
      if (event.key === 'Escape') { block(event); close(); return; }
      if (restricted(event)) { block(event); return; }
      if (event.key !== 'Tab') return;
      if (isFrame) { block(event); (event.shiftKey ? closeButton : devices[0]).focus(); }
      else if (event.shiftKey && document.activeElement === devices[0]) { block(event); focusPreview(); }
      else if (!event.shiftKey && document.activeElement === closeButton) { block(event); focusPreview(); }
    }, true);
  };
  protect(dialog);
  frame.addEventListener('load', () => {
    if (!dialog.open) return;
    const doc = frame.contentDocument;
    if (!doc?.querySelector('.protected-preview')) return;
    doc.body.tabIndex = 0;
    doc.body.setAttribute('aria-label', 'Scrollable project screenshot preview');
    protect(doc, true);
    // These local packages are screenshot documents. Do not permit a wrapper
    // link, form, script, or embedded frame to reach the protected applications.
    doc.addEventListener('click', event => { if (event.target.closest('a')) block(event); }, true);
    doc.addEventListener('submit', block, true);
    setDevice(device);
  });
  devices.forEach(button => button.addEventListener('click', () => setDevice(button.dataset.viewerDevice)));
  expandButton.addEventListener('click', () => setExpanded(!description.hidden));
  closeButton.addEventListener('click', close);
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  dialog.addEventListener('close', () => {
    frame.removeAttribute('src');
    origin?.focus({ preventScroll: true });
    origin = null;
  });
  new ResizeObserver(size).observe(stage);
  document.addEventListener('click', event => {
    const anchor = event.target.closest('a[data-project-preview]');
    if (!anchor || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const url = new URL(anchor.href, location.href);
    const project = url.pathname.slice(previewRoot.pathname.length).split('/')[0];
    const packagePath = `${previewRoot.pathname}${project}`;
    if (url.origin !== previewRoot.origin || !url.pathname.startsWith(previewRoot.pathname) || !projects.has(project) || ![packagePath, `${packagePath}/`, `${packagePath}/index.html`].includes(url.pathname)) return;
    event.preventDefault();
    origin = anchor;
    title.textContent = anchor.dataset.projectTitle || 'Project preview';
    const info = projectInfo[project];
    dialog.querySelector('[data-viewer-kind]').textContent = info.kind;
    dialog.querySelector('[data-viewer-purpose]').textContent = info.purpose;
    dialog.querySelector('[data-viewer-audience]').textContent = info.audience;
    frame.title = `${title.textContent} screenshot preview`;
    dialog.showModal();
    setExpanded(false);
    setDevice('desktop');
    frame.src = url.href;
    closeButton.focus({ preventScroll: true });
  });
})();
