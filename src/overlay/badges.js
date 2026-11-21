import { ENDPOINTS } from '../shared/constants.js';

function indexBadgeSets(payload, targetMap) {
  if (!Array.isArray(payload)) return;
  for (const set of payload) {
    if (!set?.set_id || !Array.isArray(set.versions)) continue;
    for (const ver of set.versions) {
      const url = ver?.image_url_2x || ver?.image_url_1x || ver?.image_url_4x;
      if (ver?.id && url) {
        targetMap.set(`${set.set_id}/${ver.id}`, url);
      }
    }
  }
}

export function createBadgeResolver({ fetchImpl = (...args) => fetch(...args) } = {}) {
  const globalBadges = new Map();
  const channelBadges = new Map();
  let globalLoaded = false;

  async function loadGlobal() {
    if (globalLoaded) return;
    try {
      const res = await fetchImpl(`${ENDPOINTS.IVR_BASE}/badges/global`);
      if (!res.ok) return;
      indexBadgeSets(await res.json(), globalBadges);
      globalLoaded = true;
    } catch {
      // Badge resolution degrades gracefully when IVR is unreachable.
    }
  }

  async function loadChannel(login) {
    channelBadges.clear();
    const clean = String(login || '').trim().toLowerCase();
    if (!clean) return;
    try {
      const res = await fetchImpl(`${ENDPOINTS.IVR_BASE}/badges/channel?login=${encodeURIComponent(clean)}`);
      if (!res.ok) return;
      indexBadgeSets(await res.json(), channelBadges);
    } catch {
      // Channel badge failure falls back to global badges.
    }
  }

  function resolve(badgeList) {
    if (!Array.isArray(badgeList)) return [];
    const resolved = [];
    for (const badge of badgeList) {
      const key = `${badge.type}/${badge.version}`;
      const url = channelBadges.get(key) || globalBadges.get(key);
      if (url) {
        resolved.push({ type: badge.type, version: badge.version, url });
      }
    }
    return resolved;
  }

  return { loadGlobal, loadChannel, resolve };
}
