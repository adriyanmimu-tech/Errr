// @ts-nocheck
export var SHIELD_SECRET = "CP_SHIELD_v4_9x7A2mK8pQ4wL1zR6vN3jH5bT0yF";
export var CLOAK_KEY = "CP_CLOAK_v4_7x9M2pL5qW8zR1vK4jH6nB3tY0fD";

export function bytesToBase64Url(bytes) {
  if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64url");
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64UrlToBytes(b64url) {
  const clean = (b64url || "").trim();
  if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(clean, "base64url"));
  const b64 = clean.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "===".slice((b64.length + 3) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i) & 255;
  return out;
}

export function encodeCloakToken(plainText) {
  if (!plainText) return "";
  try {
    const utf8Bytes = new TextEncoder().encode(plainText);
    const len = utf8Bytes.length;
    let nonce = 23100;
    for (let i = 0; i < len; i++) nonce = ((nonce << 5) - nonce + utf8Bytes[i]) & 65535;
    const out = new Uint8Array(len + 2);
    out[0] = (nonce >>> 8) & 255;
    out[1] = nonce & 255;
    let state = (2166136261 ^ nonce) >>> 0;
    for (let i = 0; i < 40; i++) state = (Math.imul(state ^ CLOAK_KEY.charCodeAt(i), 1664525) + 1013904223) >>> 0;
    for (let i = 0; i < len; i++) {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      const kChar = CLOAK_KEY.charCodeAt(i % 40);
      const mask = ((state >>> 16) ^ kChar ^ (i & 255)) & 255;
      out[i + 2] = utf8Bytes[i] ^ mask;
    }
    return bytesToBase64Url(out);
  } catch {
    return "";
  }
}

export function decodeCloakToken(token) {
  if (!token) return "";
  try {
    const raw = base64UrlToBytes(token);
    if (raw.length <= 2) return "";
    const nonce = ((raw[0] << 8) | raw[1]) & 65535;
    const len = raw.length - 2;
    const out = new Uint8Array(len);
    let state = (2166136261 ^ nonce) >>> 0;
    for (let i = 0; i < 40; i++) state = (Math.imul(state ^ CLOAK_KEY.charCodeAt(i), 1664525) + 1013904223) >>> 0;
    for (let i = 0; i < len; i++) {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      const kChar = CLOAK_KEY.charCodeAt(i % 40);
      const mask = ((state >>> 16) ^ kChar ^ (i & 255)) & 255;
      out[i] = raw[i + 2] ^ mask;
    }
    return new TextDecoder("utf-8").decode(out);
  } catch {
    return "";
  }
}

export function cloakApiUrl(apiPathAndQuery) {
  if (!apiPathAndQuery || apiPathAndQuery.startsWith("/_s/")) return apiPathAndQuery;
  return `/_s/g?k=${encodeCloakToken(apiPathAndQuery)}`;
}

export function cloakStreamUrl(streamUrl) {
  if (!streamUrl) return "";
  if (streamUrl.startsWith("/_s/v.mp4")) return streamUrl;
  if (
    streamUrl.startsWith("/api/mb-stream") ||
    streamUrl.startsWith("/api/mb-ep-stream") ||
    streamUrl.startsWith("/api/go")
  ) {
    return `/_s/v.mp4?k=${encodeCloakToken(streamUrl)}`;
  }
  return streamUrl;
}

/**
 * Optimizes MovieBox/Alibaba OSS poster URLs to 20KB WebP thumbnails (15x smaller than 300KB raw JPEGs)
 * and uncloaks any legacy `/_s/i.jpg?k=...` proxy URLs so images load directly from the global CDN edge in <25ms
 * without spawning PHP Entry Processes on cPanel.
 */
export function optimizeCdnImageUrl(rawUrl, width = 380, format = "webp") {
  if (!rawUrl || typeof rawUrl !== "string") return "";
  let url = rawUrl.trim();
  if (!url) return "";
  if ((url.startsWith("/_s/i.jpg") || url.startsWith("/api/i")) && url.includes("k=")) {
    try {
      const qIdx = url.indexOf("?");
      const params = new URLSearchParams(url.slice(qIdx + 1));
      const k = params.get("k") || "";
      const decoded = decodeCloakToken(k);
      if (decoded && /^https?:\/\//i.test(decoded)) {
        url = decoded.trim();
      }
    } catch {}
  }
  if (/^https?:\/\/(?:pbcdnw?|img|valiw|h5-static)[^/]*\.aoneroom\.com\//i.test(url)) {
    if (!url.includes("x-oss-process=")) {
      const sep = url.includes("?") ? "&" : "?";
      return `${url}${sep}x-oss-process=image/resize,w_${width}/quality,q_82/format,${format}`;
    }
  }
  return url;
}

/**
 * Converts a poster URL into a 240x240 JPEG thumbnail specifically for Android/iOS OS Notifications
 * so Android NotificationManager always renders the right-side thumbnail instantaneously.
 */
export function getNotificationPosterUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== "string") return "/pwa-192x192.png";
  let url = rawUrl.trim();
  if ((url.startsWith("/_s/i.jpg") || url.startsWith("/api/i")) && url.includes("k=")) {
    try {
      const qIdx = url.indexOf("?");
      const params = new URLSearchParams(url.slice(qIdx + 1));
      const decoded = decodeCloakToken(params.get("k") || "");
      if (decoded && /^https?:\/\//i.test(decoded)) url = decoded.trim();
    } catch {}
  }
  // Strip any existing x-oss-process so we can force crisp 240px JPEG for Android Notification largeIcon
  url = url.replace(/([?&])x-oss-process=[^&]+(&|$)/i, "$1").replace(/[?&]$/, "");
  if (/^https?:\/\/(?:pbcdnw?|img|valiw|h5-static)[^/]*\.aoneroom\.com\//i.test(url)) {
    const sep = url.includes("?") ? "&" : "?";
    return `${url}${sep}x-oss-process=image/resize,w_240/quality,q_85/format,jpg`;
  }
  return url;
}

export function cloakImageUrl(imgUrl) {
  if (!imgUrl || typeof imgUrl !== "string") return "";
  return optimizeCdnImageUrl(imgUrl, 380, "webp");
}

export function cloakPayloadDeep(val) {
  if (!val) return val;
  if (typeof val === "string") {
    if (
      val.startsWith("/api/mb-stream") ||
      val.startsWith("/api/mb-ep-stream") ||
      val.startsWith("/api/go")
    ) {
      return cloakStreamUrl(val);
    }
    if (val.startsWith("/api/mb-subtitle-srt")) {
      return cloakApiUrl(val);
    }
    if (
      val.startsWith("/_s/i.jpg") ||
      /^https?:\/\/[^\s"'<>]+\.(?:jpg|jpeg|png|webp|avif)(?:\?[^\s"'<>]*)?$/i.test(val) ||
      /^https?:\/\/(?:pbcdnw?|img|valiw|h5-static)[^\s"'<>]*(?:aoneroom|hakunaymatata)[^\s"'<>]*/i.test(val)
    ) {
      return cloakImageUrl(val);
    }
    return val;
  }
  if (Array.isArray(val)) {
    for (let i = 0; i < val.length; i++) val[i] = cloakPayloadDeep(val[i]);
    return val;
  }
  if (typeof val === "object") {
    for (const k of Object.keys(val)) {
      const v = val[k];
      if (
        (k === "poster" || k === "previewImage" || k === "image" || k === "avatar" || k === "cover") &&
        typeof v === "string"
      ) {
        val[k] = cloakImageUrl(v);
      } else {
        val[k] = cloakPayloadDeep(v);
      }
    }
    return val;
  }
  return val;
}

export function computeShieldSignature(pathAndQuery, timestampStr) {
  const raw = `${timestampStr}::${(pathAndQuery || "/").split("#")[0]}::${SHIELD_SECRET}`;
  let h1 = 2166136261;
  let h2 = 16777619;
  for (let i = 0; i < raw.length; i++) {
    const c = raw.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 16777619) >>> 0;
    h2 ^= c + (i & 255);
    h2 = Math.imul(h2, 2246822507) >>> 0;
  }
  return `${h1.toString(16).padStart(8, "0")}${h2.toString(16).padStart(8, "0")}`;
}

export function buildSecurityHeaders(endpointUrl) {
  let pathAndQuery = endpointUrl;
  try {
    const u = new URL(
      endpointUrl,
      typeof window !== "undefined" ? window.location.origin : "https://chinepulse.71i.site"
    );
    pathAndQuery = `${u.pathname}${u.search}`;
    if ((u.pathname === "/_s/g" || u.pathname === "/_s/v.mp4") && u.searchParams.get("k")) {
      const uncloaked = decodeCloakToken(u.searchParams.get("k") || "");
      if (uncloaked) pathAndQuery = uncloaked;
    }
  } catch {}
  const ts = String(Date.now());
  return {
    "X-CP-Ts": ts,
    "X-CP-Sig": computeShieldSignature(pathAndQuery, ts),
    "X-CP-Client": "cp-web-v4",
  };
}

export function decryptApiPayload(nonce, encodedBase64) {
  const binaryStr = atob(encodedBase64);
  const len = binaryStr.length;
  const bytes = new Uint8Array(len);
  const keyStr = `${SHIELD_SECRET}::${nonce}`;
  const keyBytes = new Uint8Array(keyStr.length);
  for (let i = 0; i < keyStr.length; i++) keyBytes[i] = keyStr.charCodeAt(i) & 255;
  const kLen = keyBytes.length;
  let state = 1513922071;
  for (let i = 0; i < kLen; i++) state = (Math.imul(state ^ keyBytes[i], 1664525) + 1013904223) >>> 0;
  for (let i = 0; i < len; i++) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const mask = ((state >>> 16) ^ keyBytes[i % kLen] ^ (i & 255)) & 255;
    bytes[i] = binaryStr.charCodeAt(i) ^ mask;
  }
  const jsonText = new TextDecoder("utf-8").decode(bytes);
  return cloakPayloadDeep(JSON.parse(jsonText));
}

export function unwrapSecureJson(data) {
  if (
    data &&
    typeof data === "object" &&
    data._s === 1 &&
    typeof data.d === "string" &&
    typeof data.n === "string"
  ) {
    try {
      return decryptApiPayload(data.n, data.d);
    } catch {
      return data;
    }
  }
  return cloakPayloadDeep(data);
}

var shieldInitialized = false;

export function initClientSecurityShield() {
  if (typeof window === "undefined" || shieldInitialized) return;
  shieldInitialized = true;
  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    let urlStr = "";
    if (typeof input === "string") urlStr = input;
    else if (input instanceof URL) urlStr = input.toString();
    else if (input && typeof input.url === "string") urlStr = input.url;
    const originPrefix = typeof window !== "undefined" ? window.location.origin : "";
    let relUrl = urlStr;
    if (originPrefix && urlStr.startsWith(originPrefix)) relUrl = urlStr.slice(originPrefix.length);
    const isLocalApi = relUrl.startsWith("/api/") || relUrl.startsWith("/_s/");
    let finalInput = input;
    let nextInit = init;
    if (isLocalApi) {
      let cloakedRel = relUrl;
      if (relUrl.startsWith("/api/mb-stream") || relUrl.startsWith("/api/mb-ep-stream")) {
        cloakedRel = cloakStreamUrl(relUrl);
      } else if (relUrl.startsWith("/api/")) {
        cloakedRel = cloakApiUrl(relUrl);
      }
      finalInput = cloakedRel;
      const secHeaders = buildSecurityHeaders(relUrl);
      const mergedHeaders = new Headers(init?.headers || {});
      for (const [k, v] of Object.entries(secHeaders)) mergedHeaders.set(k, v);
      nextInit = {
        ...init,
        headers: mergedHeaders,
      };
    }
    const response = await nativeFetch(finalInput, nextInit);
    if (isLocalApi) {
      const origJson = response.json.bind(response);
      response.json = async () => {
        return unwrapSecureJson(await origJson());
      };
    }
    return response;
  };
}