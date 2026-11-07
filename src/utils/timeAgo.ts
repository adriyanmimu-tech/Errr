// @ts-nocheck
import { cloakImageUrl } from "./securityShield";
// src/utils/timeAgo.ts
export var UPLOAD_TS_STORAGE_KEY = "cp_live_upload_ts_v8";
/**
* Exact epoch timestamp (ms) when the bundled static-db.json / categories.ts snapshot was captured.
* Anchoring snapshot-relative strings ("33 mins ago", "13 hours ago") to this epoch ensures that
* static/cached items advance accurately as real hours pass instead of resetting to "33 mins ago"!
*/
export var STATIC_SNAPSHOT_EPOCH_MS = 1793340406432;
/**
* In-memory + localStorage registry mapping movie path/id -> anchored `uploadedAtMs` (epoch ms).
* Ensures that upload times ("4 mins ago" -> "5 mins ago" -> "1 hour ago") tick forward in real time
* and never stay frozen or reset on refresh!
*/
export var uploadTimestampRegistry = /* @__PURE__ */ new Map();
export var registryLoaded = false;
export function ensureRegistryLoaded() {
	if (registryLoaded || typeof window === "undefined") return;
	registryLoaded = true;
	try {
		const raw = window.localStorage.getItem(UPLOAD_TS_STORAGE_KEY);
		if (raw) {
			const parsed = JSON.parse(raw);
			for (const [k, v] of Object.entries(parsed)) if (typeof v === "number" && v > 0) uploadTimestampRegistry.set(k, v);
		}
	} catch {}
}
export var saveTimer = null;
export function scheduleSaveRegistry() {
	if (typeof window === "undefined") return;
	if (saveTimer !== null) return;
	saveTimer = window.setTimeout(() => {
		saveTimer = null;
		try {
			const obj = {};
			const entries = Array.from(uploadTimestampRegistry.entries()).slice(-300);
			for (const [k, v] of entries) obj[k] = v;
			window.localStorage.setItem(UPLOAD_TS_STORAGE_KEY, JSON.stringify(obj));
		} catch {}
	}, 600);
}
/**
* Formats a number of elapsed minutes into a clean English relative time string.
*/
export function formatMinutesAgoToLabel(minutesAgo) {
	const mins = Math.max(1, Math.floor(minutesAgo));
	if (mins < 60) return mins === 1 ? "1 min ago" : `${mins} mins ago`;
	const hours = Math.floor(mins / 60);
	if (hours < 24) return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
	const days = Math.floor(hours / 24);
	if (days < 7) return days === 1 ? "1 day ago" : `${days} days ago`;
	const weeks = Math.floor(days / 7);
	if (weeks < 5) return weeks === 1 ? "1 week ago" : `${weeks} weeks ago`;
	const months = Math.floor(days / 30);
	if (months < 12) return months === 1 ? "1 month ago" : `${months} months ago`;
	const years = Math.floor(days / 365);
	return years <= 1 ? "1 year ago" : `${years} years ago`;
}
/**
* Deterministically hashes a string into a positive integer.
*/
export function hashSeed(input) {
	let h = 2166136261;
	for (let i = 0; i < input.length; i++) {
		h ^= input.charCodeAt(i);
		h = Math.imul(h, 16777619) >>> 0;
	}
	return h >>> 0;
}
/**
* Parses a views string like "1.13M", "847.84K", "195.4K" into a raw number.
*/
export function parseViewsToNumber(viewsStr) {
	if (!viewsStr) return 0;
	const clean = String(viewsStr).toUpperCase().replace(/[^0-9.KM]/g, "");
	const num = parseFloat(clean) || 0;
	if (clean.includes("M")) return num * 1e6;
	if (clean.includes("K")) return num * 1e3;
	return num;
}
export var HOT_POPULAR_KEYWORDS = [
	"bachelor point",
	"bohurupi",
	"mirzapur",
	"jailer",
	"sultan salahuddin",
	"bigg boss",
	"desu7",
	"gopal bhar",
	"pushpa",
	"avengers",
	"godzilla",
	"king",
	"squid game",
	"one piece",
	"solo leveling",
	"jujutsu",
	"demon slayer",
	"naruto",
	"borbaad",
	"taandob",
	"toofan",
	"daagi",
	"chhaava",
	"sikandar",
	"animal",
	"jawan",
	"pathaan",
	"kgf",
	"salaar",
	"kalki",
	"stree",
	"bhool bhulaiyaa",
	"marco",
	"kantara",
	"leo",
	"vikram",
	"venom",
	"deadpool",
	"love always",
	"farming life"
];
/**
* Extracts a clean relative upload time ("4 mins ago", "2 hours ago", "1 day ago")
* and rescues any embedded episode badge from raw scraped upload-time strings.
*/
export function cleanTimeAgoAndEpisode(rawTimeAgo, rawEpisodePill = "", itemSeed = "", indexHint = 0) {
	const raw = String(rawTimeAgo || "").trim();
	let episodePill = String(rawEpisodePill || "").trim();
	if (!episodePill && raw) {
		const epMatch = raw.match(/\b(S\d+\s*[|·•-]\s*Ep(?:isode)?\s*\d+[^\n]*|S\d+\s+Ep(?:isode)?\s*\d+[^\n]*|Ep(?:isode)?\s*\d+(?:\s*[-–]\s*\d+)?(?:\s*(?:Added|Completed|Full))?|Part\s*\d+[^\n]*)/i);
		if (epMatch) episodePill = epMatch[1].trim();
	}
	const relMatch = raw.match(/(\d+)\s*(sec(?:ond)?s?|min(?:ute)?s?|mins?|hr?s?|hours?|days?|weeks?|months?|years?)\s*ago/i);
	if (relMatch) {
		const num = Math.max(1, parseInt(relMatch[1], 10) || 1);
		const unit = relMatch[2].toLowerCase();
		if (unit.startsWith("sec")) return {
			timeAgo: "1 min ago",
			episodePill,
			minutesAgo: 1
		};
		if (unit.startsWith("min")) return {
			timeAgo: formatMinutesAgoToLabel(num),
			episodePill,
			minutesAgo: num
		};
		if (unit.startsWith("h")) {
			const mins = num * 60;
			return {
				timeAgo: formatMinutesAgoToLabel(mins),
				episodePill,
				minutesAgo: mins
			};
		}
		if (unit.startsWith("d")) {
			const mins = num * 1440;
			return {
				timeAgo: formatMinutesAgoToLabel(mins),
				episodePill,
				minutesAgo: mins
			};
		}
		if (unit.startsWith("w")) {
			const mins = num * 10080;
			return {
				timeAgo: formatMinutesAgoToLabel(mins),
				episodePill,
				minutesAgo: mins
			};
		}
		if (unit.startsWith("mo")) {
			const mins = num * 43200;
			return {
				timeAgo: formatMinutesAgoToLabel(mins),
				episodePill,
				minutesAgo: mins
			};
		}
		const mins = num * 525600;
		return {
			timeAgo: formatMinutesAgoToLabel(mins),
			episodePill,
			minutesAgo: mins
		};
	}
	if (/just\s*now|moments?\s*ago/i.test(raw)) return {
		timeAgo: "1 min ago",
		episodePill,
		minutesAgo: 1
	};
	if (/today/i.test(raw)) return {
		timeAgo: "35 mins ago",
		episodePill,
		minutesAgo: 35
	};
	if (/yesterday/i.test(raw)) return {
		timeAgo: "1 day ago",
		episodePill,
		minutesAgo: 1440
	};
	const yearOrDateMatch = raw.match(/\b(19\d{2}|20\d{2})(?:-\d{2}-\d{2})?\b/);
	if (yearOrDateMatch) {
		const yr = parseInt(yearOrDateMatch[1], 10);
		const h = hashSeed(`${itemSeed || raw}`);
		if (yr >= 2025) {
			const mins = 90 + h % 960;
			return {
				timeAgo: raw,
				episodePill,
				minutesAgo: mins
			};
		}
		const yearsOld = Math.max(1, 2026 - yr);
		return {
			timeAgo: `${yr}`,
			episodePill,
			minutesAgo: yearsOld * 525600
		};
	}
	const seedYearMatch = String(itemSeed || "").match(/\b(19\d{2}|20[0-2]\d)\b/);
	if (seedYearMatch) {
		const yr = parseInt(seedYearMatch[1], 10);
		if (yr <= 2024) {
			const yearsOld = Math.max(1, 2026 - yr);
			return {
				timeAgo: `${yr}`,
				episodePill,
				minutesAgo: yearsOld * 525600
			};
		}
	}
	const h = hashSeed(`${itemSeed || raw}-${indexHint}`);
	const mins = (2 + h % 36) * 60 + (h >>> 6) % 55;
	return {
		timeAgo: formatMinutesAgoToLabel(mins),
		episodePill,
		minutesAgo: mins
	};
}
/**
* Generates a canonical normalized title key so duplicate cards of the same movie/series
* (even with different dynamic `/mKs_...` tokens, episode badges, or `/mf/...` slugs)
* always collapse into a single unique card.
*/
export function getCanonicalTitleKey(rawTitle) {
	const cleaned = String(rawTitle || "").replace(/\[.*?\]|\(.*?\)/g, " ").replace(/[“”"']?\bweb(?:-?dl|rip)?.*$/gi, " ").replace(/\b(?:s\d+|season\s*\d+(?:\s*-\s*\d+)?|ep(?:isode)?\s*\d+(?:\s*-\s*\d+)?|part\s*\d+|grand\s*premiere|complete(?:d)?|added|full\s*hd|hdts|hdtc|hdcam|camrip|web-?dl|webrip|bluray|uhd|4k|2160p|1080p|720p|480p|org|original|uncut|jiohotstar|netflix|prime|hoichoi|chorki|zee5|sonyliv|multi\s*audio|dual\s*audio|multi|dual|dub(?:bed)?|sub(?:title)?s?|with\s+english\s+subtitle|not\s+available|best\s+quality|hindi|bangla|bengali|english|tamil|telugu|malayalam|kannada|korean|japanese|chinese|turkish|spanish)\b/gi, " ").toLowerCase().replace(/[^a-z0-9\u0980-\u09ff]+/g, "").trim();
	if (cleaned.length >= 2) return cleaned;
	return String(rawTitle || "").toLowerCase().replace(/[^a-z0-9\u0980-\u09ff]+/g, "").trim();
}
/**
* Deduplicates a list of MovieCardItems so only ONE card appears per movie/series title, path, or poster.
*/
export function deduplicateMovieCards(items) {
	if (!Array.isArray(items) || items.length === 0) return [];
	const seenPaths = /* @__PURE__ */ new Set();
	const seenSiteTitles = /* @__PURE__ */ new Set();
	const seenSitePosters = /* @__PURE__ */ new Set();
	const unique = [];
	for (const item of items) {
		if (!item || !item.title) continue;
		const pathKey = String(item.path || item.url || "").toLowerCase().replace(/\/+$/, "").trim();
		if (pathKey.startsWith("/mb/")) {
			const mbParts = pathKey.split("/").filter(Boolean);
			const mbSubjectKey = mbParts[1] ? `mb::id::${mbParts[1]}` : pathKey;
			if (seenPaths.has(mbSubjectKey)) continue;
			seenPaths.add(mbSubjectKey);
			if (pathKey) seenPaths.add(pathKey);
			unique.push(item);
			continue;
		}
		const sitePrefix = pathKey.startsWith("/mf/") ? "mf" : "mlbd";
		const titleKey = getCanonicalTitleKey(item.title);
		const siteTitleKey = titleKey ? `${sitePrefix}::${titleKey}` : "";
		const posterKey = item.poster ? String(item.poster).toLowerCase().split("?")[0].trim() : "";
		const sitePosterKey = posterKey && posterKey.startsWith("http") ? `${sitePrefix}::${posterKey}` : "";
		if (pathKey && seenPaths.has(pathKey)) continue;
		if (siteTitleKey && seenSiteTitles.has(siteTitleKey)) continue;
		if (sitePosterKey && seenSitePosters.has(sitePosterKey)) continue;
		if (pathKey) seenPaths.add(pathKey);
		if (siteTitleKey) seenSiteTitles.add(siteTitleKey);
		if (sitePosterKey) seenSitePosters.add(sitePosterKey);
		unique.push(item);
	}
	return unique;
}
/**
* Resolves and anchors the real epoch upload timestamp (`uploadedAtMs`) for a movie card
* so that `timeAgo` dynamically ticks forward as real time passes!
*/
export function resolveLiveUploadedAtMs(item, parsedMinutesAgo, nowMs = Date.now()) {
	ensureRegistryLoaded();
	const key = getCanonicalTitleKey(item.title) || (item.path || item.id || item.title || "").trim();
	if (item.uploadedAtMs && item.uploadedAtMs > 0 && item.uploadedAtMs <= nowMs) {
		if (key) {
			const existing = uploadTimestampRegistry.get(key);
			if (!existing || Math.abs(existing - item.uploadedAtMs) > 12e4) {
				uploadTimestampRegistry.set(key, item.uploadedAtMs);
				scheduleSaveRegistry();
			}
		}
		return item.uploadedAtMs;
	}
	if (key) {
		const savedTs = uploadTimestampRegistry.get(key);
		if (savedTs && savedTs > 0 && savedTs <= nowMs) return savedTs;
	}
	const anchoredTs = Math.min(STATIC_SNAPSHOT_EPOCH_MS, nowMs) - Math.max(1, parsedMinutesAgo) * 6e4;
	if (key) {
		uploadTimestampRegistry.set(key, anchoredTs);
		scheduleSaveRegistry();
	}
	return anchoredTs;
}
/**
* Computes Popularity, Rating (★ 8.2–9.6), Hype Score, and HOT status for a movie or series.
*/
export function getMovieHypeMetrics(item, minutesAgoHint) {
	const titleLower = String(item.title || "").toLowerCase();
	const viewsNum = parseViewsToNumber(item.views);
	const seed = hashSeed(getCanonicalTitleKey(item.title) || item.path || item.id || "cinema");
	const minsAgo = minutesAgoHint !== void 0 ? minutesAgoHint : getItemMinutesAgo(item, 0);
	const isKeywordMatch = HOT_POPULAR_KEYWORDS.some((kw) => titleLower.includes(kw));
	const is4kOrWebDl = /4k|2160p|web-dl|bluray|org|full hd/i.test(`${item.quality} ${item.title}`);
	let ratingNum = 8.1 + seed % 8 * .1;
	if (viewsNum >= 5e5) ratingNum = 9.3 + seed % 4 * .1;
	else if (viewsNum >= 12e4 || item.isPinned || isKeywordMatch) ratingNum = 9 + seed % 5 * .1;
	else if (viewsNum >= 4e4 || is4kOrWebDl) ratingNum = 8.7 + seed % 4 * .1;
	ratingNum = Math.min(9.6, Math.round(ratingNum * 10) / 10);
	const rating = ratingNum.toFixed(1);
	const isDhamaka = Boolean(item.isPinned) || viewsNum >= 85e3 || isKeywordMatch || ratingNum >= 9.1;
	const isHot = isDhamaka || viewsNum >= 45e3 || ratingNum >= 8.9;
	const viewsBoost = Math.min(500, Math.round(Math.log10(Math.max(10, viewsNum)) * 85));
	const ratingBoost = Math.round((ratingNum - 7.5) * 180);
	const pinnedBoost = item.isPinned ? 380 : 0;
	const keywordBoost = isKeywordMatch ? 340 : 0;
	const freshnessBoost = minsAgo <= 180 ? Math.max(40, 220 - minsAgo) : 20;
	const hypeScore = viewsBoost + ratingBoost + pinnedBoost + keywordBoost + freshnessBoost;
	return {
		rating,
		ratingNum,
		hypeScore,
		isHot,
		isDhamaka,
		hypeBadge: isHot ? "HOT" : ""
	};
}
/**
* Returns live elapsed minutes for any MovieCardItem so items can be sorted chronologically
* and tick forward in real time.
*/
export function getItemMinutesAgo(item, indexHint = 0, nowMs = Date.now()) {
	const titleYearMatch = String(item.title || "").match(/\(?(19\d{2}|20[0-2]\d)\)?/);
	if (titleYearMatch) {
		const yr = parseInt(titleYearMatch[1], 10);
		if (yr <= 2024 && !item.episodePill) return Math.max(2880, (2026 - yr) * 525600);
	}
	const uploadedAtMs = resolveLiveUploadedAtMs(item, cleanTimeAgoAndEpisode(item.timeAgo, item.episodePill, `${item.path || item.id || ""}::${item.title || ""}`, indexHint).minutesAgo, nowMs);
	return Math.max(1, Math.floor((nowMs - uploadedAtMs) / 6e4));
}
/**
* Normalizes a MovieCardItem so `uploadedAtMs`, live `timeAgo`, `rating`, `hypeScore`, `isHot`, `isDhamaka`, and `hypeBadge` are always populated.
*/
export function normalizeMovieCardItem(item, indexHint = 0, nowMs = Date.now()) {
	const titleYearMatch = String(item.title || "").match(/\((19\d{2}|20[0-2]\d)\)/);
	const releaseYr = titleYearMatch ? parseInt(titleYearMatch[1], 10) : 0;
	const cleaned = cleanTimeAgoAndEpisode(item.timeAgo, item.episodePill, `${item.path || item.id || ""}::${item.title || ""}`, indexHint);
	const uploadedAtMs = resolveLiveUploadedAtMs(item, cleaned.minutesAgo, nowMs);
	const liveMinutesAgo = releaseYr > 0 && releaseYr <= 2024 && !item.episodePill ? Math.max(2880, (2026 - releaseYr) * 525600) : Math.max(1, Math.floor((nowMs - uploadedAtMs) / 6e4));
	const isExplicitDateOrYear = /^\d{4}(?:-\d{2}-\d{2})?(?:\s+Release)?$/i.test(String(item.timeAgo || "").trim());
	const liveTimeAgo = releaseYr > 0 && releaseYr <= 2024 && !item.episodePill ? `${releaseYr}` : isExplicitDateOrYear ? String(item.timeAgo).trim() : formatMinutesAgoToLabel(liveMinutesAgo);
	const hype = getMovieHypeMetrics({
		...item,
		timeAgo: liveTimeAgo,
		episodePill: cleaned.episodePill,
		uploadedAtMs
	}, liveMinutesAgo);
	return {
		...item,
		poster: cloakImageUrl(item.poster),
		previewImage: item.previewImage ? cloakImageUrl(item.previewImage) : item.previewImage,
		uploadedAtMs,
		timeAgo: liveTimeAgo,
		episodePill: cleaned.episodePill,
		rating: item.rating || hype.rating,
		hypeScore: hype.hypeScore,
		isHot: hype.isHot,
		isDhamaka: hype.isDhamaka,
		hypeBadge: hype.hypeBadge
	};
}
/**
* Normalizes and deduplicates a list of MovieCardItems with live ticking `timeAgo`.
*/
export function normalizeMovieCardList(items, nowMs = Date.now()) {
	return deduplicateMovieCards(items || []).map((item, idx) => normalizeMovieCardItem(item, idx, nowMs));
}
/**
* Sorts all combined MovieCardItems from MovieBox HD, MovieLinkBD, and MyFlixBD naturally:
* 1. Top Hot/Dhamaka items lead at the top.
* 2. Brand-new uploads (minutes/hours ago) follow immediately so every newly uploaded title is visible.
* 3. Remaining current and archive items follow in natural recency and hype order without omitting any item.
*/
export function sortItemsByHotAndHype(items, nowMs = Date.now()) {
	const normalized = normalizeMovieCardList(items, nowMs);
	const mbHot = [];
	const mlbdHot = [];
	const otherHot = [];
	const tier2FreshUpload = [];
	const tier3Rest = [];
	for (const item of normalized) {
		const mins = getItemMinutesAgo(item, 0, nowMs);
		const p = String(item.path || "");
		if (item.isDhamaka || item.isHot) {
			if (p.startsWith("/mb/")) mbHot.push(item);
			else if (!p.startsWith("/mf/")) mlbdHot.push(item);
			else otherHot.push(item);
		} else if (mins <= 360) tier2FreshUpload.push(item);
		else tier3Rest.push(item);
	}
	mbHot.sort((a, b) => (b.hypeScore || 0) - (a.hypeScore || 0));
	mlbdHot.sort((a, b) => (b.hypeScore || 0) - (a.hypeScore || 0));
	otherHot.sort((a, b) => (b.hypeScore || 0) - (a.hypeScore || 0));
	tier2FreshUpload.sort((a, b) => getItemMinutesAgo(a, 0, nowMs) - getItemMinutesAgo(b, 0, nowMs));
	tier3Rest.sort((a, b) => getItemMinutesAgo(a, 0, nowMs) - getItemMinutesAgo(b, 0, nowMs));
	const interleavedHot = [];
	const maxHotLen = Math.max(mbHot.length, mlbdHot.length, otherHot.length);
	for (let i = 0; i < maxHotLen; i++) {
		if (i < mbHot.length) interleavedHot.push(mbHot[i]);
		if (i < mlbdHot.length) interleavedHot.push(mlbdHot[i]);
		if (i < otherHot.length) interleavedHot.push(otherHot[i]);
	}
	const topHotHead = interleavedHot.slice(0, 18);
	const remainingHot = interleavedHot.slice(18);
	return deduplicateMovieCards([
		...topHotHead,
		...tier2FreshUpload,
		...remainingHot,
		...tier3Rest
	]);
}
/**
* Sorts MovieCardItems by most recently uploaded first (minutes ago -> hours ago -> days ago).
*/
export function sortItemsByRecentUpload(items, nowMs = Date.now()) {
	return [...normalizeMovieCardList(items, nowMs)].sort((a, b) => {
		const mA = getItemMinutesAgo(a, 0, nowMs);
		const mB = getItemMinutesAgo(b, 0, nowMs);
		if (mA !== mB) return mA - mB;
		return (b.hypeScore || 0) - (a.hypeScore || 0);
	});
}
/**
* Sorts MovieCardItems by highest rating first, then hype score.
*/
export function sortItemsByHighRating(items, nowMs = Date.now()) {
	return [...normalizeMovieCardList(items, nowMs)].sort((a, b) => {
		const rA = parseFloat(a.rating || "8.0") || 8;
		const rB = parseFloat(b.rating || "8.0") || 8;
		if (rB !== rA) return rB - rA;
		return (b.hypeScore || 0) - (a.hypeScore || 0);
	});
}
/**
* Returns true if the item was uploaded within the last 60 minutes.
*/
export function isUploadedWithinMinutes(timeAgoStr) {
	const lower = (timeAgoStr || "").toLowerCase();
	return lower.includes("min") || lower.includes("sec") || lower.includes("just");
}