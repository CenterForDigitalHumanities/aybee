/*
 * Query string handling.
 *
 * Reads the pre-hash query string directly (window.location.search) so
 * percent-encoded URIs from oh-my-rerum's iiif-content parameter are visible,
 * and builds shareable URLs.
 */

export function safeDecode(s) {
  if (s == null) return s;
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

export function parseQueryString(search) {
  const params = new URLSearchParams(search);
  const get = (name) => {
    const v = params.get(name);
    return v === null ? null : v;
  };
  // URLSearchParams already decoded once. Decode again only when the value is
  // itself still an encoded URI ("https%3A%2F%2F..."), so that a single-encoded
  // URI containing %2F keeps its escapes instead of resolving to another path.
  const decodeUri = (v) => (v && /^https?%3A/i.test(v) ? safeDecode(v) : v);
  return {
    iiifContent: decodeUri(get('iiif-content')),
    manifest: decodeUri(get('manifest')),
    canvas: get('canvas'),
    region: get('region'),
    annotation: get('annotation'),
  };
}

export function parseQuery() {
  return parseQueryString(window.location.search);
}

export function buildUrl(base, params) {
  const url = new URL(base, typeof window !== 'undefined' ? window.location.href : 'http://localhost/');
  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === '') url.searchParams.delete(key);
    else url.searchParams.set(key, value);
  }
  return url.toString();
}
