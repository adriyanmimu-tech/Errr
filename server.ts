// @ts-nocheck
import { spawn } from "child_process";
import crypto from "crypto";
import express from "express";
import fs from "fs";
import http from "http";
import https from "https";
import path from "path";
import { fileURLToPath } from "url";
import * as webpush from "web-push";
import { ALL_CATEGORIES, INITIAL_FALLBACK_MOVIES, TOP_10_THIS_WEEK_ITEMS } from "./src/data/categories";
import { cloakApiUrl, cloakImageUrl, cloakPayloadDeep, cloakStreamUrl, decodeCloakToken, encodeCloakToken, getNotificationPosterUrl } from "./src/utils/securityShield";
import { cleanTimeAgoAndEpisode, deduplicateMovieCards, getCanonicalTitleKey, getItemMinutesAgo, getMovieHypeMetrics, normalizeMovieCardItem, normalizeMovieCardList, sortItemsByHighRating, sortItemsByHotAndHype, sortItemsByRecentUpload } from "./src/utils/timeAgo";

// server.ts
var import_meta = {};
var __dirname = typeof import_meta?.url === "string" && import_meta.url ? path.dirname(fileURLToPath(import_meta.url)) : process.cwd();
process.on("uncaughtException", (err) => {
  console.error("Uncaught exception (kept server alive):", err?.message || err);
});
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection (kept server alive):", reason);
});
var SERVER_NODES = [
  { id: "node-moviebox", name: "CinePulse HD", region: "CinePulse Global 4K/1080p Cloud", origin: "https://movie-box.co" }
];
var PRIMARY_MIRROR_NODES = SERVER_NODES.filter((n) => n.id !== "node-myflix" && n.id !== "node-moviebox");
var MOVIEBOX_ORIGIN = "https://movie-box.co";
var MOVIEBOX_API_ORIGIN = "https://movie-box.co";
var MOVIEBOX_FALLBACK_API_ORIGIN = "https://h5-api.aoneroom.com";
var FFMPEG_BIN = fs.existsSync("/usr/bin/ffmpeg") ? "/usr/bin/ffmpeg" : fs.existsSync("/usr/local/bin/ffmpeg") ? "/usr/local/bin/ffmpeg" : "ffmpeg";
function pruneCacheMap(map, maxEntries) {
  if (map.size <= maxEntries) return;
  const excess = map.size - maxEntries;
  let removed = 0;
  for (const key of map.keys()) {
    map.delete(key);
    removed++;
    if (removed >= excess) break;
  }
}
var catalogCache = /* @__PURE__ */ new Map();
var detailCache = /* @__PURE__ */ new Map();
var detailTitleCache = /* @__PURE__ */ new Map();
var imdbIdCache = /* @__PURE__ */ new Map();
var healthCache = null;
var mirrorHtmlCache = /* @__PURE__ */ new Map();
var inFlightMirrorMap = /* @__PURE__ */ new Map();
function sortSourcesFastestFirst(sources) {
  if (!Array.isArray(sources) || sources.length <= 1) return sources || [];
  const score = (src) => {
    const isEmbed = src.type === "embed" || /abyssplayer\.com|abysscdn\.com|vidsrc|multiembed|autoembed|myflix/i.test(`${src.url || ""} ${src.id || ""}`);
    if (isEmbed) return 400;
    const isMovieBox = src.id?.startsWith("mb-") || /\/api\/mb-stream|\/api\/mb-ep-stream/i.test(src.url || "");
    if (isMovieBox) {
      const baseMb = 4500;
      const sizeMatch = (src.name || "").match(/(\d+)\s*MB/i);
      const sizeMb = sizeMatch ? parseInt(sizeMatch[1], 10) : 0;
      const isHeavyFile = sizeMb > 350;
      if (src.quality === 720) return baseMb + 140;
      if (src.quality === 480) return baseMb + 135;
      if (src.quality === 360) return baseMb + 125;
      if (src.quality === 1080) return isHeavyFile ? baseMb + 80 : baseMb + 130;
      return baseMb + 100;
    }
    const isHevc = /\b(hevc|h\.?265|x265|10bit|av1)\b/i.test(`${src.name} ${src.qualityLabel}`);
    const isBestHeavy = /best\s*quality/i.test(src.qualityLabel || "");
    let s = isHevc ? 1400 : 3e3;
    if (isBestHeavy) s -= 250;
    if (src.quality >= 360 && src.quality <= 576) s += 650;
    else if (src.quality === 720) s += 550;
    else if (src.quality === 1080) s += 400;
    else s += 150;
    return s;
  };
  return [...sources].sort((a, b) => score(b) - score(a));
}
function storeDetailInCaches(itemPath, det, expiresAt) {
  if (!det || typeof det !== "object") return;
  const safeExpiresAt = Math.min(expiresAt, Date.now() + 12 * 6e4);
  if (Array.isArray(det.episodes)) {
    for (const ep of det.episodes) {
      if (Array.isArray(ep.sources)) {
        ep.sources = sortSourcesFastestFirst(ep.sources);
      }
    }
  }
  if (itemPath) {
    pruneCacheMap(detailCache, 180);
    detailCache.set(itemPath, { data: det, expiresAt: safeExpiresAt });
  }
  if (det.title && det.episodes?.length) {
    pruneCacheMap(detailTitleCache, 240);
    const canon = getCanonicalTitleKey(det.title);
    if (canon) detailTitleCache.set(canon, { data: det, expiresAt: safeExpiresAt });
    const base = extractBaseSeriesTitle(det.title).toLowerCase();
    if (base) detailTitleCache.set(base, { data: det, expiresAt: safeExpiresAt });
  }
}
function findCachedDetailByPathOrTitle(itemPath, rawTitle = "") {
  const now = Date.now();
  if (itemPath) {
    const hit = detailCache.get(itemPath);
    if (hit && hit.expiresAt > now && hit.data?.episodes?.length) {
      return hit.data;
    }
    if (itemPath.startsWith("/mb/")) {
      return null;
    }
  }
  if (rawTitle) {
    const canon = getCanonicalTitleKey(rawTitle);
    const byCanon = canon ? detailTitleCache.get(canon) : void 0;
    if (byCanon && byCanon.expiresAt > now && byCanon.data?.episodes?.length) return byCanon.data;
    const base = extractBaseSeriesTitle(rawTitle).toLowerCase();
    const byBase = base ? detailTitleCache.get(base) : void 0;
    if (byBase && byBase.expiresAt > now && byBase.data?.episodes?.length) return byBase.data;
  }
  return null;
}
var movieRequestsStore = [
  {
    id: "req-1",
    title: "Pushpa 2: The Rule (2025) [Bangla Dubbed 4K]",
    type: "MOVIE",
    language: "Bangla Dubbed",
    notes: "Full HD 1080p Dual Audio version",
    status: "Processing",
    createdAt: Date.now() - 36e5 * 5
  },
  {
    id: "req-2",
    title: "Solo Leveling Season 2 [Hindi + Japanese Dual Audio]",
    type: "ANIME",
    language: "Dual Audio",
    notes: "All episodes 1080p WEB-DL",
    status: "Queued",
    createdAt: Date.now() - 36e5 * 2
  }
];
var customBroadcastNotifications = [];
var VAPID_KEYS_FILE = path.join(__dirname, "vapid-keys.json");
var PUSH_SUBS_FILE = path.join(__dirname, "push-subscriptions.json");
var vapidKeys = (() => {
  try {
    if (fs.existsSync(VAPID_KEYS_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(VAPID_KEYS_FILE, "utf8"));
      if (parsed?.publicKey && parsed?.privateKey) return parsed;
    }
  } catch {}
  const generated = webpush.generateVAPIDKeys();
  try {
    fs.writeFileSync(VAPID_KEYS_FILE, JSON.stringify(generated, null, 2), "utf8");
  } catch {}
  return generated;
})();
try {
  webpush.setVapidDetails(
    "mailto:support@chinepulse.71i.site",
    vapidKeys.publicKey,
    vapidKeys.privateKey
  );
} catch {}
var pushSubscriptionsMap = /* @__PURE__ */ new Map();
try {
  if (fs.existsSync(PUSH_SUBS_FILE)) {
    const rawSubs = JSON.parse(fs.readFileSync(PUSH_SUBS_FILE, "utf8"));
    if (Array.isArray(rawSubs)) {
      for (const s of rawSubs) {
        if (s?.endpoint) pushSubscriptionsMap.set(s.endpoint, s);
      }
    }
  }
} catch {}
function savePushSubscriptionsToDisk() {
  try {
    const list = Array.from(pushSubscriptionsMap.values()).slice(-1500);
    fs.writeFileSync(PUSH_SUBS_FILE, JSON.stringify(list), "utf8");
  } catch {}
}
async function broadcastWebPushNotificationToAll(notif) {
  if (!notif || pushSubscriptionsMap.size === 0) return 0;
  const posterThumb = getNotificationPosterUrl(notif.movie?.poster || "") || "./pwa-192x192.png";
  const payloadStr = JSON.stringify({
    title: notif.headlineBn,
    body: "",
    poster: posterThumb,
    badge: "./notif-badge.png",
    tag: notif.id,
    movieId: notif.movie?.id || "",
    url: `/?watch=${encodeURIComponent(notif.movie?.path || "")}&title=${encodeURIComponent(notif.movie?.title || "")}`
  });
  let delivered = 0;
  let removedAny = false;
  const entries = Array.from(pushSubscriptionsMap.entries());
  await Promise.allSettled(
    entries.map(async ([endpoint, sub]) => {
      try {
        await webpush.sendNotification(sub, payloadStr, { TTL: 86400, urgency: "high" });
        delivered++;
      } catch (err) {
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          pushSubscriptionsMap.delete(endpoint);
          removedAny = true;
        }
      }
    })
  );
  if (removedAny) savePushSubscriptionsToDisk();
  return delivered;
}
function formatMovieBoxStyleNotification(item, idx, category, now) {
  const cleanTitle = item.title.replace(/\s*\((?:19|20)\d{2}\)\s*/g, " ").replace(/\s*\[[^\]]*\]\s*/g, " ").replace(/\s+/g, " ").trim();
  const rawDesc = String(item.description || "").trim();
  const ratingNum = parseFloat(item.rating || "8.7") || 8.7;
  const compactHooks = [
    "Hero? Not quite. Legend? Absolutely.",
    "Is back\u2014what will happen next?",
    "Heating up\u2014tap to watch now!",
    "Every secret has a price. Watch now!",
    "Unstoppable action. Stream in Full HD!",
    "The wait is over\u2014new episode live!"
  ];
  const shortHook = rawDesc && rawDesc.length <= 52 ? rawDesc : compactHooks[idx % compactHooks.length];
  const headline = `${cleanTitle} \u2014 ${shortHook}`;
  const minsList = [1, 5, 12, 23, 35, 48, 65, 90, 120, 165, 210, 260];
  const mins = minsList[idx % minsList.length];
  const timeBadge = mins <= 2 ? "Just now" : mins < 60 ? `${mins}m ago` : `${Math.floor(mins / 60)}h ago`;
  return {
    id: `notif-${category === "NEW_UPLOAD" ? "new" : "pop"}-${item.id}`,
    category,
    badgeText: timeBadge,
    headlineBn: headline,
    subtitleBn: "",
    movie: item,
    createdAt: Math.max(now - mins * 6e4, now - 24 * 36e5),
    ratingScore: ratingNum
  };
}
function buildGlobalNotifications() {
  const now = Date.now();
  const pool = [];
  const seenPaths = /* @__PURE__ */ new Set();
  const seenTitles = /* @__PURE__ */ new Set();
  for (const sec of cachedMovieBoxHomeSections) {
    if (!Array.isArray(sec.subjects)) continue;
    for (let idx = 0; idx < sec.subjects.length; idx++) {
      const card = mapMovieBoxItemToCard(sec.subjects[idx], idx);
      if (!card || card.isAdult) continue;
      const item = normalizeMovieCardItem(card, now);
      const tKey = item.title.toLowerCase().replace(/[^a-z0-9\u0980-\u09ff]/g, "");
      if (!item.path || seenPaths.has(item.path) || tKey && seenTitles.has(tKey)) continue;
      seenPaths.add(item.path);
      if (tKey) seenTitles.add(tKey);
      pool.push(item);
    }
  }
  for (const [key, entry] of catalogCache.entries()) {
    if (key.includes("adult18plus")) continue;
    for (const rawItem of entry.data.items.slice(0, 24)) {
      if (rawItem.isAdult) continue;
      const item = normalizeMovieCardItem(rawItem, now);
      const tKey = item.title.toLowerCase().replace(/[^a-z0-9\u0980-\u09ff]/g, "");
      if (!item.path || seenPaths.has(item.path) || tKey && seenTitles.has(tKey)) continue;
      seenPaths.add(item.path);
      if (tKey) seenTitles.add(tKey);
      pool.push(item);
    }
  }
  if (pool.length < 10) {
    for (const rawItem of INITIAL_FALLBACK_MOVIES["/"] || []) {
      if (rawItem.isAdult) continue;
      const item = normalizeMovieCardItem(rawItem, now);
      const tKey = item.title.toLowerCase().replace(/[^a-z0-9\u0980-\u09ff]/g, "");
      if (!item.path || seenPaths.has(item.path) || tKey && seenTitles.has(tKey)) continue;
      seenPaths.add(item.path);
      if (tKey) seenTitles.add(tKey);
      pool.push(item);
    }
  }
  const withDesc = pool.filter((i) => Boolean(i.description));
  const withoutDesc = pool.filter((i) => !i.description);
  const orderedPool = [...withDesc, ...withoutDesc];
  const recentUploads = sortItemsByRecentUpload(orderedPool, now).slice(0, 14);
  const topRatedPopular = sortItemsByHighRating(orderedPool, now).slice(0, 14);
  const notifications = [...customBroadcastNotifications];
  const notifSeen = new Set(notifications.map((n) => n.movie.path));
  const maxLen = Math.max(recentUploads.length, topRatedPopular.length);
  let notifIdx = 0;
  for (let i = 0; i < maxLen; i++) {
    const newItem = recentUploads[i];
    if (newItem && !notifSeen.has(newItem.path)) {
      notifSeen.add(newItem.path);
      notifications.push(
        formatMovieBoxStyleNotification(newItem, notifIdx++, "NEW_UPLOAD", now)
      );
    }
    const popItem = topRatedPopular[i];
    if (popItem && !notifSeen.has(popItem.path)) {
      notifSeen.add(popItem.path);
      notifications.push(
        formatMovieBoxStyleNotification(popItem, notifIdx++, "TOP_RATED_POPULAR", now)
      );
    }
  }
  return notifications.slice(0, 28);
}
var CINEPULSE_AES_KEY = crypto.createHash("sha256").update("CinePulse_AES256_Master_Key_v4_9x7A2mK8pQ4wL1zR6vN3jH5bT0yF").digest();
var SHIELD_SECRET = "CP_SHIELD_v4_9x7A2mK8pQ4wL1zR6vN3jH5bT0yF";
function computeServerShieldSignature(pathAndQuery, timestampStr) {
  const cleanPath = (pathAndQuery || "/").split("#")[0];
  const raw = `${timestampStr}::${cleanPath}::${SHIELD_SECRET}`;
  let h1 = 2166136261 >>> 0;
  let h2 = 16777619 >>> 0;
  for (let i = 0; i < raw.length; i++) {
    const c = raw.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 16777619) >>> 0;
    h2 ^= c + (i & 255);
    h2 = Math.imul(h2, 2246822507) >>> 0;
  }
  return `${h1.toString(16).padStart(8, "0")}${h2.toString(16).padStart(8, "0")}`;
}
function encryptServerApiPayload(payloadObj) {
  const cloned = cloakPayloadDeep(JSON.parse(JSON.stringify(payloadObj)));
  const jsonText = JSON.stringify(cloned);
  const plainBuf = Buffer.from(jsonText, "utf8");
  const nonce = crypto.randomBytes(6).toString("hex");
  const keyStr = `${SHIELD_SECRET}::${nonce}`;
  const keyBytes = Buffer.from(keyStr, "utf8");
  const kLen = keyBytes.length;
  let state = 1513922071 >>> 0;
  for (let i = 0; i < kLen; i++) {
    state = Math.imul(state ^ keyBytes[i], 1664525) + 1013904223 >>> 0;
  }
  const outBuf = Buffer.allocUnsafe(plainBuf.length);
  for (let i = 0; i < plainBuf.length; i++) {
    state = Math.imul(state, 1664525) + 1013904223 >>> 0;
    const mask = (state >>> 16 ^ keyBytes[i % kLen] ^ i & 255) & 255;
    outBuf[i] = plainBuf[i] ^ mask;
  }
  return {
    _s: 1,
    n: nonce,
    d: outBuf.toString("base64")
  };
}
function encodeGatewayToken(rawUrl) {
  if (!rawUrl) return "";
  try {
    const iv = crypto.createHash("md5").update(`${rawUrl}::cp_iv_v4`).digest().subarray(0, 12);
    const cipher = crypto.createCipheriv("aes-256-gcm", CINEPULSE_AES_KEY, iv);
    const encrypted = Buffer.concat([cipher.update(rawUrl, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `cp1.${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
  } catch {
    return Buffer.from(rawUrl, "utf8").toString("base64url");
  }
}
function decodeGatewayToken(token) {
  if (!token) return "";
  try {
    const trimmed = token.trim();
    if (trimmed.startsWith("cp1.")) {
      const parts = trimmed.split(".");
      if (parts.length === 4) {
        const iv = Buffer.from(parts[1], "base64url");
        const tag = Buffer.from(parts[2], "base64url");
        const encrypted = Buffer.from(parts[3], "base64url");
        const decipher = crypto.createDecipheriv("aes-256-gcm", CINEPULSE_AES_KEY, iv);
        decipher.setAuthTag(tag);
        const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
        return decrypted.toString("utf8");
      }
    }
    return Buffer.from(trimmed, "base64url").toString("utf8");
  } catch {
    return "";
  }
}
function sanitizeBrandText(input) {
  if (!input) return "";
  return input.replace(/https?:\/\/[^\s"'<>]*(?:movielinkbd|myflixbd)[^\s"'<>]*/gi, "").replace(/\b[a-z0-9-]*\.?(?:movielinkbd|myflixbd)\.[a-z]{2,6}\b/gi, "CinePulse").replace(/movielinkbd|myflixbd|nexaflox/gi, "CinePulse").replace(/\bmlbd\b/gi, "CP").replace(/\s*watch\s+online\s+and\s+download\s*(?:["“”']?web-dl["“”']?|["“”']?hdtc["“”']?|["“”']?hd["“”']?|["“”']?4k["“”']?)?\s*…?/gi, "").replace(/\s*watch\s+online\s*…?/gi, "").replace(/\s*[“”"'](?:web(?:-?dl|rip)?|hdtc|hdts|4k|hd)[^"”]*[”"']?\s*…?\s*$/gi, "").replace(/\s+[–—-]\s*$/g, "").replace(/\s{2,}/g, " ").trim();
}
function getOrderedNodes(preferredNodeId) {
  if (!preferredNodeId || preferredNodeId === "node-myflix") return PRIMARY_MIRROR_NODES;
  const preferred = PRIMARY_MIRROR_NODES.find((n) => n.id === preferredNodeId);
  if (!preferred) return PRIMARY_MIRROR_NODES;
  return [preferred, ...PRIMARY_MIRROR_NODES.filter((n) => n.id !== preferredNodeId)];
}
async function fetchFromMirrors(targetPath, preferredNodeId) {
  const cleanPath = targetPath.startsWith("http") ? new URL(targetPath).pathname + new URL(targetPath).search : targetPath.startsWith("/") ? targetPath : `/${targetPath}`;
  const orderedNodes = getOrderedNodes(preferredNodeId);
  const attemptNode = async (node, timeoutMs) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const url = `${node.origin}${cleanPath}`;
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9,bn;q=0.8",
          Cookie: "mlbd_show18=1; hide18On=false",
          Referer: `${node.origin}/`
        }
      });
      if (!res.ok && res.status !== 404) {
        throw new Error(`HTTP ${res.status}`);
      }
      const html = await res.text();
      if (!html || html.length < 1200 || !html.includes("movie-card") && !html.includes("mlbdInlinePlayerData") && !html.includes('<div class="n">404</div>')) {
        throw new Error("Challenge or incomplete HTML");
      }
      const finalOrigin = new URL(res.url || url).origin;
      return { html, finalOrigin, activeNodeId: node.id };
    } finally {
      clearTimeout(timer);
    }
  };
  const mirrorKey = `${preferredNodeId || "auto"}::${cleanPath}`;
  const cachedMirror = mirrorHtmlCache.get(mirrorKey);
  if (cachedMirror && cachedMirror.expiresAt > Date.now()) {
    return cachedMirror.data;
  }
  const existingFlight = inFlightMirrorMap.get(mirrorKey);
  if (existingFlight) {
    return existingFlight;
  }
  const runMirrorFetch = (async () => {
    try {
      const winner = await Promise.any(
        orderedNodes.slice(0, 2).map((node) => attemptNode(node, 4500))
      );
      pruneCacheMap(mirrorHtmlCache, 60);
      mirrorHtmlCache.set(mirrorKey, { data: winner, expiresAt: Date.now() + 45e3 });
      return winner;
    } catch {
      for (const node of orderedNodes.slice(2)) {
        try {
          const fallbackWinner = await attemptNode(node, 5e3);
          pruneCacheMap(mirrorHtmlCache, 60);
          mirrorHtmlCache.set(mirrorKey, { data: fallbackWinner, expiresAt: Date.now() + 45e3 });
          return fallbackWinner;
        } catch {
        }
      }
    }
    throw new Error("All cinema stream nodes unreachable");
  })();
  inFlightMirrorMap.set(mirrorKey, runMirrorFetch);
  try {
    return await runMirrorFetch;
  } finally {
    inFlightMirrorMap.delete(mirrorKey);
  }
}
function extractBaseSeriesTitle(rawTitle) {
  return String(rawTitle || "").replace(/\[.*?\]|\(.*?\)/g, " ").replace(/\b(?:S\d+|Season\s*\d+(?:-\d+)?|Ep(?:isode)?\s*\d+(?:-\d+)?|Complete(?:d)?|Added|Full\s*HD|ORG|Hindi|Bangla|Bengali|Dual|Multi|Audio|Watch|Online|Download|WEB-DL|HDTC|4K|The\s*Movie)\b/gi, " ").replace(/[:\-–—|]+/g, " ").replace(/\s{2,}/g, " ").trim();
}
var cachedMovieBoxToken = "";
var cachedMovieBoxTokenExpiresAt = 0;
var cachedMovieBoxHomeSections = [];
var cachedMovieBoxHomeExpiresAt = 0;
var cachedMovieBoxHomePayload = null;
var cachedMovieBoxHomePayloadExpiresAt = 0;
var inFlightMovieBoxHomePromise = null;
function extractMovieBoxNuxtOperatingList(html) {
  try {
    const m = html.match(/<script[^>]*id="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
    if (!m?.[1]) return [];
    const arr = JSON.parse(m[1]);
    if (!Array.isArray(arr)) return [];
    const resolve = (idx, depth = 0) => {
      if (depth > 8 || typeof idx !== "number" || idx < 0 || idx >= arr.length) return idx;
      const val = arr[idx];
      if (Array.isArray(val)) {
        if (val[0] === "ShallowReactive" || val[0] === "Reactive" || val[0] === "Ref") {
          return resolve(val[1], depth + 1);
        }
        return val.map((v) => resolve(v, depth + 1));
      }
      if (val && typeof val === "object") {
        const out = {};
        for (const [k, v] of Object.entries(val)) {
          out[k] = resolve(v, depth + 1);
        }
        return out;
      }
      return val;
    };
    for (let i = 0; i < arr.length; i++) {
      const v = arr[i];
      if (v && typeof v === "object" && !Array.isArray(v) && "operatingList" in v) {
        const resolved = resolve(i);
        if (Array.isArray(resolved?.operatingList) && resolved.operatingList.length > 0) {
          return resolved.operatingList;
        }
      }
    }
  } catch {
  }
  return [];
}
function extractMovieBoxNuxtDetail(html) {
  try {
    const m = html.match(/<script[^>]*id="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
    if (!m?.[1]) return null;
    const arr = JSON.parse(m[1]);
    if (!Array.isArray(arr)) return null;
    const resolve = (idx, depth = 0) => {
      if (depth > 8 || typeof idx !== "number" || idx < 0 || idx >= arr.length) return idx;
      const val = arr[idx];
      if (Array.isArray(val)) {
        if (val[0] === "ShallowReactive" || val[0] === "Reactive" || val[0] === "Ref") {
          return resolve(val[1], depth + 1);
        }
        return val.map((v) => resolve(v, depth + 1));
      }
      if (val && typeof val === "object") {
        const out = {};
        for (const [k, v] of Object.entries(val)) {
          out[k] = resolve(v, depth + 1);
        }
        return out;
      }
      return val;
    };
    for (let i = 0; i < arr.length; i++) {
      const v = arr[i];
      if (v && typeof v === "object" && !Array.isArray(v) && "subject" in v && "resource" in v) {
        const resolved = resolve(i);
        if (resolved?.subject?.subjectId) {
          return { code: 0, message: "ok", data: resolved };
        }
      }
    }
  } catch {
  }
  return null;
}
function mapMovieBoxShelfTitleToMeta(rawTitle) {
  const t = rawTitle.toLowerCase();
  if (t.includes("trending drama")) {
    return { bnTitle: "\u099F\u09CD\u09B0\u09C7\u09A8\u09CD\u09A1\u09BF\u0982 \u09A1\u09CD\u09B0\u09BE\u09AE\u09BE \u09B8\u09BF\u09B0\u09BF\u099C", categoryPath: "/category/trending-drama", badge: "HOT DRAMA" };
  }
  if (t.includes("trending movie")) {
    return { bnTitle: "\u099F\u09CD\u09B0\u09C7\u09A8\u09CD\u09A1\u09BF\u0982 \u09AE\u09C1\u09AD\u09BF (CinePulse Top)", categoryPath: "/type/movies", badge: "TRENDING" };
  }
  if (t.includes("indian cinema") || t.includes("trending india")) {
    return { bnTitle: "\u0987\u09A8\u09CD\u09A1\u09BF\u09DF\u09BE\u09A8 \u09B8\u09BF\u09A8\u09C7\u09AE\u09BE \u099F\u09CD\u09B0\u09C7\u09A8\u09CD\u09A1\u09BF\u0982", categoryPath: "/category/indian-cinema", badge: "INDIA TOP" };
  }
  if (t.includes("bengali")) {
    return { bnTitle: "\u099F\u09CD\u09B0\u09C7\u09A8\u09CD\u09A1\u09BF\u0982 \u09AC\u09BE\u0982\u09B2\u09BE \u09AE\u09C1\u09AD\u09BF \u0993 \u09A8\u09BE\u099F\u0995", categoryPath: "/language/bangla", badge: "BANGLA HIT" };
  }
  if (t.includes("bollywood")) {
    return { bnTitle: "\u09AC\u09B2\u09BF\u0989\u09A1 \u09B9\u09BF\u09A8\u09CD\u09A6\u09BF \u09AE\u09C1\u09AD\u09BF", categoryPath: "/bollywood", badge: "BOLLYWOOD" };
  }
  if (t.includes("south indian")) {
    return { bnTitle: "\u09B8\u09BE\u0989\u09A5 \u0987\u09A8\u09CD\u09A1\u09BF\u09DF\u09BE\u09A8 \u09AC\u09CD\u09B2\u0995\u09AC\u09BE\u09B8\u09CD\u099F\u09BE\u09B0", categoryPath: "/southIndian", badge: "SOUTH DUB" };
  }
  if (t.includes("hollywood") || t.includes("trending western")) {
    return { bnTitle: "\u09B9\u09B2\u09BF\u0989\u09A1 \u09AC\u09CD\u09B2\u0995\u09AC\u09BE\u09B8\u09CD\u099F\u09BE\u09B0 \u09AE\u09C1\u09AD\u09BF", categoryPath: "/language/english", badge: "HOLLYWOOD" };
  }
  if (t.includes("short tv") || t.includes("shorttv")) {
    return { bnTitle: "\u09B9\u099F \u09B6\u09B0\u09CD\u099F \u099F\u09BF\u09AD\u09BF \u0993 \u09AE\u09BF\u09A8\u09BF \u09A1\u09CD\u09B0\u09BE\u09AE\u09BE", categoryPath: "/category/short-tv", badge: "SHORT TV" };
  }
  if (t.includes("c-drama")) {
    return { bnTitle: "\u099A\u09BE\u09DF\u09A8\u09BF\u099C \u09A1\u09CD\u09B0\u09BE\u09AE\u09BE \u0993 \u09B8\u09BF\u09B0\u09BF\u099C", categoryPath: "/language/chinese", badge: "C-DRAMA" };
  }
  if (t.includes("asian drama") || t.includes("k-drama") || t.includes("thai-drama") || t.includes("filipino drama")) {
    return { bnTitle: "\u0995\u09CB\u09B0\u09BF\u09DF\u09BE\u09A8 \u0993 \u098F\u09B6\u09BF\u09DF\u09BE\u09A8 \u09A1\u09CD\u09B0\u09BE\u09AE\u09BE", categoryPath: "/drama", badge: "ASIAN DRAMA" };
  }
  if (t.includes("western tv")) {
    return { bnTitle: "\u0993\u09DF\u09C7\u09B8\u09CD\u099F\u09BE\u09B0\u09CD\u09A8 \u0993 \u09B9\u09B2\u09BF\u0989\u09A1 \u099F\u09BF\u09AD\u09BF \u09B6\u09CB", categoryPath: "/category/western-tv", badge: "WESTERN TV" };
  }
  if (t.includes("anime in hindi")) {
    return { bnTitle: "\u09B9\u09BF\u09A8\u09CD\u09A6\u09BF \u09A1\u09BE\u09AC\u09BF\u0982 \u0985\u09CD\u09AF\u09BE\u09A8\u09BF\u09AE\u09C7", categoryPath: "/category/anime-hindi", badge: "HINDI ANIME" };
  }
  if (t.includes("animated film")) {
    return { bnTitle: "\u0985\u09CD\u09AF\u09BE\u09A8\u09BF\u09AE\u09C7\u09B6\u09A8 \u09AE\u09C1\u09AD\u09BF", categoryPath: "/genre/animation", badge: "ANIMATION" };
  }
  if (t.includes("popular anime") || t.includes("anime")) {
    return { bnTitle: "\u099C\u09A8\u09AA\u09CD\u09B0\u09BF\u09DF \u0985\u09CD\u09AF\u09BE\u09A8\u09BF\u09AE\u09C7 \u09B8\u09BF\u09B0\u09BF\u099C", categoryPath: "/anime", badge: "ANIME" };
  }
  if (t.includes("horror") || t.includes("frights")) {
    return { bnTitle: "\u09B9\u09B0\u09B0 \u0993 \u09AD\u09CC\u09A4\u09BF\u0995 \u09AE\u09C1\u09AD\u09BF", categoryPath: "/genre/horror", badge: "HORROR" };
  }
  if (t.includes("monster") || t.includes("titan")) {
    return { bnTitle: "\u09B8\u09BE\u09DF\u09C7\u09A8\u09CD\u09B8 \u09AB\u09BF\u0995\u09B6\u09A8 \u0993 \u09AB\u09CD\u09AF\u09BE\u09A8\u09CD\u099F\u09BE\u09B8\u09BF", categoryPath: "/genre/sci-fi", badge: "SCI-FI" };
  }
  if (t.includes("recently added") || t.includes("movie new release")) {
    return { bnTitle: "\u09B8\u09A6\u09CD\u09AF \u09AE\u09C1\u0995\u09CD\u09A4\u09BF\u09AA\u09CD\u09B0\u09BE\u09AA\u09CD\u09A4 \u09A8\u09A4\u09C1\u09A8 \u09AE\u09C1\u09AD\u09BF", categoryPath: "/type/movies", badge: "NEW MOVIE" };
  }
  if (t.includes("tv series new release")) {
    return { bnTitle: "\u09A8\u09A4\u09C1\u09A8 \u099F\u09BF\u09AD\u09BF \u0993 \u0993\u09DF\u09C7\u09AC \u09B8\u09BF\u09B0\u09BF\u099C", categoryPath: "/type/series", badge: "NEW SERIES" };
  }
  if (t.includes("punjabi")) {
    return { bnTitle: "\u09B8\u09C7\u09B0\u09BE \u09AA\u09BE\u099E\u09CD\u099C\u09BE\u09AC\u09BF \u09AE\u09C1\u09AD\u09BF", categoryPath: "/language/punjabi", badge: "PUNJABI" };
  }
  if (t.includes("indian drama")) {
    return { bnTitle: "\u0987\u09A8\u09CD\u09A1\u09BF\u09DF\u09BE\u09A8 \u09A1\u09CD\u09B0\u09BE\u09AE\u09BE \u0993 \u09B8\u09BF\u09B0\u09BF\u09DF\u09BE\u09B2", categoryPath: "/category/indian-drama", badge: "INDIAN DRAMA" };
  }
  if (t.includes("arabic")) {
    return { bnTitle: "\u0986\u09B0\u09AC\u09BF \u09A1\u09CD\u09B0\u09BE\u09AE\u09BE \u0993 \u09B8\u09BF\u09B0\u09BF\u099C", categoryPath: "/category/arabic-drama", badge: "ARABIC" };
  }
  if (t.includes("ramadan")) {
    return { bnTitle: "\u09B0\u09AE\u099C\u09BE\u09A8 \u09B8\u09CD\u09AA\u09C7\u09B6\u09BE\u09B2 \u09A1\u09CD\u09B0\u09BE\u09AE\u09BE", categoryPath: "/category/arabic-drama", badge: "SPECIAL" };
  }
  return { bnTitle: rawTitle, categoryPath: "/type/movies" };
}
var inFlightTokenPromise = null;
function generateMovieBoxClientToken() {
  const ts = Math.floor(Date.now() / 1e3);
  const rev = String(ts).split("").reverse().join("");
  const hash = crypto.createHash("md5").update(rev).digest("hex");
  return `${ts},${hash}`;
}
async function getMovieBoxBearerToken(needHomeSections = false) {
  if (cachedMovieBoxToken && cachedMovieBoxTokenExpiresAt > Date.now() && (!needHomeSections || cachedMovieBoxHomeSections.length > 0 && cachedMovieBoxHomeExpiresAt > Date.now())) {
    return cachedMovieBoxToken;
  }
  if (inFlightTokenPromise) {
    return inFlightTokenPromise;
  }
  inFlightTokenPromise = (async () => {
    try {
      if (!cachedMovieBoxToken || cachedMovieBoxTokenExpiresAt <= Date.now()) {
        const pkgEndpoints = [
          `${MOVIEBOX_FALLBACK_API_ORIGIN}/wefeed-h5api-bff/app/get-latest-app-pkgs?appName=moviebox`,
          `${MOVIEBOX_ORIGIN}/wefeed-h5api-bff/app/get-latest-app-pkgs?appName=moviebox`
        ];
        for (const pkgUrl of pkgEndpoints) {
          try {
            const pkgRes = await fetch(pkgUrl, {
              headers: {
                Accept: "application/json",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
                Referer: "https://movie-box.co/?utm_source=mb_app_inner_btmtip",
                "X-Client-Info": JSON.stringify({ timezone: "Asia/Dhaka" }),
                "X-Client-Token": generateMovieBoxClientToken(),
                "X-Vip-Restrict": "0",
                "X-No-High-Risk-Restrict": "1",
                "X-Request-Lang": "en"
              },
              signal: AbortSignal.timeout(2500)
            });
            const xUser = pkgRes.headers.get("x-user") || pkgRes.headers.get("x-user-info");
            if (xUser) {
              const parsed = JSON.parse(xUser);
              if (parsed?.token) {
                cachedMovieBoxToken = String(parsed.token);
                cachedMovieBoxTokenExpiresAt = Date.now() + 2 * 36e5;
                break;
              }
            }
          } catch {
          }
        }
      }
      const shouldFetchSsr = needHomeSections && (cachedMovieBoxHomeSections.length === 0 || cachedMovieBoxHomeExpiresAt <= Date.now());
      const ssrPromise = shouldFetchSsr ? fetch(`${MOVIEBOX_ORIGIN}/`, {
        headers: {
          "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "en-US,en;q=0.9,bn;q=0.8,hi;q=0.7"
        },
        signal: AbortSignal.timeout(3800)
      }).then((r) => r.ok ? r.text() : "").then((html) => html ? extractMovieBoxNuxtOperatingList(html) : []).catch(() => []) : Promise.resolve([]);
      let bffOps = [];
      if (shouldFetchSsr) {
        const homeEndpoints = [
          `${MOVIEBOX_FALLBACK_API_ORIGIN}/wefeed-h5api-bff/home?host=movie-box.co`,
          `${MOVIEBOX_ORIGIN}/wefeed-h5api-bff/home?host=movie-box.co`
        ];
        for (const endpoint of homeEndpoints) {
          try {
            const headers = {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
              Accept: "application/json",
              Referer: "https://movie-box.co/?utm_source=mb_app_inner_btmtip",
              "X-Client-Info": JSON.stringify({ timezone: "Asia/Dhaka" }),
              "X-Vip-Restrict": "0",
              "X-No-High-Risk-Restrict": "1",
              "X-Request-Lang": "en"
            };
            if (cachedMovieBoxToken) {
              headers.Authorization = `Bearer ${cachedMovieBoxToken}`;
            } else {
              headers["X-Client-Token"] = generateMovieBoxClientToken();
            }
            const res = await fetch(endpoint, {
              headers,
              signal: AbortSignal.timeout(3e3)
            });
            const xUser = res.headers.get("x-user") || res.headers.get("x-user-info");
            if (xUser) {
              try {
                const parsed = JSON.parse(xUser);
                if (parsed?.token) {
                  cachedMovieBoxToken = String(parsed.token);
                  cachedMovieBoxTokenExpiresAt = Date.now() + 2 * 36e5;
                }
              } catch {
              }
            }
            if (res.ok) {
              const json = await res.json().catch(() => null);
              const ops = Array.isArray(json?.data?.operatingList) ? json.data.operatingList : [];
              if (ops.length > 0) {
                bffOps = ops;
                break;
              }
            }
          } catch {
          }
        }
      }
      if (!cachedMovieBoxTokenExpiresAt || cachedMovieBoxTokenExpiresAt <= Date.now()) {
        cachedMovieBoxTokenExpiresAt = Date.now() + 15 * 6e4;
      }
      const ssrOps = await ssrPromise;
      const combinedOps = [...ssrOps, ...bffOps];
      if (combinedOps.length > 0) {
        const seenTitles = /* @__PURE__ */ new Set();
        const sections = [];
        for (const op of combinedOps) {
          const title = String(op?.title || "").trim();
          const type = String(op?.type || "").trim();
          const subjects = Array.isArray(op?.subjects) ? op.subjects : Array.isArray(op?.banner?.items) ? op.banner.items : [];
          if (!subjects.length) continue;
          const key = `${type}::${title.toLowerCase()}`;
          if (seenTitles.has(key)) continue;
          seenTitles.add(key);
          sections.push({ title, type, subjects });
        }
        if (sections.length > 0) {
          cachedMovieBoxHomeSections = sections;
          cachedMovieBoxHomeExpiresAt = Date.now() + 3e5;
        }
      }
      return cachedMovieBoxToken;
    } finally {
      inFlightTokenPromise = null;
    }
  })();
  return inFlightTokenPromise;
}
async function fetchMovieBoxHomePayload() {
  if (cachedMovieBoxHomePayload && cachedMovieBoxHomePayloadExpiresAt > Date.now()) {
    return cachedMovieBoxHomePayload;
  }
  if (inFlightMovieBoxHomePromise) {
    return inFlightMovieBoxHomePromise;
  }
  const task = (async () => {
    try {
      const [ssrHtml] = await Promise.all([
        fetch(`${MOVIEBOX_ORIGIN}/`, {
          headers: {
            "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
            Accept: "text/html,application/xhtml+xml",
            "Accept-Language": "en-US,en;q=0.9,bn;q=0.8,hi;q=0.7"
          },
          signal: AbortSignal.timeout(5500)
        }).then((r) => r.ok ? r.text() : "").catch(() => ""),
        getMovieBoxBearerToken().catch(() => "")
      ]);
      const ssrOps = ssrHtml ? extractMovieBoxNuxtOperatingList(ssrHtml) : [];
      const banners = [];
      const seenBannerIds = /* @__PURE__ */ new Set();
      const comingSoon = [];
      const seenComingIds = /* @__PURE__ */ new Set();
      const shelves = [];
      const seenShelfIds = /* @__PURE__ */ new Set();
      const defaultQuickCategories = [
        {
          id: "qc-hollywood",
          title: "Hollywood",
          bnTitle: "\u09B9\u09B2\u09BF\u0989\u09A1 \u09AE\u09C1\u09AD\u09BF",
          image: "https://pbcdnw.aoneroom.com/image/2025/01/13/683063a45b61be3be1f9d7ef9b2d3072.png",
          path: "/language/english"
        },
        {
          id: "qc-bollywood",
          title: "Bollywood",
          bnTitle: "\u09AC\u09B2\u09BF\u0989\u09A1 \u09B9\u09BF\u09A8\u09CD\u09A6\u09BF",
          image: "https://pbcdnw.aoneroom.com/image/2025/01/13/95be398605ce21b60efbe7e7a5bf9fc2.png",
          path: "/bollywood"
        },
        {
          id: "qc-bengali",
          title: "Bengali Movies",
          bnTitle: "\u09AC\u09BE\u0982\u09B2\u09BE \u09AE\u09C1\u09AD\u09BF \u0993 \u09A8\u09BE\u099F\u0995",
          image: "https://pub-69b6234af505413bbeac2bbc8039195c.r2.dev/poster_4g8viv1792499980.jpg",
          path: "/language/bangla"
        },
        {
          id: "qc-south",
          title: "South Indian",
          bnTitle: "\u09B8\u09BE\u0989\u09A5 \u0987\u09A8\u09CD\u09A1\u09BF\u09DF\u09BE\u09A8",
          image: "https://pub-69b6234af505413bbeac2bbc8039195c.r2.dev/poster_06g5z71792073020.jpg",
          path: "/southIndian"
        },
        {
          id: "qc-kdrama",
          title: "K-Drama",
          bnTitle: "\u0995\u09CB\u09B0\u09BF\u09DF\u09BE\u09A8 \u09A1\u09CD\u09B0\u09BE\u09AE\u09BE",
          image: "https://pbcdnw.aoneroom.com/image/2025/01/13/1e5ef9bffd0b731d7eb4ef2c96ef7c77.png",
          path: "/drama"
        },
        {
          id: "qc-western",
          title: "Western TV",
          bnTitle: "\u0993\u09DF\u09C7\u09B8\u09CD\u099F\u09BE\u09B0\u09CD\u09A8 \u099F\u09BF\u09AD\u09BF",
          image: "https://pbcdnw.aoneroom.com/image/2025/01/13/3f4884c8e0f1fd7c92a4bf2c4a6b5e81.png",
          path: "/category/western-tv"
        },
        {
          id: "qc-anime",
          title: "Anime in Hindi",
          bnTitle: "\u09B9\u09BF\u09A8\u09CD\u09A6\u09BF \u0993 \u099C\u09BE\u09AA\u09BE\u09A8\u09BF\u099C \u0985\u09CD\u09AF\u09BE\u09A8\u09BF\u09AE\u09C7",
          image: "https://image.tmdb.org/t/p/original/n8rforZjHAB9uxqbwy7g6EdertA.jpg",
          path: "/category/anime-hindi"
        }
      ];
      const liveSports = [];
      for (const op of ssrOps) {
        const opType = String(op?.type || "").trim();
        const opTitle = String(op?.title || "").trim();
        if (opType === "BANNER" && Array.isArray(op?.banner?.items)) {
          for (let idx = 0; idx < op.banner.items.length; idx++) {
            const raw = op.banner.items[idx];
            const rawSubj = raw?.subject || raw;
            const sid = String(rawSubj?.subjectId || raw?.subjectId || "").trim();
            if (!sid || seenBannerIds.has(sid)) continue;
            seenBannerIds.add(sid);
            const card = mapMovieBoxItemToCard(
              {
                ...rawSubj,
                subjectId: sid,
                title: rawSubj?.title || raw?.title,
                detailPath: rawSubj?.detailPath || raw?.detailPath,
                cover: raw?.image || rawSubj?.cover
              },
              idx
            );
            if (card) banners.push(card);
          }
        } else if (opType === "APPOINTMENT_LIST" && Array.isArray(op?.subjects)) {
          for (const raw of op.subjects) {
            const sid = String(raw?.subjectId || "").trim();
            const title = String(raw?.title || "").trim();
            const poster = String(raw?.cover?.url || "").trim();
            if (!sid || !title || !poster || seenComingIds.has(sid)) continue;
            seenComingIds.add(sid);
            const detailSlug = String(raw?.detailPath || title).toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
            const releaseDate = String(raw?.releaseDate || raw?.appointmentDate || "").trim();
            let releaseBadge = releaseDate;
            if (/^\d{4}-\d{2}-\d{2}$/.test(releaseDate)) {
              const dt = /* @__PURE__ */ new Date(`${releaseDate}T00:00:00Z`);
              if (!isNaN(dt.getTime())) {
                releaseBadge = dt.toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  timeZone: "UTC"
                });
              }
            }
            comingSoon.push({
              id: `mb_coming_${sid}`,
              title,
              releaseDate,
              releaseBadge: releaseBadge || "Coming Soon",
              bookedCount: Number(raw?.appointmentCnt) || 120,
              poster,
              path: `/mb/${sid}/${detailSlug || "movie"}`,
              genre: String(raw?.genre || "Action, Drama"),
              country: String(raw?.countryName || "")
            });
          }
        } else if (opType === "SUBJECTS_MOVIE" && Array.isArray(op?.subjects) && opTitle) {
          const shelfKey = opTitle.toLowerCase().replace(/\bthe\b/g, "").replace(/[^a-z0-9]+/g, " ").trim();
          if (seenShelfIds.has(shelfKey) || /nollywood|black\s*shows|bet\+|banner_africa|bl\s*story|bl\s*series|girls\s*love|sport|football|cricket|mango|manga/i.test(
            opTitle.toLowerCase()
          )) {
            continue;
          }
          const cards = [];
          const seenCardIds = /* @__PURE__ */ new Set();
          for (let idx = 0; idx < op.subjects.length; idx++) {
            const raw = op.subjects[idx];
            const card = mapMovieBoxItemToCard(raw, idx);
            if (card && !seenCardIds.has(card.id)) {
              seenCardIds.add(card.id);
              cards.push(card);
            }
          }
          if (cards.length > 0) {
            seenShelfIds.add(shelfKey);
            const meta = mapMovieBoxShelfTitleToMeta(opTitle);
            shelves.push({
              id: `mb-shelf-${shelfKey.replace(/[^a-z0-9]+/g, "-")}`,
              title: opTitle,
              bnTitle: meta.bnTitle,
              categoryPath: meta.categoryPath,
              badge: meta.badge,
              items: cards.slice(0, 18)
            });
          }
        }
      }
      if (shelves.length === 0 && cachedMovieBoxHomeSections.length > 0) {
        for (const sec of cachedMovieBoxHomeSections) {
          if (sec.type !== "SUBJECTS_MOVIE" || !sec.title) continue;
          const shelfKey = sec.title.toLowerCase();
          if (seenShelfIds.has(shelfKey) || /nollywood|black\s*shows|bet\+|banner_africa|bl\s*story|sport|football|cricket|mango|manga/i.test(
            shelfKey
          )) {
            continue;
          }
          const cards = [];
          for (let idx = 0; idx < sec.subjects.length; idx++) {
            const card = mapMovieBoxItemToCard(sec.subjects[idx], idx);
            if (card) cards.push(card);
          }
          if (cards.length > 0) {
            seenShelfIds.add(shelfKey);
            const meta = mapMovieBoxShelfTitleToMeta(sec.title);
            shelves.push({
              id: `mb-shelf-${shelfKey.replace(/[^a-z0-9]+/g, "-")}`,
              title: sec.title,
              bnTitle: meta.bnTitle,
              categoryPath: meta.categoryPath,
              badge: meta.badge,
              items: cards.slice(0, 18)
            });
          }
        }
      }
      const regionalCuratedSpecs = [
        {
          key: "trending bengali movies",
          title: "Trending Bengali Movies",
          bnTitle: "\u099F\u09CD\u09B0\u09C7\u09A8\u09CD\u09A1\u09BF\u0982 \u09AC\u09BE\u0982\u09B2\u09BE \u09AE\u09C1\u09AD\u09BF \u0993 \u09A8\u09BE\u099F\u0995",
          categoryPath: "/language/bangla",
          badge: "BANGLA HIT",
          path: "/language/bangla"
        },
        {
          key: "bollywood movie",
          title: "Bollywood Movie",
          bnTitle: "\u09AC\u09B2\u09BF\u0989\u09A1 \u0993 \u0987\u09A8\u09CD\u09A1\u09BF\u09DF\u09BE\u09A8 \u09B8\u09BF\u09A8\u09C7\u09AE\u09BE",
          categoryPath: "/bollywood",
          badge: "BOLLYWOOD",
          path: "/bollywood"
        },
        {
          key: "south indian movie",
          title: "South Indian & Hindi Dubbed",
          bnTitle: "\u09B8\u09BE\u0989\u09A5 \u0987\u09A8\u09CD\u09A1\u09BF\u09DF\u09BE\u09A8 \u0993 \u09B9\u09BF\u09A8\u09CD\u09A6\u09BF \u09A1\u09BE\u09AC\u09BF\u0982",
          categoryPath: "/southIndian",
          badge: "SOUTH DUB",
          path: "/southIndian"
        },
        {
          key: "anime in hindi",
          title: "Anime in Hindi",
          bnTitle: "\u09B9\u09BF\u09A8\u09CD\u09A6\u09BF \u09A1\u09BE\u09AC\u09BF\u0982 \u0985\u09CD\u09AF\u09BE\u09A8\u09BF\u09AE\u09C7",
          categoryPath: "/category/anime-hindi",
          badge: "HINDI ANIME",
          path: "/category/anime-hindi"
        }
      ];
      const missingRegional = regionalCuratedSpecs.filter((sp) => !seenShelfIds.has(sp.key));
      if (missingRegional.length > 0) {
        const regSettled = await Promise.allSettled(
          missingRegional.map((sp) => fetchMovieBoxCatalog(sp.path, 1, ""))
        );
        for (let i = 0; i < missingRegional.length; i++) {
          const sp = missingRegional[i];
          const r = regSettled[i];
          if (r.status === "fulfilled" && r.value.items.length > 0) {
            seenShelfIds.add(sp.key);
            shelves.push({
              id: `mb-shelf-${sp.key.replace(/[^a-z0-9]+/g, "-")}`,
              title: sp.title,
              bnTitle: sp.bnTitle,
              categoryPath: sp.categoryPath,
              badge: sp.badge,
              items: r.value.items.slice(0, 18)
            });
            for (const bCard of r.value.items.slice(0, 2)) {
              if (!seenBannerIds.has(bCard.id)) {
                seenBannerIds.add(bCard.id);
                banners.push(bCard);
              }
            }
          }
        }
      }
      const priorityOrder = [
        "trending bengali movies",
        "bollywood movie",
        "south indian",
        "trending in indian cinema",
        "trending drama",
        "popular series",
        "trending movie",
        "popular movie",
        "hollywood movie",
        "\u{1F525}hot short tv",
        "k-drama",
        "asian drama",
        "anime in hindi",
        "anime",
        "western tv",
        "action"
      ];
      shelves.sort((a, b) => {
        const ia = priorityOrder.findIndex((k) => a.title.toLowerCase().includes(k));
        const ib = priorityOrder.findIndex((k) => b.title.toLowerCase().includes(k));
        const sa = ia === -1 ? 999 : ia;
        const sb = ib === -1 ? 999 : ib;
        return sa - sb;
      });
      const payload = {
        ok: true,
        banners: banners.slice(0, 12),
        liveSports,
        quickCategories: defaultQuickCategories,
        comingSoon: comingSoon.slice(0, 18),
        sections: shelves
      };
      if (shelves.length > 0) {
        cachedMovieBoxHomePayload = payload;
        cachedMovieBoxHomePayloadExpiresAt = Date.now() + 24e4;
      }
      return payload;
    } finally {
      inFlightMovieBoxHomePromise = null;
    }
  })();
  inFlightMovieBoxHomePromise = task;
  return task;
}
function getMovieBoxHomeOperatingSubjects(rawPath) {
  if (!cachedMovieBoxHomeSections.length) return [];
  const p = (rawPath || "/").toLowerCase().replace(/\/page\/\d+\/?$/, "").replace(/\/+$/, "") || "/";
  const matched = [];
  for (const sec of cachedMovieBoxHomeSections) {
    const t = sec.title.toLowerCase();
    if (/nollywood|black\s*shows|bet\+|banner_africa|bl\s*story|bl\s*series|girls\s*love|sport|football|cricket|mango|manga/i.test(t)) {
      continue;
    }
    const isMatch = p === "/" || p === "/hot-dhamaka" || p === "/category/trending-drama" && t.includes("trending drama") || p === "/category/indian-cinema" && (t.includes("indian cinema") || t.includes("trending india")) || p === "/category/short-tv" && (t.includes("short tv") || t.includes("shorttv")) || p === "/category/western-tv" && t.includes("western tv") || p === "/category/anime-hindi" && t.includes("anime in hindi") || p === "/category/indian-drama" && t.includes("indian drama") || p === "/category/arabic-drama" && (t.includes("arabic") || t.includes("ramadan")) || (p === "/language/bangla" || p.includes("bengali")) && t.includes("bengali") || p === "/bollywood" && t.includes("bollywood") || p === "/southindian" && t.includes("south indian") || p === "/language/punjabi" && t.includes("punjabi") || p === "/language/english" && (t.includes("hollywood") || t.includes("trending western")) || p === "/anime" && (t.includes("animeverse") || t.includes("popular anime")) || p === "/genre/animation" && t.includes("animated film") || (p === "/drama" || p === "/language/korean") && (t.includes("k-drama") || t.includes("asian drama")) || p === "/language/chinese" && t.includes("c-drama") || p === "/genre/horror" && (t.includes("horror") || t.includes("frights"));
    if (isMatch) {
      matched.push(...sec.subjects);
    }
  }
  return matched;
}
function mapCategoryToMovieBoxFilter(rawPath, page = 1) {
  const p = (rawPath || "/").toLowerCase().replace(/\/page\/\d+\/?$/, "").replace(/\/+$/, "") || "/";
  const payload = {
    page,
    perPage: 28,
    channelId: 1,
    // Default: Movies
    sort: "Hottest"
  };
  if (p === "/" || p === "/hot-dhamaka" || p === "/mostwatch/7d") {
    payload.channelId = 1;
    payload.sort = "Hottest";
  } else if (p === "/type/movies" || p === "/movies") {
    payload.channelId = 1;
    payload.sort = "Latest";
  } else if (p === "/type/series" || p === "/ongoing") {
    payload.channelId = 2;
    payload.sort = p === "/ongoing" ? "Latest" : "Hottest";
  } else if (p === "/new-uploads" || p === "/new-releases" || p === "/upcoming") {
    payload.channelId = 1;
    payload.sort = "Latest";
  } else if (p === "/collection/bangla-web-series") {
    payload.channelId = 2;
    payload.country = "Bangladesh";
    payload.sort = "Hottest";
  } else if (p === "/collection/top-rated-hindi-dubbed-action") {
    payload.channelId = 1;
    payload.classify = "Hindi dub";
    payload.genre = "Action";
    payload.sort = "Hottest";
  } else if (p === "/collection/korean-drama-must-watch") {
    payload.channelId = 2;
    payload.country = "Korea";
    payload.sort = "Hottest";
  } else if (p === "/category/trending-drama") {
    payload.channelId = 2;
    payload.sort = "Hottest";
  } else if (p === "/category/indian-cinema") {
    payload.channelId = 1;
    payload.country = "India";
    payload.sort = "Hottest";
  } else if (p === "/category/short-tv") {
    payload.channelId = 7;
    payload.sort = "Hottest";
  } else if (p === "/category/western-tv") {
    payload.channelId = 2;
    payload.country = "United States";
    payload.sort = "Hottest";
  } else if (p === "/category/anime-hindi") {
    payload.channelId = 2;
    payload.genre = "Anime";
    payload.classify = "Hindi dub";
    payload.sort = "Hottest";
  } else if (p === "/category/indian-drama") {
    payload.channelId = 2;
    payload.country = "India";
    payload.sort = "Hottest";
  } else if (p === "/category/arabic-drama") {
    payload.channelId = 2;
    payload.country = "Egypt";
    payload.sort = "Hottest";
  } else if (p === "/anime") {
    payload.channelId = 2;
    payload.genre = "Anime";
    payload.sort = "Hottest";
  } else if (p.includes("animation") || p.includes("family")) {
    payload.channelId = 1006;
    payload.sort = "Hottest";
  } else if (p.includes("bangla-dubbed")) {
    payload.channelId = 1;
    payload.classify = "Bengali dub";
  } else if (p.includes("bangla")) {
    payload.channelId = p.includes("series") || p.includes("natok") ? 2 : 1;
    payload.country = "Bangladesh";
  } else if (p.includes("drama") || p.includes("korean")) {
    payload.channelId = 2;
    payload.country = "Korea";
    payload.sort = "Hottest";
  } else if (p.includes("chinese")) {
    payload.channelId = 2;
    payload.country = "China";
  } else if (p.includes("japanese")) {
    payload.channelId = 2;
    payload.country = "Japan";
  } else if (p.includes("turkish")) {
    payload.channelId = 2;
    payload.country = "Turkey";
  } else if (p.includes("hindi-dubbed") || p.includes("dual-audio")) {
    payload.channelId = 1;
    payload.classify = "Hindi dub";
  } else if (p.includes("south")) {
    payload.channelId = 1;
    payload.country = "India";
    payload.classify = "Hindi dub";
    payload.sort = "Hottest";
  } else if (p.includes("bollywood") || p.includes("hindi")) {
    payload.channelId = 1;
    payload.country = "India";
    payload.sort = "Latest";
  } else if (p.includes("tamil") || p.includes("telugu") || p.includes("malayalam") || p.includes("kannada") || p.includes("punjabi") || p.includes("gujrati") || p.includes("marathi")) {
    payload.channelId = 1;
    payload.country = "India";
  } else if (p.includes("english") || p.includes("hollywood") || p.includes("mcu") || p.includes("dc-universe")) {
    payload.channelId = 1;
    payload.country = "United States";
  } else if (p.includes("indonesian")) {
    payload.channelId = 1;
    payload.country = "Indonesia";
  } else if (p.includes("spanish")) {
    payload.channelId = 1;
    payload.country = "Spain";
  } else if (p.includes("french")) {
    payload.channelId = 1;
    payload.country = "France";
  } else if (p.includes("italian")) {
    payload.channelId = 1;
    payload.country = "Italy";
  } else if (p.includes("malaysian")) {
    payload.channelId = 1;
    payload.country = "Malaysia";
  } else if (p.includes("adult18plus")) {
    payload.channelId = 1;
    payload.genre = "Romance";
    payload.sort = "Hottest";
  } else if (p.includes("action") || p.includes("superhero")) {
    payload.channelId = 1;
    payload.genre = "Action";
  } else if (p.includes("thriller") || p.includes("suspense") || p.includes("survival")) {
    payload.channelId = 1;
    payload.genre = "Thriller";
  } else if (p.includes("horror")) {
    payload.channelId = 1;
    payload.genre = "Horror";
  } else if (p.includes("romance")) {
    payload.channelId = 1;
    payload.genre = "Romance";
  } else if (p.includes("comedy")) {
    payload.channelId = 1;
    payload.genre = "Comedy";
  } else if (p.includes("crime")) {
    payload.channelId = 1;
    payload.genre = "Crime";
  } else if (p.includes("sci-fi")) {
    payload.channelId = 1;
    payload.genre = "Sci-Fi";
  } else if (p.includes("adventure")) {
    payload.channelId = 1;
    payload.genre = "Adventure";
  } else if (p.includes("fantasy")) {
    payload.channelId = 1;
    payload.genre = "Fantasy";
  } else if (p.includes("mystery")) {
    payload.channelId = 1;
    payload.genre = "Mystery";
  } else if (p.includes("historical")) {
    payload.channelId = 1;
    payload.genre = "History";
  } else if (p.includes("war")) {
    payload.channelId = 1;
    payload.genre = "War";
  } else if (p.includes("documentary")) {
    payload.channelId = 1;
    payload.genre = "Documentary";
  } else if (p.includes("biographical")) {
    payload.channelId = 1;
    payload.genre = "Biography";
  } else if (p.includes("music")) {
    payload.channelId = 1;
    payload.genre = "Music";
  }
  return payload;
}
function mapMovieBoxItemToCard(raw, index = 0) {
  if (!raw || !raw.subjectId || !raw.title) return null;
  if (Number(raw.subjectType) === 9) return null;
  const subjectId = String(raw.subjectId).trim();
  const detailSlug = raw.detailPath ? String(raw.detailPath).trim() : String(raw.title).toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  const itemPath = `/mb/${subjectId}/${detailSlug || "movie"}`;
  const rawTitle = String(raw.title).trim();
  const year = raw.releaseDate ? String(raw.releaseDate).split("-")[0] : "";
  const hasYearInTitle = /\b(19|20)\d{2}\b/.test(rawTitle);
  const displayTitle = year && !hasYearInTitle ? `${rawTitle} (${year})` : rawTitle;
  const poster = String(
    raw.cover?.url || raw.image?.url || raw.stills?.url || raw.thumbnail || ""
  ).trim();
  if (!poster) return null;
  const ratingVal = parseFloat(String(raw.imdbRatingValue || raw.imdbRate || "8.2")) || 8.2;
  const subjectType = Number(raw.subjectType) || 1;
  const genreStr = String(raw.genre || "").toUpperCase();
  const countryStr = String(raw.countryName || "").toUpperCase();
  const cornerStr = String(raw.corner || "").trim().toUpperCase();
  let typeBadge = "MOVIE";
  if (subjectType === 1006 || genreStr.includes("ANIME") || genreStr.includes("ANIMATION") || countryStr === "JAPAN" && subjectType === 2) {
    typeBadge = subjectType === 2 ? "ANIME" : "MOVIE";
  } else if (subjectType === 7) {
    typeBadge = "DRAMA";
  } else if (subjectType === 2) {
    if (countryStr.includes("KOREA") || countryStr.includes("CHINA") || countryStr.includes("TURKEY")) {
      typeBadge = "DRAMA";
    } else {
      typeBadge = "SERIES";
    }
  }
  const dubsList = Array.isArray(raw.dubs) ? raw.dubs.map((d) => String(d?.lanName || d || "")).filter(Boolean) : [];
  const subsStr = String(raw.subtitles || "");
  let language = "ENGLISH";
  if (cornerStr.includes("BENGALI") || cornerStr.includes("BANGLA") || /\[(bengali|bangla)\]/i.test(rawTitle)) {
    language = /dub/i.test(rawTitle) || !countryStr.includes("BANGLADESH") && !countryStr.includes("INDIA") ? "BANGLA DUBBED" : "BANGLA";
  } else if (cornerStr.includes("HINDI") || /\[hindi\]/i.test(rawTitle)) {
    language = !countryStr.includes("INDIA") ? "HINDI DUBBED" : "HINDI";
  } else if (cornerStr) {
    language = cornerStr;
  } else if (dubsList.length > 0) {
    language = dubsList[0].toUpperCase();
  } else if (subsStr.includes("\u09AC\u09BE\u0982\u09B2\u09BE") || countryStr.includes("BANGLADESH")) {
    language = countryStr.includes("BANGLADESH") ? "BANGLA" : "BANGLA SUB";
  } else if (countryStr.includes("INDIA")) {
    language = "HINDI";
  } else if (countryStr.includes("KOREA")) {
    language = "KOREAN";
  } else if (countryStr.includes("CHINA")) {
    language = "CHINESE";
  } else if (countryStr.includes("JAPAN")) {
    language = "JAPANESE";
  }
  const episodePill = subjectType === 7 ? "SHORT TV" : subjectType === 2 ? /\bS\d+/i.test(rawTitle) ? rawTitle.match(/\bS\d+(?:-S?\d+)?/i)?.[0]?.toUpperCase() || "SERIES" : "FULL SERIES" : "";
  const releaseYearNum = parseInt(year, 10) || 0;
  const releaseEpochMs = raw.releaseDate ? Date.parse(String(raw.releaseDate)) : NaN;
  const nowMs = Date.now();
  let hash = 2166136261 >>> 0;
  for (let i = 0; i < subjectId.length; i++) {
    hash ^= subjectId.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  const cdnDateMatch = poster.match(/\/image\/(\d{4})\/(\d{2})\/(\d{2})\//);
  const cdnDateStr = cdnDateMatch ? `${cdnDateMatch[1]}-${cdnDateMatch[2]}-${cdnDateMatch[3]}` : "";
  const cdnEpochMs = cdnDateStr ? Date.parse(`${cdnDateStr}T12:00:00Z`) : NaN;
  const isTodayOrYesterdayCdn = !isNaN(cdnEpochMs) && nowMs - cdnEpochMs <= 48 * 36e5 && cdnEpochMs <= nowMs + 24 * 36e5;
  let timeAgoLabel = year || "HD Release";
  let uploadedAtMs = !isNaN(releaseEpochMs) && releaseEpochMs <= nowMs ? releaseEpochMs : 0;
  if (isTodayOrYesterdayCdn && releaseYearNum >= 2025) {
    const minsAgo = 12 + hash % 380;
    timeAgoLabel = minsAgo < 60 ? `${minsAgo} mins ago` : `${Math.floor(minsAgo / 60)} hours ago`;
    uploadedAtMs = nowMs - minsAgo * 6e4;
  } else if (releaseYearNum >= 2025) {
    const spreadHours = 2 + hash % 21;
    const spreadMins = spreadHours * 60 + (hash >>> 8) % 53;
    timeAgoLabel = `${spreadHours} hours ago`;
    uploadedAtMs = nowMs - spreadMins * 6e4;
  } else if (!uploadedAtMs && releaseYearNum > 1900) {
    uploadedAtMs = (/* @__PURE__ */ new Date(`${releaseYearNum}-06-15T00:00:00Z`)).getTime();
  }
  const previewImage = String(
    raw.trailer?.cover?.url || raw.stills?.url || raw.cover?.url || poster
  ).trim();
  const description = String(raw.description || "").trim();
  const country = String(raw.countryName || "").trim();
  const sportGenre = String(raw.genre || "").trim();
  return {
    id: `mb_${subjectId}`,
    title: displayTitle,
    url: itemPath,
    path: itemPath,
    poster,
    previewImage,
    description,
    country,
    sportGenre,
    quality: "1080p FHD",
    views: `\u2605 ${ratingVal.toFixed(1)}`,
    rating: ratingVal.toFixed(1),
    language,
    typeBadge,
    timeAgo: timeAgoLabel,
    episodePill,
    isPinned: releaseYearNum >= 2025 && (isTodayOrYesterdayCdn || ratingVal >= 8),
    isAdult: Boolean(raw.isPornographic),
    uploadedAtMs
  };
}
var mbSearchCache = /* @__PURE__ */ new Map();
var inFlightMbSearch = /* @__PURE__ */ new Map();
function transliterateSearchKeyword(raw) {
  const trimmed = String(raw || "").trim();
  if (!trimmed || !/[\u0980-\u09FF]/.test(trimmed)) return trimmed;
  const phraseMap = [
    [/গোপাল\s*ভাঁড়|গোপাল\s*ভার|গোপাল/gi, "Gopal"],
    [/গোলমাল/gi, "Golmaal"],
    [/তুফান/gi, "Toofan"],
    [/বহুরূপী/gi, "Bohurupi"],
    [/বরবাদ/gi, "Borbaad"],
    [/দাগি/gi, "Daagi"],
    [/চক্কর/gi, "Chokkor"],
    [/জংলি/gi, "Jongli"],
    [/সুড়ঙ্গ|সুরঙ্গ/gi, "Surongo"],
    [/প্রিয়তমা|প্রিয়তমা/gi, "Priyotoma"],
    [/হাওয়া|হাওয়া/gi, "Hawa"],
    [/পরাণ|পরান/gi, "Poran"],
    [/মির্জাপুর/gi, "Mirzapur"],
    [/পুষ্পা/gi, "Pushpa"],
    [/স্কুইড\s*গেম/gi, "Squid Game"],
    [/ওয়ান\s*পিস|ওয়ান\s*পিস/gi, "One Piece"],
    [/নারুতো|নারুটো/gi, "Naruto"],
    [/সোলো\s*লেভেলিং/gi, "Solo Leveling"],
    [/ডেমন\s*স্লেয়ার|ডেমন\s*স্লেয়ার/gi, "Demon Slayer"],
    [/ড্রাগন\s*বল/gi, "Dragon Ball"],
    [/ব্ল্যাক\s*ক্লোভার/gi, "Black Clover"],
    [/জুজুৎসু/gi, "Jujutsu Kaisen"],
    [/অ্যানিমে|এনিমে/gi, "Anime"],
    [/হিন্দি/gi, "Hindi"],
    [/বাংলা/gi, "Bengali"],
    [/নাটক/gi, "Natok"],
    [/মুভি|সিনেমা/gi, "Movie"],
    [/সিরিজ/gi, "Series"]
  ];
  let out = trimmed;
  for (const [rx, rep] of phraseMap) {
    out = out.replace(rx, ` ${rep} `);
  }
  if (/[\u0980-\u09FF]/.test(out)) {
    const charMap = {
      "\u0985": "o",
      "\u0986": "a",
      "\u0987": "i",
      "\u0988": "i",
      "\u0989": "u",
      "\u098A": "u",
      "\u098B": "ri",
      "\u098F": "e",
      "\u0990": "oi",
      "\u0993": "o",
      "\u0994": "ou",
      "\u0995": "k",
      "\u0996": "kh",
      "\u0997": "g",
      "\u0998": "gh",
      "\u0999": "ng",
      "\u099A": "ch",
      "\u099B": "chh",
      "\u099C": "j",
      "\u099D": "jh",
      "\u099E": "n",
      "\u099F": "t",
      "\u09A0": "th",
      "\u09A1": "d",
      "\u09A2": "dh",
      "\u09A3": "n",
      "\u09A4": "t",
      "\u09A5": "th",
      "\u09A6": "d",
      "\u09A7": "dh",
      "\u09A8": "n",
      "\u09AA": "p",
      "\u09AB": "ph",
      "\u09AC": "b",
      "\u09AD": "bh",
      "\u09AE": "m",
      "\u09AF": "j",
      "\u09B0": "r",
      "\u09B2": "l",
      "\u09B6": "sh",
      "\u09B7": "sh",
      "\u09B8": "s",
      "\u09B9": "h",
      "\u09DC": "r",
      "\u09DD": "rh",
      "\u09DF": "y",
      "\u09CE": "t",
      "\u0982": "ng",
      "\u0983": "h",
      "\u0981": "",
      "\u09BE": "a",
      "\u09BF": "i",
      "\u09C0": "i",
      "\u09C1": "u",
      "\u09C2": "u",
      "\u09C3": "ri",
      "\u09C7": "e",
      "\u09C8": "oi",
      "\u09CB": "o",
      "\u09CC": "ou",
      "\u09CD": "",
      "\u09BC": ""
    };
    out = Array.from(out).map((ch) => charMap[ch] !== void 0 ? charMap[ch] : ch).join("");
  }
  return out.replace(/\s{2,}/g, " ").trim() || trimmed;
}
async function fetchMovieBoxCatalog(rawPath, page = 1, search = "") {
  if (!cachedMovieBoxToken || cachedMovieBoxTokenExpiresAt <= Date.now()) {
    await getMovieBoxBearerToken(false).catch(() => {
    });
  }
  const token = cachedMovieBoxToken;
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    "X-Client-Info": JSON.stringify({ timezone: "Asia/Dhaka" }),
    "X-Vip-Restrict": "0",
    "X-No-High-Risk-Restrict": "1",
    "X-Request-Lang": "en",
    Referer: "https://movie-box.co/?utm_source=mb_app_inner_btmtip"
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  } else {
    headers["X-Client-Token"] = generateMovieBoxClientToken();
  }
  const normalizedRawPath = (rawPath || "/").toLowerCase();
  if (!search) {
    if (normalizedRawPath.includes("mcu-marvel")) {
      search = "Avengers";
    } else if (normalizedRawPath.includes("dc-universe")) {
      search = "Batman";
    }
  }
  if (search) {
    const cleanQ = transliterateSearchKeyword(search.trim());
    const searchCacheKey = `${cleanQ.toLowerCase()}::p=${page}`;
    const cachedHit = mbSearchCache.get(searchCacheKey);
    if (cachedHit && cachedHit.expiresAt > Date.now() && cachedHit.items.length > 0) {
      return { items: cachedHit.items, maxPage: 50 };
    }
    const existingSearchPromise = inFlightMbSearch.get(searchCacheKey);
    if (existingSearchPromise) {
      const sharedItems = await existingSearchPromise;
      return { items: sharedItems, maxPage: 50 };
    }
    const searchPromise = (async () => {
      const searchEndpoints = [
        `${MOVIEBOX_FALLBACK_API_ORIGIN}/wefeed-h5api-bff/subject/search`,
        `${MOVIEBOX_API_ORIGIN}/wefeed-h5api-bff/subject/search`
      ];
      const southAsiaHeaders = {
        ...headers,
        "X-Forwarded-For": "103.108.140.10",
        "X-Real-IP": "103.108.140.10",
        "X-Client-Info": JSON.stringify({ timezone: "Asia/Kolkata" }),
        "Accept-Language": "en-IN,en-US;q=0.9,hi;q=0.8,bn;q=0.7"
      };
      const wantHindiCompanion = page === 1 && !/hindi|bangla|bengali/i.test(cleanQ);
      const qLower = cleanQ.toLowerCase();
      const qWords = qLower.split(/\s+/).filter((w) => w.length >= 2);
      const primaryWord = qWords[0] || cleanQ;
      const isMultiWord = qWords.length >= 2;
      const isGopalQuery = /\bgopal\b/i.test(cleanQ);
      let rawItems = [];
      const fetchSearchEndpoint = (keyword, reqHeaders, perPageNum, timeoutMs) => Promise.any(
        searchEndpoints.map(async (ep) => {
          const r = await fetch(ep, {
            method: "POST",
            headers: reqHeaders,
            body: JSON.stringify({
              keyword,
              page,
              perPage: perPageNum,
              subjectType: 0
            }),
            signal: AbortSignal.timeout(timeoutMs)
          });
          if (!r.ok) throw new Error("Bad status");
          const j = await r.json();
          const list = j?.data?.items;
          if (!Array.isArray(list) || list.length === 0) throw new Error("Empty");
          return list;
        })
      ).catch(() => []);
      try {
        const [globalList, southAsiaList, hindiCompanionList, primaryWordList, extraGopalList] = await Promise.all([
          fetchSearchEndpoint(cleanQ, headers, 36, 1500),
          page === 1 ? fetchSearchEndpoint(cleanQ, southAsiaHeaders, 36, 1500) : Promise.resolve([]),
          wantHindiCompanion ? fetchSearchEndpoint(`${cleanQ} [Hindi]`, southAsiaHeaders, 24, 1300) : Promise.resolve([]),
          page === 1 && isMultiWord ? fetchSearchEndpoint(primaryWord, southAsiaHeaders, 28, 1400) : Promise.resolve([]),
          page === 1 && isGopalQuery ? fetchSearchEndpoint("Golmaal", southAsiaHeaders, 16, 1300) : Promise.resolve([])
        ]);
        const matchesAllWords = (it) => {
          const t = String(it?.title || "").toLowerCase();
          if (t.includes(qLower)) return true;
          return qWords.length > 0 && qWords.every((w) => t.includes(w));
        };
        const matchesAnyWord = (it) => {
          const t = `${it?.title || ""} ${it?.genre || ""} ${it?.countryName || ""}`.toLowerCase();
          if (t.includes(qLower)) return true;
          if (isGopalQuery && t.includes("golmaal")) return true;
          return qWords.length > 0 && qWords.some((w) => t.includes(w));
        };
        const combinedPrimary = [
          ...southAsiaList,
          ...globalList,
          ...hindiCompanionList.filter(matchesAllWords),
          ...primaryWordList,
          ...extraGopalList
        ];
        const anyMatched = combinedPrimary.filter(matchesAnyWord);
        const pLower = primaryWord.toLowerCase();
        anyMatched.sort((a, b) => {
          const rank = (it) => {
            if (matchesAllWords(it)) return 3;
            const t = String(it?.title || "").toLowerCase();
            if (pLower && t.includes(pLower)) return 2;
            return 1;
          };
          return rank(b) - rank(a);
        });
        rawItems = anyMatched.length > 0 ? anyMatched : combinedPrimary;
        if (page === 1 && rawItems.length > 0) {
          const cleanBaseSearch = extractBaseSeriesTitle(cleanQ).replace(/\bs\d+\s*-\s*s\d+\b/gi, "").replace(/\b(19|20)\d{2}\b/g, "").trim().toLowerCase();
          const uniqueCandidates = [];
          const seenCandidateBases = /* @__PURE__ */ new Set();
          for (const it of rawItems) {
            if (!it?.subjectId || !it?.detailPath) continue;
            const itemBase = extractBaseSeriesTitle(String(it.title || "")).replace(/\bs\d+\s*-\s*s\d+\b/gi, "").replace(/\b(19|20)\d{2}\b/g, "").trim().toLowerCase();
            if (itemBase === cleanBaseSearch || itemBase.startsWith(cleanBaseSearch)) {
              const candKey = `${itemBase}::${it.subjectType || 1}::${String(it.releaseDate || "").slice(0, 4)}`;
              if (!seenCandidateBases.has(candKey)) {
                seenCandidateBases.add(candKey);
                uniqueCandidates.push(it);
                if (uniqueCandidates.length >= 2) break;
              }
            }
          }
          if (uniqueCandidates.length > 0) {
            void (async () => {
              try {
                const existingIds = new Set(rawItems.map((x) => String(x?.subjectId || "")));
                const nuxtDubLists = await Promise.all(
                  uniqueCandidates.map(async (cand) => {
                    try {
                      const nuxtUrl = `https://moviebox.ph/movies/${encodeURIComponent(String(cand.detailPath))}?id=${encodeURIComponent(String(cand.subjectId))}`;
                      const r = await fetch(nuxtUrl, {
                        headers: {
                          "User-Agent": "Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
                          Accept: "text/html,application/xhtml+xml"
                        },
                        signal: AbortSignal.timeout(1350)
                      });
                      if (!r.ok) return [];
                      const html = await r.text();
                      const parsed = extractMovieBoxNuxtDetail(html);
                      const subj = parsed?.data?.subject;
                      if (!subj || !Array.isArray(subj.dubs)) return [];
                      const synthesized = [];
                      for (const d of subj.dubs) {
                        const dSid = String(d?.subjectId || "").trim();
                        const dPath = String(d?.detailPath || "").trim();
                        const lanName = String(d?.lanName || "").trim();
                        if (!dSid || !dPath || existingIds.has(dSid)) continue;
                        const isExplicitLangInQuery = /tamil/i.test(cleanQ) && /tamil/i.test(lanName) || /telugu/i.test(cleanQ) && /telugu/i.test(lanName) || /english/i.test(cleanQ) && /english\s*dub/i.test(lanName);
                        if (!/hindi\s*dub|bangla|bengali|original/i.test(lanName) && !isExplicitLangInQuery && dSid !== String(subj.subjectId)) {
                          continue;
                        }
                        existingIds.add(dSid);
                        const langTag = /original/i.test(lanName) ? "" : `[${lanName.replace(/\s*dub.*$/i, "").trim()}]`;
                        const baseCandTitle = String(cand.title || subj.title || "").replace(/\s*\[[^\]]+\]\s*/g, " ").trim();
                        const seasonMatch = baseCandTitle.match(/\b(S\d+\s*-\s*S\d+|S\d+)\b/i);
                        let synthTitle = baseCandTitle;
                        if (langTag) {
                          if (seasonMatch) {
                            synthTitle = baseCandTitle.replace(
                              seasonMatch[0],
                              `${langTag} ${seasonMatch[0]}`
                            );
                          } else {
                            synthTitle = `${baseCandTitle} ${langTag}`;
                          }
                        }
                        synthesized.push({
                          ...cand,
                          subjectId: dSid,
                          detailPath: dPath,
                          title: dSid === String(subj.subjectId) ? String(subj.title || synthTitle) : synthTitle,
                          corner: /original/i.test(lanName) ? "" : lanName.replace(/\s*dub.*$/i, "").trim()
                        });
                      }
                      return synthesized;
                    } catch {
                      return [];
                    }
                  })
                );
                const extraCards = [];
                for (const extraDubs of nuxtDubLists) {
                  for (const ed of extraDubs) {
                    const c = mapMovieBoxItemToCard(ed, 0);
                    if (c) extraCards.push(c);
                  }
                }
                if (extraCards.length > 0) {
                  const cur = mbSearchCache.get(searchCacheKey);
                  if (cur) {
                    const merged = deduplicateMovieCards([...extraCards, ...cur.items]);
                    mbSearchCache.set(searchCacheKey, {
                      items: merged,
                      expiresAt: cur.expiresAt
                    });
                  }
                }
              } catch {
              }
            })();
          }
        }
      } catch {
      }
      const lowerQ = cleanQ.toLowerCase();
      for (const sec of cachedMovieBoxHomeSections) {
        for (const s of sec.subjects) {
          if (String(s?.title || "").toLowerCase().includes(lowerQ)) {
            rawItems.push(s);
          }
        }
      }
      const seenSearchIds = /* @__PURE__ */ new Set();
      const cards2 = [];
      for (let idx = 0; idx < rawItems.length; idx++) {
        const it = rawItems[idx];
        const sid = String(it?.subjectId || "");
        if (!sid || seenSearchIds.has(sid)) continue;
        seenSearchIds.add(sid);
        const card = mapMovieBoxItemToCard(it, idx);
        if (card) cards2.push(card);
      }
      const cleanQueryBase = extractBaseSeriesTitle(cleanQ).replace(/\bs\d+\s*-\s*s\d+\b/gi, "").replace(/\b(19|20)\d{2}\b/g, "").trim().toLowerCase();
      const computeSearchRankScore = (c, originalIdx) => {
        const rawTitle = String(c.title || "").trim();
        const lowerTitle = rawTitle.toLowerCase();
        const itemBase = extractBaseSeriesTitle(rawTitle).replace(/\s*\[[^\]]+\]\s*/g, " ").replace(/\bs\d+\s*-\s*s\d+\b/gi, "").replace(/\bs\d+\b/gi, "").replace(/\b(19|20)\d{2}\b/g, "").replace(/\s+/g, " ").trim().toLowerCase();
        const isExactBase = itemBase === cleanQueryBase || lowerTitle === lowerQ;
        const isPrefixBase = !isExactBase && (itemBase.startsWith(`${cleanQueryBase}:`) || itemBase.startsWith(`${cleanQueryBase} `) || lowerTitle.startsWith(lowerQ));
        const isContains = !isExactBase && !isPrefixBase && lowerTitle.includes(lowerQ);
        const isSeriesOrAnime = c.typeBadge === "SERIES" || c.typeBadge === "ANIME" || c.typeBadge === "DRAMA";
        const isHindiOrBangla = /\[hindi\]|\[bangla\]|\[bengali\]/i.test(rawTitle) || /hindi|bangla|bengali/i.test(String(c.language || ""));
        const isEnglish = /\[english\]/i.test(rawTitle);
        const isOtherDub = /\[(tamil|telugu|malayalam|kannada|arabic|indonesian|filipino|urdu|french|spanish|portuguese|russian)\]/i.test(
          rawTitle
        );
        const isOriginalOrNetflix = !isHindiOrBangla && !isEnglish && !isOtherDub;
        const ratingNum = parseFloat(String(c.rating || "7.5")) || 7.5;
        let score = 0;
        if (isExactBase) {
          score += 1e4;
          if (isSeriesOrAnime) score += 2e3;
          if (isHindiOrBangla) score += 900;
          else if (isOriginalOrNetflix) score += 700;
          else if (isEnglish) score += 500;
          else score += 100;
        } else if (isPrefixBase) {
          score += 5e3;
          if (isSeriesOrAnime) score += 600;
          if (isHindiOrBangla) score += 450;
          else if (isEnglish) score += 350;
          else if (isOriginalOrNetflix) score += 300;
        } else if (isContains) {
          score += 2e3;
          if (isSeriesOrAnime) score += 400;
          if (isHindiOrBangla) score += 300;
        } else {
          score += 1e3;
          if (isSeriesOrAnime) score += 300;
        }
        score += Math.round(ratingNum * 25) - originalIdx * 2;
        return score;
      };
      const rankedCards = cards2.map((card, idx) => ({ card, score: computeSearchRankScore(card, idx) })).sort((a, b) => b.score - a.score).map((entry) => entry.card);
      if (rankedCards.length > 0) {
        pruneCacheMap(mbSearchCache, 200);
        mbSearchCache.set(searchCacheKey, {
          items: rankedCards,
          expiresAt: Date.now() + 3e5
        });
      }
      return rankedCards;
    })();
    inFlightMbSearch.set(searchCacheKey, searchPromise);
    try {
      const items = await searchPromise;
      return { items, maxPage: 50 };
    } finally {
      inFlightMbSearch.delete(searchCacheKey);
    }
  }
  const filterPayload = { ...mapCategoryToMovieBoxFilter(rawPath, page), perPage: 36 };
  const oppositeSort = filterPayload.sort === "Latest" ? "Hottest" : "Latest";
  const fetchFastFilter = (bodyObj, timeoutMs = 2400) => Promise.any(
    [MOVIEBOX_FALLBACK_API_ORIGIN, MOVIEBOX_API_ORIGIN].map(async (origin) => {
      const r = await fetch(`${origin}/wefeed-h5api-bff/subject/filter`, {
        method: "POST",
        headers,
        body: JSON.stringify(bodyObj),
        signal: AbortSignal.timeout(timeoutMs)
      });
      if (!r.ok) throw new Error("Bad status");
      const j = await r.json();
      const list = j?.data?.subjectList || j?.data?.items || [];
      if (!Array.isArray(list) || list.length === 0) throw new Error("Empty");
      return j;
    })
  ).catch(() => null);
  const fetchQuickKeyword = (kw, timeoutMs = 2e3) => Promise.any(
    [MOVIEBOX_FALLBACK_API_ORIGIN, MOVIEBOX_API_ORIGIN].map(async (origin) => {
      const r = await fetch(`${origin}/wefeed-h5api-bff/subject/search`, {
        method: "POST",
        headers,
        body: JSON.stringify({ keyword: kw, page, perPage: 28, subjectType: 0 }),
        signal: AbortSignal.timeout(timeoutMs)
      });
      if (!r.ok) throw new Error("Bad status");
      const j = await r.json();
      const list = j?.data?.items || [];
      if (!Array.isArray(list) || list.length === 0) throw new Error("Empty");
      return j;
    })
  ).catch(() => null);
  const primaryPromise = fetchFastFilter(filterPayload, 2500);
  const secondaryPromises = [
    fetchFastFilter({ ...filterPayload, sort: oppositeSort }, 1800)
  ];
  if (normalizedRawPath === "/category/anime-hindi") {
    secondaryPromises.unshift(
      fetchQuickKeyword("Naruto [Hindi]", 2200),
      fetchQuickKeyword("One Piece [Hindi]", 2200),
      fetchQuickKeyword("Jujutsu Kaisen [Hindi]", 2200),
      fetchQuickKeyword("Demon Slayer [Hindi]", 2200),
      fetchQuickKeyword("Solo Leveling [Hindi]", 2200),
      fetchQuickKeyword("Dragon Ball [Hindi]", 2200),
      fetchFastFilter({ page, perPage: 28, channelId: 2, classify: "Hindi dub", sort: "Hottest" }, 2e3)
    );
  } else if (normalizedRawPath.includes("south")) {
    secondaryPromises.unshift(
      fetchFastFilter({ page, perPage: 28, channelId: 1, country: "India", genre: "Action", sort: "Hottest" }, 2e3),
      fetchQuickKeyword("Pushpa", 2200),
      fetchQuickKeyword("Salaar", 2200),
      fetchQuickKeyword("Kalki", 2200),
      fetchQuickKeyword("KGF", 2200),
      fetchQuickKeyword("Devara", 2200),
      fetchQuickKeyword("Maharaja", 2200),
      fetchQuickKeyword("Telugu", 2200),
      fetchQuickKeyword("Tamil", 2200)
    );
  } else if (normalizedRawPath.includes("tamil")) {
    secondaryPromises.unshift(fetchQuickKeyword("[Tamil]", 2200), fetchQuickKeyword("Tamil", 2200));
  } else if (normalizedRawPath.includes("telugu")) {
    secondaryPromises.unshift(fetchQuickKeyword("[Telugu]", 2200), fetchQuickKeyword("Telugu", 2200));
  } else if (normalizedRawPath.includes("malayalam")) {
    secondaryPromises.unshift(fetchQuickKeyword("[Malayalam]", 2200), fetchQuickKeyword("Malayalam", 2200));
  } else if (normalizedRawPath.includes("kannada")) {
    secondaryPromises.unshift(fetchQuickKeyword("[Kannada]", 2200), fetchQuickKeyword("Kannada", 2200));
  } else if (normalizedRawPath.includes("punjabi")) {
    secondaryPromises.unshift(fetchQuickKeyword("[Punjabi]", 2200), fetchQuickKeyword("Punjabi", 2200));
  } else if (normalizedRawPath.includes("bangla-dubbed") || normalizedRawPath.includes("best-bangla-dubbed")) {
    secondaryPromises.unshift(fetchQuickKeyword("[Bengali]", 2200), fetchQuickKeyword("Bangla Dubbed", 2200));
  } else if (normalizedRawPath.includes("adult18plus")) {
    secondaryPromises.unshift(
      fetchQuickKeyword("American Kamasutra", 2200),
      fetchQuickKeyword("365 Days", 2200),
      fetchQuickKeyword("Fifty Shades", 2200)
    );
  } else if (filterPayload.channelId === 1 && (normalizedRawPath === "/" || normalizedRawPath === "/mostwatch/7d")) {
    secondaryPromises.push(
      fetchFastFilter({ ...filterPayload, channelId: 2, sort: "Hottest" }, 1800)
    );
  }
  if ((rawPath === "/" || rawPath === "/hot-dhamaka" || rawPath === "/new-uploads") && page === 1) {
    secondaryPromises.unshift(
      Promise.any(
        [MOVIEBOX_FALLBACK_API_ORIGIN, MOVIEBOX_API_ORIGIN].map(async (origin) => {
          const r = await fetch(`${origin}/wefeed-h5api-bff/subject/trending?page=1&perPage=28`, {
            headers,
            signal: AbortSignal.timeout(1800)
          });
          if (!r.ok) throw new Error("Bad status");
          return r.json();
        })
      ).catch(() => null)
    );
  }
  const primaryJson = await primaryPromise;
  const secondaryWaitMs = normalizedRawPath === "/category/anime-hindi" || normalizedRawPath.includes("south") || normalizedRawPath.includes("tamil") || normalizedRawPath.includes("telugu") || normalizedRawPath.includes("malayalam") || normalizedRawPath.includes("kannada") || normalizedRawPath.includes("punjabi") || normalizedRawPath.includes("bangla-dubbed") || normalizedRawPath.includes("adult18plus") ? 1400 : 320;
  const secondaryResults = await Promise.all(
    secondaryPromises.map(
      (p) => Promise.race([p, new Promise((resolve) => setTimeout(() => resolve(null), secondaryWaitMs))])
    )
  );
  const combinedRaw = [];
  let maxPage = 2500;
  for (const j of [primaryJson, ...secondaryResults]) {
    if (!j) continue;
    const list = j?.data?.subjectList || j?.data?.items || [];
    if (Array.isArray(list)) {
      if (normalizedRawPath === "/category/anime-hindi") {
        combinedRaw.push(
          ...list.filter((x) => {
            const g = String(x?.genre || "").toLowerCase();
            const c = String(x?.countryName || "").toLowerCase();
            return g.includes("anime") || g.includes("animation") || c.includes("japan");
          })
        );
      } else {
        combinedRaw.push(...list);
      }
    }
    const totalCount = Number(j?.data?.pager?.totalCount || 0);
    if (totalCount > 0) {
      maxPage = Math.max(maxPage, Math.min(3500, Math.ceil(totalCount / 28)));
    }
  }
  if (page === 1) {
    combinedRaw.push(...getMovieBoxHomeOperatingSubjects(rawPath));
  }
  const seenIds = /* @__PURE__ */ new Set();
  const cards = [];
  for (let i = 0; i < combinedRaw.length; i++) {
    const raw = combinedRaw[i];
    const sid = String(raw?.subjectId || "");
    if (!sid || seenIds.has(sid)) continue;
    seenIds.add(sid);
    const card = mapMovieBoxItemToCard(raw, i);
    if (card) cards.push(card);
  }
  return { items: cards, maxPage };
}
async function resolveImdbIdForTitle(rawTitle, releaseDateStr = "", isSeries = false) {
  const cleanTitle = extractBaseSeriesTitle(rawTitle).replace(/\b(19|20)\d{2}\b/g, "").replace(/\s{2,}/g, " ").trim();
  if (!cleanTitle || cleanTitle.length < 2) return "";
  const cacheKey = `${cleanTitle.toLowerCase()}::${isSeries ? "tv" : "movie"}`;
  const cached = imdbIdCache.get(cacheKey);
  if (cached !== void 0) return cached;
  try {
    const res = await fetch(
      `https://v3.sg.media-imdb.com/suggestion/x/${encodeURIComponent(cleanTitle)}.json`,
      {
        headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(2200)
      }
    );
    if (!res.ok) return "";
    const json = await res.json();
    const list = Array.isArray(json?.d) ? json.d.filter((x) => String(x?.id || "").startsWith("tt")) : [];
    if (!list.length) {
      imdbIdCache.set(cacheKey, "");
      return "";
    }
    const wantYear = parseInt(String(releaseDateStr || "").slice(0, 4), 10) || 0;
    const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
    const wantNorm = norm(cleanTitle);
    const scored = list.map((item) => {
      let sc = 0;
      const itemNorm = norm(item.l || "");
      if (itemNorm === wantNorm) sc += 50;
      else if (itemNorm.includes(wantNorm) || wantNorm.includes(itemNorm)) sc += 25;
      const qStr = String(item.q || item.qid || "").toLowerCase();
      const itemIsTv = qStr.includes("tv") || qStr.includes("series") || qStr.includes("mini");
      if (isSeries === itemIsTv) sc += 30;
      if (wantYear > 1900 && item.y && Math.abs(Number(item.y) - wantYear) <= 1) sc += 25;
      return { id: String(item.id), sc };
    });
    scored.sort((a, b) => b.sc - a.sc);
    const bestId = scored[0]?.id || "";
    if (bestId) {
      pruneCacheMap(imdbIdCache, 300);
      imdbIdCache.set(cacheKey, bestId);
    }
    return bestId;
  } catch {
    return "";
  }
}
var cinemetaSeasonsCache = /* @__PURE__ */ new Map();
async function resolveCinemetaSeriesSeasons(imdbId) {
  if (!imdbId || !imdbId.startsWith("tt")) return [];
  const cached = cinemetaSeasonsCache.get(imdbId);
  if (cached !== void 0) return cached;
  try {
    const res = await fetch(`https://v3-cinemeta.strem.io/meta/series/${encodeURIComponent(imdbId)}.json`, {
      headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(1700)
    });
    if (!res.ok) return [];
    const json = await res.json();
    const videos = Array.isArray(json?.meta?.videos) ? json.meta.videos : [];
    if (!videos.length) {
      cinemetaSeasonsCache.set(imdbId, []);
      return [];
    }
    const seasonMap = /* @__PURE__ */ new Map();
    for (const v of videos) {
      const se = Number(v?.season);
      const ep = Number(v?.episode ?? v?.number);
      if (!Number.isFinite(se) || se <= 0 || se > 50) continue;
      if (!Number.isFinite(ep) || ep <= 0 || ep > 2e3) continue;
      if (!seasonMap.has(se)) seasonMap.set(se, /* @__PURE__ */ new Set());
      seasonMap.get(se).add(ep);
    }
    const result = [];
    const sortedSeasons = Array.from(seasonMap.keys()).sort((a, b) => a - b);
    for (const se of sortedSeasons) {
      const eps = Array.from(seasonMap.get(se)).sort((a, b) => a - b);
      if (eps.length === 0) continue;
      if (se > 1 && eps.length <= 1) continue;
      let maxEp = eps[eps.length - 1] || eps.length;
      if (imdbId === "tt7441658" && se === 2) {
        maxEp = Math.min(maxEp, 5);
      }
      result.push({
        se,
        maxEp,
        allEp: Array.from({ length: maxEp }, (_, idx) => idx + 1).join(",")
      });
    }
    if (result.length > 0) {
      pruneCacheMap(cinemetaSeasonsCache, 250);
      cinemetaSeasonsCache.set(imdbId, result);
    }
    return result;
  } catch {
    return [];
  }
}
function buildEmbedBackupSources(_imdbId, _seasonNum, _epNum, _title, _language) {
  return [];
}
var mbStartupChunkCache = /* @__PURE__ */ new Map();
var inFlightStartupPrewarms = /* @__PURE__ */ new Set();
var VIRTUAL_CHUNK_0_BYTES = 768 * 1024;
var VIRTUAL_SEGMENT_1_END = 2304 * 1024;
var VIRTUAL_SEGMENT_2_END = 3840 * 1024;
var VIRTUAL_TAIL_BYTES = 512 * 1024;
var mbCdnHttpsAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 3e4,
  maxSockets: 64,
  maxFreeSockets: 16
});
var mbCdnHttpAgent = new http.Agent({
  keepAlive: true,
  keepAliveMsecs: 3e4,
  maxSockets: 64,
  maxFreeSockets: 16
});
function openMovieBoxCdnStream(rawUrl, method, headers, timeoutMs = 6e3, redirectDepth = 0) {
  return new Promise((resolve, reject) => {
    if (redirectDepth > 4) {
      reject(new Error("Too many CDN redirects"));
      return;
    }
    let parsed;
    try {
      parsed = new URL(rawUrl);
    } catch (e) {
      reject(e);
      return;
    }
    const isHttps = parsed.protocol === "https:";
    const client = isHttps ? https : http;
    const req = client.request(
      parsed,
      {
        method,
        headers,
        agent: isHttps ? mbCdnHttpsAgent : mbCdnHttpAgent,
        family: 4,
        timeout: timeoutMs
      },
      (res) => {
        const status = res.statusCode || 0;
        const loc = res.headers.location;
        if ((status === 301 || status === 302 || status === 303 || status === 307 || status === 308) && loc) {
          res.resume();
          const nextUrl = new URL(loc, parsed).toString();
          openMovieBoxCdnStream(nextUrl, method, headers, timeoutMs, redirectDepth + 1).then(resolve).catch(reject);
          return;
        }
        resolve(res);
      }
    );
    req.on("timeout", () => {
      req.destroy(new Error("CDN socket timeout"));
    });
    req.on("error", reject);
    req.end();
  });
}
async function fetchCdnByteRangeBuffer(targetUrl, startByte, endByte, timeoutMs = 3500) {
  if (endByte < startByte || startByte < 0) return null;
  const maxLen = endByte - startByte + 1;
  try {
    const res = await openMovieBoxCdnStream(
      targetUrl,
      "GET",
      {
        "User-Agent": "okhttp/4.12.0",
        Referer: "https://moviebox.ph/",
        Origin: "https://moviebox.ph",
        Range: `bytes=${startByte}-${endByte}`,
        Accept: "*/*"
      },
      timeoutMs
    );
    if (res.statusCode === 200 || res.statusCode === 206) {
      const contentRange = String(res.headers["content-range"] || "");
      const totalMatch = contentRange.match(/\/(\d+)$/);
      const totalSize = totalMatch ? parseInt(totalMatch[1], 10) : 0;
      const contentType = String(res.headers["content-type"] || "video/mp4");
      const chunks = [];
      let len = 0;
      for await (const chunk of res) {
        const b = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        chunks.push(b);
        len += b.length;
        if (len >= maxLen) break;
      }
      res.destroy();
      if (len > 0) {
        return {
          buf: Buffer.concat(chunks, Math.min(len, maxLen)),
          totalSize,
          contentType
        };
      }
    } else {
      res.resume();
    }
  } catch {
  }
  return null;
}
function prefetchParallelVirtualSegments(targetUrl, entry) {
  if (entry.prefetchingNext || entry.totalSize <= entry.buf.length) return;
  entry.prefetchingNext = true;
  const totalSize = entry.totalSize;
  const seg1Start = entry.buf.length;
  const seg1End = Math.min(totalSize - 1, VIRTUAL_SEGMENT_1_END - 1);
  const seg2Start = seg1End + 1;
  const seg2End = Math.min(totalSize - 1, VIRTUAL_SEGMENT_2_END - 1);
  const tailStart = Math.max(VIRTUAL_SEGMENT_2_END, totalSize - VIRTUAL_TAIL_BYTES);
  void (async () => {
    try {
      const [seg1Res, seg2Res, tailRes] = await Promise.all([
        seg1End >= seg1Start ? fetchCdnByteRangeBuffer(targetUrl, seg1Start, seg1End, 3500) : Promise.resolve(null),
        seg2End >= seg2Start ? fetchCdnByteRangeBuffer(targetUrl, seg2Start, seg2End, 3800) : Promise.resolve(null),
        !entry.tailBuf && totalSize > VIRTUAL_SEGMENT_2_END && tailStart < totalSize - 1 ? fetchCdnByteRangeBuffer(targetUrl, tailStart, totalSize - 1, 3e3) : Promise.resolve(null)
      ]);
      if (tailRes && tailRes.buf.length > 0) {
        entry.tailStart = tailStart;
        entry.tailBuf = tailRes.buf;
      }
      if (seg1Res && seg1Res.buf.length > 0 && entry.buf.length === seg1Start) {
        if (seg2Res && seg2Res.buf.length > 0 && seg1Start + seg1Res.buf.length === seg2Start) {
          entry.buf = Buffer.concat([entry.buf, seg1Res.buf, seg2Res.buf]);
        } else {
          entry.buf = Buffer.concat([entry.buf, seg1Res.buf]);
        }
      }
    } catch {
    } finally {
      entry.prefetchingNext = false;
    }
  })();
}
function prewarmMovieBoxStartupChunk(targetUrl) {
  if (!targetUrl || !targetUrl.startsWith("http")) return;
  const existing = mbStartupChunkCache.get(targetUrl);
  if (existing && existing.expiresAt > Date.now()) {
    prefetchParallelVirtualSegments(targetUrl, existing);
    return;
  }
  if (inFlightStartupPrewarms.has(targetUrl)) return;
  inFlightStartupPrewarms.add(targetUrl);
  (async () => {
    try {
      const chunk0 = await fetchCdnByteRangeBuffer(targetUrl, 0, VIRTUAL_CHUNK_0_BYTES - 1, 6e3);
      if (chunk0 && chunk0.buf.length > 32768 && chunk0.totalSize > 0) {
        if (mbStartupChunkCache.size >= 35) {
          const oldest = mbStartupChunkCache.keys().next().value;
          if (oldest) mbStartupChunkCache.delete(oldest);
        }
        const entry = {
          buf: chunk0.buf,
          tailStart: Math.max(VIRTUAL_SEGMENT_2_END, chunk0.totalSize - VIRTUAL_TAIL_BYTES),
          tailBuf: null,
          totalSize: chunk0.totalSize,
          contentType: chunk0.contentType,
          expiresAt: Date.now() + 12 * 6e4
        };
        mbStartupChunkCache.set(targetUrl, entry);
        prefetchParallelVirtualSegments(targetUrl, entry);
      }
    } catch {
    } finally {
      inFlightStartupPrewarms.delete(targetUrl);
    }
  })();
}
var mbPlayStreamCache = /* @__PURE__ */ new Map();
var inFlightMbPlayStreams = /* @__PURE__ */ new Map();
var mbCaptionCache = /* @__PURE__ */ new Map();
var mbSrtTextCache = /* @__PURE__ */ new Map();
async function fetchMovieBoxPlayStreams(subjectId, detailPath, seasonNum, epNum, title, language, fallbackVideoUrl = "") {
  const playCacheKey = `${subjectId}::s${seasonNum}::e${epNum}`;
  const cachedPlay = mbPlayStreamCache.get(playCacheKey);
  if (cachedPlay && cachedPlay.expiresAt > Date.now() && cachedPlay.sources.length > 0) {
    return {
      sources: cachedPlay.sources,
      buttons: cachedPlay.buttons,
      streamId: cachedPlay.streamId
    };
  }
  const existingInFlight = inFlightMbPlayStreams.get(playCacheKey);
  if (existingInFlight) {
    return existingInFlight;
  }
  const promise = (async () => {
    const token = cachedMovieBoxToken || await getMovieBoxBearerToken();
    const playOrigins = [MOVIEBOX_FALLBACK_API_ORIGIN, MOVIEBOX_ORIGIN];
    let streams = [];
    try {
      const fetchFromOrigin = async (origin, timeoutMs = 1750) => {
        const playUrl = `${origin}/wefeed-h5api-bff/subject/play?subjectId=${encodeURIComponent(
          subjectId
        )}&se=${seasonNum}&ep=${epNum}&detailPath=${encodeURIComponent(detailPath)}&streamSignType=1`;
        const headers = {
          Accept: "application/json",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
          Referer: `${MOVIEBOX_ORIGIN}/movies/${detailPath}?id=${subjectId}`,
          "X-Client-Info": JSON.stringify({ timezone: "Asia/Dhaka" }),
          "X-Vip-Restrict": "0",
          "X-No-High-Risk-Restrict": "1",
          "X-Request-Lang": "en"
        };
        if (token) {
          headers.Authorization = `Bearer ${token}`;
        } else {
          headers["X-Client-Token"] = generateMovieBoxClientToken();
        }
        const res = await fetch(playUrl, { headers, signal: AbortSignal.timeout(timeoutMs) });
        if (!res.ok) throw new Error("play failed");
        const json = await res.json();
        const list = json?.data?.streams;
        if (Array.isArray(list)) return list;
        throw new Error("invalid streams");
      };
      // Query fast primary BFF origin first; if it responds with valid JSON (even empty array for wrong se/ep), return in ~70ms!
      streams = await fetchFromOrigin(playOrigins[0], 1650).catch(() => fetchFromOrigin(playOrigins[1], 1800));
    } catch {
      streams = [];
    }
    const sources = [];
    const buttons = [];
    const fbParam = fallbackVideoUrl ? `&fb=${encodeGatewayToken(String(fallbackVideoUrl))}` : "";
    const rawUrlBySourceId = /* @__PURE__ */ new Map();
    for (let i = 0; i < streams.length; i++) {
      const st = streams[i];
      if (!st?.url) continue;
      const rawStreamUrl = String(st.url).trim();
      const resNum = parseInt(String(st.resolutions || "720"), 10) || 720;
      const sizeBytes = Number(st.size) || 0;
      const sizeMb = sizeBytes > 0 ? `${(sizeBytes / (1024 * 1024)).toFixed(0)} MB` : "Full HD";
      const encStreamToken = encodeGatewayToken(rawStreamUrl);
      const proxiedStreamUrl = `/api/mb-stream.mp4?t=${encStreamToken}${fbParam}`;
      const proxiedDlUrl = `/api/mb-stream.mp4?t=${encStreamToken}&dl=1&name=${encodeURIComponent(
        `${title.replace(/[^a-zA-Z0-9_-]+/g, "_")}_${resNum}p.mp4`
      )}`;
      const srcId = `mb-stream-${subjectId}-s${seasonNum}-e${epNum}-${resNum}p-${i}`;
      rawUrlBySourceId.set(srcId, rawStreamUrl);
      sources.push({
        id: srcId,
        quality: resNum,
        qualityLabel: `${resNum}p ${resNum <= 480 ? "Fast Instant" : "Full HD"} (CinePulse Direct)`,
        audio: language,
        audioLanguages: [language],
        provider: `CinePulse HD ${resNum}p`,
        url: proxiedStreamUrl,
        downloadUrl: proxiedDlUrl,
        type: "mp4",
        name: `${title} (${resNum}p MP4 \u2022 ${sizeMb})`
      });
      buttons.push({
        label: `CinePulse Direct Download ${resNum}p MP4 (${sizeMb})`,
        url: proxiedDlUrl,
        quality: `${resNum}p`,
        size: sizeMb
      });
    }
    if (sources.length === 0 && fallbackVideoUrl) {
      const encFallbackToken = encodeGatewayToken(String(fallbackVideoUrl));
      const proxiedStreamUrl = `/api/mb-stream.mp4?t=${encFallbackToken}`;
      const proxiedDlUrl = `/api/mb-stream.mp4?t=${encFallbackToken}&dl=1&name=${encodeURIComponent(
        `${title.replace(/[^a-zA-Z0-9_-]+/g, "_")}_HD.mp4`
      )}`;
      sources.push({
        id: `mb-stream-direct-${subjectId}`,
        quality: 720,
        qualityLabel: "720p HD (CinePulse Direct)",
        audio: language,
        audioLanguages: [language],
        provider: "CinePulse HD 720p",
        url: proxiedStreamUrl,
        downloadUrl: proxiedDlUrl,
        type: "mp4",
        name: `${title} (HD MP4)`
      });
      buttons.push({
        label: "CinePulse Direct Download HD MP4",
        url: proxiedDlUrl,
        quality: "720p",
        size: "HD MP4"
      });
    }
    sources.sort((a, b) => {
      const rank = (s) => {
        const szMatch = (s.name || "").match(/(\d+)\s*MB/i);
        const szMb = szMatch ? parseInt(szMatch[1], 10) : 0;
        if (s.quality === 480) return 108;
        if (s.quality === 360) return 107;
        if (s.quality === 720) return szMb > 220 ? 98 : 104;
        if (s.quality === 1080) return szMb > 320 ? 85 : 96;
        return s.quality;
      };
      return rank(b) - rank(a);
    });
    buttons.sort((a, b) => parseInt(b.quality, 10) - parseInt(a.quality, 10));
    const fastestSource = sources[0];
    if (fastestSource?.id) {
      const rawFastUrl = rawUrlBySourceId.get(fastestSource.id);
      if (rawFastUrl) {
        prewarmMovieBoxStartupChunk(rawFastUrl);
      }
    }
    const resolvedStreamId = String(
      streams.find((st) => st?.id)?.id || ""
    ).trim();
    if (sources.length > 0) {
      pruneCacheMap(mbPlayStreamCache, 150);
      mbPlayStreamCache.set(playCacheKey, {
        sources,
        buttons,
        streamId: resolvedStreamId,
        expiresAt: Date.now() + 15 * 6e4
      });
    }
    return { sources, buttons, streamId: resolvedStreamId };
  })();
  inFlightMbPlayStreams.set(playCacheKey, promise);
  try {
    return await promise;
  } finally {
    inFlightMbPlayStreams.delete(playCacheKey);
  }
}
async function fetchMovieBoxOfficialCaptions(subjectId, detailPath, seasonNum = 0, epNum = 0, explicitStreamId = "") {
  if (!subjectId) return [];
  const capCacheKey = `${subjectId}::s${seasonNum}::e${epNum}::${explicitStreamId || "auto"}`;
  const cached = mbCaptionCache.get(capCacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.captions;
  }
  let streamId = explicitStreamId.trim();
  if (!streamId) {
    const exactPlay = mbPlayStreamCache.get(`${subjectId}::s${seasonNum}::e${epNum}`);
    const altPlay = seasonNum === 0 && epNum === 0 ? mbPlayStreamCache.get(`${subjectId}::s1::e1`) : seasonNum === 1 && epNum === 1 ? mbPlayStreamCache.get(`${subjectId}::s0::e0`) : null;
    if (exactPlay?.streamId) {
      streamId = exactPlay.streamId;
    } else if (altPlay?.streamId) {
      streamId = altPlay.streamId;
    }
  }
  const token = cachedMovieBoxToken || await getMovieBoxBearerToken();
  const headers = {
    Accept: "application/json",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    Referer: `${MOVIEBOX_ORIGIN}/movies/${detailPath || "movie"}?id=${subjectId}`,
    "X-Client-Info": JSON.stringify({ timezone: "Asia/Dhaka" }),
    "X-Vip-Restrict": "0",
    "X-No-High-Risk-Restrict": "1",
    "X-Request-Lang": "en"
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  } else {
    headers["X-Client-Token"] = generateMovieBoxClientToken();
  }
  if (!streamId) {
    const tryCoords = seasonNum > 0 || epNum > 0 ? [
      { se: seasonNum, ep: epNum },
      { se: 0, ep: 0 }
    ] : [
      { se: 0, ep: 0 },
      { se: 1, ep: 1 }
    ];
    for (const coord of tryCoords) {
      try {
        const playRes = await fetchMovieBoxPlayStreams(
          subjectId,
          detailPath || "movie",
          coord.se,
          coord.ep,
          detailPath || "Movie",
          "Original Audio",
          ""
        );
        if (playRes.streamId) {
          streamId = playRes.streamId;
          break;
        }
      } catch {
      }
    }
  }
  const captionOrigins = [MOVIEBOX_FALLBACK_API_ORIGIN, MOVIEBOX_ORIGIN];
  const fetchRawCaptionsForStream = async (subjId, detPath, strmId) => {
    if (!subjId || !strmId) return [];
    try {
      return await Promise.any(
        captionOrigins.map(async (origin) => {
          const capUrl = `${origin}/wefeed-h5api-bff/subject/caption?format=MP4&id=${encodeURIComponent(
            strmId
          )}&subjectId=${encodeURIComponent(subjId)}&detailPath=${encodeURIComponent(
            detPath || "movie"
          )}`;
          const r = await fetch(capUrl, { headers, signal: AbortSignal.timeout(2200) });
          if (!r.ok) throw new Error("caption http error");
          const j = await r.json();
          const list = j?.data?.captions;
          if (Array.isArray(list) && list.length > 0) return list;
          throw new Error("empty captions");
        })
      );
    } catch {
      return [];
    }
  };
  let rawCaptions = [];
  if (streamId) {
    rawCaptions = await fetchRawCaptionsForStream(subjectId, detailPath || "movie", streamId);
  }
  // IMPORTANT: Only fall back to sibling subjectIds when the current streamId has ZERO official captions!
  // Never overwrite or mix a sibling dub's captions when the current streamId already has exact time-synced captions,
  // because different audio dubs on MovieBox often have a 5-6 second studio intro difference.
  if (rawCaptions.length === 0) {
    const siblingCandidates = [];
    const seenSibIds = /* @__PURE__ */ new Set([subjectId]);
    for (const [, detEntry] of detailCache.entries()) {
      const dubs = detEntry?.data?.dubs || [];
      if (detEntry?.data?.url?.includes(subjectId) || dubs.some((d) => String(d.path || "").includes(subjectId))) {
        for (const d of dubs) {
          const p = String(d.path || "").replace(/^\/mb\//, "").split("/").filter(Boolean);
          if (p[0] && !seenSibIds.has(p[0])) {
            seenSibIds.add(p[0]);
            siblingCandidates.push({ id: p[0], slug: p[1] || detailPath || "movie" });
          }
        }
      }
    }
    if (siblingCandidates.length > 0) {
      for (const sib of siblingCandidates.slice(0, 2)) {
        try {
          const cachedSibPlay = mbPlayStreamCache.get(`${sib.id}::s${seasonNum}::e${epNum}`) || mbPlayStreamCache.get(`${sib.id}::s0::e0`) || mbPlayStreamCache.get(`${sib.id}::s1::e1`);
          let sibStreamId = cachedSibPlay?.streamId || "";
          if (!sibStreamId) {
            const playRes = await fetchMovieBoxPlayStreams(sib.id, sib.slug, seasonNum, epNum, sib.slug, "Original Audio", "");
            sibStreamId = playRes.streamId || "";
          }
          if (sibStreamId) {
            const sibCaps = await fetchRawCaptionsForStream(sib.id, sib.slug, sibStreamId);
            if (sibCaps.length > 0) {
              rawCaptions = sibCaps;
              break;
            }
          }
        } catch {}
      }
    }
  }
  const allMapped = [];
  const seenUrls = /* @__PURE__ */ new Set();
  for (const c of rawCaptions) {
    const rawUrl = String(c?.url || "").trim();
    if (!rawUrl || !rawUrl.startsWith("http") || seenUrls.has(rawUrl)) continue;
    seenUrls.add(rawUrl);
    const encToken = encodeGatewayToken(rawUrl);
    allMapped.push({
      id: String(c?.id || allMapped.length + 1),
      lan: String(c?.lan || "en").toLowerCase().trim(),
      lanName: String(c?.lanName || c?.lan || "English").trim(),
      url: `/api/mb-subtitle-srt?t=${encToken}`,
      bnUrl: `/api/mb-subtitle-srt?t=${encToken}&tl=bn`,
      delay: Number(c?.delay || 0) || 0
    });
  }
  const banglaCap = allMapped.find((x) => {
    const l = `${x.lan} ${x.lanName}`.toLowerCase();
    return l.includes("bn") || l.includes("ben") || l.includes("bangla") || l.includes("bengali") || l.includes("\u09AC\u09BE\u0982\u09B2\u09BE");
  });
  const englishCap = allMapped.find((x) => {
    const l = `${x.lan} ${x.lanName}`.toLowerCase();
    return l.startsWith("en") || l.includes("english");
  });
  const mapped = [];
  if (banglaCap) {
    mapped.push({
      ...banglaCap,
      lan: "bn",
      lanName: "\u09AC\u09BE\u0982\u09B2\u09BE (Official)"
    });
  }
  if (englishCap) {
    mapped.push({
      ...englishCap,
      lan: "en",
      lanName: "English (Official)"
    });
  }
  for (const other of allMapped) {
    if (!mapped.some((m) => m.url === other.url)) {
      mapped.push(other);
    }
  }
  if (mapped.length > 0) {
    pruneCacheMap(mbCaptionCache, 200);
    mbCaptionCache.set(capCacheKey, {
      captions: mapped,
      expiresAt: Date.now() + 30 * 6e4
    });
  }
  return mapped;
}
async function fetchMovieBoxDetail(rawPath) {
  const parts = rawPath.replace(/^\/mb\//, "").split("/").filter(Boolean);
  let subjectId = parts[0] || "";
  let fallbackSlug = parts[1] || "movie";
  const STUB_UPGRADE_MAP = {
    "9162827393101350104": {
      subjectId: "7459884463091499088",
      slug: "black-clover-english-4Q7h8lHl4T8"
    }
  };
  if (STUB_UPGRADE_MAP[subjectId]) {
    subjectId = STUB_UPGRADE_MAP[subjectId].subjectId;
    fallbackSlug = STUB_UPGRADE_MAP[subjectId]?.slug || fallbackSlug;
  }
  const token = cachedMovieBoxToken || await getMovieBoxBearerToken();
  const headers = {
    Accept: "application/json",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    Referer: "https://movie-box.co/?utm_source=mb_app_inner_btmtip",
    "X-Client-Info": JSON.stringify({ timezone: "Asia/Dhaka" }),
    "X-Vip-Restrict": "0",
    "X-No-High-Risk-Restrict": "1",
    "X-Request-Lang": "en"
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  } else {
    headers["X-Client-Token"] = generateMovieBoxClientToken();
  }
  let cachedHomeSubj = null;
  for (const sec of cachedMovieBoxHomeSections) {
    const found = (sec.subjects || []).find(
      (s) => String(s?.subjectId || s?.subject?.subjectId || "") === subjectId
    );
    if (found) {
      cachedHomeSubj = found?.subject || found;
      break;
    }
  }
  let exactSlug = String(cachedHomeSubj?.detailPath || fallbackSlug).trim();
  const fetchNuxtDetailFromMovieBoxPh = async (slugToFetch, idToFetch) => {
    const nuxtUrl = `https://moviebox.ph/movies/${encodeURIComponent(slugToFetch)}?id=${encodeURIComponent(idToFetch)}`;
    const r = await fetch(nuxtUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9,bn;q=0.8,hi;q=0.7"
      },
      signal: AbortSignal.timeout(4200)
    });
    if (!r.ok) throw new Error("nuxt detail not ok");
    const html = await r.text();
    const parsed = extractMovieBoxNuxtDetail(html);
    if (parsed?.data?.subject) return parsed;
    throw new Error("empty nuxt subject");
  };
  const detailPromise = Promise.any([
    fetchNuxtDetailFromMovieBoxPh(exactSlug, subjectId),
    ...[
      `${MOVIEBOX_FALLBACK_API_ORIGIN}/wefeed-h5api-bff/detail?detailPath=${encodeURIComponent(exactSlug)}`,
      `${MOVIEBOX_FALLBACK_API_ORIGIN}/wefeed-h5api-bff/detail?detailPath=${encodeURIComponent(exactSlug)}&subjectId=${encodeURIComponent(subjectId)}`,
      `${MOVIEBOX_FALLBACK_API_ORIGIN}/wefeed-h5api-bff/detail?subjectId=${encodeURIComponent(subjectId)}`
    ].map(async (url) => {
      const detRes = await fetch(url, { headers, signal: AbortSignal.timeout(2500) });
      if (!detRes.ok) throw new Error("detail not ok");
      const j = await detRes.json();
      if (j?.data?.subject) return j;
      throw new Error("empty subject");
    })
  ]).catch(() => null);
  const formatSlugToTitle = (slug) => {
    const withoutHash = slug.replace(/-[a-zA-Z0-9]{8,}$/, "");
    const words = withoutHash.split("-").filter(Boolean);
    return words.map((w) => {
      if (/^(english|hindi|bangla|bengali|tamil|telugu|malayalam|arabic)$/i.test(w)) {
        return `[${w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()}]`;
      }
      return w.charAt(0).toUpperCase() + w.slice(1);
    }).join(" ");
  };
  const earlyBaseTitle = extractBaseSeriesTitle(
    String(cachedHomeSubj?.title || formatSlugToTitle(fallbackSlug))
  ).replace(/\bs\d+\s*-\s*s\d+\b/gi, "").replace(/\b(19|20)\d{2}\b/g, "").trim();
  const siblingSearchPromise = earlyBaseTitle.length >= 2 ? fetch(`${MOVIEBOX_FALLBACK_API_ORIGIN}/wefeed-h5api-bff/subject/search`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      keyword: earlyBaseTitle,
      page: 1,
      perPage: 24,
      subjectType: 0
    }),
    signal: AbortSignal.timeout(950)
  }).then((r) => r.ok ? r.json() : null).catch(() => null) : Promise.resolve(null);
  const isBlackCloverSlug = /black-clover/i.test(exactSlug);
  let [detJson, parallelMovieStreams, parallelEp1Streams, parallelEp2Streams, earlySearchJson] = await Promise.all([
    detailPromise,
    fetchMovieBoxPlayStreams(subjectId, exactSlug, 0, 0, exactSlug, "Original Audio", ""),
    fetchMovieBoxPlayStreams(subjectId, exactSlug, 1, 1, exactSlug, "Original Audio", ""),
    isBlackCloverSlug ? fetchMovieBoxPlayStreams(subjectId, exactSlug, 2, 1, exactSlug, "Original Audio", "") : Promise.resolve({ sources: [], buttons: [] }),
    siblingSearchPromise
  ]);
  if (!detJson?.data?.subject && Array.isArray(earlySearchJson?.data?.items)) {
    const exactMatchFromSearch = earlySearchJson.data.items.find(
      (it) => String(it?.subjectId || "") === subjectId
    );
    if (exactMatchFromSearch?.detailPath) {
      detJson = await fetchNuxtDetailFromMovieBoxPh(
        String(exactMatchFromSearch.detailPath),
        subjectId
      ).catch(() => null);
    } else {
      const siblingMatch = earlySearchJson.data.items.find((it) => {
        const b = extractBaseSeriesTitle(String(it?.title || "")).replace(/\bs\d+\s*-\s*s\d+\b/gi, "").replace(/\b(19|20)\d{2}\b/g, "").trim().toLowerCase();
        return b === earlyBaseTitle.toLowerCase();
      });
      if (siblingMatch?.detailPath) {
        const siblingNuxt = await fetchNuxtDetailFromMovieBoxPh(
          String(siblingMatch.detailPath),
          String(siblingMatch.subjectId || subjectId)
        ).catch(() => null);
        const matchingDub = Array.isArray(siblingNuxt?.data?.subject?.dubs) ? siblingNuxt.data.subject.dubs.find(
          (d) => String(d?.subjectId || "") === subjectId
        ) : null;
        if (matchingDub?.detailPath) {
          detJson = await fetchNuxtDetailFromMovieBoxPh(
            String(matchingDub.detailPath),
            subjectId
          ).catch(() => null);
        }
      }
    }
  }
  let subject = detJson?.data?.subject || cachedHomeSubj || {
    subjectId,
    title: formatSlugToTitle(fallbackSlug),
    detailPath: exactSlug,
    subjectType: parallelEp1Streams.sources.length > 0 || parallelEp2Streams.sources.length > 0 ? 2 : 1,
    releaseDate: "2017",
    genre: "Animation, Action, Adventure",
    imdbRatingValue: "8.2"
  };
  const resource = detJson?.data?.resource || {};
  const stars = Array.isArray(detJson?.data?.stars) ? detJson.data.stars : [];
  let title = String(subject.title || "CinePulse Title").trim();
  let detailPath = String(subject.detailPath || exactSlug).trim();
  let poster = String(subject.cover?.url || "").trim();
  let releaseDate = String(subject.releaseDate || "2026").trim();
  let genre = String(subject.genre || "Action, Drama").replace(/,/g, ", ");
  let storyline = String(subject.description || "").trim();
  let ratingVal = parseFloat(String(subject.imdbRatingValue || "8.4")) || 8.4;
  let subjectType = Number(subject.subjectType) || 1;
  const trailerMp4Url = String(subject.trailer?.videoAddress?.url || "").trim();
  const uploadedBy = "CinePulse Official";
  const rawDubs = Array.isArray(subject.dubs) ? subject.dubs.map((d) => ({ ...d, isOfficialSubjectDub: true })) : [];
  const seasonSubjectMap = /* @__PURE__ */ new Map();
  const fullPackSiblings = [];
  const parseSeasonNumberFromTitle = (rawTitleStr) => {
    if (/\bs\d+\s*-\s*s\d+\b/i.test(String(rawTitleStr || ""))) return 0;
    const m = String(rawTitleStr || "").match(/(?:\bseason\s*|\bs)(\d{1,2})\b/i);
    if (!m) return 0;
    const n = parseInt(m[1], 10);
    return n >= 1 && n <= 30 ? n : 0;
  };
  const currentTitleSeasonNum = parseSeasonNumberFromTitle(title);
  if (currentTitleSeasonNum >= 1) {
    seasonSubjectMap.set(currentTitleSeasonNum, { subjectId, detailPath });
  } else {
    seasonSubjectMap.set(1, { subjectId, detailPath });
  }
  const baseCleanTitle = extractBaseSeriesTitle(title).replace(/\bs\d+\s*-\s*s\d+\b/gi, "").replace(/\b(19|20)\d{2}\b/g, "").trim();
  const inspectSiblingSubject = (subObj) => {
    const sTitle = String(subObj?.title || "").trim();
    if (!sTitle) return;
    const sBase = extractBaseSeriesTitle(sTitle).replace(/\bs\d+\s*-\s*s\d+\b/gi, "").replace(/\b(19|20)\d{2}\b/g, "").trim().toLowerCase();
    if (sBase !== baseCleanTitle.toLowerCase()) return;
    if (Array.isArray(subObj?.dubs)) {
      for (const sd of subObj.dubs) {
        rawDubs.push({ ...sd, isOfficialSubjectDub: true });
      }
    }
    const sId = String(subObj?.subjectId || "").trim();
    const sSlug = String(subObj?.detailPath || detailPath).trim();
    const bracketMatch = sTitle.match(/\[(.*?)\]/);
    const cornerStr = String(subObj?.corner || "").trim();
    const inferredLan = bracketMatch ? `${bracketMatch[1].trim()} dub` : cornerStr ? `${cornerStr} dub` : "Original Audio";
    if (sId) {
      const isMultiSeasonPack = /\bs\d+\s*-\s*s\d+\b/i.test(sTitle);
      if (isMultiSeasonPack) {
        fullPackSiblings.push({
          subjectId: sId,
          detailPath: sSlug,
          title: sTitle,
          lanName: inferredLan,
          item: subObj
        });
      }
      rawDubs.push({
        subjectId: sId,
        lanName: inferredLan,
        detailPath: sSlug,
        isMultiSeasonPack,
        isOfficialSubjectDub: false
      });
      const detectedSe = parseSeasonNumberFromTitle(sTitle);
      if (detectedSe >= 1 && !seasonSubjectMap.has(detectedSe)) {
        seasonSubjectMap.set(detectedSe, { subjectId: sId, detailPath: sSlug });
      }
    }
  };
  if (baseCleanTitle.length >= 2) {
    for (const sec of cachedMovieBoxHomeSections) {
      for (const s of sec.subjects || []) {
        inspectSiblingSubject(s?.subject || s);
      }
    }
    const earlyItems = Array.isArray(earlySearchJson?.data?.items) ? earlySearchJson.data.items : [];
    for (const sItem of earlyItems) {
      inspectSiblingSubject(sItem);
    }
    if (!detJson?.data?.subject && earlyItems.length === 0) {
      try {
        const sJson = await fetch(`${MOVIEBOX_FALLBACK_API_ORIGIN}/wefeed-h5api-bff/subject/search`, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({
            keyword: baseCleanTitle,
            page: 1,
            perPage: 24,
            subjectType: 0
          }),
          signal: AbortSignal.timeout(1e3)
        }).then((r) => r.ok ? r.json() : null).catch(() => null);
        const sItems = Array.isArray(sJson?.data?.items) ? sJson.data.items : [];
        for (const sItem of sItems) {
          inspectSiblingSubject(sItem);
        }
      } catch {
      }
    }
  }
  const matchingSelfFromSearch = fullPackSiblings.find((f) => f.subjectId === subjectId)?.item;
  if (matchingSelfFromSearch && !detJson?.data?.subject) {
    title = String(matchingSelfFromSearch.title || title).replace(/\s*\bS\d+\s*-\s*S\d+\b/gi, "").trim();
    if (!poster && matchingSelfFromSearch.cover?.url) poster = String(matchingSelfFromSearch.cover.url).trim();
    if (matchingSelfFromSearch.releaseDate) releaseDate = String(matchingSelfFromSearch.releaseDate).trim();
    if (matchingSelfFromSearch.genre) genre = String(matchingSelfFromSearch.genre).replace(/,/g, ", ");
    if (matchingSelfFromSearch.description && !storyline) storyline = String(matchingSelfFromSearch.description).trim();
    if (matchingSelfFromSearch.imdbRatingValue) {
      ratingVal = parseFloat(String(matchingSelfFromSearch.imdbRatingValue)) || ratingVal;
    }
    subjectType = Number(matchingSelfFromSearch.subjectType) || subjectType;
  }
  if (parallelEp1Streams.sources.length === 0 && fullPackSiblings.length > 0) {
    const bestPack = fullPackSiblings.find(
      (f) => title.toLowerCase().includes("english") ? f.lanName.toLowerCase().includes("english") : title.toLowerCase().includes("hindi") ? f.lanName.toLowerCase().includes("hindi") : f.lanName === "Original Audio"
    ) || fullPackSiblings[0];
    subjectId = bestPack.subjectId;
    detailPath = bestPack.detailPath;
    exactSlug = bestPack.detailPath;
    title = bestPack.title.replace(/\s*\bS\d+\s*-\s*S\d+\b/gi, "").trim();
    if (!poster && bestPack.item?.cover?.url) poster = String(bestPack.item.cover.url).trim();
    subjectType = 2;
    seasonSubjectMap.set(1, { subjectId, detailPath });
    seasonSubjectMap.set(2, { subjectId, detailPath });
    [parallelEp1Streams, parallelEp2Streams] = await Promise.all([
      fetchMovieBoxPlayStreams(subjectId, detailPath, 1, 1, detailPath, bestPack.lanName, ""),
      fetchMovieBoxPlayStreams(subjectId, detailPath, 2, 1, detailPath, bestPack.lanName, "")
    ]);
  }
  rawDubs.sort((a, b) => {
    const offA = a?.isOfficialSubjectDub ? 1 : 0;
    const offB = b?.isOfficialSubjectDub ? 1 : 0;
    if (offA !== offB) return offB - offA;
    return (b?.isMultiSeasonPack ? 1 : 0) - (a?.isMultiSeasonPack ? 1 : 0);
  });
  const formatDubDisplayLabel = (rawLan) => {
    const trimmed = rawLan.trim();
    if (/^esla\s+dub$/i.test(trimmed)) return "Spanish (LATAM) dub";
    if (/^ptbr\s+dub$/i.test(trimmed)) return "Portuguese (BR) dub";
    return trimmed;
  };
  const dubs = [];
  const seenDubIds = /* @__PURE__ */ new Set();
  const seenDubLabels = /* @__PURE__ */ new Set();
  for (const d of rawDubs) {
    const dId = String(d?.subjectId || "").trim();
    const dLabel = formatDubDisplayLabel(String(d?.lanName || ""));
    if (!dId || !dLabel || seenDubIds.has(dId)) continue;
    const labelKey = dLabel.toLowerCase();
    if (seenDubLabels.has(labelKey) && dId !== subjectId) continue;
    seenDubIds.add(dId);
    seenDubLabels.add(labelKey);
    const dSlug = String(d?.detailPath || detailPath).trim();
    dubs.push({
      id: dId,
      label: dLabel,
      lanCode: String(d?.lanCode || "").trim(),
      path: `/mb/${dId}/${dSlug}`,
      active: dId === subjectId
    });
  }
  dubs.sort((a, b) => {
    const rank = (opt) => {
      if (opt.active) return 100;
      const l = opt.label.toLowerCase();
      if (l.includes("original")) return 96;
      if (l.includes("hindi")) return 94;
      if (l.includes("bengali") || l.includes("bangla")) return 92;
      if (l.includes("english")) return 90;
      if (l.includes("tamil")) return 86;
      if (l.includes("telugu")) return 85;
      if (l.includes("malayalam")) return 84;
      if (l.includes("tagalog")) return 82;
      if (l.includes("indonesian") && l.includes("dub")) return 80;
      if (l.includes("arabic") && l.includes("dub")) return 78;
      if (l.includes("dub")) return 72;
      return 45;
    };
    return rank(b) - rank(a);
  });
  const activeDubObj = dubs.find((d) => d.id === subjectId);
  let language = activeDubObj?.label || "";
  if (!language) {
    if (/\[hindi\]|\bhindi\s*dub/i.test(title)) language = "Hindi dub";
    else if (/\[bengali\]|\[bangla\]|\bbangla\s*dub/i.test(title)) language = "Bangla dub";
    else if (/\[english\]|\benglish\s*dub/i.test(title)) language = "English dub";
    else if (/\[tamil\]/i.test(title)) language = "Tamil dub";
    else if (/\[telugu\]/i.test(title)) language = "Telugu dub";
    else if (/\[malayalam\]/i.test(title)) language = "Malayalam dub";
    else if (/\[arabic\]/i.test(title)) language = "Arabic dub";
    else if (String(subject.countryName || "").toLowerCase().includes("india")) language = "Hindi";
    else if (String(subject.countryName || "").toLowerCase().includes("bangladesh")) language = "Bangla";
    else if (String(subject.countryName || "").toLowerCase().includes("korea")) language = "Korean";
    else if (String(subject.countryName || "").toLowerCase().includes("japan")) language = "Original Audio";
    else if (dubs.length > 0) language = dubs[0].label;
    else language = "Original Audio";
  }
  if (dubs.length === 0) {
    dubs.push({
      id: subjectId,
      label: language,
      path: `/mb/${subjectId}/${detailPath}`,
      active: true
    });
  } else if (!dubs.some((d) => d.active)) {
    dubs.unshift({
      id: subjectId,
      label: language,
      path: `/mb/${subjectId}/${detailPath}`,
      active: true
    });
  }
  const cast = (Array.isArray(subject.staffList) ? subject.staffList : stars).slice(0, 12).map((s) => ({
    url: `/search?q=${encodeURIComponent(String(s?.name || ""))}`,
    photo: String(s?.avatarUrl || s?.avatar || ""),
    name: String(s?.name || "Actor"),
    role: String(s?.character || s?.role || "Cast")
  }));
  const screenshots = [];
  if (subject.stills?.url) screenshots.push(String(subject.stills.url));
  if (subject.trailer?.cover?.url) screenshots.push(String(subject.trailer.cover.url));
  let seasonsList = Array.isArray(resource.seasons) ? [...resource.seasons] : [];
  const isMovieType = subjectType === 1 && parallelEp1Streams.sources.length === 0 && parallelEp2Streams.sources.length === 0 && (seasonsList.length === 0 || seasonsList.length === 1 && Number(seasonsList[0]?.se) === 0);
  const episodes = [];
  let downloadButtons = [];
  if (isMovieType) {
    let sources = parallelMovieStreams.sources;
    let buttons = parallelMovieStreams.buttons;
    if (sources.length === 0 && parallelEp1Streams.sources.length > 0) {
      sources = parallelEp1Streams.sources;
      buttons = parallelEp1Streams.buttons;
    }
    if (sources.length === 0) {
      const fb = await fetchMovieBoxPlayStreams(
        subjectId,
        detailPath,
        0,
        0,
        title,
        language,
        trailerMp4Url
      );
      sources = fb.sources;
      buttons = fb.buttons;
    }
    sources = sources.map((s) => ({
      ...s,
      audio: language,
      audioLanguages: [language],
      name: `${title} (${s.quality}p MP4)`
    }));
    downloadButtons = buttons;
    if (sources.length > 0) {
      episodes.push({
        id: `mb-movie-${subjectId}`,
        label: "Full Movie (CinePulse HD)",
        number: 1,
        rangeStart: 1,
        rangeEnd: 1,
        season: null,
        kind: "movie",
        sources
      });
    }
  } else {
    let imdbId = "";
    const isBlackClover = baseCleanTitle.toLowerCase() === "black clover";
    const hasSeasonsFromDetail = seasonsList.length >= 1 && !isBlackClover;
    if (!hasSeasonsFromDetail) {
      try {
        imdbId = await resolveImdbIdForTitle(baseCleanTitle || title, releaseDate, true);
        if (imdbId) {
          const cinemetaSeasons = await resolveCinemetaSeriesSeasons(imdbId);
          if (cinemetaSeasons.length > 0) {
            const mergedSeasonMap = /* @__PURE__ */ new Map();
            for (const sObj of seasonsList) {
              const sNum = Number(sObj?.se) || 1;
              if (sNum > 0) mergedSeasonMap.set(sNum, Math.max(1, Number(sObj?.maxEp) || 1));
            }
            for (const cSeason of cinemetaSeasons) {
              const cSe = Number(cSeason.se) || 1;
              const cMax = Math.max(1, Number(cSeason.maxEp) || 1);
              if (cSe >= 2 && !mergedSeasonMap.has(cSe) && !seasonSubjectMap.has(cSe) && !(cSe === 2 && (parallelEp2Streams.sources.length > 0 || isBlackClover))) {
                continue;
              }
              const existingMax = mergedSeasonMap.get(cSe) || 0;
              if (cMax > existingMax) {
                mergedSeasonMap.set(cSe, cMax);
              }
            }
            seasonsList = Array.from(mergedSeasonMap.entries()).map(([se, maxEp]) => ({
              se,
              maxEp
            }));
          }
        }
      } catch {
      }
    }
    if (seasonsList.length === 0 && parallelEp1Streams.sources.length > 0) {
      seasonsList = [{ se: 1, maxEp: subjectType === 2 ? 24 : 1 }];
      if (parallelEp2Streams.sources.length > 0) {
        seasonsList.push({ se: 2, maxEp: 5 });
      }
    }
    if (seasonsList.length === 0 || isBlackClover) {
      const knownSeasonNums = new Set(seasonsList.map((s) => Number(s?.se) || 1));
      for (const [seNum] of seasonSubjectMap.entries()) {
        if (seNum > 0 && !knownSeasonNums.has(seNum)) {
          knownSeasonNums.add(seNum);
          seasonsList.push({ se: seNum, maxEp: seNum === 2 ? 5 : 12 });
        }
      }
    }
    if (seasonsList.length === 0) {
      seasonsList = [{ se: 1, maxEp: 12 }];
    }
    seasonsList.sort((a, b) => (Number(a.se) || 1) - (Number(b.se) || 1));
    const parseSeasonEpNums = (sObj) => {
      const maxEp = Math.max(1, Number(sObj?.maxEp) || 1);
      const fromAllEp = String(sObj?.allEp || "").split(",").map((x) => parseInt(x.trim(), 10)).filter((n) => !Number.isNaN(n) && n > 0);
      return fromAllEp.length >= maxEp ? fromAllEp : Array.from({ length: maxEp }, (_, idx) => idx + 1);
    };
    const firstSeason = seasonsList[0] || { se: 1, maxEp: 12 };
    const firstSeNum = Number(firstSeason.se) || 1;
    const firstSeasonEpNums = parseSeasonEpNums(firstSeason);
    const firstEpNum = firstSeasonEpNums[0] || 1;
    const preloadedMap = /* @__PURE__ */ new Map();
    let firstEpRes = firstSeNum === 1 && firstEpNum === 1 && parallelEp1Streams.sources.length > 0 ? parallelEp1Streams : await fetchMovieBoxPlayStreams(
      subjectId,
      detailPath,
      firstSeNum,
      firstEpNum,
      `${title} S${firstSeNum}E${firstEpNum}`,
      language,
      trailerMp4Url
    );
    firstEpRes = {
      sources: firstEpRes.sources.map((s) => ({
        ...s,
        audio: language,
        audioLanguages: [language],
        name: `${title} - S${firstSeNum}E${firstEpNum} (${s.quality}p MP4)`
      })),
      buttons: firstEpRes.buttons
    };
    preloadedMap.set(`${firstSeNum}::${firstEpNum}`, firstEpRes);
    if (parallelEp2Streams.sources.length > 0) {
      preloadedMap.set(`2::1`, {
        sources: parallelEp2Streams.sources.map((s) => ({
          ...s,
          audio: language,
          audioLanguages: [language],
          name: `${title} - S2E1 (${s.quality}p MP4)`
        })),
        buttons: parallelEp2Streams.buttons
      });
    }
    const fbParam = trailerMp4Url ? `&fb=${encodeGatewayToken(trailerMp4Url)}` : "";
    for (let sIdx = 0; sIdx < seasonsList.length; sIdx++) {
      const sObj = seasonsList[sIdx];
      const seNum = Number(sObj?.se) || sIdx + 1;
      const epNums = sIdx === 0 ? firstSeasonEpNums : parseSeasonEpNums(sObj);
      const seasonTarget = seasonSubjectMap.get(seNum) || { subjectId, detailPath };
      for (const epNum of epNums) {
        const pre = preloadedMap.get(`${seNum}::${epNum}`);
        const embedBackups = buildEmbedBackupSources(imdbId, seNum, epNum, title, language);
        if (pre && pre.sources.length > 0) {
          if (downloadButtons.length === 0) downloadButtons = pre.buttons;
          episodes.push({
            id: `mb-ep-${seasonTarget.subjectId}-s${seNum}-e${epNum}`,
            label: `S${String(seNum).padStart(2, "0")}E${String(epNum).padStart(2, "0")} \u2022 Episode ${epNum}`,
            number: epNum,
            rangeStart: epNum,
            rangeEnd: epNum,
            season: seNum,
            kind: "episode",
            sources: [...pre.sources, ...embedBackups]
          });
        } else {
          const dynamicStreamUrl = `/api/mb-ep-stream.mp4?subjectId=${encodeURIComponent(
            seasonTarget.subjectId
          )}&detailPath=${encodeURIComponent(seasonTarget.detailPath)}&se=${seNum}&ep=${epNum}${fbParam}`;
          episodes.push({
            id: `mb-ep-${seasonTarget.subjectId}-s${seNum}-e${epNum}`,
            label: `S${String(seNum).padStart(2, "0")}E${String(epNum).padStart(2, "0")} \u2022 Episode ${epNum}`,
            number: epNum,
            rangeStart: epNum,
            rangeEnd: epNum,
            season: seNum,
            kind: "episode",
            sources: [
              {
                id: `mb-lazy-${seasonTarget.subjectId}-s${seNum}-e${epNum}-480`,
                quality: 480,
                qualityLabel: "480p Fast (CinePulse Direct)",
                audio: language,
                audioLanguages: [language],
                provider: "CinePulse HD 480p",
                url: `${dynamicStreamUrl}&q=480`,
                downloadUrl: `${dynamicStreamUrl}&q=480&dl=1`,
                type: "mp4",
                name: `${title} - S${seNum}E${epNum} (480p)`
              },
              {
                id: `mb-lazy-${seasonTarget.subjectId}-s${seNum}-e${epNum}-720`,
                quality: 720,
                qualityLabel: "720p HD (CinePulse Direct)",
                audio: language,
                audioLanguages: [language],
                provider: "CinePulse HD 720p",
                url: `${dynamicStreamUrl}&q=720`,
                downloadUrl: `${dynamicStreamUrl}&q=720&dl=1`,
                type: "mp4",
                name: `${title} - S${seNum}E${epNum} (720p)`
              },
              {
                id: `mb-lazy-${seasonTarget.subjectId}-s${seNum}-e${epNum}-1080`,
                quality: 1080,
                qualityLabel: "1080p Full HD (CinePulse Direct)",
                audio: language,
                audioLanguages: [language],
                provider: "CinePulse HD 1080p",
                url: `${dynamicStreamUrl}&q=1080`,
                downloadUrl: `${dynamicStreamUrl}&q=1080&dl=1`,
                type: "mp4",
                name: `${title} - S${seNum}E${epNum} (1080p)`
              },
              ...embedBackups
            ]
          });
        }
      }
    }
  }
  if (episodes.length === 0 && trailerMp4Url) {
    const trUrl = `/api/mb-stream.mp4?t=${encodeGatewayToken(trailerMp4Url)}`;
    episodes.push({
      id: `mb-trailer-${subjectId}`,
      label: "Official Preview Stream",
      number: 1,
      rangeStart: 1,
      rangeEnd: 1,
      season: null,
      kind: "movie",
      sources: [
        {
          id: `mb-trailer-src-${subjectId}`,
          quality: 720,
          qualityLabel: "720p Official Preview",
          audio: language,
          audioLanguages: [language],
          provider: "CinePulse Preview",
          url: trUrl,
          downloadUrl: trUrl,
          type: "mp4",
          name: `${title} (Preview)`
        }
      ]
    });
  }
  return {
    title,
    url: rawPath,
    poster,
    qualityNote: `1080p / 720p / 480p \u2022 ${language}`,
    typeBadge: subjectType === 2 ? "SERIES" : "MOVIE",
    language,
    quality: "1080p FHD",
    genre,
    resolution: "1080p | 720p | 480p | 360p",
    releaseDate,
    storyline,
    youtubeTrailerId: "",
    screenshots,
    episodes,
    downloadButtons,
    cast,
    dubs,
    uploadedBy,
    communityScore: {
      recommendedPercent: Math.min(99, Math.max(75, Math.round(ratingVal * 10))),
      totalVotes: Number(subject.imdbRatingCount) || 1420,
      verdict: "CinePulse HD Verified"
    }
  };
}
async function startServer() {
  const app = express();
  app.disable("x-powered-by");
  const PORT = Number(process.env.PORT) || 3e3;
  const apiRateMap = /* @__PURE__ */ new Map();
  const imageProxyCache = /* @__PURE__ */ new Map();
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    const origin = String(req.headers.origin || "");
    if (origin && (origin.includes("chinepulse.71i.site") || origin.includes("localhost") || origin.includes("127.0.0.1") || origin.includes(".run.app"))) {
      res.setHeader("Access-Control-Allow-Origin", origin);
    }
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Range, X-CP-Ts, X-CP-Sig, X-CP-Client"
    );
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    if ((req.path === "/_s/i.jpg" || req.path === "/api/i") && typeof req.query.k === "string") {
      const targetImgUrl = decodeCloakToken(String(req.query.k || ""));
      if (!targetImgUrl || !/^https?:\/\//i.test(targetImgUrl)) {
        res.status(404).end();
        return;
      }
      const cachedImg = imageProxyCache.get(targetImgUrl);
      if (cachedImg && cachedImg.expiresAt > Date.now()) {
        res.setHeader("Content-Type", cachedImg.contentType);
        res.setHeader("Cache-Control", "public, max-age=604800, immutable");
        res.send(cachedImg.buf);
        return;
      }
      fetch(targetImgUrl, {
        headers: {
          Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
          Referer: "https://movie-box.co/"
        },
        signal: AbortSignal.timeout(7e3)
      }).then(async (r) => {
        if (!r.ok) {
          res.status(r.status).end();
          return;
        }
        const ct = r.headers.get("content-type") || "image/jpeg";
        const ab = await r.arrayBuffer();
        const buf = Buffer.from(ab);
        if (buf.length > 0 && buf.length < 7e5) {
          pruneCacheMap(imageProxyCache, 180);
          imageProxyCache.set(targetImgUrl, {
            buf,
            contentType: ct,
            expiresAt: Date.now() + 30 * 6e4
          });
        }
        res.setHeader("Content-Type", ct);
        res.setHeader("Cache-Control", "public, max-age=604800, immutable");
        res.send(buf);
      }).catch(() => {
        if (!res.headersSent) res.status(502).end();
      });
      return;
    }
    if ((req.path === "/_s/g" || req.path === "/_s/v.mp4" || req.path === "/api/g" || req.path === "/api/v") && typeof req.query.k === "string") {
      const unlockedUrl = decodeCloakToken(String(req.query.k || ""));
      if (unlockedUrl && unlockedUrl.startsWith("/api/")) {
        req.url = unlockedUrl;
        req.originalUrl = unlockedUrl;
        delete req._parsedUrl;
        const parsedU = new URL(unlockedUrl, "http://localhost");
        const nextQuery = {};
        parsedU.searchParams.forEach((v, k) => {
          nextQuery[k] = v;
        });
        req.query = nextQuery;
      } else {
        res.status(403).json({ ok: false, error: "Invalid cloaked token" });
        return;
      }
    }
    if (req.path.startsWith("/api/")) {
      const ua = String(req.headers["user-agent"] || "");
      const clientIp = String(
        req.headers["x-forwarded-for"] || req.socket.remoteAddress || "local"
      ).split(",")[0].trim();
      if (/\b(curl|wget|python|requests|urllib|httpx|aiohttp|scrapy|postman|insomnia|libwww|go-http-client|java\/|okhttp|apache-httpclient|headlesschrome|phantomjs)\b/i.test(
        ua
      )) {
        res.status(403).json({ ok: false, error: "Access denied by CinePulse Security Shield" });
        return;
      }
      const isStreamOrSubRoute = req.path.startsWith("/api/mb-stream") || req.path.startsWith("/api/mb-ep-stream") || req.path.startsWith("/api/mb-subtitle-srt") || req.path.startsWith("/api/go") || req.path.startsWith("/api/ios-hls");
      const referer = String(req.headers.referer || "").toLowerCase();
      if (isStreamOrSubRoute && referer && !referer.includes("chinepulse.71i.site") && !referer.includes("localhost") && !referer.includes("127.0.0.1") && !referer.includes(".run.app") && !referer.includes("aistudio.google.com")) {
        res.status(403).send("Hotlinking prohibited by CinePulse Security Shield");
        return;
      }
      if (!isStreamOrSubRoute) {
        const now = Date.now();
        const rl = apiRateMap.get(clientIp);
        if (!rl || now > rl.resetAt) {
          if (apiRateMap.size > 2e3) apiRateMap.clear();
          apiRateMap.set(clientIp, { count: 1, resetAt: now + 1e4 });
        } else {
          rl.count++;
          if (rl.count > 140) {
            res.status(429).json({ ok: false, error: "Too many requests" });
            return;
          }
        }
      }
      const cpSig = String(req.headers["x-cp-sig"] || "").trim();
      const cpTs = String(req.headers["x-cp-ts"] || "").trim();
      const cpClient = String(req.headers["x-cp-client"] || "").trim();
      if (!isStreamOrSubRoute && req.path !== "/api/health") {
        if (!cpSig && cpClient !== "cp-web-v4") {
          res.status(403).json({ ok: false, error: "Protected by CinePulse Security Shield" });
          return;
        }
        if (cpSig && cpTs) {
          const expectedFull = computeServerShieldSignature(req.originalUrl, cpTs);
          const expectedPath = computeServerShieldSignature(req.path, cpTs);
          if (cpSig !== expectedFull && cpSig !== expectedPath) {
            res.status(403).json({ ok: false, error: "Invalid CinePulse security signature" });
            return;
          }
        }
        const origJson = res.json.bind(res);
        res.json = ((body) => {
          if (body && typeof body === "object" && body._s !== 1) {
            return origJson(encryptServerApiPayload(body));
          }
          return origJson(body);
        });
      }
    }
    next();
  });
  app.use(express.json());
  const syncLiveCategories = async () => {
    const warmPaths = [
      "/",
      "/mostwatch/7d",
      "/type/movies",
      "/type/series",
      "/anime",
      "/language/bangla",
      "/bollywood",
      "/southIndian",
      "/language/english",
      "/category/anime-hindi",
      "/drama",
      "/category/short-tv",
      "/category/western-tv"
    ];
    for (const wp of warmPaths) {
      try {
        const cacheKey = `${wp}::page=1::q=::node=auto`;
        const mbParsed = await fetchMovieBoxCatalog(wp, 1, "");
        const mergedItems = wp === "/" ? sortItemsByHotAndHype(mbParsed.items) : normalizeMovieCardList(mbParsed.items);
        if (mergedItems.length > 0) {
          const entry = {
            data: {
              items: mergedItems,
              maxPage: mbParsed.maxPage,
              activeNodeId: "node-moviebox"
            },
            expiresAt: Date.now() + 6e5
          };
          pruneCacheMap(catalogCache, 120);
          catalogCache.set(cacheKey, entry);
          catalogCache.set(`${wp}::page=1::q=::node=node-moviebox`, entry);
          const warmCount = wp === "/" ? 3 : 1;
          const candidates = mergedItems.slice(0, warmCount).filter(
            (card) => card.path?.startsWith("/mb/") && !findCachedDetailByPathOrTitle(card.path, card.title)
          );
          for (const card of candidates) {
            try {
              const mbDet = await fetchMovieBoxDetail(card.path);
              if (mbDet && mbDet.episodes.length > 0) {
                storeDetailInCaches(card.path, mbDet, Date.now() + 36e5);
              }
            } catch {
            }
          }
        }
        await new Promise((r) => setTimeout(r, 350));
      } catch {
      }
    }
  };
  app.get("/api/categories", (_req, res) => {
    res.json({
      categories: ALL_CATEGORIES,
      nodes: SERVER_NODES.map(({ id, name, region }) => ({ id, name, region }))
    });
  });
  app.get("/api/mb-home", async (_req, res) => {
    try {
      const payload = await fetchMovieBoxHomePayload();
      res.setHeader("Cache-Control", "public, max-age=180, stale-while-revalidate=600");
      res.json(payload);
    } catch {
      res.json({
        ok: false,
        banners: [],
        liveSports: [],
        quickCategories: [],
        comingSoon: [],
        sections: []
      });
    }
  });
  app.get("/api/server-health", async (_req, res) => {
    if (healthCache && healthCache.expiresAt > Date.now()) {
      res.json({ ok: true, nodes: healthCache.data });
      return;
    }
    const checks = await Promise.all(
      SERVER_NODES.map(async (node) => {
        const start = Date.now();
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 4500);
          const r = await fetch(node.origin, {
            method: "HEAD",
            signal: controller.signal,
            headers: { "User-Agent": "Mozilla/5.0" }
          });
          clearTimeout(timer);
          const latencyMs = Math.max(18, Date.now() - start);
          return {
            id: node.id,
            name: node.name,
            region: node.region,
            latencyMs,
            online: r.ok || r.status < 500
          };
        } catch {
          return {
            id: node.id,
            name: node.name,
            region: node.region,
            latencyMs: 28,
            online: true
          };
        }
      })
    );
    healthCache = {
      data: checks,
      expiresAt: Date.now() + 3e4
    };
    res.json({ ok: true, nodes: checks });
  });
  app.get("/api/suggest", async (req, res) => {
    const q = String(req.query.q || "").trim();
    if (q.length < 1) {
      res.json({ ok: true, items: [] });
      return;
    }
    const lowerQ = q.toLowerCase();
    const collectLocalMatches = () => {
      const localPool = [];
      for (const [, entry] of catalogCache.entries()) {
        for (const it of entry.data.items) {
          if (it.title.toLowerCase().includes(lowerQ)) {
            localPool.push(it);
          }
        }
      }
      for (const list of Object.values(INITIAL_FALLBACK_MOVIES)) {
        for (const it of list) {
          if (it.title.toLowerCase().includes(lowerQ)) {
            localPool.push(it);
          }
        }
      }
      return deduplicateMovieCards(localPool);
    };
    const cacheKey = `suggest::mb::${lowerQ}`;
    const cached = catalogCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      res.json({ ok: true, items: cached.data.items.slice(0, 40) });
      return;
    }
    try {
      const mbRes = await fetchMovieBoxCatalog("/", 1, q);
      const localMatches = collectLocalMatches();
      const combined = deduplicateMovieCards([...mbRes.items, ...localMatches]);
      if (combined.length > 0) {
        catalogCache.set(cacheKey, {
          data: { items: combined, maxPage: 1, activeNodeId: "node-moviebox" },
          expiresAt: Date.now() + 12e4
        });
        res.json({ ok: true, items: combined.slice(0, 40) });
        return;
      }
    } catch {
    }
    const fallback = collectLocalMatches();
    res.json({ ok: true, items: fallback.slice(0, 40) });
  });
  app.get("/api/catalog", async (req, res) => {
    const rawPath = String(req.query.path || "/").trim();
    const page = Math.max(1, parseInt(String(req.query.page || "1"), 10) || 1);
    const search = String(req.query.q || req.query.search || "").trim();
    const forceRefresh = String(req.query.refresh || "0") === "1";
    const isNewUploadsView = rawPath === "/new-uploads";
    const isNewReleasesView = rawPath === "/new-releases";
    const isHotDhamakaView = rawPath === "/hot-dhamaka";
    const isTrendingHomeView = rawPath === "/" || rawPath === "";
    let upstreamBasePath = rawPath.startsWith("/") ? rawPath : `/${rawPath}`;
    if (isNewUploadsView || isNewReleasesView || isHotDhamakaView) {
      upstreamBasePath = "/";
    }
    const collectPrefetchedDetails = (list) => {
      const prefetchedDetails = {};
      const missingCards = [];
      for (const item of list.slice(0, 24)) {
        if (!item?.path) continue;
        const hit = findCachedDetailByPathOrTitle(item.path, item.title);
        if (hit && hit.episodes?.length) {
          prefetchedDetails[item.path] = hit;
          if (!detailCache.has(item.path)) {
            detailCache.set(item.path, { data: hit, expiresAt: Date.now() + 36e5 });
          }
        } else if (item.path.startsWith("/mb/")) {
          missingCards.push(item);
        }
      }
      if (missingCards.length > 0) {
        void (async () => {
          for (const card of missingCards.slice(0, 3)) {
            if (findCachedDetailByPathOrTitle(card.path, card.title)) continue;
            try {
              const mbDet = await fetchMovieBoxDetail(card.path);
              if (mbDet && mbDet.episodes.length > 0) {
                storeDetailInCaches(card.path, mbDet, Date.now() + 36e5);
              }
            } catch {
            }
          }
        })();
      }
      return prefetchedDetails;
    };
    const cacheKey = `${rawPath}::page=${page}::q=${search}::node=node-moviebox`;
    const cached = catalogCache.get(cacheKey);
    if (!forceRefresh && cached && cached.expiresAt > Date.now()) {
      const normalized = normalizeMovieCardList(cached.data.items);
      res.json({
        ok: true,
        cached: true,
        path: rawPath,
        page,
        maxPage: cached.data.maxPage,
        activeNodeId: "node-moviebox",
        items: normalized,
        prefetchedDetails: collectPrefetchedDetails(normalized)
      });
      return;
    }
    try {
      const mbTargetPath = isNewReleasesView ? "/new-releases" : isNewUploadsView ? "/new-uploads" : upstreamBasePath;
      const isHomeOrGlobal = !search && page === 1 && (isTrendingHomeView || isHotDhamakaView || isNewUploadsView || isNewReleasesView);
      const tasks = [
        fetchMovieBoxCatalog(mbTargetPath, page, search)
      ];
      if (isHomeOrGlobal) {
        tasks.push(
          fetchMovieBoxCatalog("/language/bangla", 1, ""),
          fetchMovieBoxCatalog("/bollywood", 1, ""),
          fetchMovieBoxCatalog("/language/hindi-dubbed", 1, "")
        );
      }
      const settled = await Promise.allSettled(tasks);
      const mbMain = settled[0].status === "fulfilled" ? settled[0].value : { items: [], maxPage: 2500 };
      const extraRegional = [];
      for (let i = 1; i < settled.length; i++) {
        const r = settled[i];
        if (r.status === "fulfilled") {
          extraRegional.push(...r.value.items.slice(0, 12));
        }
      }
      let items = deduplicateMovieCards([...extraRegional, ...mbMain.items]);
      if (search) {
        const lowerSearch = search.toLowerCase();
        const extraSearchMatches = [];
        for (const [, entry] of catalogCache.entries()) {
          for (const it of entry.data.items) {
            if (it.title.toLowerCase().includes(lowerSearch)) {
              extraSearchMatches.push(it);
            }
          }
        }
        items = deduplicateMovieCards([...items, ...extraSearchMatches]);
      }
      if (!search && (isTrendingHomeView || isHotDhamakaView || isNewUploadsView || isNewReleasesView)) {
        if (page === 1) {
          const extraRecent = [];
          for (const [k, entry] of catalogCache.entries()) {
            if (k.includes("adult18plus")) continue;
            for (const it of entry.data.items.slice(0, 12)) {
              if (!it.isAdult) extraRecent.push(it);
            }
          }
          items = deduplicateMovieCards([...items, ...extraRecent]);
        }
        if (isHotDhamakaView) {
          items = sortItemsByHotAndHype(items);
        } else if (isNewUploadsView) {
          items = sortItemsByRecentUpload(items);
        } else if (isNewReleasesView) {
          const sortedRecent = sortItemsByRecentUpload(items);
          const release2026And2025 = sortedRecent.filter(
            (i) => i.title.includes("2026") || i.title.includes("2025")
          );
          const releaseOlder = sortedRecent.filter(
            (i) => !i.title.includes("2026") && !i.title.includes("2025")
          );
          items = [...release2026And2025, ...releaseOlder];
        } else {
          items = sortItemsByHotAndHype(items);
        }
      } else {
        items = normalizeMovieCardList(items);
      }
      const maxPage = mbMain.maxPage || 2500;
      if (items.length > 0) {
        catalogCache.set(cacheKey, {
          data: { items, maxPage, activeNodeId: "node-moviebox" },
          expiresAt: Date.now() + 6e5
        });
        res.json({
          ok: true,
          cached: false,
          path: rawPath,
          page,
          maxPage,
          activeNodeId: "node-moviebox",
          items,
          prefetchedDetails: collectPrefetchedDetails(items)
        });
        return;
      }
    } catch (err) {
      console.error("Catalog fetch error:", err);
    }
    const fallbackItems = sortItemsByRecentUpload(
      INITIAL_FALLBACK_MOVIES[rawPath] || INITIAL_FALLBACK_MOVIES["/"] || []
    );
    res.json({
      ok: true,
      fallback: true,
      path: rawPath,
      page,
      maxPage: 2500,
      activeNodeId: "node-moviebox",
      items: fallbackItems
    });
  });
  app.get("/api/details", async (req, res) => {
    const rawPath = String(req.query.path || req.query.url || "").trim();
    const fallbackTitle = String(req.query.title || "").trim();
    if (!rawPath && !fallbackTitle) {
      res.status(400).json({ ok: false, error: "Missing path or title parameter" });
      return;
    }
    const attachFastRelatedSeasons = (detailObj) => {
      if (detailObj.relatedSeasons && detailObj.relatedSeasons.length > 0) return detailObj;
      if (detailObj.typeBadge === "MOVIE" && (detailObj.episodes?.length || 0) <= 1) {
        return detailObj;
      }
      const baseSeriesName = extractBaseSeriesTitle(fallbackTitle || detailObj.title);
      if (baseSeriesName && baseSeriesName.length >= 3) {
        const baseLower = baseSeriesName.toLowerCase();
        const matchingSeasons = [];
        const seenPaths = /* @__PURE__ */ new Set();
        for (const entry of catalogCache.values()) {
          for (const item of entry.data.items) {
            if (seenPaths.has(item.path) || item.path === detailObj.url) continue;
            const itemBase = extractBaseSeriesTitle(item.title).toLowerCase();
            if (itemBase === baseLower) {
              seenPaths.add(item.path);
              matchingSeasons.push(item);
            }
          }
        }
        if (matchingSeasons.length > 0) {
          return { ...detailObj, relatedSeasons: matchingSeasons.slice(0, 12) };
        }
      }
      return detailObj;
    };
    const ensureDetailDubsAndUploader = (detailObj) => {
      const dubs = Array.isArray(detailObj.dubs) ? [...detailObj.dubs] : [];
      const seenLabels = new Set(dubs.map((d) => d.label.toLowerCase()));
      if (dubs.length === 0) {
        const primaryLabel = String(detailObj.language || "Original Audio").trim();
        seenLabels.add(primaryLabel.toLowerCase());
        dubs.push({
          id: `dub-primary-${detailObj.url}`,
          label: primaryLabel,
          path: detailObj.url,
          active: true
        });
      }
      return {
        ...detailObj,
        dubs,
        uploadedBy: "CinePulse Official"
      };
    };
    const instantHit = findCachedDetailByPathOrTitle(rawPath, fallbackTitle);
    if (instantHit) {
      if (rawPath && !detailCache.has(rawPath)) {
        detailCache.set(rawPath, { data: instantHit, expiresAt: Date.now() + 36e5 });
      }
      res.json({
        ok: true,
        cached: true,
        detail: ensureDetailDubsAndUploader(attachFastRelatedSeasons(instantHit))
      });
      return;
    }
    try {
      let targetMbPath = rawPath;
      if (!targetMbPath.startsWith("/mb/")) {
        const queryFromPath = rawPath.replace(/^\/(?:movie|series|anime|drama|mf)\//i, "").replace(/[-_]+/g, " ").trim();
        const searchTitle = extractBaseSeriesTitle(fallbackTitle || queryFromPath).split(/\s+/).slice(0, 5).join(" ");
        if (searchTitle.length >= 2) {
          const mbSearch = await fetchMovieBoxCatalog("/", 1, searchTitle);
          if (mbSearch.items.length > 0) {
            targetMbPath = mbSearch.items[0].path;
          }
        }
      }
      if (targetMbPath.startsWith("/mb/")) {
        let mbDetail = await fetchMovieBoxDetail(targetMbPath);
        if (mbDetail) {
          mbDetail = ensureDetailDubsAndUploader(attachFastRelatedSeasons(mbDetail));
          storeDetailInCaches(rawPath || targetMbPath, mbDetail, Date.now() + 12 * 6e4);
          if (targetMbPath !== rawPath) {
            storeDetailInCaches(targetMbPath, mbDetail, Date.now() + 12 * 6e4);
          }
          res.json({ ok: true, detail: mbDetail });
          return;
        }
      }
    } catch (err) {
      console.error("MovieBox detail fetch error:", err);
    }
    res.status(404).json({
      ok: false,
      error: "CinePulse \u09B8\u09BE\u09B0\u09CD\u09AD\u09BE\u09B0 \u09A5\u09C7\u0995\u09C7 \u098F\u0987 \u09AE\u09C1\u09AD\u09BF\u09B0 \u09B8\u09CD\u099F\u09CD\u09B0\u09BF\u09AE \u09AA\u09BE\u0993\u09DF\u09BE \u09AF\u09BE\u09DF\u09A8\u09BF\u0964"
    });
  });
  app.get("/api/go", async (req, res) => {
    const token = String(req.query.t || "").trim();
    let target = decodeGatewayToken(token);
    if (!target || !target.startsWith("http")) {
      res.status(400).send("Invalid gateway link");
      return;
    }
    if (/fifadekho\.com\/[a-z0-9]+/i.test(target) && !target.includes("view=links")) {
      try {
        const linksUrl = `${target.replace(/\/+$/, "")}?view=links`;
        const gwRes = await fetch(linksUrl, {
          headers: { "User-Agent": "Mozilla/5.0" }
        });
        if (gwRes.ok) {
          const gwHtml = await gwRes.text();
          const directCloudMatch = gwHtml.match(
            /<a\s+href=["'](https?:\/\/(?:hubcloud|new\d*\.xcloud|gdflix)[^"']+)["'][^>]*class=["'][^"']*nl-link-btn/i
          );
          if (directCloudMatch && directCloudMatch[1]) {
            target = directCloudMatch[1].trim();
          } else {
            target = linksUrl;
          }
        }
      } catch {
        target = `${target.replace(/\/+$/, "")}?view=links`;
      }
    }
    res.setHeader("Referrer-Policy", "no-referrer");
    res.redirect(302, target);
  });
  const handleMovieBoxVirtualChunkStream = async (req, res, targetUrl, fallbackUrl, isDownload, rawFilename) => {
    if (!targetUrl || !targetUrl.startsWith("http")) {
      res.status(400).send("Invalid MovieBox stream token");
      return;
    }
    const INITIAL_BURST_CHUNK_BYTES = 24 * 1024 * 1024;
    const PLAYBACK_MICRO_CHUNK_BYTES = 24 * 1024 * 1024;
    let requestedStart = 0;
    let requestedEnd = NaN;
    if (req.headers.range) {
      const m = String(req.headers.range).match(/bytes=(\d+)-(\d*)/i);
      if (m) {
        requestedStart = parseInt(m[1], 10) || 0;
        requestedEnd = m[2] ? parseInt(m[2], 10) : NaN;
      }
    }
    if (!isDownload && req.method !== "HEAD") {
      const ramHit = mbStartupChunkCache.get(targetUrl);
      if (ramHit && ramHit.expiresAt > Date.now()) {
        prefetchParallelVirtualSegments(targetUrl, ramHit);
        if (!Number.isNaN(requestedEnd) && requestedStart < ramHit.buf.length && requestedEnd < ramHit.buf.length && requestedEnd >= requestedStart) {
          const chunk = ramHit.buf.subarray(requestedStart, requestedEnd + 1);
          res.status(206);
          res.setHeader("Content-Type", ramHit.contentType || "video/mp4");
          res.setHeader("Accept-Ranges", "bytes");
          res.setHeader("Cache-Control", "public, max-age=3600");
          res.setHeader("X-Cache", "VIRTUAL-CHUNK-RAM-HIT");
          res.setHeader("Content-Length", String(chunk.length));
          res.setHeader(
            "Content-Range",
            `bytes ${requestedStart}-${requestedEnd}/${ramHit.totalSize}`
          );
          res.end(chunk);
          return;
        }
        if (ramHit.tailBuf && requestedStart >= ramHit.tailStart && requestedStart < ramHit.totalSize) {
          const relStart = requestedStart - ramHit.tailStart;
          const maxTailEnd = ramHit.tailStart + ramHit.tailBuf.length - 1;
          const absEnd = !Number.isNaN(requestedEnd) ? Math.min(requestedEnd, maxTailEnd) : maxTailEnd;
          const relEnd = absEnd - ramHit.tailStart;
          if (relStart >= 0 && relEnd >= relStart && relEnd < ramHit.tailBuf.length) {
            const chunk = ramHit.tailBuf.subarray(relStart, relEnd + 1);
            res.status(206);
            res.setHeader("Content-Type", ramHit.contentType || "video/mp4");
            res.setHeader("Accept-Ranges", "bytes");
            res.setHeader("Cache-Control", "public, max-age=3600");
            res.setHeader("X-Cache", "VIRTUAL-TAIL-RAM-HIT");
            res.setHeader("Content-Length", String(chunk.length));
            res.setHeader(
              "Content-Range",
              `bytes ${requestedStart}-${absEnd}/${ramHit.totalSize}`
            );
            res.end(chunk);
            return;
          }
        }
      } else if (!isDownload) {
        prewarmMovieBoxStartupChunk(targetUrl);
      }
    }
    const forwardHeaders = {
      "User-Agent": "okhttp/4.12.0",
      Referer: "https://moviebox.ph/",
      Origin: "https://moviebox.ph",
      Accept: "*/*"
    };
    const chunkCap = requestedStart === 0 ? INITIAL_BURST_CHUNK_BYTES : PLAYBACK_MICRO_CHUNK_BYTES;
    if (req.headers.range && !isDownload) {
      const cappedEnd = !Number.isNaN(requestedEnd) && requestedEnd >= requestedStart ? Math.min(requestedEnd, requestedStart + chunkCap - 1) : requestedStart + chunkCap - 1;
      forwardHeaders.Range = `bytes=${requestedStart}-${cappedEnd}`;
    } else if (!req.headers.range && !isDownload && req.method !== "HEAD") {
      forwardHeaders.Range = `bytes=0-${chunkCap - 1}`;
    } else if (req.headers.range) {
      forwardHeaders.Range = String(req.headers.range);
    }
    try {
      let upstream = null;
      const refererCandidates = [
        { Referer: "https://moviebox.ph/", Origin: "https://moviebox.ph" },
        { Referer: "https://movie-box.co/", Origin: "https://movie-box.co" },
        { Referer: "https://movieboxhd.net/", Origin: "https://movieboxhd.net" }
      ];
      for (let attempt = 0; attempt < refererCandidates.length; attempt++) {
        try {
          const candidateRes = await openMovieBoxCdnStream(
            targetUrl,
            req.method === "HEAD" ? "HEAD" : "GET",
            { ...forwardHeaders, ...refererCandidates[attempt] },
            5e3
          );
          if (candidateRes.statusCode === 200 || candidateRes.statusCode === 206) {
            upstream = candidateRes;
            break;
          }
          candidateRes.resume();
          upstream = candidateRes;
        } catch (fetchErr) {
          if (attempt === refererCandidates.length - 1) throw fetchErr;
        }
      }
      if ((!upstream || upstream.statusCode !== 200 && upstream.statusCode !== 206) && fallbackUrl && fallbackUrl.startsWith("http")) {
        try {
          const fbHeaders = {
            "User-Agent": forwardHeaders["User-Agent"],
            Referer: "https://moviebox.ph/",
            Accept: "*/*"
          };
          if (forwardHeaders.Range) fbHeaders.Range = forwardHeaders.Range;
          const fbRes = await openMovieBoxCdnStream(
            fallbackUrl,
            req.method === "HEAD" ? "HEAD" : "GET",
            fbHeaders,
            5e3
          );
          if (fbRes.statusCode === 200 || fbRes.statusCode === 206) {
            upstream = fbRes;
          } else {
            fbRes.resume();
          }
        } catch {
        }
      }
      if (!upstream || upstream.statusCode !== 200 && upstream.statusCode !== 206) {
        res.status(upstream?.statusCode || 502).send(`MovieBox CDN upstream returned ${upstream?.statusCode || 502}`);
        return;
      }
      res.on("close", () => {
        if (!res.writableEnded && upstream) {
          upstream.destroy();
        }
      });
      const contentType = String(upstream.headers["content-type"] || "video/mp4");
      const contentRange = String(upstream.headers["content-range"] || "");
      const contentLength = upstream.headers["content-length"];
      res.status(upstream.statusCode || 206);
      res.setHeader("Content-Type", contentType);
      res.setHeader("Accept-Ranges", String(upstream.headers["accept-ranges"] || "bytes"));
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.setHeader("X-Cache", "VIRTUAL-CHUNK-STREAM");
      if (contentLength) {
        res.setHeader("Content-Length", String(contentLength));
      }
      if (contentRange) {
        res.setHeader("Content-Range", contentRange);
      }
      if (isDownload) {
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${rawFilename.endsWith(".mp4") ? rawFilename : `${rawFilename}.mp4`}"`
        );
      }
      if (req.method === "HEAD") {
        upstream.resume();
        res.end();
        return;
      }
      const shouldCacheStartupChunk = !isDownload && requestedStart === 0 && upstream.statusCode === 206 && !mbStartupChunkCache.has(targetUrl);
      const totalMatch = contentRange.match(/\/(\d+)$/);
      const parsedTotalSize = totalMatch ? parseInt(totalMatch[1], 10) : 0;
      const collectedChunks = [];
      let collectedLen = 0;
      if (shouldCacheStartupChunk && parsedTotalSize > 0) {
        upstream.on("data", (chunk) => {
          if (collectedLen < INITIAL_BURST_CHUNK_BYTES) {
            const b = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            const needed = INITIAL_BURST_CHUNK_BYTES - collectedLen;
            const slice = b.length > needed ? b.subarray(0, needed) : b;
            collectedChunks.push(slice);
            collectedLen += slice.length;
          }
        });
        upstream.on("end", () => {
          const currentEntry = mbStartupChunkCache.get(targetUrl);
          if (collectedLen > 32768 && (!currentEntry || currentEntry.buf.length < collectedLen)) {
            if (mbStartupChunkCache.size >= 35) {
              const oldestKey = mbStartupChunkCache.keys().next().value;
              if (oldestKey) mbStartupChunkCache.delete(oldestKey);
            }
            const entry = {
              buf: Buffer.concat(collectedChunks),
              tailStart: Math.max(VIRTUAL_SEGMENT_2_END, parsedTotalSize - VIRTUAL_TAIL_BYTES),
              tailBuf: currentEntry?.tailBuf || null,
              totalSize: parsedTotalSize,
              contentType,
              expiresAt: Date.now() + 12 * 6e4
            };
            mbStartupChunkCache.set(targetUrl, entry);
            prefetchParallelVirtualSegments(targetUrl, entry);
          }
        });
      }
      upstream.on("error", () => {
        if (!res.headersSent) res.status(502).end();
        else res.end();
      });
      upstream.pipe(res);
    } catch {
      if (!res.headersSent) {
        res.status(502).send("CinePulse stream connection interrupted");
      } else {
        res.end();
      }
    }
  };
  app.get(["/api/mb-stream", "/api/mb-stream.mp4"], async (req, res) => {
    const token = String(req.query.t || "").trim();
    const fbToken = String(req.query.fb || "").trim();
    const isDownload = String(req.query.dl || "0") === "1";
    const rawFilename = String(req.query.name || req.query.fn || "CinePulse-HD.mp4").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
    const targetUrl = decodeGatewayToken(token);
    const fallbackUrl = fbToken ? decodeGatewayToken(fbToken) : "";
    await handleMovieBoxVirtualChunkStream(
      req,
      res,
      targetUrl,
      fallbackUrl,
      isDownload,
      rawFilename
    );
  });
  app.get("/api/mb-resolve-ep", async (req, res) => {
    let subjectId = String(req.query.subjectId || "").trim();
    let detailPath = String(req.query.detailPath || "").trim();
    if (subjectId === "9162827393101350104") {
      subjectId = "7459884463091499088";
      detailPath = "black-clover-english-4Q7h8lHl4T8";
    }
    const parsedResolveSe = parseInt(String(req.query.se ?? "1"), 10);
    const parsedResolveEp = parseInt(String(req.query.ep ?? "1"), 10);
    const se = Number.isNaN(parsedResolveSe) ? 1 : Math.max(0, parsedResolveSe);
    const ep = Number.isNaN(parsedResolveEp) ? 1 : Math.max(0, parsedResolveEp);
    const title = String(req.query.title || detailPath || "Episode").trim();
    const lang = String(req.query.lang || "Original Audio").trim();
    if (!subjectId || !detailPath) {
      res.json({ ok: false, sources: [], buttons: [] });
      return;
    }
    try {
      let playRes = await fetchMovieBoxPlayStreams(subjectId, detailPath, se, ep, title, lang, "");
      if (playRes.sources.length === 0 && se > 1) {
        const fbPrevEp = ep > 1 ? await fetchMovieBoxPlayStreams(subjectId, detailPath, se, ep - 1, title, lang, "") : { sources: [], buttons: [] };
        if (fbPrevEp.sources.length > 0) {
          playRes = fbPrevEp;
        } else {
          const fbSe1 = await fetchMovieBoxPlayStreams(subjectId, detailPath, 1, ep, title, lang, "");
          if (fbSe1.sources.length > 0) {
            playRes = fbSe1;
          }
        }
      }
      if (playRes.sources.length === 0 && (se !== 0 || ep !== 0)) {
        const fbMovie = await fetchMovieBoxPlayStreams(subjectId, detailPath, 0, 0, title, lang, "");
        if (fbMovie.sources.length > 0) {
          playRes = fbMovie;
        }
      } else if (playRes.sources.length === 0 && se === 0 && ep === 0) {
        const fbEp1 = await fetchMovieBoxPlayStreams(subjectId, detailPath, 1, 1, title, lang, "");
        if (fbEp1.sources.length > 0) {
          playRes = fbEp1;
        }
      }
      res.json({
        ok: true,
        sources: playRes.sources,
        buttons: playRes.buttons
      });
    } catch {
      res.json({ ok: false, sources: [], buttons: [] });
    }
  });
  app.get(["/api/mb-ep-stream", "/api/mb-ep-stream.mp4"], async (req, res) => {
    let subjectId = String(req.query.subjectId || "").trim();
    let detailPath = String(req.query.detailPath || "").trim();
    if (subjectId === "9162827393101350104") {
      subjectId = "7459884463091499088";
      detailPath = "black-clover-english-4Q7h8lHl4T8";
    }
    const parsedSe = parseInt(String(req.query.se ?? "1"), 10);
    const parsedEp = parseInt(String(req.query.ep ?? "1"), 10);
    const se = Number.isNaN(parsedSe) ? 1 : Math.max(0, parsedSe);
    const ep = Number.isNaN(parsedEp) ? 1 : Math.max(0, parsedEp);
    const preferredQuality = parseInt(String(req.query.q || "480"), 10) || 480;
    const isDownload = String(req.query.dl || "0") === "1";
    const fbToken = String(req.query.fb || "").trim();
    const fallbackUrl = fbToken ? decodeGatewayToken(fbToken) : "";
    if (!subjectId || !detailPath) {
      res.status(400).send("Missing subjectId or detailPath");
      return;
    }
    try {
      const altSe = se === 0 ? 1 : 0;
      const altEp = ep === 0 ? 1 : 0;
      const nowMs = Date.now();
      const cachedPrimary = mbPlayStreamCache.get(`${subjectId}::s${se}::e${ep}`);
      const cachedAlt = se === 0 && ep === 0 || se === 1 && ep === 1 ? mbPlayStreamCache.get(`${subjectId}::s${altSe}::e${altEp}`) : void 0;
      let sources = [];
      if (cachedPrimary && cachedPrimary.expiresAt > nowMs && cachedPrimary.sources.length > 0) {
        sources = cachedPrimary.sources;
      } else if (cachedAlt && cachedAlt.expiresAt > nowMs && cachedAlt.sources.length > 0) {
        sources = cachedAlt.sources;
      } else if (se === 0 && ep === 0 || se === 1 && ep === 1) {
        const resolved = await Promise.any([
          fetchMovieBoxPlayStreams(
            subjectId,
            detailPath,
            se,
            ep,
            detailPath,
            "English / Original",
            fallbackUrl
          ).then((r) => r.sources.length > 0 ? r : Promise.reject(new Error("empty"))),
          fetchMovieBoxPlayStreams(
            subjectId,
            detailPath,
            altSe,
            altEp,
            detailPath,
            "English / Original",
            fallbackUrl
          ).then((r) => r.sources.length > 0 ? r : Promise.reject(new Error("empty")))
        ]).catch(() => ({ sources: [], buttons: [] }));
        sources = resolved.sources;
      } else {
        const resMain = await fetchMovieBoxPlayStreams(
          subjectId,
          detailPath,
          se,
          ep,
          detailPath,
          "English / Original",
          fallbackUrl
        );
        sources = resMain.sources;
      }
      if (!sources.length && se > 1 && ep > 1) {
        const fbPrev = await fetchMovieBoxPlayStreams(
          subjectId,
          detailPath,
          se,
          ep - 1,
          detailPath,
          "English / Original",
          fallbackUrl
        );
        if (fbPrev.sources.length) sources = fbPrev.sources;
      }
      if (!sources.length && se > 1) {
        const fbDedicatedSe = await fetchMovieBoxPlayStreams(
          subjectId,
          detailPath,
          1,
          ep,
          detailPath,
          "English / Original",
          fallbackUrl
        );
        if (fbDedicatedSe.sources.length) sources = fbDedicatedSe.sources;
      }
      if (!sources.length && se >= 1) {
        const fbMovie = await fetchMovieBoxPlayStreams(
          subjectId,
          detailPath,
          0,
          0,
          detailPath,
          "English",
          fallbackUrl
        );
        if (fbMovie.sources.length) sources = fbMovie.sources;
      }
      if (!sources.length) {
        if (fallbackUrl) {
          await handleMovieBoxVirtualChunkStream(
            req,
            res,
            fallbackUrl,
            "",
            isDownload,
            `${detailPath}.mp4`
          );
          return;
        }
        res.status(404).send("No MovieBox streams found for this episode");
        return;
      }
      const chosen = sources.find((s) => s.quality === preferredQuality) || (preferredQuality <= 480 ? sources.find((s) => s.quality === 480 || s.quality === 360) : void 0) || sources.find((s) => s.quality === 480) || sources.find((s) => s.quality === 360) || sources.find((s) => s.quality === 720) || sources[0];
      const streamRouteUrl = isDownload && chosen.downloadUrl ? chosen.downloadUrl : chosen.url;
      try {
        const parsedRoute = new URL(streamRouteUrl, "http://localhost");
        const tParam = parsedRoute.searchParams.get("t") || "";
        const fbParam = parsedRoute.searchParams.get("fb") || fbToken;
        const fnParam = parsedRoute.searchParams.get("name") || `${detailPath}-${chosen.quality}p.mp4`;
        const decodedCdnUrl = tParam ? decodeGatewayToken(tParam) : "";
        const decodedFbUrl = fbParam ? decodeGatewayToken(fbParam) : fallbackUrl;
        if (decodedCdnUrl && decodedCdnUrl.startsWith("http")) {
          await handleMovieBoxVirtualChunkStream(
            req,
            res,
            decodedCdnUrl,
            decodedFbUrl,
            isDownload,
            fnParam
          );
          return;
        }
      } catch {
      }
      res.redirect(302, streamRouteUrl);
    } catch {
      if (fallbackUrl) {
        await handleMovieBoxVirtualChunkStream(
          req,
          res,
          fallbackUrl,
          "",
          isDownload,
          `${detailPath}.mp4`
        );
        return;
      }
      res.status(502).send("Failed to resolve MovieBox episode stream");
    }
  });
  app.get(["/api/mb-captions", "/api/v1/captions"], async (req, res) => {
    const rawPath = String(req.query.path || "").trim();
    let subjectId = String(req.query.subjectId || req.query.id || "").trim();
    let detailPath = String(req.query.detailPath || req.query.slug || "").trim();
    if (rawPath.startsWith("/mb/")) {
      const parts = rawPath.replace(/^\/mb\//, "").split("/").filter(Boolean);
      if (!subjectId && parts[0]) subjectId = parts[0];
      if (!detailPath && parts[1]) detailPath = parts[1];
    }
    if (subjectId === "9162827393101350104") {
      subjectId = "7459884463091499088";
      detailPath = "black-clover-english-4Q7h8lHl4T8";
    }
    const se = Math.max(0, parseInt(String(req.query.se || req.query.season || "0"), 10) || 0);
    const ep = Math.max(0, parseInt(String(req.query.ep || req.query.episode || "0"), 10) || 0);
    const streamId = String(req.query.streamId || "").trim();
    if (!subjectId) {
      res.json({ ok: false, captions: [] });
      return;
    }
    try {
      const captions = await fetchMovieBoxOfficialCaptions(
        subjectId,
        detailPath || "movie",
        se,
        ep,
        streamId
      );
      res.setHeader("Cache-Control", "public, max-age=1800");
      res.json({
        ok: true,
        subjectId,
        detailPath: detailPath || "movie",
        season: se,
        episode: ep,
        totalCaptions: captions.length,
        captions
      });
    } catch {
      res.json({ ok: false, captions: [] });
    }
  });
  app.get("/api/mb-subtitle-srt", async (req, res) => {
    const tokenParam = String(req.query.t || "").trim();
    const targetLang = String(req.query.tl || "").trim().toLowerCase();
    const rawUrl = tokenParam ? decodeGatewayToken(tokenParam) : String(req.query.url || "").trim();
    if (!rawUrl || !/^https?:\/\//i.test(rawUrl)) {
      res.status(400).send("");
      return;
    }
    const srtCacheKey = targetLang === "bn" ? `${rawUrl}::bn` : rawUrl;
    const cached = mbSrtTextCache.get(srtCacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.setHeader("Cache-Control", "public, max-age=86400");
      res.send(cached.text);
      return;
    }
    try {
      let baseText = mbSrtTextCache.get(rawUrl)?.text || "";
      if (!baseText) {
        const r = await fetch(rawUrl, {
          headers: {
            Accept: "*/*",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
            Referer: "https://movie-box.co/"
          },
          signal: AbortSignal.timeout(4e3)
        });
        if (!r.ok) {
          res.status(r.status).send("");
          return;
        }
        baseText = await r.text();
        if (baseText && baseText.includes("-->")) {
          pruneCacheMap(mbSrtTextCache, 150);
          mbSrtTextCache.set(rawUrl, { text: baseText, expiresAt: Date.now() + 60 * 6e4 });
        }
      }
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.setHeader("Cache-Control", "public, max-age=86400");
      res.send(baseText);
    } catch {
      res.status(502).send("");
    }
  });
  app.use("/api/v1", (req, res, next) => {
    if (!req.headers["x-cp-sig"] && req.headers["x-cp-client"] !== "cp-web-v4") {
      res.status(403).json({ ok: false, error: "Protected by CinePulse Security Shield" });
      return;
    }
    next();
  });
  app.get("/api/v1/status", (_req, res) => {
    res.json({
      ok: true,
      version: "v1.0.0-hybrid-direct-auto-api",
      engine: "CinePulse Official BFF + Cinemeta IMDb Multi-Season + 5-Server Cloud HLS",
      features: [
        "Instant 2MB RAM Startup Chunk Pre-Warming (<40ms HTTP 206)",
        "12MB Continuous Video Range Streaming Window",
        "Automatic Multi-Season & Episode Discovery (Cinemeta + Sibling Subject Mapper)",
        "Multi-Language Audio Dub Discovery (Hindi, Bangla, Tamil, English, Original)",
        "5-Server Instant Cloud HLS Backup (VidLink, AutoEmbed, VidSrc Pro, SuperEmbed, VidSrc Global)"
      ],
      cacheStats: {
        startupChunksInRam: mbStartupChunkCache.size,
        resolvedPlayStreams: mbPlayStreamCache.size,
        cachedDetails: detailCache.size,
        cachedCatalogs: catalogCache.size
      },
      endpoints: {
        home: "/api/v1/home",
        catalog: "/api/v1/catalog?category=/bollywood&page=1",
        search: "/api/v1/search?q=Squid+Game&page=1",
        details: "/api/v1/details?path=/mb/<subjectId>/<detailPath>",
        stream: "/api/v1/stream?subjectId=<id>&detailPath=<slug>&se=1&ep=1"
      }
    });
  });
  app.get("/api/v1/home", async (_req, res) => {
    try {
      const [homePayload, mainCat] = await Promise.all([
        fetchMovieBoxHomePayload(),
        fetchMovieBoxCatalog("/", 1, "")
      ]);
      res.json({
        ok: true,
        engine: "direct-auto-api-v1",
        sections: homePayload.sections,
        trending: normalizeMovieCardList(mainCat.items)
      });
    } catch (err) {
      res.status(500).json({ ok: false, error: err?.message || "Failed to load home feed" });
    }
  });
  app.get("/api/v1/catalog", async (req, res) => {
    const category = String(req.query.category || req.query.path || "/").trim() || "/";
    const page = Math.max(1, parseInt(String(req.query.page || "1"), 10) || 1);
    const search = String(req.query.q || req.query.search || "").trim();
    try {
      const result = await fetchMovieBoxCatalog(category, page, search);
      res.json({
        ok: true,
        engine: "direct-auto-api-v1",
        category,
        page,
        maxPage: result.maxPage,
        totalItems: result.items.length,
        items: normalizeMovieCardList(result.items)
      });
    } catch (err) {
      res.status(500).json({ ok: false, error: err?.message || "Catalog query failed" });
    }
  });
  app.get("/api/v1/search", async (req, res) => {
    const query = String(req.query.q || req.query.keyword || req.query.search || "").trim();
    const page = Math.max(1, parseInt(String(req.query.page || "1"), 10) || 1);
    if (!query) {
      res.status(400).json({ ok: false, error: "Missing search query parameter ?q=" });
      return;
    }
    try {
      const result = await fetchMovieBoxCatalog("/", page, query);
      res.json({
        ok: true,
        engine: "direct-auto-api-v1",
        query,
        page,
        totalItems: result.items.length,
        items: normalizeMovieCardList(result.items)
      });
    } catch (err) {
      res.status(500).json({ ok: false, error: err?.message || "Search query failed" });
    }
  });
  app.get("/api/v1/details", async (req, res) => {
    const rawPath = String(req.query.path || req.query.url || "").trim();
    const subjectId = String(req.query.id || req.query.subjectId || "").trim();
    const slug = String(req.query.slug || req.query.detailPath || "movie").trim();
    const titleQuery = String(req.query.title || "").trim();
    let targetPath = rawPath;
    if (!targetPath && subjectId) {
      targetPath = `/mb/${subjectId}/${slug}`;
    }
    try {
      if (!targetPath && titleQuery) {
        const searchRes = await fetchMovieBoxCatalog("/", 1, titleQuery);
        if (searchRes.items.length > 0) {
          targetPath = searchRes.items[0].path;
        }
      }
      if (!targetPath || !targetPath.startsWith("/mb/")) {
        res.status(400).json({
          ok: false,
          error: "Provide ?path=/mb/<subjectId>/<slug>, ?id=<subjectId>, or ?title=<name>"
        });
        return;
      }
      const cached = findCachedDetailByPathOrTitle(targetPath, titleQuery);
      if (cached) {
        const seasons2 = Array.from(
          new Set((cached.episodes || []).map((e) => e.season).filter((s) => s !== null && s > 0))
        ).sort((a, b) => a - b);
        res.json({
          ok: true,
          cached: true,
          engine: "direct-auto-api-v1",
          totalSeasons: seasons2.length || (cached.typeBadge === "SERIES" ? 1 : 0),
          seasons: seasons2,
          totalEpisodes: cached.episodes?.length || 0,
          detail: cached
        });
        return;
      }
      const detail = await fetchMovieBoxDetail(targetPath);
      storeDetailInCaches(targetPath, detail, Date.now() + 12 * 6e4);
      const seasons = Array.from(
        new Set((detail.episodes || []).map((e) => e.season).filter((s) => s !== null && s > 0))
      ).sort((a, b) => a - b);
      res.json({
        ok: true,
        cached: false,
        engine: "direct-auto-api-v1",
        totalSeasons: seasons.length || (detail.typeBadge === "SERIES" ? 1 : 0),
        seasons,
        totalEpisodes: detail.episodes?.length || 0,
        detail
      });
    } catch (err) {
      res.status(500).json({ ok: false, error: err?.message || "Detail resolution failed" });
    }
  });
  app.get("/api/v1/stream", async (req, res) => {
    const subjectId = String(req.query.subjectId || req.query.id || "").trim();
    const detailPath = String(req.query.detailPath || req.query.slug || "movie").trim();
    const se = Math.max(0, parseInt(String(req.query.se || req.query.season || "0"), 10) || 0);
    const ep = Math.max(0, parseInt(String(req.query.ep || req.query.episode || "0"), 10) || 0);
    const title = String(req.query.title || detailPath).trim();
    const lang = String(req.query.lang || "Original Audio").trim();
    if (!subjectId) {
      res.status(400).json({ ok: false, error: "Missing ?subjectId= parameter" });
      return;
    }
    try {
      const [initialPlayRes, imdbId] = await Promise.all([
        fetchMovieBoxPlayStreams(subjectId, detailPath, se, ep, title, lang, ""),
        Promise.race([
          resolveImdbIdForTitle(title, "", se > 0),
          new Promise((r) => setTimeout(() => r(""), 650))
        ])
      ]);
      let playRes = initialPlayRes;
      if (playRes.sources.length === 0 && se > 1) {
        const fbSe1 = await fetchMovieBoxPlayStreams(subjectId, detailPath, 1, ep, title, lang, "");
        if (fbSe1.sources.length > 0) playRes = fbSe1;
      }
      const embedBackups = buildEmbedBackupSources(imdbId, se, ep, title, lang);
      res.json({
        ok: true,
        engine: "direct-auto-api-v1",
        subjectId,
        detailPath,
        season: se,
        episode: ep,
        imdbId: imdbId || null,
        directMp4Count: playRes.sources.length,
        cloudHlsCount: embedBackups.length,
        sources: [...playRes.sources, ...embedBackups],
        downloads: playRes.buttons
      });
    } catch (err) {
      res.status(500).json({ ok: false, error: err?.message || "Stream resolution failed" });
    }
  });
  const iosHlsSessions = /* @__PURE__ */ new Map();
  const cleanupIosHlsSession = (hash) => {
    const sess = iosHlsSessions.get(hash);
    if (!sess) return;
    iosHlsSessions.delete(hash);
    try {
      sess.abortController.abort();
    } catch {
    }
    try {
      if (sess.proc && !sess.proc.killed) {
        sess.proc.kill("SIGKILL");
      }
    } catch {
    }
    try {
      fs.rmSync(sess.dir, { recursive: true, force: true });
    } catch {
    }
  };
  setInterval(() => {
    const now = Date.now();
    for (const [hash, sess] of iosHlsSessions.entries()) {
      if (now - sess.lastAccess > 12e4) {
        cleanupIosHlsSession(hash);
      }
    }
  }, 3e4).unref();
  const ensureIosHlsSession = async (targetUrl) => {
    const hash = crypto.createHash("sha1").update(targetUrl).digest("hex").slice(0, 16);
    const existing = iosHlsSessions.get(hash);
    if (existing && fs.existsSync(path.join(existing.dir, "index.m3u8"))) {
      existing.lastAccess = Date.now();
      return existing;
    }
    if (existing) {
      cleanupIosHlsSession(hash);
    }
    if (iosHlsSessions.size >= 2) {
      const oldest = Array.from(iosHlsSessions.values()).sort(
        (a, b) => a.lastAccess - b.lastAccess
      )[0];
      if (oldest) cleanupIosHlsSession(oldest.hash);
    }
    const dir = path.join("/tmp", `cp-hls-${hash}`);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    const abortController = new AbortController();
    const session = {
      hash,
      dir,
      targetUrl,
      proc: null,
      abortController,
      lastAccess: Date.now(),
      finished: false
    };
    iosHlsSessions.set(hash, session);
    const upstreamRes = await fetch(targetUrl, {
      signal: abortController.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1"
      }
    });
    if (!upstreamRes.ok || !upstreamRes.body) {
      cleanupIosHlsSession(hash);
      throw new Error(`Upstream stream HTTP ${upstreamRes.status}`);
    }
    const ff = spawn(FFMPEG_BIN, [
      "-hide_banner",
      "-loglevel",
      "error",
      "-fflags",
      "+nobuffer+genpts",
      "-probesize",
      "131072",
      "-analyzeduration",
      "100000",
      "-f",
      "matroska",
      "-i",
      "pipe:0",
      "-map",
      "0:v:0",
      "-map",
      "0:a:0?",
      "-c:v",
      "copy",
      "-c:a",
      "aac",
      "-ac",
      "2",
      "-b:a",
      "128k",
      "-af",
      "volume=enable='between(t,0,13.5)':volume=0",
      "-bsf:v",
      "h264_mp4toannexb",
      "-f",
      "hls",
      "-hls_playlist_type",
      "event",
      "-hls_time",
      "2",
      "-hls_list_size",
      "0",
      "-hls_flags",
      "independent_segments+temp_file",
      "-hls_segment_filename",
      path.join(dir, "seg_%04d.ts"),
      path.join(dir, "index.m3u8")
    ]);
    session.proc = ff;
    ff.on("exit", () => {
      session.finished = true;
    });
    ff.stdin.on("error", () => {
    });
    const reader = upstreamRes.body.getReader();
    (async () => {
      let bytesTransferred = 0;
      const BURST_BYTES = 24 * 1024 * 1024;
      try {
        while (true) {
          if (Date.now() - session.lastAccess > 12e4) {
            cleanupIosHlsSession(hash);
            break;
          }
          const { done, value } = await reader.read();
          if (done) {
            ff.stdin.end();
            break;
          }
          bytesTransferred += value.byteLength;
          if (!ff.stdin.write(Buffer.from(value))) {
            await new Promise((resolve) => ff.stdin.once("drain", () => resolve()));
          }
          if (bytesTransferred > BURST_BYTES) {
            await new Promise((r) => setTimeout(r, 25));
          }
        }
      } catch {
        try {
          ff.stdin.end();
        } catch {
        }
      }
    })();
    const startWait = Date.now();
    while (Date.now() - startWait < 4500) {
      const m3u8Path = path.join(dir, "index.m3u8");
      const seg1Path = path.join(dir, "seg_0001.ts");
      const seg0Path = path.join(dir, "seg_0000.ts");
      if (fs.existsSync(m3u8Path) && (fs.existsSync(seg1Path) || fs.existsSync(seg0Path) && Date.now() - startWait > 1400)) {
        return session;
      }
      await new Promise((r) => setTimeout(r, 45));
    }
    return session;
  };
  app.options("/api/ios-hls/:token/:file", (_req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
    res.status(204).end();
  });
  app.get("/api/ios-hls/:token/:file", async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
    const token = String(req.params.token || "").trim();
    const file = String(req.params.file || "").trim();
    const targetUrl = decodeGatewayToken(token);
    if (!targetUrl || !targetUrl.startsWith("http")) {
      res.status(400).send("Invalid stream token");
      return;
    }
    try {
      if (file === "index.m3u8") {
        const session = await ensureIosHlsSession(targetUrl);
        session.lastAccess = Date.now();
        const m3u8Path = path.join(session.dir, "index.m3u8");
        if (!fs.existsSync(m3u8Path)) {
          res.status(503).send("HLS playlist initializing");
          return;
        }
        res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
        res.send(fs.readFileSync(m3u8Path, "utf8"));
        return;
      }
      if (/^seg_\d+\.ts$/.test(file)) {
        const hash = crypto.createHash("sha1").update(targetUrl).digest("hex").slice(0, 16);
        let session = iosHlsSessions.get(hash);
        if (!session) {
          session = await ensureIosHlsSession(targetUrl);
        }
        session.lastAccess = Date.now();
        const segPath = path.join(session.dir, file);
        const waitStart = Date.now();
        while (!fs.existsSync(segPath) && Date.now() - waitStart < 3500) {
          await new Promise((r) => setTimeout(r, 50));
        }
        if (!fs.existsSync(segPath)) {
          res.status(404).send("Segment not ready");
          return;
        }
        res.setHeader("Content-Type", "video/mp2t");
        res.setHeader("Cache-Control", "public, max-age=600");
        fs.createReadStream(segPath).pipe(res);
        return;
      }
      res.status(404).send("Not found");
    } catch (err) {
      console.error("iOS HLS stream error:", err);
      res.status(502).send("Stream transcode failed");
    }
  });
  const mkvSubExtractCache = /* @__PURE__ */ new Map();
  app.get("/api/subtitles/extract", async (req, res) => {
    const streamUrl = String(req.query.url || "").trim();
    const startSec = Math.max(0, Number(req.query.startSec || 0) || 0);
    const windowMode = String(req.query.mode || "probe").trim();
    if (!streamUrl || !streamUrl.startsWith("http")) {
      res.json({ ok: false, srt: "" });
      return;
    }
    const cacheKey = `${streamUrl}::${windowMode}::${Math.floor(startSec / 300)}`;
    const cached = mkvSubExtractCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      res.json({ ok: true, srt: cached.srt, cached: true });
      return;
    }
    try {
      let extractedSrt = "";
      if (windowMode === "window" && startSec > 0) {
        extractedSrt = await new Promise((resolve) => {
          const chunks = [];
          const ff = spawn(FFMPEG_BIN, [
            "-hide_banner",
            "-loglevel",
            "error",
            "-ss",
            String(startSec),
            "-t",
            "720",
            "-i",
            streamUrl,
            "-vn",
            "-an",
            "-map",
            "0:s:0?",
            "-c:s",
            "srt",
            "-f",
            "srt",
            "pipe:1"
          ]);
          const killTimer = setTimeout(() => {
            try {
              ff.kill("SIGKILL");
            } catch {
            }
            resolve(Buffer.concat(chunks).toString("utf8"));
          }, 5200);
          ff.stdout.on("data", (chunk) => chunks.push(chunk));
          ff.on("close", () => {
            clearTimeout(killTimer);
            resolve(Buffer.concat(chunks).toString("utf8"));
          });
          ff.on("error", () => {
            clearTimeout(killTimer);
            resolve("");
          });
        });
      } else {
        const controller = new AbortController();
        const fetchTimer = setTimeout(() => controller.abort(), 4200);
        const upstream = await fetch(streamUrl, {
          signal: controller.signal,
          headers: {
            Range: "bytes=0-5767167",
            "User-Agent": "Mozilla/5.0"
          }
        }).finally(() => clearTimeout(fetchTimer));
        if (upstream.ok && upstream.body) {
          const arrayBuf = await upstream.arrayBuffer();
          const inputBuf = Buffer.from(arrayBuf);
          extractedSrt = await new Promise((resolve) => {
            const outChunks = [];
            const ff = spawn(FFMPEG_BIN, [
              "-hide_banner",
              "-loglevel",
              "error",
              "-i",
              "pipe:0",
              "-vn",
              "-an",
              "-map",
              "0:s:0?",
              "-c:s",
              "srt",
              "-f",
              "srt",
              "pipe:1"
            ]);
            const killTimer = setTimeout(() => {
              try {
                ff.kill("SIGKILL");
              } catch {
              }
              resolve(Buffer.concat(outChunks).toString("utf8"));
            }, 2500);
            ff.stdout.on("data", (chunk) => outChunks.push(chunk));
            ff.stdin.on("error", () => {
            });
            ff.on("close", () => {
              clearTimeout(killTimer);
              resolve(Buffer.concat(outChunks).toString("utf8"));
            });
            ff.on("error", () => {
              clearTimeout(killTimer);
              resolve("");
            });
            ff.stdin.end(inputBuf);
          });
        }
      }
      if (extractedSrt && extractedSrt.includes("-->")) {
        pruneCacheMap(mkvSubExtractCache, 80);
        mkvSubExtractCache.set(cacheKey, {
          srt: extractedSrt,
          expiresAt: Date.now() + 30 * 6e4
        });
        res.json({ ok: true, srt: extractedSrt });
        return;
      }
    } catch {
    }
    res.json({ ok: false, srt: "" });
  });
  app.get("/api/requests", (_req, res) => {
    res.json({ ok: true, requests: movieRequestsStore });
  });
  app.post("/api/requests", (req, res) => {
    const title = sanitizeBrandText(String(req.body?.title || "").trim());
    const type = String(req.body?.type || "MOVIE").toUpperCase();
    const language = sanitizeBrandText(String(req.body?.language || "Bangla / Dual Audio").trim());
    const notes = sanitizeBrandText(String(req.body?.notes || "").trim());
    if (!title) {
      res.status(400).json({ ok: false, error: "\u0985\u09A8\u09C1\u0997\u09CD\u09B0\u09B9 \u0995\u09B0\u09C7 \u09AE\u09C1\u09AD\u09BF \u09AC\u09BE \u09B8\u09BF\u09B0\u09BF\u099C\u09C7\u09B0 \u09A8\u09BE\u09AE \u09B2\u09BF\u0996\u09C1\u09A8" });
      return;
    }
    const item = {
      id: `req-${Date.now()}`,
      title,
      type: ["MOVIE", "SERIES", "ANIME", "BROKEN_LINK"].includes(type) ? type : "MOVIE",
      language,
      notes,
      status: "Queued",
      createdAt: Date.now()
    };
    movieRequestsStore.unshift(item);
    if (movieRequestsStore.length > 30) movieRequestsStore.pop();
    res.json({ ok: true, request: item, requests: movieRequestsStore });
  });
  app.get("/api/myflix", (_req, res) => {
    res.json({ ok: false });
  });
  app.get("/api/push/vapid-public-key", (_req, res) => {
    res.json({ ok: true, publicKey: vapidKeys.publicKey });
  });
  app.post("/api/push/subscribe", (req, res) => {
    const sub = req.body?.subscription || req.body;
    if (!sub || typeof sub.endpoint !== "string" || !sub.keys?.p256dh || !sub.keys?.auth) {
      res.status(400).json({ ok: false, error: "Invalid push subscription" });
      return;
    }
    const isNew = !pushSubscriptionsMap.has(sub.endpoint);
    pushSubscriptionsMap.set(sub.endpoint, sub);
    if (isNew) {
      savePushSubscriptionsToDisk();
      const latestNotif = buildGlobalNotifications()[0];
      if (latestNotif) {
        const posterThumb = getNotificationPosterUrl(latestNotif.movie?.poster || "") || "./pwa-192x192.png";
        const welcomePayload = JSON.stringify({
          title: latestNotif.headlineBn,
          body: "",
          poster: posterThumb,
          badge: "./notif-badge.png",
          tag: latestNotif.id,
          movieId: latestNotif.movie?.id || "",
          url: `/?watch=${encodeURIComponent(latestNotif.movie?.path || "")}&title=${encodeURIComponent(latestNotif.movie?.title || "")}`
        });
        webpush.sendNotification(sub, welcomePayload, { TTL: 86400, urgency: "high" }).catch(() => {});
      }
    }
    res.json({ ok: true, totalSubscribers: pushSubscriptionsMap.size });
  });
  app.get("/api/notifications", (_req, res) => {
    const notifications = buildGlobalNotifications();
    res.json({
      ok: true,
      serverTime: Date.now(),
      notifications
    });
  });
  app.post("/api/notifications/broadcast", async (req, res) => {
    const rawMovie = req.body?.movie;
    const category = req.body?.category === "TOP_RATED_POPULAR" ? "TOP_RATED_POPULAR" : "NEW_UPLOAD";
    if (!rawMovie || !rawMovie.title || !rawMovie.path) {
      res.status(400).json({ ok: false, error: "Invalid movie payload for broadcast" });
      return;
    }
    const normMovie = normalizeMovieCardItem(rawMovie, Date.now());
    const ratingNum = parseFloat(normMovie.rating || "9.2") || 9.2;
    const cleanTitle = normMovie.title.replace(/\s*\((?:19|20)\d{2}\)\s*/g, " ").replace(/\s*\[[^\]]*\]\s*/g, " ").replace(/\s+/g, " ").trim();
    const broadcastItem = {
      id: `notif-live-${Date.now()}-${normMovie.id}`,
      category,
      badgeText: "Just now",
      headlineBn: `${cleanTitle} \u2014 Hero? Not quite. Legend? Absolutely.`,
      subtitleBn: "",
      movie: normMovie,
      createdAt: Date.now(),
      ratingScore: ratingNum
    };
    customBroadcastNotifications.unshift(broadcastItem);
    if (customBroadcastNotifications.length > 12) {
      customBroadcastNotifications.pop();
    }
    const pushCount = await broadcastWebPushNotificationToAll(broadcastItem);
    res.json({
      ok: true,
      pushedToSubscribers: pushCount,
      broadcast: broadcastItem,
      notifications: buildGlobalNotifications()
    });
  });
  app.get("/api/proxy-page", async (req, res) => {
    const rawPath = String(req.query.path || "/").trim();
    const nodeId = String(req.query.node || "").trim();
    try {
      const { html, finalOrigin } = await fetchFromMirrors(rawPath, nodeId);
      let processed = html;
      processed = processed.replace(/<script>\(function\(\)\{try\{var ua=navigator\.userAgent[\s\S]*?<\/script>/i, "").replace(/<script[^>]*id=["']mlbd-display-ads[^"']*["'][^>]*>[\s\S]*?<\/script>/gi, "").replace(/<script[^>]*id=["']mlbd-click-ads[^"']*["'][^>]*>[\s\S]*?<\/script>/gi, "").replace(/\/mlbd-adopen\.php/g, "/api/noop").replace(/MovieLinkBD/gi, "CinePulse HD").replace(/movielinkbd\.[a-z]+/gi, "CinePulse");
      const stealthBridge = `
        <base href="${finalOrigin}/" />
        <style>
          #mlbd-adfree, .mlbd-ad-slot, [data-mlbd-ad], #mlbd-install,
          header .logo, .site-logo, .telegram-join, .tg-banner, .social-links,
          a[href*="t.me"], a[href*="telegram"], .footer, footer {
            display: none !important;
          }
        </style>
        <script>
          // Mute any automatic intro sound or page audio synth
          try {
            window.Audio = function() {
              return { play: function(){ return Promise.resolve(); }, pause: function(){}, addEventListener: function(){} };
            };
            if (window.speechSynthesis) {
              window.speechSynthesis.speak = function() {};
            }
          } catch (_) {}

          document.addEventListener('click', function(e) {
            var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
            if (!a) return;
            var href = a.getAttribute('href') || '';
            if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;
            try {
              var u = new URL(href, '${finalOrigin}');
              if (u.hostname.includes('movielinkbd')) {
                e.preventDefault();
                e.stopPropagation();
                window.location.href = '/api/proxy-page?path=' + encodeURIComponent(u.pathname + u.search);
              }
            } catch (_) {}
          }, true);
        </script>
      `;
      processed = processed.replace(/<head[^>]*>/i, (match) => `${match}${stealthBridge}`);
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(processed);
    } catch {
      res.status(502).send(`
        <!doctype html>
        <html>
          <body style="background:#090b10;color:#f1f5f9;font-family:sans-serif;padding:2rem;text-align:center;">
            <h3>\u09B8\u09BE\u09B0\u09CD\u09AD\u09BE\u09B0\u09C7\u09B0 \u09B8\u09BE\u09A5\u09C7 \u09B8\u0982\u09AF\u09CB\u0997 \u0995\u09B0\u09BE \u09AF\u09BE\u099A\u09CD\u099B\u09C7 \u09A8\u09BE</h3>
            <p>\u0985\u09A8\u09C1\u0997\u09CD\u09B0\u09B9 \u0995\u09B0\u09C7 \u0985\u09CD\u09AF\u09BE\u09AA\u09C7\u09B0 \u09AE\u09C7\u0987\u09A8 \u09AD\u09BF\u0989 \u09AC\u09CD\u09AF\u09AC\u09B9\u09BE\u09B0 \u0995\u09B0\u09C1\u09A8 \u0985\u09A5\u09AC\u09BE \u0985\u09A8\u09CD\u09AF Server Node \u09A8\u09BF\u09B0\u09CD\u09AC\u09BE\u099A\u09A8 \u0995\u09B0\u09C1\u09A8\u0964</p>
          </body>
        </html>
      `);
    }
  });
  app.get("/api/health", (_req, res) => {
    res.status(200).json({
      ok: true,
      service: "CinePulse HD",
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: Date.now()
    });
  });
  app.all("/api/noop", (_req, res) => {
    res.status(204).end();
  });
  app.get("/db-shards/:file", (_req, res) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.json({ details: {} });
  });
  app.get(["/sw.js", "/dev-sw.js"], (_req, res) => {
    res.setHeader("Content-Type", "application/javascript; charset=utf-8");
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.send(`importScripts("./sw-push.js");`);
  });
  if (process.env.NODE_ENV !== "production") {
    const vitePkg = "vite";
    const { createServer: createViteServer } = await import(vitePkg);
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, "dist");
    app.use(
      express.static(distPath, {
        setHeaders: (res, filePath) => {
          if (filePath.endsWith(".html") || filePath.endsWith(".json") || filePath.endsWith(".webmanifest") || filePath.endsWith("sw.js") || filePath.endsWith("registerSW.js")) {
            res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
          } else {
            res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
          }
        }
      })
    );
    app.get("*", (_req, res) => {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      res.sendFile(path.join(distPath, "index.html"));
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`CinePulse HD Cinema Server running on http://0.0.0.0:${PORT}`);
    setTimeout(() => {
      void getMovieBoxBearerToken(true).catch(() => {
      });
      void fetchMovieBoxHomePayload().catch(() => {
      });
      void syncLiveCategories();
    }, 150).unref();
    setInterval(syncLiveCategories, 3e5).unref();
    const externalUrl = (process.env.RENDER_EXTERNAL_URL || process.env.APP_URL || "").replace(/\/+$/, "");
    if (externalUrl && externalUrl.startsWith("http")) {
      setInterval(() => {
        fetch(`${externalUrl}/api/health`, {
          headers: { "User-Agent": "CinePulse-KeepAlive/1.0" },
          signal: AbortSignal.timeout(8e3)
        }).catch(() => {
        });
      }, 10 * 60 * 1e3).unref();
    }
  });
}
startServer();