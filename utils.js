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
const ALLOWED_ATTRS = new Set(['class', 'decoration', 'shape', 'title', 'href']);

export function sanitizeHtml(html) {
  const doc = new DOMParser().parseFromString(String(html ?? ''), 'text/html');
  const walk = (node) => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType !== Node.ELEMENT_NODE) continue;
      if (!ALLOWED_TAGS.has(child.tagName.toLowerCase())) {
        child.replaceWith(...child.childNodes);
        continue;
      }
      for (const attr of [...child.attributes]) {
        if (attr.name === 'href' && child.tagName.toLowerCase() === 'a') {
          if (!/^https?:\/\//i.test(attr.value)) child.removeAttribute('href');
        } else if (!ALLOWED_ATTRS.has(attr.name) || attr.name.startsWith('on')) {
          child.removeAttribute(attr.name);
        }
      }
      walk(child);
    }
  };
  walk(doc.body);
  return doc.body.innerHTML;
}

export function parseXYWH(selector) {
  if (!selector) return null;
  const m = String(selector).match(/xywh=([\d.]+),([\d.]+),([\d.]+),([\d.]+)/);
  if (!m) return null;
  return [parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3]), parseFloat(m[4])];
}

export function cropImage(imageUrl, canvasWidth, canvasHeight, xywh) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const [x, y, w, h] = xywh;
      const scale = img.naturalWidth / canvasWidth;
      const out = document.createElement('canvas');
      out.width = Math.max(1, Math.round(w * scale));
      out.height = Math.max(1, Math.round(h * scale));
      const ctx = out.getContext('2d');
      try {
        ctx.drawImage(img, x * scale, y * scale, w * scale, h * scale, 0, 0, out.width, out.height);
        resolve({ dataUrl: out.toDataURL(), tainted: false, canvas: out });
      } catch {
        resolve({ dataUrl: null, tainted: true, canvas: out });
      }
    };
    img.onerror = () => resolve({ dataUrl: null, tainted: true, canvas: null });
    img.src = imageUrl;
  });
}
