import { ENDPOINTS, TWITCH_DEFAULT_COLORS } from '../shared/constants.js';

export function pickDefaultColor(seed) {
  const str = String(seed || '');
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return TWITCH_DEFAULT_COLORS[Math.abs(hash) % TWITCH_DEFAULT_COLORS.length];
}

export function createUserDirectory({ fetchImpl = (...args) => fetch(...args) } = {}) {
  const cache = new Map();
  const inFlight = new Map();

  async function lookup(queryKey, url) {
    if (cache.has(queryKey)) return cache.get(queryKey);
    if (inFlight.has(queryKey)) return inFlight.get(queryKey);

    const promise = (async () => {
      try {
        const res = await fetchImpl(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const user = Array.isArray(data) ? data[0] : null;
        if (user) {
          const entry = {
            id: user.id || '',
            login: (user.login || '').toLowerCase(),
            avatar: user.logo || ENDPOINTS.DEFAULT_AVATAR,
            color: user.chatColor || '',
          };
          if (entry.id) cache.set(`id:${entry.id}`, entry);
          if (entry.login) cache.set(`login:${entry.login}`, entry);
          return entry;
        }
      } catch {
        // Ignore network/API failures and fall back safely.
      }
      const fallback = { id: '', login: '', avatar: ENDPOINTS.DEFAULT_AVATAR, color: '' };
      cache.set(queryKey, fallback);
      return fallback;
    })();

    inFlight.set(queryKey, promise);
    try {
      return await promise;
    } finally {
      inFlight.delete(queryKey);
    }
  }

  async function getAvatarById(userId) {
    if (!userId) return ENDPOINTS.DEFAULT_AVATAR;
    const entry = await lookup(
      `id:${userId}`,
      `${ENDPOINTS.IVR_BASE}/user?id=${encodeURIComponent(userId)}`
    );
    return entry.avatar;
  }

  async function getAvatarByLogin(login) {
    const clean = String(login || '').replace(/^@/, '').toLowerCase();
    if (!clean) return ENDPOINTS.DEFAULT_AVATAR;
    const entry = await lookup(
      `login:${clean}`,
      `${ENDPOINTS.IVR_BASE}/user?login=${encodeURIComponent(clean)}`
    );
    return entry.avatar;
  }

  async function getUserColor(login) {
    const clean = String(login || '').replace(/^@/, '').toLowerCase();
    if (!clean) return '#FFFFFF';
    const entry = await lookup(
      `login:${clean}`,
      `${ENDPOINTS.IVR_BASE}/user?login=${encodeURIComponent(clean)}`
    );
    return entry.color || pickDefaultColor(clean);
  }

  return { getAvatarById, getAvatarByLogin, getUserColor };
}
