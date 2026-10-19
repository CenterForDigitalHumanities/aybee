/*
 * Linked Data Notifications inbox support.
 *
 * The inbox list is user-configurable and persisted; Rerum Inbox is the
 * default. Results are opt-in (persisted checkbox) and previewed before
 * inclusion, similar to the Mirador LDN plugin.
 */

const DEFAULT_INBOX = 'https://inbox.rerum.io/messages';
const INBOXES_KEY = 'read.ldn.inboxes';
const OPTIN_KEY = 'read.ldn.optin';

export function getInboxes() {
  try {
    const list = JSON.parse(localStorage.getItem(INBOXES_KEY));
    if (Array.isArray(list) && list.length) return list;
  } catch {
    /* fall through to default */
  }
  return [DEFAULT_INBOX];
}

export function saveInboxes(list) {
  localStorage.setItem(INBOXES_KEY, JSON.stringify(list));
}

export function getOptIn() {
  return localStorage.getItem(OPTIN_KEY) === 'true';
}

export function setOptIn(value) {
  localStorage.setItem(OPTIN_KEY, value ? 'true' : 'false');
}

export function extractMessages(data) {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.messages)) return data.messages;
  if (data && Array.isArray(data.items)) return data.items;
  return [];
}

export async function queryInbox(inbox, target) {
  const url = new URL(inbox);
  url.searchParams.set('target', target);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Inbox ${inbox} responded ${res.status}`);
  const data = await res.json();
  return extractMessages(data);
}
