// @ts-nocheck
import React from "react";
import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { ArrowUpDown, Bell, BookOpen, Bookmark, Calendar, Captions, Check, ChevronDown, ChevronLeft, ChevronRight, CircleCheck, Clock, Copy, Download, FastForward, Film, Flame, FolderHeart, Globe, History, House, Layers, ListPlus, LoaderCircle, Maximize2, Maximize, MessageSquarePlus, Mic, Minimize2, Minimize, Pause, PictureInPicture2, Play, RefreshCw, RotateCcw, RotateCw, ScanLine, Search, Send, Server, Settings, Share2, Share, SlidersHorizontal, Smartphone, Sparkles, SquarePlus, Star, Sun, Trash2, Trophy, Tv, Upload, User, Volume2, VolumeX, WifiOff, X } from "lucide-react";
import { ALL_CATEGORIES, INITIAL_FALLBACK_MOVIES, TOP_10_THIS_WEEK_ITEMS } from "./data/categories";
import { usePWAInstall } from "./hooks/usePWAInstall";
import { deduplicateMovieCards, getItemMinutesAgo, isUploadedWithinMinutes, normalizeMovieCardItem, normalizeMovieCardList, sortItemsByHighRating, sortItemsByHotAndHype, sortItemsByRecentUpload } from "./utils/timeAgo";
import { getNotificationPosterUrl } from "./utils/securityShield";
import { getInstantCatalogCache, getInstantSuggestCache, prefetchMovieDetails, universalApiFetch } from "./services/liveClientEngine";
import { MovieDetailModal } from "./components/MovieDetailModal";
import { PWAInstallModal } from "./components/PWAInstallModal";
import { MovieRequestModal, getUploaderSiteInfo } from "./components/MovieRequestModal";
// src/App.tsx
var WATCHLIST_STORAGE_KEY = "cp_iphone_watchlist_v2";
var CONTINUE_STORAGE_KEY = "cp_iphone_continue_v2";
var RECENT_SEARCH_STORAGE_KEY = "cp_recent_searches_v1";
var ACTIVE_NODE_STORAGE_KEY = "cp_active_node_v1";
var READ_NOTIFS_STORAGE_KEY = "cp_read_notifications_v1";
var INSTANT_HOME_STORAGE_KEY = "cp_instant_home_v3";
var INSTANT_CATALOG_STORAGE_KEY = "cp_instant_catalog_v3";
function urlBase64ToUint8Array(base64String) {
	const padding = "=".repeat((4 - base64String.length % 4) % 4);
	const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
	const rawData = window.atob(base64);
	const outputArray = new Uint8Array(rawData.length);
	for (let i = 0; i < rawData.length; ++i) {
		outputArray[i] = rawData.charCodeAt(i);
	}
	return outputArray;
}
function parseViewsCount(viewsStr) {
	if (!viewsStr) return 0;
	const clean = viewsStr.toUpperCase().replace(/[^0-9.KM]/g, "");
	const num = parseFloat(clean) || 0;
	if (clean.includes("M")) return num * 1e6;
	if (clean.includes("K")) return num * 1e3;
	return num;
}
function formatResumeTime(sec) {
	if (!sec || sec < 5) return "Resume";
	const m = Math.floor(sec / 60);
	const s = Math.floor(sec % 60);
	return `${m}:${String(s).padStart(2, "0")}`;
}
function formatShortLanguage(lang) {
	const up = (lang || "").toUpperCase();
	if (up.includes("BANGLA") || up.includes("BENGALI")) return "Bengali";
	if (up.includes("HINDI")) return "Hindi";
	if (up.includes("TAMIL")) return "Tamil";
	if (up.includes("TELUGU")) return "Telugu";
	if (up.includes("JAP")) return "Anime";
	if (up.includes("KOR")) return "Korean";
	if (up.includes("DUAL") || up.includes("MULTI")) return "Dual Audio";
	return "English";
}
function getCardSourceInfo(_path) {
	return {
		id: "MOVIEBOX",
		label: "CinePulse",
		badgeClass: "bg-emerald-600/90 text-white border-emerald-400/40"
	};
}
function transliterateClientQuery(raw) {
	const trimmed = (raw || "").trim();
	if (!trimmed) return "";
	if (!/[\u0980-\u09FF]/.test(trimmed)) return trimmed.toLowerCase();
	const dict = [
		[/গোপাল\s*ভাঁড়|গোপাল\s*ভার/g, "gopal bhar"],
		[/গোপাল/g, "gopal"],
		[/গোলমাল/g, "golmaal"],
		[/তুফান/g, "toofan"],
		[/বহুরূপী/g, "bohurupi"],
		[/বরবাদ/g, "borbaad"],
		[/দাগি/g, "daagi"],
		[/চক্কর/g, "chokkor"],
		[/জংলি/g, "jongli"],
		[/তাণ্ডব/g, "tandob"],
		[/মির্জাপুর/g, "mirzapur"],
		[/পুষ্পা/g, "pushpa"],
		[/স্কুইড\s*গেম/g, "squid game"],
		[/ওয়ান\s*পিস|ওয়ান\s*পিস/g, "one piece"],
		[/নারুতো/g, "naruto"],
		[/পঞ্চায়েত|পঞ্চায়েত/g, "panchayat"],
		[/অ্যানিম্যাল|এনিমেল/g, "animal"],
		[/পাঠান/g, "pathaan"],
		[/জওয়ান|জওয়ান/g, "jawan"],
		[/কল্কি/g, "kalki"],
		[/স্ত্রী/g, "stree"],
		[/দৃশ্যম/g, "drishyam"],
		[/কেজিএফ/g, "kgf"],
		[/বাহুবলী/g, "baahubali"],
		[/সালার/g, "salaar"],
		[/লিও/g, "leo"],
		[/জেলার/g, "jailer"],
		[/ব্যাচেলর\s*পয়েন্ট|ব্যাচেলর\s*পয়েন্ট/g, "bachelor point"],
		[/হাওয়া|হাওয়া/g, "hawa"],
		[/সুড়ঙ্গ|সুড়ঙ্গ/g, "surongo"],
		[/প্রিয়তমা|প্রিয়তমা/g, "priyotoma"],
		[/রাজকুমার/g, "rajkumar"],
		[/দরদ/g, "dorod"]
	];
	let out = trimmed;
	for (const [rx, rep] of dict) out = out.replace(rx, ` ${rep} `);
	const charMap = {
		"অ": "o",
		"আ": "a",
		"ই": "i",
		"ঈ": "i",
		"উ": "u",
		"ঊ": "u",
		"ঋ": "ri",
		"এ": "e",
		"ঐ": "oi",
		"ও": "o",
		"ঔ": "ou",
		"া": "a",
		"ি": "i",
		"ী": "i",
		"ু": "u",
		"ূ": "u",
		"ৃ": "ri",
		"ে": "e",
		"ৈ": "oi",
		"ো": "o",
		"ৌ": "ou",
		"ক": "k",
		"খ": "kh",
		"গ": "g",
		"ঘ": "gh",
		"ঙ": "ng",
		"চ": "ch",
		"ছ": "chh",
		"জ": "j",
		"ঝ": "jh",
		"ঞ": "n",
		"ট": "t",
		"ঠ": "th",
		"ড": "d",
		"ঢ": "dh",
		"ণ": "n",
		"ত": "t",
		"থ": "th",
		"দ": "d",
		"ধ": "dh",
		"ন": "n",
		"প": "p",
		"ফ": "f",
		"ব": "b",
		"ভ": "bh",
		"ম": "m",
		"য": "j",
		"র": "r",
		"ল": "l",
		"শ": "sh",
		"ষ": "sh",
		"স": "s",
		"হ": "h",
		"ড়": "r",
		"ঢ়": "rh",
		"য়": "y",
		"ৎ": "t",
		"ং": "ng",
		"ঃ": "h",
		"ঁ": "",
		"্": "",
		"়": ""
	};
	let mapped = "";
	for (const ch of out) mapped += charMap[ch] !== void 0 ? charMap[ch] : ch;
	return mapped.replace(/\s+/g, " ").trim().toLowerCase();
}
export default function App() {
	const { isInstallable, isInstalled, isIOS, isOnline, install } = usePWAInstall();
	const [activeTab, setActiveTab] = React.useState("browse");
	const [currentCategory, setCurrentCategory] = React.useState(ALL_CATEGORIES[0]);
	const [currentPage, setCurrentPage] = React.useState(1);
	const [maxPage, setMaxPage] = React.useState(520);
	const [jumpPageInput, setJumpPageInput] = React.useState("");
	const [searchQuery, setSearchQuery] = React.useState("");
	const [submittedSearch, setSubmittedSearch] = React.useState("");
	const [suggestions, setSuggestions] = React.useState([]);
	const [loadingSuggestions, setLoadingSuggestions] = React.useState(false);
	const [showSearchDropdown, setShowSearchDropdown] = React.useState(false);
	const [searchTabFilter, setSearchTabFilter] = React.useState("ALL");
	const [recentSearches, setRecentSearches] = React.useState(() => {
		try {
			const raw = localStorage.getItem(RECENT_SEARCH_STORAGE_KEY);
			return raw ? JSON.parse(raw) : [
				"Tower of God [Hindi]",
				"Bohurupi",
				"Mirzapur",
				"One Piece"
			];
		} catch {
			return [
				"Tower of God [Hindi]",
				"Bohurupi",
				"Mirzapur"
			];
		}
	});
	const searchContainerRef = React.useRef(null);
	const searchInputRef = React.useRef(null);
	const [sourceFilter, setSourceFilter] = React.useState("ALL");
	const [audioFilter, setAudioFilter] = React.useState("ALL");
	const [qualityFilter, setQualityFilter] = React.useState("ALL");
	const [yearFilter, setYearFilter] = React.useState("ALL");
	const [sortBy, setSortBy] = React.useState("HOT_HYPE");
	const [activeNodeId, setActiveNodeId] = React.useState(() => {
		try {
			return localStorage.getItem(ACTIVE_NODE_STORAGE_KEY) || "node-moviebox";
		} catch {
			return "node-moviebox";
		}
	});
	const [items, setItems] = React.useState(() => {
		try {
			const cachedCat = localStorage.getItem(INSTANT_CATALOG_STORAGE_KEY);
			if (cachedCat) {
				const parsed = JSON.parse(cachedCat);
				if (Array.isArray(parsed) && parsed.length > 0) {
					return normalizeMovieCardList(parsed);
				}
			}
		} catch {}
		return sortItemsByHotAndHype(INITIAL_FALLBACK_MOVIES["/"]);
	});
	const [loadingCatalog, setLoadingCatalog] = React.useState(false);
	const [brokenImages, setBrokenImages] = React.useState({});
	const [showSplashScreen, setShowSplashScreen] = React.useState(false);
	const [selectedMovie, setSelectedMovie] = React.useState(() => {
		try {
			const params = new URLSearchParams(window.location.search);
			const watchPath = params.get("watch");
			const watchTitle = params.get("title") || "Featured Stream";
			if (watchPath) {
				const allSeed = [
					...TOP_10_THIS_WEEK_ITEMS,
					...Object.values(INITIAL_FALLBACK_MOVIES).flat()
				];
				const matched = allSeed.find((m) => m.path === watchPath);
				if (matched) return normalizeMovieCardItem(matched);
				return {
					id: watchPath.replace(/[^a-zA-Z0-9_-]/g, "_"),
					title: watchTitle,
					url: watchPath,
					path: watchPath,
					poster: "",
					quality: "1080p Full HD",
					views: "Live",
					language: "Multi Audio",
					typeBadge: watchPath.includes("/anime") ? "ANIME" : "MOVIE",
					timeAgo: "Instant Link",
					episodePill: "",
					isPinned: false,
					isAdult: false
				};
			}
		} catch {}
		return null;
	});
	const [isMiniPlayer, setIsMiniPlayer] = React.useState(false);
	const [liveClockNow, setLiveClockNow] = React.useState(() => Date.now());
	const [showInstallModal, setShowInstallModal] = React.useState(false);
	const [showRequestModal, setShowRequestModal] = React.useState(false);
	const [showNotifDrawer, setShowNotifDrawer] = React.useState(false);
	const [notifPermState, setNotifPermState] = React.useState(() => {
		try {
			return typeof Notification !== "undefined" ? Notification.permission : "default";
		} catch {
			return "default";
		}
	});
	const [requestPrefillTitle, setRequestPrefillTitle] = React.useState("");
	const [requestPrefillType, setRequestPrefillType] = React.useState("MOVIE");
	const [serverNotifications, setServerNotifications] = React.useState([]);
	const [pushedPhoneNotifIds, setPushedPhoneNotifIds] = React.useState(() => {
		try {
			const raw = localStorage.getItem(READ_NOTIFS_STORAGE_KEY);
			return raw ? JSON.parse(raw) : [];
		} catch {
			return [];
		}
	});
	const pushedSetRef = React.useRef(new Set(pushedPhoneNotifIds));
	React.useEffect(() => {
		const clockTimer = window.setInterval(() => {
			setLiveClockNow(Date.now());
		}, 18e4);
		return () => window.clearInterval(clockTimer);
	}, []);
	React.useEffect(() => {
		const timer = window.setTimeout(() => {
			setShowSplashScreen(false);
		}, 450);
		return () => window.clearTimeout(timer);
	}, []);
	const [watchlistFolderTab, setWatchlistFolderTab] = React.useState("all");
	const backupInputRef = React.useRef(null);
	const [latest3SiteUploads, setLatest3SiteUploads] = React.useState([]);
	const [refreshing24h, setRefreshing24h] = React.useState(false);
	const [mbHomeData, setMbHomeData] = React.useState(() => {
		try {
			const raw = localStorage.getItem(INSTANT_HOME_STORAGE_KEY);
			return raw ? JSON.parse(raw) : null;
		} catch {
			return null;
		}
	});
	const [bookedComingSoonIds, setBookedComingSoonIds] = React.useState(() => {
		try {
			const raw = localStorage.getItem("cp_mb_booked_coming_soon_v1");
			return raw ? JSON.parse(raw) : {};
		} catch {
			return {};
		}
	});
	const toggleBookComingSoon = React.useCallback((id) => {
		setBookedComingSoonIds((prev) => {
			const next = {
				...prev,
				[id]: !prev[id]
			};
			try {
				localStorage.setItem("cp_mb_booked_coming_soon_v1", JSON.stringify(next));
			} catch {}
			return next;
		});
	}, []);
	React.useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				const res = await universalApiFetch("/api/mb-home");
				if (!cancelled && res && res.ok) {
					setMbHomeData(res);
					try {
						localStorage.setItem(INSTANT_HOME_STORAGE_KEY, JSON.stringify(res));
					} catch {}
				}
			} catch {}
		})();
		return () => {
			cancelled = true;
		};
	}, []);
	const refreshLatest3SiteUploads = React.useCallback(async (force = false) => {
		setRefreshing24h(true);
		try {
			const data = await universalApiFetch(`/api/catalog${force ? "?path=/new-uploads&page=1&refresh=1" : "?path=/new-uploads&page=1"}`);
			if (data && Array.isArray(data.items) && data.items.length > 0) setLatest3SiteUploads(data.items);
		} catch {} finally {
			setRefreshing24h(false);
		}
	}, []);
	React.useEffect(() => {
		if (showRequestModal) refreshLatest3SiteUploads(true);
	}, [showRequestModal, refreshLatest3SiteUploads]);
	const [watchlist, setWatchlist] = React.useState(() => {
		try {
			const raw = localStorage.getItem(WATCHLIST_STORAGE_KEY);
			return raw ? JSON.parse(raw) : [];
		} catch {
			return [];
		}
	});
	const [continueWatching, setContinueWatching] = React.useState(() => {
		try {
			const raw = localStorage.getItem(CONTINUE_STORAGE_KEY);
			return (raw ? JSON.parse(raw) : []).map((entry) => ({
				...entry,
				movie: {
					...entry.movie,
					uploadedAtMs: void 0
				}
			}));
		} catch {
			return [];
		}
	});
	React.useEffect(() => {
		try {
			localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(watchlist));
		} catch {}
	}, [watchlist]);
	React.useEffect(() => {
		try {
			localStorage.setItem(CONTINUE_STORAGE_KEY, JSON.stringify(continueWatching));
		} catch {}
	}, [continueWatching]);
	React.useEffect(() => {
		try {
			localStorage.setItem(RECENT_SEARCH_STORAGE_KEY, JSON.stringify(recentSearches));
		} catch {}
	}, [recentSearches]);
	React.useEffect(() => {
		try {
			localStorage.setItem(ACTIVE_NODE_STORAGE_KEY, activeNodeId);
		} catch {}
	}, [activeNodeId]);
	React.useEffect(() => {
		if (showSearchDropdown) window.setTimeout(() => {
			searchInputRef.current?.focus();
		}, 20);
	}, [showSearchDropdown]);
	const localSearchPool = React.useMemo(() => {
		return deduplicateMovieCards([
			...items,
			...mbHomeData?.banners || [],
			...(mbHomeData?.sections || []).flatMap((s) => s.items || []),
			...TOP_10_THIS_WEEK_ITEMS,
			...Object.values(INITIAL_FALLBACK_MOVIES).flat()
		]);
	}, [items, mbHomeData]);
	React.useEffect(() => {
		const q = searchQuery.trim();
		if (q.length < 1) {
			setSuggestions([]);
			setLoadingSuggestions(false);
			return;
		}
		const lower = q.toLowerCase();
		const romanQ = transliterateClientQuery(q);
		const qWords = Array.from(new Set(`${lower} ${romanQ}`.split(/\s+/).map((w) => w.replace(/[^a-z0-9\u0980-\u09FF]/gi, "")).filter((w) => w.length >= 2)));
		const localInstant = deduplicateMovieCards([...getInstantSuggestCache(q) || getInstantSuggestCache(romanQ) || [], ...localSearchPool.filter((item) => {
			const hay = `${item?.title || ""} ${item?.language || ""} ${item?.sportGenre || ""}`.toLowerCase();
			if (hay.includes(lower) || romanQ && hay.includes(romanQ)) return true;
			return qWords.length > 0 && qWords.some((w) => w.length >= 3 && hay.includes(w));
		})]).slice(0, 36);
		if (localInstant.length > 0) setSuggestions(localInstant);
		let cancelled = false;
		const abortCtrl = new AbortController();
		setLoadingSuggestions(true);
		const timer = setTimeout(async () => {
			try {
				const data = await universalApiFetch(`/api/suggest?${new URLSearchParams({
					q,
					node: activeNodeId
				}).toString()}`, { signal: abortCtrl.signal });
				if (!cancelled && data && Array.isArray(data.items) && data.items.length > 0) {
					const mergedAllSites = deduplicateMovieCards([...data.items, ...localInstant]).slice(0, 48);
					setSuggestions(mergedAllSites);
				}
			} catch {} finally {
				if (!cancelled) setLoadingSuggestions(false);
			}
		}, 15);
		return () => {
			cancelled = true;
			abortCtrl.abort();
			clearTimeout(timer);
		};
	}, [
		searchQuery,
		activeNodeId,
		localSearchPool
	]);
	const fetchCatalog = React.useCallback(async (path, page, query, nodeId, forceRefresh = false, silent = false) => {
		if (!silent) setLoadingCatalog(true);
		try {
			const data = await universalApiFetch(`/api/catalog?${new URLSearchParams({
				path,
				page: String(page),
				q: query,
				node: nodeId,
				...forceRefresh ? { refresh: "1" } : {}
			}).toString()}`);
			if (data && Array.isArray(data.items) && data.items.length > 0) {
				const normalized = normalizeMovieCardList(data.items);
				setItems(normalized);
				if (path === "/" && page === 1 && !query) {
					try {
						localStorage.setItem(INSTANT_CATALOG_STORAGE_KEY, JSON.stringify(normalized.slice(0, 36)));
					} catch {}
				}
				if (data.maxPage) setMaxPage(data.maxPage);
				if (!silent) setLoadingCatalog(false);
				return;
			}
		} catch {} finally {
			if (!silent) setLoadingCatalog(false);
		}
	}, []);
	React.useEffect(() => {
		fetchCatalog(currentCategory.path, currentPage, submittedSearch, activeNodeId);
	}, [
		currentCategory.path,
		currentPage,
		submittedSearch,
		activeNodeId,
		fetchCatalog
	]);
	React.useEffect(() => {
		if (selectedMovie) return;
		const interval = setInterval(() => {
			if (document.visibilityState === "visible" && activeTab === "browse") {
				setLiveClockNow(Date.now());
				fetchCatalog(currentCategory.path, currentPage, submittedSearch, activeNodeId, true, true);
			}
		}, 45e3);
		const handleVisibility = () => {
			if (document.visibilityState === "visible" && activeTab === "browse" && !selectedMovie) {
				setLiveClockNow(Date.now());
				fetchCatalog(currentCategory.path, currentPage, submittedSearch, activeNodeId, false, true);
			}
		};
		document.addEventListener("visibilitychange", handleVisibility);
		return () => {
			clearInterval(interval);
			document.removeEventListener("visibilitychange", handleVisibility);
		};
	}, [
		activeTab,
		currentCategory.path,
		currentPage,
		submittedSearch,
		activeNodeId,
		selectedMovie,
		fetchCatalog
	]);
	React.useEffect(() => {
		if (selectedMovie && !isMiniPlayer || showInstallModal || showRequestModal) document.body.style.overflow = "hidden";
		else document.body.style.overflow = "";
		return () => {
			document.body.style.overflow = "";
		};
	}, [
		selectedMovie,
		isMiniPlayer,
		showInstallModal,
		showRequestModal
	]);
	React.useEffect(() => {
		pushedSetRef.current = new Set(pushedPhoneNotifIds);
		try {
			localStorage.setItem(READ_NOTIFS_STORAGE_KEY, JSON.stringify(pushedPhoneNotifIds.slice(-150)));
		} catch {}
	}, [pushedPhoneNotifIds]);
	const subscribeToWebPush = React.useCallback(async () => {
		if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) return false;
		try {
			const reg = await navigator.serviceWorker.ready;
			if (!reg?.pushManager) return false;
			let sub = await reg.pushManager.getSubscription();
			if (!sub) {
				const vapidRes = await fetch("/api/push/vapid-public-key").then((r) => r.ok ? r.json() : null).catch(() => null);
				if (!vapidRes?.publicKey) return false;
				sub = await reg.pushManager.subscribe({
					userVisibleOnly: true,
					applicationServerKey: urlBase64ToUint8Array(vapidRes.publicKey)
				});
			}
			if (sub) {
				await fetch("/api/push/subscribe", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ subscription: sub })
				}).catch(() => {});
				return true;
			}
		} catch {}
		return false;
	}, []);
	React.useEffect(() => {
		if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
		navigator.serviceWorker.register("./sw-push.js", { updateViaCache: "none" }).then((reg) => {
			reg.update().catch(() => {});
			if (typeof Notification !== "undefined" && Notification.permission === "granted") {
				void subscribeToWebPush();
			}
		}).catch(() => {});
		const handleSwMessage = (event) => {
			if ((event.data?.type === "CINEPULSE_OPEN_MOVIE" || event.data?.type === "CINEPULSE_NOTIFICATION_CLICK") && event.data.movie) {
				setIsMiniPlayer(false);
				setSelectedMovie(normalizeMovieCardItem(event.data.movie));
			}
		};
		navigator.serviceWorker.addEventListener("message", handleSwMessage);
		return () => navigator.serviceWorker.removeEventListener("message", handleSwMessage);
	}, [subscribeToWebPush]);
	const sendNativePhoneNotification = React.useCallback((notif) => {
		if (typeof window === "undefined" || !("Notification" in window)) return false;
		if (Notification.permission !== "granted") return false;
		const deepLinkUrl = `${window.location.origin}${window.location.pathname}?watch=${encodeURIComponent(notif.movie.path)}&title=${encodeURIComponent(notif.movie.title)}`;
		const posterThumb = getNotificationPosterUrl(notif.movie.poster) || "./pwa-192x192.png";
		const compactTitle = notif.headlineBn;
		const options = {
			body: "\u200B",
			icon: posterThumb,
			badge: "./notif-badge.png",
			tag: notif.id,
			renotify: true,
			requireInteraction: false,
			silent: false,
			vibrate: [
				180,
				80,
				180
			],
			data: {
				url: deepLinkUrl,
				movie: notif.movie,
				movieId: notif.movie.id
			}
		};
		try {
			if ("serviceWorker" in navigator) navigator.serviceWorker.ready.then((reg) => {
				if (reg.active) reg.active.postMessage({
					type: "CINEPULSE_SHOW_OS_NOTIFICATION",
					title: compactTitle,
					body: "",
					poster: posterThumb,
					tag: notif.id,
					url: deepLinkUrl,
					movieId: notif.movie.id
				});
				else reg.showNotification(compactTitle, options);
			}).catch(() => {
				const n = new Notification(compactTitle, options);
				n.onclick = () => {
					window.focus();
					setIsMiniPlayer(false);
					setSelectedMovie(notif.movie);
					n.close();
				};
			});
			else {
				const n = new Notification(compactTitle, options);
				n.onclick = () => {
					window.focus();
					setIsMiniPlayer(false);
					setSelectedMovie(notif.movie);
					n.close();
				};
			}
			return true;
		} catch {
			return false;
		}
	}, []);
	const fetchGlobalNotifications = React.useCallback(async () => {
		try {
			const data = await universalApiFetch("/api/notifications");
			if (data && Array.isArray(data.notifications) && data.notifications.length > 0) setServerNotifications(data.notifications);
		} catch {}
	}, []);
	React.useEffect(() => {
		if (selectedMovie) return;
		fetchGlobalNotifications();
		const timer = window.setInterval(() => {
			fetchGlobalNotifications();
		}, 35e3);
		return () => window.clearInterval(timer);
	}, [fetchGlobalNotifications, selectedMovie]);
	const allNotifications = React.useMemo(() => {
		const merged = [...serverNotifications];
		const seenIds = new Set(merged.map((n) => n.id));
		const seenMoviePaths = new Set(merged.map((n) => n.movie.path));
		const cleanItems = normalizeMovieCardList([
			...mbHomeData?.banners || [],
			...items,
			...TOP_10_THIS_WEEK_ITEMS
		].filter((i) => !i.isAdult), liveClockNow);
		const recentList = sortItemsByRecentUpload(cleanItems, liveClockNow).slice(0, 10);
		const popularHighRated = sortItemsByHighRating(cleanItems, liveClockNow).slice(0, 10);
		const minsList = [
			1,
			5,
			12,
			23,
			35,
			48,
			65,
			90,
			120,
			165
		];
		const compactHooks = [
			"Hero? Not quite. Legend? Absolutely.",
			"Is back—what will happen next?",
			"Heating up—tap to watch now!",
			"Every secret has a price. Watch now!",
			"Unstoppable action. Stream in Full HD!",
			"The wait is over—new episode live!"
		];
		const createClientNotif = (it, idx, category) => {
			const cleanTitle = it.title.replace(/\s*\((?:19|20)\d{2}\)\s*/g, " ").replace(/\s*\[[^\]]*\]\s*/g, " ").replace(/\s+/g, " ").trim();
			const rawDesc = String(it.description || "").trim();
			const ratingNum = parseFloat(it.rating || "8.8") || 8.8;
			const shortDesc = rawDesc && rawDesc.length <= 52 ? rawDesc : compactHooks[idx % compactHooks.length];
			const headline = `${cleanTitle} — ${shortDesc}`;
			const mins = minsList[idx % minsList.length];
			const timeBadge = mins <= 2 ? "Just now" : mins < 60 ? `${mins}m ago` : `${Math.floor(mins / 60)}h ago`;
			return {
				id: `notif-${category === "NEW_UPLOAD" ? "new" : "pop"}-${it.id}`,
				category,
				badgeText: timeBadge,
				headlineBn: headline,
				subtitleBn: "",
				movie: it,
				createdAt: Math.max(liveClockNow - mins * 6e4, liveClockNow - 864e5),
				ratingScore: ratingNum
			};
		};
		const maxLen = Math.max(recentList.length, popularHighRated.length);
		let synthIdx = merged.length;
		for (let i = 0; i < maxLen; i++) {
			const newIt = recentList[i];
			if (newIt && !seenMoviePaths.has(newIt.path)) {
				const notif = createClientNotif(newIt, synthIdx++, "NEW_UPLOAD");
				if (!seenIds.has(notif.id)) {
					seenIds.add(notif.id);
					seenMoviePaths.add(newIt.path);
					merged.push(notif);
				}
			}
			const popIt = popularHighRated[i];
			if (popIt && !seenMoviePaths.has(popIt.path)) {
				const notif = createClientNotif(popIt, synthIdx++, "TOP_RATED_POPULAR");
				if (!seenIds.has(notif.id)) {
					seenIds.add(notif.id);
					seenMoviePaths.add(popIt.path);
					merged.push(notif);
				}
			}
		}
		return merged.slice(0, 30);
	}, [
		serverNotifications,
		mbHomeData,
		items,
		liveClockNow
	]);
	const handleEnableAndSendNotification = React.useCallback(async () => {
		if (typeof window === "undefined" || !("Notification" in window)) return;
		try {
			const perm = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
			setNotifPermState(perm);
			if (perm === "granted") {
				void subscribeToWebPush();
				const nextUnseen = allNotifications.find((n) => !pushedSetRef.current.has(n.id)) || allNotifications[0];
				if (nextUnseen) {
					pushedSetRef.current.add(nextUnseen.id);
					setPushedPhoneNotifIds((prev) => prev.includes(nextUnseen.id) ? prev : [...prev, nextUnseen.id]);
					sendNativePhoneNotification(nextUnseen);
				}
			}
		} catch {}
	}, [allNotifications, sendNativePhoneNotification, subscribeToWebPush]);
	React.useEffect(() => {
		if (typeof window === "undefined" || !("Notification" in window) || allNotifications.length === 0) return;
		const deliverNextUnseenPhoneNotification = () => {
			if (Notification.permission !== "granted") return;
			void subscribeToWebPush();
			const nextUnseen = allNotifications.find((n) => !pushedSetRef.current.has(n.id));
			if (!nextUnseen) return;
			pushedSetRef.current.add(nextUnseen.id);
			setPushedPhoneNotifIds((prev) => prev.includes(nextUnseen.id) ? prev : [...prev, nextUnseen.id]);
			sendNativePhoneNotification(nextUnseen);
		};
		if (Notification.permission === "granted") {
			const timer = window.setTimeout(deliverNextUnseenPhoneNotification, 900);
			return () => window.clearTimeout(timer);
		}
		if (Notification.permission === "default") {
			const requestOnFirstGesture = () => {
				Notification.requestPermission().then((perm) => {
					setNotifPermState(perm);
					if (perm === "granted") deliverNextUnseenPhoneNotification();
				}).catch(() => {});
				window.removeEventListener("pointerdown", requestOnFirstGesture);
				window.removeEventListener("keydown", requestOnFirstGesture);
			};
			window.addEventListener("pointerdown", requestOnFirstGesture, {
				once: true,
				passive: true
			});
			window.addEventListener("keydown", requestOnFirstGesture, {
				once: true,
				passive: true
			});
			return () => {
				window.removeEventListener("pointerdown", requestOnFirstGesture);
				window.removeEventListener("keydown", requestOnFirstGesture);
			};
		}
	}, [allNotifications, sendNativePhoneNotification, subscribeToWebPush]);
	React.useEffect(() => {
		try {
			const params = new URLSearchParams(window.location.search);
			const watchPath = params.get("watch");
			if (watchPath) {
				prefetchMovieDetails(watchPath, params.get("title") || "", activeNodeId, true);
				const matched = items.find((m) => m.path === watchPath) || TOP_10_THIS_WEEK_ITEMS.find((m) => m.path === watchPath);
				if (matched) setSelectedMovie(matched);
			}
		} catch {}
	}, [items, activeNodeId]);
	React.useEffect(() => {
		if (Boolean(selectedMovie && !isMiniPlayer || showInstallModal || showRequestModal)) window.history.pushState({ cinepulseModal: true }, "");
		const handlePopState = () => {
			if (selectedMovie && !isMiniPlayer) setIsMiniPlayer(true);
			else if (showRequestModal) setShowRequestModal(false);
			else if (showInstallModal) setShowInstallModal(false);
		};
		window.addEventListener("popstate", handlePopState);
		return () => window.removeEventListener("popstate", handlePopState);
	}, [
		selectedMovie,
		isMiniPlayer,
		showInstallModal,
		showRequestModal
	]);
	const saveRecentSearch = (term) => {
		const cleaned = term.trim();
		if (!cleaned) return;
		setRecentSearches((prev) => [cleaned, ...prev.filter((s) => s.toLowerCase() !== cleaned.toLowerCase())].slice(0, 8));
	};
	const handleSelectCategory = (cat) => {
		setCurrentCategory(cat);
		setCurrentPage(1);
		setSubmittedSearch("");
		setSearchQuery("");
		setAudioFilter("ALL");
		setQualityFilter("ALL");
		setYearFilter("ALL");
		setShowSearchDropdown(false);
		setActiveTab("browse");
		const ramHit = getInstantCatalogCache(cat.path, 1, "", activeNodeId);
		if (ramHit && ramHit.items.length > 0) {
			setItems(normalizeMovieCardList(ramHit.items));
			setMaxPage(ramHit.maxPage);
			return;
		}
		const matchingShelves = (mbHomeData?.sections || []).filter((s) => {
			if (s.categoryPath === cat.path) return true;
			const st = (s.title || "").toLowerCase();
			const cp = cat.path.toLowerCase();
			if (cp === "/mostwatch/7d") return /trending|hot|popular|top/i.test(st);
			if (cp === "/type/movies") return /movie|bollywood|hollywood|bengali|south/i.test(st);
			if (cp === "/type/series") return /series|drama|tv|show/i.test(st);
			if (cp === "/anime" || cp === "/category/anime-hindi") return /anime|animation/i.test(st);
			if (cp === "/language/bangla") return /bengali|bangla/i.test(st);
			if (cp === "/bollywood") return /bollywood|hindi/i.test(st);
			if (cp === "/southindian") return /south|tamil|telugu/i.test(st);
			if (cp === "/language/english") return /hollywood|english|western/i.test(st);
			if (cp === "/drama") return /drama|korean|k-drama|asian/i.test(st);
			if (cp === "/category/short-tv") return /short|drama/i.test(st);
			if (cp === "/category/western-tv") return /western|hollywood|series/i.test(st);
			return false;
		}).flatMap((s) => s.items || []);
		const fallbackSeed = INITIAL_FALLBACK_MOVIES[cat.path] || [];
		const instantSeed = deduplicateMovieCards([...matchingShelves, ...fallbackSeed]);
		if (instantSeed.length > 0) setItems(normalizeMovieCardList(instantSeed));
	};
	const handleSearchSubmit = (e) => {
		e.preventDefault();
		const trimmed = searchQuery.trim();
		setSourceFilter("ALL");
		setSubmittedSearch(trimmed);
		if (trimmed) {
			saveRecentSearch(trimmed);
			if (suggestions.length > 0) setItems(normalizeMovieCardList(suggestions));
		}
		setCurrentPage(1);
		setShowSearchDropdown(false);
		setActiveTab("browse");
	};
	const handleTriggerActorSearch = (actorName) => {
		setSourceFilter("ALL");
		setSearchQuery(actorName);
		setSubmittedSearch(actorName);
		saveRecentSearch(actorName);
		setCurrentPage(1);
		setActiveTab("browse");
		window.scrollTo({
			top: 0,
			behavior: "smooth"
		});
	};
	const handlePageChange = (newPage) => {
		setCurrentPage(Math.max(1, Math.min(maxPage, newPage)));
		window.scrollTo({
			top: 0,
			behavior: "smooth"
		});
	};
	const handleJumpPage = (e) => {
		e.preventDefault();
		const parsed = parseInt(jumpPageInput, 10);
		if (!isNaN(parsed) && parsed >= 1) {
			handlePageChange(parsed);
			setJumpPageInput("");
		}
	};
	const handleToggleWatchlist = React.useCallback((movie, folder = "favorites") => {
		setWatchlist((prev) => {
			const existing = prev.find((m) => m.path === movie.path || m.title === movie.title);
			if (existing) {
				if (existing.folder !== folder) return prev.map((m) => m.path === movie.path || m.title === movie.title ? {
					...m,
					folder
				} : m);
				return prev.filter((m) => m.path !== movie.path && m.title !== movie.title);
			}
			const defaultFolder = movie.typeBadge === "ANIME" || movie.typeBadge === "SERIES" || movie.typeBadge === "DRAMA" ? "anime_series" : folder;
			return [{
				...movie,
				folder: defaultFolder
			}, ...prev];
		});
	}, []);
	const handleRecordWatchProgress = React.useCallback((movie, episode, episodeIdx, source, seconds, duration) => {
		setContinueWatching((prev) => {
			const existing = prev.find((p) => p.movie.path === movie.path || p.movie.title === movie.title);
			const filtered = prev.filter((p) => p.movie.path !== movie.path && p.movie.title !== movie.title);
			return [{
				movie,
				episodeId: episode?.id ?? existing?.episodeId,
				episodeIdx: episodeIdx ?? existing?.episodeIdx ?? 0,
				episodeLabel: episode?.label ?? existing?.episodeLabel,
				quality: source?.quality ?? existing?.quality,
				audio: source?.audio ?? existing?.audio,
				updatedAt: Date.now(),
				progressSeconds: seconds && seconds > 0 ? seconds : existing?.progressSeconds || 0,
				durationSeconds: duration && duration > 0 ? duration : existing?.durationSeconds || 0
			}, ...filtered].slice(0, 18);
		});
	}, []);
	React.useEffect(() => {
		if (selectedMovie) handleRecordWatchProgress(selectedMovie);
	}, [selectedMovie, handleRecordWatchProgress]);
	const handleExportWatchlist = () => {
		const payload = {
			exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
			watchlist,
			continueWatching
		};
		const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = "CinePulse_Backup.json";
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
	};
	const handleImportWatchlist = async (e) => {
		const file = e.target.files?.[0];
		if (!file) return;
		try {
			const text = await file.text();
			const parsed = JSON.parse(text);
			if (Array.isArray(parsed.watchlist)) setWatchlist(parsed.watchlist);
			if (Array.isArray(parsed.continueWatching)) setContinueWatching(parsed.continueWatching);
		} catch {}
	};
	const [audioPoolItems, setAudioPoolItems] = React.useState([]);
	React.useEffect(() => {
		if (audioFilter === "ALL") {
			setAudioPoolItems([]);
			return;
		}
		const targetPath = {
			BANGLA: "/language/bangla",
			HINDI: "/language/hindi",
			DUAL: "/category/dual-audio",
			SUB: "/genre/animation"
		}[audioFilter];
		if (!targetPath) return;
		let cancelled = false;
		universalApiFetch(`/api/catalog?${new URLSearchParams({
			path: targetPath,
			page: String(currentPage),
			q: submittedSearch,
			node: activeNodeId
		}).toString()}`).then((data) => {
			if (!cancelled && data && Array.isArray(data.items) && data.items.length > 0) setAudioPoolItems(normalizeMovieCardList(data.items));
		}).catch(() => {});
		return () => {
			cancelled = true;
		};
	}, [
		audioFilter,
		currentPage,
		submittedSearch,
		activeNodeId
	]);
	const displayedItems = React.useMemo(() => {
		let list = normalizeMovieCardList(audioFilter === "ALL" ? items : deduplicateMovieCards([
			...items,
			...audioPoolItems,
			...(mbHomeData?.sections || []).flatMap((s) => s.items || []),
			...Object.values(INITIAL_FALLBACK_MOVIES).flat()
		]), liveClockNow);
		if (sourceFilter !== "ALL") list = list.filter((i) => getCardSourceInfo(i.path).id === sourceFilter);
		if (audioFilter !== "ALL") list = list.filter((i) => {
			const lang = (i.language + " " + i.title).toUpperCase();
			if (audioFilter === "BANGLA") return lang.includes("BANGLA") || lang.includes("BENGALI");
			if (audioFilter === "HINDI") return lang.includes("HINDI");
			if (audioFilter === "DUAL") return lang.includes("DUAL") || lang.includes("MULTI");
			if (audioFilter === "SUB") return lang.includes("SUB") || lang.includes("JAP") || lang.includes("KOR") || i.typeBadge === "ANIME";
			return true;
		});
		if (qualityFilter !== "ALL") list = list.filter((i) => {
			const q = (i.quality + " " + i.title).toUpperCase();
			if (qualityFilter === "4K") return q.includes("4K") || q.includes("2160P") || q.includes("UHD");
			if (qualityFilter === "1080P") return q.includes("1080P") || q.includes("FULL HD") || q.includes("FHD");
			if (qualityFilter === "WEBDL") return q.includes("WEB-DL") || q.includes("WEBRIP") || q.includes("BLURAY");
			if (qualityFilter === "HDTC") return q.includes("HDTC") || q.includes("CAM") || q.includes("HDTS");
			return true;
		});
		if (yearFilter !== "ALL") list = list.filter((i) => {
			const t = i.title;
			if (yearFilter === "2026") return t.includes("2026");
			if (yearFilter === "2025") return t.includes("2025");
			if (yearFilter === "OLDER") return !t.includes("2026") && !t.includes("2025");
			return true;
		});
		const isActivelySearching = Boolean(submittedSearch.trim() || searchQuery.trim());
		if (sortBy === "HOT_HYPE") {
			if (!isActivelySearching) list = sortItemsByHotAndHype(list, liveClockNow);
		} else if (sortBy === "LATEST") list.sort((a, b) => getItemMinutesAgo(a, 0, liveClockNow) - getItemMinutesAgo(b, 0, liveClockNow));
		else if (sortBy === "RATING") list = sortItemsByHighRating(list, liveClockNow);
		else if (sortBy === "VIEWS") list.sort((a, b) => parseViewsCount(b.views) - parseViewsCount(a.views));
		else if (sortBy === "TITLE") list.sort((a, b) => a.title.localeCompare(b.title));
		return list;
	}, [
		items,
		audioPoolItems,
		mbHomeData,
		sourceFilter,
		audioFilter,
		qualityFilter,
		yearFilter,
		sortBy,
		submittedSearch,
		searchQuery,
		liveClockNow
	]);
	const heroSlides = React.useMemo(() => {
		const seen = /* @__PURE__ */ new Set();
		const slides = [];
		const pushUnique = (list) => {
			for (const item of list) {
				if (!item?.title || !item?.path) continue;
				if (!(item.previewImage || item.poster) || brokenImages[item.id]) continue;
				if (currentCategory.path !== "/adult18plus" && item.isAdult) continue;
				const tk = item.title.toLowerCase().replace(/[^a-z0-9]/g, "");
				if (!seen.has(item.path) && !seen.has(tk)) {
					seen.add(item.path);
					seen.add(tk);
					slides.push(item);
					if (slides.length >= 10) break;
				}
			}
		};
		if (currentCategory.path === "/") {
			const mbBanners = mbHomeData?.banners || [];
			const sectionLeads = (mbHomeData?.sections || []).flatMap((s) => (s.items || []).slice(0, 2));
			pushUnique(normalizeMovieCardList([
				...mbBanners,
				...sectionLeads,
				...TOP_10_THIS_WEEK_ITEMS,
				...displayedItems,
				...INITIAL_FALLBACK_MOVIES["/"] || []
			]));
		} else {
			const fallbackCat = INITIAL_FALLBACK_MOVIES[currentCategory.path] || [];
			pushUnique(normalizeMovieCardList([...displayedItems, ...fallbackCat]));
		}
		return slides.length > 0 ? slides.slice(0, 10) : displayedItems.slice(0, 10);
	}, [
		mbHomeData,
		displayedItems,
		brokenImages,
		currentCategory.path
	]);
	const [heroSlideIdx, setHeroSlideIdx] = React.useState(0);
	const heroTouchStartXRef = React.useRef(null);
	const heroMiniStripRef = React.useRef(null);
	React.useEffect(() => {
		setHeroSlideIdx(0);
	}, [currentCategory.path]);
	React.useEffect(() => {
		heroSlides.slice(0, 6).forEach((slide) => {
			const src = slide.previewImage || slide.poster;
			if (src) {
				const img = new Image();
				img.referrerPolicy = "no-referrer";
				img.src = src;
			}
		});
	}, [heroSlides]);
	React.useEffect(() => {
		if (activeTab !== "browse" || selectedMovie || submittedSearch || currentPage !== 1) return;
		if (heroSlides.length <= 1) return;
		const timer = window.setInterval(() => {
			setHeroSlideIdx((prev) => (prev + 1) % heroSlides.length);
		}, 3200);
		return () => window.clearInterval(timer);
	}, [
		activeTab,
		selectedMovie,
		submittedSearch,
		currentPage,
		heroSlides.length,
		currentCategory.path
	]);
	const safeSlideIdx = heroSlides.length > 0 ? heroSlideIdx % heroSlides.length : 0;
	React.useEffect(() => {
		const strip = heroMiniStripRef.current;
		if (!strip || heroSlides.length <= 1) return;
		const activeEl = strip.children[safeSlideIdx];
		if (activeEl) {
			const targetLeft = Math.max(0, activeEl.offsetLeft - strip.clientWidth / 2 + activeEl.clientWidth / 2);
			strip.scrollTo({
				left: targetLeft,
				behavior: "smooth"
			});
		}
	}, [safeSlideIdx, heroSlides.length]);
	const spotlightItem = React.useMemo(() => {
		return heroSlides[safeSlideIdx] || displayedItems.find((i) => i.poster) || displayedItems[0] || INITIAL_FALLBACK_MOVIES["/"][0];
	}, [
		heroSlides,
		safeSlideIdx,
		displayedItems
	]);
	const heroMiniCards = React.useMemo(() => {
		if (heroSlides.length === 0) return displayedItems.slice(0, 6);
		return heroSlides.slice(0, 10);
	}, [heroSlides, displayedItems]);
	const top10ThisWeekItems = React.useMemo(() => {
		const merged = [];
		const seen = /* @__PURE__ */ new Set();
		const combined = normalizeMovieCardList([...TOP_10_THIS_WEEK_ITEMS, ...displayedItems]);
		for (const item of combined) {
			const tk = item.title.toLowerCase().replace(/[^a-z0-9]/g, "");
			if (!seen.has(item.path) && !seen.has(tk) && item.poster && !brokenImages[item.id]) {
				seen.add(item.path);
				seen.add(tk);
				merged.push(item);
				if (merged.length >= 10) break;
			}
		}
		return merged.slice(0, 10);
	}, [displayedItems, brokenImages]);
	const last24hItems = React.useMemo(() => {
		const recentPool = [];
		const seen = /* @__PURE__ */ new Set();
		const combined = normalizeMovieCardList([
			...latest3SiteUploads,
			...items,
			...TOP_10_THIS_WEEK_ITEMS,
			...INITIAL_FALLBACK_MOVIES["/"]
		], liveClockNow);
		for (let idx = 0; idx < combined.length; idx++) {
			const item = combined[idx];
			if (!item?.title || !item?.path) continue;
			if (seen.has(item.path)) continue;
			const yearMatch = item.title.match(/\((19\d{2}|20[0-2]\d)\)/);
			if (yearMatch) {
				if (parseInt(yearMatch[1], 10) <= 2024 && !item.episodePill) continue;
			}
			if (getItemMinutesAgo(item, idx, liveClockNow) <= 1440 || item.title.includes("2026") || item.title.includes("2025")) {
				seen.add(item.path);
				recentPool.push(item);
			}
		}
		const mb = recentPool.filter((i) => i.path?.startsWith("/mb/"));
		const mf = recentPool.filter((i) => i.path?.startsWith("/mf/"));
		const mlbd = recentPool.filter((i) => !i.path?.startsWith("/mb/") && !i.path?.startsWith("/mf/"));
		const interleaved = [];
		const maxLen = Math.max(mb.length, mlbd.length, mf.length);
		for (let i = 0; i < maxLen; i++) {
			if (i < mlbd.length) interleaved.push(mlbd[i]);
			if (i < mb.length) interleaved.push(mb[i]);
			if (i < mf.length) interleaved.push(mf[i]);
		}
		return interleaved.length >= 8 ? interleaved : combined.slice(0, 36);
	}, [
		latest3SiteUploads,
		items,
		liveClockNow
	]);
	React.useEffect(() => {
		const timer = window.setTimeout(() => {
			const toWarm = [spotlightItem, ...displayedItems.slice(0, 3)].filter(Boolean);
			const seen = /* @__PURE__ */ new Set();
			toWarm.forEach((m, idx) => {
				if (m?.path && !seen.has(m.path)) {
					seen.add(m.path);
					prefetchMovieDetails(m.path, m.title, activeNodeId, idx === 0);
				}
			});
		}, 1500);
		return () => window.clearTimeout(timer);
	}, [currentCategory.path, activeNodeId]);
	const isMovieInWatchlist = React.useCallback((movie) => {
		if (!movie) return false;
		return watchlist.some((m) => m.path === movie.path || m.title === movie.title);
	}, [watchlist]);
	const getMovieWatchlistFolder = React.useCallback((movie) => {
		if (!movie) return "favorites";
		return watchlist.find((m) => m.path === movie.path || m.title === movie.title)?.folder || "favorites";
	}, [watchlist]);
	const selectedMovieProgress = React.useMemo(() => {
		if (!selectedMovie) return void 0;
		return continueWatching.find((p) => p.movie.path === selectedMovie.path || p.movie.title === selectedMovie.title);
	}, [selectedMovie, continueWatching]);
	const filteredWatchlist = React.useMemo(() => {
		if (watchlistFolderTab === "all") return watchlist;
		return watchlist.filter((item) => (item.folder || "favorites") === watchlistFolderTab);
	}, [watchlist, watchlistFolderTab]);
	const findCat = (path) => ALL_CATEGORIES.find((c) => c.path === path) || ALL_CATEGORIES[0];
	const topNavTabs = [
		{
			label: "Home",
			cat: findCat("/")
		},
		{
			label: "Trending",
			cat: findCat("/mostwatch/7d")
		},
		{
			label: "Movie",
			cat: findCat("/type/movies")
		},
		{
			label: "TV Show",
			cat: findCat("/type/series")
		},
		{
			label: "Anime",
			cat: findCat("/anime")
		},
		{
			label: "Trending Bengali",
			cat: findCat("/language/bangla")
		},
		{
			label: "Bollywood",
			cat: findCat("/bollywood")
		},
		{
			label: "South Indian",
			cat: findCat("/southIndian")
		},
		{
			label: "Hollywood",
			cat: findCat("/language/english")
		},
		{
			label: "Anime in Hindi",
			cat: findCat("/category/anime-hindi")
		},
		{
			label: "Asian Drama",
			cat: findCat("/drama")
		},
		{
			label: "🔥Hot Short TV",
			cat: findCat("/category/short-tv")
		},
		{
			label: "Western TV",
			cat: findCat("/category/western-tv")
		},
		{
			label: "Midnight 18+",
			cat: findCat("/adult18plus")
		}
	];
	return /* @__PURE__ */ _jsxs("div", {
		className: "min-h-screen w-full bg-[#050505] text-[#e5e5e5] flex flex-col pb-24",
		children: [
			showSplashScreen && /* @__PURE__ */ _jsxs("div", {
				onClick: () => setShowSplashScreen(false),
				className: "fixed inset-0 z-[9999] bg-[#050505] flex flex-col items-center justify-between py-14 px-6 select-none animate-fade-in",
				children: [
					/* @__PURE__ */ _jsx("div", { className: "h-8" }),
					/* @__PURE__ */ _jsx("div", {
						className: "flex flex-col items-center justify-center gap-4",
						children: /* @__PURE__ */ _jsx("div", {
							className: "w-32 h-32 sm:w-36 sm:h-36 rounded-[32px] bg-gradient-to-tr from-[#7f1d1d] via-[#dc2626] to-[#ef4444] p-1 shadow-[0_18px_45px_rgba(220,38,38,0.35)] flex items-center justify-center",
							children: /* @__PURE__ */ _jsx("div", {
								className: "w-full h-full bg-[#050505] rounded-[28px] flex items-center justify-center",
								children: /* @__PURE__ */ _jsx(Play, { className: "w-16 h-16 text-[#ef4444] fill-current ml-1.5 drop-shadow-[0_0_16px_rgba(220,38,38,0.55)]" })
							})
						})
					}),
					/* @__PURE__ */ _jsxs("div", {
						className: "text-center space-y-1 pb-4",
						children: [/* @__PURE__ */ _jsxs("div", {
							className: "text-3xl sm:text-4xl font-extrabold tracking-tight text-white font-display",
							children: ["CINE", /* @__PURE__ */ _jsx("span", {
								className: "text-[#dc2626]",
								children: "PULSE"
							})]
						}), /* @__PURE__ */ _jsx("p", {
							className: "text-xs sm:text-sm font-medium text-gray-400 tracking-wide",
							children: "Box of Movies and TV shows"
						})]
					})
				]
			}),
			!isOnline && /* @__PURE__ */ _jsxs("div", {
				className: "bg-[#dc2626] text-white px-4 py-2 text-xs font-semibold flex items-center justify-center gap-2 z-50",
				children: [/* @__PURE__ */ _jsx(WifiOff, { className: "w-4 h-4 shrink-0" }), /* @__PURE__ */ _jsx("span", { children: "Offline Mode — ক্যাশ করা মুভি তালিকা এবং আপনার ওয়াচলিস্ট দেখানো হচ্ছে" })]
			}),
			/* @__PURE__ */ _jsxs("div", {
				className: "relative w-full max-w-7xl mx-auto",
				children: [
					activeTab !== "me" && /* @__PURE__ */ _jsx("header", {
						className: "sticky top-0 z-30 bg-[#0d0f12]/95 backdrop-blur-xl border-b border-white/[0.08] px-3 sm:px-8 pt-2.5 pb-0 shadow-lg",
						children: Boolean(searchQuery.trim() || submittedSearch.trim() || showSearchDropdown) ? /* @__PURE__ */ _jsxs("div", {
							className: "space-y-2",
							children: [/* @__PURE__ */ _jsxs("div", {
								className: "flex items-center gap-2.5 w-full",
								children: [
									/* @__PURE__ */ _jsx("button", {
										type: "button",
										onClick: () => {
											setSearchQuery("");
											setSubmittedSearch("");
											setSuggestions([]);
											setShowSearchDropdown(false);
											setSearchTabFilter("ALL");
										},
										"aria-label": "Back",
										className: "w-8 h-10 flex items-center justify-center text-gray-200 hover:text-white shrink-0 cursor-pointer",
										children: /* @__PURE__ */ _jsx(ChevronLeft, { className: "w-6 h-6 stroke-[2.2]" })
									}),
									/* @__PURE__ */ _jsxs("form", {
										onSubmit: handleSearchSubmit,
										className: "flex-1 min-w-0 flex items-center h-11 rounded-xl bg-[#22252b] border border-white/10 focus-within:border-white/25 px-3.5 gap-2.5 transition-colors",
										children: [
											/* @__PURE__ */ _jsx(Search, { className: "w-5 h-5 text-gray-300 shrink-0" }),
											/* @__PURE__ */ _jsx("input", {
												ref: searchInputRef,
												type: "text",
												value: searchQuery,
												onFocus: () => setShowSearchDropdown(true),
												onChange: (e) => {
													setSearchQuery(e.target.value);
													setShowSearchDropdown(true);
													setActiveTab("browse");
												},
												style: {
													color: "#ffffff",
													WebkitTextFillColor: "#ffffff",
													opacity: 1
												},
												placeholder: "Tower of God [Hindi] বা মুভি খুঁজুন...",
												className: "flex-1 w-full min-w-0 bg-transparent text-sm sm:text-[15px] font-normal text-white placeholder:text-gray-400 focus:outline-none truncate"
											}),
											searchQuery && /* @__PURE__ */ _jsx("button", {
												type: "button",
												onClick: () => {
													setSearchQuery("");
													setSubmittedSearch("");
													setSuggestions([]);
													searchInputRef.current?.focus();
												},
												"aria-label": "Clear search",
												className: "w-5 h-5 rounded-full bg-gray-400/90 hover:bg-gray-300 text-[#121418] flex items-center justify-center shrink-0 cursor-pointer",
												children: /* @__PURE__ */ _jsx(X, { className: "w-3.5 h-3.5 stroke-[2.8]" })
											})
										]
									}),
									/* @__PURE__ */ _jsx("button", {
										type: "button",
										onClick: () => {
											const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
											if (SpeechRec) try {
												const rec = new SpeechRec();
												rec.lang = "en-US";
												rec.onresult = (ev) => {
													const transcript = ev?.results?.[0]?.[0]?.transcript;
													if (transcript) {
														setSearchQuery(transcript);
														setSubmittedSearch(transcript);
														setActiveTab("browse");
													}
												};
												rec.start();
												return;
											} catch {}
											searchInputRef.current?.focus();
										},
										"aria-label": "Voice Search",
										className: "w-9 h-10 flex items-center justify-center text-gray-200 hover:text-white shrink-0 cursor-pointer",
										children: /* @__PURE__ */ _jsx(Mic, { className: "w-5 h-5 stroke-[2]" })
									})
								]
							}), /* @__PURE__ */ _jsx("div", {
								className: "flex items-center gap-6 overflow-x-auto no-scrollbar pt-1 px-1",
								children: [
									{
										id: "ALL",
										label: "All"
									},
									{
										id: "MOVIE_SERIES",
										label: "Movie/Series"
									},
									{
										id: "SHORT_TV",
										label: "ShortTV"
									},
									{
										id: "MUSIC",
										label: "Music"
									}
								].map((tab) => {
									const isActive = searchTabFilter === tab.id;
									return /* @__PURE__ */ _jsxs("button", {
										type: "button",
										onClick: () => setSearchTabFilter(tab.id),
										className: `relative pb-2.5 text-sm sm:text-[15px] whitespace-nowrap shrink-0 transition-colors cursor-pointer ${isActive ? "text-white font-bold" : "text-gray-400 hover:text-gray-200 font-medium"}`,
										children: [/* @__PURE__ */ _jsx("span", { children: tab.label }), isActive && /* @__PURE__ */ _jsx("span", { className: "absolute left-1/2 -translate-x-1/2 bottom-0 h-[3px] w-6 bg-white rounded-full" })]
									}, tab.id);
								})
							})]
						}) : /* @__PURE__ */ _jsxs("div", {
							className: "space-y-2.5 pb-2.5",
							children: [/* @__PURE__ */ _jsxs("div", {
								className: "flex items-center gap-2 sm:gap-3 w-full",
								children: [/* @__PURE__ */ _jsxs("button", {
									type: "button",
									onClick: () => handleSelectCategory(ALL_CATEGORIES[0]),
									"aria-label": "Home",
									className: "h-10 px-2.5 sm:px-3 rounded-xl bg-[#121212] border border-white/10 hover:border-[#dc2626]/60 shrink-0 flex items-center gap-2 transition-colors",
									children: [/* @__PURE__ */ _jsx("div", {
										className: "w-6 h-6 rounded-lg bg-[#dc2626] flex items-center justify-center text-white shadow-[0_0_12px_rgba(220,38,38,0.5)]",
										children: /* @__PURE__ */ _jsx(Play, { className: "w-3.5 h-3.5 fill-current ml-0.5" })
									}), /* @__PURE__ */ _jsxs("span", {
										className: "hidden md:inline text-sm font-black tracking-wider text-white font-display",
										children: ["CINE", /* @__PURE__ */ _jsx("span", {
											className: "text-[#dc2626]",
											children: "PULSE"
										})]
									})]
								}), /* @__PURE__ */ _jsx("div", {
									ref: searchContainerRef,
									className: "relative flex-1 min-w-0",
									children: /* @__PURE__ */ _jsxs("form", {
										onSubmit: handleSearchSubmit,
										className: "flex items-center w-full h-10 rounded-full bg-[#121212] border border-white/15 focus-within:border-[#dc2626] pl-3 pr-1 overflow-hidden transition-colors",
										children: [
											/* @__PURE__ */ _jsx(Search, { className: "w-4 h-4 text-[#ef4444] shrink-0" }),
											/* @__PURE__ */ _jsx("input", {
												type: "text",
												value: searchQuery,
												onFocus: () => {
													setShowSearchDropdown(true);
													setActiveTab("browse");
												},
												onChange: (e) => {
													setSearchQuery(e.target.value);
													setShowSearchDropdown(true);
													setActiveTab("browse");
												},
												style: {
													color: "#ffffff",
													WebkitTextFillColor: "#ffffff",
													opacity: 1
												},
												placeholder: "মুভি বা সিরিজ খুঁজুন...",
												className: "flex-1 w-full min-w-0 bg-transparent px-2 text-xs sm:text-sm font-semibold text-white placeholder:text-gray-400 placeholder:font-normal caret-[#ef4444] focus:outline-none truncate"
											}),
											/* @__PURE__ */ _jsx("button", {
												type: "submit",
												"aria-label": "Search",
												className: "h-8 w-9 rounded-full bg-[#dc2626] hover:bg-[#b91c1c] text-white flex items-center justify-center shrink-0 shadow-[0_0_12px_rgba(220,38,38,0.4)] transition-colors",
												children: /* @__PURE__ */ _jsx(Search, { className: "w-4 h-4 stroke-[2.5]" })
											})
										]
									})
								}), /* @__PURE__ */ _jsxs("button", {
									type: "button",
									onClick: () => {
										setShowNotifDrawer((prev) => !prev);
										void handleEnableAndSendNotification();
									},
									"aria-label": "Notifications",
									className: "relative h-10 w-10 rounded-xl bg-[#121212] border border-white/15 hover:border-[#dc2626]/60 flex items-center justify-center text-white shrink-0 transition-colors cursor-pointer",
									children: [
										/* @__PURE__ */ _jsx(Bell, { className: "w-5 h-5 text-gray-100" }),
										/* @__PURE__ */ _jsx("span", {
											className: "absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[#dc2626] text-[10px] font-extrabold text-white flex items-center justify-center shadow",
											children: Math.min(9, Math.max(1, allNotifications.length))
										})
									]
								})]
							}), showNotifDrawer && /* @__PURE__ */ _jsxs("div", {
								className: "rounded-2xl bg-[#161920]/98 border border-white/15 p-3 sm:p-4 shadow-2xl space-y-2.5 max-h-[72vh] overflow-y-auto",
								children: [
									/* @__PURE__ */ _jsxs("div", {
										className: "flex items-center justify-between gap-2 pb-1.5 border-b border-white/10",
										children: [
											/* @__PURE__ */ _jsxs("div", {
												className: "flex items-center gap-2",
												children: [
													/* @__PURE__ */ _jsx("img", {
														src: "./notif-badge.png",
														alt: "CinePulse",
														className: "w-4 h-4 object-contain opacity-90"
													}),
													/* @__PURE__ */ _jsx("span", {
														className: "text-xs sm:text-sm font-bold text-white",
														children: "CinePulse Notifications"
													})
												]
											}),
											/* @__PURE__ */ _jsxs("div", {
												className: "flex items-center gap-2",
												children: [
													/* @__PURE__ */ _jsx("button", {
														type: "button",
														onClick: () => void handleEnableAndSendNotification(),
														className: "px-2.5 py-1 rounded-lg bg-[#dc2626] hover:bg-[#b91c1c] text-[11px] font-bold text-white cursor-pointer transition-colors",
														children: notifPermState === "granted" ? "ফোনে নোটিফিকেশন পাঠান" : "ফোনে নোটিফিকেশন চালু করুন"
													}),
													/* @__PURE__ */ _jsx("button", {
														type: "button",
														onClick: () => setShowNotifDrawer(false),
														className: "p-1 rounded-lg text-gray-400 hover:text-white cursor-pointer",
														children: /* @__PURE__ */ _jsx(X, { className: "w-4 h-4" })
													})
												]
											})
										]
									}),
									/* @__PURE__ */ _jsx("div", {
										className: "space-y-2",
										children: allNotifications.slice(0, 10).map((notif) => /* @__PURE__ */ _jsxs("div", {
											onClick: () => {
												setShowNotifDrawer(false);
												setIsMiniPlayer(false);
												setSelectedMovie(notif.movie);
											},
											className: "rounded-2xl bg-[#d4d8dc] text-[#111317] px-3.5 py-2.5 shadow-md hover:brightness-105 cursor-pointer transition-all flex flex-col gap-1.5",
											children: [
												/* @__PURE__ */ _jsxs("div", {
													className: "flex items-center justify-between text-[11px] text-[#374151]",
													children: [
														/* @__PURE__ */ _jsxs("div", {
															className: "flex items-center gap-1.5",
															children: [
																/* @__PURE__ */ _jsx("img", {
																	src: "./notif-badge.png",
																	alt: "CinePulse",
																	className: "w-3.5 h-3.5 object-contain invert opacity-75"
																}),
																/* @__PURE__ */ _jsx("span", {
																	className: "font-semibold text-[#1f2937]",
																	children: "CinePulse"
																}),
																/* @__PURE__ */ _jsx("span", {
																	className: "text-[#4b5563]",
																	children: notif.badgeText || "Just now"
																})
															]
														}),
														/* @__PURE__ */ _jsx(ChevronDown, { className: "w-3.5 h-3.5 text-[#4b5563]" })
													]
												}),
												/* @__PURE__ */ _jsxs("div", {
													className: "flex items-center justify-between gap-3",
													children: [
														/* @__PURE__ */ _jsx("p", {
															className: "text-[13px] sm:text-[14px] font-bold text-[#111317] leading-snug line-clamp-2 flex-1",
															children: notif.headlineBn
														}),
														notif.movie?.poster && /* @__PURE__ */ _jsx("img", {
															src: notif.movie.poster,
															alt: notif.movie.title,
															referrerPolicy: "no-referrer",
															loading: "lazy",
															className: "w-11 h-14 rounded-lg object-cover shrink-0 shadow-sm bg-[#1f2937]"
														})
													]
												})
											]
										}, notif.id))
									})
								]
							}), /* @__PURE__ */ _jsx("div", {
								className: "flex items-center gap-4 sm:gap-5 overflow-x-auto no-scrollbar pt-1 px-1",
								children: topNavTabs.map((t) => {
									const isActive = activeTab === "browse" && currentCategory.path === t.cat.path && !submittedSearch;
									return /* @__PURE__ */ _jsxs("button", {
										type: "button",
										onClick: () => handleSelectCategory(t.cat),
										className: `relative py-1 text-sm sm:text-[15px] whitespace-nowrap shrink-0 flex items-center gap-1.5 transition-all cursor-pointer ${isActive ? "text-white font-extrabold scale-[1.03]" : "text-gray-400 hover:text-gray-200 font-semibold"}`,
										children: [
											t.isMango && /* @__PURE__ */ _jsx("span", {
												className: "w-4 h-4 rounded-md bg-gradient-to-tr from-orange-600 to-amber-500 text-white text-[10px] font-black flex items-center justify-center shadow-sm",
												children: "M"
											}),
											/* @__PURE__ */ _jsx("span", { children: t.label }),
											isActive && /* @__PURE__ */ _jsx("span", { className: "absolute left-1/2 -translate-x-1/2 -bottom-0.5 h-[3px] w-5 rounded-full bg-[#00e68a]" })
										]
									}, t.cat.path + t.label);
								})
							})]
						})
					}),
					activeTab === "browse" && /* @__PURE__ */ _jsx("main", {
						className: "space-y-6 px-3 sm:px-8 pt-3",
						children: Boolean(searchQuery.trim() || submittedSearch.trim() || showSearchDropdown) ? /* @__PURE__ */ _jsxs("section", {
							className: "space-y-3 pb-10",
							children: [
								!searchQuery.trim() && !submittedSearch.trim() && recentSearches.length > 0 && /* @__PURE__ */ _jsxs("div", {
									className: "space-y-2 pt-1 pb-2 border-b border-white/[0.07]",
									children: [/* @__PURE__ */ _jsxs("div", {
										className: "flex items-center justify-between text-xs text-gray-400",
										children: [/* @__PURE__ */ _jsx("span", {
											className: "font-semibold text-gray-300",
											children: "Recent Searches"
										}), /* @__PURE__ */ _jsx("button", {
											type: "button",
											onClick: () => setRecentSearches([]),
											className: "text-[11px] text-gray-400 hover:text-white cursor-pointer",
											children: "Clear"
										})]
									}), /* @__PURE__ */ _jsx("div", {
										className: "flex flex-wrap gap-1.5",
										children: recentSearches.map((term) => /* @__PURE__ */ _jsx("button", {
											type: "button",
											onClick: () => {
												setSearchQuery(term);
												setSubmittedSearch(term);
											},
											className: "px-3 py-1.5 rounded-lg bg-[#1c1f26] hover:bg-[#262a34] text-xs font-medium text-gray-200 transition-colors cursor-pointer",
											children: term
										}, term))
									})]
								}),
								(loadingSuggestions || loadingCatalog) && /* @__PURE__ */ _jsxs("div", {
									className: "flex items-center gap-2 py-2 text-xs text-gray-400",
									children: [/* @__PURE__ */ _jsx(LoaderCircle, { className: "w-4 h-4 animate-spin text-white" }), /* @__PURE__ */ _jsx("span", { children: "Searching CinePulse HD..." })]
								}),
								(() => {
									const rawActiveQ = searchQuery.trim() || submittedSearch.trim();
									const activeQ = rawActiveQ.toLowerCase();
									const romanActiveQ = transliterateClientQuery(rawActiveQ);
									const activeWords = Array.from(new Set(`${activeQ} ${romanActiveQ}`.split(/\s+/).map((w) => w.replace(/[^a-z0-9\u0980-\u09FF]/gi, "")).filter((w) => w.length >= 2)));
									const filteredRows = (activeQ ? deduplicateMovieCards([
										...normalizeMovieCardList(suggestions, liveClockNow),
										...submittedSearch.trim() ? normalizeMovieCardList(items, liveClockNow) : [],
										...localSearchPool.filter((i) => {
											const hay = `${i.title} ${i.language} ${i.sportGenre || ""}`.toLowerCase();
											if (hay.includes(activeQ) || romanActiveQ && hay.includes(romanActiveQ)) return true;
											return activeWords.length > 0 && activeWords.some((w) => w.length >= 3 && hay.includes(w));
										})
									]) : deduplicateMovieCards([...displayedItems.slice(0, 24), ...normalizeMovieCardList(TOP_10_THIS_WEEK_ITEMS, liveClockNow)])).filter((item) => {
										if (searchTabFilter === "ALL") return true;
										const t = `${item.title} ${item.typeBadge}`.toLowerCase();
										if (searchTabFilter === "SHORT_TV") return /short|drama|ep|s0\d|series/i.test(t);
										if (searchTabFilter === "MUSIC") return /music|song|concert|audio|musical/i.test(t);
										return true;
									});
									if (filteredRows.length === 0 && !loadingSuggestions && !loadingCatalog) return /* @__PURE__ */ _jsxs("div", {
										className: "py-14 text-center space-y-3",
										children: [/* @__PURE__ */ _jsx(Film, { className: "w-10 h-10 text-gray-500 mx-auto" }), /* @__PURE__ */ _jsxs("p", {
											className: "text-sm text-gray-300 font-medium",
											children: [
												"No results found for \"",
												searchQuery || submittedSearch,
												"\""
											]
										})]
									});
									return /* @__PURE__ */ _jsx("div", {
										className: "divide-y divide-white/[0.04]",
										children: filteredRows.slice(0, 48).map((item, idx) => {
											const hasBrokenImg = brokenImages[item.id] || !item.poster;
											const langShort = formatShortLanguage(item.language);
											const yearMatch = item.title.match(/\((20\d{2}|19\d{2})\)/) || item.title.match(/\b(20\d{2}|19\d{2})\b/) || String(item.timeAgo || "").match(/\b(20\d{2}|19\d{2})\b/);
											const yearStr = yearMatch ? yearMatch[1] : "2026";
											const isSeriesItem = item.typeBadge === "SERIES" || item.typeBadge === "ANIME" || item.typeBadge === "DRAMA" || Boolean(item.episodePill) || /\bS0?\d|\bSeason|\bEp/i.test(item.title);
											const cleanBaseTitle = item.title.replace(/\s*\(\d{4}\)/g, "").replace(/\s*(?:1080p|720p|480p|4K|WEB-DL|WEBRip|Full HD|HDTC|BluRay|Dual Audio|Multi Audio).*$/i, "").trim();
											let rowTitle = cleanBaseTitle || item.title;
											if (!item.path?.startsWith("/mb/")) {
												const seasonMatch = item.title.match(/\b(S\d+(?:-S?\d+)?|Season\s*\d+)\b/i);
												const seasonSuffix = seasonMatch ? ` ${seasonMatch[1].toUpperCase()}` : "";
												const bracketLang = !/\[[^\]]+\]/.test(cleanBaseTitle) && langShort && langShort !== "English" ? ` [${langShort}]` : "";
												rowTitle = `${cleanBaseTitle.replace(/\b(S\d+(?:-S?\d+)?|Season\s*\d+)\b/gi, "").trim() || item.title}${bracketLang}${seasonSuffix}`;
											}
											const rawPrimaryGenre = item.sportGenre ? item.sportGenre.split(",")[0].trim() : "";
											const isAnime = item.typeBadge === "ANIME" || rawPrimaryGenre.toLowerCase() === "anime" || rawPrimaryGenre.toLowerCase() === "animation" || item.country?.toLowerCase() === "japan" || /anime|black clover|tower of god|one piece|naruto|solo|bleach|demon|dragon|high school|garden of words|black torch|overgeared|tomb raider/i.test(item.title);
											const genreLabel = rawPrimaryGenre && rawPrimaryGenre.toLowerCase() !== "animation" ? rawPrimaryGenre : isAnime ? "Anime" : /action|war|pushpa|jailer|toofan|marco|king|raider/i.test(item.title) ? "Action" : /thriller|crime|mirzapur|squid/i.test(item.title) ? "Thriller" : /romance|love|heart/i.test(item.title) ? "Romance" : isSeriesItem ? "Drama" : "Movie";
											const middleMeta = item.country || (isAnime ? "Japan" : langShort === "Bengali" ? "Bangladesh" : langShort === "Korean" ? "Korea" : "India");
											const ratingVal = item.rating ? Number(item.rating).toFixed(1) : (7.1 + idx * 3 % 18 / 10).toFixed(1);
											return /* @__PURE__ */ _jsxs("div", {
												onMouseEnter: () => prefetchMovieDetails(item.path, item.title, activeNodeId, true),
												onTouchStart: () => prefetchMovieDetails(item.path, item.title, activeNodeId, true),
												onClick: () => {
													if (searchQuery.trim()) saveRecentSearch(searchQuery.trim());
													setSelectedMovie(item);
												},
												className: "group py-2.5 flex items-center gap-3.5 cursor-pointer hover:bg-white/[0.03] rounded-xl px-1 transition-colors",
												children: [
													/* @__PURE__ */ _jsxs("div", {
														className: "relative w-[62px] h-[84px] sm:w-[68px] sm:h-[92px] rounded-lg overflow-hidden bg-[#161920] shrink-0",
														children: [!hasBrokenImg ? /* @__PURE__ */ _jsx("img", {
															src: item.poster,
															alt: item.title,
															referrerPolicy: "no-referrer",
															loading: "lazy",
															onError: () => setBrokenImages((prev) => ({
																...prev,
																[item.id]: true
															})),
															className: "w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
														}) : /* @__PURE__ */ _jsx("div", {
															className: "w-full h-full flex items-center justify-center",
															children: /* @__PURE__ */ _jsx(Film, { className: "w-6 h-6 text-gray-500" })
														}), langShort && /* @__PURE__ */ _jsx("div", {
															className: "absolute inset-x-0 bottom-0 bg-black/65 py-0.5 text-center text-[11px] font-medium text-gray-100 leading-tight truncate px-1",
															children: langShort
														})]
													}),
													/* @__PURE__ */ _jsxs("div", {
														className: "flex-1 min-w-0 pr-1",
														children: [/* @__PURE__ */ _jsx("h3", {
															className: "text-[15px] sm:text-base font-medium text-white truncate mb-1.5 group-hover:text-gray-100",
															children: rowTitle
														}), /* @__PURE__ */ _jsxs("div", {
															className: "flex items-center gap-1.5 text-xs sm:text-[13px] text-gray-400 truncate",
															children: [
																isSeriesItem ? /* @__PURE__ */ _jsx(Tv, { className: "w-3.5 h-3.5 text-gray-300 shrink-0" }) : /* @__PURE__ */ _jsx(Film, { className: "w-3.5 h-3.5 text-gray-300 shrink-0" }),
																/* @__PURE__ */ _jsx("span", {
																	className: "text-gray-600",
																	children: "|"
																}),
																/* @__PURE__ */ _jsxs("span", {
																	className: "inline-flex items-center gap-1 text-amber-400 font-medium shrink-0",
																	children: [/* @__PURE__ */ _jsx(Star, { className: "w-3.5 h-3.5 fill-current" }), /* @__PURE__ */ _jsx("span", { children: ratingVal })]
																}),
																/* @__PURE__ */ _jsx("span", {
																	className: "text-gray-600",
																	children: "|"
																}),
																/* @__PURE__ */ _jsx("span", {
																	className: "shrink-0",
																	children: yearStr
																}),
																/* @__PURE__ */ _jsx("span", {
																	className: "text-gray-600",
																	children: "|"
																}),
																/* @__PURE__ */ _jsx("span", {
																	className: "truncate",
																	children: middleMeta
																}),
																/* @__PURE__ */ _jsx("span", {
																	className: "text-gray-600",
																	children: "|"
																}),
																/* @__PURE__ */ _jsx("span", {
																	className: "truncate",
																	children: genreLabel
																})
															]
														})]
													}),
													/* @__PURE__ */ _jsx("div", {
														className: "w-8 h-8 rounded-full bg-[#d1d5db] group-hover:bg-white text-[#0f1115] flex items-center justify-center shrink-0 transition-transform active:scale-95",
														children: /* @__PURE__ */ _jsx(Play, { className: "w-4 h-4 fill-current ml-0.5" })
													})
												]
											}, `${item.path}-${item.id}-${idx}`);
										})
									});
								})()
							]
						}) : /* @__PURE__ */ _jsxs(_Fragment, { children: [
							!submittedSearch && currentPage === 1 && spotlightItem && /* @__PURE__ */ _jsxs("section", {
								className: "select-none",
								children: [/* @__PURE__ */ _jsxs("div", {
									onClick: () => setSelectedMovie(spotlightItem),
									onTouchStart: (e) => {
										if (e.touches.length === 1) heroTouchStartXRef.current = e.touches[0].clientX;
									},
									onTouchEnd: (e) => {
										if (heroTouchStartXRef.current !== null && e.changedTouches.length === 1) {
											const deltaX = e.changedTouches[0].clientX - heroTouchStartXRef.current;
											heroTouchStartXRef.current = null;
											if (Math.abs(deltaX) > 40 && heroSlides.length > 1) {
												if (deltaX < 0) setHeroSlideIdx((prev) => (prev + 1) % heroSlides.length);
												else setHeroSlideIdx((prev) => (prev - 1 + heroSlides.length) % heroSlides.length);
											}
										}
									},
									className: "relative aspect-[16/10] sm:aspect-[21/9] w-full rounded-2xl sm:rounded-3xl bg-[#0a0a0a] border border-white/10 cursor-pointer overflow-hidden shadow-2xl group",
									children: [
										(spotlightItem.previewImage || spotlightItem.poster) && !brokenImages[spotlightItem.id] ? /* @__PURE__ */ _jsx("img", {
											src: spotlightItem.previewImage || spotlightItem.poster,
											alt: spotlightItem.title,
											referrerPolicy: "no-referrer",
											decoding: "async",
											fetchPriority: "high",
											onError: () => setBrokenImages((prev) => ({
												...prev,
												[spotlightItem.id]: true
											})),
											className: "w-full h-full object-cover object-top group-hover:scale-105 transition-all duration-500 ease-out will-change-transform"
										}) : /* @__PURE__ */ _jsx("div", {
											className: "w-full h-full flex items-center justify-center bg-gradient-to-br from-[#1a0b0b] to-[#050505]",
											children: /* @__PURE__ */ _jsx(Film, { className: "w-14 h-14 text-gray-600" })
										}),
										/* @__PURE__ */ _jsxs("div", {
											className: "absolute top-3 left-3 right-3 flex items-center justify-between pointer-events-none z-10",
											children: [/* @__PURE__ */ _jsx("span", {
												className: "px-2.5 py-1 rounded-lg bg-black/65 backdrop-blur-md border border-white/15 text-[11px] font-bold text-[#00e68a] tracking-wide uppercase",
												children: currentCategory.path === "/" ? "🔥 Spotlight" : currentCategory.label
											}), heroSlides.length > 1 && /* @__PURE__ */ _jsx("div", {
												className: "flex items-center gap-1.5 px-2 py-1 rounded-full bg-black/50 backdrop-blur-md pointer-events-auto",
												children: heroSlides.slice(0, 8).map((s, dotIdx) => /* @__PURE__ */ _jsx("button", {
													type: "button",
													"aria-label": `Slide ${dotIdx + 1}`,
													onClick: (e) => {
														e.stopPropagation();
														setHeroSlideIdx(dotIdx);
													},
													className: `h-1.5 rounded-full transition-all duration-300 cursor-pointer ${dotIdx === safeSlideIdx ? "w-5 bg-[#00e68a]" : "w-1.5 bg-white/40 hover:bg-white/70"}`
												}, s.id + dotIdx))
											})]
										}),
										/* @__PURE__ */ _jsx("div", { className: "absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-[#050505] via-[#050505]/70 to-transparent pointer-events-none" }),
										/* @__PURE__ */ _jsx("div", {
											className: "absolute inset-x-3 sm:inset-x-5 bottom-9 sm:bottom-11 z-10 pointer-events-none flex items-end justify-between gap-3",
											children: /* @__PURE__ */ _jsxs("div", {
												className: "min-w-0",
												children: [/* @__PURE__ */ _jsx("h2", {
													className: "text-base sm:text-2xl font-extrabold text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.9)] truncate",
													children: spotlightItem.title
												}), /* @__PURE__ */ _jsxs("div", {
													className: "flex items-center gap-2 text-[11px] sm:text-xs text-gray-200 font-semibold mt-0.5 drop-shadow",
													children: [
														spotlightItem.rating && /* @__PURE__ */ _jsxs("span", {
															className: "inline-flex items-center gap-1 text-amber-400 font-bold",
															children: [/* @__PURE__ */ _jsx(Star, { className: "w-3.5 h-3.5 fill-current" }), Number(spotlightItem.rating).toFixed(1)]
														}),
														/* @__PURE__ */ _jsx("span", { children: "•" }),
														/* @__PURE__ */ _jsx("span", {
															className: "text-[#00e68a]",
															children: formatShortLanguage(spotlightItem.language)
														}),
														spotlightItem.quality && /* @__PURE__ */ _jsxs(_Fragment, { children: [/* @__PURE__ */ _jsx("span", { children: "•" }), /* @__PURE__ */ _jsx("span", {
															className: "px-1.5 py-0.5 rounded bg-white/15 text-white text-[10px] font-bold",
															children: spotlightItem.quality
														})] })
													]
												})]
											})
										})
									]
								}), /* @__PURE__ */ _jsx("div", {
									ref: heroMiniStripRef,
									className: "relative z-20 -mt-8 sm:-mt-10 px-2 flex items-end gap-2 overflow-x-auto no-scrollbar pt-3 pb-1 scroll-smooth",
									children: heroMiniCards.map((card, idx) => {
										const isCurrentSlide = idx === safeSlideIdx;
										const yearMatch = card.title.match(/\b(20\d{2}|19\d{2})\b/);
										const yearStr = yearMatch ? yearMatch[1] : "2026";
										const isSeriesCard = card.typeBadge === "SERIES" || card.typeBadge === "DRAMA" || Boolean(card.episodePill) || /\bS0?\d|\bSeason|\bEp/i.test(card.title);
										const genreLabel = card.typeBadge === "ANIME" ? "Anime" : isSeriesCard ? "Series" : /action|fight|war|king|pushpa|jailer|toofan|marco/i.test(card.title) ? "Action" : /drama|love|akka|bachelor/i.test(card.title) ? "Drama" : "Thriller";
										const cleanShortTitle = card.title.replace(/\s*\(\d{4}\).*$/i, "").replace(/\s*S\d+.*$/i, "").replace(/\s*(?:1080p|720p|480p|4K|WEB-DL|WEBRip|Full HD|HDTC).*$/i, "").trim();
										const langShort = formatShortLanguage(card.language);
										const displayTitle = cleanShortTitle.length <= 16 && langShort !== "English" ? `${cleanShortTitle} [${langShort}]` : cleanShortTitle || card.title;
										return /* @__PURE__ */ _jsxs("div", {
											onMouseEnter: () => prefetchMovieDetails(card.path, card.title, activeNodeId),
											onTouchStart: () => prefetchMovieDetails(card.path, card.title, activeNodeId),
											onClick: () => {
												setHeroSlideIdx(idx);
												setSelectedMovie(card);
											},
											className: `w-[196px] sm:w-[220px] shrink-0 rounded-xl backdrop-blur-md border px-2.5 py-2 flex items-center gap-2.5 cursor-pointer shadow-[0_6px_18px_rgba(0,0,0,0.6)] active:scale-[0.98] transition-all duration-300 ${isCurrentSlide ? "bg-[#1e232c] border-[#00e68a]/80 shadow-[0_0_16px_rgba(0,230,138,0.22)]" : "bg-[#181a20]/95 border-white/[0.08] opacity-85 hover:opacity-100"}`,
											children: [
												/* @__PURE__ */ _jsx("div", {
													className: "relative -mt-5 w-10 h-14 sm:w-11 sm:h-15 rounded-lg overflow-hidden bg-[#0a0a0a] shrink-0 shadow-md border border-white/15",
													children: card.poster ? /* @__PURE__ */ _jsx("img", {
														src: card.poster,
														alt: card.title,
														referrerPolicy: "no-referrer",
														loading: "lazy",
														decoding: "async",
														className: "w-full h-full object-cover"
													}) : /* @__PURE__ */ _jsx("div", {
														className: "w-full h-full flex items-center justify-center",
														children: /* @__PURE__ */ _jsx(Film, { className: "w-4 h-4 text-gray-500" })
													})
												}),
												/* @__PURE__ */ _jsxs("div", {
													className: "min-w-0 flex-1",
													children: [/* @__PURE__ */ _jsx("h2", {
														className: "text-[11px] sm:text-xs font-bold text-white truncate",
														children: displayTitle
													}), /* @__PURE__ */ _jsxs("div", {
														className: "text-[10px] text-gray-400 truncate mt-0.5 flex items-center gap-1 font-medium",
														children: [
															isSeriesCard ? /* @__PURE__ */ _jsx(Tv, { className: "w-2.5 h-2.5 text-gray-400 shrink-0" }) : /* @__PURE__ */ _jsx(Film, { className: "w-2.5 h-2.5 text-gray-400 shrink-0" }),
															/* @__PURE__ */ _jsx("span", { children: "|" }),
															/* @__PURE__ */ _jsx("span", { children: yearStr }),
															/* @__PURE__ */ _jsx("span", { children: "|" }),
															/* @__PURE__ */ _jsx("span", {
																className: "truncate",
																children: genreLabel
															})
														]
													})]
												}),
												/* @__PURE__ */ _jsx("div", {
													className: "w-7 h-7 rounded-full bg-gradient-to-tr from-[#00e68a] to-[#12d6df] text-[#050505] flex items-center justify-center shrink-0 shadow-[0_0_10px_rgba(0,230,138,0.3)]",
													children: /* @__PURE__ */ _jsx(Play, { className: "w-3 h-3 fill-current ml-0.5" })
												})
											]
										}, card.path + card.id + idx);
									})
								})]
							}),
							!submittedSearch && currentPage === 1 && currentCategory.path === "/" && /* @__PURE__ */ _jsxs("div", {
								className: "space-y-6",
								children: [
									mbHomeData?.quickCategories && mbHomeData.quickCategories.length > 0 && /* @__PURE__ */ _jsxs("section", {
										className: "space-y-2.5",
										children: [/* @__PURE__ */ _jsxs("div", {
											className: "flex items-center justify-between px-0.5",
											children: [/* @__PURE__ */ _jsxs("div", {
												className: "flex items-center gap-2",
												children: [/* @__PURE__ */ _jsx(Layers, { className: "w-4 h-4 text-[#00e68a]" }), /* @__PURE__ */ _jsxs("h2", {
													className: "text-sm sm:text-base font-extrabold text-white tracking-tight",
													children: ["Categories ", /* @__PURE__ */ _jsx("span", {
														className: "text-xs font-normal text-gray-400",
														children: "· ক্যাটাগরি সমূহ"
													})]
												})]
											}), /* @__PURE__ */ _jsxs("button", {
												type: "button",
												onClick: () => setActiveTab("categories"),
												className: "text-xs font-bold text-[#00e68a] hover:text-emerald-300 flex items-center gap-0.5 cursor-pointer",
												children: [/* @__PURE__ */ _jsx("span", { children: "All Categories" }), /* @__PURE__ */ _jsx(ChevronRight, { className: "w-4 h-4" })]
											})]
										}), /* @__PURE__ */ _jsx("div", {
											className: "flex items-center gap-2.5 overflow-x-auto no-scrollbar pb-1",
											children: mbHomeData.quickCategories.filter((qc) => qc.id !== "qc-sports").map((qc) => /* @__PURE__ */ _jsxs("button", {
												type: "button",
												onClick: () => handleSelectCategory(findCat(qc.path)),
												className: "group relative w-[124px] sm:w-[144px] h-[58px] sm:h-[64px] shrink-0 rounded-xl overflow-hidden bg-[#14171d] border border-white/10 hover:border-[#00e68a]/50 flex items-center justify-between px-3 text-left transition-all active:scale-95 cursor-pointer",
												children: [
													/* @__PURE__ */ _jsx("img", {
														src: qc.image,
														alt: qc.title,
														referrerPolicy: "no-referrer",
														loading: "lazy",
														className: "absolute inset-0 w-full h-full object-cover opacity-35 group-hover:scale-105 group-hover:opacity-50 transition-all duration-300"
													}),
													/* @__PURE__ */ _jsx("div", { className: "absolute inset-0 bg-gradient-to-r from-[#0c0e12]/95 via-[#0c0e12]/70 to-transparent" }),
													/* @__PURE__ */ _jsxs("div", {
														className: "relative z-10 min-w-0",
														children: [/* @__PURE__ */ _jsx("div", {
															className: "text-xs sm:text-sm font-extrabold text-white truncate",
															children: qc.title
														}), /* @__PURE__ */ _jsx("div", {
															className: "text-[10px] text-gray-300 truncate mt-0.5",
															children: qc.bnTitle
														})]
													})
												]
											}, qc.id))
										})]
									}),
									currentCategory.path === "/" && mbHomeData?.comingSoon && mbHomeData.comingSoon.length > 0 && /* @__PURE__ */ _jsxs("section", {
										className: "space-y-2.5",
										children: [/* @__PURE__ */ _jsxs("div", {
											className: "flex items-center justify-between px-0.5",
											children: [/* @__PURE__ */ _jsxs("div", {
												className: "flex items-center gap-2",
												children: [/* @__PURE__ */ _jsx(Calendar, { className: "w-4 h-4 text-amber-400" }), /* @__PURE__ */ _jsxs("h2", {
													className: "text-sm sm:text-base font-extrabold text-white tracking-tight",
													children: ["Coming Soon ", /* @__PURE__ */ _jsx("span", {
														className: "text-xs font-normal text-gray-400",
														children: "· আপকামিং রিলিজ"
													})]
												})]
											}), /* @__PURE__ */ _jsxs("button", {
												type: "button",
												onClick: () => handleSelectCategory(findCat("/upcoming")),
												className: "text-xs font-bold text-[#00e68a] hover:text-emerald-300 flex items-center gap-0.5 cursor-pointer",
												children: [/* @__PURE__ */ _jsx("span", { children: "More" }), /* @__PURE__ */ _jsx(ChevronRight, { className: "w-4 h-4" })]
											})]
										}), /* @__PURE__ */ _jsx("div", {
											className: "flex items-stretch gap-2.5 overflow-x-auto no-scrollbar pb-1",
											children: mbHomeData.comingSoon.map((item) => {
												const isBooked = Boolean(bookedComingSoonIds[item.id]);
												const displayBooked = item.bookedCount + (isBooked ? 1 : 0);
												return /* @__PURE__ */ _jsxs("div", {
													className: "w-[104px] sm:w-[118px] shrink-0 flex flex-col justify-between rounded-lg bg-[#111318] border border-white/[0.08] overflow-hidden group",
													children: [/* @__PURE__ */ _jsxs("div", { children: [
														/* @__PURE__ */ _jsxs("div", {
															className: "px-2 py-1 bg-[#181b22] border-b border-white/[0.06] flex items-center justify-between",
															children: [/* @__PURE__ */ _jsx("span", {
																className: "text-[10px] font-extrabold text-[#00e68a]",
																children: item.releaseBadge
															}), /* @__PURE__ */ _jsx("span", {
																className: "text-[9px] text-gray-400 font-medium",
																children: displayBooked
															})]
														}),
														/* @__PURE__ */ _jsxs("div", {
															onClick: () => {
																setSearchQuery(item.title);
																setSubmittedSearch(item.title);
															},
															className: "relative aspect-[2/3] w-full bg-[#0a0c10] overflow-hidden cursor-pointer",
															children: [/* @__PURE__ */ _jsx("img", {
																src: item.poster,
																alt: item.title,
																referrerPolicy: "no-referrer",
																loading: "lazy",
																className: "w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
															}), /* @__PURE__ */ _jsx("div", {
																className: "absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/45 to-transparent p-1.5",
																children: /* @__PURE__ */ _jsx("div", {
																	className: "text-[9px] font-semibold text-gray-300 truncate",
																	children: item.country || item.genre
																})
															})]
														}),
														/* @__PURE__ */ _jsx("div", {
															className: "p-1.5 pb-0.5",
															children: /* @__PURE__ */ _jsx("h3", {
																className: "text-[11px] font-semibold text-white truncate",
																children: item.title
															})
														})
													] }), /* @__PURE__ */ _jsx("div", {
														className: "px-1.5 pb-1.5 pt-1",
														children: /* @__PURE__ */ _jsxs("button", {
															type: "button",
															onClick: () => toggleBookComingSoon(item.id),
															className: `w-full h-6 rounded-md text-[10px] font-bold flex items-center justify-center gap-1 transition-all cursor-pointer ${isBooked ? "bg-[#00e68a]/20 text-[#00e68a] border border-[#00e68a]/40" : "bg-white/[0.08] hover:bg-white/[0.14] text-white border border-white/10"}`,
															children: [/* @__PURE__ */ _jsx(Bell, { className: "w-2.5 h-2.5" }), /* @__PURE__ */ _jsx("span", { children: isBooked ? "Booked ✓" : "Remind" })]
														})
													})]
												}, item.id);
											})
										})]
									}),
									currentCategory.path === "/" && mbHomeData?.sections && mbHomeData.sections.map((shelf) => /* @__PURE__ */ _jsxs("section", {
										className: "space-y-2",
										children: [/* @__PURE__ */ _jsxs("div", {
											className: "flex items-center justify-between px-0.5",
											children: [/* @__PURE__ */ _jsxs("div", {
												className: "flex items-center gap-2 min-w-0",
												children: [
													/* @__PURE__ */ _jsx("span", { className: "w-1 h-3.5 rounded-full bg-[#00e68a] shrink-0" }),
													/* @__PURE__ */ _jsx("h2", {
														className: "text-xs sm:text-sm font-extrabold text-white tracking-tight truncate",
														children: shelf.title
													}),
													/* @__PURE__ */ _jsxs("span", {
														className: "hidden sm:inline text-[11px] text-gray-400 truncate",
														children: ["· ", shelf.bnTitle]
													}),
													shelf.badge && /* @__PURE__ */ _jsx("span", {
														className: "px-1.5 py-0.5 rounded bg-[#00e68a]/15 border border-[#00e68a]/30 text-[9px] font-extrabold text-[#00e68a] shrink-0",
														children: shelf.badge
													})
												]
											}), /* @__PURE__ */ _jsxs("button", {
												type: "button",
												onClick: () => handleSelectCategory(findCat(shelf.categoryPath)),
												className: "text-[11px] font-bold text-gray-300 hover:text-[#00e68a] flex items-center gap-0.5 shrink-0 cursor-pointer",
												children: [/* @__PURE__ */ _jsx("span", { children: "More" }), /* @__PURE__ */ _jsx(ChevronRight, { className: "w-3.5 h-3.5" })]
											})]
										}), /* @__PURE__ */ _jsx("div", {
											className: "flex items-stretch gap-2 sm:gap-2.5 overflow-x-auto no-scrollbar pb-1",
											children: shelf.items.map((item, idx) => {
												const hasBrokenImg = brokenImages[item.id] || !item.poster;
												const langShort = formatShortLanguage(item.language);
												return /* @__PURE__ */ _jsxs("div", {
													onMouseEnter: () => prefetchMovieDetails(item.path, item.title, activeNodeId),
													onTouchStart: () => prefetchMovieDetails(item.path, item.title, activeNodeId),
													onClick: () => setSelectedMovie(item),
													className: "group w-[96px] sm:w-[114px] shrink-0 cursor-pointer flex flex-col",
													children: [
														/* @__PURE__ */ _jsxs("div", {
															className: "relative aspect-[2/3] w-full rounded-lg overflow-hidden bg-[#14171f] border border-white/[0.08] group-hover:border-[#00e68a]/50 transition-all",
															children: [
																!hasBrokenImg ? /* @__PURE__ */ _jsx("img", {
																	src: item.poster,
																	alt: item.title,
																	referrerPolicy: "no-referrer",
																	loading: "lazy",
																	onError: () => setBrokenImages((prev) => ({
																		...prev,
																		[item.id]: true
																	})),
																	className: "w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
																}) : /* @__PURE__ */ _jsx("div", {
																	className: "w-full h-full flex items-center justify-center",
																	children: /* @__PURE__ */ _jsx(Film, { className: "w-6 h-6 text-gray-600" })
																}),
																langShort && /* @__PURE__ */ _jsx("span", {
																	className: "absolute top-1 left-1 px-1 py-0.5 rounded bg-black/75 backdrop-blur-sm text-[8.5px] font-bold text-white border border-white/10",
																	children: langShort
																}),
																item.rating && /* @__PURE__ */ _jsxs("span", {
																	className: "absolute top-1 right-1 px-1 py-0.5 rounded bg-black/75 backdrop-blur-sm text-[8.5px] font-extrabold text-amber-400 flex items-center gap-0.5",
																	children: [/* @__PURE__ */ _jsx(Star, { className: "w-2 h-2 fill-current" }), item.rating]
																}),
																/* @__PURE__ */ _jsxs("div", {
																	className: "absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-1 flex items-center justify-between text-[8.5px] font-bold text-gray-200",
																	children: [/* @__PURE__ */ _jsx("span", {
																		className: "truncate",
																		children: item.episodePill || item.typeBadge
																	}), /* @__PURE__ */ _jsx("span", {
																		className: "text-[#00e68a] shrink-0",
																		children: "HD"
																	})]
																})
															]
														}),
														/* @__PURE__ */ _jsx("h3", {
															className: "text-[11px] font-semibold text-gray-100 group-hover:text-[#00e68a] truncate mt-1",
															children: item.title
														}),
														/* @__PURE__ */ _jsxs("p", {
															className: "text-[9.5px] text-gray-400 truncate",
															children: [
																langShort || item.language,
																" • ",
																item.timeAgo
															]
														})
													]
												}, `${shelf.id}-${item.id}-${idx}`);
											})
										})]
									}, shelf.id))
								]
							}),
							/* @__PURE__ */ _jsxs("section", {
								className: "space-y-4",
								children: [
									/* @__PURE__ */ _jsxs(_Fragment, { children: [
										/* @__PURE__ */ _jsxs("div", {
											className: "rounded-2xl bg-[#0a0a0a] border border-white/[0.08] p-3 sm:p-4 space-y-3",
											children: [/* @__PURE__ */ _jsxs("div", {
												className: "flex items-center justify-between gap-2",
												children: [/* @__PURE__ */ _jsxs("div", {
													className: "flex items-center gap-2 min-w-0",
													children: [/* @__PURE__ */ _jsx(Flame, { className: "w-5 h-5 text-[#ef4444] shrink-0" }), /* @__PURE__ */ _jsx("h2", {
														className: "text-base sm:text-xl font-extrabold text-white tracking-tight truncate",
														children: submittedSearch ? `সার্চ ফলাফল: "${submittedSearch}"` : `${currentCategory.label} · ${currentCategory.bnLabel}`
													})]
												}), /* @__PURE__ */ _jsxs("span", {
													className: "text-xs text-gray-400 font-mono tabular-nums shrink-0",
													children: [
														"Page ",
														currentPage,
														"/",
														maxPage
													]
												})]
											}), /* @__PURE__ */ _jsxs("div", {
												className: "flex flex-wrap items-center justify-between gap-2",
												children: [/* @__PURE__ */ _jsx("div", {
													className: "flex items-center gap-1.5 overflow-x-auto no-scrollbar",
													children: [
														{
															label: "All Audio",
															id: "ALL"
														},
														{
															label: "Bengali",
															id: "BANGLA"
														},
														{
															label: "Hindi",
															id: "HINDI"
														},
														{
															label: "Dual Audio",
															id: "DUAL"
														},
														{
															label: "Anime / Sub",
															id: "SUB"
														}
													].map((f) => /* @__PURE__ */ _jsx("button", {
														type: "button",
														onClick: () => setAudioFilter(f.id),
														className: `px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap shrink-0 transition-colors ${audioFilter === f.id ? "bg-[#dc2626] text-white shadow-[0_0_10px_rgba(220,38,38,0.35)]" : "bg-[#141414] text-gray-300 hover:text-white border border-white/5"}`,
														children: f.label
													}, f.id))
												}), /* @__PURE__ */ _jsxs("div", {
													className: "flex items-center gap-2",
													children: [/* @__PURE__ */ _jsxs("div", {
														className: "flex items-center gap-1 bg-[#141414] border border-white/10 rounded-xl px-2.5 py-1.5",
														children: [/* @__PURE__ */ _jsx(SlidersHorizontal, { className: "w-3 h-3 text-[#ef4444]" }), /* @__PURE__ */ _jsxs("select", {
															value: qualityFilter,
															onChange: (e) => setQualityFilter(e.target.value),
															"aria-label": "Filter quality",
															className: "bg-transparent text-xs font-semibold text-gray-200 focus:outline-none",
															children: [
																/* @__PURE__ */ _jsx("option", {
																	value: "ALL",
																	className: "bg-[#121212]",
																	children: "All Quality"
																}),
																/* @__PURE__ */ _jsx("option", {
																	value: "4K",
																	className: "bg-[#121212]",
																	children: "4K UHD"
																}),
																/* @__PURE__ */ _jsx("option", {
																	value: "1080P",
																	className: "bg-[#121212]",
																	children: "1080p FHD"
																}),
																/* @__PURE__ */ _jsx("option", {
																	value: "WEBDL",
																	className: "bg-[#121212]",
																	children: "WEB-DL"
																}),
																/* @__PURE__ */ _jsx("option", {
																	value: "HDTC",
																	className: "bg-[#121212]",
																	children: "HDTC"
																})
															]
														})]
													}), /* @__PURE__ */ _jsx("div", {
														className: "flex items-center gap-1 bg-[#141414] border border-white/10 rounded-xl px-2.5 py-1.5",
														children: /* @__PURE__ */ _jsxs("select", {
															value: sortBy,
															onChange: (e) => setSortBy(e.target.value),
															"aria-label": "Sort order",
															className: "bg-transparent text-xs font-semibold text-gray-200 focus:outline-none",
															children: [
																/* @__PURE__ */ _jsx("option", {
																	value: "HOT_HYPE",
																	className: "bg-[#121212]",
																	children: "Hot & New"
																}),
																/* @__PURE__ */ _jsx("option", {
																	value: "LATEST",
																	className: "bg-[#121212]",
																	children: "Latest Upload"
																}),
																/* @__PURE__ */ _jsx("option", {
																	value: "RATING",
																	className: "bg-[#121212]",
																	children: "Top Rated"
																}),
																/* @__PURE__ */ _jsx("option", {
																	value: "VIEWS",
																	className: "bg-[#121212]",
																	children: "Most Popular"
																}),
																/* @__PURE__ */ _jsx("option", {
																	value: "TITLE",
																	className: "bg-[#121212]",
																	children: "A–Z"
																})
															]
														})
													})]
												})]
											})]
										}),
										loadingCatalog && /* @__PURE__ */ _jsxs("div", {
											className: "flex items-center justify-center gap-2 py-3 rounded-2xl bg-[#101010] text-xs text-gray-300",
											children: [/* @__PURE__ */ _jsx(LoaderCircle, { className: "w-4 h-4 animate-spin text-[#ef4444]" }), /* @__PURE__ */ _jsxs("span", { children: [
												"লোড হচ্ছে (Page ",
												currentPage,
												")..."
											] })]
										}),
										displayedItems.length === 0 ? /* @__PURE__ */ _jsxs("div", {
											className: "rounded-3xl bg-[#0a0a0a] border border-white/[0.08] p-10 text-center space-y-3",
											children: [
												/* @__PURE__ */ _jsx(Film, { className: "w-10 h-10 text-gray-500 mx-auto" }),
												/* @__PURE__ */ _jsx("h3", {
													className: "text-base font-bold text-white",
													children: "কোনো মুভি বা সিরিজ পাওয়া যায়নি"
												}),
												/* @__PURE__ */ _jsx("button", {
													type: "button",
													onClick: () => {
														setSourceFilter("ALL");
														setAudioFilter("ALL");
														setQualityFilter("ALL");
														setYearFilter("ALL");
														setSubmittedSearch("");
														setSearchQuery("");
													},
													className: "px-5 py-2 rounded-full bg-[#dc2626] text-white text-xs font-extrabold",
													children: "Reset Filters"
												})
											]
										}) : /* @__PURE__ */ _jsx("div", {
											className: "grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2 sm:gap-3",
											children: displayedItems.map((item) => {
												const isSaved = isMovieInWatchlist(item);
												const hasBrokenImg = brokenImages[item.id] || !item.poster;
												const isJustUploaded = isUploadedWithinMinutes(item.timeAgo);
												return /* @__PURE__ */ _jsxs("article", {
													onMouseEnter: () => prefetchMovieDetails(item.path, item.title, activeNodeId, true),
													onTouchStart: () => prefetchMovieDetails(item.path, item.title, activeNodeId, true),
													onClick: () => setSelectedMovie(item),
													className: "group rounded-xl overflow-hidden bg-[#0a0a0a] border border-white/[0.08] hover:border-[#dc2626]/65 transition-all flex flex-col cursor-pointer shadow-xs",
													children: [/* @__PURE__ */ _jsxs("div", {
														className: "relative aspect-[2/3] w-full bg-[#050505] overflow-hidden",
														children: [
															!hasBrokenImg ? /* @__PURE__ */ _jsx("img", {
																src: item.poster,
																alt: item.title,
																referrerPolicy: "no-referrer",
																loading: "lazy",
																onError: () => setBrokenImages((prev) => ({
																	...prev,
																	[item.id]: true
																})),
																className: "w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
															}) : /* @__PURE__ */ _jsxs("div", {
																className: "w-full h-full flex flex-col items-center justify-center p-2 text-center",
																children: [/* @__PURE__ */ _jsx(Film, { className: "w-6 h-6 text-[#ef4444] mb-1 opacity-80" }), /* @__PURE__ */ _jsx("span", {
																	className: "text-[10px] font-bold text-gray-300 line-clamp-3",
																	children: item.title
																})]
															}),
															/* @__PURE__ */ _jsx("div", {
																className: "absolute top-1 right-1 flex flex-col items-end gap-1",
																children: /* @__PURE__ */ _jsx("span", {
																	className: "px-1.5 py-0.5 rounded bg-black/75 backdrop-blur-xs text-[8.5px] sm:text-[9.5px] font-bold text-white border border-white/10",
																	children: formatShortLanguage(item.language)
																})
															}),
															/* @__PURE__ */ _jsx("button", {
																type: "button",
																onClick: (e) => {
																	e.stopPropagation();
																	handleToggleWatchlist(item);
																},
																"aria-label": "Save to list",
																className: `absolute top-1 left-1 w-5 h-5 rounded-md backdrop-blur-xs flex items-center justify-center transition-colors ${isSaved ? "bg-[#dc2626] text-white" : "bg-black/60 text-white/85 hover:text-white"}`,
																children: /* @__PURE__ */ _jsx(Bookmark, { className: `w-2.5 h-2.5 ${isSaved ? "fill-current" : ""}` })
															}),
															/* @__PURE__ */ _jsxs("div", {
																className: "absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 via-black/60 to-transparent px-1.5 pt-4 pb-1 flex items-center justify-between gap-1 text-[9px]",
																children: [/* @__PURE__ */ _jsx("span", {
																	className: "font-bold text-[#ef4444] truncate",
																	children: item.episodePill || item.quality
																}), /* @__PURE__ */ _jsxs("span", {
																	className: "text-amber-400 font-bold flex items-center gap-0.5 shrink-0",
																	children: [/* @__PURE__ */ _jsx(Star, { className: "w-2.5 h-2.5 fill-current" }), /* @__PURE__ */ _jsx("span", { children: item.rating || "9.0" })]
																})]
															})
														]
													}), /* @__PURE__ */ _jsxs("div", {
														className: "p-1.5 sm:p-2 flex-1 flex flex-col justify-between space-y-0.5",
														children: [/* @__PURE__ */ _jsx("h3", {
															className: "text-[11px] sm:text-xs font-semibold text-gray-100 truncate group-hover:text-[#ef4444] transition-colors",
															children: item.title
														}), /* @__PURE__ */ _jsx("div", {
															className: "flex items-center justify-between text-[9.5px] text-gray-400",
															children: /* @__PURE__ */ _jsx("span", {
																className: `font-medium truncate ${isJustUploaded ? "text-[#ef4444]" : "text-amber-300/90"}`,
																children: item.timeAgo
															})
														})]
													})]
												}, item.path + item.title);
											})
										})
									] }),
									!submittedSearch && currentPage === 1 && /* @__PURE__ */ _jsxs("div", {
										className: "pt-3 space-y-2.5",
										children: [/* @__PURE__ */ _jsxs("div", {
											className: "flex items-center justify-between",
											children: [/* @__PURE__ */ _jsxs("div", {
												className: "flex items-center gap-2",
												children: [/* @__PURE__ */ _jsx(Trophy, { className: "w-4 h-4 text-[#ef4444]" }), /* @__PURE__ */ _jsx("h2", {
													className: "text-sm sm:text-base font-extrabold text-white tracking-tight",
													children: "TOP 10 THIS WEEK · সেরা ১০ হিট"
												})]
											}), /* @__PURE__ */ _jsxs("button", {
												type: "button",
												onClick: () => handleSelectCategory(findCat("/mostwatch/7d")),
												className: "text-xs text-[#ef4444] font-bold flex items-center gap-0.5",
												children: [/* @__PURE__ */ _jsx("span", { children: "Most Watched" }), /* @__PURE__ */ _jsx(ChevronRight, { className: "w-4 h-4" })]
											})]
										}), /* @__PURE__ */ _jsx("div", {
											className: "flex items-stretch gap-2.5 overflow-x-auto no-scrollbar pb-1",
											children: top10ThisWeekItems.map((item, idx) => /* @__PURE__ */ _jsxs("div", {
												onMouseEnter: () => prefetchMovieDetails(item.path, item.title, activeNodeId, true),
												onTouchStart: () => prefetchMovieDetails(item.path, item.title, activeNodeId, true),
												onClick: () => setSelectedMovie(item),
												className: "w-[106px] sm:w-[126px] shrink-0 rounded-xl overflow-hidden bg-[#0a0a0a] border border-white/[0.08] hover:border-[#dc2626]/60 cursor-pointer group flex flex-col transition-all",
												children: [/* @__PURE__ */ _jsxs("div", {
													className: "relative aspect-[2/3] w-full bg-[#050505] overflow-hidden",
													children: [
														item.poster && !brokenImages[item.id] ? /* @__PURE__ */ _jsx("img", {
															src: item.poster,
															alt: item.title,
															referrerPolicy: "no-referrer",
															loading: "lazy",
															onError: () => setBrokenImages((prev) => ({
																...prev,
																[item.id]: true
															})),
															className: "w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
														}) : /* @__PURE__ */ _jsx("div", {
															className: "w-full h-full flex items-center justify-center",
															children: /* @__PURE__ */ _jsx(Film, { className: "w-7 h-7 text-gray-600" })
														}),
														/* @__PURE__ */ _jsxs("span", {
															className: "absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-[#dc2626] text-white text-[9px] font-black shadow",
															children: ["#", idx + 1]
														}),
														/* @__PURE__ */ _jsx("span", {
															className: "absolute top-1.5 right-1.5 px-1 py-0.5 rounded bg-black/75 text-[8.5px] font-semibold text-white",
															children: formatShortLanguage(item.language)
														}),
														/* @__PURE__ */ _jsxs("div", {
															className: "absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/45 to-transparent px-1.5 pt-3 pb-1 flex items-center justify-between text-[9px]",
															children: [/* @__PURE__ */ _jsx("span", {
																className: "font-semibold text-[#ef4444] truncate",
																children: item.episodePill || item.quality
															}), /* @__PURE__ */ _jsxs("span", {
																className: "text-amber-400 font-bold flex items-center gap-0.5",
																children: [/* @__PURE__ */ _jsx(Star, { className: "w-2 h-2 fill-current" }), item.rating || "9.3"]
															})]
														})
													]
												}), /* @__PURE__ */ _jsxs("div", {
													className: "p-1.5 space-y-0.5",
													children: [/* @__PURE__ */ _jsx("h3", {
														className: "text-[11px] font-semibold text-gray-100 truncate group-hover:text-[#ef4444]",
														children: item.title
													}), /* @__PURE__ */ _jsx("p", {
														className: "text-[9.5px] text-amber-300/90 truncate",
														children: item.timeAgo
													})]
												})]
											}, item.path + idx))
										})]
									}),
									/* @__PURE__ */ _jsxs("div", {
										className: "rounded-2xl bg-[#0a0a0a] border border-white/[0.08] p-4 flex flex-col sm:flex-row items-center justify-between gap-4",
										children: [/* @__PURE__ */ _jsxs("div", {
											className: "flex flex-wrap items-center justify-center gap-1.5",
											children: [
												/* @__PURE__ */ _jsxs("button", {
													type: "button",
													disabled: currentPage <= 1,
													onClick: () => handlePageChange(currentPage - 1),
													className: "min-h-[40px] px-3.5 py-1.5 rounded-xl bg-[#141414] hover:bg-[#222222] disabled:opacity-40 text-xs font-bold text-white flex items-center gap-1",
													children: [/* @__PURE__ */ _jsx(ChevronLeft, { className: "w-4 h-4" }), /* @__PURE__ */ _jsx("span", { children: "Prev" })]
												}),
												Array.from({ length: 5 }, (_, idx) => {
													const pageNum = Math.max(1, Math.min(currentPage - 2, maxPage - 4)) + idx;
													if (pageNum < 1 || pageNum > maxPage) return null;
													return /* @__PURE__ */ _jsx("button", {
														type: "button",
														onClick: () => handlePageChange(pageNum),
														className: `min-h-[40px] min-w-[40px] px-3 py-1.5 rounded-xl text-xs font-bold font-mono tabular-nums transition-colors ${currentPage === pageNum ? "bg-[#dc2626] text-white shadow-[0_0_12px_rgba(220,38,38,0.4)]" : "bg-[#141414] text-gray-300 hover:bg-[#222222]"}`,
														children: pageNum
													}, pageNum);
												}),
												/* @__PURE__ */ _jsxs("button", {
													type: "button",
													disabled: currentPage >= maxPage,
													onClick: () => handlePageChange(currentPage + 1),
													className: "min-h-[40px] px-3.5 py-1.5 rounded-xl bg-[#141414] hover:bg-[#222222] disabled:opacity-40 text-xs font-bold text-white flex items-center gap-1",
													children: [/* @__PURE__ */ _jsx("span", { children: "Next" }), /* @__PURE__ */ _jsx(ChevronRight, { className: "w-4 h-4" })]
												})
											]
										}), /* @__PURE__ */ _jsxs("form", {
											onSubmit: handleJumpPage,
											className: "flex items-center gap-2",
											children: [/* @__PURE__ */ _jsx("input", {
												type: "number",
												min: 1,
												max: maxPage,
												value: jumpPageInput,
												onChange: (e) => setJumpPageInput(e.target.value),
												placeholder: `Page (1-${maxPage})`,
												className: "w-28 min-h-[40px] px-3 py-1.5 rounded-xl bg-[#141414] border border-white/10 text-xs text-white placeholder-gray-400 font-mono tabular-nums focus:outline-none focus:border-[#dc2626]"
											}), /* @__PURE__ */ _jsx("button", {
												type: "submit",
												className: "min-h-[40px] px-4 py-1.5 rounded-xl bg-[#dc2626] hover:bg-[#b91c1c] text-white text-xs font-extrabold whitespace-nowrap",
												children: "Go"
											})]
										})]
									})
								]
							})
						] })
					}),
					activeTab === "categories" && /* @__PURE__ */ _jsx("main", {
						className: "px-3.5 sm:px-8 pt-2 space-y-6",
						children: /* @__PURE__ */ _jsxs("div", {
							className: "rounded-3xl bg-[#0a0a0a] border border-white/[0.08] p-5 sm:p-6 space-y-6",
							children: [/* @__PURE__ */ _jsxs("div", {
								className: "flex items-center justify-between gap-4 border-b border-white/10 pb-4",
								children: [/* @__PURE__ */ _jsxs("div", { children: [/* @__PURE__ */ _jsx("h1", {
									className: "text-lg sm:text-xl font-extrabold text-white",
									children: "Explore All 55+ Categories & Zones"
								}), /* @__PURE__ */ _jsx("p", {
									className: "text-xs text-gray-400 mt-0.5",
									children: "যেকোনো ক্যাটাগরিতে ট্যাপ করে ৫২০+ পেজের সব মুভি ও সিরিজ দেখুন"
								})] }), /* @__PURE__ */ _jsx("button", {
									type: "button",
									onClick: () => setActiveTab("browse"),
									className: "px-4 py-2 rounded-full bg-[#dc2626] text-white text-xs font-extrabold",
									children: "Back Home"
								})]
							}), [
								{
									group: "zone",
									title: "Featured Zones"
								},
								{
									group: "language",
									title: "Languages & Audio Dubs"
								},
								{
									group: "genre",
									title: "Movie & Anime Genres"
								},
								{
									group: "collection",
									title: "Curated Franchises & Collections"
								}
							].map((section) => {
								const groupItems = ALL_CATEGORIES.filter((c) => c.group === section.group);
								if (groupItems.length === 0) return null;
								return /* @__PURE__ */ _jsxs("div", {
									className: "space-y-3",
									children: [/* @__PURE__ */ _jsx("h2", {
										className: "text-sm font-extrabold text-[#ef4444]",
										children: section.title
									}), /* @__PURE__ */ _jsx("div", {
										className: "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2.5",
										children: groupItems.map((cat) => /* @__PURE__ */ _jsxs("button", {
											type: "button",
											onClick: () => handleSelectCategory(cat),
											className: `min-h-[52px] px-3.5 py-2.5 rounded-2xl text-left transition-colors border flex flex-col justify-center ${currentCategory.path === cat.path ? "bg-[#7f1d1d]/35 text-white border-[#dc2626]" : "bg-[#121212] text-gray-200 border-white/5 hover:border-[#dc2626]/50"}`,
											children: [/* @__PURE__ */ _jsx("span", {
												className: "text-xs font-bold truncate",
												children: cat.label
											}), /* @__PURE__ */ _jsx("span", {
												className: "text-[11px] text-gray-400 truncate mt-0.5",
												children: cat.bnLabel
											})]
										}, cat.path))
									})]
								}, section.group);
							})]
						})
					}),
					activeTab === "watchlist" && /* @__PURE__ */ _jsxs("main", {
						className: "px-3.5 sm:px-8 pt-2 space-y-6",
						children: [/* @__PURE__ */ _jsxs("div", {
							className: "rounded-3xl bg-[#0a0a0a] border border-white/[0.08] p-5 sm:p-6 space-y-4",
							children: [
								/* @__PURE__ */ _jsxs("div", {
									className: "flex flex-wrap items-center justify-between gap-3",
									children: [/* @__PURE__ */ _jsxs("div", { children: [/* @__PURE__ */ _jsxs("h2", {
										className: "text-lg font-extrabold text-white",
										children: [
											"My List & Saved Downloads (",
											watchlist.length,
											")"
										]
									}), /* @__PURE__ */ _jsx("p", {
										className: "text-xs text-gray-400",
										children: "আপনার পছন্দের সেভ করা মুভি, অ্যানিমে ও ওয়াচ হিস্ট্রি"
									})] }), /* @__PURE__ */ _jsxs("div", {
										className: "flex items-center gap-2",
										children: [
											/* @__PURE__ */ _jsxs("button", {
												type: "button",
												onClick: handleExportWatchlist,
												className: "px-3 py-1.5 rounded-full bg-[#141414] border border-white/10 text-xs font-semibold text-gray-200 flex items-center gap-1.5",
												children: [/* @__PURE__ */ _jsx(Download, { className: "w-3.5 h-3.5 text-[#ef4444]" }), /* @__PURE__ */ _jsx("span", { children: "Backup" })]
											}),
											/* @__PURE__ */ _jsx("input", {
												ref: backupInputRef,
												type: "file",
												accept: ".json",
												onChange: handleImportWatchlist,
												className: "hidden"
											}),
											/* @__PURE__ */ _jsxs("button", {
												type: "button",
												onClick: () => backupInputRef.current?.click(),
												className: "px-3 py-1.5 rounded-full bg-[#141414] border border-white/10 text-xs font-semibold text-gray-200 flex items-center gap-1.5",
												children: [/* @__PURE__ */ _jsx(Upload, { className: "w-3.5 h-3.5 text-[#ef4444]" }), /* @__PURE__ */ _jsx("span", { children: "Restore" })]
											})
										]
									})]
								}),
								/* @__PURE__ */ _jsx("div", {
									className: "flex items-center gap-2 overflow-x-auto no-scrollbar pb-1",
									children: [
										{
											id: "all",
											label: `All (${watchlist.length})`
										},
										{
											id: "favorites",
											label: `Favorites (${watchlist.filter((m) => (m.folder || "favorites") === "favorites").length})`
										},
										{
											id: "watch_later",
											label: `Watch Later (${watchlist.filter((m) => m.folder === "watch_later").length})`
										},
										{
											id: "anime_series",
											label: `Series & Anime (${watchlist.filter((m) => m.folder === "anime_series").length})`
										}
									].map((tab) => /* @__PURE__ */ _jsxs("button", {
										type: "button",
										onClick: () => setWatchlistFolderTab(tab.id),
										className: `px-4 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors ${watchlistFolderTab === tab.id ? "bg-[#dc2626] text-white" : "bg-[#141414] text-gray-300"}`,
										children: [/* @__PURE__ */ _jsx(FolderHeart, { className: "w-3.5 h-3.5" }), /* @__PURE__ */ _jsx("span", { children: tab.label })]
									}, tab.id))
								}),
								filteredWatchlist.length === 0 ? /* @__PURE__ */ _jsxs("div", {
									className: "py-10 text-center space-y-3",
									children: [
										/* @__PURE__ */ _jsx(Bookmark, { className: "w-8 h-8 text-gray-500 mx-auto" }),
										/* @__PURE__ */ _jsx("p", {
											className: "text-sm text-gray-300 font-medium",
											children: "No movies saved in this folder yet"
										}),
										/* @__PURE__ */ _jsx("button", {
											type: "button",
											onClick: () => setActiveTab("browse"),
											className: "px-5 py-2 rounded-full bg-[#dc2626] text-white text-xs font-extrabold",
											children: "Discover Movies"
										})
									]
								}) : /* @__PURE__ */ _jsx("div", {
									className: "grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3",
									children: filteredWatchlist.map((item) => {
										const normItem = normalizeMovieCardItem(item);
										return /* @__PURE__ */ _jsxs("div", {
											onClick: () => setSelectedMovie(normItem),
											className: "group rounded-xl overflow-hidden bg-[#121212] border border-white/[0.08] cursor-pointer flex flex-col",
											children: [/* @__PURE__ */ _jsxs("div", {
												className: "relative aspect-[2/3] w-full bg-[#050505] overflow-hidden",
												children: [
													/* @__PURE__ */ _jsx("img", {
														src: item.poster,
														alt: item.title,
														referrerPolicy: "no-referrer",
														loading: "lazy",
														className: "w-full h-full object-cover group-hover:scale-105 transition-transform"
													}),
													/* @__PURE__ */ _jsx("span", {
														className: "absolute top-1.5 right-1.5 px-2 py-0.5 rounded bg-black/75 text-[10px] font-semibold text-white",
														children: formatShortLanguage(item.language)
													}),
													/* @__PURE__ */ _jsxs("span", {
														className: "absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded bg-black/80 text-[10px] font-bold text-amber-300 flex items-center gap-1",
														children: [/* @__PURE__ */ _jsx(Clock, { className: "w-2.5 h-2.5" }), normItem.timeAgo]
													})
												]
											}), /* @__PURE__ */ _jsxs("div", {
												className: "p-2",
												children: [/* @__PURE__ */ _jsx("h3", {
													className: "text-xs font-bold text-white truncate",
													children: item.title
												}), /* @__PURE__ */ _jsx("p", {
													className: "text-[10px] text-amber-300 mt-0.5",
													children: normItem.timeAgo
												})]
											})]
										}, item.path);
									})
								})
							]
						}), continueWatching.length > 0 && /* @__PURE__ */ _jsxs("div", {
							className: "rounded-3xl bg-[#0a0a0a] border border-white/[0.08] p-5 sm:p-6 space-y-4",
							children: [/* @__PURE__ */ _jsxs("div", {
								className: "flex items-center justify-between",
								children: [/* @__PURE__ */ _jsxs("h2", {
									className: "text-base font-extrabold text-white",
									children: [
										"Recent Watch History (",
										continueWatching.length,
										")"
									]
								}), /* @__PURE__ */ _jsxs("button", {
									type: "button",
									onClick: () => setContinueWatching([]),
									className: "text-xs text-[#ef4444] flex items-center gap-1",
									children: [/* @__PURE__ */ _jsx(Trash2, { className: "w-3.5 h-3.5" }), /* @__PURE__ */ _jsx("span", { children: "Clear" })]
								})]
							}), /* @__PURE__ */ _jsx("div", {
								className: "grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3",
								children: continueWatching.map((entry) => {
									const normMovie = normalizeMovieCardItem(entry.movie);
									return /* @__PURE__ */ _jsxs("div", {
										onClick: () => setSelectedMovie(normMovie),
										className: "rounded-xl overflow-hidden bg-[#121212] border border-white/[0.08] cursor-pointer",
										children: [/* @__PURE__ */ _jsxs("div", {
											className: "relative aspect-[2/3] w-full",
											children: [/* @__PURE__ */ _jsx("img", {
												src: entry.movie.poster,
												alt: entry.movie.title,
												referrerPolicy: "no-referrer",
												className: "w-full h-full object-cover"
											}), /* @__PURE__ */ _jsxs("div", {
												className: "absolute bottom-0 inset-x-0 bg-black/80 px-2 py-1 text-[10px] text-[#ef4444] font-semibold truncate",
												children: [
													entry.episodeLabel || "Movie",
													" · ",
													formatResumeTime(entry.progressSeconds)
												]
											})]
										}), /* @__PURE__ */ _jsxs("div", {
											className: "p-2",
											children: [/* @__PURE__ */ _jsx("div", {
												className: "text-xs font-semibold text-white truncate",
												children: entry.movie.title
											}), /* @__PURE__ */ _jsx("div", {
												className: "text-[10px] text-amber-300 mt-0.5",
												children: normMovie.timeAgo
											})]
										})]
									}, entry.movie.path);
								})
							})]
						})]
					}),
					activeTab === "me" && /* @__PURE__ */ _jsxs("main", {
						className: "min-h-screen bg-[#0c0d11] text-white px-3.5 sm:px-6 pt-3 pb-10 max-w-2xl mx-auto space-y-3.5 select-none",
						children: [/* @__PURE__ */ _jsx("div", {
							className: "flex items-center justify-end py-1",
							children: /* @__PURE__ */ _jsx("button", {
								type: "button",
								onClick: () => setShowInstallModal(true),
								"aria-label": "Scan or Share",
								className: "p-1.5 text-gray-200 hover:text-white transition-colors",
								children: /* @__PURE__ */ _jsx(ScanLine, { className: "w-6 h-6" })
							})
						}), /* @__PURE__ */ _jsxs("div", {
							className: "rounded-2xl bg-[#16181e] overflow-hidden shadow-lg",
							children: [
								/* @__PURE__ */ _jsxs("div", {
									className: "pt-4 pb-3.5 space-y-3",
									children: [/* @__PURE__ */ _jsxs("div", {
										onClick: () => setActiveTab("watchlist"),
										className: "px-4 flex items-center justify-between cursor-pointer",
										children: [/* @__PURE__ */ _jsxs("div", {
											className: "flex items-center gap-2.5",
											children: [/* @__PURE__ */ _jsx(History, { className: "w-5 h-5 text-gray-300" }), /* @__PURE__ */ _jsx("span", {
												className: "text-[15px] font-bold text-white",
												children: "Watch History"
											})]
										}), /* @__PURE__ */ _jsx(ChevronRight, { className: "w-4 h-4 text-gray-400" })]
									}), /* @__PURE__ */ _jsx("div", {
										className: "px-4 flex items-start gap-2.5 overflow-x-auto no-scrollbar",
										children: (continueWatching.length > 0 ? continueWatching.map((entry) => ({
											movie: normalizeMovieCardItem(entry.movie),
											pct: entry.durationSeconds && entry.progressSeconds ? Math.min(98, Math.max(14, Math.round(entry.progressSeconds / entry.durationSeconds * 100))) : 42
										})) : heroSlides.slice(0, 6).map((m, i) => ({
											movie: m,
											pct: [
												45,
												22,
												65,
												30,
												80,
												50
											][i % 6]
										}))).map(({ movie, pct }, idx) => {
											const isSeries = movie.typeBadge === "SERIES" || movie.typeBadge === "DRAMA" || movie.typeBadge === "ANIME" || Boolean(movie.episodePill);
											const cleanTitle = movie.title.replace(/\s*\(\d{4}\).*$/i, "").replace(/\s*(?:1080p|720p|480p|4K|WEB-DL|WEBRip|Full HD|HDTC).*$/i, "").trim();
											return /* @__PURE__ */ _jsxs("div", {
												onClick: () => setSelectedMovie(movie),
												className: "w-[128px] sm:w-[144px] shrink-0 cursor-pointer group",
												children: [/* @__PURE__ */ _jsxs("div", {
													className: "relative aspect-[16/10] w-full rounded-xl overflow-hidden bg-[#0e1015]",
													children: [
														movie.poster ? /* @__PURE__ */ _jsx("img", {
															src: movie.poster,
															alt: movie.title,
															referrerPolicy: "no-referrer",
															loading: "lazy",
															className: "w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
														}) : /* @__PURE__ */ _jsx("div", {
															className: "w-full h-full flex items-center justify-center",
															children: /* @__PURE__ */ _jsx(Film, { className: "w-5 h-5 text-gray-600" })
														}),
														/* @__PURE__ */ _jsx("div", {
															className: "absolute top-1.5 left-1.5 w-5 h-5 rounded-md bg-white/90 text-[#0c0d11] flex items-center justify-center shadow",
															children: isSeries ? /* @__PURE__ */ _jsx(Tv, { className: "w-3 h-3 stroke-[2.5]" }) : /* @__PURE__ */ _jsx(Film, { className: "w-3 h-3 stroke-[2.5]" })
														}),
														/* @__PURE__ */ _jsx("div", {
															className: "absolute bottom-0 inset-x-0 h-1 bg-black/50",
															children: /* @__PURE__ */ _jsx("div", {
																className: "h-full bg-gradient-to-r from-[#00e68a] to-[#12d6df]",
																style: { width: `${pct}%` }
															})
														})
													]
												}), /* @__PURE__ */ _jsx("div", {
													className: "mt-1.5 text-xs text-gray-300 truncate group-hover:text-white",
													children: cleanTitle || movie.title
												})]
											}, movie.path + idx);
										})
									})]
								}),
								/* @__PURE__ */ _jsxs("button", {
									type: "button",
									onClick: () => setActiveTab("watchlist"),
									className: "w-full px-4 py-4 border-t border-white/[0.04] hover:bg-white/[0.03] flex items-center justify-between transition-colors",
									children: [/* @__PURE__ */ _jsxs("div", {
										className: "flex items-center gap-3",
										children: [/* @__PURE__ */ _jsx(Bookmark, { className: "w-5 h-5 text-gray-300" }), /* @__PURE__ */ _jsx("span", {
											className: "text-[15px] font-medium text-gray-100",
											children: "My List"
										})]
									}), /* @__PURE__ */ _jsxs("div", {
										className: "flex items-center gap-1.5 text-sm text-gray-400",
										children: [/* @__PURE__ */ _jsx("span", { children: watchlist.length }), /* @__PURE__ */ _jsx(ChevronRight, { className: "w-4 h-4" })]
									})]
								}),
								/* @__PURE__ */ _jsxs("button", {
									type: "button",
									onClick: () => setShowRequestModal(true),
									className: "w-full px-4 py-4 border-t border-white/[0.04] hover:bg-white/[0.03] flex items-center justify-between transition-colors",
									children: [/* @__PURE__ */ _jsxs("div", {
										className: "flex items-center gap-3",
										children: [/* @__PURE__ */ _jsx(Bell, { className: "w-5 h-5 text-gray-300" }), /* @__PURE__ */ _jsx("span", {
											className: "text-[15px] font-medium text-gray-100",
											children: "New Uploads · Last 24h"
										})]
									}), /* @__PURE__ */ _jsxs("div", {
										className: "flex items-center gap-2",
										children: [/* @__PURE__ */ _jsx("span", {
											className: "px-2 py-0.5 rounded-full bg-[#e53935] text-white text-xs font-bold tabular-nums",
											children: last24hItems.length
										}), /* @__PURE__ */ _jsx(ChevronRight, { className: "w-4 h-4 text-gray-400" })]
									})]
								}),
								/* @__PURE__ */ _jsxs("button", {
									type: "button",
									onClick: () => setShowInstallModal(true),
									className: "w-full px-4 py-4 border-t border-white/[0.04] hover:bg-white/[0.03] flex items-center justify-between transition-colors",
									children: [/* @__PURE__ */ _jsxs("div", {
										className: "flex items-center gap-3",
										children: [/* @__PURE__ */ _jsx(Settings, { className: "w-5 h-5 text-gray-300" }), /* @__PURE__ */ _jsx("span", {
											className: "text-[15px] font-medium text-gray-100",
											children: "Install App & TV Setup"
										})]
									}), /* @__PURE__ */ _jsx(ChevronRight, { className: "w-4 h-4 text-gray-400" })]
								})
							]
						})]
					})
				]
			}),
			/* @__PURE__ */ _jsx("nav", {
				"aria-label": "Bottom Navigation",
				className: "fixed bottom-0 left-0 right-0 z-40 bg-[#0a0a0a]/95 backdrop-blur-lg border-t border-white/[0.08] pb-safe",
				children: /* @__PURE__ */ _jsxs("div", {
					className: "max-w-xl mx-auto grid grid-cols-5 items-center h-16 px-2",
					children: [
						/* @__PURE__ */ _jsxs("button", {
							type: "button",
							onClick: () => handleSelectCategory(ALL_CATEGORIES[0]),
							className: `flex flex-col items-center justify-center transition-colors ${activeTab === "browse" && currentCategory.path !== "/adult18plus" ? "text-[#ef4444]" : "text-gray-400 hover:text-white"}`,
							children: [/* @__PURE__ */ _jsx(House, { className: "w-5 h-5" }), /* @__PURE__ */ _jsx("span", {
								className: "text-[11px] font-medium mt-1",
								children: "Home"
							})]
						}),
						/* @__PURE__ */ _jsxs("button", {
							type: "button",
							onClick: () => setActiveTab("categories"),
							className: `relative flex flex-col items-center justify-center transition-colors ${activeTab === "categories" ? "text-[#ef4444]" : "text-gray-400 hover:text-white"}`,
							children: [/* @__PURE__ */ _jsxs("div", {
								className: "relative",
								children: [/* @__PURE__ */ _jsx(BookOpen, { className: "w-5 h-5" }), /* @__PURE__ */ _jsx("span", {
									className: "absolute -top-1.5 -right-5 px-1 py-0.2 rounded bg-[#dc2626] text-[8px] font-extrabold text-white leading-tight",
									children: "HOT"
								})]
							}), /* @__PURE__ */ _jsx("span", {
								className: "text-[11px] font-medium mt-1",
								children: "Explore"
							})]
						}),
						/* @__PURE__ */ _jsx("div", {
							className: "flex flex-col items-center justify-center",
							children: /* @__PURE__ */ _jsxs("button", {
								type: "button",
								onClick: () => handleSelectCategory(findCat("/adult18plus")),
								className: "relative -mt-6 w-14 h-14 rounded-full p-0.5 bg-gradient-to-tr from-[#7f1d1d] via-[#dc2626] to-[#ef4444] shadow-[0_6px_20px_rgba(220,38,38,0.45)] flex items-center justify-center transition-transform active:scale-95",
								children: [/* @__PURE__ */ _jsxs("div", {
									className: "w-full h-full rounded-full overflow-hidden bg-[#121212] relative flex items-center justify-center",
									children: [spotlightItem?.poster && /* @__PURE__ */ _jsx("img", {
										src: spotlightItem.poster,
										alt: "18+ Hub",
										referrerPolicy: "no-referrer",
										className: "w-full h-full object-cover opacity-75"
									}), /* @__PURE__ */ _jsx("div", {
										className: "absolute inset-0 bg-black/35 flex flex-col items-center justify-center",
										children: /* @__PURE__ */ _jsx("div", {
											className: "w-6 h-6 rounded-full bg-[#dc2626] text-white flex items-center justify-center shadow",
											children: /* @__PURE__ */ _jsx(Play, { className: "w-3.5 h-3.5 fill-current ml-0.5" })
										})
									})]
								}), /* @__PURE__ */ _jsx("span", {
									className: "absolute -bottom-1 px-1.5 py-0.2 rounded-full bg-black/90 text-[9px] font-extrabold text-white border border-[#dc2626]/50",
									children: "18+ Hub"
								})]
							})
						}),
						/* @__PURE__ */ _jsxs("button", {
							type: "button",
							onClick: () => setActiveTab("watchlist"),
							className: `flex flex-col items-center justify-center transition-colors ${activeTab === "watchlist" ? "text-[#ef4444]" : "text-gray-400 hover:text-white"}`,
							children: [/* @__PURE__ */ _jsx(Download, { className: "w-5 h-5" }), /* @__PURE__ */ _jsx("span", {
								className: "text-[11px] font-medium mt-1",
								children: "Downloads"
							})]
						}),
						/* @__PURE__ */ _jsxs("button", {
							type: "button",
							onClick: () => setActiveTab("me"),
							className: `flex flex-col items-center justify-center transition-colors ${activeTab === "me" ? "text-[#00e68a]" : "text-gray-400 hover:text-white"}`,
							children: [/* @__PURE__ */ _jsxs("div", {
								className: "relative",
								children: [/* @__PURE__ */ _jsx(User, { className: "w-5 h-5" }), /* @__PURE__ */ _jsx("span", { className: "w-2 h-2 rounded-full bg-[#e53935] absolute -top-0.5 -right-1" })]
							}), /* @__PURE__ */ _jsx("span", {
								className: "text-[11px] font-medium mt-1",
								children: "Me"
							})]
						})
					]
				})
			}),
			/* @__PURE__ */ _jsx(MovieDetailModal, {
				movie: selectedMovie,
				relatedMovies: displayedItems,
				activeNodeId,
				savedProgress: selectedMovieProgress,
				isMiniPlayer,
				onToggleMiniPlayer: (mini) => setIsMiniPlayer(mini),
				onClose: () => {
					setIsMiniPlayer(false);
					setSelectedMovie(null);
				},
				onSelectMovie: (m) => {
					setIsMiniPlayer(false);
					setSelectedMovie(m);
				},
				isInWatchlist: isMovieInWatchlist(selectedMovie),
				currentFolder: getMovieWatchlistFolder(selectedMovie),
				onToggleWatchlist: handleToggleWatchlist,
				onRecordWatchProgress: handleRecordWatchProgress,
				onSearchByActor: handleTriggerActorSearch,
				onOpenReportModal: (prefillTitle) => {
					setRequestPrefillTitle(prefillTitle);
					setRequestPrefillType("BROKEN_LINK");
					setShowRequestModal(true);
				}
			}),
			/* @__PURE__ */ _jsx(MovieRequestModal, {
				isOpen: showRequestModal,
				initialTitle: requestPrefillTitle,
				initialType: requestPrefillType,
				activeNodeId,
				onSelectNode: (nodeId) => setActiveNodeId(nodeId),
				onClose: () => setShowRequestModal(false),
				last24hItems,
				liveClockNow,
				isRefreshing24h: loadingCatalog || refreshing24h,
				onRefresh24h: () => {
					setLiveClockNow(Date.now());
					refreshLatest3SiteUploads(true);
					fetchCatalog(currentCategory.path, 1, "", activeNodeId, true);
				},
				onSelectMovie: (m) => {
					setIsMiniPlayer(false);
					setSelectedMovie(m);
				},
				continueWatching,
				onClearWatchHistory: () => setContinueWatching([])
			}),
			/* @__PURE__ */ _jsx(PWAInstallModal, {
				isOpen: showInstallModal,
				onClose: () => setShowInstallModal(false),
				isInstallable,
				isInstalled,
				isIOS,
				onTriggerInstall: install
			})
		]
	});
}