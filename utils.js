/*
 * Shared helpers: HTML escaping/sanitizing, selector parsing, image cropping.
 */

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const ALLOWED_TAGS = new Set([
  'em', 'strong', 'i', 'b', 'u', 's', 'span', 'br', 'p', 'code',
  'sub', 'sup', 'monogram', 'a', 'small', 'mark',
]);
const ALLOWED_ATTRS = new Set(['decoration', 'shape', 'title', 'href']);
// Removed outright, with their subtree: unwrapping these would leak content
// (style/script text) or leave an embeddable vector behind.
const DROP_TAGS = new Set([
  'script', 'style', 'template', 'iframe', 'object', 'embed', 'svg', 'math', 'noscript',
]);

export function sanitizeHtml(html) {
  const doc = new DOMParser().parseFromString(String(html ?? ''), 'text/html');
  const walk = (node) => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType !== Node.ELEMENT_NODE) continue;
      const tag = child.tagName.toLowerCase();
      if (DROP_TAGS.has(tag)) {
        child.remove();
        continue;
      }
      // Sanitize descendants first: unwrapping a disallowed wrapper promotes
      // its children, and they must already be clean.
      walk(child);
      if (!ALLOWED_TAGS.has(tag)) {
        child.replaceWith(...child.childNodes);
        continue;
      }
      for (const attr of [...child.attributes]) {
        if (attr.name === 'href' && tag === 'a') {
          if (!/^https?:\/\//i.test(attr.value)) child.removeAttribute('href');
        } else if (!ALLOWED_ATTRS.has(attr.name) || attr.name.startsWith('on')) {
          child.removeAttribute(attr.name);
        }
      }
    }
  };
  walk(doc.body);
  return doc.body.innerHTML;
}

export function parseXYWH(selector) {
  if (!selector) return null;
  // FragmentSelector values may carry a unit prefix: xywh=pixel:1,2,3,4
  const m = String(selector).match(/xywh=(?:pixel:)?([\d.]+),([\d.]+),([\d.]+),([\d.]+)/);
  if (!m) return null;
  return [parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3]), parseFloat(m[4])];
}

export function cropImage(imageUrl, canvasWidth, canvasHeight, xywh) {
  return new Promise((resolve) => {
    let usedCors = true;
    const img = new Image();
    img.onload = () => {
      const [x, y, w, h] = xywh;
      const scale = img.naturalWidth / canvasWidth;
      const out = document.createElement('canvas');
      out.width = Math.max(1, Math.round(w * scale));
      out.height = Math.max(1, Math.round(h * scale));
      const ctx = out.getContext('2d');
      try {
        ctx.drawImage(img, x * scale, y * scale, w * scale, h * scale, 0, 0, out.width, out.height);
        resolve({ dataUrl: out.toDataURL(), canvas: out });
      } catch {
        resolve({ dataUrl: null, canvas: out });
      }
    };
    img.onerror = () => {
      if (!usedCors) return resolve({ dataUrl: null, canvas: null });
      // Image hosts without Access-Control-Allow-Origin fail the CORS request.
      // Retry plain: the canvas is tainted (no toDataURL, no PNG download) but
      // still displays the crop.
      usedCors = false;
      img.removeAttribute('crossorigin');
      img.src = imageUrl;
    };
    img.crossOrigin = 'anonymous';
    img.src = imageUrl;
  });
}
