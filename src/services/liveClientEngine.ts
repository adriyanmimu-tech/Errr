// @ts-nocheck
import { ALL_CATEGORIES, INITIAL_FALLBACK_MOVIES, TOP_10_THIS_WEEK_ITEMS } from "../data/categories";
import { cloakStreamUrl } from "../utils/securityShield";
import { cleanTimeAgoAndEpisode, deduplicateMovieCards, getCanonicalTitleKey, normalizeMovieCardItem, normalizeMovieCardList, sanitizeBrandText, sortItemsByHighRating, sortItemsByHotAndHype, sortItemsByRecentUpload } from "../utils/timeAgo";
// src/services/liveClientEngine.ts
export var staticDbPromise = null;
export var loadedStaticDb = null;
export var staticDbTitleIndex = /* @__PURE__ */ new Map();
export var clientCatalogCache = /* @__PURE__ */ new Map();
export var clientSuggestCache = /* @__PURE__ */ new Map();
export var clientDetailCache = /* @__PURE__ */ new Map();
export var inFlightDetailPromises = /* @__PURE__ */ new Map();
export var bgPrefetchControllers = /* @__PURE__ */ new Set();
export var isVideoActivelyStarting = false;
export function getInstantCatalogCache(path = "/", page = 1, search = "", nodeId = "node-moviebox") {
	const cKey = `api::${path || "/"}::p=${page}::q=${search.trim()}::n=${nodeId || "auto"}`;
	const hit = clientCatalogCache.get(cKey);
	if (hit && hit.items.length > 0 && Date.now() - hit.ts < 3e5) return {
		items: hit.items,
		maxPage: hit.maxPage
	};
	return null;
}
export function getInstantSuggestCache(query) {
	const q = query.trim().toLowerCase();
	if (!q) return null;
	const exact = clientSuggestCache.get(q);
	if (exact && exact.items.length > 0 && Date.now() - exact.ts < 3e5) return exact.items;
	const prefixMatches = [];
	const seen = /* @__PURE__ */ new Set();
	for (const [, val] of clientSuggestCache.entries()) for (const item of val.items) if (!seen.has(item.path) && item.title.toLowerCase().includes(q)) {
		seen.add(item.path);
		prefixMatches.push(item);
	}
	return prefixMatches.length > 0 ? prefixMatches.slice(0, 36) : null;
}
export function setVideoStartupPriority(active) {
	isVideoActivelyStarting = active;
	if (active) {
		stopBackgroundWarmVideo();
		for (const ctrl of bgPrefetchControllers) try {
			ctrl.abort();
		} catch {}
		bgPrefetchControllers.clear();
	}
}
export function normalizeLookupTitleKey(rawTitle) {
	const canon = getCanonicalTitleKey(rawTitle || "");
	if (canon) return canon;
	return (rawTitle || "").replace(/\[.*?\]|\(.*?\)/g, " ").replace(/\b(?:S\d+|Season\s*\d+(?:-\d+)?|Ep(?:isode)?\s*\d+(?:-\d+)?|Complete(?:d)?|Added|Full\s*HD|ORG|Hindi|Bangla|Bengali|Dual|Multi|Audio|The\s*Movie)\b/gi, " ").toLowerCase().replace(/[^a-z0-9\u0980-\u09ff]+/g, "").trim();
}
export function legacyNormalizeLookupTitleKey(rawTitle) {
	return (rawTitle || "").replace(/\[.*?\]|\(.*?\)/g, " ").replace(/\b(?:S\d+|Season\s*\d+(?:-\d+)?|Ep(?:isode)?\s*\d+(?:-\d+)?|Complete(?:d)?|Added|Full\s*HD|ORG|Hindi|Bangla|Bengali|Dual|Multi|The\s*Movie)\b/gi, " ").toLowerCase().replace(/[^a-z0-9\u0980-\u09ff]+/g, "").trim();
}
export function sortEpisodeSourcesFastestFirst(sources) {
	if (!Array.isArray(sources) || sources.length <= 1) return sources || [];
	const score = (src) => {
		if (src.type === "embed" || /abyssplayer\.com|abysscdn\.com|myflix/i.test(`${src.url || ""} ${src.id || ""}`)) return 100;
		if (src.id?.startsWith("mb-") || /\/_s\/v\.mp4|\/api\/mb-stream|\/api\/mb-ep-stream/i.test(src.url || "")) {
			const szMatch = (src.name || "").match(/(\d+)\s*MB/i);
			const isHeavy = (szMatch ? parseInt(szMatch[1], 10) : 0) > 350;
			if (src.quality === 720) return 4650;
			if (src.quality === 480) return 4640;
			if (src.quality === 360) return 4620;
			if (src.quality === 1080) return isHeavy ? 4550 : 4630;
			return 4500;
		}
		const isHevc = /\b(hevc|h\.?265|x265|10bit|av1)\b/i.test(`${src.name} ${src.qualityLabel}`);
		const isBestHeavy = /best\s*quality/i.test(src.qualityLabel || "");
		let s = isHevc ? 200 : 1e3;
		if (isBestHeavy) s -= 250;
		if (src.quality >= 360 && src.quality <= 576) s += 650;
		else if (src.quality === 720) s += 500;
		else if (src.quality === 1080) s += 350;
		else s += 150;
		return s;
	};
	return [...sources].sort((a, b) => score(b) - score(a));
}
export function indexDetailsIntoMemory(detailsMap, isFromLiveApi = false) {
	if (!detailsMap || !isFromLiveApi) return;
	if (!loadedStaticDb) loadedStaticDb = {
		generatedAt: Date.now(),
		catalogs: {},
		details: {}
	};
	for (const [detPath, det] of Object.entries(detailsMap)) if (det?.title && det.episodes?.length) {
		for (const ep of det.episodes) {
			for (const src of ep.sources || []) if (!src.downloadUrl) src.downloadUrl = src.url;
			else if (src.downloadUrl.startsWith("/api/go?t=")) src.downloadUrl = resolveDirectDownloadUrl(src.downloadUrl);
			ep.sources = sortEpisodeSourcesFastestFirst(ep.sources);
		}
		for (const btn of det.downloadButtons || []) if (btn.url && btn.url.startsWith("/api/go?t=")) btn.url = resolveDirectDownloadUrl(btn.url);
		loadedStaticDb.details[detPath] = det;
		const k1 = normalizeLookupTitleKey(det.title);
		if (k1) staticDbTitleIndex.set(k1, det);
		const kLegacy = legacyNormalizeLookupTitleKey(det.title);
		if (kLegacy) staticDbTitleIndex.set(kLegacy, det);
		const k2 = det.title.toLowerCase().replace(/[^a-z0-9]/g, "");
		if (k2) staticDbTitleIndex.set(k2, det);
	}
}
export async function loadShardForMovie(rawPath, rawTitle) {
	return getInstantCachedDetail(rawPath, rawTitle);
}
export async function loadStaticDb() {
	if (loadedStaticDb && Object.keys(loadedStaticDb.catalogs || {}).length > 0) return loadedStaticDb;
	if (!staticDbPromise) staticDbPromise = (async () => {
		try {
			const res = await fetch("./static-db.json");
			if (!res.ok) return null;
			const parsed = await res.json();
			if (!loadedStaticDb) loadedStaticDb = {
				generatedAt: parsed.generatedAt || Date.now(),
				catalogs: parsed.catalogs || {},
				details: {}
			};
			else loadedStaticDb.catalogs = parsed.catalogs || {};
			if (parsed?.details) indexDetailsIntoMemory(parsed.details, false);
			return loadedStaticDb;
		} catch {
			return null;
		}
	})();
	return staticDbPromise;
}
if (typeof window !== "undefined") {
	ensurePreconnectOrigin("https://fsldownload.com");
	ensurePreconnectOrigin("https://bcdnxw.hakunaymatata.com");
	if (window.location.hostname.endsWith("github.io")) loadStaticDb().catch(() => {});
}
export function resolveDirectDownloadUrl(rawUrl) {
	if (!rawUrl) return "";
	if (rawUrl.startsWith("/api/go?t=")) try {
		const base64 = rawUrl.slice(10).split("&")[0].replace(/-/g, "+").replace(/_/g, "/");
		const padded = base64 + "===".slice((base64.length + 3) % 4);
		const decoded = decodeURIComponent(escape(window.atob(padded)));
		if (/fifadekho\.com/i.test(decoded)) return typeof window !== "undefined" && window.location.hostname.endsWith("github.io") ? `${decoded.replace(/\/+$/, "")}?view=links` : rawUrl;
		return decoded;
	} catch {
		return rawUrl;
	}
	return rawUrl;
}
export function sanitizeBrandText(input) {
	if (!input) return "";
	return String(input).replace(/https?:\/\/[^\s"'<>]*(?:movielinkbd|myflixbd)[^\s"'<>]*/gi, "").replace(/\b[a-z0-9-]*\.?(?:movielinkbd|myflixbd)\.[a-z]{2,6}\b/gi, "CinePulse").replace(/movielinkbd|myflixbd|nexaflox/gi, "CinePulse").replace(/movie\s*link\s*bd/gi, "CinePulse").replace(/\bmlbd\b/gi, "CP").replace(/\s*watch\s+online\s+and\s+download\s*(?:["“”']?web-dl["“”']?|["“”']?hdtc["“”']?|["“”']?hd["“”']?|["“”']?4k["“”']?)?\s*…?/gi, "").replace(/\s*watch\s+online\s*…?/gi, "").replace(/\s*[“”"'](?:web(?:-?dl|rip)?|hdtc|hdts|4k|hd)[^"”]*[”"']?\s*…?\s*$/gi, "").replace(/\s+[–—-]\s*$/g, "").replace(/\s{2,}/g, " ").trim();
}
export function decodeHtmlEntities(str) {
	return sanitizeBrandText((str || "").replace(/&ndash;|&#8211;/g, "–").replace(/&mdash;|&#8212;/g, "—").replace(/&#039;|&#8217;/g, "'").replace(/&quot;|&#8220;|&#8221;/g, "\"").replace(/&amp;|&#038;/g, "&").replace(/&bull;|&#8226;/g, "•").replace(/&#8230;|&hellip;/g, "").replace(/&nbsp;/g, " ").replace(/<[^>]+>/g, "").trim());
}
/**
* Browser-native implementation of the stream & download cipher decoder.
*/
export function decodeMlbdCipherBrowser(base64Str, hexSeed, rounds) {
	try {
		let x = parseInt(hexSeed, 16) >>> 0;
		for (let i = 0; i < rounds; i++) x = Math.imul(x, 1103515245) + 12345 >>> 0;
		const cleanB64 = base64Str.trim().replace(/\s+/g, "");
		const binary = window.atob(cleanB64);
		const out = new Uint8Array(binary.length);
		for (let j = 0; j < binary.length; j++) {
			x = Math.imul(x, 1103515245) + 12345 >>> 0;
			out[j] = binary.charCodeAt(j) ^ x >>> 16 & 255;
		}
		return new TextDecoder("utf-8").decode(out);
	} catch {
		return "";
	}
}
export function extractBaseSeriesTitle(rawTitle) {
	return String(rawTitle || "").replace(/\[.*?\]|\(.*?\)/g, " ").replace(/\b(?:S\d+|Season\s*\d+(?:-\d+)?|Ep(?:isode)?\s*\d+(?:-\d+)?|Complete(?:d)?|Added|Full\s*HD|ORG|Hindi|Bangla|Bengali|Dual|Multi|The\s*Movie)\b/gi, " ").replace(/[:\-–—|]+/g, " ").replace(/\s{2,}/g, " ").trim();
}
export var warmedStreamUrls = /* @__PURE__ */ new Set();
export var preconnectedOrigins = /* @__PURE__ */ new Set();
export var warmVideoEl = null;
export var hasPrimedHardwareDecoder = false;
export function isAppleSafariDevice() {
	if (typeof window === "undefined" || typeof navigator === "undefined") return false;
	const ua = navigator.userAgent || "";
	const isIOS = /iPhone|iPad|iPod/i.test(ua) || navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
	const isSafari = /Safari/i.test(ua) && !/Chrome|Chromium|Edg|OPR|Android/i.test(ua);
	return isIOS || isSafari;
}
export function ensurePreconnectOrigin(streamUrl) {
	if (typeof document === "undefined") return;
	try {
		const origin = new URL(streamUrl).origin;
		if (!origin || preconnectedOrigins.has(origin)) return;
		preconnectedOrigins.add(origin);
		const dnsLink = document.createElement("link");
		dnsLink.rel = "dns-prefetch";
		dnsLink.href = origin;
		document.head.appendChild(dnsLink);
		const mediaLink = document.createElement("link");
		mediaLink.rel = "preconnect";
		mediaLink.href = origin;
		document.head.appendChild(mediaLink);
		const corsLink = document.createElement("link");
		corsLink.rel = "preconnect";
		corsLink.href = origin;
		corsLink.crossOrigin = "anonymous";
		document.head.appendChild(corsLink);
		fetch(origin, {
			mode: "no-cors",
			priority: "high"
		}).catch(() => {});
	} catch {}
}
/**
* Warms DNS, TCP, and TLS handshakes to the video CDN origin AND initializes the browser's
* hardware video decoder once on page boot so the 1st movie click starts as fast as the 2nd+ click.
*/
export function warmStreamConnection(streamUrl, primeMediaDecoder = false) {
	if (!streamUrl || typeof window === "undefined") return;
	const isRelativeApiStream = streamUrl.startsWith("/_s/v.mp4") || streamUrl.startsWith("/api/mb-stream") || streamUrl.startsWith("/api/mb-ep-stream");
	if (!streamUrl.startsWith("http") && !isRelativeApiStream) return;
	if (streamUrl.startsWith("http")) ensurePreconnectOrigin(streamUrl);
	if (!isVideoActivelyStarting && isRelativeApiStream && !warmedStreamUrls.has(streamUrl)) {
		warmedStreamUrls.add(streamUrl);
		const warmCtrl = new AbortController();
		bgPrefetchControllers.add(warmCtrl);
		fetch(streamUrl, {
			headers: { Range: "bytes=0-65535" },
			signal: warmCtrl.signal
		}).catch(() => {}).finally(() => {
			bgPrefetchControllers.delete(warmCtrl);
		});
		return;
	}
	if (!isVideoActivelyStarting && primeMediaDecoder && !warmedStreamUrls.has(streamUrl)) {
		warmedStreamUrls.add(streamUrl);
		if (isAppleSafariDevice()) prewarmMkvStreamMeta(streamUrl);
		else if (!hasPrimedHardwareDecoder && typeof document !== "undefined") {
			hasPrimedHardwareDecoder = true;
			try {
				const v = document.createElement("video");
				v.muted = true;
				v.playsInline = true;
				v.preload = "metadata";
				v.style.position = "fixed";
				v.style.width = "1px";
				v.style.height = "1px";
				v.style.opacity = "0";
				v.style.pointerEvents = "none";
				v.style.left = "-9999px";
				warmVideoEl = v;
				const cleanupWarm = () => {
					stopBackgroundWarmVideo();
				};
				v.addEventListener("loadedmetadata", cleanupWarm, { once: true });
				v.addEventListener("error", cleanupWarm, { once: true });
				v.src = streamUrl;
				v.load();
				window.setTimeout(cleanupWarm, 1100);
			} catch {}
		}
	}
}
export function stopBackgroundWarmVideo() {
	if (warmVideoEl) {
		try {
			warmVideoEl.pause();
			warmVideoEl.removeAttribute("src");
			warmVideoEl.load();
			warmVideoEl.remove();
		} catch {}
		warmVideoEl = null;
	}
}
export function warmDetailFirstStream(detail, primeMediaDecoder = false) {
	const firstEp = detail?.episodes?.[0];
	if (!firstEp?.sources?.length) return;
	const isNonHevc = (s) => !/\b(hevc|h\.?265|x265|10bit|av1)\b/i.test(`${s.name} ${s.qualityLabel}`) && !/best\s*quality/i.test(s.qualityLabel || "");
	const bestFast = firstEp.sources.find((s) => isNonHevc(s) && s.quality >= 360 && s.quality <= 576) || firstEp.sources.find((s) => isNonHevc(s) && s.quality === 720) || firstEp.sources.find((s) => isNonHevc(s)) || firstEp.sources[0];
	if (bestFast?.url && bestFast.type !== "embed") warmStreamConnection(bestFast.url, primeMediaDecoder);
}
/**
* Synchronous 0ms detail lookup from in-memory cache or pre-loaded static-db.json
* so clicking a movie opens the video player immediately without any loading spinner!
*/
export function getInstantCachedDetail(rawPath, rawTitle = "") {
	const pathKey = (rawPath || "").trim();
	if (!pathKey && !rawTitle) return null;
	const mem = clientDetailCache.get(pathKey);
	if (mem && Date.now() - mem.ts < 72e4 && mem.detail?.episodes?.length) return mem.detail;
	if (!(typeof window !== "undefined" && window.location.hostname.endsWith("github.io"))) return null;
	if (loadedStaticDb?.details?.[pathKey]?.episodes?.length) return loadedStaticDb.details[pathKey];
	if (pathKey.startsWith("/mb/")) return null;
	if (rawTitle) {
		const k1 = normalizeLookupTitleKey(rawTitle);
		const byK1 = k1 ? staticDbTitleIndex.get(k1) : void 0;
		if (byK1 && byK1.episodes?.length) return byK1;
	}
	return null;
}
/**
* Pre-loads the static shard OR live /api/details on hover/touchstart and immediately
* pre-warms Virtual Micro-Chunks (#0, #1, #2, Tail) into server RAM so clicking Play starts in 0ms!
*/
export function prefetchMovieDetails(rawPath, rawTitle = "", nodeId = "node-alpha", primeMediaDecoder = false) {
	if (isVideoActivelyStarting) return;
	const pathKey = (rawPath || "").trim();
	if (!pathKey && !rawTitle) return;
	if (primeMediaDecoder && pathKey.startsWith("/mb/")) {
		const parts = pathKey.replace(/^\/mb\//, "").split("/").filter(Boolean);
		const subjectId = parts[0] || "";
		const detailPath = parts[1] || "movie";
		if (subjectId) {
			const isLikelySeries = /\b(s\d+|season|series|ep(?:isode)?)\b/i.test(rawTitle);
			warmStreamConnection(cloakStreamUrl(`/api/mb-ep-stream.mp4?subjectId=${encodeURIComponent(subjectId)}&detailPath=${encodeURIComponent(detailPath)}&se=${isLikelySeries ? 1 : 0}&ep=${isLikelySeries ? 1 : 0}&q=480`), false);
		}
	}
	const existing = getInstantCachedDetail(pathKey, rawTitle);
	if (existing) {
		warmDetailFirstStream(existing, false);
		return;
	}
	if (!pathKey || inFlightDetailPromises.has(pathKey) || bgPrefetchControllers.size >= 3) return;
	const ctrl = new AbortController();
	bgPrefetchControllers.add(ctrl);
	const params = new URLSearchParams({
		path: pathKey,
		title: rawTitle,
		node: nodeId
	});
	const p = fetch(`/api/details?${params.toString()}`, { signal: ctrl.signal }).then((r) => r.ok ? r.json() : null).then((json) => {
		if (json?.ok && json?.detail?.episodes?.length) {
			for (const ep of json.detail.episodes || []) for (const src of ep.sources || []) if (src.downloadUrl) src.downloadUrl = resolveDirectDownloadUrl(src.downloadUrl);
			clientDetailCache.set(pathKey, {
				detail: json.detail,
				ts: Date.now()
			});
			indexDetailsIntoMemory({ [pathKey]: json.detail }, true);
			warmDetailFirstStream(json.detail, false);
		}
		return json;
	}).catch(() => null).finally(() => {
		bgPrefetchControllers.delete(ctrl);
		inFlightDetailPromises.delete(pathKey);
	});
	inFlightDetailPromises.set(pathKey, p);
}
export function scheduleBackgroundCatalogDetailWarmup(items, nodeId) {
	if (typeof window === "undefined" || !items?.length) return;
	items.slice(0, 2).forEach((item, idx) => {
		window.setTimeout(() => {
			if (!isVideoActivelyStarting && item?.path) prefetchMovieDetails(item.path, item.title, nodeId, false);
		}, 800 + idx * 450);
	});
}
export async function fetchMirrorHtmlClientSide(_relativePath, _preferredNodeId = "node-alpha", _bustCache = false) {
	throw new Error("Direct client mirror access disabled by CinePulse Security Shield");
}
export function parseClientCatalogHtml(html) {
	const bodyIdx = html.indexOf("<body");
	const body = bodyIdx >= 0 ? html.slice(bodyIdx) : html;
	const blocks = body.split(/<div class="movie-card"/i).slice(1);
	const items = [];
	const seenPaths = /* @__PURE__ */ new Set();
	for (const block of blocks) {
		const chunk = block.slice(0, 3200);
		if (chunk.includes("'+esc(") || chunk.includes("${")) continue;
		const titleMatch = chunk.match(/class=["']title["'][^>]*>([\s\S]*?)<\/a>/i) || chunk.match(/alt=["']([^"']+)["']/i);
		const hrefMatch = chunk.match(/<a[^>]+href=["']([^"']+)["']/i);
		if (!titleMatch || !hrefMatch) continue;
		const rawHref = hrefMatch[1].trim();
		if (!rawHref || rawHref.includes("'+") || rawHref === "#") continue;
		const itemPath = rawHref.startsWith("http") ? new URL(rawHref).pathname : rawHref.startsWith("/") ? rawHref : `/${rawHref}`;
		if (seenPaths.has(itemPath)) continue;
		seenPaths.add(itemPath);
		const title = decodeHtmlEntities(titleMatch[1]);
		if (!title) continue;
		const posterMatch = chunk.match(/data-src=["'](https?:\/\/[^"']+)["']/i) || chunk.match(/src=["'](https?:\/\/[^"']+)["']/i);
		const poster = posterMatch ? posterMatch[1].trim() : "";
		const quality = decodeHtmlEntities((chunk.match(/<span class=["']quality["'][^>]*>([\s\S]*?)<\/span>/i) || [])[1] || "WEB-DL");
		const language = decodeHtmlEntities((chunk.match(/<span class=["']language["'][^>]*>([\s\S]*?)<\/span>/i) || [])[1] || "MULTI");
		const views = decodeHtmlEntities((chunk.match(/<span class=["']views-badge-top["'][^>]*>[\s\S]*?<\/i>\s*([^<]+)<\/span>/i) || [])[1] || "2.4K");
		const cleanedTime = cleanTimeAgoAndEpisode(decodeHtmlEntities((chunk.match(/<div class=["']upload-time["'][^>]*>([\s\S]*?)<\/div>/i) || [])[1] || "Recently added"), decodeHtmlEntities((chunk.match(/<span class=["']badge ep-badge[^"']*["'][^>]*>([\s\S]*?)<\/span>/i) || [])[1] || ""), itemPath || title, items.length);
		const isPinned = chunk.includes("pin-badge") || chunk.includes("data-pin=\"1\"");
		const isAdult = chunk.includes("data-18=\"1\"") || itemPath.includes("18plus") || cleanedTime.episodePill.toUpperCase().includes("18+");
		let typeBadge = "MOVIE";
		if (itemPath.includes("/anime/")) typeBadge = "ANIME";
		else if (itemPath.includes("/drama/")) typeBadge = "DRAMA";
		else if (itemPath.includes("/series/") || Boolean(cleanedTime.episodePill)) typeBadge = "SERIES";
		items.push({
			id: itemPath.replace(/[^a-zA-Z0-9_-]/g, "_"),
			title,
			url: itemPath,
			path: itemPath,
			poster,
			quality: quality || "HD",
			views: views || "1.9K",
			language: language || "MULTI",
			typeBadge,
			timeAgo: cleanedTime.timeAgo,
			episodePill: cleanedTime.episodePill,
			isPinned,
			isAdult,
			uploadedAtMs: Date.now() - cleanedTime.minutesAgo * 6e4
		});
	}
	const pageMatches = [...body.matchAll(/\/page\/(\d+)/g)].map((m) => Number(m[1])).filter((n) => !isNaN(n) && n > 0 && n <= 2e3);
	return {
		items,
		maxPage: pageMatches.length > 0 ? Math.max(...pageMatches) : 520
	};
}
export function parseClientDetailHtml(html, itemPath, origin) {
	let inlineData = null;
	const playerScriptMatch = html.match(/<script[^>]*id=["']mlbdInlinePlayerData["'][^>]*data-s=["']([^"']+)["'][^>]*data-r=["'](\d+)["'][^>]*>([\s\S]*?)<\/script>/i);
	if (playerScriptMatch) {
		const decodedJson = decodeMlbdCipherBrowser(playerScriptMatch[3], playerScriptMatch[1], parseInt(playerScriptMatch[2], 10) || 600);
		try {
			inlineData = JSON.parse(decodedJson);
		} catch {
			inlineData = null;
		}
	}
	const downloadButtons = [];
	for (const match of html.matchAll(/<a[^>]*data-dl=["']([^"']+)["'][^>]*data-ds=["']([^"']+)["'][^>]*data-dr=["'](\d+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
		const decodedHref = decodeMlbdCipherBrowser(match[1], match[2], parseInt(match[3], 10) || 300);
		const label = decodeHtmlEntities(match[4]);
		if (decodedHref) {
			const fullDlUrl = decodedHref.startsWith("http") ? decodedHref : `${origin}${decodedHref.startsWith("/") ? "" : "/"}${decodedHref}`;
			const bracketMatch = label.match(/\[(.*?)\]/);
			const parts = bracketMatch ? bracketMatch[1].split("•").map((s) => s.trim()) : [];
			downloadButtons.push({
				label: sanitizeBrandText(label || "High-Speed Direct Download"),
				url: fullDlUrl,
				quality: parts[0] || "HD",
				size: parts[1] || ""
			});
		}
	}
	const title = sanitizeBrandText(inlineData?.title || decodeHtmlEntities((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [])[1] || "Cinema Title"));
	const poster = inlineData?.poster || (html.match(/<div class=["']image-container-view["'][\s\S]*?<img[^>]+src=["'](https?:\/\/[^"']+)["']/i) || [])[1] || "";
	const qualityNote = sanitizeBrandText(decodeHtmlEntities((html.match(/<div class=["']movie-info-view["'][\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/i) || [])[1] || "1080p Full HD Stream"));
	const extractInfoLine = (keyword) => {
		const regex = new RegExp(`<p class=["']info-line["'][^>]*>[\\s\\S]*?${keyword}:?<\\/b>([\\s\\S]*?)<\\/p>`, "i");
		const m = html.match(regex);
		return m ? decodeHtmlEntities(m[1]) : "";
	};
	const genre = extractInfoLine("Genre") || "Cinema, Entertainment";
	const language = extractInfoLine("Language") || "Multi Audio";
	const quality = extractInfoLine("Quality") || "WEB-DL";
	const resolution = extractInfoLine("Resolution") || "1080p | 720p | 480p";
	const releaseDate = extractInfoLine("Released") || "2026";
	const storyline = sanitizeBrandText(decodeHtmlEntities((html.match(/<p class=["']story-text["'][^>]*>([\s\S]*?)<\/p>/i) || [])[1] || (html.match(/<meta name=["']description["'] content=["']([^"']+)["']/i) || [])[1] || ""));
	const trailerMatch = html.match(/data-mlbd-trailer=["']([a-zA-Z0-9_-]{6,20})["']/i);
	const youtubeTrailerId = trailerMatch ? trailerMatch[1] : "";
	const cast = [];
	for (const m of html.matchAll(/<a class=["']mlbd-cast__p["'][^>]+href=["']([^"']+)["'][^>]*>[\s\S]*?<img[^>]+src=["']([^"']+)["'][^>]*>[\s\S]*?<b>([\s\S]*?)<\/b>[\s\S]*?<small>([\s\S]*?)<\/small>/gi)) {
		const actorName = decodeHtmlEntities(m[3]);
		if (actorName) cast.push({
			url: `/search?q=${encodeURIComponent(actorName)}`,
			photo: m[2],
			name: actorName,
			role: decodeHtmlEntities(m[4])
		});
	}
	const inferStreamQuality = (s) => {
		const combined = `${s?.quality_label || ""} ${s?.name || ""}`.toLowerCase();
		if (/\b(2160p|4k)\b/.test(combined)) return 2160;
		if (/\b(1080p|full\s*hd)\b/.test(combined)) return 1080;
		if (/\b(480p|360p)\b/.test(combined)) return 480;
		if (/\b720p\b/.test(combined)) return 720;
		const q = Number(s?.quality);
		if (q === 480 || q === 720 || q === 1080 || q === 2160) return q;
		if (/best\s*quality/i.test(combined)) return 1080;
		return 720;
	};
	const scoreSourceForSmoothPlay = (src) => {
		const isHevc = /\b(hevc|h\.?265|x265|10bit)\b/i.test(`${src.name} ${src.qualityLabel}`);
		const isBestHeavy = /best\s*quality/i.test(src.qualityLabel || "");
		let score = isHevc ? 200 : 1e3;
		if (isBestHeavy) score -= 250;
		if (/\.(mp4|m4v|m3u8)(\?|$)/i.test(src.url)) score += 90;
		if (/r2\.dev|workers\.dev|cloudflare|fsldownload|pixeldrain/i.test(src.url)) score += 50;
		if (src.quality >= 360 && src.quality <= 576) score += 650;
		else if (src.quality === 720) score += 500;
		else if (src.quality === 1080) score += 350;
		else if (src.quality === 2160) score += 150;
		else score += 200;
		return score;
	};
	const mapRawEpisode = (ep, idx) => {
		const sources = [...Array.isArray(ep.sources) ? ep.sources.filter((s) => s && (s.url || s.download_url)).map((s, sIdx) => {
			const rawUrl = String(s.url || "");
			const rawStreamUrl = rawUrl.startsWith("http") ? rawUrl : rawUrl ? `${origin}${rawUrl.startsWith("/") ? "" : "/"}${rawUrl}` : "";
			const rawDlUrl = String(s.download_url || s.url || "");
			const fullDlUrl = rawDlUrl.startsWith("http") ? rawDlUrl : rawDlUrl ? `${origin}${rawDlUrl.startsWith("/") ? "" : "/"}${rawDlUrl}` : "";
			const realQuality = inferStreamQuality(s);
			return {
				id: String(s.id || `src-${idx}-${realQuality}-${sIdx}`),
				quality: realQuality,
				qualityLabel: s.quality_label || `${realQuality}p`,
				audio: sanitizeBrandText(String(s.audio || "Multi Audio")),
				audioLanguages: Array.isArray(s.audio_languages) ? s.audio_languages.map((a) => sanitizeBrandText(String(a))) : [sanitizeBrandText(String(s.audio || "Original"))],
				provider: `Cloud Stream #${sIdx + 1}`,
				url: rawStreamUrl,
				downloadUrl: fullDlUrl,
				type: String(s.type || "mkv").toLowerCase(),
				name: sanitizeBrandText(String(s.name || `${title} - ${realQuality}p`)),
				screenshot: s.screenshot || void 0
			};
		}) : []].sort((a, b) => scoreSourceForSmoothPlay(b) - scoreSourceForSmoothPlay(a));
		const rawLabel = sanitizeBrandText(String(ep.label || (ep.number ? `Episode ${ep.number}` : "Full Movie")));
		const rangeMatch = rawLabel.match(/(?:ep(?:isode)?|e)\s*0*(\d{1,4})\s*[-–—]\s*0*(\d{1,4})/i);
		const singleEpMatch = rawLabel.match(/s\d+\s*e0*(\d{1,4})/i) || rawLabel.match(/(?:ep(?:isode)?|e)\s*0*(\d{1,4})/i);
		const seasonMatch = rawLabel.match(/\bs(?:eason)?\s*0*(\d{1,2})\b/i);
		const parsedStart = rangeMatch ? Number(rangeMatch[1]) : singleEpMatch ? Number(singleEpMatch[1]) : null;
		const parsedEnd = rangeMatch ? Number(rangeMatch[2]) : parsedStart;
		const number = ep.number !== null && ep.number !== void 0 ? Number(ep.number) : ep.range_start !== null && ep.range_start !== void 0 ? Number(ep.range_start) : parsedStart;
		const rangeStart = ep.range_start !== null && ep.range_start !== void 0 ? Number(ep.range_start) : number;
		const rangeEnd = ep.range_end !== null && ep.range_end !== void 0 ? Number(ep.range_end) : parsedEnd ?? rangeStart;
		const season = ep.season !== null && ep.season !== void 0 ? Number(ep.season) : seasonMatch ? Number(seasonMatch[1]) : null;
		return {
			id: String(ep.id || `ep-${idx + 1}`),
			label: rawLabel,
			number,
			rangeStart,
			rangeEnd,
			season,
			kind: String(ep.kind || (number !== null ? "episode" : "movie")),
			sources
		};
	};
	const episodes = Array.isArray(inlineData?.episodes) ? inlineData.episodes.map((ep, idx) => mapRawEpisode(ep, idx)).filter((ep) => ep.sources.length > 0).sort((a, b) => {
		const sA = a.season ?? 0;
		const sB = b.season ?? 0;
		if (sA !== sB && a.season !== null && b.season !== null) return sA - sB;
		const nA = a.rangeStart ?? a.number ?? 999999;
		const nB = b.rangeStart ?? b.number ?? 999999;
		if (nA !== nB) return nA - nB;
		return (a.rangeEnd ?? nA) - (b.rangeEnd ?? nB);
	}) : [];
	const screenshots = Array.isArray(inlineData?.screenshots) ? inlineData.screenshots.map((s) => s?.url).filter(Boolean) : [];
	return {
		title,
		url: itemPath,
		poster,
		qualityNote,
		typeBadge: inlineData?.content_type === "series" || episodes.length > 1 ? "SERIES" : "MOVIE",
		language,
		quality,
		genre,
		resolution,
		releaseDate,
		storyline,
		youtubeTrailerId,
		screenshots,
		episodes,
		downloadButtons,
		cast: cast.slice(0, 12),
		communityScore: {
			recommendedPercent: 92,
			totalVotes: 420,
			verdict: "Massive Hit"
		}
	};
}
export async function fetchBrowserMovieBoxSearch(_query, _page = 1) {
	return [];
}
export async function fetchBrowserMovieBoxDetail(_rawPath) {
	return null;
}
export async function universalApiFetch(endpoint, init) {
	const parsedUrl = new URL(endpoint, "https://cinepulse.local");
	const pathname = parsedUrl.pathname;
	const isGitHubPages = typeof window !== "undefined" && window.location.hostname.endsWith("github.io");
	if (pathname === "/api/details" && parsedUrl.searchParams.get("enrich") !== "1") {
		const rawPath = (parsedUrl.searchParams.get("path") || "").trim();
		const rawTitle = (parsedUrl.searchParams.get("title") || "").trim();
		const instant = getInstantCachedDetail(rawPath, rawTitle);
		if (instant && instant.episodes && instant.episodes.length > 0) return {
			ok: true,
			cached: true,
			detail: instant
		};
		const shardHit = await loadShardForMovie(rawPath, rawTitle);
		if (shardHit && shardHit.episodes && shardHit.episodes.length > 0) return {
			ok: true,
			cached: true,
			detail: shardHit
		};
		const existingPromise = rawPath ? inFlightDetailPromises.get(rawPath) : void 0;
		if (existingPromise) {
			const joined = await existingPromise;
			if (joined?.ok && joined?.detail) return joined;
		}
	}
	if (isGitHubPages && pathname === "/api/catalog" && parsedUrl.searchParams.get("refresh") !== "1") {
		const rawPath = parsedUrl.searchParams.get("path") || "/";
		const page = Math.max(1, parseInt(parsedUrl.searchParams.get("page") || "1", 10));
		const search = (parsedUrl.searchParams.get("q") || "").trim();
		const nodeId = parsedUrl.searchParams.get("node") || "node-moviebox";
		if (!search && loadedStaticDb?.catalogs) {
			const cleanBase = rawPath === "/" ? "" : rawPath.replace(/\/+$/, "");
			const pageKey = page > 1 ? `${cleanBase}/page/${page}` : rawPath;
			const snap = loadedStaticDb.catalogs[pageKey];
			if (snap && snap.length > 0) {
				const sorted = rawPath === "/hot-dhamaka" || rawPath === "/" ? sortItemsByHotAndHype(snap) : rawPath === "/new-uploads" || rawPath === "/new-releases" ? sortItemsByRecentUpload(snap) : normalizeMovieCardList(snap);
				scheduleBackgroundCatalogDetailWarmup(sorted, nodeId);
				return {
					ok: true,
					cached: true,
					items: sorted,
					page,
					maxPage: 520,
					activeNodeId: nodeId
				};
			}
		}
	}
	if (!isGitHubPages) {
		const searchQ = (parsedUrl.searchParams.get("q") || "").trim();
		const pageNum = Math.max(1, parseInt(parsedUrl.searchParams.get("page") || "1", 10) || 1);
		if (pathname === "/api/suggest" && searchQ.length >= 1) {
			const sHit = clientSuggestCache.get(searchQ.toLowerCase());
			if (sHit && Date.now() - sHit.ts < 18e4 && sHit.items.length > 0) return {
				ok: true,
				cached: true,
				items: sHit.items,
				suggestions: sHit.items
			};
		}
		if (pathname === "/api/catalog" && parsedUrl.searchParams.get("refresh") !== "1") {
			const cKey = `api::${parsedUrl.searchParams.get("path") || "/"}::p=${parsedUrl.searchParams.get("page") || "1"}::q=${searchQ}::n=${parsedUrl.searchParams.get("node") || "auto"}`;
			const cHit = clientCatalogCache.get(cKey);
			if (cHit && Date.now() - cHit.ts < 18e4 && cHit.items.length > 0) return {
				ok: true,
				cached: true,
				items: cHit.items,
				page: pageNum,
				maxPage: cHit.maxPage,
				activeNodeId: parsedUrl.searchParams.get("node") || "node-moviebox"
			};
		}
		try {
			const res = await fetch(endpoint, init);
			const contentType = res.headers.get("content-type") || "";
			if (res.ok && contentType.includes("application/json")) {
				const json = await res.json();
				if (pathname === "/api/suggest" && Array.isArray(json?.items)) {
					if (searchQ && json.items.length > 0) clientSuggestCache.set(searchQ.toLowerCase(), {
						items: json.items,
						ts: Date.now()
					});
					return {
						...json,
						ok: true,
						items: json.items,
						suggestions: json.items
					};
				}
				if (json?.detail) {
					for (const ep of json.detail.episodes || []) for (const src of ep.sources || []) if (src.downloadUrl) src.downloadUrl = resolveDirectDownloadUrl(src.downloadUrl);
					for (const btn of json.detail.downloadButtons || []) if (btn.url) btn.url = resolveDirectDownloadUrl(btn.url);
					if (json.detail.url) {
						clientDetailCache.set(json.detail.url, {
							detail: json.detail,
							ts: Date.now()
						});
						indexDetailsIntoMemory({ [json.detail.url]: json.detail }, true);
					}
					warmDetailFirstStream(json.detail);
				} else if (pathname === "/api/catalog" && Array.isArray(json?.items)) {
					if (json.items.length > 0) {
						const cKey = `api::${parsedUrl.searchParams.get("path") || "/"}::p=${parsedUrl.searchParams.get("page") || "1"}::q=${searchQ}::n=${parsedUrl.searchParams.get("node") || "auto"}`;
						clientCatalogCache.set(cKey, {
							items: json.items,
							maxPage: Number(json.maxPage) || 2500,
							ts: Date.now()
						});
						if (searchQ && pageNum === 1) clientSuggestCache.set(searchQ.toLowerCase(), {
							items: json.items,
							ts: Date.now()
						});
						if (json.prefetchedDetails && typeof json.prefetchedDetails === "object") {
							indexDetailsIntoMemory(json.prefetchedDetails, true);
							for (const [detPath, detVal] of Object.entries(json.prefetchedDetails)) if (detVal && detVal.episodes?.length) clientDetailCache.set(detPath, {
								detail: detVal,
								ts: Date.now()
							});
						}
						scheduleBackgroundCatalogDetailWarmup(json.items, parsedUrl.searchParams.get("node") || "node-moviebox");
					}
				}
				return json;
			}
		} catch {}
	}
	const staticDb = await loadStaticDb();
	if (pathname === "/api/categories") return {
		categories: ALL_CATEGORIES,
		nodes: [{
			id: "node-moviebox",
			name: "CinePulse HD",
			region: "Global 4K/1080p Hub"
		}]
	};
	if (pathname === "/api/server-health") return {
		ok: true,
		nodes: [{
			id: "node-moviebox",
			name: "CinePulse HD",
			region: "Global 4K/1080p Hub",
			latencyMs: 24,
			online: true
		}]
	};
	if (pathname === "/api/suggest") {
		const q = (parsedUrl.searchParams.get("q") || "").trim();
		if (q.length < 1) return {
			ok: true,
			items: [],
			suggestions: []
		};
		const lower = q.toLowerCase();
		const pool = [];
		const seen = /* @__PURE__ */ new Set();
		const allLists = [
			...Array.from(clientCatalogCache.values()).map((c) => c.items),
			...Object.values(staticDb?.catalogs || {}),
			...Object.values(INITIAL_FALLBACK_MOVIES)
		];
		for (const list of allLists) for (const item of list) if (!seen.has(item.path) && item.title.toLowerCase().includes(lower)) {
			seen.add(item.path);
			pool.push(item);
		}
		const interleaveSites = (itemsList) => {
			const mb = itemsList.filter((i) => i.path?.startsWith("/mb/"));
			const mf = itemsList.filter((i) => i.path?.startsWith("/mf/"));
			const mlbd = itemsList.filter((i) => !i.path?.startsWith("/mb/") && !i.path?.startsWith("/mf/"));
			const out = [];
			const maxLen = Math.max(mb.length, mlbd.length, mf.length);
			for (let i = 0; i < maxLen; i++) {
				if (i < mb.length) out.push(mb[i]);
				if (i < mlbd.length) out.push(mlbd[i]);
				if (i < mf.length) out.push(mf[i]);
			}
			return deduplicateMovieCards(out);
		};
		const nodeId = parsedUrl.searchParams.get("node") || "node-alpha";
		try {
			const [mbSearchItems, mirrorRes] = await Promise.all([fetchBrowserMovieBoxSearch(q).catch(() => []), fetchMirrorHtmlClientSide(`/search?q=${encodeURIComponent(q)}`, nodeId).then(({ html }) => parseClientCatalogHtml(html).items).catch(() => [])]);
			const merged = deduplicateMovieCards([...mbSearchItems, ...interleaveSites([...mirrorRes, ...pool])]).slice(0, 24);
			return {
				ok: true,
				items: merged,
				suggestions: merged
			};
		} catch {
			const top = interleaveSites(pool).slice(0, 16);
			return {
				ok: true,
				items: top,
				suggestions: top
			};
		}
	}
	if (pathname === "/api/catalog") {
		const rawPath = parsedUrl.searchParams.get("path") || "/";
		const page = Math.max(1, parseInt(parsedUrl.searchParams.get("page") || "1", 10));
		const search = (parsedUrl.searchParams.get("q") || "").trim();
		const nodeId = parsedUrl.searchParams.get("node") || "node-alpha";
		const forceRefresh = parsedUrl.searchParams.get("refresh") === "1";
		const isNewUploadsView = rawPath === "/new-uploads";
		const isNewReleasesView = rawPath === "/new-releases";
		const isHotDhamakaView = rawPath === "/hot-dhamaka";
		const isTrendingHomeView = rawPath === "/" || rawPath === "";
		let upstreamBase = rawPath.startsWith("/") ? rawPath : `/${rawPath}`;
		if (isNewUploadsView || isNewReleasesView || isHotDhamakaView) upstreamBase = "/";
		let targetPath = upstreamBase;
		if (search) targetPath = `/search?q=${encodeURIComponent(search)}`;
		else if (page > 1) targetPath = `${upstreamBase === "/" ? "" : upstreamBase.replace(/\/+$/, "")}/page/${page}`;
		const cacheKey = `${rawPath}::p=${page}::q=${search}`;
		const memCached = clientCatalogCache.get(cacheKey);
		if (!forceRefresh && memCached && Date.now() - memCached.ts < 3e4) {
			scheduleBackgroundCatalogDetailWarmup(memCached.items, nodeId);
			return {
				ok: true,
				items: normalizeMovieCardList(memCached.items),
				page,
				maxPage: memCached.maxPage,
				activeNodeId: nodeId
			};
		}
		const mergeLiveWithSnapshot = (liveItems, baseSnapshot) => {
			if (!baseSnapshot || baseSnapshot.length === 0) return deduplicateMovieCards(liveItems);
			return deduplicateMovieCards([...liveItems, ...baseSnapshot]);
		};
		const snapshotList = !search ? (page === 1 ? staticDb?.catalogs?.[rawPath] : void 0) || staticDb?.catalogs?.[targetPath] || (page === 1 ? staticDb?.catalogs?.[upstreamBase] : void 0) : void 0;
		if (snapshotList && snapshotList.length > 0 && !forceRefresh) {
			const finalizedSnapshot = isHotDhamakaView ? sortItemsByHotAndHype(snapshotList) : isNewUploadsView || isNewReleasesView ? sortItemsByRecentUpload(snapshotList) : isTrendingHomeView ? sortItemsByHotAndHype(snapshotList) : normalizeMovieCardList(snapshotList);
			scheduleBackgroundCatalogDetailWarmup(finalizedSnapshot, nodeId);
			fetchMirrorHtmlClientSide(targetPath, nodeId, true).then(({ html }) => {
				const parsed = parseClientCatalogHtml(html);
				if (parsed.items.length > 0) {
					const mergedRaw = mergeLiveWithSnapshot(parsed.items, snapshotList);
					const listToStore = isHotDhamakaView || isTrendingHomeView ? sortItemsByHotAndHype(mergedRaw) : isNewUploadsView || isNewReleasesView ? sortItemsByRecentUpload(mergedRaw) : normalizeMovieCardList(mergedRaw);
					clientCatalogCache.set(cacheKey, {
						items: listToStore,
						maxPage: parsed.maxPage,
						ts: Date.now()
					});
				}
			}).catch(() => {});
			return {
				ok: true,
				items: finalizedSnapshot,
				page,
				maxPage: 520,
				activeNodeId: nodeId
			};
		}
		const collectLocalSearchMatches = (query) => {
			const lower = query.toLowerCase();
			const matched = [];
			const seen = /* @__PURE__ */ new Set();
			for (const list of [
				...Array.from(clientCatalogCache.values()).map((c) => c.items),
				...Object.values(staticDb?.catalogs || {}),
				...Object.values(INITIAL_FALLBACK_MOVIES)
			]) for (const item of list) if (!seen.has(item.path) && item.title.toLowerCase().includes(lower)) {
				seen.add(item.path);
				matched.push(item);
			}
			return matched;
		};
		try {
			const { html } = await fetchMirrorHtmlClientSide(targetPath, nodeId, true);
			const { items: rawLiveItems, maxPage } = parseClientCatalogHtml(html);
			const localSearchMatches = search ? collectLocalSearchMatches(search) : [];
			const rawItems = search ? deduplicateMovieCards([...rawLiveItems, ...localSearchMatches]) : mergeLiveWithSnapshot(rawLiveItems, snapshotList);
			let items = isHotDhamakaView || isTrendingHomeView ? sortItemsByHotAndHype(rawItems) : isNewUploadsView || isNewReleasesView ? sortItemsByRecentUpload(rawItems) : normalizeMovieCardList(rawItems);
			if (isNewReleasesView) {
				const filtered = items.filter((i) => i.title.includes("2026") || i.title.includes("2025"));
				if (filtered.length >= 6) items = filtered;
			}
			if (items.length > 0) {
				clientCatalogCache.set(cacheKey, {
					items,
					maxPage,
					ts: Date.now()
				});
				scheduleBackgroundCatalogDetailWarmup(items, nodeId);
				return {
					ok: true,
					items,
					page,
					maxPage,
					activeNodeId: nodeId
				};
			}
		} catch {}
		if (search) {
			const mbItems = await fetchBrowserMovieBoxSearch(search).catch(() => []);
			const matched = collectLocalSearchMatches(search);
			return {
				ok: true,
				items: normalizeMovieCardList(deduplicateMovieCards([...mbItems, ...matched])),
				page: 1,
				maxPage: 1,
				activeNodeId: nodeId
			};
		}
		return {
			ok: true,
			items: sortItemsByRecentUpload(snapshotList || INITIAL_FALLBACK_MOVIES[rawPath] || INITIAL_FALLBACK_MOVIES["/"] || []),
			page: 1,
			maxPage: 520,
			activeNodeId: nodeId
		};
	}
	if (pathname === "/api/details") {
		const rawPath = (parsedUrl.searchParams.get("path") || "").trim();
		const rawTitle = (parsedUrl.searchParams.get("title") || "").trim();
		const nodeId = parsedUrl.searchParams.get("node") || "node-alpha";
		const attachRelatedSeasons = (detailObj) => {
			if (detailObj.relatedSeasons && detailObj.relatedSeasons.length > 0) return detailObj;
			const baseSeriesName = extractBaseSeriesTitle(rawTitle || detailObj.title);
			if (baseSeriesName && baseSeriesName.length >= 3) {
				const baseLower = baseSeriesName.toLowerCase();
				const matchingSeasons = Object.values(staticDb?.catalogs || {}).flat().filter((item) => {
					const itemBase = extractBaseSeriesTitle(item.title).toLowerCase();
					return item.path !== detailObj.url && (itemBase === baseLower || item.title.toLowerCase().startsWith(baseLower) || baseLower.startsWith(itemBase));
				});
				if (matchingSeasons.length > 0) {
					const uniqueSeasons = [];
					const seenS = /* @__PURE__ */ new Set();
					for (const s of matchingSeasons) if (!seenS.has(s.path)) {
						seenS.add(s.path);
						uniqueSeasons.push(s);
					}
					return {
						...detailObj,
						relatedSeasons: uniqueSeasons.slice(0, 12)
					};
				}
			}
			return detailObj;
		};
		const isLiveEnrich = parsedUrl.searchParams.get("enrich") === "1";
		const cachedDetail = clientDetailCache.get(rawPath);
		if (!isLiveEnrich && cachedDetail && Date.now() - cachedDetail.ts < 6e4) return {
			ok: true,
			detail: attachRelatedSeasons(cachedDetail.detail)
		};
		if (rawPath.startsWith("/mb/")) {
			const mbDet = await fetchBrowserMovieBoxDetail(rawPath).catch(() => null);
			if (mbDet && mbDet.episodes.length > 0) {
				clientDetailCache.set(rawPath, {
					detail: mbDet,
					ts: Date.now()
				});
				return {
					ok: true,
					detail: attachRelatedSeasons(mbDet)
				};
			}
		}
		try {
			let { html, finalOrigin } = await fetchMirrorHtmlClientSide(rawPath || "/", nodeId, isLiveEnrich);
			if (!html.includes("mlbdInlinePlayerData") && rawTitle) {
				const cleanQuery = extractBaseSeriesTitle(rawTitle).split(/\s+/).slice(0, 4).join(" ");
				if (cleanQuery) {
					const { items } = parseClientCatalogHtml((await fetchMirrorHtmlClientSide(`/search?q=${encodeURIComponent(cleanQuery)}`, nodeId)).html);
					if (items.length > 0) {
						const resolved = await fetchMirrorHtmlClientSide(items[0].path, nodeId);
						html = resolved.html;
						finalOrigin = resolved.finalOrigin;
					}
				}
			}
			const detail = parseClientDetailHtml(html, rawPath, finalOrigin);
			const baseSeriesName = extractBaseSeriesTitle(rawTitle || detail.title);
			if (baseSeriesName && baseSeriesName.length >= 3) {
				const baseLower = baseSeriesName.toLowerCase();
				const matchingSeasons = Object.values(staticDb?.catalogs || {}).flat().filter((item) => {
					const itemBase = extractBaseSeriesTitle(item.title).toLowerCase();
					return item.path !== rawPath && (itemBase === baseLower || item.title.toLowerCase().startsWith(baseLower) || baseLower.startsWith(itemBase));
				});
				if (matchingSeasons.length > 0) {
					const uniqueSeasons = [];
					const seenS = /* @__PURE__ */ new Set();
					for (const s of matchingSeasons) if (!seenS.has(s.path)) {
						seenS.add(s.path);
						uniqueSeasons.push(s);
					}
					detail.relatedSeasons = uniqueSeasons.slice(0, 12);
				}
			}
			if (detail.episodes.length > 0 || detail.downloadButtons.length > 0) {
				clientDetailCache.set(rawPath, {
					detail,
					ts: Date.now()
				});
				return {
					ok: true,
					detail
				};
			}
		} catch {}
		const instantFallback = getInstantCachedDetail(rawPath, rawTitle);
		if (instantFallback && instantFallback.episodes?.length) return {
			ok: true,
			detail: attachRelatedSeasons(instantFallback)
		};
		return {
			ok: false,
			error: "Unable to load stream metadata"
		};
	}
	if (pathname === "/api/mb-home") return {
		ok: true,
		banners: ((await loadStaticDb())?.catalogs?.["/"] || INITIAL_FALLBACK_MOVIES["/"] || []).slice(0, 8),
		liveSports: [],
		quickCategories: [
			{
				id: "qc-hollywood",
				title: "Hollywood",
				bnTitle: "হলিউড মুভি",
				image: "https://pbcdnw.aoneroom.com/image/2025/01/13/683063a45b61be3be1f9d7ef9b2d3072.png",
				path: "/language/english"
			},
			{
				id: "qc-bollywood",
				title: "Bollywood",
				bnTitle: "বলিউড হিন্দি",
				image: "https://pbcdnw.aoneroom.com/image/2025/01/13/95be398605ce21b60efbe7e7a5bf9fc2.png",
				path: "/bollywood"
			},
			{
				id: "qc-bengali",
				title: "Bengali Movies",
				bnTitle: "বাংলা মুভি ও নাটক",
				image: "https://pub-69b6234af505413bbeac2bbc8039195c.r2.dev/poster_4g8viv1792499980.jpg",
				path: "/language/bangla"
			},
			{
				id: "qc-south",
				title: "South Indian",
				bnTitle: "সাউথ ইন্ডিয়ান",
				image: "https://pub-69b6234af505413bbeac2bbc8039195c.r2.dev/poster_06g5z71792073020.jpg",
				path: "/southIndian"
			}
		],
		comingSoon: [],
		sections: []
	};
	if (pathname === "/api/requests") {
		const STORAGE_KEY = "cp_local_movie_requests_v1";
		let savedReqs = [{
			id: "req-1",
			title: "Pushpa 2: The Rule [Bangla Dubbed 4K]",
			type: "MOVIE",
			language: "Bangla Dubbed",
			notes: "Full HD 1080p Dual Audio version",
			status: "Processing",
			createdAt: Date.now() - 18e6
		}, {
			id: "req-2",
			title: "Solo Leveling Season 2 [Hindi + Japanese Dual Audio]",
			type: "ANIME",
			language: "Dual Audio",
			notes: "All episodes 1080p WEB-DL",
			status: "Queued",
			createdAt: Date.now() - 72e5
		}];
		try {
			const raw = localStorage.getItem(STORAGE_KEY);
			if (raw) {
				const parsed = JSON.parse(raw);
				if (Array.isArray(parsed) && parsed.length > 0) savedReqs = parsed;
			}
		} catch {}
		if (init?.method === "POST" && init.body) try {
			const bodyObj = JSON.parse(String(init.body));
			const newReq = {
				id: `req-${Date.now()}`,
				title: sanitizeBrandText(String(bodyObj.title || "")),
				type: bodyObj.type || "MOVIE",
				language: sanitizeBrandText(String(bodyObj.language || "Bangla / Dual Audio")),
				notes: sanitizeBrandText(String(bodyObj.notes || "")),
				status: "Queued",
				createdAt: Date.now()
			};
			const updated = [newReq, ...savedReqs].slice(0, 25);
			localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
			return {
				ok: true,
				request: newReq,
				requests: updated
			};
		} catch {}
		return {
			ok: true,
			requests: savedReqs
		};
	}
	if (pathname === "/api/notifications" || pathname === "/api/notifications/broadcast") {
		const now = Date.now();
		const staticDb = await loadStaticDb();
		const pool = [];
		const seenPaths = /* @__PURE__ */ new Set();
		for (const entry of clientCatalogCache.values()) for (const rawItem of entry.items.slice(0, 20)) {
			if (rawItem.isAdult || seenPaths.has(rawItem.path)) continue;
			seenPaths.add(rawItem.path);
			pool.push(normalizeMovieCardItem(rawItem, now));
		}
		if (staticDb?.catalogs) for (const [catKey, list] of Object.entries(staticDb.catalogs)) {
			if (catKey.includes("adult18plus") || !Array.isArray(list)) continue;
			for (const rawItem of list.slice(0, 20)) {
				if (rawItem.isAdult || seenPaths.has(rawItem.path)) continue;
				seenPaths.add(rawItem.path);
				pool.push(normalizeMovieCardItem(rawItem, now));
			}
		}
		if (pool.length < 10) for (const rawItem of INITIAL_FALLBACK_MOVIES["/"] || []) {
			if (rawItem.isAdult || seenPaths.has(rawItem.path)) continue;
			seenPaths.add(rawItem.path);
			pool.push(normalizeMovieCardItem(rawItem, now));
		}
		const recentUploads = sortItemsByRecentUpload(pool, now).slice(0, 12);
		const topRatedPopular = sortItemsByHighRating(pool, now).slice(0, 12);
		const notifications = [];
		const maxLen = Math.max(recentUploads.length, topRatedPopular.length);
		const minsList = [
			12,
			23,
			35,
			43,
			58,
			75,
			95,
			120,
			165,
			210,
			260,
			320
		];
		const buildMbNotif = (item, idx, category) => {
			const cleanTitle = item.title.replace(/\s*\((?:19|20)\d{2}\)\s*/g, " ").replace(/\s+/g, " ").trim();
			const rawDesc = String(item.description || "").trim();
			const isSeries = item.typeBadge === "SERIES" || item.typeBadge === "ANIME" || item.typeBadge === "DRAMA" || Boolean(item.episodePill);
			const ratingNum = parseFloat(item.rating || "8.8") || 8.8;
			const pattern = idx % 3;
			const headline = isSeries && pattern === 0 ? `${cleanTitle} is back—what will happen next?` : isSeries && pattern === 1 ? `“${cleanTitle}” is heating up—tap to find out what happens next!` : rawDesc ? `${cleanTitle}: ${rawDesc.length > 68 ? `${rawDesc.slice(0, 65).trim()}...` : rawDesc}` : `“${cleanTitle}” is now streaming in Full HD—tap to watch!`;
			const fullSynopsis = rawDesc ? `${cleanTitle}: ${rawDesc}` : `${cleanTitle}: Stream in ${item.language || "Multi Audio"} • ${item.quality || "1080p HD"} • ★ ${ratingNum.toFixed(1)} (${item.sportGenre || item.typeBadge || "Cinema"}).`;
			const mins = minsList[idx % minsList.length];
			const timeBadge = mins < 60 ? `${mins} min ago` : `${Math.floor(mins / 60)} hr ${mins % 60 > 0 ? `${mins % 60} min ` : ""}ago`;
			return {
				id: `notif-${category === "NEW_UPLOAD" ? "new" : "pop"}-${item.id}`,
				category,
				badgeText: timeBadge,
				headlineBn: headline,
				subtitleBn: fullSynopsis,
				movie: item,
				createdAt: Math.max(now - mins * 6e4, now - 864e5),
				ratingScore: ratingNum
			};
		};
		let notifIdx = 0;
		for (let i = 0; i < maxLen; i++) {
			const newItem = recentUploads[i];
			if (newItem) notifications.push(buildMbNotif(newItem, notifIdx++, "NEW_UPLOAD"));
			const popItem = topRatedPopular[i];
			if (popItem) notifications.push(buildMbNotif(popItem, notifIdx++, "TOP_RATED_POPULAR"));
		}
		return {
			ok: true,
			serverTime: now,
			notifications: notifications.slice(0, 28)
		};
	}
	if (pathname === "/api/myflix") return { ok: false };
	return {
		ok: true,
		requests: []
	};
}