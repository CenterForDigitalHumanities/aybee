import { normalize, getLabel } from './iiif.js';
import { parseQuery, buildUrl } from './query.js';
import { DEFAULT_INBOX, getInboxes, saveInboxes, getOptIn, setOptIn, queryInbox } from './ldn.js';
import { escapeHtml, sanitizeHtml, parseXYWH, cropImage } from './utils.js';

async function fetchJSON(uri) {
  if (new URL(uri, window.location.href).protocol !== 'https:') {
    throw new Error('Only HTTPS sources are supported.');
  }
  const res = await fetch(uri);
  if (!res.ok) throw new Error(`Failed to load ${uri}: ${res.status} ${res.statusText}`);
  return res.json();
}

class AyBeeViewer extends HTMLElement {
  constructor() {
    super();
    this.state = {
      resource: null,
      canvasIndex: -1, // -1 = all canvases
      language: 'en',
      loading: false,
      error: null,
      ldn: { results: [], included: new Set(), checked: false },
      shareOpen: false,
      settingsOpen: false,
      region: null,
      focusAnnotation: null,
      searchy: '',
      searchin: false,
      letters: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'],
    };
    this.onPopState = () => this.init();
  }

  connectedCallback() {
    this.addEventListener('click', this.onClick);
    this.addEventListener('change', this.onChange);
    this.addEventListener('input', this.onInput);
    this.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('popstate', this.onPopState);
    this.init();
  }

  disconnectedCallback() {
    window.removeEventListener('popstate', this.onPopState);
  }

  async init() {
    const q = parseQuery();
    if (q.iiifContent) {
      await this.loadResource(q.iiifContent, q);
    } else if (q.manifest) {
      await this.loadResource(q.manifest, q);
    } else {
      this.render();
    }
  }

  onClick(event) {
    const el = event.target.closest('[data-action]');
    if (!el) return;
    const action = el.dataset.action;
    if ((action === 'close-share' || action === 'close-settings') && event.target !== el) return;
    switch (action) {
      case 'load-input': this.loadFromInput(); break;
      case 'toggle-search-mode':
        this.state.searchin = !this.state.searchin;
        el.textContent = this.state.searchin ? 'Finding All:' : 'Starting With:';
        this.applySearch();
        break;
      case 'set-letter': {
        this.state.searchy = el.dataset.letter || '';
        const input = this.querySelector('[data-action="search-input"]');
        if (input) input.value = this.state.searchy;
        this.applySearch();
        break;
      }
      case 'open-share': this.openModal('share'); break;
      case 'close-share': this.closeModal('share'); break;
      case 'open-settings': this.openModal('settings'); break;
      case 'close-settings': this.closeModal('settings'); break;
      case 'add-inbox': this.addInbox(); break;
      case 'remove-inbox': this.removeInbox(el.dataset.inbox); break;
      case 'include-ldn': this.includeLdn(el.dataset.anno); break;
      case 'copy-bounded':
      case 'copy-full':
      case 'copy-deep': this.copyLink(el.dataset.url); break;
      case 'download-crop': this.downloadCrop(); break;
      case 'clear': this.clear(); break;
      case 'select-annotation': this.selectAnnotation(el.dataset.anno || null); break;
    }
  }

  onChange(event) {
    const el = event.target;
    if (el.matches('[data-action="canvas-select"]')) {
      this.selectCanvas(el.value);
    } else if (el.matches('[data-action="set-language"]')) {
      this.state.language = el.value;
      this.render();
    } else if (el.matches('[data-action="ldn-optin"]')) {
      setOptIn(el.checked);
      if (el.checked) this.checkLdn();
    }
  }

  onInput(event) {
    const el = event.target;
    if (el.matches('[data-action="search-input"]')) {
      this.state.searchy = el.value;
      this.applySearch();
    }
  }

  onKeyDown(event) {
    if (event.key === 'Escape') {
      if (this.state.shareOpen) this.closeModal('share');
      else if (this.state.settingsOpen) this.closeModal('settings');
      return;
    }
    if (event.key === 'Enter' && event.target.matches?.('input')) {
      if (event.target.id === 'resource-input') {
        event.preventDefault();
        this.loadFromInput();
      } else if (event.target.id === 'new-inbox-input') {
        event.preventDefault();
        this.addInbox();
      }
      return;
    }
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const el = event.target.closest('[data-action="select-annotation"]');
    if (!el) return;
    event.preventDefault();
    this.selectAnnotation(el.dataset.anno || null);
  }

  openModal(which) {
    this.state.shareOpen = which === 'share';
    this.state.settingsOpen = which === 'settings';
    this.render();
    this.querySelector('.modal input, .modal button')?.focus();
  }

  closeModal(which) {
    this.state.shareOpen = false;
    this.state.settingsOpen = false;
    this.render();
    this.querySelector(`[data-action="open-${which}"]`)?.focus();
  }

  loadFromInput() {
    const input = this.querySelector('#resource-input');
    const uri = input && input.value.trim();
    if (uri) this.loadResource(uri, {});
  }

  async loadResource(uri, query = {}) {
    this.state.loading = true;
    this.state.error = null;
    this.state.region = query.region || null;
    this.state.focusAnnotation = query.annotation || null;
    this.render();
    try {
      const data = await fetchJSON(uri);
      const resource = normalize(data);
      // Keep the requested URI as the canonical id: the resource's declared
      // @id may not be fetchable (e.g. T-PEN's /manifest/4080/manifest.json
      // returns an empty body), and shareable URLs must point at a working URI.
      this.state.resource = { ...resource, id: uri };
      this.state.canvasIndex = -1;
      if (resource.type === 'Collection') {
        this.state.loading = false;
        this.updateUrl();
        this.render();
        return;
      }
      if (resource.type === 'Annotation' || resource.type === 'AnnotationPage' || resource.type === 'AnnotationCollection') {
        await this.resolveAnnotationResource(resource);
      }
      // Landing on a single annotation should highlight it, not just its canvas.
      if (resource.type === 'Annotation' && !query.annotation) this.state.focusAnnotation = resource.id;
      if (query.canvas) this.selectCanvas(query.canvas, { silent: true });
      // Paint once the canvases are ready; every canvas's external annotation
      // pages load in parallel.
      await Promise.allSettled((this.state.resource?.canvases || []).map((c) => this.loadCanvasAnnotations(c)));
      this.refresh();
      this.checkLdn();
    } catch (err) {
      this.state.error = err.message || String(err);
    } finally {
      this.state.loading = false;
    }
    this.render();
  }

  async resolveAnnotationResource(resource) {
    const annos = [];
    let wave = [];
    for (const a of (resource.annotations || [])) {
      if (a.external) wave.push(a.external);
      else annos.push(a);
    }
    // Resolve paged collections and stub references a page at a time: every
    // link discovered in a wave is fetched in parallel, and the next/first
    // links it hands back form the following wave.
    const seen = new Set();
    while (wave.length && seen.size < 50) {
      const batch = wave.filter((uri) => uri && !seen.has(uri));
      batch.forEach((uri) => seen.add(uri));
      wave = [];
      const pages = await Promise.allSettled(batch.map((uri) => fetchJSON(uri)));
      for (const p of pages) {
        if (p.status !== 'fulfilled') continue;
        const data = p.value;
        for (const a of (normalize(data).annotations || [])) {
          if (a.external) wave.push(a.external);
          else annos.push(a);
        }
        const next = data.next;
        if (next) wave.push(typeof next === 'string' ? next : (next.id ?? next['@id']));
      }
    }
    const byTarget = new Map();
    for (const a of annos) {
      if (!a.target) continue;
      const key = a.target.split('#')[0];
      if (!byTarget.has(key)) byTarget.set(key, []);
      byTarget.get(key).push(a);
    }
    const targets = [...byTarget.entries()];
    const fetched = await Promise.allSettled(targets.map(([uri]) => fetchJSON(uri)));
    const canvases = [];
    for (const [i, result] of fetched.entries()) {
      if (result.status !== 'fulfilled') continue;
      const [, list] = targets[i];
      const res = normalize(result.value);
      const canvas =
        res.type === 'Canvas'
          ? res.canvases[0]
          : res.type === 'Manifest'
            ? res.canvases.find((cv) => cv.id === targets[i][0]) || res.canvases[0]
            : null;
      if (!canvas) continue;
      // Show what was asked for, not every layer the target canvas carries.
      canvas.annotations = list;
      canvas.externalAnnotations = [];
      canvases.push(canvas);
    }
    // Spread the live resource, not the normalized one, so the requested URI
    // stays the canonical id used by shareable URLs.
    this.state.resource = { ...this.state.resource, canvases };
  }

  async loadCanvasAnnotations(canvas) {
    if (!canvas || canvas.externalLoaded) return;
    canvas.externalLoaded = true;
    const pages = await Promise.allSettled((canvas.externalAnnotations || []).map((uri) => fetchJSON(uri)));
    for (const p of pages) {
      if (p.status !== 'fulfilled') continue;
      for (const a of (normalize(p.value).annotations || [])) {
        if (!a.external) canvas.annotations.push(a);
      }
    }
  }

  selectCanvas(value, opts = {}) {
    const canvases = this.state.resource?.canvases || [];
    let index = -1;
    if (value === '' || value === 'all') index = -1;
    else if (/^\d+$/.test(value)) index = parseInt(value, 10);
    else index = canvases.findIndex((c) => c.id === value);
    if (index >= canvases.length) index = -1;
    this.state.canvasIndex = index;
    if (!opts.silent) {
      this.state.region = null;
      this.state.focusAnnotation = null;
      this.refresh();
      this.checkLdn();
    }
  }

  refresh() {
    this.updateUrl();
    this.render();
    this.focusAnnotationElement();
  }

  selectAnnotation(id) {
    this.state.focusAnnotation = id || null;
    this.updateUrl();
    for (const el of this.querySelectorAll('[data-anno]')) {
      el.classList.toggle('focused', !!id && el.dataset.anno === id);
    }
    this.focusAnnotationElement();
  }

  updateUrl() {
    const r = this.state.resource;
    if (!r) return;
    const canvas = (r.canvases || [])[this.state.canvasIndex];
    // Every shareable param is stated explicitly, including the ones that are
    // now empty, so nothing stale survives a navigation.
    const params = {
      'iiif-content': r.id,
      manifest: null,
      canvas: canvas?.id || null,
      region: this.state.region || null,
      annotation: this.state.focusAnnotation || null,
    };
    history.pushState({}, '', buildUrl(window.location.pathname, params));
  }

  focusAnnotationElement() {
    if (!this.state.focusAnnotation) return;
    const el = this.querySelector(`[data-anno="${CSS.escape(this.state.focusAnnotation)}"]`);
    if (el) this.smoothScrollTo(el);
  }

  smoothScrollTo(el) {
    const scroller = this.scrollContainer(el);
    const rect = el.getBoundingClientRect();
    const sRect = scroller.getBoundingClientRect();
    const viewport = scroller === document.scrollingElement ? window.innerHeight : sRect.height;
    const target = scroller.scrollTop + rect.top - sRect.top - viewport / 2 + rect.height / 2;
    const start = scroller.scrollTop;
    const delta = target - start;
    if (Math.abs(delta) < 1) return;
    if (this._scrollAnim) cancelAnimationFrame(this._scrollAnim);
    const duration = Math.min(500, Math.max(200, Math.abs(delta) * 0.4));
    const t0 = performance.now();
    const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
    const step = (now) => {
      const p = Math.min(1, (now - t0) / duration);
      scroller.scrollTop = start + delta * ease(p);
      if (p < 1) this._scrollAnim = requestAnimationFrame(step);
      else this._scrollAnim = null;
    };
    this._scrollAnim = requestAnimationFrame(step);
  }

  scrollContainer(el) {
    let node = el.parentElement;
    while (node && node !== document.body) {
      const style = getComputedStyle(node);
      if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight) return node;
      node = node.parentElement;
    }
    return document.scrollingElement || document.documentElement;
  }

  async checkLdn() {
    if (!getOptIn()) return;
    const r = this.state.resource;
    if (!r) return;
    const canvas = this.currentCanvas();
    const targets = [r.id];
    if (canvas && canvas.id) targets.push(canvas.id);
    const results = [];
    for (const inbox of getInboxes()) {
      for (const target of targets) {
        try {
          const messages = await queryInbox(inbox, target);
          for (const m of messages) {
            const res = normalize(m);
            if (res.type === 'Annotation' || res.type === 'AnnotationPage' || res.type === 'AnnotationCollection') {
              for (const a of (res.annotations || [])) {
                if (!a.external) results.push({ ...a, source: 'ldn' });
              }
            }
          }
        } catch {
          /* skip unreachable inboxes */
        }
      }
    }
    this.state.ldn.results = results;
    this.state.ldn.checked = true;
    this.render();
  }

  includeLdn(annoId) {
    const anno = this.state.ldn.results.find((a) => a.id === annoId);
    if (!anno) return;
    const target = anno.target ? anno.target.split('#')[0] : null;
    const canvas = (this.state.resource?.canvases || []).find((c) => c.id === target) || this.currentCanvas();
    if (!canvas) return;
    if (!canvas.annotations.some((a) => a.id === annoId)) {
      canvas.annotations.push({ ...anno, source: 'ldn' });
    }
    this.state.ldn.included.add(annoId);
    this.refresh();
  }

  getFocusedAnnotation() {
    if (!this.state.focusAnnotation) return null;
    return this.allAnnotations().find((a) => a.id === this.state.focusAnnotation) || null;
  }

  async copyLink(url) {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    const status = this.querySelector('[role="status"]');
    if (status) {
      status.textContent = 'Copied';
      clearTimeout(this._copyTimer);
      this._copyTimer = setTimeout(() => { status.textContent = ''; }, 2000);
    }
  }

  async downloadCrop() {
    const anno = this.getFocusedAnnotation();
    if (!anno || !anno.selector || !anno.canvas) return;
    const image = (anno.canvas.images || [])[0];
    if (!image) return;
    const xywh = parseXYWH(anno.selector);
    if (!xywh) return;
    const result = await cropImage(image.id, anno.canvas.width, anno.canvas.height, xywh);
    if (!result.dataUrl) return;
    const a = document.createElement('a');
    a.href = result.dataUrl;
    a.download = 'annotation.png';
    a.click();
  }

  addInbox() {
    const input = this.querySelector('#new-inbox-input');
    const uri = input && input.value.trim();
    if (!uri) return;
    const inboxes = getInboxes();
    if (!inboxes.includes(uri)) {
      inboxes.push(uri);
      saveInboxes(inboxes);
    }
    this.render();
  }

  removeInbox(uri) {
    const inboxes = getInboxes().filter((i) => i !== uri);
    saveInboxes(inboxes.length ? inboxes : [DEFAULT_INBOX]);
    this.render();
  }

  clear() {
    this.state.resource = null;
    this.state.error = null;
    this.state.region = null;
    this.state.focusAnnotation = null;
    this.state.canvasIndex = -1;
    this.state.searchy = '';
    this.state.ldn = { results: [], included: new Set(), checked: false };
    history.pushState({}, '', window.location.pathname);
    this.render();
  }

  getLanguages(r) {
    const d = r.descriptions;
    // v2 lists { @value, @language } objects; v3/v4 use language maps.
    if (Array.isArray(d)) return [...new Set(d.map((x) => x?.['@language']).filter(Boolean))];
    if (d && typeof d === 'object') return Object.keys(d);
    return [];
  }

  currentDescription(r) {
    const d = r.descriptions;
    const lang = this.state.language;
    if (Array.isArray(d)) {
      const match = d.find((x) => x?.['@language'] === lang);
      if (match) return match['@value'];
    } else if (d && typeof d === 'object' && d[lang] != null) {
      return getLabel({ label: d[lang] });
    }
    return r.description;
  }

  currentCanvas() {
    const canvases = this.state.resource?.canvases || [];
    if (this.state.canvasIndex >= 0) return canvases[this.state.canvasIndex] || null;
    const focused = this.getFocusedAnnotation();
    if (focused && focused.canvas) return focused.canvas;
    return canvases[0] || null;
  }

  allAnnotations() {
    const out = [];
    for (const c of (this.state.resource?.canvases || [])) {
      for (const a of (c.annotations || [])) {
        if (a.external) continue;
        out.push({ ...a, canvas: c });
      }
    }
    return out;
  }

  visibleAnnotations() {
    let list = this.allAnnotations();
    if (this.state.canvasIndex >= 0) {
      const c = (this.state.resource?.canvases || [])[this.state.canvasIndex];
      if (c) list = list.filter((a) => a.canvas === c);
    }
    return list;
  }

  sortedAnnotations() {
    return this.visibleAnnotations()
      .sort((a, b) => (a.text || '').localeCompare(b.text || ''));
  }

  applySearch() {
    const q = (this.state.searchy || '').toLowerCase();
    for (const el of this.querySelectorAll('.text-annotation')) {
      const text = (el.dataset.content || '').toLowerCase();
      const match = !q || (this.state.searchin ? text.includes(q) : text.startsWith(q));
      el.style.display = match ? '' : 'none';
    }
  }

  render() {
    const s = this.state;
    if (s.loading) {
      this.innerHTML = '<div class="container"><p>Loading…</p></div>';
      return;
    }
    if (!s.resource) {
      this.innerHTML = this.landingTemplate();
      return;
    }
    if (s.resource.type === 'Collection') {
      this.innerHTML = this.collectionTemplate();
      return;
    }
    this.innerHTML = this.viewerTemplate();
    this.hydrateCrops();
    this.applySearch();
  }

  landingTemplate() {
    const s = this.state;
    return `<div class="container">
      <div class="row">
        <input type="url" id="resource-input" placeholder="Paste or type a URI for any Manifest" class="six columns">
        <button class="button" data-action="load-input">Load it</button>
      </div>
      <p>or try these examples:</p>
      <a class="button" href="?iiif-content=${encodeURIComponent('https://t-pen.org/TPEN/manifest/6609')}">Goldblum (TPEN)</a>
      ${s.error ? `<p class="alert alert-danger">${escapeHtml(s.error)}</p>` : ''}
    </div>`;
  }

  collectionTemplate() {
    const r = this.state.resource;
    const links = (list) => (list || [])
      .map((m) => `<p><a href="?iiif-content=${encodeURIComponent(m.id)}">${escapeHtml(m.label || m.id)}</a></p>`)
      .join('');
    return `<div class="container">
      <div class="note u-see-thru">
        <h3 class="note-header text">${escapeHtml(r.label || '[ no label ]')}
          <button title="clear" class="button" data-action="clear"><i class="fa fa-bomb"></i></button>
        </h3>
        <div class="note-block">
          ${links(r.manifests) || '<p>[ no manifests ]</p>'}
          ${(r.collections || []).length ? `<h4>Collections</h4>${links(r.collections)}` : ''}
        </div>
      </div>
    </div>`;
  }

  viewerTemplate() {
    const s = this.state;
    const r = s.resource;
    const canvases = r.canvases || [];
    const languages = this.getLanguages(r);
    return `<div class="container">
      <div class="note u-see-thru">
        <h3 class="note-header text">${escapeHtml(r.label || '[ no label ]')}
          <button title="clear" class="button" data-action="clear"><i class="fa fa-bomb"></i></button>
        </h3>
        <div class="note-block text">
          ${escapeHtml(this.currentDescription(r))}
          ${this.currentDescription(r) ? '' : '<code>[ no description ]</code>'}
          ${languages.length ? `<div class="btn-group u-full-width" data-toggle="buttons">${languages.map((l) => `<label class="btn btn-info ${s.language === l ? 'active' : ''}"><input type="radio" data-action="set-language" value="${escapeHtml(l)}" ${s.language === l ? 'checked' : ''}>${escapeHtml(l)}</label>`).join('')}</div>` : ''}
        </div>
        ${r.metadata.length ? `<div class="note-block" style="max-height: 12rem;overflow: auto;"><dl>${r.metadata.map((m) => `<dt>${escapeHtml(m.label)}</dt><dd class="text">${sanitizeHtml(m.value)}</dd>`).join('')}</dl></div>` : ''}
        <div class="btn-group note-footer">
          <button data-action="toggle-search-mode">${s.searchin ? 'Finding All:' : 'Starting With:'}</button>
          <input data-action="search-input" placeholder="Type to Filter" type="text" value="${escapeHtml(s.searchy)}">
          ${s.letters.map((l) => `<a data-action="set-letter" data-letter="${l}">${l}</a>`).join('')}
        </div>
        <div class="btn-group note-footer">
          <select data-action="canvas-select">
            <option value="" ${s.canvasIndex === -1 ? 'selected' : ''}>All canvases</option>
            ${canvases.map((c, i) => `<option value="${escapeHtml(c.id || i)}" ${i === s.canvasIndex ? 'selected' : ''}>${escapeHtml(c.label || c.id || i)}</option>`).join('')}
          </select>
          <button data-action="open-share" title="Share"><i class="fa fa-share-alt"></i></button>
          <button data-action="open-settings" title="Settings"><i class="fa fa-cog"></i></button>
        </div>
      </div>
      <div style="position:relative;">
        ${s.region ? this.regionTemplate() : this.transcriptionTemplate()}
      </div>
      ${this.ldnPanelTemplate()}
      ${s.shareOpen ? this.shareModalTemplate() : ''}
      ${s.settingsOpen ? this.settingsModalTemplate() : ''}
    </div>`;
  }

  transcriptionTemplate() {
    const list = this.sortedAnnotations();
    return `<div class="note u-see-thru block">
      <div class="note-block">
        ${list.map((a) => this.annotationTemplate(a)).join('') || '<p>[ no annotations ]</p>'}
      </div>
    </div>`;
  }

  annotationTemplate(a) {
    const s = this.state;
    const cls = ['text-annotation'];
    if (a.source === 'ldn') cls.push('ldn-annotation');
    if (a.id && a.id === s.focusAnnotation) cls.push('focused');
    const canvas = a.canvas;
    const image = (canvas && canvas.images && canvas.images[0]) || null;
    return `<div class="${cls.join(' ')}" tabindex="0" role="button" data-anno="${escapeHtml(a.id || '')}" data-action="select-annotation" data-content="${escapeHtml(a.text || '')}">
      <div>
        ${a.label ? `<strong>${escapeHtml(a.label)}</strong> ` : ''}<span class="text">${sanitizeHtml(a.text)}</span>
        ${a.text ? '' : '<code>[ no transcription ]</code>'}
      </div>
      ${a.selector && image ? `<canvas data-crop="${escapeHtml(a.selector)}" data-image="${escapeHtml(image.id)}" data-width="${escapeHtml(canvas.width)}" data-height="${escapeHtml(canvas.height)}" class="crop-canvas"></canvas>` : ''}
    </div>`;
  }

  regionTemplate() {
    const s = this.state;
    const canvas = this.currentCanvas();
    const image = (canvas && canvas.images && canvas.images[0]) || null;
    if (!image) return '<p>[ no image found for this canvas ]</p>';
    return `<div class="region-view">
      <canvas data-crop="${escapeHtml(s.region)}" data-image="${escapeHtml(image.id)}" data-width="${escapeHtml(canvas.width)}" data-height="${escapeHtml(canvas.height)}" class="region-canvas"></canvas>
      <p>Provenance: <a href="${escapeHtml(buildUrl(window.location.pathname, { 'iiif-content': s.resource.id, manifest: null }))}">view the full resource</a></p>
    </div>`;
  }

  ldnPanelTemplate() {
    const s = this.state;
    if (!s.ldn.checked || !s.ldn.results.length) return '';
    return `<div class="ldn-panel note">
      <div class="note-header">LDN Inbox results (${s.ldn.results.length})</div>
      <div class="note-block">
        ${s.ldn.results.map((a) => `<div class="ldn-result">
          <span class="text">${sanitizeHtml(a.text || a.id || '[ no text ]')}</span>
          ${s.ldn.included.has(a.id) ? '<em>included</em>' : `<button data-action="include-ldn" data-anno="${escapeHtml(a.id || '')}">Include</button>`}
        </div>`).join('')}
      </div>
    </div>`;
  }

  shareModalTemplate() {
    const s = this.state;
    const r = s.resource;
    const anno = this.getFocusedAnnotation();
    const canvas = anno ? anno.canvas : this.currentCanvas();
    const base = { 'iiif-content': r.id, manifest: null };
    if (canvas && canvas.id) base.canvas = canvas.id;
    const fullUrl = anno && anno.id
      ? buildUrl(window.location.pathname, { ...base, annotation: anno.id })
      : buildUrl(window.location.pathname, base);
    const boundedUrl = anno && anno.selector
      ? buildUrl(window.location.pathname, { ...base, region: anno.selector, annotation: anno.id })
      : null;
    const deepUrl = anno && anno.id
      ? buildUrl(window.location.pathname, { 'iiif-content': anno.id, manifest: null })
      : null;
    return `<div class="modal-overlay" data-action="close-share">
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="share-title">
        <h3 id="share-title">Share</h3>
        <p>${anno ? `Annotation: <code>${escapeHtml(anno.id || '')}</code>` : 'Current resource'}</p>
        ${boundedUrl ? `<div class="share-option">
          <strong>Bounded area as image</strong>
          <input readonly aria-label="Bounded area link" value="${escapeHtml(boundedUrl)}">
          <button data-action="copy-bounded" data-url="${escapeHtml(boundedUrl)}">Copy</button>
          <button data-action="download-crop">Download PNG</button>
          <small>Provenance: <a href="${escapeHtml(buildUrl(window.location.pathname, base))}">full resource</a></small>
        </div>` : ''}
        <div class="share-option">
          <strong>${anno ? 'Full resource with annotation selected' : 'Full resource'}</strong>
          <input readonly aria-label="${anno ? 'Full resource link with annotation selected' : 'Full resource link'}" value="${escapeHtml(fullUrl)}">
          <button data-action="copy-full" data-url="${escapeHtml(fullUrl)}">Copy</button>
        </div>
        ${deepUrl ? `<div class="share-option">
          <strong>Deep link to annotation</strong>
          <input readonly aria-label="Deep link to annotation" value="${escapeHtml(deepUrl)}">
          <button data-action="copy-deep" data-url="${escapeHtml(deepUrl)}">Copy</button>
        </div>` : ''}
        <button data-action="close-share">Close</button>
        <span role="status" class="copy-status"></span>
      </div>
    </div>`;
  }

  settingsModalTemplate() {
    const inboxes = getInboxes();
    return `<div class="modal-overlay" data-action="close-settings">
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <h3 id="settings-title">Settings</h3>
        <label><input type="checkbox" data-action="ldn-optin" ${getOptIn() ? 'checked' : ''}> Include annotations from LDN inboxes</label>
        <h4>LDN Inboxes</h4>
        <ul class="inbox-list">
          ${inboxes.map((i) => `<li>${escapeHtml(i)} <button aria-label="Remove ${escapeHtml(i)}" data-action="remove-inbox" data-inbox="${escapeHtml(i)}">×</button></li>`).join('')}
        </ul>
        <div class="row">
          <input type="url" id="new-inbox-input" aria-label="New inbox URI" placeholder="https://inbox.rerum.io/messages" class="six columns">
          <button data-action="add-inbox">Add</button>
        </div>
        <button data-action="close-settings">Close</button>
      </div>
    </div>`;
  }

  async hydrateCrops() {
    for (const el of this.querySelectorAll('[data-crop]')) {
      const xywh = parseXYWH(el.dataset.crop);
      if (!xywh) continue;
      const imageId = el.dataset.image;
      const width = parseFloat(el.dataset.width);
      const height = parseFloat(el.dataset.height);
      if (!imageId || !width || !height) continue;
      const result = await cropImage(imageId, width, height, xywh);
      // Line crops are drawn in image pixels (about 2x canvas coordinates);
      // display them at canvas size so they do not overlap the next rows.
      const displayWidth = el.classList.contains('crop-canvas') ? `${xywh[2]}px` : '100%';
      if (result.dataUrl) {
        const img = document.createElement('img');
        img.src = result.dataUrl;
        img.alt = '';
        img.style.width = displayWidth;
        el.replaceWith(img);
      } else if (result.canvas) {
        // app.css has `canvas { width: auto !important }`, so match its priority.
        result.canvas.style.setProperty('width', displayWidth, 'important');
        result.canvas.style.maxWidth = '100%';
        el.replaceWith(result.canvas);
      }
    }
  }
}

customElements.define('aybee-viewer', AyBeeViewer);