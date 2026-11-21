import { ENDPOINTS } from '../shared/constants.js';

export function createSessionStore(storage, key) {
  return {
    read() {
      try {
        const raw = storage?.getItem(key);
        return raw ? JSON.parse(raw) : null;
      } catch {
        return null;
      }
    },
    write(session) {
      try { storage?.setItem(key, JSON.stringify(session)); } catch { /* ignore */ }
    },
    clear() {
      try { storage?.removeItem(key); } catch { /* ignore */ }
    },
  };
}

export function postForm(fetchImpl, path, params) {
  return fetchImpl(`${ENDPOINTS.TWITCH_AUTH_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  });
}

export async function validateTwitchToken(fetchImpl, accessToken) {
  try {
    const res = await fetchImpl(`${ENDPOINTS.TWITCH_AUTH_BASE}/validate`, {
      headers: { Authorization: `OAuth ${accessToken}` },
    });
    if (!res.ok) return { valid: false, status: res.status };
    const data = await res.json();
    return { valid: true, userId: data.user_id, login: data.login, scopes: data.scopes || [] };
  } catch {
    return { valid: false, status: 0 };
  }
}
