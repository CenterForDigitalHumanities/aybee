/*
 * IIIF Presentation API normalization.
 *
 * Detects the API version (2, 3, or 4) and normalizes any resource into a
 * common internal model so the viewer is version-agnostic:
 *
 * {
 *   id, type, version, label, description, metadata: [{label, value}],
 *   canvases: [{
 *     id, label, width, height,
 *     images: [{id, service}],
 *     annotations: [{id, target, selector, text, motivation, source}],
 *     externalAnnotations: [uri]
 *   }],
 *   manifests: [{id, label}], collections: [{id, label}],  // Collection
 *   annotations: [...]  // Annotation / AnnotationPage / AnnotationCollection
 * }
 */

const TYPE_MAP = {
  'sc:Manifest': 'Manifest',
  'sc:Collection': 'Collection',
  'sc:Canvas': 'Canvas',
  'sc:AnnotationList': 'AnnotationPage',
  'sc:AnnotationCollection': 'AnnotationCollection',
  'oa:Annotation': 'Annotation',
  'oa:AnnotationCollection': 'AnnotationCollection',
  'oa:AnnotationList': 'AnnotationPage',
};

export function detectVersion(resource) {
  const contexts = [].concat(resource['@context'] || []);
  for (const ctx of contexts) {
    if (typeof ctx !== 'string') continue;
    if (/presentation\/2/.test(ctx)) return 2;
    if (/presentation\/3/.test(ctx)) return 3;
    if (/presentation\/4/.test(ctx)) return 4;
  }
  if (resource.sequences) return 2;
  if (resource['@id'] || resource['@type']) return 2;
  return 3;
}

export function normalizeType(type) {
  if (!type) return 'Manifest';
  if (Array.isArray(type)) type = type[0];
  return TYPE_MAP[type] || type;
}

export function getLabel(resource) {
  const label = resource.label;
  if (label == null) return '';
  if (typeof label === 'string') return label;
  if (Array.isArray(label)) {
    return label.map((l) => l['@value'] ?? l.value ?? l).join(' ');
  }
  if (typeof label === 'object') {
    // A single v2 { @language, @value } object is not a language map.
    if ('@value' in label || 'value' in label) return label['@value'] ?? label.value ?? '';
    const first = Object.values(label)[0];
    if (Array.isArray(first)) return first.join(' ');
    if (first && typeof first === 'object') return first['@value'] ?? first.value ?? '';
    return String(first ?? '');
  }
  return String(label);
}

export function getDescription(resource) {
  const desc = resource.description ?? resource.summary;
  if (desc == null) return '';
  if (typeof desc === 'string') return desc;
  if (Array.isArray(desc)) {
    return desc.map((d) => d['@value'] ?? d.value ?? d).join(' ');
  }
  if (typeof desc === 'object') {
    // A single v2 { @value, @language } object is not a language map.
    if ('@value' in desc || 'value' in desc) return desc['@value'] ?? desc.value ?? '';
    const first = Object.values(desc)[0];
    if (Array.isArray(first)) return first.join(' ');
    if (first && typeof first === 'object') return first['@value'] ?? first.value ?? '';
    return String(first ?? '');
  }
  return String(desc);
}

export function getMetadata(resource) {
  const md = resource.metadata;
  if (!md) return [];
  if (Array.isArray(md)) {
    return md.map((m) => ({
      label: getLabel({ label: m.label ?? m }),
      value: getLabel({ label: m.value ?? m }),
    }));
  }
  if (typeof md === 'object') {
    return Object.entries(md).map(([k, v]) => ({ label: k, value: getLabel({ label: v }) }));
  }
  return [];
}

export function getText(body) {
  if (body == null) return '';
  if (typeof body === 'string') return body;
  if (Array.isArray(body)) return body.map(getText).join(' ');
  return body['cnt:chars'] ?? body.chars ?? body['@value'] ?? body.value ?? '';
}

function fragmentSelector(uri) {
  const m = String(uri).match(/#xywh=([^#]+)/);
  return m ? 'xywh=' + m[1] : null;
}

export function getSelector(target) {
  const t = Array.isArray(target) ? target[0] : target;
  if (!t) return null;
  if (typeof t === 'string') return fragmentSelector(t);
  const sel = [].concat(t.selector ?? []).filter(Boolean)[0];
  if (sel) {
    if (typeof sel === 'string') return sel;
    if (sel.value) return sel.value;
  }
  // A SpecificResource has no id of its own; the region may ride on the source.
  const src = t.source ?? t.full;
  const refs = [t.id, t['@id'], typeof src === 'string' ? src : (src && (src.id ?? src['@id']))];
  for (const ref of refs) {
    if (typeof ref !== 'string') continue;
    const frag = fragmentSelector(ref);
    if (frag) return frag;
  }
  return null;
}

// The URI of the resource an annotation targets, unwrapping SpecificResource
// (v3/v4 `source`, v2 `full`) and array targets.
export function targetSource(target) {
  const t = Array.isArray(target) ? target[0] : target;
  if (!t) return '';
  if (typeof t === 'string') return t;
  const src = t.source ?? t.full;
  if (src) return typeof src === 'string' ? src : (src.id ?? src['@id'] ?? '');
  return t.id ?? t['@id'] ?? '';
}

export function normalizeAnnotation(anno, version) {
  const id = anno.id ?? anno['@id'] ?? '';
  const target = anno.target ?? anno.on ?? anno['oa:hasTarget'] ?? '';
  const body = version === 2 ? (anno.resource ?? anno['oa:hasBody']) : anno.body;
  const motivation = anno.motivation ?? '';
  return {
    id,
    target: targetSource(target),
    selector: getSelector(target),
    text: getText(body),
    motivation: Array.isArray(motivation) ? motivation.join(',') : String(motivation ?? ''),
    source: 'manifest',
  };
}

function isPainting(anno) {
  const m = anno.motivation;
  const motivations = Array.isArray(m) ? m : [m];
  return motivations.includes('painting');
}

export function normalizeCanvas(canvas, version) {
  const id = canvas.id ?? canvas['@id'] ?? '';
  const images = [];
  const annotations = [];
  const externalAnnotations = [];
  if (version === 2) {
    for (const img of [].concat(canvas.images || [])) {
      const resource = img.resource || {};
      images.push({ id: resource['@id'] ?? resource.id ?? '', service: resource.service || null });
    }
    for (const oc of [].concat(canvas.otherContent || [])) {
      if (typeof oc === 'string') {
        externalAnnotations.push(oc);
      } else if (Array.isArray(oc.resources)) {
        for (const a of oc.resources) annotations.push(normalizeAnnotation(a, 2));
      } else if (oc['@id'] || oc.id) {
        externalAnnotations.push(oc['@id'] ?? oc.id);
      }
    }
  } else {
    for (const page of [].concat(canvas.items || [])) {
      for (const anno of [].concat(page.items || [])) {
        if (isPainting(anno)) {
          const body = Array.isArray(anno.body) ? anno.body[0] : anno.body;
          if (body && typeof body === 'object') {
            images.push({ id: body.id ?? body['@id'] ?? '', service: body.service || null });
          }
        }
      }
    }
    for (const page of [].concat(canvas.annotations || [])) {
      if (typeof page === 'string') {
        externalAnnotations.push(page);
      } else if (Array.isArray(page.items)) {
        for (const a of page.items) annotations.push(normalizeAnnotation(a, version));
      } else if (page.id || page['@id']) {
        externalAnnotations.push(page.id ?? page['@id']);
      }
    }
  }
  return {
    id,
    label: getLabel(canvas),
    width: canvas.width,
    height: canvas.height,
    images,
    annotations,
    externalAnnotations,
  };
}

export function getCanvases(resource, version) {
  if (version === 2) {
    const sequences = [].concat(resource.sequences || []);
    return sequences.flatMap((seq) =>
      [].concat(seq.canvases || []).map((c) => normalizeCanvas(c, 2))
    );
  }
  return [].concat(resource.items || [])
    .filter((c) => c && (c.type === 'Canvas' || c['@type'] === 'sc:Canvas'))
    .map((c) => normalizeCanvas(c, version));
}

export function collectAnnotations(resource, version) {
  const list = [];
  const type = normalizeType(resource.type ?? resource['@type']);
  if (type === 'Annotation') {
    list.push(normalizeAnnotation(resource, version));
    return list;
  }
  const items = [].concat(resource.items || resource.resources || []);
  // Paged AnnotationCollections point at their pages through first/next
  // instead of listing items inline.
  if (!items.length) {
    const link = (v) => (typeof v === 'string' ? v : (v && (v.id ?? v['@id'])));
    const first = link(resource.first);
    if (first) list.push({ external: first });
    return list;
  }
  for (const item of items) {
    if (!item) continue;
    if (typeof item === 'string') {
      list.push({ external: item });
      continue;
    }
    const t = normalizeType(item.type ?? item['@type']);
    if (t === 'Annotation') {
      const n = normalizeAnnotation(item, version);
      // Stores like Rerum list annotations as { id, type } stubs. Without a
      // target or body there is nothing to paint, so follow the id instead.
      const stub = !item.target && !item.on && !item.body && !item.resource;
      list.push(stub && (item.id || item['@id']) ? { external: item.id ?? item['@id'] } : n);
    } else if (t === 'AnnotationPage' || t === 'AnnotationCollection') {
      list.push(...collectAnnotations(item, version));
    } else if (item.id || item['@id']) {
      list.push({ external: item.id ?? item['@id'] });
    }
  }
  return list;
}

export function normalize(resource) {
  const version = detectVersion(resource);
  const type = normalizeType(resource.type ?? resource['@type']);
  const base = {
    id: resource.id ?? resource['@id'] ?? '',
    type,
    version,
    label: getLabel(resource),
    description: getDescription(resource),
    descriptions: resource.description ?? resource.summary,
    metadata: getMetadata(resource),
  };
  if (type === 'Collection') {
    const ref = (m) => ({ id: m.id ?? m['@id'] ?? '', label: getLabel(m) });
    const isCollection = (m) => normalizeType(m.type ?? m['@type']) === 'Collection';
    // v2 splits members into manifests/collections; v3+ lists them in items.
    const items = [].concat(resource.items || []).filter(Boolean);
    return {
      ...base,
      manifests: [].concat(resource.manifests || [], items.filter((m) => !isCollection(m))).map(ref),
      collections: [].concat(resource.collections || [], items.filter(isCollection)).map(ref),
    };
  }
  if (type === 'Canvas') {
    return { ...base, canvases: [normalizeCanvas(resource, version)] };
  }
  if (type === 'Annotation' || type === 'AnnotationPage' || type === 'AnnotationCollection') {
    return { ...base, annotations: collectAnnotations(resource, version) };
  }
  return { ...base, canvases: getCanvases(resource, version) };
}
