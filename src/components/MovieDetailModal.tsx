// @ts-nocheck
import React from "react";
import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { ArrowUpDown, Bell, BookOpen, Bookmark, Calendar, Captions, Check, ChevronDown, ChevronLeft, ChevronRight, CircleCheck, Clock, Copy, Download, FastForward, Film, Flame, FolderHeart, Globe, History, House, Layers, ListPlus, LoaderCircle, Maximize2, Maximize, MessageSquarePlus, Mic, Minimize2, Minimize, Pause, PictureInPicture2, Play, RefreshCw, RotateCcw, RotateCw, ScanLine, Search, Send, Server, Settings, Share2, Share, SlidersHorizontal, Smartphone, Sparkles, SquarePlus, Star, Sun, Trash2, Trophy, Tv, Upload, User, Volume2, VolumeX, WifiOff, X } from "lucide-react";
import Hls from "hls.js";
import { MkvIosHlsController } from "../services/mkvIosClientRemuxer";
import { getInstantCachedDetail, loadShardForMovie, prefetchMovieDetails, setVideoStartupPriority, stopBackgroundWarmVideo, universalApiFetch, warmStreamConnection } from "../services/liveClientEngine";
import { buildVttFromCues, ensureBanglaTranslationAroundTime, fetchOrGenerateAutoBanglaSubtitles, findActiveCueTextAtTime, loadSubtitleTrackByUrl, parseSrtOrVttToCues } from "../services/autoBanglaSubtitleEngine";
import { cloakStreamUrl } from "../utils/securityShield";
import { formatEpisodeTileBadge, sanitizeBrandText } from "../utils/timeAgo";
import { getUploaderSiteInfo } from "./MovieRequestModal";
// src/components/MovieDetailModal.tsx
var import_jsx_runtime = (/* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = require_react_jsx_runtime_production();
})))();
var INTRO_SKIP_STORAGE_KEY = "cp_intro_skip_sec_v3";
var AUTO_NEXT_STORAGE_KEY = "cp_auto_next_ep_v1";
var BRIGHTNESS_STORAGE_KEY = "cp_player_brightness_v1";
var AUTO_NET_STORAGE_KEY = "cp_auto_net_quality_v1";
var SOUND_BOOST_STORAGE_KEY = "cp_sound_boost_vol_v1";
var videoAudioBoosterMap = /* @__PURE__ */ new WeakMap();
/**
* Applies up to 400% (4.0x) Ultra Sound Boost + Vocal Clarity EQ + Anti-Clipping Compressor
* via Web Audio API when volumePercent > 100.
*/
function syncVideoAudioBooster(videoEl, volumePercent, muted) {
	try {
		if (muted || volumePercent <= 0) {
			videoEl.volume = 0;
			videoEl.muted = true;
			const existing = videoAudioBoosterMap.get(videoEl);
			if (existing) {
				existing.gainNode.gain.value = 1;
				existing.vocalFilter.gain.value = 0;
			}
			return;
		}
		videoEl.muted = false;
		if (volumePercent <= 100) {
			videoEl.volume = Math.max(0, Math.min(1, volumePercent / 100));
			const existing = videoAudioBoosterMap.get(videoEl);
			if (existing) {
				existing.gainNode.gain.value = 1;
				existing.vocalFilter.gain.value = 0;
				if (existing.ctx.state === "suspended") existing.ctx.resume().catch(() => {});
			}
			return;
		}
		videoEl.volume = 1;
		let chain = videoAudioBoosterMap.get(videoEl);
		if (!chain) {
			const currentSrc = videoEl.currentSrc || videoEl.src || "";
			if (!(!currentSrc || currentSrc.startsWith("blob:") || currentSrc.startsWith("data:") || currentSrc.startsWith("/") || currentSrc.includes("/api/stream") || typeof window !== "undefined" && currentSrc.startsWith(window.location.origin))) return;
			const AudioCtx = window.AudioContext || window.webkitAudioContext;
			if (!AudioCtx) return;
			const ctx = new AudioCtx();
			const source = ctx.createMediaElementSource(videoEl);
			const vocalFilter = ctx.createBiquadFilter();
			vocalFilter.type = "peaking";
			vocalFilter.frequency.value = 2200;
			vocalFilter.Q.value = 1;
			vocalFilter.gain.value = 0;
			const gainNode = ctx.createGain();
			gainNode.gain.value = 1;
			const compressor = ctx.createDynamicsCompressor();
			compressor.threshold.value = -10;
			compressor.knee.value = 16;
			compressor.ratio.value = 4;
			compressor.attack.value = .003;
			compressor.release.value = .15;
			source.connect(vocalFilter);
			vocalFilter.connect(gainNode);
			gainNode.connect(compressor);
			compressor.connect(ctx.destination);
			chain = {
				ctx,
				gainNode,
				vocalFilter,
				compressor
			};
			videoAudioBoosterMap.set(videoEl, chain);
		}
		if (chain.ctx.state === "suspended") chain.ctx.resume().catch(() => {});
		const boostMultiplier = Math.max(1, Math.min(4, volumePercent / 100));
		chain.gainNode.gain.value = boostMultiplier;
		chain.vocalFilter.gain.value = Math.min(6, (boostMultiplier - 1) / 3 * 6);
	} catch {
		try {
			videoEl.volume = Math.max(0, Math.min(1, volumePercent / 100));
		} catch {}
	}
}
function formatSeconds(sec) {
	if (!sec || sec < 0 || !isFinite(sec)) return "00:00";
	const hrs = Math.floor(sec / 3600);
	const mins = Math.floor(sec % 3600 / 60);
	const s = Math.floor(sec % 60);
	if (hrs > 0) return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
	return `${String(mins).padStart(2, "0")}:${String(s).padStart(s < 10 ? 2 : 2, "0")}`;
}
function formatEpisodeTileBadge(ep, fallbackIdx) {
	if (ep.id === "movie-special" || ep.number === 0) return "Movie";
	const start = ep.rangeStart ?? ep.number;
	const end = ep.rangeEnd ?? ep.number;
	if (start !== null && start !== void 0) {
		const startPad = String(start).padStart(2, "0");
		if (end !== null && end !== void 0 && end > start) return `${startPad}-${String(end).padStart(2, "0")}`;
		return startPad;
	}
	return String(fallbackIdx + 1).padStart(2, "0");
}
function detectIdealQualityForNetwork() {
	try {
		const nav = navigator;
		const conn = nav.connection || nav.mozConnection || nav.webkitConnection;
		if (conn) {
			const eff = String(conn.effectiveType || "").toLowerCase();
			const down = Number(conn.downlink || 0);
			if (Boolean(conn.saveData) || eff === "2g" || eff === "slow-2g" || eff === "3g" || down > 0 && down < 4) return {
				targetQuality: 480,
				netLabel: down > 0 ? `Instant Start (${down}Mbps) · 480p` : "Instant Start · 480p"
			};
			if (down >= 12) return {
				targetQuality: 1080,
				netLabel: `Turbo Auto (${down}Mbps) · 480p→1080p`
			};
			if (down > 0) return {
				targetQuality: 720,
				netLabel: `Turbo Auto (${down}Mbps) · 480p→720p`
			};
		}
	} catch {}
	return {
		targetQuality: 720,
		netLabel: "Turbo Auto · 480p→HD"
	};
}
/**
* Instant-Start Source Selector:
* When opening any movie or episode in Auto mode, ALWAYS pick the lowest bitrate H.264 stream
* (480p / 360p, or lightweight 720p WEB-DL) first so the video starts playing in < 0.2s without buffering!
* Once playing smoothly with healthy buffer, the Standby Preloader upgrades to 720p/1080p seamlessly.
*/
function pickBestSourceIndexForNet(sources, autoNet) {
	if (!sources || sources.length === 0) return 0;
	const isDirectStream = (s) => s.type !== "embed" && !/abyssplayer\.com|abysscdn\.com|vidsrc|\/embed\//i.test(s.url || "");
	const isNativeMp4Stream = (s) => isDirectStream(s) && (s.type === "mp4" || /\/_s\/v\.mp4|\/api\/mb-stream|\/api\/mb-ep-stream|\.(mp4|m4v)(\?|$)/i.test(s.url || ""));
	const isLightweightH264 = (s) => isDirectStream(s) && !/\b(hevc|h\.?265|x265|10bit|av1)\b/i.test(`${s.name} ${s.qualityLabel}`) && !/best\s*quality/i.test(s.qualityLabel || "");
	const isAnyDirectH264 = (s) => isDirectStream(s) && !/\b(hevc|h\.?265|x265|10bit|av1)\b/i.test(`${s.name} ${s.qualityLabel}`);
	if (autoNet) {
		const mp4UltraFast = sources.findIndex((s) => isNativeMp4Stream(s) && s.quality >= 360 && s.quality <= 576);
		if (mp4UltraFast !== -1) return mp4UltraFast;
		const mp4Fast720 = sources.findIndex((s) => isNativeMp4Stream(s) && s.quality === 720);
		if (mp4Fast720 !== -1) return mp4Fast720;
	}
	const anyNativeMp4 = sources.findIndex((s) => isNativeMp4Stream(s));
	if (anyNativeMp4 !== -1) return anyNativeMp4;
	if (!autoNet) {
		const firstH264 = sources.findIndex((s) => isLightweightH264(s));
		if (firstH264 !== -1) return firstH264;
		const fallbackH264 = sources.findIndex((s) => isAnyDirectH264(s));
		if (fallbackH264 !== -1) return fallbackH264;
		const anyDirect = sources.findIndex((s) => isDirectStream(s));
		return anyDirect !== -1 ? anyDirect : 0;
	}
	const h480 = sources.findIndex((s) => isLightweightH264(s) && s.quality >= 360 && s.quality <= 576);
	if (h480 !== -1) return h480;
	const h720 = sources.findIndex((s) => isLightweightH264(s) && s.quality === 720);
	if (h720 !== -1) return h720;
	const anyLightH264 = sources.findIndex((s) => isLightweightH264(s));
	if (anyLightH264 !== -1) return anyLightH264;
	const anyDirectH264 = sources.findIndex((s) => isAnyDirectH264(s));
	if (anyDirectH264 !== -1) return anyDirectH264;
	const anyDirect = sources.findIndex((s) => isDirectStream(s));
	return anyDirect !== -1 ? anyDirect : 0;
}
function convertSrtToVtt(srtContent) {
	const normalized = srtContent.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2");
	if (normalized.trim().startsWith("WEBVTT")) return normalized;
	return `WEBVTT\n\n${normalized}`;
}
function isAppleWebKitDevice() {
	if (typeof window === "undefined" || typeof navigator === "undefined") return false;
	const ua = navigator.userAgent || "";
	const isIOS = /iPhone|iPad|iPod/i.test(ua) || navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
	const isSafari = /Safari/i.test(ua) && !/Chrome|Chromium|Edg|OPR|Android/i.test(ua);
	return isIOS || isSafari;
}
function buildInstantMovieBoxBootstrapDetail(movie) {
	if (!movie) return null;
	const rawPath = (movie.path || movie.url || "").trim();
	if (!rawPath.startsWith("/mb/")) return null;
	const parts = rawPath.replace(/^\/mb\//, "").split("/").filter(Boolean);
	const subjectId = parts[0] || "";
	const detailPath = parts[1] || "movie";
	if (!subjectId) return null;
	const isMovie = movie.typeBadge === "MOVIE" && !/\b(s\d+|season|series|ep(?:isode)?)\b/i.test(`${movie.title} ${movie.episodePill || ""}`);
	const seNum = isMovie ? 0 : 1;
	const epNum = isMovie ? 0 : 1;
	const lang = movie.language || "Original Audio";
	const baseStreamUrl = `/api/mb-ep-stream.mp4?subjectId=${encodeURIComponent(subjectId)}&detailPath=${encodeURIComponent(detailPath)}&se=${seNum}&ep=${epNum}`;
	const bootstrapSources = [
		{
			id: `mb-boot-${subjectId}-s${seNum}-e${epNum}-480`,
			quality: 480,
			qualityLabel: "480p Fast Instant (CinePulse Direct)",
			audio: lang,
			audioLanguages: [lang],
			provider: "CinePulse HD 480p",
			url: cloakStreamUrl(`${baseStreamUrl}&q=480`),
			downloadUrl: cloakStreamUrl(`${baseStreamUrl}&q=480&dl=1`),
			type: "mp4",
			name: `${movie.title} (480p)`
		},
		{
			id: `mb-boot-${subjectId}-s${seNum}-e${epNum}-720`,
			quality: 720,
			qualityLabel: "720p HD (CinePulse Direct)",
			audio: lang,
			audioLanguages: [lang],
			provider: "CinePulse HD 720p",
			url: cloakStreamUrl(`${baseStreamUrl}&q=720`),
			downloadUrl: cloakStreamUrl(`${baseStreamUrl}&q=720&dl=1`),
			type: "mp4",
			name: `${movie.title} (720p)`
		},
		{
			id: `mb-boot-${subjectId}-s${seNum}-e${epNum}-1080`,
			quality: 1080,
			qualityLabel: "1080p Full HD (CinePulse Direct)",
			audio: lang,
			audioLanguages: [lang],
			provider: "CinePulse HD 1080p",
			url: cloakStreamUrl(`${baseStreamUrl}&q=1080`),
			downloadUrl: cloakStreamUrl(`${baseStreamUrl}&q=1080&dl=1`),
			type: "mp4",
			name: `${movie.title} (1080p)`
		}
	];
	return {
		title: movie.title,
		url: rawPath,
		poster: movie.poster,
		qualityNote: `1080p / 720p / 480p • ${lang}`,
		typeBadge: isMovie ? "MOVIE" : movie.typeBadge || "SERIES",
		language: lang,
		quality: movie.quality || "1080p FHD",
		genre: movie.sportGenre || (isMovie ? "Action, Drama" : "Animation, Action, Drama"),
		resolution: "1080p | 720p | 480p",
		releaseDate: movie.timeAgo || "2026",
		storyline: "",
		youtubeTrailerId: "",
		screenshots: movie.poster ? [movie.poster] : [],
		episodes: [{
			id: isMovie ? `mb-movie-${subjectId}` : `mb-ep-${subjectId}-s1-e1`,
			label: isMovie ? "Full Movie (CinePulse HD)" : "S01E01 • Episode 1",
			number: 1,
			rangeStart: 1,
			rangeEnd: 1,
			season: isMovie ? null : 1,
			kind: isMovie ? "movie" : "episode",
			sources: bootstrapSources
		}],
		downloadButtons: [],
		cast: []
	};
}
export var MovieDetailModal = ({ movie, relatedMovies, activeNodeId, savedProgress, isMiniPlayer = false, onToggleMiniPlayer, onClose, onSelectMovie, isInWatchlist, currentFolder = "favorites", onToggleWatchlist, onRecordWatchProgress, onSearchByActor, onOpenReportModal }) => {
	const instantDetailOnRender = React.useMemo(() => {
		if (!movie) return null;
		return getInstantCachedDetail(movie.path || movie.url, movie.title) || buildInstantMovieBoxBootstrapDetail(movie);
	}, [
		movie?.path,
		movie?.url,
		movie?.title
	]);
	const [detail, setDetail] = React.useState(() => instantDetailOnRender);
	const [loading, setLoading] = React.useState(() => !instantDetailOnRender);
	const [error, setError] = React.useState(null);
	const [selectedEpIdx, setSelectedEpIdx] = React.useState(() => {
		const eps = instantDetailOnRender?.episodes || [];
		return savedProgress?.episodeIdx !== void 0 && eps[savedProgress.episodeIdx] ? savedProgress.episodeIdx : 0;
	});
	const [selectedSourceIdx, setSelectedSourceIdx] = React.useState(() => {
		const eps = instantDetailOnRender?.episodes || [];
		return pickBestSourceIndexForNet((savedProgress?.episodeIdx !== void 0 && eps[savedProgress.episodeIdx] ? eps[savedProgress.episodeIdx] : eps[0])?.sources || [], true);
	});
	const [selectedSeasonFilter, setSelectedSeasonFilter] = React.useState("all");
	const [episodeSearchQuery, setEpisodeSearchQuery] = React.useState("");
	const [episodeSortOrder, setEpisodeSortOrder] = React.useState("asc");
	const [failedSourceIndices, setFailedSourceIndices] = React.useState([]);
	const [showAllEpisodesModal, setShowAllEpisodesModal] = React.useState(false);
	const [showDownloadSheet, setShowDownloadSheet] = React.useState(false);
	const [bottomTab, setBottomTab] = React.useState("forYou");
	const [userRatingStars, setUserRatingStars] = React.useState(5);
	const [userReviewName, setUserReviewName] = React.useState("");
	const [userReviewText, setUserReviewText] = React.useState("");
	const [customReviewsMap, setCustomReviewsMap] = React.useState(() => {
		try {
			const raw = localStorage.getItem("cp_moviebox_reviews_v1");
			return raw ? JSON.parse(raw) : {};
		} catch {
			return {};
		}
	});
	const [autoNetQuality, setAutoNetQuality] = React.useState(() => {
		try {
			return localStorage.getItem(AUTO_NET_STORAGE_KEY) !== "0";
		} catch {
			return true;
		}
	});
	const [netStatusLabel, setNetStatusLabel] = React.useState(() => {
		return detectIdealQualityForNetwork().netLabel;
	});
	const [showQualityMenu, setShowQualityMenu] = React.useState(false);
	const [showAudioServerMenu, setShowAudioServerMenu] = React.useState(false);
	const [showSleepMenu, setShowSleepMenu] = React.useState(false);
	const [sleepTimerMode, setSleepTimerMode] = React.useState(null);
	const [sleepRemainingSec, setSleepRemainingSec] = React.useState(null);
	const [seekRipple, setSeekRipple] = React.useState(null);
	const [scrubPreview, setScrubPreview] = React.useState(null);
	const [nextEpPrewarmed, setNextEpPrewarmed] = React.useState(false);
	const [playerMode, setPlayerMode] = React.useState("stream");
	const [videoError, setVideoError] = React.useState(false);
	const [useHlsBridge, setUseHlsBridge] = React.useState(() => isAppleWebKitDevice());
	const [iosBlobUrl, setIosBlobUrl] = React.useState("");
	const [iosSegmentStartSec, setIosSegmentStartSec] = React.useState(0);
	const [iosCurrentSegIndex, setIosCurrentSegIndex] = React.useState(0);
	const iosControllerRef = React.useRef(null);
	const iosTransitioningRef = React.useRef(false);
	const hlsInstanceRef = React.useRef(null);
	const [isPlaying, setIsPlaying] = React.useState(false);
	const [hasStartedPlayback, setHasStartedPlayback] = React.useState(false);
	const [standbyUpgradeIdx, setStandbyUpgradeIdx] = React.useState(null);
	const [isBuffering, setIsBuffering] = React.useState(false);
	const [isScrubbing, setIsScrubbing] = React.useState(false);
	const [currentTime, setCurrentTime] = React.useState(0);
	const [bufferedEnd, setBufferedEnd] = React.useState(0);
	const [duration, setDuration] = React.useState(0);
	const [playbackSpeed, setPlaybackSpeed] = React.useState(1);
	const [isHold2x, setIsHold2x] = React.useState(false);
	const [videoFit, setVideoFit] = React.useState("contain");
	const [isScreenLocked, setIsScreenLocked] = React.useState(false);
	const [showOverlayControls, setShowOverlayControls] = React.useState(false);
	const [isFullscreen, setIsFullscreen] = React.useState(false);
	const [isLandscapeMode, setIsLandscapeMode] = React.useState(false);
	const [isViewportPortrait, setIsViewportPortrait] = React.useState(() => typeof window !== "undefined" ? window.innerHeight >= window.innerWidth : true);
	const [viewportDims, setViewportDims] = React.useState(() => ({
		width: typeof window !== "undefined" ? window.innerWidth : 390,
		height: typeof window !== "undefined" ? window.innerHeight : 844
	}));
	const [brightness, setBrightness] = React.useState(() => {
		try {
			const saved = Number(localStorage.getItem(BRIGHTNESS_STORAGE_KEY));
			return saved >= 20 && saved <= 160 ? saved : 100;
		} catch {
			return 100;
		}
	});
	const [showBrightnessPanel, setShowBrightnessPanel] = React.useState(false);
	const [volume, setVolume] = React.useState(() => {
		try {
			const saved = Number(localStorage.getItem(SOUND_BOOST_STORAGE_KEY));
			if (!Number.isNaN(saved) && saved >= 10 && saved <= 400) return Math.round(saved);
		} catch {}
		return 100;
	});
	const [showSoundBoostBar, setShowSoundBoostBar] = React.useState(false);
	const [isMuted, setIsMuted] = React.useState(false);
	const [autoMutedForiOS, setAutoMutedForiOS] = React.useState(false);
	const [hudNotice, setHudNotice] = React.useState(null);
	const [copiedShare, setCopiedShare] = React.useState(false);
	const [copiedBatch, setCopiedBatch] = React.useState(false);
	const [introSkipSec, setIntroSkipSec] = React.useState(13.5);
	const [autoNextEp, setAutoNextEp] = React.useState(() => {
		try {
			return localStorage.getItem(AUTO_NEXT_STORAGE_KEY) !== "0";
		} catch {
			return true;
		}
	});
	const [resumedBannerSec, setResumedBannerSec] = React.useState(null);
	const [autoBanglaSubEnabled, setAutoBanglaSubEnabled] = React.useState(false);
	const [subtitleCues, setSubtitleCues] = React.useState([]);
	const [loadingAutoSub, setLoadingAutoSub] = React.useState(false);
	const [subFontSize, setSubFontSize] = React.useState("sm");
	const [subtitleUrl, setSubtitleUrl] = React.useState(null);
	const [subtitleName, setSubtitleName] = React.useState("");
	const [availableSubTracks, setAvailableSubTracks] = React.useState([]);
	const [activeSubTrackIdx, setActiveSubTrackIdx] = React.useState(0);
	const [subOffsetSec, setSubOffsetSec] = React.useState(0);
	const [showSubSyncPanel, setShowSubSyncPanel] = React.useState(false);
	const [activeBanglaCueText, setActiveBanglaCueText] = React.useState("");
	const lastRenderedSubTextRef = React.useRef("");
	const subtitleInputRef = React.useRef(null);
	const subtitleUrlRef = React.useRef(null);
	const loadedSubKeyRef = React.useRef("");
	const updateSubtitleBlobUrl = (nextUrl) => {
		if (subtitleUrlRef.current && subtitleUrlRef.current !== nextUrl) try {
			URL.revokeObjectURL(subtitleUrlRef.current);
		} catch {}
		subtitleUrlRef.current = nextUrl;
		setSubtitleUrl(nextUrl);
	};
	const modalContainerRef = React.useRef(null);
	const videoRef = React.useRef(null);
	const preloadVideoRef = React.useRef(null);
	const playerStageRef = React.useRef(null);
	const scrubberRef = React.useRef(null);
	const isScrubbingRef = React.useRef(false);
	const scrubTargetSecRef = React.useRef(0);
	React.useRef(0);
	const isSeekingRef = React.useRef(false);
	const seekReqIdRef = React.useRef(0);
	const iosSegmentStartSecRef = React.useRef(0);
	const iosCurrentSegIndexRef = React.useRef(0);
	const overlayTimerRef = React.useRef(null);
	const hudTimerRef = React.useRef(null);
	const holdTimerRef = React.useRef(null);
	const rippleTimerRef = React.useRef(null);
	const prewarmedNextEpIdxRef = React.useRef(null);
	const stallDownshiftTimerRef = React.useRef(null);
	const startupWatchdogTimerRef = React.useRef(null);
	const standbyTimeoutRef = React.useRef(null);
	const smoothPlaySecondsRef = React.useRef(0);
	const hasStalledInSessionRef = React.useRef(false);
	const hasTriedBridgeFallbackRef = React.useRef(false);
	const hasUserManualServerRef = React.useRef(false);
	const lastTapRef = React.useRef({
		time: 0,
		side: "center"
	});
	const touchGestureRef = React.useRef(null);
	const lastRecordedSecondRef = React.useRef(-1);
	const pendingResumeSecRef = React.useRef(null);
	const hasAppliedIntroSkipRef = React.useRef(false);
	const pendingOsPipRef = React.useRef(false);
	const embedIframeRef = React.useRef(null);
	const [isPortraitFullscreen, setIsPortraitFullscreen] = React.useState(false);
	const [isOsPipActive, setIsOsPipActive] = React.useState(false);
	const [miniWidth, setMiniWidth] = React.useState(250);
	const [miniPos, setMiniPos] = React.useState(null);
	const lastMiniTapTimeRef = React.useRef(0);
	const manualLandscapeLockRef = React.useRef(false);
	const autoTiltLandscapeRef = React.useRef(false);
	const wasViewportLandscapeRef = React.useRef(false);
	const tiltDebounceRef = React.useRef(null);
	const [selectedQualityPref, setSelectedQualityPref] = React.useState("auto");
	const [showSeparateQualityBar, setShowSeparateQualityBar] = React.useState(false);
	const miniDragRef = React.useRef(null);
	const triggerHud = (type, label, percent, timeoutMs = 1100) => {
		setHudNotice({
			type,
			label,
			percent
		});
		if (hudTimerRef.current) window.clearTimeout(hudTimerRef.current);
		hudTimerRef.current = window.setTimeout(() => {
			setHudNotice(null);
		}, timeoutMs);
	};
	const resetOverlayAutoHide = () => {
		setShowOverlayControls(true);
		if (overlayTimerRef.current) window.clearTimeout(overlayTimerRef.current);
		overlayTimerRef.current = window.setTimeout(() => {
			if (videoRef.current && !videoRef.current.paused && !isScrubbing && !showBrightnessPanel && !showQualityMenu && !showAudioServerMenu && !showSleepMenu) setShowOverlayControls(false);
		}, 3600);
	};
	React.useEffect(() => {
		if (typeof sleepTimerMode !== "number" || sleepRemainingSec === null) return;
		if (sleepRemainingSec <= 0) {
			if (videoRef.current && !videoRef.current.paused) videoRef.current.pause();
			setSleepTimerMode(null);
			setSleepRemainingSec(null);
			triggerHud("toast", "🌙 স্লিপ টাইমার শেষ হয়েছে — ভিডিও পজ করা হয়েছে", void 0, 3200);
			return;
		}
		const timer = window.setInterval(() => {
			setSleepRemainingSec((prev) => prev !== null && prev > 0 ? prev - 1 : 0);
		}, 1e3);
		return () => window.clearInterval(timer);
	}, [sleepTimerMode, sleepRemainingSec]);
	React.useEffect(() => {
		try {
			localStorage.setItem(BRIGHTNESS_STORAGE_KEY, String(brightness));
		} catch {}
	}, [brightness]);
	React.useEffect(() => {
		try {
			localStorage.setItem(AUTO_NET_STORAGE_KEY, autoNetQuality ? "1" : "0");
		} catch {}
	}, [autoNetQuality]);
	React.useEffect(() => {
		try {
			localStorage.setItem(INTRO_SKIP_STORAGE_KEY, String(introSkipSec));
		} catch {}
	}, [introSkipSec]);
	React.useEffect(() => {
		try {
			localStorage.setItem(AUTO_NEXT_STORAGE_KEY, autoNextEp ? "1" : "0");
		} catch {}
	}, [autoNextEp]);
	React.useEffect(() => {
		try {
			localStorage.setItem("cp_auto_bangla_sub_v1", autoBanglaSubEnabled ? "1" : "0");
		} catch {}
	}, [autoBanglaSubEnabled]);
	React.useEffect(() => {
		const updateOrientation = () => {
			const w = window.innerWidth || 390;
			const h = window.innerHeight || 844;
			setIsViewportPortrait(h >= w);
			setViewportDims({
				width: w,
				height: h
			});
			const scrAngle = typeof (window.screen?.orientation)?.angle === "number" ? window.screen.orientation.angle : typeof window.orientation === "number" ? window.orientation : 0;
			const scrType = String((window.screen?.orientation)?.type || "");
			const isNowLandscape = (Math.min(w, h) <= 960 || "ontouchstart" in window) && (w > h * 1.05 || scrType.startsWith("landscape") || scrAngle === 90 || scrAngle === -90 || scrAngle === 270);
			if (isNowLandscape && !wasViewportLandscapeRef.current) {
				wasViewportLandscapeRef.current = true;
				setIsPortraitFullscreen(false);
				setIsLandscapeMode(true);
				setIsFullscreen(true);
			} else if (!isNowLandscape && wasViewportLandscapeRef.current) {
				wasViewportLandscapeRef.current = false;
				if (!manualLandscapeLockRef.current) {
					setIsLandscapeMode(false);
					setIsFullscreen(false);
				}
			}
		};
		const onDeviceOrientation = (e) => {
			const gamma = typeof e.gamma === "number" ? e.gamma : 0;
			const beta = typeof e.beta === "number" ? e.beta : 0;
			if (gamma === 0 && beta === 0) return;
			const isTiltedSideways = Math.abs(gamma) >= 48 && Math.abs(beta) <= 45;
			const isHeldUpright = Math.abs(beta) >= 48 && Math.abs(gamma) <= 25;
			if (isTiltedSideways && !autoTiltLandscapeRef.current) {
				if (tiltDebounceRef.current) window.clearTimeout(tiltDebounceRef.current);
				tiltDebounceRef.current = window.setTimeout(() => {
					autoTiltLandscapeRef.current = true;
					setIsPortraitFullscreen(false);
					setIsLandscapeMode(true);
					setIsFullscreen(true);
				}, 300);
			} else if (isHeldUpright && autoTiltLandscapeRef.current && !manualLandscapeLockRef.current) {
				if (tiltDebounceRef.current) window.clearTimeout(tiltDebounceRef.current);
				tiltDebounceRef.current = window.setTimeout(() => {
					autoTiltLandscapeRef.current = false;
					if (!wasViewportLandscapeRef.current) {
						setIsLandscapeMode(false);
						setIsFullscreen(false);
					}
				}, 300);
			}
		};
		const onFsChange = () => {
			const fsActive = Boolean(document.fullscreenElement || document.webkitFullscreenElement);
			setIsFullscreen(fsActive);
			if (!fsActive && !wasViewportLandscapeRef.current && !autoTiltLandscapeRef.current) setIsLandscapeMode(false);
			updateOrientation();
		};
		const mql = window.matchMedia ? window.matchMedia("(orientation: landscape)") : null;
		const onMqlChange = () => updateOrientation();
		window.addEventListener("resize", updateOrientation);
		window.addEventListener("orientationchange", updateOrientation);
		window.addEventListener("deviceorientation", onDeviceOrientation, true);
		if (window.screen?.orientation) window.screen.orientation.addEventListener?.("change", updateOrientation);
		if (mql?.addEventListener) mql.addEventListener("change", onMqlChange);
		document.addEventListener("fullscreenchange", onFsChange);
		document.addEventListener("webkitfullscreenchange", onFsChange);
		updateOrientation();
		return () => {
			if (tiltDebounceRef.current) window.clearTimeout(tiltDebounceRef.current);
			window.removeEventListener("resize", updateOrientation);
			window.removeEventListener("orientationchange", updateOrientation);
			window.removeEventListener("deviceorientation", onDeviceOrientation, true);
			if (window.screen?.orientation) window.screen.orientation.removeEventListener?.("change", updateOrientation);
			if (mql?.removeEventListener) mql.removeEventListener("change", onMqlChange);
			document.removeEventListener("fullscreenchange", onFsChange);
			document.removeEventListener("webkitfullscreenchange", onFsChange);
		};
	}, []);
	React.useEffect(() => {
		if (resumedBannerSec === null) return;
		const timer = window.setTimeout(() => {
			setResumedBannerSec(null);
		}, 1200);
		return () => window.clearTimeout(timer);
	}, [resumedBannerSec]);
	const releaseActiveVideoSockets = () => {
		stopBackgroundWarmVideo();
		if (hlsInstanceRef.current) {
			try {
				hlsInstanceRef.current.destroy();
			} catch {}
			hlsInstanceRef.current = null;
		}
		if (iosControllerRef.current) {
			try {
				iosControllerRef.current.destroy();
			} catch {}
			iosControllerRef.current = null;
		}
		if (videoRef.current) try {
			videoRef.current.pause();
			videoRef.current.removeAttribute("src");
			videoRef.current.load();
		} catch {}
		if (preloadVideoRef.current) try {
			preloadVideoRef.current.pause();
			preloadVideoRef.current.removeAttribute("src");
			preloadVideoRef.current.load();
		} catch {}
	};
	React.useEffect(() => {
		return () => {
			setVideoStartupPriority(false);
			releaseActiveVideoSockets();
			if (subtitleUrlRef.current) {
				try {
					URL.revokeObjectURL(subtitleUrlRef.current);
				} catch {}
				subtitleUrlRef.current = null;
			}
			if (overlayTimerRef.current) window.clearTimeout(overlayTimerRef.current);
			if (hudTimerRef.current) window.clearTimeout(hudTimerRef.current);
			if (holdTimerRef.current) window.clearTimeout(holdTimerRef.current);
			if (stallDownshiftTimerRef.current) window.clearTimeout(stallDownshiftTimerRef.current);
			if (startupWatchdogTimerRef.current) window.clearTimeout(startupWatchdogTimerRef.current);
			if (standbyTimeoutRef.current) window.clearTimeout(standbyTimeoutRef.current);
		};
	}, []);
	React.useEffect(() => {
		if (!movie) {
			setVideoStartupPriority(false);
			return;
		}
		setVideoStartupPriority(loading || !hasStartedPlayback && !videoError);
	}, [
		movie,
		loading,
		hasStartedPlayback,
		videoError
	]);
	React.useEffect(() => {
		if (!movie) return;
		let cancelled = false;
		stopBackgroundWarmVideo();
		setVideoStartupPriority(true);
		setError(null);
		setSelectedSeasonFilter("all");
		setEpisodeSearchQuery("");
		setEpisodeSortOrder("asc");
		setFailedSourceIndices([]);
		setUseHlsBridge(isAppleWebKitDevice());
		setPlayerMode("stream");
		setVideoError(false);
		setHasStartedPlayback(false);
		setStandbyUpgradeIdx(null);
		setResumedBannerSec(null);
		setShowDownloadSheet(false);
		setShowAllEpisodesModal(false);
		setCurrentTime(0);
		setBufferedEnd(0);
		setDuration(0);
		setAutoMutedForiOS(false);
		smoothPlaySecondsRef.current = 0;
		hasStalledInSessionRef.current = false;
		hasTriedBridgeFallbackRef.current = false;
		hasUserManualServerRef.current = false;
		hasAppliedIntroSkipRef.current = false;
		pendingResumeSecRef.current = null;
		loadedSubKeyRef.current = "";
		setSubtitleCues([]);
		setAvailableSubTracks([]);
		setActiveBanglaCueText("");
		lastRenderedSubTextRef.current = "";
		if (modalContainerRef.current) modalContainerRef.current.scrollTo({
			top: 0,
			behavior: "smooth"
		});
		const applyResolvedDetail = (resolved, isAlreadyMountedInstant = false) => {
			stopBackgroundWarmVideo();
			const eps = resolved.episodes || [];
			const initEpIdx = savedProgress?.episodeIdx !== void 0 && eps[savedProgress.episodeIdx] ? savedProgress.episodeIdx : 0;
			if (!isAlreadyMountedInstant) {
				setDetail((prev) => {
					const vEl = videoRef.current;
					const isVideoHealthy = Boolean(!vEl || !vEl.error);
					const prevEp0 = prev?.episodes?.[0];
					const nextEp0 = eps[0];
					const isPrevBootstrap = prevEp0?.sources?.[0]?.id?.startsWith("mb-boot-");
					if (isVideoHealthy && isPrevBootstrap && prevEp0 && nextEp0 && initEpIdx === 0 && prevEp0.kind === nextEp0.kind && (nextEp0.sources?.length || 0) > 0) {
						const resolvedSources = nextEp0.sources || [];
						const enrichedSources = prevEp0.sources.map((bSrc) => {
							const matched = resolvedSources.find((rSrc) => rSrc.quality === bSrc.quality);
							if (!matched) return bSrc;
							return {
								...bSrc,
								name: matched.name || bSrc.name,
								qualityLabel: matched.qualityLabel || bSrc.qualityLabel,
								audio: matched.audio || bSrc.audio,
								audioLanguages: matched.audioLanguages || bSrc.audioLanguages,
								downloadUrl: matched.downloadUrl || matched.url || bSrc.downloadUrl
							};
						});
						for (const rSrc of resolvedSources) if (!enrichedSources.some((eSrc) => eSrc.quality === rSrc.quality)) enrichedSources.push(rSrc);
						const mergedEps = [...eps];
						mergedEps[0] = {
							...nextEp0,
							sources: enrichedSources
						};
						return {
							...resolved,
							episodes: mergedEps
						};
					}
					return resolved;
				});
				setSelectedEpIdx(initEpIdx);
			}
		};
		const instantCached = getInstantCachedDetail(movie.path || movie.url, movie.title);
		if (instantCached && instantCached.episodes && instantCached.episodes.length > 0) {
			setLoading(false);
			applyResolvedDetail(instantCached, detail === instantCached);
			return () => {
				cancelled = true;
			};
		}
		const bootstrapDetail = buildInstantMovieBoxBootstrapDetail(movie);
		if (bootstrapDetail) {
			setLoading(false);
			if (detail?.url !== bootstrapDetail.url) {
				setDetail(bootstrapDetail);
				setSelectedEpIdx(0);
				setSelectedSourceIdx(0);
			}
		}
		const fetchDetail = async () => {
			try {
				const shardHit = await loadShardForMovie(movie.path || movie.url, movie.title);
				if (cancelled) return;
				if (shardHit && shardHit.episodes && shardHit.episodes.length > 0) {
					setLoading(false);
					applyResolvedDetail(shardHit);
					return;
				}
				if (!bootstrapDetail) {
					setLoading(true);
					setDetail(null);
					setSelectedEpIdx(savedProgress?.episodeIdx || 0);
					setSelectedSourceIdx(0);
				}
				const data = await universalApiFetch(`/api/details?${new URLSearchParams({
					path: movie.path || movie.url,
					title: movie.title,
					node: activeNodeId
				}).toString()}`);
				if (!cancelled) {
					if (data && data.ok && data.detail) applyResolvedDetail(data.detail);
					else if (!bootstrapDetail) setError("এই মুভিটির বিস্তারিত তথ্য লোড করা যায়নি।");
				}
			} catch {
				if (!cancelled && !bootstrapDetail) setError("সার্ভারের সাথে সংযোগ বিচ্ছিন্ন হয়েছে।");
			} finally {
				if (!cancelled) setLoading(false);
			}
		};
		fetchDetail();
		return () => {
			cancelled = true;
		};
	}, [
		movie?.path,
		movie?.url,
		activeNodeId
	]);
	const [myflixData, setMyflixData] = React.useState(null);
	const [showSeasonDropdown, setShowSeasonDropdown] = React.useState(false);
	const [showDubDropdown, setShowDubDropdown] = React.useState(false);
	const [showAllScreenshots, setShowAllScreenshots] = React.useState(false);
	const [lightboxImage, setLightboxImage] = React.useState(null);
	React.useRef(null);
	React.useEffect(() => {
		setMyflixData(null);
		setShowSeasonDropdown(false);
		setShowDubDropdown(false);
		setShowAllScreenshots(false);
		setLightboxImage(null);
	}, [movie?.path, movie?.title]);
	React.useEffect(() => {
		if (!movie || !hasStartedPlayback || currentTime < 8) return;
		const timer = window.setTimeout(() => {
			(detail?.relatedSeasons || []).slice(0, 3).forEach((s) => {
				prefetchMovieDetails(s.path, s.title, activeNodeId);
			});
			relatedMovies.slice(0, 4).forEach((rel) => {
				if (rel.path !== movie.path) prefetchMovieDetails(rel.path, rel.title, activeNodeId);
			});
		}, 1e3);
		return () => window.clearTimeout(timer);
	}, [
		movie,
		detail?.relatedSeasons,
		relatedMovies,
		activeNodeId,
		hasStartedPlayback,
		currentTime >= 8
	]);
	const effectiveDetail = detail || instantDetailOnRender;
	const episodes = React.useMemo(() => {
		if (effectiveDetail?.episodes && effectiveDetail.episodes.length > 0) return effectiveDetail.episodes;
		if (loading) return [];
		if (myflixData?.seasonsData && myflixData.seasonsData.length > 0) {
			const built = [];
			let globalIdx = 0;
			for (const sObj of myflixData.seasonsData) {
				const sNum = Number(sObj?.index) || 1;
				for (const epObj of sObj?.episodes || []) {
					globalIdx++;
					const epNum = Number(epObj?.index) || globalIdx;
					const epTitle = epObj?.title || `Episode ${epNum}`;
					const srvs = (epObj?.servers || []).filter((s) => s?.url);
					if (srvs.length > 0) built.push({
						id: `mf-s${sNum}-e${epNum}`,
						label: `S${String(sNum).padStart(2, "0")}E${String(epNum).padStart(2, "0")} • ${epTitle}`,
						number: epNum,
						rangeStart: epNum,
						rangeEnd: epNum,
						season: sNum,
						kind: "episode",
						sources: srvs.map((srv, idx) => ({
							id: `mf-ep-${sNum}-${epNum}-${idx}`,
							name: srv.label || `Cloud Server ${idx + 1}`,
							quality: 1080,
							qualityLabel: "Cloud HLS",
							audio: movie?.language || "Multi Audio",
							audioLanguages: [movie?.language || "Multi"],
							provider: srv.label || `Cloud Server ${idx + 1}`,
							url: String(srv.url),
							downloadUrl: String(srv.url),
							type: "embed"
						}))
					});
				}
			}
			if (built.length > 0) return built;
		}
		return [];
	}, [
		effectiveDetail?.episodes,
		loading,
		myflixData?.seasonsData,
		movie?.language
	]);
	const activeEpisode = episodes[selectedEpIdx] || episodes[0];
	const sources = React.useMemo(() => {
		const directVideoSources = (activeEpisode?.sources ? [...activeEpisode.sources] : []).filter((s) => s.type !== "embed" && !/abyssplayer\.com|abysscdn\.com|vidsrc|vidlink\.pro|autoembed|superembed|multiembed|\/embed\//i.test(s.url || ""));
		const score = (src) => {
			const url = src.url || "";
			if (src.id?.startsWith("mb-") || /\/_s\/v\.mp4|\/api\/mb-stream|\/api\/mb-ep-stream/i.test(url)) {
				const szMatch = (src.name || "").match(/(\d+)\s*MB/i);
				const szMb = szMatch ? parseInt(szMatch[1], 10) : 0;
				const isHeavyFile = szMb > 320;
				if (src.quality === 480) return 4790;
				if (src.quality >= 360 && src.quality <= 576) return 4780;
				if (src.quality === 720) return szMb > 220 ? 4740 : 4765;
				if (src.quality === 1080) return isHeavyFile ? 4640 : 4745;
				return 4700;
			}
			if (/fsldownload\.com|r2\.dev|workers\.dev|cloudflare/i.test(url)) {
				if (src.quality === 720) return 3850;
				if (src.quality >= 360 && src.quality <= 576) return 3800;
				if (src.quality === 1080) return 3750;
				return 3600;
			}
			const isHevc = /\b(hevc|h\.?265|x265|10bit|av1)\b/i.test(`${src.name} ${src.qualityLabel}`);
			const isBestHeavy = /best\s*quality/i.test(src.qualityLabel || "");
			let sc = isHevc ? 600 : 2600;
			if (isBestHeavy) sc -= 250;
			if (src.quality >= 360 && src.quality <= 576) sc += 650;
			else if (src.quality === 720) sc += 500;
			else if (src.quality === 1080) sc += 350;
			else sc += 150;
			return sc;
		};
		const sortedDirect = [...directVideoSources].sort((a, b) => score(b) - score(a));
		const myflixFirst = [];
		const seen = /* @__PURE__ */ new Set();
		for (const [idx, d] of sortedDirect.entries()) if (d.url && !seen.has(d.url)) {
			seen.add(d.url);
			myflixFirst.push({
				...d,
				name: d.name || `CinePulse HD #${idx + 1} (${d.quality || 480}p)`,
				provider: d.provider || `CinePulse HD ${d.quality || 480}p`
			});
		}
		return myflixFirst;
	}, [activeEpisode?.sources]);
	const activeSource = sources[selectedSourceIdx] || sources[0];
	const isEmbedSource = Boolean(activeSource && (activeSource.type === "embed" || /abyssplayer\.com|abysscdn\.com|vidsrc|vidlink\.pro|autoembed|superembed|multiembed|\/embed\//i.test(activeSource.url)));
	const distinctSeasons = React.useMemo(() => {
		const sSet = /* @__PURE__ */ new Set();
		episodes.forEach((ep) => {
			if (ep.season !== null && ep.season !== void 0 && ep.season > 0) sSet.add(ep.season);
		});
		return Array.from(sSet).sort((a, b) => a - b);
	}, [episodes]);
	const filteredEpisodesWithIdx = React.useMemo(() => {
		const base = episodes.map((ep, idx) => ({
			ep,
			idx
		}));
		const activeSeasonNum = selectedSeasonFilter === "all" ? distinctSeasons[0] || 1 : selectedSeasonFilter;
		const bySeason = distinctSeasons.length > 0 ? base.filter((x) => (x.ep.season || 1) === activeSeasonNum) : base;
		const q = episodeSearchQuery.trim().toLowerCase();
		const matched = !q ? bySeason : bySeason.filter(({ ep, idx }) => {
			const badge = formatEpisodeTileBadge(ep, idx).toLowerCase();
			const lbl = ep.label.toLowerCase();
			return badge.includes(q) || lbl.includes(q);
		});
		return episodeSortOrder === "desc" ? [...matched].reverse() : matched;
	}, [
		episodes,
		selectedSeasonFilter,
		episodeSearchQuery,
		episodeSortOrder
	]);
	React.useEffect(() => {
		if (!movie || !autoBanglaSubEnabled) return;
		const subEpisodeKey = `${movie.path || movie.url || ""}::${selectedEpIdx}`;
		if (loadedSubKeyRef.current === subEpisodeKey && subtitleCues.length > 0) return;
		let cancelled = false;
		const subDelayTimer = window.setTimeout(() => {
			if (cancelled) return;
			const prediscoveredTrack = availableSubTracks[activeSubTrackIdx] || availableSubTracks[0];
			if (prediscoveredTrack && subtitleCues.length === 0) {
				loadedSubKeyRef.current = subEpisodeKey;
				setLoadingAutoSub(true);
				const vNow = videoRef.current?.currentTime || currentTime || 0;
				loadSubtitleTrackByUrl(
					prediscoveredTrack,
					Math.max(0, vNow - subOffsetSec),
					(updatedCues) => {
						if (!cancelled) setSubtitleCues(updatedCues);
					}
				).then((cues) => {
					if (cancelled || cues.length === 0) return;
					const vttText = buildVttFromCues(cues);
					const blob = new Blob([vttText], { type: "text/vtt" });
					setSubtitleCues(cues);
					updateSubtitleBlobUrl(URL.createObjectURL(blob));
					setSubtitleName(prediscoveredTrack.label);
				}).catch(() => {
					loadedSubKeyRef.current = "";
				}).finally(() => {
					if (!cancelled) setLoadingAutoSub(false);
				});
				return;
			}
			const inMemoryMkvSubs = iosControllerRef.current?.getExtractedSubtitles() || [];
			if (inMemoryMkvSubs.length >= 8) {
				loadedSubKeyRef.current = subEpisodeKey;
				const mappedCues = inMemoryMkvSubs.map((s) => ({
					startSec: s.ptsMs / 1e3,
					endSec: s.endPtsMs / 1e3,
					text: s.text
				}));
				const vNow = videoRef.current?.currentTime || currentTime || 0;
				ensureBanglaTranslationAroundTime(mappedCues, Math.max(0, vNow - subOffsetSec), (updated) => {
					if (!cancelled) setSubtitleCues(updated);
				}).then(() => {
					if (cancelled) return;
					const vttText = buildVttFromCues(mappedCues);
					const blob = new Blob([vttText], { type: "text/vtt" });
					setSubtitleCues(mappedCues);
					updateSubtitleBlobUrl(URL.createObjectURL(blob));
					setSubtitleName("বাংলা Sub (Embedded Sync)");
				}).catch(() => {});
				return;
			}
			loadedSubKeyRef.current = subEpisodeKey;
			setLoadingAutoSub(true);
			const isExplicitMovieKind = activeEpisode?.kind === "movie" && episodes.length <= 1;
			const isSeriesItem = !isExplicitMovieKind && Boolean(
				episodes.length > 1 ||
				(activeEpisode?.season && activeEpisode.season > 0) ||
				movie.typeBadge === "SERIES" ||
				movie.typeBadge === "ANIME" ||
				movie.typeBadge === "DRAMA" ||
				/\b(season|episode|ep\s*\d+|s\d+e\d+)\b/i.test(`${effectiveDetail?.title || movie.title} ${activeEpisode?.label || ""}`)
			);
			const resolvedSeason = isSeriesItem
				? (activeEpisode?.season && activeEpisode.season > 0
					? activeEpisode.season
					: selectedSeasonFilter !== "all"
						? Number(selectedSeasonFilter)
						: distinctSeasons[0] || 1)
				: 0;
			const resolvedEpisode = isSeriesItem
				? (activeEpisode?.number && activeEpisode.number > 0
					? activeEpisode.number
					: selectedEpIdx + 1)
				: 0;
			const vNow = videoRef.current?.currentTime || currentTime || 0;
			fetchOrGenerateAutoBanglaSubtitles({
				moviePath: movie.path || movie.url,
				title: effectiveDetail?.title || movie.title,
				storyline: effectiveDetail?.storyline || "",
				episodeLabel: activeEpisode?.label || "",
				season: resolvedSeason,
				episode: resolvedEpisode,
				language: effectiveDetail?.language || movie.language,
				streamUrl: activeSource?.url,
				streamName: `${activeSource?.name || ""} ${activeSource?.qualityLabel || ""} ${effectiveDetail?.quality || movie.quality || ""}`,
				videoDurationSec: duration || void 0,
				currentTimeSec: Math.max(0, vNow - subOffsetSec),
				onCuesUpdated: (updatedCues) => {
					if (!cancelled) setSubtitleCues(updatedCues);
				}
			}).then((res) => {
				if (cancelled) return;
				setSubtitleCues(res.cues);
				updateSubtitleBlobUrl(res.vttBlobUrl);
				setSubtitleName(res.sourceLabel);
				setAvailableSubTracks(res.availableTracks || []);
				setActiveSubTrackIdx(res.activeTrackIndex || 0);
			}).catch(() => {
				loadedSubKeyRef.current = "";
			}).finally(() => {
				if (!cancelled) setLoadingAutoSub(false);
			});
		}, 15);
		return () => {
			cancelled = true;
			window.clearTimeout(subDelayTimer);
		};
	}, [
		movie?.path,
		effectiveDetail?.title,
		selectedEpIdx,
		activeEpisode?.label,
		autoBanglaSubEnabled
	]);
	React.useEffect(() => {
		if (!movie || !hasStartedPlayback || autoBanglaSubEnabled) return;
		const rawPath = movie.path || movie.url || "";
		if (!rawPath.startsWith("/mb/")) return;
		let cancelled = false;
		const timer = window.setTimeout(() => {
			if (cancelled) return;
			const isExplicitMovie = activeEpisode?.kind === "movie" && episodes.length <= 1;
			const se = !isExplicitMovie && activeEpisode?.season && activeEpisode.season > 0 ? activeEpisode.season : 0;
			const ep = !isExplicitMovie && activeEpisode?.number && activeEpisode.number > 0 ? activeEpisode.number : 0;
			fetch(`/api/mb-captions?path=${encodeURIComponent(rawPath)}&se=${se}&ep=${ep}`).then((r) => r.ok ? r.json() : null).then((j) => {
				if (cancelled || !Array.isArray(j?.captions) || j.captions.length === 0) return;
				const rawCaptions = j.captions;
				const mbTracks = [];
				const nativeBangla = rawCaptions.find((c) => /^(bn|ben)$/i.test(c.lan) || /bangla|bengali|বাংলা/i.test(c.lanName));
				const englishCap = rawCaptions.find((c) => /^en/i.test(c.lan) || /english/i.test(c.lanName)) || rawCaptions.find((c) => !(/^(bn|ben)$/i.test(c.lan) || /bangla|bengali|বাংলা/i.test(c.lanName))) || rawCaptions[0];
				if (nativeBangla) mbTracks.push({
					id: `mb-cap-bn-${nativeBangla.id}`,
					url: nativeBangla.url,
					lang: "bn",
					label: "বাংলা (Official)",
					releaseName: "Official Bangla",
					keepOriginalScript: false,
					delay: Number(nativeBangla.delay || 0) || 0
				});
				else if (englishCap) mbTracks.push({
					id: `mb-cap-auto-bn-${englishCap.id}`,
					url: englishCap.bnUrl || englishCap.url,
					lang: "bn",
					label: "বাংলা (Official)",
					releaseName: "Official Bangla",
					keepOriginalScript: false,
					delay: Number(englishCap.delay || 0) || 0
				});
				if (englishCap) mbTracks.push({
					id: `mb-cap-orig-${englishCap.id}-en`,
					url: englishCap.url,
					lang: "en",
					label: "English (Official)",
					releaseName: "Official English",
					keepOriginalScript: true,
					delay: Number(englishCap.delay || 0) || 0
				});
				setAvailableSubTracks((prev) => prev.length > 0 ? prev : mbTracks);
			}).catch(() => {});
		}, 900);
		return () => {
			cancelled = true;
			window.clearTimeout(timer);
		};
	}, [
		movie?.path,
		movie?.url,
		hasStartedPlayback,
		selectedEpIdx,
		autoBanglaSubEnabled
	]);
	React.useEffect(() => {
		if (!movie || !isEmbedSource || !autoBanglaSubEnabled) return;
		const t = window.setInterval(() => {
			setCurrentTime((prev) => prev + 1);
		}, 1e3);
		return () => window.clearInterval(t);
	}, [
		movie?.path,
		isEmbedSource,
		autoBanglaSubEnabled,
		selectedEpIdx,
		selectedSourceIdx
	]);
	const translationBucket = Math.floor(Math.max(0, currentTime - subOffsetSec) / 4);
	React.useEffect(() => {
		const activeTrack = availableSubTracks[activeSubTrackIdx];
		if (!autoBanglaSubEnabled || subtitleCues.length === 0 || activeTrack?.keepOriginalScript || subtitleCues[0]?.keepOriginalScript) return;
		let cancelled = false;
		const v = videoRef.current;
		const exactNow = v && !isEmbedSource ? useHlsBridge ? iosSegmentStartSec + v.currentTime : v.currentTime : currentTime;
		const effectiveTime = Math.max(0, exactNow - subOffsetSec + 0.22);
		ensureBanglaTranslationAroundTime(subtitleCues, effectiveTime, (updated) => {
			if (!cancelled) setSubtitleCues(updated);
		}).catch(() => {});
		return () => {
			cancelled = true;
		};
	}, [
		autoBanglaSubEnabled,
		subtitleCues.length,
		translationBucket,
		subOffsetSec,
		useHlsBridge,
		iosSegmentStartSec,
		isEmbedSource,
		activeSubTrackIdx,
		availableSubTracks
	]);
	React.useEffect(() => {
		if (!autoBanglaSubEnabled || subtitleCues.length === 0) {
			if (lastRenderedSubTextRef.current !== "") {
				lastRenderedSubTextRef.current = "";
				setActiveBanglaCueText("");
			}
			return;
		}
		// 0.22s voice-sync anticipation lead-in so subtitles appear at the exact instant the character begins speaking
		const VOICE_SYNC_ANTICIPATION_SEC = 0.22;
		const syncSubToExactVoiceTime = () => {
			const v = videoRef.current;
			const rawPlayhead = v && !isEmbedSource ? useHlsBridge ? iosSegmentStartSec + v.currentTime : v.currentTime : currentTime;
			const effectiveTimeSec = Math.max(0, rawPlayhead - subOffsetSec + VOICE_SYNC_ANTICIPATION_SEC);
			const nextCueText = findActiveCueTextAtTime(subtitleCues, effectiveTimeSec);
			if (nextCueText !== lastRenderedSubTextRef.current) {
				lastRenderedSubTextRef.current = nextCueText;
				setActiveBanglaCueText(nextCueText);
			}
		};
		syncSubToExactVoiceTime();
		const timer = window.setInterval(syncSubToExactVoiceTime, 30);
		return () => window.clearInterval(timer);
	}, [
		autoBanglaSubEnabled,
		subtitleCues,
		subOffsetSec,
		useHlsBridge,
		iosSegmentStartSec,
		isEmbedSource,
		currentTime
	]);
	React.useEffect(() => {
		const rawUrl = activeSource?.url || "";
		const isAlreadyNativeMp4 = /\.(mp4|m4v|m3u8)(\?|$)/i.test(rawUrl) || /\/_s\/v\.mp4|\/api\/mb-stream|\/api\/mb-ep-stream/i.test(rawUrl) || activeSource?.type === "mp4";
		if (!useHlsBridge || !rawUrl || isAlreadyNativeMp4 || isEmbedSource) {
			if (iosControllerRef.current) {
				iosControllerRef.current.destroy();
				iosControllerRef.current = null;
			}
			isSeekingRef.current = false;
			iosSegmentStartSecRef.current = 0;
			iosCurrentSegIndexRef.current = 0;
			setIosBlobUrl("");
			setIosSegmentStartSec(0);
			setIosCurrentSegIndex(0);
			return;
		}
		if (iosControllerRef.current) {
			iosControllerRef.current.destroy();
			iosControllerRef.current = null;
		}
		const initialResumeTarget = pendingResumeSecRef.current && pendingResumeSecRef.current > 3 ? pendingResumeSecRef.current : !hasAppliedIntroSkipRef.current && savedProgress && (savedProgress.episodeIdx === void 0 || savedProgress.episodeIdx === selectedEpIdx) && savedProgress.progressSeconds && savedProgress.progressSeconds > 20 ? savedProgress.progressSeconds : 0;
		hasAppliedIntroSkipRef.current = true;
		if (initialResumeTarget > 3) pendingResumeSecRef.current = null;
		const ctrl = new IosMkvStreamController(rawUrl, introSkipSec, initialResumeTarget);
		iosControllerRef.current = ctrl;
		iosTransitioningRef.current = false;
		isSeekingRef.current = false;
		iosSegmentStartSecRef.current = 0;
		iosCurrentSegIndexRef.current = 0;
		setIosBlobUrl("");
		setIosSegmentStartSec(0);
		setIosCurrentSegIndex(0);
		setVideoError(false);
		setIsBuffering(true);
		ctrl.startInitialSegment().then(async (seg0) => {
			if (iosControllerRef.current !== ctrl) return;
			const totalDur = ctrl.getTotalDurationSec();
			if (totalDur > 0) setDuration(Math.floor(totalDur));
			iosCurrentSegIndexRef.current = seg0.index;
			iosSegmentStartSecRef.current = seg0.startSec;
			lastRecordedSecondRef.current = Math.floor(seg0.startSec);
			setIosCurrentSegIndex(seg0.index);
			setIosSegmentStartSec(seg0.startSec);
			setIosBlobUrl(seg0.blobUrl);
			setCurrentTime(Math.floor(seg0.startSec));
			if (initialResumeTarget > 20 && seg0.startSec >= 18) setResumedBannerSec(Math.floor(seg0.startSec));
			setIsBuffering(false);
		}).catch(() => {
			if (iosControllerRef.current !== ctrl) return;
			const nextFailed = Array.from(/* @__PURE__ */ new Set([...failedSourceIndices, selectedSourceIdx]));
			setFailedSourceIndices(nextFailed);
			const nextCandidateIdx = sources.findIndex((_, idx) => !nextFailed.includes(idx));
			if (nextCandidateIdx !== -1) {
				setSelectedSourceIdx(nextCandidateIdx);
				return;
			}
			setIsBuffering(false);
			setVideoError(true);
		});
		return () => {
			if (iosControllerRef.current === ctrl) {
				ctrl.destroy();
				iosControllerRef.current = null;
			}
		};
	}, [activeSource?.url, useHlsBridge]);
	const effectiveVideoUrl = React.useMemo(() => {
		const rawUrl = activeSource?.url || "";
		if (!rawUrl) return "";
		const isAlreadyNativeMp4 = /\.(mp4|m4v|m3u8)(\?|$)/i.test(rawUrl) || /\/_s\/v\.mp4|\/api\/mb-stream|\/api\/mb-ep-stream/i.test(rawUrl) || activeSource?.type === "mp4";
		if (useHlsBridge && !isAlreadyNativeMp4 && !isEmbedSource) return iosBlobUrl;
		return rawUrl;
	}, [
		activeSource?.url,
		activeSource?.type,
		useHlsBridge,
		iosBlobUrl,
		isEmbedSource
	]);
	React.useEffect(() => {
		const v = videoRef.current;
		if (!v) return;
		try {
			v.disablePictureInPicture = false;
			v.autoPictureInPicture = true;
		} catch {}
		const onEnterPip = () => setIsOsPipActive(true);
		const onLeavePip = () => setIsOsPipActive(false);
		const onWebkitPresentationChange = () => {
			if (v.webkitPresentationMode === "picture-in-picture") setIsOsPipActive(true);
			else setIsOsPipActive(false);
		};
		v.addEventListener("enterpictureinpicture", onEnterPip);
		v.addEventListener("leavepictureinpicture", onLeavePip);
		v.addEventListener("webkitpresentationmodechanged", onWebkitPresentationChange);
		if ("mediaSession" in navigator && movie) try {
			navigator.mediaSession.metadata = new MediaMetadata({
				title: movie.title,
				artist: "CinePulse HD",
				artwork: movie.poster ? [{
					src: movie.poster,
					sizes: "512x512",
					type: "image/jpeg"
				}] : []
			});
			navigator.mediaSession.setActionHandler("play", () => {
				v.play().catch(() => {});
			});
			navigator.mediaSession.setActionHandler("pause", () => {
				v.pause();
			});
			navigator.mediaSession.setActionHandler("enterpictureinpicture", () => {
				try {
					if (!document.pictureInPictureElement && v.requestPictureInPicture) v.requestPictureInPicture().catch(() => {});
					else if (v.webkitSupportsPresentationMode && v.webkitSetPresentationMode) v.webkitSetPresentationMode("picture-in-picture");
				} catch {}
			});
		} catch {}
		const triggerAutoPipOnExit = () => {
			if (!v || v.paused || v.readyState < 1) return;
			try {
				v.disablePictureInPicture = false;
				v.autoPictureInPicture = true;
				v.setAttribute("autopictureinpicture", "true");
				if (!document.pictureInPictureElement && v.requestPictureInPicture) v.requestPictureInPicture().catch(() => {
					if (onToggleMiniPlayer && !isMiniPlayer) onToggleMiniPlayer(true);
				});
				else if (v.webkitSupportsPresentationMode && v.webkitSetPresentationMode && v.webkitPresentationMode !== "picture-in-picture") v.webkitSetPresentationMode("picture-in-picture");
			} catch {
				if (onToggleMiniPlayer && !isMiniPlayer) onToggleMiniPlayer(true);
			}
		};
		const onVisibilityChange = () => {
			if (document.visibilityState === "hidden") triggerAutoPipOnExit();
		};
		const onWindowBlur = () => {
			if (document.visibilityState === "hidden") triggerAutoPipOnExit();
		};
		document.addEventListener("visibilitychange", onVisibilityChange);
		window.addEventListener("pagehide", triggerAutoPipOnExit);
		window.addEventListener("blur", onWindowBlur);
		return () => {
			v.removeEventListener("enterpictureinpicture", onEnterPip);
			v.removeEventListener("leavepictureinpicture", onLeavePip);
			v.removeEventListener("webkitpresentationmodechanged", onWebkitPresentationChange);
			document.removeEventListener("visibilitychange", onVisibilityChange);
			window.removeEventListener("pagehide", triggerAutoPipOnExit);
			window.removeEventListener("blur", onWindowBlur);
		};
	}, [
		movie,
		effectiveVideoUrl,
		isEmbedSource,
		isMiniPlayer,
		onToggleMiniPlayer
	]);
	(0, import_react.useLayoutEffect)(() => {
		stopBackgroundWarmVideo();
		if (!effectiveVideoUrl) {
			if (!useHlsBridge) setIsBuffering(false);
			return;
		}
		setVideoError(false);
		setIsBuffering(false);
		const v = videoRef.current;
		if (v && !isEmbedSource) {
			if (hlsInstanceRef.current) {
				hlsInstanceRef.current.destroy();
				hlsInstanceRef.current = null;
			}
			if (/\.m3u8(\?|$)/i.test(effectiveVideoUrl) && Hls.isSupported() && !v.canPlayType("application/vnd.apple.mpegurl")) {
				const hls = new Hls({
					enableWorker: true,
					maxBufferLength: 30,
					maxMaxBufferLength: 60,
					backBufferLength: 30,
					startFragPrefetch: true,
					testBandwidth: true,
					abrEwmaDefaultEstimate: 25e5
				});
				hlsInstanceRef.current = hls;
				hls.loadSource(effectiveVideoUrl);
				hls.attachMedia(v);
				hls.on(Hls.Events.MANIFEST_PARSED, () => {
					syncCleanAudioVolume(v);
					v.play().catch(() => {});
				});
			} else {
				if (v.getAttribute("src") !== effectiveVideoUrl) {
					v.src = effectiveVideoUrl;
					v.load();
				}
				syncCleanAudioVolume(v);
				const p = v.play();
				if (p !== void 0) p.catch((err) => {
					if (err && err.name === "NotAllowedError") {
						v.muted = true;
						setIsMuted(true);
						setAutoMutedForiOS(true);
						v.play().catch(() => {});
					}
				});
			}
		}
		const bufTimer = window.setTimeout(() => {
			const curV = videoRef.current;
			if (curV && curV.readyState < 2 && !curV.paused) setIsBuffering(true);
		}, 500);
		if (startupWatchdogTimerRef.current) {
			window.clearTimeout(startupWatchdogTimerRef.current);
			startupWatchdogTimerRef.current = null;
		}
		startupWatchdogTimerRef.current = window.setTimeout(() => {
			const curV = videoRef.current;
			if (curV && curV.readyState === 0 && !isEmbedSource) {
				if (!curV.getAttribute("src") && effectiveVideoUrl) {
					curV.src = effectiveVideoUrl;
					curV.load();
				}
				startVideoWithiOSFallback(curV);
			}
		}, 1800);
		return () => {
			window.clearTimeout(bufTimer);
			if (startupWatchdogTimerRef.current) {
				window.clearTimeout(startupWatchdogTimerRef.current);
				startupWatchdogTimerRef.current = null;
			}
			if (hlsInstanceRef.current) {
				hlsInstanceRef.current.destroy();
				hlsInstanceRef.current = null;
			}
		};
	}, [
		effectiveVideoUrl,
		useHlsBridge,
		isEmbedSource
	]);
	React.useEffect(() => {
		if (videoRef.current) videoRef.current.playbackRate = isHold2x ? 2 : playbackSpeed;
	}, [playbackSpeed, isHold2x]);
	React.useEffect(() => {
		if (!movie || isEmbedSource || currentTime > 16) return;
		if (videoRef.current) syncCleanAudioVolume(videoRef.current);
		const timer = window.setInterval(() => {
			if (videoRef.current) syncCleanAudioVolume(videoRef.current);
		}, 80);
		return () => window.clearInterval(timer);
	}, [
		movie?.path,
		isEmbedSource,
		currentTime <= 16,
		isMuted,
		volume,
		introSkipSec,
		useHlsBridge
	]);
	React.useEffect(() => {
		if (!movie) return;
		const onKeyDown = (e) => {
			const tag = e.target?.tagName;
			if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
			if (e.code === "Space" || e.key === "k" || e.key === "K") {
				e.preventDefault();
				const v = videoRef.current;
				if (v) {
					if (v.paused) v.play().catch(() => {});
					else v.pause();
				}
			} else if (e.key === "ArrowRight") {
				e.preventDefault();
				handleSeekRelative(10);
			} else if (e.key === "ArrowLeft") {
				e.preventDefault();
				handleSeekRelative(-10);
			} else if (e.key === "m" || e.key === "M") {
				e.preventDefault();
				setIsMuted((prev) => {
					const next = !prev;
					if (videoRef.current) videoRef.current.muted = next;
					return next;
				});
			}
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [
		movie,
		currentTime,
		duration
	]);
	React.useEffect(() => {
		if (!movie) return;
		const nav = navigator;
		const conn = nav?.connection || nav?.mozConnection || nav?.webkitConnection;
		if (!conn || !conn.addEventListener) return;
		const onNetworkChange = () => {
			const detected = detectIdealQualityForNetwork();
			setNetStatusLabel(detected.netLabel);
		};
		conn.addEventListener("change", onNetworkChange);
		return () => {
			conn.removeEventListener("change", onNetworkChange);
		};
	}, [movie]);
	if (!movie) return null;
	const advanceToNextIosSegment = async () => {
		const ctrl = iosControllerRef.current;
		if (!ctrl || iosTransitioningRef.current || isSeekingRef.current) return false;
		iosTransitioningRef.current = true;
		try {
			const nextSeg = await ctrl.ensureNextSegmentPrebuffered(iosCurrentSegIndexRef.current + 1, 0);
			if (nextSeg && iosControllerRef.current === ctrl && !isSeekingRef.current) {
				const monotonicStartSec = Math.max(iosSegmentStartSecRef.current, lastRecordedSecondRef.current, nextSeg.startSec);
				pendingResumeSecRef.current = null;
				iosCurrentSegIndexRef.current = nextSeg.index;
				iosSegmentStartSecRef.current = monotonicStartSec;
				setIosCurrentSegIndex(nextSeg.index);
				setIosSegmentStartSec(monotonicStartSec);
				setIosBlobUrl(nextSeg.blobUrl);
				ctrl.ensureNextSegmentPrebuffered(nextSeg.index + 1, 0);
				window.setTimeout(() => {
					iosTransitioningRef.current = false;
				}, 420);
				return true;
			}
			iosTransitioningRef.current = false;
			return false;
		} catch {
			iosTransitioningRef.current = false;
			return false;
		}
	};
	const seekVideoToGlobalTime = (targetGlobalSec) => {
		const v = videoRef.current;
		const ctrlDur = iosControllerRef.current?.getTotalDurationSec() || 0;
		const maxDur = ctrlDur > 0 ? ctrlDur : duration > 0 ? duration : !useHlsBridge && v?.duration ? v.duration : 99999;
		const clamped = Math.max(0, Math.min(maxDur - 1, targetGlobalSec));
		const roundedTarget = Math.floor(clamped);
		lastRecordedSecondRef.current = roundedTarget;
		setCurrentTime(roundedTarget);
		resetOverlayAutoHide();
		if (!useHlsBridge || !iosControllerRef.current) {
			if (v) {
				isSeekingRef.current = true;
				try {
					v.currentTime = clamped;
					if (v.paused) v.play().catch(() => {});
				} catch {}
				window.setTimeout(() => {
					isSeekingRef.current = false;
				}, 550);
			}
			return;
		}
		const segStart = iosSegmentStartSecRef.current;
		const segDur = v?.duration || 0;
		if (v && !isSeekingRef.current && segDur > 1 && clamped >= segStart && clamped < segStart + segDur - .6) {
			try {
				v.currentTime = Math.max(0, clamped - segStart);
				if (v.paused) v.play().catch(() => {});
			} catch {}
			return;
		}
		const ctrl = iosControllerRef.current;
		const reqId = ++seekReqIdRef.current;
		isSeekingRef.current = true;
		setIsBuffering(true);
		if (v && !v.paused) try {
			v.pause();
		} catch {}
		ctrl.seekToSeconds(clamped).then((seekSeg) => {
			if (iosControllerRef.current !== ctrl || seekReqIdRef.current !== reqId) return;
			const latestTotal = ctrl.getTotalDurationSec();
			if (latestTotal > 0 && Math.floor(latestTotal) !== duration) setDuration(Math.floor(latestTotal));
			if (seekSeg) {
				const offsetInsideSeg = Math.max(0, Math.min((seekSeg.durationSec || 10) - .5, clamped - seekSeg.startSec));
				const exactDisplaySec = Math.floor(seekSeg.startSec + offsetInsideSeg);
				iosCurrentSegIndexRef.current = seekSeg.index;
				iosSegmentStartSecRef.current = seekSeg.startSec;
				lastRecordedSecondRef.current = exactDisplaySec;
				pendingResumeSecRef.current = offsetInsideSeg > .35 ? offsetInsideSeg : null;
				setIosCurrentSegIndex(seekSeg.index);
				setIosSegmentStartSec(seekSeg.startSec);
				setIosBlobUrl(seekSeg.blobUrl);
				setCurrentTime(exactDisplaySec);
				window.setTimeout(() => {
					if (seekReqIdRef.current === reqId) isSeekingRef.current = false;
				}, 750);
			} else {
				isSeekingRef.current = false;
				if (v && v.paused) v.play().catch(() => {});
			}
			setIsBuffering(false);
		});
	};
	const handleSelectEpisode = (idx) => {
		setSelectedEpIdx(idx);
		const ep = episodes[idx];
		setSelectedSourceIdx(0);
		setFailedSourceIndices([]);
		setPlayerMode("stream");
		setVideoError(false);
		setHasStartedPlayback(false);
		setStandbyUpgradeIdx(null);
		setResumedBannerSec(null);
		setShowAllEpisodesModal(false);
		setNextEpPrewarmed(false);
		prewarmedNextEpIdxRef.current = null;
		isSeekingRef.current = false;
		iosSegmentStartSecRef.current = 0;
		iosCurrentSegIndexRef.current = 0;
		setCurrentTime(0);
		setBufferedEnd(0);
		smoothPlaySecondsRef.current = 0;
		hasStalledInSessionRef.current = false;
		hasTriedBridgeFallbackRef.current = false;
		hasUserManualServerRef.current = false;
		hasAppliedIntroSkipRef.current = false;
		pendingResumeSecRef.current = null;
		loadedSubKeyRef.current = "";
		setSubtitleCues([]);
		setActiveBanglaCueText("");
		lastRenderedSubTextRef.current = "";
		const directSrc = (ep?.sources || []).find((s) => s.type !== "embed" && !/abyssplayer\.com|abysscdn\.com|vidsrc|\/embed\//i.test(s.url || "")) || ep?.sources?.[0];
		if (directSrc?.url && directSrc.type !== "embed") warmStreamConnection(directSrc.url);
		onRecordWatchProgress(movie, ep, idx, directSrc, 0);
	};
	const handleSelectSource = (idx, isManualChoice = false) => {
		if (currentTime > 3) pendingResumeSecRef.current = currentTime;
		if (isManualChoice) {
			hasUserManualServerRef.current = true;
			setAutoNetQuality(false);
			setStandbyUpgradeIdx(null);
		}
		smoothPlaySecondsRef.current = 0;
		setShowQualityMenu(false);
		setShowAudioServerMenu(false);
		setSelectedSourceIdx(idx);
		setPlayerMode("stream");
		setVideoError(false);
		const src = sources[idx];
		onRecordWatchProgress(movie, activeEpisode, selectedEpIdx, src, currentTime);
	};
	const startVideoWithiOSFallback = (v) => {
		if (!v.paused) return;
		const playPromise = v.play();
		if (playPromise !== void 0) playPromise.catch((err) => {
			if (err && err.name === "NotAllowedError") {
				v.muted = true;
				setIsMuted(true);
				setAutoMutedForiOS(true);
				v.play().catch(() => {
					setIsBuffering(false);
					setShowOverlayControls(true);
				});
			}
		});
	};
	const isMovieBoxStream = Boolean(movie?.path?.startsWith("/mb/") || activeSource?.id?.startsWith("mb-") || /\/_s\/v\.mp4|\/api\/mb-stream|\/api\/mb-ep-stream/i.test(activeSource?.url || ""));
	const syncCleanAudioVolume = (v) => {
		const dur = duration || v.duration || 0;
		const globalTime = useHlsBridge ? iosSegmentStartSecRef.current + v.currentTime : v.currentTime;
		const muteWindowSec = Math.max(13.5, introSkipSec);
		const inVoiceTagWindow = !isMovieBoxStream && globalTime < muteWindowSec && (!dur || dur > muteWindowSec + 25);
		if (isMuted) syncVideoAudioBooster(v, 0, true);
		else if (inVoiceTagWindow) {
			v.volume = 0;
			if (useHlsBridge) v.muted = true;
			else v.muted = false;
		} else syncVideoAudioBooster(v, volume, false);
	};
	const handleVideoLoadedMetadata = (e) => {
		const v = e.currentTarget;
		v.playbackRate = isHold2x ? 2 : playbackSpeed;
		try {
			for (let i = 0; i < v.textTracks.length; i++) v.textTracks[i].mode = "disabled";
		} catch {}
		const totalFromCtrl = iosControllerRef.current?.getTotalDurationSec() || 0;
		if (totalFromCtrl > 0) setDuration(Math.floor(totalFromCtrl));
		else if (!useHlsBridge && v.duration > 0) setDuration(Math.floor(v.duration));
		if (v.readyState >= 1) {
			setHasStartedPlayback(true);
			setIsBuffering(false);
		}
		syncCleanAudioVolume(v);
		if (pendingOsPipRef.current) {
			pendingOsPipRef.current = false;
			window.setTimeout(() => {
				try {
					const vidEl = videoRef.current;
					if (!vidEl) return;
					if (vidEl.requestPictureInPicture) vidEl.requestPictureInPicture().catch(() => {});
					else if (vidEl.webkitSupportsPresentationMode && vidEl.webkitSetPresentationMode) vidEl.webkitSetPresentationMode("picture-in-picture");
				} catch {}
			}, 250);
		}
		if (useHlsBridge) {
			if (pendingResumeSecRef.current !== null && pendingResumeSecRef.current > .3) {
				const localOffset = pendingResumeSecRef.current;
				pendingResumeSecRef.current = null;
				try {
					v.currentTime = Math.min(Math.max(0, (v.duration || 12) - .4), localOffset);
				} catch {}
			}
			isSeekingRef.current = false;
			startVideoWithiOSFallback(v);
			return;
		}
		if (pendingResumeSecRef.current !== null && pendingResumeSecRef.current > 2) {
			const target = pendingResumeSecRef.current;
			pendingResumeSecRef.current = null;
			try {
				v.currentTime = target;
			} catch {}
			isSeekingRef.current = false;
			syncCleanAudioVolume(v);
			startVideoWithiOSFallback(v);
			return;
		}
		const isInitialFreshStart = !hasAppliedIntroSkipRef.current && currentTime < 3 && lastRecordedSecondRef.current < 3;
		const canResumeSaved = isInitialFreshStart && savedProgress && (savedProgress.episodeIdx === void 0 || savedProgress.episodeIdx === selectedEpIdx) && savedProgress.progressSeconds && savedProgress.progressSeconds > 15 && (!v.duration || savedProgress.progressSeconds < v.duration - 20);
		hasAppliedIntroSkipRef.current = true;
		if (canResumeSaved && savedProgress?.progressSeconds) {
			try {
				v.currentTime = savedProgress.progressSeconds;
				lastRecordedSecondRef.current = Math.floor(savedProgress.progressSeconds);
				setCurrentTime(savedProgress.progressSeconds);
				setResumedBannerSec(savedProgress.progressSeconds);
			} catch {}
			isSeekingRef.current = false;
			syncCleanAudioVolume(v);
			startVideoWithiOSFallback(v);
			return;
		}
		if (!isMovieBoxStream && isInitialFreshStart && introSkipSec > 0 && (!v.duration || v.duration > introSkipSec + 30)) try {
			v.currentTime = introSkipSec;
			lastRecordedSecondRef.current = Math.floor(introSkipSec);
			setCurrentTime(Math.floor(introSkipSec));
		} catch {}
		isSeekingRef.current = false;
		syncCleanAudioVolume(v);
		startVideoWithiOSFallback(v);
	};
	const handleVideoError = () => {
		const resumeAt = Math.max(currentTime, lastRecordedSecondRef.current);
		const nextFailed = Array.from(/* @__PURE__ */ new Set([...failedSourceIndices, selectedSourceIdx]));
		setFailedSourceIndices(nextFailed);
		const nextCandidateIdx = sources.findIndex((_, idx) => !nextFailed.includes(idx));
		if (nextCandidateIdx !== -1) {
			if (resumeAt > 3) pendingResumeSecRef.current = resumeAt;
			setSelectedSourceIdx(nextCandidateIdx);
			setVideoError(false);
			return;
		}
		if (!hasTriedBridgeFallbackRef.current && movie) {
			hasTriedBridgeFallbackRef.current = true;
			universalApiFetch(`/api/details?${new URLSearchParams({
				path: movie.path || movie.url,
				title: movie.title,
				node: activeNodeId,
				enrich: "1"
			}).toString()}`).then((data) => {
				if (data?.ok && data?.detail?.episodes?.length) {
					setDetail(data.detail);
					setFailedSourceIndices([]);
					setSelectedSourceIdx(0);
					setVideoError(false);
				} else {
					setIsBuffering(false);
					setVideoError(true);
				}
			}).catch(() => {
				setIsBuffering(false);
				setVideoError(true);
			});
			return;
		}
		setIsBuffering(false);
		setVideoError(true);
	};
	const handleTogglePlayPause = () => {
		const v = videoRef.current;
		if (!v) return;
		if (v.paused) v.play().catch(() => {});
		else v.pause();
		resetOverlayAutoHide();
	};
	const handleSeekRelative = (deltaSec) => {
		const baseTime = currentTime || videoRef.current?.currentTime || 0;
		seekVideoToGlobalTime(baseTime + deltaSec);
		setSeekRipple({
			side: deltaSec < 0 ? "left" : "right",
			delta: deltaSec,
			id: Date.now()
		});
		if (rippleTimerRef.current) window.clearTimeout(rippleTimerRef.current);
		rippleTimerRef.current = window.setTimeout(() => {
			setSeekRipple(null);
		}, 680);
		triggerHud("seek", deltaSec > 0 ? `+${deltaSec}s Forward` : `${deltaSec}s Rewind`);
		resetOverlayAutoHide();
	};
	const handleCycleVideoFit = () => {
		const nextFit = videoFit === "contain" ? "cover" : videoFit === "cover" ? "fill" : "contain";
		setVideoFit(nextFit);
		triggerHud("toast", nextFit === "contain" ? "Screen Fit: Original" : nextFit === "cover" ? "Screen Fit: Zoom Crop" : "Screen Fit: Full Stretch");
	};
	const directQualitySources = (() => {
		const seenQ = /* @__PURE__ */ new Map();
		sources.forEach((s, idx) => {
			if (!(s.type === "embed" || /abyssplayer\.com|abysscdn\.com|vidsrc|\/embed\//i.test(s.url || "")) && s.quality) {
				if (!seenQ.has(s.quality)) seenQ.set(s.quality, {
					idx,
					source: s
				});
			}
		});
		return Array.from(seenQ.entries()).sort((a, b) => b[0] - a[0]).map(([quality, item]) => ({
			quality,
			idx: item.idx,
			source: item.source,
			label: quality >= 1080 ? "1080p Full HD" : quality >= 720 ? "720p HD" : quality >= 480 ? "480p SD" : `${quality}p`
		}));
	})();
	const activeQualityLabel = selectedQualityPref === "auto" ? activeSource?.quality ? `Auto (${activeSource.quality}p)` : "Auto HD" : `${selectedQualityPref}p`;
	const handleSelectQualityOption = (pref, targetIdx) => {
		setSelectedQualityPref(pref);
		setShowQualityMenu(false);
		setShowSeparateQualityBar(false);
		if (pref === "auto") {
			setAutoNetQuality(true);
			if (sources.length > 0 && selectedSourceIdx !== 0) handleSelectSource(0, false);
			return;
		}
		setAutoNetQuality(false);
		if (typeof targetIdx === "number" && targetIdx >= 0 && targetIdx < sources.length) {
			handleSelectSource(targetIdx, true);
			return;
		}
		const exactIdx = sources.findIndex((s) => s.quality === pref && s.type !== "embed" && !/abyssplayer\.com|abysscdn\.com|vidsrc|\/embed\//i.test(s.url || ""));
		if (exactIdx !== -1) handleSelectSource(exactIdx, true);
		else {
			const fallbackIdx = sources.findIndex((s) => s.quality === pref);
			if (fallbackIdx !== -1) handleSelectSource(fallbackIdx, true);
		}
	};
	const handleSelectSubtitleTrack = async (trackIdx) => {
		const track = availableSubTracks[trackIdx];
		if (!track) return;
		const subEpisodeKey = `${movie?.path || movie?.url || ""}::${selectedEpIdx}`;
		loadedSubKeyRef.current = subEpisodeKey;
		setActiveSubTrackIdx(trackIdx);
		setAutoBanglaSubEnabled(true);
		setLoadingAutoSub(true);
		try {
			const vNow = videoRef.current?.currentTime || currentTime || 0;
			const cues = await loadSubtitleTrackByUrl(
				track,
				Math.max(0, vNow - subOffsetSec),
				(updatedCues) => setSubtitleCues(updatedCues)
			);
			if (cues.length > 0) {
				const vttText = buildVttFromCues(cues);
				const blob = new Blob([vttText], { type: "text/vtt" });
				setSubtitleCues(cues);
				updateSubtitleBlobUrl(URL.createObjectURL(blob));
				setSubtitleName(track.label);
				triggerHud("toast", `CC: ${track.label}`);
			}
		} catch {
			loadedSubKeyRef.current = "";
			triggerHud("toast", "সাবটাইটেল লোড করা যায়নি");
		} finally {
			setLoadingAutoSub(false);
		}
	};
	const handleTogglePiP = async () => {
		const v = videoRef.current;
		if (isMiniPlayer && onToggleMiniPlayer) {
			onToggleMiniPlayer(false);
			return;
		}
		if (isEmbedSource) {
			const directIdx = sources.findIndex((s) => s.type !== "embed" && !/abyssplayer\.com|vidsrc|\/embed\//i.test(s.url || ""));
			if (directIdx !== -1) {
				pendingOsPipRef.current = true;
				handleSelectSource(directIdx, true);
			}
			if (onToggleMiniPlayer) onToggleMiniPlayer(!isMiniPlayer);
			return;
		}
		if (v) try {
			v.disablePictureInPicture = false;
			v.autoPictureInPicture = true;
			v.setAttribute("autopictureinpicture", "true");
			if (document.pictureInPictureElement) {
				await document.exitPictureInPicture();
				setIsOsPipActive(false);
				return;
			}
			if (v.webkitPresentationMode === "picture-in-picture" && v.webkitSetPresentationMode) {
				v.webkitSetPresentationMode("inline");
				setIsOsPipActive(false);
				return;
			}
			if (v.paused && v.readyState >= 1) await v.play().catch(() => {});
			if (v.requestPictureInPicture && v.readyState >= 1) {
				await v.requestPictureInPicture();
				setIsOsPipActive(true);
				return;
			}
			if (v.webkitSupportsPresentationMode && v.webkitSetPresentationMode && v.webkitSupportsPresentationMode("picture-in-picture")) {
				v.webkitSetPresentationMode("picture-in-picture");
				setIsOsPipActive(true);
				return;
			}
		} catch {}
		if (onToggleMiniPlayer) onToggleMiniPlayer(!isMiniPlayer);
	};
	const handleTogglePortraitMode = () => {
		manualLandscapeLockRef.current = false;
		autoTiltLandscapeRef.current = false;
		if (isMiniPlayer && onToggleMiniPlayer) onToggleMiniPlayer(false);
		if (isPortraitFullscreen) {
			setIsPortraitFullscreen(false);
			return;
		}
		setIsLandscapeMode(false);
		setIsFullscreen(false);
		try {
			if (document.fullscreenElement || document.webkitFullscreenElement) {
				if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
				else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
			}
			if (screen.orientation?.unlock) screen.orientation.unlock();
		} catch {}
		setIsPortraitFullscreen(true);
		resetOverlayAutoHide();
	};
	const handleToggleFullscreen = () => {
		const stage = playerStageRef.current;
		const currentFs = document.fullscreenElement || document.webkitFullscreenElement;
		const currentlyActive = isLandscapeMode || isFullscreen || Boolean(currentFs);
		const w = window.innerWidth || 390;
		const h = window.innerHeight || 844;
		setIsViewportPortrait(h >= w);
		setViewportDims({
			width: w,
			height: h
		});
		if (currentlyActive) {
			manualLandscapeLockRef.current = false;
			autoTiltLandscapeRef.current = false;
			setIsLandscapeMode(false);
			setIsFullscreen(false);
			setIsPortraitFullscreen(false);
			try {
				if (currentFs) {
					if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
					else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
				}
				if (screen.orientation?.unlock) screen.orientation.unlock();
			} catch {}
			return;
		}
		manualLandscapeLockRef.current = true;
		if (isMiniPlayer && onToggleMiniPlayer) onToggleMiniPlayer(false);
		setIsPortraitFullscreen(false);
		if (modalContainerRef.current) modalContainerRef.current.scrollTo({ top: 0 });
		setIsLandscapeMode(true);
		setIsFullscreen(true);
		resetOverlayAutoHide();
		try {
			if (stage && stage.requestFullscreen) stage.requestFullscreen().then(() => {
				if (screen.orientation?.lock) screen.orientation.lock("landscape").catch(() => {});
			}).catch(() => {});
			else if (stage && stage.webkitRequestFullscreen) stage.webkitRequestFullscreen();
		} catch {}
	};
	const applyVolumeLevel = (nextV) => {
		const clamped = Math.max(0, Math.min(400, Math.round(nextV)));
		setVolume(clamped);
		setIsMuted(clamped === 0);
		try {
			if (clamped > 0) localStorage.setItem(SOUND_BOOST_STORAGE_KEY, String(clamped));
		} catch {}
		if (videoRef.current) syncVideoAudioBooster(videoRef.current, clamped, clamped === 0);
		if (embedIframeRef.current?.contentWindow) try {
			embedIframeRef.current.contentWindow.postMessage(JSON.stringify({
				context: "player.js",
				method: "setVolume",
				value: Math.min(100, clamped)
			}), "*");
		} catch {}
		const barPercent = clamped <= 100 ? Math.round(clamped / 400 * 100) : Math.min(100, Math.round(clamped / 400 * 100));
		const label = clamped === 0 ? "Muted (0%)" : clamped > 250 ? `🔥 Ultra Sound Boost ${clamped}%` : clamped > 100 ? `🔊 Sound Boost ${clamped}%` : `Sound ${clamped}%`;
		triggerHud("volume", label, barPercent, 950);
	};
	const applyBrightnessLevel = (nextB) => {
		const clamped = Math.max(20, Math.min(160, Math.round(nextB)));
		setBrightness(clamped);
		try {
			localStorage.setItem(BRIGHTNESS_STORAGE_KEY, String(clamped));
		} catch {}
		triggerHud("brightness", `Brightness ${clamped}%`, Math.round((clamped - 20) / 140 * 100), 850);
	};
	const handleStageTouchStart = (e) => {
		if (isMiniPlayer || isScreenLocked || playerMode === "trailer") return;
		if (e.target.closest("button, input, select, a, [data-scrubber=\"true\"]")) return;
		if (e.touches.length !== 1) return;
		const touch = e.touches[0];
		const rect = e.currentTarget.getBoundingClientRect();
		const isLeftHalf = isLandscapeMode && isViewportPortrait ? touch.clientY - rect.top < rect.height / 2 : touch.clientX - rect.left < rect.width / 2;
		touchGestureRef.current = {
			active: true,
			side: isLeftHalf ? "left" : "right",
			startX: touch.clientX,
			startY: touch.clientY,
			startVal: isLeftHalf ? isMuted ? 0 : volume : brightness,
			moved: false
		};
		if (holdTimerRef.current) window.clearTimeout(holdTimerRef.current);
		holdTimerRef.current = window.setTimeout(() => {
			if (touchGestureRef.current && !touchGestureRef.current.moved && isPlaying) setIsHold2x(true);
		}, 500);
	};
	const handleStageTouchMove = (e) => {
		const g = touchGestureRef.current;
		if (!g || !g.active || isMiniPlayer || isScreenLocked || e.touches.length !== 1) return;
		const touch = e.touches[0];
		const isRotated90 = isLandscapeMode && isViewportPortrait;
		const dx = isRotated90 ? touch.clientY - g.startY : touch.clientX - g.startX;
		const dy = isRotated90 ? touch.clientX - g.startX : g.startY - touch.clientY;
		if (!g.moved) {
			if (Math.abs(dx) > 14 && Math.abs(dx) > Math.abs(dy)) {
				g.active = false;
				if (holdTimerRef.current) window.clearTimeout(holdTimerRef.current);
				return;
			}
			if (Math.abs(dy) > 8) {
				g.moved = true;
				if (holdTimerRef.current) window.clearTimeout(holdTimerRef.current);
				setIsHold2x(false);
			} else return;
		}
		if (g.side === "right") {
			const deltaBrightness = Math.round(dy * .75);
			applyBrightnessLevel(g.startVal + deltaBrightness);
		} else {
			const scale = g.startVal >= 100 || dy > 0 ? 1.65 : .95;
			const deltaVol = Math.round(dy * scale);
			applyVolumeLevel(g.startVal + deltaVol);
		}
	};
	const handleStageTouchEnd = () => {
		if (holdTimerRef.current) window.clearTimeout(holdTimerRef.current);
		if (isHold2x) setIsHold2x(false);
		touchGestureRef.current = null;
	};
	const clampMiniPosition = (x, y, widthVal) => {
		const vw = window.innerWidth || 390;
		const vh = window.innerHeight || 844;
		const heightVal = Math.round(widthVal * 9 / 16);
		const maxX = Math.max(8, vw - widthVal - 8);
		const maxY = Math.max(8, vh - heightVal - 8);
		return {
			x: Math.max(8, Math.min(maxX, Math.round(x))),
			y: Math.max(8, Math.min(maxY, Math.round(y)))
		};
	};
	const clampMiniWidthVal = (w) => {
		const vw = window.innerWidth || 390;
		const maxW = Math.min(370, Math.max(220, vw - 16));
		return Math.max(165, Math.min(maxW, Math.round(w)));
	};
	const handleCycleMiniSize = (e) => {
		e.stopPropagation();
		const vw = window.innerWidth || 390;
		const maxW = Math.min(350, Math.max(240, vw - 20));
		const clampedW = clampMiniWidthVal(miniWidth < 215 ? 255 : miniWidth < 295 ? maxW : 185);
		setMiniWidth(clampedW);
		if (miniPos) setMiniPos(clampMiniPosition(miniPos.x, miniPos.y, clampedW));
	};
	const handleMiniTouchStart = (e) => {
		if (!isMiniPlayer) return;
		const target = e.target;
		if (target.closest("[data-mini-close=\"true\"]") || target.closest("[data-mini-cycle=\"true\"]")) return;
		const container = modalContainerRef.current;
		if (!container) return;
		const rect = container.getBoundingClientRect();
		if (e.touches.length === 2) {
			const dx = e.touches[0].clientX - e.touches[1].clientX;
			const dy = e.touches[0].clientY - e.touches[1].clientY;
			miniDragRef.current = {
				mode: "pinch",
				startX: 0,
				startY: 0,
				origX: rect.left,
				origY: rect.top,
				origWidth: miniWidth,
				initialPinchDist: Math.max(24, Math.hypot(dx, dy)),
				moved: true
			};
			return;
		}
		if (e.touches.length !== 1) return;
		const touch = e.touches[0];
		const isResizeHandle = Boolean(target.closest("[data-mini-resize=\"true\"]"));
		miniDragRef.current = {
			mode: isResizeHandle ? "resize" : "move",
			startX: touch.clientX,
			startY: touch.clientY,
			origX: rect.left,
			origY: rect.top,
			origWidth: miniWidth,
			initialPinchDist: 0,
			moved: isResizeHandle
		};
	};
	const handleMiniTouchMove = (e) => {
		if (!isMiniPlayer) return;
		const g = miniDragRef.current;
		if (!g) return;
		if (g.mode === "pinch" && e.touches.length === 2) {
			const dx = e.touches[0].clientX - e.touches[1].clientX;
			const dy = e.touches[0].clientY - e.touches[1].clientY;
			const dist = Math.max(24, Math.hypot(dx, dy));
			const nextW = clampMiniWidthVal(g.origWidth * (dist / g.initialPinchDist));
			setMiniWidth(nextW);
			setMiniPos(clampMiniPosition(g.origX, g.origY, nextW));
			return;
		}
		if (e.touches.length !== 1) return;
		const touch = e.touches[0];
		const dx = touch.clientX - g.startX;
		const dy = touch.clientY - g.startY;
		if (g.mode === "resize") {
			const deltaW = Math.abs(dx) >= Math.abs(dy) ? dx : dy * (16 / 9);
			const nextW = clampMiniWidthVal(g.origWidth + deltaW);
			setMiniWidth(nextW);
			setMiniPos(clampMiniPosition(g.origX, g.origY, nextW));
			return;
		}
		if (!g.moved && Math.hypot(dx, dy) > 7) g.moved = true;
		if (g.moved) setMiniPos(clampMiniPosition(g.origX + dx, g.origY + dy, g.origWidth));
	};
	const handleMiniTouchEnd = (e) => {
		if (!isMiniPlayer) return;
		const target = e.target;
		if (target.closest("[data-mini-close=\"true\"]") || target.closest("[data-mini-cycle=\"true\"]") || target.closest("[data-mini-resize=\"true\"]")) {
			miniDragRef.current = null;
			return;
		}
		const g = miniDragRef.current;
		miniDragRef.current = null;
		if (g && g.mode === "move" && !g.moved) {
			lastMiniTapTimeRef.current = Date.now();
			if (onToggleMiniPlayer) onToggleMiniPlayer(false);
		}
	};
	const handleMiniMouseDown = (e) => {
		if (!isMiniPlayer || e.button !== 0) return;
		const target = e.target;
		if (target.closest("[data-mini-close=\"true\"]") || target.closest("[data-mini-cycle=\"true\"]")) return;
		const container = modalContainerRef.current;
		if (!container) return;
		const rect = container.getBoundingClientRect();
		const isResizeHandle = Boolean(target.closest("[data-mini-resize=\"true\"]"));
		miniDragRef.current = {
			mode: isResizeHandle ? "resize" : "move",
			startX: e.clientX,
			startY: e.clientY,
			origX: rect.left,
			origY: rect.top,
			origWidth: miniWidth,
			initialPinchDist: 0,
			moved: isResizeHandle
		};
		const onMouseMove = (ev) => {
			const g = miniDragRef.current;
			if (!g) return;
			const dx = ev.clientX - g.startX;
			const dy = ev.clientY - g.startY;
			if (g.mode === "resize") {
				const deltaW = Math.abs(dx) >= Math.abs(dy) ? dx : dy * (16 / 9);
				const nextW = clampMiniWidthVal(g.origWidth + deltaW);
				setMiniWidth(nextW);
				setMiniPos(clampMiniPosition(g.origX, g.origY, nextW));
				return;
			}
			if (!g.moved && Math.hypot(dx, dy) > 6) g.moved = true;
			if (g.moved) setMiniPos(clampMiniPosition(g.origX + dx, g.origY + dy, g.origWidth));
		};
		const onMouseUp = () => {
			window.removeEventListener("mousemove", onMouseMove);
			window.removeEventListener("mouseup", onMouseUp);
			const g = miniDragRef.current;
			miniDragRef.current = null;
			if (g && g.mode === "move" && !g.moved) {
				lastMiniTapTimeRef.current = Date.now();
				if (onToggleMiniPlayer) onToggleMiniPlayer(false);
			}
		};
		window.addEventListener("mousemove", onMouseMove);
		window.addEventListener("mouseup", onMouseUp);
	};
	const handleStageClick = (e) => {
		if (e.target.closest("button, input, select, a, [data-scrubber=\"true\"]")) return;
		if (isMiniPlayer) {
			if (Date.now() - lastMiniTapTimeRef.current > 350) {
				if (onToggleMiniPlayer) onToggleMiniPlayer(false);
			}
			return;
		}
		if (isScreenLocked) {
			resetOverlayAutoHide();
			return;
		}
		const rect = e.currentTarget.getBoundingClientRect();
		const ratio = isLandscapeMode && isViewportPortrait ? (e.clientY - rect.top) / Math.max(1, rect.height) : (e.clientX - rect.left) / Math.max(1, rect.width);
		const side = ratio < .34 ? "left" : ratio > .66 ? "right" : "center";
		const now = Date.now();
		if (now - lastTapRef.current.time < 290 && lastTapRef.current.side === side && side !== "center") {
			handleSeekRelative(side === "left" ? -10 : 10);
			lastTapRef.current = {
				time: 0,
				side: "center"
			};
			return;
		}
		lastTapRef.current = {
			time: now,
			side
		};
		if (showOverlayControls) {
			setShowOverlayControls(false);
			setShowBrightnessPanel(false);
			setShowQualityMenu(false);
			setShowAudioServerMenu(false);
			setShowSleepMenu(false);
		} else resetOverlayAutoHide();
	};
	const handleSubtitleFileUpload = async (e) => {
		const file = e.target.files?.[0];
		if (!file) return;
		try {
			setLoadingAutoSub(true);
			const text = await file.text();
			const parsedCues = parseSrtOrVttToCues(text);
			if (parsedCues.length > 0) {
				const sampleText = parsedCues.slice(0, 5).map((c) => c.text).join(" ");
				if (!/[\u0980-\u09FF]/.test(sampleText)) {
					triggerHud("toast", "ইংরেজি সাবটাইটেল বাংলায় অনুবাদ করা হচ্ছে...");
					const firstBatch = parsedCues.slice(0, 60);
					for (let i = 0; i < firstBatch.length; i += 30) {
						const chunk = firstBatch.slice(i, i + 30);
						const tr = await translateLinesToBangla(chunk.map((c) => c.text));
						chunk.forEach((c, idx) => {
							if (tr[idx]) c.text = tr[idx];
						});
					}
					if (parsedCues.length > 60) (async () => {
						for (let i = 60; i < Math.min(parsedCues.length, 500); i += 35) {
							const chunk = parsedCues.slice(i, i + 35);
							const tr = await translateLinesToBangla(chunk.map((c) => c.text));
							chunk.forEach((c, idx) => {
								if (tr[idx]) c.text = tr[idx];
							});
						}
					})().catch(() => {});
				}
				const vttBuilt = buildVttFromCues(parsedCues);
				const blob = new Blob([vttBuilt], { type: "text/vtt" });
				const url = URL.createObjectURL(blob);
				loadedSubKeyRef.current = `${movie?.path || movie?.url || ""}::${selectedEpIdx}`;
				setSubtitleCues(parsedCues);
				updateSubtitleBlobUrl(url);
				setSubtitleName(`বাংলা Sub (${file.name})`);
				setAutoBanglaSubEnabled(true);
				triggerHud("toast", `বাংলা সাবটাইটেল লোড হয়েছে: ${file.name}`);
			} else {
				const vttText = convertSrtToVtt(text);
				const blob = new Blob([vttText], { type: "text/vtt" });
				const url = URL.createObjectURL(blob);
				loadedSubKeyRef.current = `${movie?.path || movie?.url || ""}::${selectedEpIdx}`;
				updateSubtitleBlobUrl(url);
				setSubtitleName(file.name);
				setAutoBanglaSubEnabled(true);
				triggerHud("toast", `Subtitle Loaded: ${file.name}`);
			}
		} catch {} finally {
			setLoadingAutoSub(false);
		}
	};
	const handleShare = async () => {
		const shareUrl = `${`${window.location.origin}${window.location.pathname}`}?${new URLSearchParams({
			watch: movie.path || movie.url,
			title: detail?.title || movie.title
		}).toString()}`;
		try {
			if (navigator.share) await navigator.share({
				title: detail?.title || movie.title,
				text: `Watch ${detail?.title || movie.title} in Full HD on CinePulse`,
				url: shareUrl
			});
			else {
				await navigator.clipboard.writeText(shareUrl);
				setCopiedShare(true);
				setTimeout(() => setCopiedShare(false), 2e3);
			}
		} catch {}
	};
	const vlcUrl = activeSource?.url ? `vlc-x-callback://x-callback-url/stream?url=${encodeURIComponent(activeSource.url)}` : "";
	activeSource?.url && `${encodeURIComponent(activeSource.url)}`;
	activeSource?.url && `${activeSource.url}`;
	const ratingScore = detail?.communityScore ? (detail.communityScore.recommendedPercent / 10).toFixed(1) : "8.7";
	const ctrlTotalDur = iosControllerRef.current?.getTotalDurationSec() || 0;
	const displayDuration = Math.floor(duration > 0 ? duration : ctrlTotalDur > 0 ? ctrlTotalDur : 0);
	const effectiveDuration = Math.max(1, displayDuration || 1);
	const activePlayheadSec = isScrubbing && scrubPreview !== null ? scrubPreview.sec : currentTime;
	const progressPercent = displayDuration > 0 ? Math.min(100, activePlayheadSec / effectiveDuration * 100) : 0;
	const bufferedPercent = displayDuration > 0 ? Math.min(100, bufferedEnd / effectiveDuration * 100) : 0;
	const videoFilterStyle = {
		filter: `brightness(${brightness}%) contrast(${brightness > 110 ? 105 : 100}%) saturate(${brightness > 115 ? 108 : 100}%)`,
		objectFit: videoFit
	};
	const horizontalEpisodesSlice = filteredEpisodesWithIdx;
	const episodeRanges = (() => {
		const total = filteredEpisodesWithIdx.length;
		if (total <= 80) return [];
		const chunkSize = 100;
		const ranges = [];
		for (let start = 0; start < total; start += chunkSize) {
			const end = Math.min(total - 1, start + chunkSize - 1);
			const startNum = filteredEpisodesWithIdx[start]?.ep?.number ?? start + 1;
			const endNum = filteredEpisodesWithIdx[end]?.ep?.number ?? end + 1;
			ranges.push({
				label: `${startNum}-${endNum}`,
				startPos: start,
				endPos: end,
				firstEpIdx: filteredEpisodesWithIdx[start]?.idx ?? 0
			});
		}
		return ranges;
	})();
	const isRotated90 = !isMiniPlayer && (isLandscapeMode || isFullscreen) && isViewportPortrait;
	const computeScrubberTarget = (clientX, clientY, el) => {
		const targetEl = el || scrubberRef.current;
		if (!targetEl) return {
			targetSec: currentTime,
			percent: progressPercent
		};
		const rect = targetEl.getBoundingClientRect();
		const ratio = isRotated90 ? (clientY - rect.top) / Math.max(1, rect.height) : (clientX - rect.left) / Math.max(1, rect.width);
		const clampedRatio = Math.max(0, Math.min(1, ratio));
		return {
			targetSec: Math.floor(clampedRatio * effectiveDuration),
			percent: clampedRatio * 100
		};
	};
	const previewScrubberAtPointer = (clientX, clientY, el) => {
		const { targetSec, percent } = computeScrubberTarget(clientX, clientY, el);
		scrubTargetSecRef.current = targetSec;
		lastRecordedSecondRef.current = targetSec;
		setScrubPreview({
			sec: targetSec,
			percent
		});
		setCurrentTime(targetSec);
		return targetSec;
	};
	const commitScrubberSeek = (targetSec) => {
		scrubTargetSecRef.current = targetSec;
		lastRecordedSecondRef.current = targetSec;
		setCurrentTime(targetSec);
		seekVideoToGlobalTime(targetSec);
	};
	episodes.length > 1 && selectedEpIdx + 1 < episodes.length && episodes[selectedEpIdx + 1];
	const combinedScreenshots = (() => {
		const list = [];
		const add = (u) => {
			if (u && u.startsWith("http") && !list.includes(u)) list.push(u);
		};
		(myflixData?.screenshots || []).forEach(add);
		(effectiveDetail?.screenshots || []).forEach(add);
		if (list.length === 0) {
			add(effectiveDetail?.backdrop);
			add(movie.poster || effectiveDetail?.poster);
		}
		return list;
	})();
	const combinedCast = (() => {
		const list = [];
		const seen = /* @__PURE__ */ new Set();
		const add = (c) => {
			const n = (c.name || "").trim();
			if (!n || seen.has(n.toLowerCase())) return;
			seen.add(n.toLowerCase());
			list.push({
				name: n,
				role: c.role || "Actor",
				photo: c.photo || ""
			});
		};
		(myflixData?.cast || []).forEach(add);
		(effectiveDetail?.cast || []).forEach(add);
		return list;
	})();
	const combinedDownloads = (() => {
		const list = [];
		const seen = /* @__PURE__ */ new Set();
		for (const src of activeEpisode?.sources || []) {
			const dlUrl = src.downloadUrl || src.url;
			if (dlUrl && src.type !== "embed" && !seen.has(dlUrl)) {
				seen.add(dlUrl);
				list.push({
					label: `Download ${src.quality || 720}p`,
					subLabel: `${src.audioLanguages?.join(" + ") || src.audio || movie.language} • ${src.quality >= 1080 ? "Full HD" : "High Speed"}`,
					url: dlUrl
				});
			}
		}
		for (const btn of effectiveDetail?.downloadButtons || []) if (btn.url && !seen.has(btn.url)) {
			seen.add(btn.url);
			list.push({
				label: btn.label.replace(/^download\s*/i, "Download "),
				subLabel: btn.quality ? `${btn.quality} • Direct Link` : "Direct High-Speed Server",
				url: btn.url
			});
		}
		for (const mDl of myflixData?.downloads || []) if (mDl.url && !seen.has(mDl.url)) {
			seen.add(mDl.url);
			list.push({
				label: mDl.label,
				subLabel: "Cloud Mirror Download",
				url: mDl.url
			});
		}
		return list;
	})();
	const displayYear = myflixData?.year || effectiveDetail?.releaseDate?.match(/\b(20\d{2}|19\d{2})\b/)?.[1] || (movie.title.match(/\b(20\d{2}|19\d{2})\b/)?.[1] ?? "2026");
	const displayGenre = myflixData?.genre || effectiveDetail?.genre || (movie.typeBadge === "SERIES" ? "Drama, Crime, Series" : "Action, Drama, Thriller");
	myflixData?.director;
	myflixData?.release || effectiveDetail?.releaseDate || normalizeMovieCardItem(movie).timeAgo;
	const displayRating = myflixData?.rating || normalizeMovieCardItem(movie).rating || ratingScore || "8.7";
	activeEpisode && formatEpisodeTileBadge(activeEpisode, selectedEpIdx);
	const activeRelatedSeason = (effectiveDetail?.relatedSeasons || []).find((rs) => rs.active || rs.path === (movie.path || movie.url));
	const activeSeasonLabel = selectedSeasonFilter === "all" ? distinctSeasons.length > 1 ? `Season ${String(distinctSeasons[0]).padStart(2, "0")}` : activeRelatedSeason?.seasonNumber ? `Season ${String(activeRelatedSeason.seasonNumber).padStart(2, "0")}` : distinctSeasons.length > 0 ? `Season ${String(distinctSeasons[0]).padStart(2, "0")}` : "Season 01" : `Season ${String(selectedSeasonFilter).padStart(2, "0")}`;
	const availableDubs = (() => {
		if (effectiveDetail?.dubs && effectiveDetail.dubs.length > 0) return effectiveDetail.dubs;
		const rawLang = (effectiveDetail?.language || movie.language || "Hindi dub").trim();
		return [{
			id: "default-dub",
			label: /dub|audio|sub/i.test(rawLang) ? rawLang : `${rawLang} dub`,
			path: movie.path || movie.url,
			active: true
		}];
	})();
	const activeDubOption = availableDubs.find((d) => d.path === (movie.path || movie.url)) || availableDubs.find((d) => d.active) || availableDubs[0];
	const activeDubLabel = activeDubOption?.label || effectiveDetail?.language || movie.language || "Hindi dub";
	return /* @__PURE__ */ _jsxs("div", {
		ref: modalContainerRef,
		onTouchStart: isMiniPlayer ? handleMiniTouchStart : void 0,
		onTouchMove: isMiniPlayer ? handleMiniTouchMove : void 0,
		onTouchEnd: isMiniPlayer ? handleMiniTouchEnd : void 0,
		onMouseDown: isMiniPlayer ? handleMiniMouseDown : void 0,
		style: isMiniPlayer ? {
			width: `${miniWidth}px`,
			...miniPos ? {
				left: `${miniPos.x}px`,
				top: `${miniPos.y}px`
			} : {
				right: "12px",
				bottom: "76px"
			},
			touchAction: "none"
		} : void 0,
		className: isMiniPlayer ? "fixed z-50 rounded-2xl overflow-hidden shadow-[0_18px_48px_rgba(0,0,0,0.92)] border border-[#dc2626]/60 bg-[#050505] text-[#e5e5e5] flex flex-col cursor-grab active:cursor-grabbing select-none" : "fixed inset-0 z-50 w-full h-[100dvh] max-w-[100vw] bg-[#050505] text-[#e5e5e5] flex flex-col overflow-hidden",
		children: [!isMiniPlayer && !isLandscapeMode && !isFullscreen && !isPortraitFullscreen && /* @__PURE__ */ _jsx("header", {
			className: "shrink-0 relative z-40 w-full bg-[#0a0a0a]/95 backdrop-blur-md border-b border-white/[0.08]",
			children: /* @__PURE__ */ _jsxs("div", {
				className: "max-w-5xl mx-auto px-3 sm:px-6 h-13 flex items-center justify-between gap-2",
				children: [/* @__PURE__ */ _jsxs("div", {
					className: "flex items-center gap-2.5 min-w-0",
					children: [/* @__PURE__ */ _jsx("button", {
						type: "button",
						onClick: onClose,
						"aria-label": "Back to Home",
						className: "w-9 h-9 rounded-lg bg-[#151515] hover:bg-[#222222] border border-white/[0.08] flex items-center justify-center text-white active:scale-95 transition-all shrink-0",
						children: /* @__PURE__ */ _jsx(ChevronLeft, { className: "w-5 h-5" })
					}), /* @__PURE__ */ _jsxs("button", {
						type: "button",
						onClick: onClose,
						className: "flex items-center gap-2 text-left group truncate",
						children: [/* @__PURE__ */ _jsx("span", {
							className: "w-7 h-7 rounded-md bg-[#dc2626] flex items-center justify-center text-white shadow-[0_0_12px_rgba(220,38,38,0.5)] shrink-0",
							children: /* @__PURE__ */ _jsx(Play, { className: "w-3.5 h-3.5 fill-current ml-0.5" })
						}), /* @__PURE__ */ _jsxs("span", {
							className: "text-base font-black tracking-wider text-white",
							children: ["CINE", /* @__PURE__ */ _jsx("span", {
								className: "text-[#dc2626]",
								children: "PULSE"
							})]
						})]
					})]
				}), /* @__PURE__ */ _jsxs("div", {
					className: "flex items-center gap-1.5 sm:gap-2 shrink-0",
					children: [
						/* @__PURE__ */ _jsxs("button", {
							type: "button",
							onClick: () => onToggleWatchlist(movie, currentFolder),
							className: `h-8 px-2.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 border transition-colors ${isInWatchlist ? "bg-[#dc2626]/20 border-[#dc2626] text-white" : "bg-[#151515] hover:bg-[#222222] border-white/[0.08] text-gray-200"}`,
							children: [/* @__PURE__ */ _jsx(ListPlus, { className: "w-3.5 h-3.5 text-[#dc2626]" }), /* @__PURE__ */ _jsx("span", {
								className: "hidden sm:inline",
								children: isInWatchlist ? "Saved" : "Watchlist"
							})]
						}),
						/* @__PURE__ */ _jsx("button", {
							type: "button",
							onClick: handleShare,
							className: "h-8 px-2.5 rounded-lg bg-[#151515] hover:bg-[#222222] border border-white/[0.08] text-xs font-semibold text-gray-200 flex items-center gap-1.5 transition-colors",
							children: copiedShare ? /* @__PURE__ */ _jsxs(_Fragment, { children: [/* @__PURE__ */ _jsx(Check, { className: "w-3.5 h-3.5 text-emerald-400" }), /* @__PURE__ */ _jsx("span", {
								className: "hidden sm:inline",
								children: "Copied"
							})] }) : /* @__PURE__ */ _jsxs(_Fragment, { children: [/* @__PURE__ */ _jsx(Share2, { className: "w-3.5 h-3.5 text-[#dc2626]" }), /* @__PURE__ */ _jsx("span", {
								className: "hidden sm:inline",
								children: "Share"
							})] })
						}),
						/* @__PURE__ */ _jsxs("div", {
							className: "relative",
							children: [/* @__PURE__ */ _jsxs("button", {
								type: "button",
								onClick: () => setShowAudioServerMenu((v) => !v),
								title: "Server, Sound, Brightness & View Settings",
								className: `h-8 px-2.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${showAudioServerMenu ? "bg-[#dc2626] border-[#dc2626] text-white" : "bg-[#151515] hover:bg-[#222222] border-white/[0.08] text-gray-200"}`,
								children: [/* @__PURE__ */ _jsx(Settings, { className: "w-3.5 h-3.5 text-current" }), /* @__PURE__ */ _jsx("span", {
									className: "hidden xs:inline",
									children: "Settings"
								})]
							}), showAudioServerMenu && /* @__PURE__ */ _jsxs("div", {
								onClick: (e) => e.stopPropagation(),
								className: "absolute right-0 top-full mt-2 w-72 max-h-[78dvh] overflow-y-auto rounded-xl bg-[#111318]/98 border border-white/15 shadow-2xl p-3 z-50 divide-y divide-white/10",
								children: [
									/* @__PURE__ */ _jsxs("div", {
										className: "pb-2.5",
										children: [/* @__PURE__ */ _jsxs("div", {
											className: "px-1 py-0.5 text-[11px] font-extrabold uppercase tracking-wider text-gray-300 flex items-center justify-between",
											children: [/* @__PURE__ */ _jsx("span", { children: "Video Quality (কোয়ালিটি সিলেক্ট করুন)" }), /* @__PURE__ */ _jsx("button", {
												type: "button",
												onClick: () => setShowAudioServerMenu(false),
												className: "text-gray-400 hover:text-white cursor-pointer",
												children: /* @__PURE__ */ _jsx(X, { className: "w-4 h-4" })
											})]
										}), /* @__PURE__ */ _jsxs("div", {
											className: "grid grid-cols-2 gap-1.5 mt-1.5",
											children: [/* @__PURE__ */ _jsxs("button", {
												type: "button",
												onClick: () => {
													handleSelectQualityOption("auto");
													setShowAudioServerMenu(false);
												},
												className: `px-2.5 py-2 rounded-lg text-xs font-bold flex items-center justify-between transition-colors cursor-pointer ${selectedQualityPref === "auto" ? "bg-[#dc2626] text-white" : "bg-white/[0.05] hover:bg-white/[0.12] text-gray-200"}`,
												children: [/* @__PURE__ */ _jsxs("span", { children: [
													"Auto (",
													activeSource?.quality || 720,
													"p)"
												] }), selectedQualityPref === "auto" && /* @__PURE__ */ _jsx(Check, { className: "w-3.5 h-3.5 shrink-0" })]
											}), (directQualitySources.length > 0 ? directQualitySources : [
												{
													quality: 1080,
													idx: -1,
													label: "1080p FHD"
												},
												{
													quality: 720,
													idx: -1,
													label: "720p HD"
												},
												{
													quality: 480,
													idx: -1,
													label: "480p SD"
												}
											]).map((qItem) => {
												const isActive = selectedQualityPref === qItem.quality;
												return /* @__PURE__ */ _jsxs("button", {
													type: "button",
													onClick: () => {
														handleSelectQualityOption(qItem.quality, qItem.idx >= 0 ? qItem.idx : void 0);
														setShowAudioServerMenu(false);
													},
													className: `px-2.5 py-2 rounded-lg text-xs font-bold flex items-center justify-between transition-colors cursor-pointer ${isActive ? "bg-[#dc2626] text-white" : "bg-white/[0.05] hover:bg-white/[0.12] text-gray-200"}`,
													children: [/* @__PURE__ */ _jsxs("span", {
														className: "truncate",
														children: [qItem.quality, "p HD"]
													}), isActive && /* @__PURE__ */ _jsx(Check, { className: "w-3.5 h-3.5 shrink-0" })]
												}, qItem.quality);
											})]
										})]
									}),
									/* @__PURE__ */ _jsxs("div", {
										className: "py-2.5 space-y-2.5",
										children: [/* @__PURE__ */ _jsxs("div", {
											className: "space-y-1.5",
											children: [
												/* @__PURE__ */ _jsxs("div", {
													className: "flex items-center justify-between text-xs font-semibold text-gray-200",
													children: [/* @__PURE__ */ _jsxs("span", {
														className: "flex items-center gap-1.5",
														children: [isMuted || volume === 0 ? /* @__PURE__ */ _jsx(VolumeX, { className: "w-3.5 h-3.5 text-red-400" }) : /* @__PURE__ */ _jsx(Volume2, { className: `w-3.5 h-3.5 ${volume > 100 ? "text-emerald-400 animate-pulse" : "text-[#dc2626]"}` }), /* @__PURE__ */ _jsx("span", { children: volume > 100 ? "Ultra Sound Boost (সাউন্ড বুস্ট)" : "Sound (সাউন্ড)" })]
													}), /* @__PURE__ */ _jsxs("span", {
														className: `font-mono text-[11px] font-bold ${volume > 100 ? "text-emerald-400" : "text-gray-300"}`,
														children: [
															isMuted ? 0 : volume,
															"%",
															volume > 100 ? " 🔥" : ""
														]
													})]
												}),
												/* @__PURE__ */ _jsx("input", {
													type: "range",
													min: 0,
													max: 400,
													step: 5,
													value: isMuted ? 0 : volume,
													onChange: (e) => applyVolumeLevel(Number(e.target.value)),
													className: "w-full h-1.5 bg-white/20 rounded-lg accent-[#dc2626] cursor-pointer"
												}),
												/* @__PURE__ */ _jsx("div", {
													className: "grid grid-cols-5 gap-1 pt-0.5",
													children: [
														{
															val: 100,
															label: "100%"
														},
														{
															val: 150,
															label: "150%"
														},
														{
															val: 200,
															label: "200%"
														},
														{
															val: 300,
															label: "300%"
														},
														{
															val: 400,
															label: "400%🔥"
														}
													].map((preset) => {
														const active = !isMuted && volume === preset.val;
														return /* @__PURE__ */ _jsx("button", {
															type: "button",
															onClick: () => applyVolumeLevel(preset.val),
															className: `py-1 rounded text-[10px] font-extrabold transition-colors cursor-pointer ${active ? preset.val > 100 ? "bg-emerald-600 text-white shadow" : "bg-[#dc2626] text-white shadow" : "bg-white/[0.07] hover:bg-white/[0.15] text-gray-300"}`,
															children: preset.label
														}, preset.val);
													})
												})
											]
										}), /* @__PURE__ */ _jsxs("div", {
											className: "space-y-1",
											children: [/* @__PURE__ */ _jsxs("div", {
												className: "flex items-center justify-between text-xs font-semibold text-gray-200",
												children: [/* @__PURE__ */ _jsxs("span", {
													className: "flex items-center gap-1.5",
													children: [/* @__PURE__ */ _jsx(Sun, { className: "w-3.5 h-3.5 text-amber-400" }), /* @__PURE__ */ _jsx("span", { children: "Brightness (ব্রাইটনেস)" })]
												}), /* @__PURE__ */ _jsxs("span", {
													className: "font-mono text-[11px] text-gray-300",
													children: [brightness, "%"]
												})]
											}), /* @__PURE__ */ _jsx("input", {
												type: "range",
												min: 20,
												max: 160,
												value: brightness,
												onChange: (e) => applyBrightnessLevel(Number(e.target.value)),
												className: "w-full h-1.5 bg-white/20 rounded-lg accent-amber-400 cursor-pointer"
											})]
										})]
									}),
									/* @__PURE__ */ _jsxs("div", {
										className: "py-2.5 space-y-1.5",
										children: [/* @__PURE__ */ _jsx("div", {
											className: "text-[10px] font-extrabold uppercase tracking-wider text-gray-400",
											children: "Screen & PiP Mode"
										}), /* @__PURE__ */ _jsxs("div", {
											className: "grid grid-cols-3 gap-1.5",
											children: [
												/* @__PURE__ */ _jsxs("button", {
													type: "button",
													onClick: () => {
														setShowAudioServerMenu(false);
														handleTogglePortraitMode();
													},
													className: "px-2 py-2 rounded-lg bg-white/[0.06] hover:bg-white/[0.14] text-[11px] font-bold text-gray-100 flex flex-col items-center gap-1 cursor-pointer",
													children: [/* @__PURE__ */ _jsx(Smartphone, { className: "w-4 h-4 text-[#dc2626]" }), /* @__PURE__ */ _jsx("span", { children: "Portrait" })]
												}),
												/* @__PURE__ */ _jsxs("button", {
													type: "button",
													onClick: () => {
														setShowAudioServerMenu(false);
														handleToggleFullscreen();
													},
													className: "px-2 py-2 rounded-lg bg-white/[0.06] hover:bg-white/[0.14] text-[11px] font-bold text-gray-100 flex flex-col items-center gap-1 cursor-pointer",
													children: [/* @__PURE__ */ _jsx(Maximize, { className: "w-4 h-4 text-[#dc2626]" }), /* @__PURE__ */ _jsx("span", { children: "Landscape" })]
												}),
												/* @__PURE__ */ _jsxs("button", {
													type: "button",
													onClick: () => {
														setShowAudioServerMenu(false);
														handleTogglePiP();
													},
													className: "px-2 py-2 rounded-lg bg-white/[0.06] hover:bg-white/[0.14] text-[11px] font-bold text-gray-100 flex flex-col items-center gap-1 cursor-pointer",
													children: [/* @__PURE__ */ _jsx(PictureInPicture2, { className: "w-4 h-4 text-[#dc2626]" }), /* @__PURE__ */ _jsx("span", { children: "PiP Mode" })]
												})
											]
										})]
									}),
									/* @__PURE__ */ _jsxs("div", {
										className: "pt-2 space-y-1",
										children: [/* @__PURE__ */ _jsxs("button", {
											type: "button",
											onClick: () => setAutoBanglaSubEnabled((v) => !v),
											className: "w-full text-left px-2 py-1.5 rounded-lg text-xs font-semibold text-gray-200 hover:bg-white/10 flex items-center justify-between cursor-pointer",
											children: [/* @__PURE__ */ _jsx("span", { children: "বাংলা Subtitle" }), /* @__PURE__ */ _jsx("span", {
												className: autoBanglaSubEnabled ? "text-emerald-400 font-bold" : "text-gray-400",
												children: autoBanglaSubEnabled ? "ON" : "OFF"
											})]
										}), /* @__PURE__ */ _jsxs("button", {
											type: "button",
											onClick: () => setPlaybackSpeed((s) => s === 1 ? 1.25 : s === 1.25 ? 1.5 : s === 1.5 ? 2 : 1),
											className: "w-full text-left px-2 py-1.5 rounded-lg text-xs font-semibold text-gray-200 hover:bg-white/10 flex items-center justify-between cursor-pointer",
											children: [/* @__PURE__ */ _jsx("span", { children: "Playback Speed" }), /* @__PURE__ */ _jsxs("span", {
												className: "text-[#ef4444] font-bold",
												children: [playbackSpeed, "x"]
											})]
										})]
									})
								]
							})]
						}),
						/* @__PURE__ */ _jsx("button", {
							type: "button",
							onClick: handleTogglePiP,
							title: "Phone Screen PiP Mode",
							className: `w-8 h-8 rounded-lg border flex items-center justify-center transition-colors cursor-pointer ${isOsPipActive ? "bg-[#dc2626] border-[#dc2626] text-white" : "bg-[#151515] hover:bg-[#222222] border-white/[0.08] text-gray-200"}`,
							children: /* @__PURE__ */ _jsx(PictureInPicture2, { className: "w-4 h-4" })
						})
					]
				})]
			})
		}), /* @__PURE__ */ _jsxs("div", {
			className: isMiniPlayer ? "w-full" : isLandscapeMode || isFullscreen || isPortraitFullscreen ? "w-full h-full" : "flex-1 min-h-0 w-full max-w-5xl mx-auto flex flex-col overflow-hidden",
			children: [/* @__PURE__ */ _jsx("section", {
				className: isMiniPlayer || isLandscapeMode || isFullscreen || isPortraitFullscreen ? "w-full shrink-0" : "w-full shrink-0 sm:px-6 sm:pt-2 pb-1 bg-[#050505] z-30",
				children: /* @__PURE__ */ _jsx("div", {
					className: "bg-[#0a0a0a] sm:border sm:border-white/[0.08] sm:rounded-xl overflow-hidden shadow-2xl",
					children: /* @__PURE__ */ _jsxs("div", {
						ref: playerStageRef,
						id: "player-container-0",
						onContextMenu: (e) => {
							e.preventDefault();
							e.stopPropagation();
						},
						onTouchStart: handleStageTouchStart,
						onTouchMove: handleStageTouchMove,
						onTouchEnd: handleStageTouchEnd,
						onClick: handleStageClick,
						style: {
							WebkitTouchCallout: "none",
							WebkitUserSelect: "none",
							userSelect: "none",
							...isLandscapeMode && isViewportPortrait ? {
								position: "fixed",
								top: "50%",
								left: "50%",
								width: "100dvh",
								height: "100dvw",
								transform: "translate(-50%, -50%) rotate(90deg)",
								zIndex: 9999
							} : {}
						},
						className: isMiniPlayer ? "relative w-full aspect-video bg-black select-none" : isLandscapeMode && isViewportPortrait ? "bg-black flex items-center justify-center select-none touch-none overflow-hidden" : isLandscapeMode || isFullscreen || isPortraitFullscreen ? "fixed inset-0 z-[9999] w-screen h-[100dvh] bg-black flex items-center justify-center select-none touch-none overflow-hidden" : "relative w-full aspect-video bg-black overflow-hidden select-none",
						children: [
							!isMiniPlayer && hudNotice && /* @__PURE__ */ _jsxs("div", {
								className: "pointer-events-none absolute top-3.5 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full bg-black/85 border border-white/20 backdrop-blur-md shadow-2xl flex items-center gap-2.5 min-w-[170px]",
								children: [hudNotice.type === "volume" ? isMuted || (hudNotice.percent ?? volume) === 0 ? /* @__PURE__ */ _jsx(VolumeX, { className: "w-4 h-4 text-red-400 shrink-0" }) : /* @__PURE__ */ _jsx(Volume2, { className: "w-4 h-4 text-[#dc2626] shrink-0" }) : /* @__PURE__ */ _jsx(Sun, { className: "w-4 h-4 text-amber-400 shrink-0" }), /* @__PURE__ */ _jsxs("div", {
									className: "flex-1 min-w-0",
									children: [/* @__PURE__ */ _jsx("div", {
										className: "text-[11px] font-extrabold text-white tracking-wide truncate",
										children: hudNotice.label
									}), typeof hudNotice.percent === "number" && /* @__PURE__ */ _jsx("div", {
										className: "w-full h-1.5 bg-white/20 rounded-full overflow-hidden mt-1",
										children: /* @__PURE__ */ _jsx("div", {
											style: { width: `${Math.max(0, Math.min(100, hudNotice.percent))}%` },
											className: `h-full rounded-full transition-all duration-75 ${hudNotice.type === "volume" ? "bg-[#dc2626]" : "bg-amber-400"}`
										})
									})]
								})]
							}),
							isMiniPlayer && /* @__PURE__ */ _jsxs("div", {
								className: "pointer-events-none absolute inset-0 z-30 flex flex-col justify-between bg-gradient-to-t from-black/65 via-transparent to-black/45",
								children: [/* @__PURE__ */ _jsxs("div", {
									className: "flex items-center justify-between p-1.5",
									children: [/* @__PURE__ */ _jsx("button", {
										type: "button",
										"data-mini-cycle": "true",
										onClick: handleCycleMiniSize,
										className: "pointer-events-auto w-6 h-6 rounded-full bg-black/75 text-white flex items-center justify-center border border-white/20",
										children: miniWidth >= 295 ? /* @__PURE__ */ _jsx(Minimize2, { className: "w-3 h-3" }) : /* @__PURE__ */ _jsx(Maximize2, { className: "w-3 h-3" })
									}), /* @__PURE__ */ _jsxs("div", {
										className: "flex items-center gap-1",
										children: [!isEmbedSource && /* @__PURE__ */ _jsx("button", {
											type: "button",
											"data-mini-cycle": "true",
											onClick: (e) => {
												e.stopPropagation();
												handleTogglePlayPause();
											},
											className: "pointer-events-auto w-6 h-6 rounded-full bg-black/75 text-white flex items-center justify-center border border-white/20",
											children: isPlaying ? /* @__PURE__ */ _jsx(Pause, { className: "w-3 h-3 fill-current" }) : /* @__PURE__ */ _jsx(Play, { className: "w-3 h-3 fill-current ml-0.5" })
										}), /* @__PURE__ */ _jsx("button", {
											type: "button",
											"data-mini-close": "true",
											onClick: (e) => {
												e.stopPropagation();
												onClose();
											},
											className: "pointer-events-auto w-6 h-6 rounded-full bg-black/75 text-white hover:text-red-400 flex items-center justify-center border border-white/20",
											children: /* @__PURE__ */ _jsx(X, { className: "w-3.5 h-3.5" })
										})]
									})]
								}), /* @__PURE__ */ _jsx("div", {
									className: "w-full h-1 bg-white/20 overflow-hidden",
									children: /* @__PURE__ */ _jsx("div", {
										style: { width: `${progressPercent}%` },
										className: "h-full bg-[#dc2626] transition-all duration-150"
									})
								})]
							}),
							!isMiniPlayer && (isLandscapeMode || isFullscreen || isPortraitFullscreen) && /* @__PURE__ */ _jsxs("div", {
								onClick: (e) => e.stopPropagation(),
								className: "absolute top-3 inset-x-3 z-40 flex items-center justify-between gap-2 pointer-events-none",
								children: [/* @__PURE__ */ _jsxs("button", {
									type: "button",
									onClick: () => {
										if (isPortraitFullscreen) setIsPortraitFullscreen(false);
										else handleToggleFullscreen();
									},
									className: "pointer-events-auto px-3 py-1.5 rounded-lg bg-black/75 border border-white/20 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer",
									children: [/* @__PURE__ */ _jsx(ChevronLeft, { className: "w-4 h-4" }), /* @__PURE__ */ _jsx("span", { children: "Exit" })]
								}), /* @__PURE__ */ _jsxs("div", {
									className: "pointer-events-auto flex items-center gap-1.5",
									children: [
										/* @__PURE__ */ _jsxs("button", {
											type: "button",
											onClick: () => {
												if (isPortraitFullscreen) handleToggleFullscreen();
												else handleTogglePortraitMode();
											},
											className: "px-2.5 py-1.5 rounded-lg bg-black/75 border border-white/20 text-white text-xs font-bold flex items-center gap-1 cursor-pointer",
											children: [/* @__PURE__ */ _jsx(Smartphone, { className: "w-3.5 h-3.5 text-[#dc2626]" }), /* @__PURE__ */ _jsx("span", { children: isPortraitFullscreen ? "Landscape" : "Portrait" })]
										}),
										/* @__PURE__ */ _jsx("button", {
											type: "button",
											onClick: handleCycleVideoFit,
											className: "px-2.5 py-1.5 rounded-lg bg-black/75 border border-white/20 text-white text-xs font-bold cursor-pointer",
											children: videoFit === "contain" ? "Fit" : videoFit === "cover" ? "Zoom" : "Stretch"
										}),
										/* @__PURE__ */ _jsxs("button", {
											type: "button",
											onClick: handleTogglePiP,
											className: "px-2.5 py-1.5 rounded-lg bg-black/75 border border-white/20 text-white text-xs font-bold flex items-center gap-1 cursor-pointer",
											children: [/* @__PURE__ */ _jsx(PictureInPicture2, { className: "w-3.5 h-3.5 text-[#dc2626]" }), /* @__PURE__ */ _jsx("span", { children: "PiP" })]
										})
									]
								})]
							}),
							!isMiniPlayer && isHold2x && /* @__PURE__ */ _jsxs("div", {
								className: "pointer-events-none absolute top-4 left-1/2 -translate-x-1/2 z-40 px-3.5 py-1 rounded-full bg-[#dc2626] text-white text-xs font-extrabold flex items-center gap-1.5 shadow-lg",
								children: [/* @__PURE__ */ _jsx(FastForward, { className: "w-3.5 h-3.5 fill-current" }), /* @__PURE__ */ _jsx("span", { children: "2x Fast Speed" })]
							}),
							!isMiniPlayer && seekRipple && /* @__PURE__ */ _jsxs("div", {
								className: `pointer-events-none absolute inset-y-0 ${seekRipple.side === "left" ? "left-0 rounded-r-full" : "right-0 rounded-l-full"} w-1/3 bg-[#dc2626]/25 backdrop-blur-[2px] z-30 flex flex-col items-center justify-center text-white animate-pulse`,
								children: [seekRipple.side === "left" ? /* @__PURE__ */ _jsx(RotateCcw, { className: "w-7 h-7 text-white mb-1" }) : /* @__PURE__ */ _jsx(RotateCw, { className: "w-7 h-7 text-white mb-1" }), /* @__PURE__ */ _jsx("span", {
									className: "text-xs font-extrabold",
									children: seekRipple.delta > 0 ? `+${seekRipple.delta}s` : `${seekRipple.delta}s`
								})]
							}),
							playerMode === "trailer" && effectiveDetail?.youtubeTrailerId ? /* @__PURE__ */ _jsx("iframe", {
								src: `https://www.youtube-nocookie.com/embed/${effectiveDetail.youtubeTrailerId}?autoplay=1&rel=0&playsinline=1`,
								title: effectiveDetail.title,
								sandbox: "allow-scripts allow-same-origin allow-presentation",
								className: "w-full h-full border-0",
								allow: "autoplay; encrypted-media; picture-in-picture; fullscreen",
								allowFullScreen: true
							}) : isEmbedSource && activeSource?.url ? /* @__PURE__ */ _jsxs("div", {
								className: "relative w-full h-full",
								children: [/* @__PURE__ */ _jsx("iframe", {
									ref: embedIframeRef,
									src: activeSource.url,
									title: effectiveDetail?.title || movie.title,
									sandbox: "allow-scripts allow-same-origin allow-presentation",
									referrerPolicy: "no-referrer",
									style: { filter: `brightness(${brightness}%)` },
									className: "w-full h-full border-0 bg-black",
									allow: "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen",
									allowFullScreen: true
								}, activeSource.url), !isMiniPlayer && /* @__PURE__ */ _jsxs(_Fragment, { children: [/* @__PURE__ */ _jsx("div", {
									onTouchStart: handleStageTouchStart,
									onTouchMove: handleStageTouchMove,
									onTouchEnd: handleStageTouchEnd,
									className: "absolute inset-y-12 left-0 w-[18%] z-20 touch-none"
								}), /* @__PURE__ */ _jsx("div", {
									onTouchStart: handleStageTouchStart,
									onTouchMove: handleStageTouchMove,
									onTouchEnd: handleStageTouchEnd,
									className: "absolute inset-y-12 right-0 w-[18%] z-20 touch-none"
								})] })]
							}) : effectiveVideoUrl && !videoError ? /* @__PURE__ */ _jsxs(_Fragment, { children: [
								/* @__PURE__ */ _jsx("video", {
									ref: (el) => {
										videoRef.current = el;
										if (el) {
											el.disablePictureInPicture = false;
											el.autoPictureInPicture = true;
											el.setAttribute("autopictureinpicture", "true");
										}
									},
									src: effectiveVideoUrl,
									poster: movie.poster || effectiveDetail?.poster,
									style: {
										...videoFilterStyle,
										WebkitTouchCallout: "none",
										WebkitUserSelect: "none",
										userSelect: "none"
									},
									muted: isMuted,
									controls: false,
									playsInline: true,
									autoPlay: true,
									preload: "auto",
									controlsList: "nodownload",
									onContextMenu: (e) => {
										e.preventDefault();
										e.stopPropagation();
									},
									onPlay: (e) => {
										const v = e.currentTarget;
										v.disablePictureInPicture = false;
										v.autoPictureInPicture = true;
										v.setAttribute("autopictureinpicture", "true");
										setIsPlaying(true);
										syncCleanAudioVolume(v);
										try {
											for (let i = 0; i < v.textTracks.length; i++) v.textTracks[i].mode = "disabled";
										} catch {}
									},
									onPause: () => {
										if (!isSeekingRef.current && !iosTransitioningRef.current) setIsPlaying(false);
									},
									onPlaying: (e) => {
										const v = e.currentTarget;
										if (stallDownshiftTimerRef.current) {
											window.clearTimeout(stallDownshiftTimerRef.current);
											stallDownshiftTimerRef.current = null;
										}
										if (startupWatchdogTimerRef.current) {
											window.clearTimeout(startupWatchdogTimerRef.current);
											startupWatchdogTimerRef.current = null;
										}
										setIsPlaying(true);
										setHasStartedPlayback(true);
										setIsBuffering(false);
										syncCleanAudioVolume(v);
										try {
											for (let i = 0; i < v.textTracks.length; i++) v.textTracks[i].mode = "disabled";
										} catch {}
									},
									onLoadedData: (e) => {
										const v = e.currentTarget;
										isSeekingRef.current = false;
										iosTransitioningRef.current = false;
										setHasStartedPlayback(true);
										setIsBuffering(false);
										syncCleanAudioVolume(v);
										try {
											for (let i = 0; i < v.textTracks.length; i++) v.textTracks[i].mode = "disabled";
										} catch {}
										if (v.paused && v.currentTime < .5) startVideoWithiOSFallback(v);
									},
									onCanPlay: (e) => {
										const v = e.currentTarget;
										if (stallDownshiftTimerRef.current) {
											window.clearTimeout(stallDownshiftTimerRef.current);
											stallDownshiftTimerRef.current = null;
										}
										if (startupWatchdogTimerRef.current) {
											window.clearTimeout(startupWatchdogTimerRef.current);
											startupWatchdogTimerRef.current = null;
										}
										isSeekingRef.current = false;
										setHasStartedPlayback(true);
										setIsBuffering(false);
										syncCleanAudioVolume(v);
										try {
											for (let i = 0; i < v.textTracks.length; i++) v.textTracks[i].mode = "disabled";
										} catch {}
										if (v.paused && v.currentTime < .5) startVideoWithiOSFallback(v);
									},
									onWaiting: () => {
										smoothPlaySecondsRef.current = 0;
										setIsBuffering(true);
										if (stallDownshiftTimerRef.current) window.clearTimeout(stallDownshiftTimerRef.current);
										if (autoNetQuality && hasStartedPlayback && currentTime > 5 && (activeSource?.quality || 480) > 576 && sources.length > 1 && !hasStalledInSessionRef.current) stallDownshiftTimerRef.current = window.setTimeout(() => {
											const v = videoRef.current;
											if (!v || v.readyState >= 3) return;
											const curQ = activeSource?.quality || 720;
											const lighterIdx = sources.findIndex((s, idx) => idx !== selectedSourceIdx && !failedSourceIndices.includes(idx) && s.type !== "embed" && s.quality < curQ);
											if (lighterIdx !== -1) {
												hasStalledInSessionRef.current = true;
												handleSelectSource(lighterIdx, false);
											}
										}, 8e3);
									},
									onSeeked: (e) => {
										const v = e.currentTarget;
										isSeekingRef.current = false;
										setHasStartedPlayback(true);
										setIsBuffering(false);
										syncCleanAudioVolume(v);
									},
									onLoadedMetadata: handleVideoLoadedMetadata,
									onTimeUpdate: (e) => {
										if (isScrubbing || isScrubbingRef.current || isSeekingRef.current || iosTransitioningRef.current) return;
										const v = e.currentTarget;
										syncCleanAudioVolume(v);
										try {
											for (let i = 0; i < v.textTracks.length; i++) if (v.textTracks[i].mode !== "disabled") v.textTracks[i].mode = "disabled";
										} catch {}
										if (v.readyState >= 2) {
											if (!hasStartedPlayback) setHasStartedPlayback(true);
											if (isBuffering) setIsBuffering(false);
										}
										try {
											if (v.buffered && v.buffered.length > 0) {
												const rawBufEnd = v.buffered.end(v.buffered.length - 1);
												const globalBufEnd = useHlsBridge ? iosSegmentStartSecRef.current + rawBufEnd : rawBufEnd;
												if (Math.abs(globalBufEnd - bufferedEnd) >= 1) setBufferedEnd(Math.floor(globalBufEnd));
											}
										} catch {}
										const segDur = v.duration || 0;
										if (useHlsBridge && iosControllerRef.current && segDur > 0) {
											if (segDur - v.currentTime < 14) {
												const nextSegIdx = iosCurrentSegIndexRef.current + 1;
												iosControllerRef.current.ensureNextSegmentPrebuffered(nextSegIdx, 0).then((readySeg) => {
													if (readySeg?.blobUrl && preloadVideoRef.current && preloadVideoRef.current.src !== readySeg.blobUrl) {
														preloadVideoRef.current.src = readySeg.blobUrl;
														preloadVideoRef.current.load();
													}
												}).catch(() => {});
											}
											if (segDur > 2 && segDur - v.currentTime <= .14) {
												advanceToNextIosSegment();
												return;
											}
										}
										const globalSec = Math.floor(useHlsBridge ? iosSegmentStartSecRef.current + v.currentTime : v.currentTime);
										const totalFromCtrl = iosControllerRef.current?.getTotalDurationSec() || 0;
										const dur = Math.floor(totalFromCtrl > 0 ? totalFromCtrl : segDur);
										if (globalSec !== lastRecordedSecondRef.current) {
											lastRecordedSecondRef.current = globalSec;
											setCurrentTime(globalSec);
											if (dur > 0 && dur !== duration) setDuration(dur);
											if (globalSec > 5 && globalSec % 10 === 0) onRecordWatchProgress(movie, activeEpisode, selectedEpIdx, activeSource, globalSec, dur);
											if (dur > 60 && dur - globalSec <= 45 && selectedEpIdx + 1 < episodes.length && prewarmedNextEpIdxRef.current !== selectedEpIdx + 1) {
												prewarmedNextEpIdxRef.current = selectedEpIdx + 1;
												setNextEpPrewarmed(true);
												const nextDirect = (episodes[selectedEpIdx + 1]?.sources || []).find((s) => s.type !== "embed" && !/abyssplayer\.com|abysscdn\.com|vidsrc|\/embed\//i.test(s.url || ""));
												if (nextDirect?.url) warmStreamConnection(nextDirect.url);
											}
										}
									},
									onEnded: () => {
										if (useHlsBridge && iosControllerRef.current) {
											advanceToNextIosSegment().then((advanced) => {
												if (!advanced) {
													setIsPlaying(false);
													if (sleepTimerMode === "end_of_ep") {
														setSleepTimerMode(null);
														triggerHud("toast", "স্লিপ টাইমার: এপিসোড শেষে ভিডিও বন্ধ হয়েছে", void 0, 2200);
														return;
													}
													if (autoNextEp && selectedEpIdx + 1 < episodes.length) handleSelectEpisode(selectedEpIdx + 1);
												}
											});
											return;
										}
										setIsPlaying(false);
										if (sleepTimerMode === "end_of_ep") {
											setSleepTimerMode(null);
											triggerHud("toast", "স্লিপ টাইমার: এপিসোড শেষে ভিডিও বন্ধ হয়েছে", void 0, 2200);
											return;
										}
										if (autoNextEp && selectedEpIdx + 1 < episodes.length) handleSelectEpisode(selectedEpIdx + 1);
									},
									onError: handleVideoError,
									className: "w-full h-full bg-black object-contain select-none"
								}),
								!isMiniPlayer && hasStartedPlayback && showOverlayControls && /* @__PURE__ */ _jsx("div", {
									onClick: () => setShowOverlayControls(false),
									className: "absolute inset-0 z-30 flex flex-col justify-end bg-gradient-to-t from-black/75 via-transparent to-transparent select-none",
									children: /* @__PURE__ */ _jsxs("div", {
										onClick: (e) => e.stopPropagation(),
										className: "px-3.5 pb-2.5 pt-2 flex items-center gap-3",
										children: [
											/* @__PURE__ */ _jsx("button", {
												type: "button",
												onClick: handleTogglePlayPause,
												className: "text-white hover:text-gray-200 active:scale-90 transition-transform shrink-0 cursor-pointer",
												children: isBuffering ? /* @__PURE__ */ _jsx(LoaderCircle, { className: "w-5 h-5 animate-spin text-white" }) : isPlaying ? /* @__PURE__ */ _jsx(Pause, { className: "w-5 h-5 fill-current" }) : /* @__PURE__ */ _jsx(Play, { className: "w-5 h-5 fill-current" })
											}),
											/* @__PURE__ */ _jsxs("div", {
												ref: scrubberRef,
												"data-scrubber": "true",
												onTouchStart: (e) => {
													e.stopPropagation();
													const t = e.touches[0];
													if (!t) return;
													isScrubbingRef.current = true;
													setIsScrubbing(true);
													previewScrubberAtPointer(t.clientX, t.clientY, e.currentTarget);
												},
												onTouchMove: (e) => {
													e.stopPropagation();
													if (!isScrubbingRef.current) return;
													const t = e.touches[0];
													if (!t) return;
													previewScrubberAtPointer(t.clientX, t.clientY, e.currentTarget);
												},
												onTouchEnd: (e) => {
													e.stopPropagation();
													if (!isScrubbingRef.current) return;
													isScrubbingRef.current = false;
													setIsScrubbing(false);
													setScrubPreview(null);
													commitScrubberSeek(scrubTargetSecRef.current);
												},
												onMouseDown: (e) => {
													e.stopPropagation();
													const el = e.currentTarget;
													isScrubbingRef.current = true;
													setIsScrubbing(true);
													previewScrubberAtPointer(e.clientX, e.clientY, el);
													const onMove = (ev) => {
														if (!isScrubbingRef.current) return;
														previewScrubberAtPointer(ev.clientX, ev.clientY, el);
													};
													const onUp = (ev) => {
														window.removeEventListener("mousemove", onMove);
														window.removeEventListener("mouseup", onUp);
														if (!isScrubbingRef.current) return;
														isScrubbingRef.current = false;
														setIsScrubbing(false);
														setScrubPreview(null);
														const { targetSec } = computeScrubberTarget(ev.clientX, ev.clientY, el);
														commitScrubberSeek(targetSec);
													};
													window.addEventListener("mousemove", onMove);
													window.addEventListener("mouseup", onUp);
												},
												className: "relative flex-1 h-5 flex items-center cursor-pointer touch-none",
												children: [/* @__PURE__ */ _jsxs("div", {
													className: "w-full h-[3px] rounded-full bg-white/30 overflow-hidden relative",
													children: [/* @__PURE__ */ _jsx("div", {
														style: { width: `${bufferedPercent}%` },
														className: "absolute inset-y-0 left-0 bg-white/45 rounded-full transition-all duration-150"
													}), /* @__PURE__ */ _jsx("div", {
														style: { width: `${progressPercent}%` },
														className: "absolute inset-y-0 left-0 bg-white rounded-full"
													})]
												}), /* @__PURE__ */ _jsx("div", {
													style: { left: `calc(${progressPercent}% - 6px)` },
													className: "absolute w-3 h-3 rounded-full bg-white shadow-md pointer-events-none"
												})]
											}),
											/* @__PURE__ */ _jsxs("span", {
												className: "text-[11px] sm:text-xs font-sans font-medium text-white whitespace-nowrap tracking-tight shrink-0",
												children: [
													formatSeconds(activePlayheadSec),
													"/",
													formatSeconds(displayDuration)
												]
											}),
											/* @__PURE__ */ _jsx("button", {
												type: "button",
												onClick: handleTogglePiP,
												title: "PiP Mode",
												className: "text-white hover:text-gray-200 shrink-0 cursor-pointer",
												children: /* @__PURE__ */ _jsx(PictureInPicture2, { className: "w-4 h-4" })
											}),
											/* @__PURE__ */ _jsx("button", {
												type: "button",
												onClick: handleToggleFullscreen,
												title: "Fullscreen Mode",
												className: "text-white hover:text-gray-200 shrink-0 cursor-pointer",
												children: isLandscapeMode || isFullscreen ? /* @__PURE__ */ _jsx(Minimize, { className: "w-4 h-4" }) : /* @__PURE__ */ _jsx(Maximize, { className: "w-4 h-4" })
											})
										]
									})
								}),
								!hasStartedPlayback && /* @__PURE__ */ _jsxs("div", {
									className: "pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-black",
									children: [(movie.poster || effectiveDetail?.poster) && /* @__PURE__ */ _jsx("img", {
										src: movie.poster || effectiveDetail?.poster,
										alt: movie.title,
										className: "absolute inset-0 w-full h-full object-cover opacity-35 blur-xs"
									}), /* @__PURE__ */ _jsxs("div", {
										className: "relative z-10 flex flex-col items-center gap-2 px-4 py-2 rounded-xl bg-black/65 backdrop-blur-xs",
										children: [/* @__PURE__ */ _jsx(LoaderCircle, { className: "w-7 h-7 animate-spin text-[#dc2626]" }), /* @__PURE__ */ _jsx("span", {
											className: "text-[11px] font-semibold text-white tracking-wide",
											children: "Starting Stream..."
										})]
									})]
								}),
								/* @__PURE__ */ _jsx("video", {
									ref: preloadVideoRef,
									muted: true,
									playsInline: true,
									preload: "auto",
									className: "hidden pointer-events-none w-0 h-0 opacity-0"
								}),
								autoMutedForiOS && isMuted && currentTime >= 13.5 && !isMiniPlayer && /* @__PURE__ */ _jsxs("button", {
									type: "button",
									onClick: (e) => {
										e.stopPropagation();
										setIsMuted(false);
										setAutoMutedForiOS(false);
										if (videoRef.current) {
											videoRef.current.muted = false;
											videoRef.current.play().catch(() => {});
										}
									},
									className: "absolute top-3 left-3 z-30 px-3 py-1.5 rounded-lg bg-[#dc2626] text-white text-xs font-bold flex items-center gap-1.5 shadow-xl",
									children: [/* @__PURE__ */ _jsx(Volume2, { className: "w-4 h-4" }), /* @__PURE__ */ _jsx("span", { children: "Tap for Sound" })]
								})
							] }) : loading || useHlsBridge && !isEmbedSource && activeSource?.url && !effectiveVideoUrl && !videoError ? /* @__PURE__ */ _jsxs("div", {
								className: "pointer-events-none relative w-full h-full flex items-center justify-center bg-black",
								children: [(movie.poster || effectiveDetail?.poster) && /* @__PURE__ */ _jsx("img", {
									src: movie.poster || effectiveDetail?.poster,
									alt: movie.title,
									className: "absolute inset-0 w-full h-full object-cover opacity-35 blur-xs"
								}), /* @__PURE__ */ _jsxs("div", {
									className: "relative z-10 flex flex-col items-center gap-2 px-4 py-2 rounded-xl bg-black/65 backdrop-blur-xs",
									children: [/* @__PURE__ */ _jsx(LoaderCircle, { className: "w-7 h-7 animate-spin text-[#dc2626]" }), /* @__PURE__ */ _jsx("span", {
										className: "text-[11px] font-semibold text-white tracking-wide",
										children: "Starting Stream..."
									})]
								})]
							}) : /* @__PURE__ */ _jsxs("div", {
								className: "relative w-full h-full flex flex-col items-center justify-center p-5 text-center bg-[#0a0a0a]",
								children: [/* @__PURE__ */ _jsx("p", {
									className: "text-xs sm:text-sm text-gray-300 mb-3",
									children: "যদি Server 1 প্লে না হয়, নিচের অন্য Server সিলেক্ট করুন অথবা সরাসরি ডাউনলোড করুন।"
								}), /* @__PURE__ */ _jsxs("div", {
									className: "flex flex-wrap items-center justify-center gap-2",
									children: [sources.length > 1 && /* @__PURE__ */ _jsxs("button", {
										type: "button",
										onClick: () => handleSelectSource((selectedSourceIdx + 1) % sources.length, true),
										className: "px-4 py-2 rounded-lg bg-[#dc2626] hover:bg-[#b91c1c] text-white text-xs font-bold flex items-center gap-1.5",
										children: [/* @__PURE__ */ _jsx(Play, { className: "w-3.5 h-3.5 fill-current" }), /* @__PURE__ */ _jsx("span", { children: "Try Next Server" })]
									}), activeSource?.url && /* @__PURE__ */ _jsxs("a", {
										href: vlcUrl,
										className: "px-4 py-2 rounded-lg bg-[#151515] hover:bg-[#222222] border border-white/10 text-white text-xs font-bold flex items-center gap-1.5",
										children: [/* @__PURE__ */ _jsx(Tv, { className: "w-3.5 h-3.5 text-[#dc2626]" }), /* @__PURE__ */ _jsx("span", { children: "Play in VLC" })]
									})]
								})]
							}),
							!isMiniPlayer && autoBanglaSubEnabled && activeBanglaCueText && /* @__PURE__ */ _jsx("div", {
								className: `pointer-events-none select-none absolute inset-x-3 ${showOverlayControls ? "bottom-11 sm:bottom-12" : "bottom-1.5 sm:bottom-2.5"} z-30 flex justify-center transition-all duration-150`,
								children: /* @__PURE__ */ _jsx("div", {
									className: `max-w-[88%] px-1.5 py-0.5 rounded bg-black/45 text-center font-medium text-white/95 leading-tight tracking-normal ${subFontSize === "lg" ? "text-xs sm:text-sm" : subFontSize === "md" ? "text-[10.5px] sm:text-xs" : "text-[9.5px] sm:text-[11px]"}`,
									style: {
										fontFamily: "'Hind Siliguri', sans-serif",
										textShadow: "0 1px 2px rgba(0,0,0,0.95), -1px -1px 0 rgba(0,0,0,0.9), 1px -1px 0 rgba(0,0,0,0.9)"
									},
									children: activeBanglaCueText
								})
							})
						]
					})
				})
			}), !isMiniPlayer && !isLandscapeMode && !isFullscreen && !isPortraitFullscreen && /* @__PURE__ */ _jsxs("div", {
				className: "flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-y-contain px-2.5 sm:px-6 pt-2 pb-28 space-y-5",
				children: [
					/* @__PURE__ */ _jsxs("section", {
						className: "space-y-2.5",
						children: [
							/* @__PURE__ */ _jsxs("div", {
								className: "flex items-baseline flex-wrap gap-x-2.5 gap-y-1",
								children: [/* @__PURE__ */ _jsx("h1", {
									className: "text-lg sm:text-2xl font-extrabold text-white leading-tight",
									children: effectiveDetail?.title || movie.title
								}), /* @__PURE__ */ _jsxs("button", {
									type: "button",
									onClick: () => setBottomTab(bottomTab === "infoCast" ? "forYou" : "infoCast"),
									className: "inline-flex items-center gap-0.5 text-sm font-medium text-gray-400 hover:text-white transition-colors cursor-pointer",
									children: [/* @__PURE__ */ _jsx("span", { children: "Info" }), /* @__PURE__ */ _jsx(ChevronRight, { className: "w-4 h-4" })]
								})]
							}),
							/* @__PURE__ */ _jsxs("div", {
								className: "flex flex-wrap items-center gap-2 text-xs sm:text-sm text-gray-400",
								children: [
									/* @__PURE__ */ _jsx(Tv, { className: "w-3.5 h-3.5 text-gray-400 shrink-0" }),
									/* @__PURE__ */ _jsx("span", {
										className: "text-gray-600",
										children: "|"
									}),
									/* @__PURE__ */ _jsxs("span", {
										className: "inline-flex items-center gap-1 text-amber-400 font-bold",
										children: [/* @__PURE__ */ _jsx(Star, { className: "w-3.5 h-3.5 fill-current" }), /* @__PURE__ */ _jsx("span", { children: displayRating })]
									}),
									/* @__PURE__ */ _jsx("span", {
										className: "text-gray-600",
										children: "|"
									}),
									/* @__PURE__ */ _jsx("span", { children: displayYear }),
									/* @__PURE__ */ _jsx("span", {
										className: "text-gray-600",
										children: "|"
									}),
									/* @__PURE__ */ _jsx("span", { children: effectiveDetail?.language || movie.language }),
									/* @__PURE__ */ _jsx("span", {
										className: "text-gray-600",
										children: "|"
									}),
									/* @__PURE__ */ _jsx("span", { children: (displayGenre.split(",")[0] || "Drama").trim() }),
									/* @__PURE__ */ _jsx("span", {
										className: "text-gray-600",
										children: "|"
									}),
									/* @__PURE__ */ _jsx("span", { children: episodes.length <= 1 && movie.typeBadge !== "SERIES" && movie.typeBadge !== "ANIME" && movie.typeBadge !== "DRAMA" && distinctSeasons.length <= 1 ? "Movie" : `${distinctSeasons.length || 1} ${(distinctSeasons.length || 1) === 1 ? "season" : "seasons"}` })
								]
							}),
							/* @__PURE__ */ _jsxs("div", {
								className: "flex items-center gap-2 overflow-x-auto no-scrollbar pt-1",
								children: [
									/* @__PURE__ */ _jsxs("button", {
										type: "button",
										onClick: () => onToggleWatchlist(movie, currentFolder),
										className: `h-9 px-3.5 rounded-full text-xs sm:text-sm font-medium flex items-center gap-1.5 shrink-0 transition-colors cursor-pointer ${isInWatchlist ? "bg-[#dc2626]/25 border border-[#dc2626] text-white" : "bg-[#1b1d21] hover:bg-[#25282e] text-gray-200"}`,
										children: [/* @__PURE__ */ _jsx(ListPlus, { className: "w-4 h-4" }), /* @__PURE__ */ _jsx("span", { children: isInWatchlist ? "Added to list" : "Add to list" })]
									}),
									/* @__PURE__ */ _jsx("button", {
										type: "button",
										onClick: handleShare,
										className: "h-9 px-3.5 rounded-full bg-[#1b1d21] hover:bg-[#25282e] text-xs sm:text-sm font-medium text-gray-200 flex items-center gap-1.5 shrink-0 transition-colors cursor-pointer",
										children: copiedShare ? /* @__PURE__ */ _jsxs(_Fragment, { children: [/* @__PURE__ */ _jsx(Check, { className: "w-4 h-4 text-emerald-400" }), /* @__PURE__ */ _jsx("span", { children: "Copied" })] }) : /* @__PURE__ */ _jsxs(_Fragment, { children: [/* @__PURE__ */ _jsx(Share2, { className: "w-4 h-4" }), /* @__PURE__ */ _jsx("span", { children: "Share" })] })
									}),
									/* @__PURE__ */ _jsxs("button", {
										type: "button",
										onClick: () => setShowDownloadSheet(true),
										className: "h-9 px-3.5 rounded-full bg-[#1b1d21] hover:bg-[#25282e] text-xs sm:text-sm font-medium text-gray-200 flex items-center gap-1.5 shrink-0 transition-colors cursor-pointer",
										children: [/* @__PURE__ */ _jsx(Download, { className: "w-4 h-4" }), /* @__PURE__ */ _jsx("span", { children: "Download" })]
									}),
									/* @__PURE__ */ _jsxs("button", {
										type: "button",
										onClick: () => setShowSoundBoostBar((v) => !v),
										className: `h-9 px-3.5 rounded-full text-xs sm:text-sm font-medium flex items-center gap-1.5 shrink-0 transition-colors cursor-pointer ${showSoundBoostBar || !isMuted && volume > 100 ? "bg-emerald-600/25 border border-emerald-500 text-white" : "bg-[#1b1d21] hover:bg-[#25282e] text-gray-200"}`,
										children: [/* @__PURE__ */ _jsx(Volume2, { className: `w-4 h-4 ${!isMuted && volume > 100 ? "text-emerald-400" : "text-[#dc2626]"}` }), /* @__PURE__ */ _jsx("span", { children: !isMuted && volume > 100 ? `Sound Boost: ${volume}%` : `Sound Boost` })]
									}),
									/* @__PURE__ */ _jsxs("button", {
										type: "button",
										onClick: () => {
											setShowSubSyncPanel((v) => !v);
											if (!autoBanglaSubEnabled) {
												setAutoBanglaSubEnabled(true);
												triggerHud("toast", "CC: বাংলা");
											}
										},
										className: `h-9 px-3.5 rounded-full text-xs sm:text-sm font-medium flex items-center gap-1.5 shrink-0 transition-colors cursor-pointer ${autoBanglaSubEnabled || showSubSyncPanel ? "bg-[#dc2626]/25 border border-[#dc2626] text-white" : "bg-[#1b1d21] hover:bg-[#25282e] text-gray-200"}`,
										children: [/* @__PURE__ */ _jsx(Captions, { className: "w-4 h-4 text-[#dc2626]" }), /* @__PURE__ */ _jsx("span", { children: loadingAutoSub ? "Loading CC..." : autoBanglaSubEnabled ? `CC: ${availableSubTracks[activeSubTrackIdx]?.label || "বাংলা"}` : "Subtitles (CC)" })]
									}),
									/* @__PURE__ */ _jsxs("button", {
										type: "button",
										onClick: () => setShowSeparateQualityBar((v) => !v),
										className: `h-9 px-3.5 rounded-full text-xs sm:text-sm font-medium flex items-center gap-1.5 shrink-0 transition-colors cursor-pointer ${showSeparateQualityBar ? "bg-[#dc2626]/25 border border-[#dc2626] text-white" : "bg-[#1b1d21] hover:bg-[#25282e] text-gray-200"}`,
										children: [/* @__PURE__ */ _jsx(Sparkles, { className: "w-4 h-4 text-[#dc2626]" }), /* @__PURE__ */ _jsx("span", { children: activeQualityLabel })]
									}),
									/* @__PURE__ */ _jsx("input", {
										ref: subtitleInputRef,
										type: "file",
										accept: ".srt,.vtt",
										onChange: handleSubtitleFileUpload,
										className: "hidden"
									})
								]
							}),
							showSubSyncPanel && /* @__PURE__ */ _jsxs("div", {
								className: "mt-2 p-2.5 rounded-xl bg-[#14161b] border border-white/15 flex flex-wrap items-center gap-2",
								children: [
									/* @__PURE__ */ _jsxs("span", {
										className: "text-xs font-bold text-gray-300 mr-1 flex items-center gap-1",
										children: [/* @__PURE__ */ _jsx(Captions, { className: "w-3.5 h-3.5 text-[#dc2626]" }), /* @__PURE__ */ _jsx("span", { children: "Subtitles:" })]
									}),
									(availableSubTracks.length > 0 ? availableSubTracks.slice(0, 4) : [{
										id: "default-bn",
										url: "",
										lang: "bn",
										label: "বাংলা (Official)",
										keepOriginalScript: false
									}, {
										id: "default-en",
										url: "",
										lang: "en",
										label: "English (Official)",
										keepOriginalScript: true
									}]).map((track, idx) => {
										return /* @__PURE__ */ _jsx("button", {
											type: "button",
											onClick: () => {
												if (availableSubTracks[idx]) handleSelectSubtitleTrack(idx);
												else {
													setActiveSubTrackIdx(idx);
													setAutoBanglaSubEnabled(true);
												}
											},
											className: `px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${autoBanglaSubEnabled && activeSubTrackIdx === idx ? "bg-[#dc2626] text-white shadow-md" : "bg-[#1f2229] text-gray-300 hover:bg-[#2a2e37]"}`,
											children: track.label
										}, track.id || track.label);
									}),
									/* @__PURE__ */ _jsx("button", {
										type: "button",
										onClick: () => {
											setAutoBanglaSubEnabled(false);
											triggerHud("toast", "Subtitles (CC): OFF");
										},
										className: `px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${!autoBanglaSubEnabled ? "bg-[#dc2626] text-white shadow-md" : "bg-[#1f2229] text-gray-300 hover:bg-[#2a2e37]"}`,
										children: "Off"
									}),
									/* @__PURE__ */ _jsxs("div", {
										className: "flex items-center gap-1 ml-auto bg-[#1f2229] px-2 py-1 rounded-lg border border-white/10",
										children: [
											/* @__PURE__ */ _jsx("span", {
												className: "text-[11px] text-gray-400 font-semibold mr-1",
												children: "Sync:"
											}),
											/* @__PURE__ */ _jsx("button", {
												type: "button",
												onClick: () => {
													setSubOffsetSec((s) => {
														const next = Number((s - 0.5).toFixed(1));
														triggerHud("toast", `Subtitle Sync: ${next > 0 ? `+${next}` : next}s`);
														return next;
													});
												},
												className: "px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-[11px] font-mono font-bold text-white cursor-pointer",
												children: "-0.5s"
											}),
											/* @__PURE__ */ _jsx("button", {
												type: "button",
												onClick: () => {
													setSubOffsetSec(0);
													triggerHud("toast", "Subtitle Sync: 0.0s (Auto Lip-Sync)");
												},
												className: "px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[11px] font-mono font-bold cursor-pointer",
												children: subOffsetSec === 0 ? "Auto" : `${subOffsetSec > 0 ? `+${subOffsetSec}` : subOffsetSec}s`
											}),
											/* @__PURE__ */ _jsx("button", {
												type: "button",
												onClick: () => {
													setSubOffsetSec((s) => {
														const next = Number((s + 0.5).toFixed(1));
														triggerHud("toast", `Subtitle Sync: ${next > 0 ? `+${next}` : next}s`);
														return next;
													});
												},
												className: "px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-[11px] font-mono font-bold text-white cursor-pointer",
												children: "+0.5s"
											})
										]
									})
								]
							}),
							showSoundBoostBar && /* @__PURE__ */ _jsxs("div", {
								className: "mt-2 p-3 rounded-xl bg-[#14161b] border border-emerald-500/30 space-y-2.5",
								children: [
									/* @__PURE__ */ _jsxs("div", {
										className: "flex items-center justify-between",
										children: [/* @__PURE__ */ _jsxs("span", {
											className: "text-xs font-bold text-gray-200 flex items-center gap-1.5",
											children: [/* @__PURE__ */ _jsx(Volume2, { className: "w-4 h-4 text-emerald-400" }), /* @__PURE__ */ _jsx("span", { children: "Ultra Sound Booster (ক্লিয়ার ভয়েস ও ৪ গুণ বেশি সাউন্ড):" })]
										}), /* @__PURE__ */ _jsxs("span", {
											className: "text-xs font-mono font-extrabold text-emerald-400",
											children: [isMuted ? 0 : volume, "%"]
										})]
									}),
									/* @__PURE__ */ _jsx("input", {
										type: "range",
										min: 0,
										max: 400,
										step: 5,
										value: isMuted ? 0 : volume,
										onChange: (e) => applyVolumeLevel(Number(e.target.value)),
										className: "w-full h-2 bg-white/15 rounded-lg accent-emerald-500 cursor-pointer"
									}),
									/* @__PURE__ */ _jsx("div", {
										className: "flex flex-wrap items-center gap-1.5",
										children: [
											{
												val: 100,
												label: "100% Normal"
											},
											{
												val: 150,
												label: "150% Clear"
											},
											{
												val: 200,
												label: "200% Double (2x)"
											},
											{
												val: 300,
												label: "300% Super (3x)"
											},
											{
												val: 400,
												label: "400% Max Boost 🔥"
											}
										].map((preset) => {
											const active = !isMuted && volume === preset.val;
											return /* @__PURE__ */ _jsx("button", {
												type: "button",
												onClick: () => applyVolumeLevel(preset.val),
												className: `px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${active ? preset.val > 100 ? "bg-emerald-600 text-white shadow-md" : "bg-[#dc2626] text-white shadow-md" : "bg-[#1f2229] text-gray-300 hover:bg-[#2a2e37]"}`,
												children: preset.label
											}, preset.val);
										})
									})
								]
							}),
							showSeparateQualityBar && /* @__PURE__ */ _jsxs("div", {
								className: "mt-2 p-2.5 rounded-xl bg-[#14161b] border border-white/15 flex flex-wrap items-center gap-2",
								children: [
									/* @__PURE__ */ _jsxs("span", {
										className: "text-xs font-bold text-gray-300 mr-1 flex items-center gap-1",
										children: [/* @__PURE__ */ _jsx(Sparkles, { className: "w-3.5 h-3.5 text-[#dc2626]" }), /* @__PURE__ */ _jsx("span", { children: "Select Quality:" })]
									}),
									/* @__PURE__ */ _jsxs("button", {
										type: "button",
										onClick: () => handleSelectQualityOption("auto"),
										className: `px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${selectedQualityPref === "auto" ? "bg-[#dc2626] text-white shadow-md" : "bg-[#1f2229] text-gray-300 hover:bg-[#2a2e37]"}`,
										children: [
											"Auto (",
											activeSource?.quality || 720,
											"p)"
										]
									}),
									(directQualitySources.length > 0 ? directQualitySources : [
										{
											quality: 1080,
											idx: -1,
											label: "1080p Full HD"
										},
										{
											quality: 720,
											idx: -1,
											label: "720p HD"
										},
										{
											quality: 480,
											idx: -1,
											label: "480p SD"
										}
									]).map((qItem) => /* @__PURE__ */ _jsx("button", {
										type: "button",
										onClick: () => handleSelectQualityOption(qItem.quality, qItem.idx >= 0 ? qItem.idx : void 0),
										className: `px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${selectedQualityPref === qItem.quality ? "bg-[#dc2626] text-white shadow-md" : "bg-[#1f2229] text-gray-300 hover:bg-[#2a2e37]"}`,
										children: qItem.label
									}, qItem.quality))
								]
							})
						]
					}),
					/* @__PURE__ */ _jsxs("section", {
						className: "space-y-3",
						children: [
							/* @__PURE__ */ _jsxs("div", {
								className: "flex items-baseline gap-2.5 flex-wrap",
								children: [/* @__PURE__ */ _jsx("h2", {
									className: "text-base sm:text-lg font-extrabold text-white",
									children: "Resources"
								}), /* @__PURE__ */ _jsx("span", {
									className: "text-xs text-gray-400 truncate",
									children: "Verified by CinePulse Official"
								})]
							}),
							/* @__PURE__ */ _jsxs("div", {
								className: "flex items-center gap-2.5 flex-wrap",
								children: [/* @__PURE__ */ _jsxs("div", {
									className: "relative inline-block",
									children: [/* @__PURE__ */ _jsxs("button", {
										type: "button",
										onClick: () => {
											setShowDubDropdown((v) => !v);
											setShowSeasonDropdown(false);
										},
										className: "h-10 px-3.5 rounded-lg bg-[#121418] hover:bg-[#1b1d21] border border-white/15 text-xs sm:text-sm font-medium text-gray-100 flex items-center gap-2.5 transition-colors cursor-pointer",
										children: [/* @__PURE__ */ _jsx("span", { children: activeDubLabel }), /* @__PURE__ */ _jsx(ChevronDown, { className: `w-4 h-4 text-gray-400 transition-transform ${showDubDropdown ? "rotate-180" : ""}` })]
									}), showDubDropdown && /* @__PURE__ */ _jsxs("div", {
										className: "absolute left-0 top-full mt-1.5 min-w-[210px] max-h-72 overflow-y-auto bg-[#121418] border border-white/15 rounded-xl shadow-2xl z-30 py-1.5",
										children: [/* @__PURE__ */ _jsx("div", {
											className: "px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-gray-400",
											children: "Audio / Dubbing Languages"
										}), availableDubs.map((dub) => {
											const isCurrentDub = dub.path === (movie.path || movie.url) || dub.id === activeDubOption?.id;
											return /* @__PURE__ */ _jsxs("button", {
												type: "button",
												onClick: () => {
													setShowDubDropdown(false);
													if (dub.path && dub.path !== (movie.path || movie.url)) onSelectMovie({
														...movie,
														path: dub.path,
														url: dub.path,
														language: dub.label
													});
												},
												className: `w-full text-left px-3 py-2 text-xs font-semibold flex items-center justify-between transition-colors cursor-pointer ${isCurrentDub ? "bg-[#dc2626]/20 text-[#ef4444]" : "text-gray-200 hover:bg-white/5"}`,
												children: [/* @__PURE__ */ _jsx("span", { children: dub.label }), isCurrentDub && /* @__PURE__ */ _jsx(Check, { className: "w-3.5 h-3.5 text-[#ef4444]" })]
											}, dub.id || dub.label);
										})]
									})]
								}), (episodes.length > 1 || movie.typeBadge === "SERIES" || movie.typeBadge === "ANIME" || movie.typeBadge === "DRAMA" || distinctSeasons.length > 1 || (effectiveDetail?.relatedSeasons || []).length > 0) && /* @__PURE__ */ _jsxs("div", {
									className: "relative inline-block",
									children: [/* @__PURE__ */ _jsxs("button", {
										type: "button",
										onClick: () => {
											setShowSeasonDropdown((v) => !v);
											setShowDubDropdown(false);
										},
										className: "h-10 px-3.5 rounded-lg bg-[#121418] hover:bg-[#1b1d21] border border-white/15 text-xs sm:text-sm font-medium text-gray-100 flex items-center gap-2.5 transition-colors cursor-pointer",
										children: [/* @__PURE__ */ _jsx("span", { children: activeSeasonLabel }), /* @__PURE__ */ _jsx(ChevronDown, { className: `w-4 h-4 text-gray-400 transition-transform ${showSeasonDropdown ? "rotate-180" : ""}` })]
									}), showSeasonDropdown && /* @__PURE__ */ _jsxs("div", {
										className: "absolute left-0 top-full mt-1.5 min-w-[190px] max-h-72 overflow-y-auto bg-[#121418] border border-white/15 rounded-xl shadow-2xl z-30 py-1.5",
										children: [(distinctSeasons.length > 0 ? distinctSeasons : [1]).map((sNum) => {
											const isCurrentSeason = selectedSeasonFilter === sNum || selectedSeasonFilter === "all" && sNum === (distinctSeasons[0] || 1);
											return /* @__PURE__ */ _jsxs("button", {
												type: "button",
												onClick: () => {
													setSelectedSeasonFilter(sNum);
													setShowSeasonDropdown(false);
													const firstEpIdx = episodes.findIndex((ep) => (ep.season || 1) === sNum);
													if (firstEpIdx !== -1) handleSelectEpisode(firstEpIdx);
												},
												className: `w-full text-left px-3.5 py-2.5 text-xs sm:text-sm font-semibold flex items-center justify-between transition-colors cursor-pointer ${isCurrentSeason ? "bg-[#dc2626]/20 text-[#ef4444]" : "text-gray-200 hover:bg-white/5"}`,
												children: [/* @__PURE__ */ _jsxs("span", { children: ["Season ", String(sNum).padStart(2, "0")] }), isCurrentSeason && /* @__PURE__ */ _jsx(Check, { className: "w-4 h-4 text-[#ef4444]" })]
											}, `in-season-${sNum}`);
										}), (effectiveDetail?.relatedSeasons || []).filter((rs) => rs.path && !distinctSeasons.includes(rs.seasonNumber ?? -1) && rs.path !== (movie.path || movie.url)).map((rs) => /* @__PURE__ */ _jsxs("button", {
											type: "button",
											onClick: () => {
												setShowSeasonDropdown(false);
												onSelectMovie({
													...movie,
													path: rs.path,
													url: rs.path,
													title: rs.title || `${movie.title} - Season ${rs.seasonNumber}`,
													poster: rs.poster || movie.poster
												});
											},
											className: "w-full text-left px-3.5 py-2.5 text-xs sm:text-sm font-semibold flex items-center justify-between text-gray-200 hover:bg-white/5 transition-colors cursor-pointer",
											children: [/* @__PURE__ */ _jsxs("span", { children: ["Season ", String(rs.seasonNumber).padStart(2, "0")] }), /* @__PURE__ */ _jsx("span", {
												className: "text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-gray-300",
												children: "Switch"
											})]
										}, `rel-season-${rs.seasonNumber}-${rs.path}`))]
									})]
								})]
							}),
							(episodes.length > 1 || movie.typeBadge === "SERIES" || movie.typeBadge === "ANIME" || movie.typeBadge === "DRAMA") && /* @__PURE__ */ _jsxs("div", {
								className: "space-y-2",
								children: [episodeRanges.length > 1 && /* @__PURE__ */ _jsxs("div", {
									className: "flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5",
									children: [/* @__PURE__ */ _jsxs("span", {
										className: "text-[11px] font-bold text-gray-400 shrink-0 mr-1",
										children: [
											"Episodes (",
											filteredEpisodesWithIdx.length,
											"):"
										]
									}), episodeRanges.map((rng) => {
										const currentPos = filteredEpisodesWithIdx.findIndex((item) => item.idx === selectedEpIdx);
										const isActiveRange = currentPos >= rng.startPos && currentPos <= rng.endPos;
										return /* @__PURE__ */ _jsx("button", {
											type: "button",
											onClick: () => {
												handleSelectEpisode(rng.firstEpIdx);
												const stripEl = document.getElementById("mb-horizontal-ep-strip");
												const btnEl = document.getElementById(`mb-ep-tile-${rng.firstEpIdx}`);
												if (stripEl && btnEl) stripEl.scrollTo({
													left: Math.max(0, btnEl.offsetLeft - stripEl.offsetLeft - 12),
													behavior: "smooth"
												});
											},
											className: `h-7 px-2.5 rounded-lg text-xs font-semibold shrink-0 transition-colors cursor-pointer ${isActiveRange ? "bg-[#dc2626]/25 border border-[#dc2626]/60 text-[#ef4444]" : "bg-[#16181d] hover:bg-[#22252c] text-gray-300 border border-white/5"}`,
											children: rng.label
										}, rng.label);
									})]
								}), /* @__PURE__ */ _jsxs("div", {
									className: "flex items-center gap-2.5 py-0.5",
									children: [/* @__PURE__ */ _jsx("button", {
										type: "button",
										onClick: () => setShowAllEpisodesModal(true),
										className: "w-[54px] h-[48px] rounded-xl bg-[#1b1d21] hover:bg-[#25282e] text-white text-sm font-medium flex items-center justify-center shrink-0 transition-colors cursor-pointer",
										children: "All"
									}), /* @__PURE__ */ _jsxs("div", {
										id: "mb-horizontal-ep-strip",
										className: "flex items-center gap-2.5 overflow-x-auto no-scrollbar flex-1 py-0.5",
										children: [horizontalEpisodesSlice.map(({ ep, idx }) => {
											const isSelected = idx === selectedEpIdx;
											const rawBadge = formatEpisodeTileBadge(ep, idx);
											const badgeStr = rawBadge === "Movie" ? "01" : rawBadge;
											return /* @__PURE__ */ _jsx("button", {
												id: `mb-ep-tile-${idx}`,
												type: "button",
												onClick: () => handleSelectEpisode(idx),
												className: `min-w-[54px] h-[48px] px-3 rounded-xl text-sm font-semibold flex items-center justify-center shrink-0 transition-all cursor-pointer ${isSelected ? "bg-gradient-to-br from-[#dc2626]/30 to-[#7f1d1d]/35 border border-[#dc2626]/60 text-[#ef4444] font-bold shadow-[0_0_12px_rgba(220,38,38,0.2)]" : "bg-[#1b1d21] hover:bg-[#25282e] text-gray-200"}`,
												children: badgeStr
											}, ep.id || idx);
										}), (loading || !effectiveDetail?.uploadedBy) && episodes.length <= 1 && /* @__PURE__ */ _jsx("div", {
											className: "h-[48px] px-3.5 rounded-xl bg-[#1b1d21]/70 text-xs text-gray-400 flex items-center gap-2 shrink-0 animate-pulse",
											children: /* @__PURE__ */ _jsx("span", { children: "Loading all episodes..." })
										})]
									})]
								})]
							})
						]
					}),
					/* @__PURE__ */ _jsxs("section", {
						className: "pt-1 space-y-4",
						children: [
							/* @__PURE__ */ _jsxs("div", {
								className: "flex items-center gap-7 border-b border-white/[0.06]",
								children: [
									/* @__PURE__ */ _jsxs("button", {
										type: "button",
										onClick: () => setBottomTab("forYou"),
										className: "relative pb-2.5 text-base sm:text-lg font-extrabold transition-colors cursor-pointer",
										children: [/* @__PURE__ */ _jsx("span", {
											className: bottomTab === "forYou" ? "text-white" : "text-gray-400",
											children: "For you"
										}), bottomTab === "forYou" && /* @__PURE__ */ _jsx("span", { className: "absolute left-0 right-0 bottom-0 h-1 bg-white rounded-full" })]
									}),
									/* @__PURE__ */ _jsxs("button", {
										type: "button",
										onClick: () => setBottomTab("infoCast"),
										className: "relative pb-2.5 text-base sm:text-lg font-extrabold transition-colors cursor-pointer",
										children: [/* @__PURE__ */ _jsx("span", {
											className: bottomTab === "infoCast" ? "text-white" : "text-gray-400",
											children: "Info & Cast"
										}), bottomTab === "infoCast" && /* @__PURE__ */ _jsx("span", { className: "absolute left-0 right-0 bottom-0 h-1 bg-white rounded-full" })]
									}),
									/* @__PURE__ */ _jsxs("button", {
										type: "button",
										onClick: () => setBottomTab("reviews"),
										className: "relative pb-2.5 text-base sm:text-lg font-extrabold transition-colors cursor-pointer flex items-center gap-1.5",
										children: [
											/* @__PURE__ */ _jsx("span", {
												className: bottomTab === "reviews" ? "text-white" : "text-gray-400",
												children: "Reviews"
											}),
											/* @__PURE__ */ _jsxs("span", {
												className: "px-1.5 py-0.5 rounded-md bg-white/10 text-[11px] font-bold text-amber-400",
												children: ["★ ", displayRating]
											}),
											bottomTab === "reviews" && /* @__PURE__ */ _jsx("span", { className: "absolute left-0 right-0 bottom-0 h-1 bg-white rounded-full" })
										]
									})
								]
							}),
							bottomTab === "forYou" && /* @__PURE__ */ _jsx("div", {
								className: "grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2.5",
								children: relatedMovies.slice(0, 12).map((rawRel) => {
									const rel = normalizeMovieCardItem(rawRel);
									const shortLang = /bangla|bengali/i.test(rel.language) ? "Bangla" : /hindi/i.test(rel.language) ? "Hindi" : /korean/i.test(rel.language) ? "Korean" : /tamil|telugu/i.test(rel.language) ? "South" : "Hindi";
									return /* @__PURE__ */ _jsxs("button", {
										type: "button",
										onMouseEnter: () => prefetchMovieDetails(rel.path, rel.title, activeNodeId, true),
										onTouchStart: () => prefetchMovieDetails(rel.path, rel.title, activeNodeId, true),
										onClick: () => {
											if (modalContainerRef.current) modalContainerRef.current.scrollTo({
												top: 0,
												behavior: "smooth"
											});
											onSelectMovie(rel);
										},
										className: "group rounded-xl overflow-hidden bg-[#16181c] flex flex-col text-left transition-transform active:scale-95 cursor-pointer",
										children: [/* @__PURE__ */ _jsxs("div", {
											className: "relative aspect-[2/3] w-full bg-[#101216] overflow-hidden",
											children: [rel.poster && /* @__PURE__ */ _jsx("img", {
												src: rel.poster,
												alt: rel.title,
												referrerPolicy: "no-referrer",
												loading: "lazy",
												className: "w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
											}), /* @__PURE__ */ _jsx("span", {
												className: "absolute top-1.5 right-1.5 px-2 py-0.5 rounded bg-black/60 backdrop-blur-[2px] text-[10px] sm:text-[11px] font-medium text-white",
												children: shortLang
											})]
										}), /* @__PURE__ */ _jsx("div", {
											className: "px-2.5 py-2 bg-[#16181c]",
											children: /* @__PURE__ */ _jsx("div", {
												className: "text-xs sm:text-sm font-medium text-gray-100 truncate",
												children: rel.title
											})
										})]
									}, rel.path + rel.title);
								})
							}),
							bottomTab === "reviews" && /* @__PURE__ */ _jsxs("div", {
								className: "space-y-4 bg-[#121418] border border-white/10 rounded-xl p-4",
								children: [
									/* @__PURE__ */ _jsx("div", {
										className: "flex items-center justify-between",
										children: /* @__PURE__ */ _jsxs("div", { children: [/* @__PURE__ */ _jsxs("h3", {
											className: "text-sm font-bold text-white flex items-center gap-2",
											children: [/* @__PURE__ */ _jsx("span", { children: "Audience Reviews & Rating" }), /* @__PURE__ */ _jsxs("span", {
												className: "text-amber-400 font-extrabold",
												children: [
													"★ ",
													displayRating,
													"/10"
												]
											})]
										}), /* @__PURE__ */ _jsx("p", {
											className: "text-xs text-gray-400",
											children: "এই মুভি বা সিরিজটি আপনার কেমন লেগেছে জানান"
										})] })
									}),
									/* @__PURE__ */ _jsxs("form", {
										onSubmit: (e) => {
											e.preventDefault();
											const textTrimmed = userReviewText.trim();
											if (!textTrimmed) return;
											const key = movie.path || movie.title;
											const newEntry = {
												id: `rev-${Date.now()}`,
												author: userReviewName.trim() || "CinePulse Viewer",
												stars: userRatingStars,
												text: textTrimmed,
												date: "Just now"
											};
											setCustomReviewsMap((prev) => {
												const updated = {
													...prev,
													[key]: [newEntry, ...prev[key] || []]
												};
												try {
													localStorage.setItem("cp_moviebox_reviews_v1", JSON.stringify(updated));
												} catch {}
												return updated;
											});
											setUserReviewText("");
											triggerHud("toast", "আপনার রিভিউ যুক্ত হয়েছে!");
										},
										className: "space-y-2.5 bg-[#181b20] border border-white/10 rounded-xl p-3",
										children: [/* @__PURE__ */ _jsxs("div", {
											className: "flex items-center justify-between gap-2",
											children: [/* @__PURE__ */ _jsx("span", {
												className: "text-xs font-semibold text-gray-300",
												children: "আপনার রেটিং:"
											}), /* @__PURE__ */ _jsx("div", {
												className: "flex items-center gap-1",
												children: [
													1,
													2,
													3,
													4,
													5
												].map((star) => /* @__PURE__ */ _jsx("button", {
													type: "button",
													onClick: () => setUserRatingStars(star),
													className: `text-base cursor-pointer transition-transform active:scale-90 ${star <= userRatingStars ? "text-amber-400" : "text-gray-600"}`,
													children: "★"
												}, star))
											})]
										}), /* @__PURE__ */ _jsxs("div", {
											className: "flex flex-col sm:flex-row gap-2",
											children: [
												/* @__PURE__ */ _jsx("input", {
													type: "text",
													value: userReviewName,
													onChange: (e) => setUserReviewName(e.target.value),
													placeholder: "আপনার নাম (ঐচ্ছিক)",
													className: "sm:w-44 h-9 px-3 rounded-lg bg-[#121418] border border-white/10 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-[#dc2626]"
												}),
												/* @__PURE__ */ _jsx("input", {
													type: "text",
													value: userReviewText,
													onChange: (e) => setUserReviewText(e.target.value),
													placeholder: "মুভিটি কেমন লাগলো লিখুন...",
													className: "flex-1 h-9 px-3 rounded-lg bg-[#121418] border border-white/10 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-[#dc2626]"
												}),
												/* @__PURE__ */ _jsx("button", {
													type: "submit",
													className: "h-9 px-4 rounded-lg bg-[#dc2626] hover:bg-[#b91c1c] text-white text-xs font-bold shrink-0 cursor-pointer transition-colors",
													children: "Post Review"
												})
											]
										})]
									}),
									/* @__PURE__ */ _jsx("div", {
										className: "space-y-2.5 max-h-72 overflow-y-auto pr-1",
										children: [...customReviewsMap[movie.path || movie.title] || [], ...(effectiveDetail?.reviews || []).map((r, i) => ({
											id: `srv-rev-${i}`,
											author: r.author || "CinePulse Viewer",
											stars: Math.min(5, Math.max(1, Math.round((Number(r.rating) || 9) / 2))),
											text: r.text,
											date: r.date || "Verified Viewer"
										}))].map((rev) => /* @__PURE__ */ _jsxs("div", {
											className: "p-3 rounded-xl bg-[#181b20] border border-white/5 space-y-1",
											children: [/* @__PURE__ */ _jsxs("div", {
												className: "flex items-center justify-between text-xs",
												children: [/* @__PURE__ */ _jsx("span", {
													className: "font-bold text-gray-100",
													children: rev.author
												}), /* @__PURE__ */ _jsxs("span", {
													className: "text-amber-400 font-bold",
													children: ["★".repeat(rev.stars || 5), /* @__PURE__ */ _jsx("span", {
														className: "text-gray-500 font-normal ml-1.5 text-[10px]",
														children: rev.date
													})]
												})]
											}), /* @__PURE__ */ _jsx("p", {
												className: "text-xs text-gray-300 leading-relaxed",
												children: rev.text
											})]
										}, rev.id))
									})
								]
							}),
							bottomTab === "infoCast" && /* @__PURE__ */ _jsxs("div", {
								className: "space-y-4 bg-[#121418] border border-white/10 rounded-xl p-4",
								children: [
									/* @__PURE__ */ _jsxs("div", {
										className: "flex items-center justify-between",
										children: [/* @__PURE__ */ _jsx("h3", {
											className: "text-sm font-bold text-white",
											children: "Synopsis, Cast & Stills"
										}), /* @__PURE__ */ _jsx("button", {
											type: "button",
											onClick: () => setBottomTab("forYou"),
											className: "text-xs text-[#ef4444] font-bold cursor-pointer",
											children: "Back to For You"
										})]
									}),
									/* @__PURE__ */ _jsx("p", {
										className: "text-xs sm:text-sm text-gray-300 leading-relaxed",
										children: effectiveDetail?.storyline || `${effectiveDetail?.title || movie.title} (${displayYear}) — Stream in Full HD with crystal clear audio on CinePulse.`
									}),
									combinedCast.length > 0 && /* @__PURE__ */ _jsxs("div", {
										className: "space-y-2 pt-1",
										children: [/* @__PURE__ */ _jsx("div", {
											className: "text-xs font-bold text-gray-400 uppercase tracking-wider",
											children: "Cast & Crew"
										}), /* @__PURE__ */ _jsx("div", {
											className: "flex items-center gap-3 overflow-x-auto no-scrollbar pt-1",
											children: combinedCast.map((actor, idx) => /* @__PURE__ */ _jsxs("button", {
												type: "button",
												onClick: () => {
													onClose();
													onSearchByActor(actor.name);
												},
												className: "w-20 shrink-0 flex flex-col items-center text-center cursor-pointer",
												children: [/* @__PURE__ */ _jsx("div", {
													className: "w-14 h-14 rounded-full overflow-hidden bg-[#1b1d21] border border-white/10 mb-1.5",
													children: actor.photo ? /* @__PURE__ */ _jsx("img", {
														src: actor.photo,
														alt: actor.name,
														referrerPolicy: "no-referrer",
														className: "w-full h-full object-cover"
													}) : /* @__PURE__ */ _jsx("div", {
														className: "w-full h-full flex items-center justify-center text-gray-400 font-bold text-xs",
														children: actor.name.charAt(0)
													})
												}), /* @__PURE__ */ _jsx("span", {
													className: "text-[11px] font-semibold text-white truncate w-full",
													children: actor.name
												})]
											}, idx))
										})]
									}),
									combinedScreenshots.length > 0 && /* @__PURE__ */ _jsxs("div", {
										className: "space-y-2 pt-1",
										children: [
											/* @__PURE__ */ _jsx("div", {
												className: "text-xs font-bold text-gray-400 uppercase tracking-wider",
												children: "HD Screenshots"
											}),
											/* @__PURE__ */ _jsx("div", {
												className: "grid grid-cols-2 sm:grid-cols-3 gap-2",
												children: (showAllScreenshots ? combinedScreenshots : combinedScreenshots.slice(0, 6)).map((shotUrl, idx) => /* @__PURE__ */ _jsx("button", {
													type: "button",
													onClick: () => setLightboxImage(shotUrl),
													className: "relative aspect-video rounded-lg overflow-hidden bg-[#1b1d21] border border-white/10 group cursor-pointer",
													children: /* @__PURE__ */ _jsx("img", {
														src: shotUrl,
														alt: `Scene ${idx + 1}`,
														referrerPolicy: "no-referrer",
														loading: "lazy",
														className: "w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
													})
												}, idx))
											}),
											combinedScreenshots.length > 6 && /* @__PURE__ */ _jsx("button", {
												type: "button",
												onClick: () => setShowAllScreenshots((v) => !v),
												className: "text-xs font-bold text-[#ef4444] hover:underline cursor-pointer",
												children: showAllScreenshots ? "Show Less" : `View All Screenshots (${combinedScreenshots.length})`
											})
										]
									})
								]
							})
						]
					}),
					showDownloadSheet && /* @__PURE__ */ _jsx("div", {
						onClick: () => setShowDownloadSheet(false),
						className: "fixed inset-0 z-50 bg-black/85 backdrop-blur-xs flex items-end sm:items-center justify-center p-3 sm:p-4",
						children: /* @__PURE__ */ _jsxs("div", {
							onClick: (e) => e.stopPropagation(),
							className: "bg-[#121418] border border-white/15 rounded-2xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden shadow-2xl",
							children: [/* @__PURE__ */ _jsxs("div", {
								className: "p-4 border-b border-white/10 flex items-center justify-between",
								children: [/* @__PURE__ */ _jsxs("h3", {
									className: "text-base font-bold text-white flex items-center gap-2",
									children: [/* @__PURE__ */ _jsx(Download, { className: "w-4 h-4 text-[#ef4444]" }), /* @__PURE__ */ _jsx("span", { children: "Direct High-Speed Downloads" })]
								}), /* @__PURE__ */ _jsx("button", {
									type: "button",
									onClick: () => setShowDownloadSheet(false),
									className: "w-8 h-8 rounded-lg bg-[#1b1d21] text-gray-300 flex items-center justify-center cursor-pointer",
									children: /* @__PURE__ */ _jsx(X, { className: "w-4 h-4" })
								})]
							}), /* @__PURE__ */ _jsx("div", {
								className: "p-4 overflow-y-auto space-y-2.5",
								children: combinedDownloads.length > 0 ? combinedDownloads.map((dl, idx) => /* @__PURE__ */ _jsxs("a", {
									href: dl.url,
									target: "_blank",
									rel: "noopener noreferrer",
									className: "w-full px-4 py-3 rounded-xl bg-[#1b1d21] hover:bg-[#25282e] border border-white/10 flex items-center justify-between gap-3 transition-colors",
									children: [/* @__PURE__ */ _jsxs("div", {
										className: "min-w-0",
										children: [/* @__PURE__ */ _jsx("div", {
											className: "text-sm font-bold text-white truncate",
											children: dl.label
										}), dl.subLabel && /* @__PURE__ */ _jsx("div", {
											className: "text-[11px] text-gray-400 truncate",
											children: dl.subLabel
										})]
									}), /* @__PURE__ */ _jsx(Download, { className: "w-4 h-4 text-[#ef4444] shrink-0" })]
								}, idx)) : /* @__PURE__ */ _jsx("p", {
									className: "text-xs text-gray-400 text-center py-4",
									children: "Direct download links are preparing for this title."
								})
							})]
						})
					}),
					showAllEpisodesModal && /* @__PURE__ */ _jsx("div", {
						onClick: () => setShowAllEpisodesModal(false),
						className: "fixed inset-0 z-50 bg-black/90 backdrop-blur-xs flex items-center justify-center p-4",
						children: /* @__PURE__ */ _jsxs("div", {
							onClick: (e) => e.stopPropagation(),
							className: "bg-[#121418] border border-white/15 rounded-2xl w-full max-w-2xl max-h-[82vh] flex flex-col overflow-hidden shadow-2xl",
							children: [/* @__PURE__ */ _jsxs("div", {
								className: "p-4 border-b border-white/10 space-y-3",
								children: [/* @__PURE__ */ _jsxs("div", {
									className: "flex items-center justify-between",
									children: [/* @__PURE__ */ _jsxs("h3", {
										className: "text-base font-bold text-white",
										children: [
											"All Episodes (",
											filteredEpisodesWithIdx.length,
											")"
										]
									}), /* @__PURE__ */ _jsxs("div", {
										className: "flex items-center gap-2",
										children: [/* @__PURE__ */ _jsxs("button", {
											type: "button",
											onClick: () => setEpisodeSortOrder((s) => s === "asc" ? "desc" : "asc"),
											className: "h-8 px-2.5 rounded-lg bg-[#1b1d21] hover:bg-[#25282e] border border-white/10 text-xs font-semibold text-gray-200 flex items-center gap-1.5 cursor-pointer",
											children: [/* @__PURE__ */ _jsx(ArrowUpDown, { className: "w-3.5 h-3.5 text-[#ef4444]" }), /* @__PURE__ */ _jsx("span", { children: episodeSortOrder === "asc" ? "1 → Last" : "Last → 1" })]
										}), /* @__PURE__ */ _jsx("button", {
											type: "button",
											onClick: () => setShowAllEpisodesModal(false),
											className: "w-8 h-8 rounded-lg bg-[#1b1d21] hover:bg-[#25282e] text-gray-300 flex items-center justify-center cursor-pointer",
											children: /* @__PURE__ */ _jsx(X, { className: "w-4 h-4" })
										})]
									})]
								}), episodes.length > 6 && /* @__PURE__ */ _jsxs("div", {
									className: "relative",
									children: [
										/* @__PURE__ */ _jsx(Search, { className: "w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" }),
										/* @__PURE__ */ _jsx("input", {
											type: "text",
											value: episodeSearchQuery,
											onChange: (e) => setEpisodeSearchQuery(e.target.value),
											placeholder: "Search episode number (e.g. 12, 45)...",
											className: "w-full h-9 pl-8 pr-8 rounded-lg bg-[#1b1d21] border border-white/10 text-xs text-white placeholder-gray-400 focus:outline-none focus:border-[#dc2626]"
										}),
										episodeSearchQuery && /* @__PURE__ */ _jsx("button", {
											type: "button",
											onClick: () => setEpisodeSearchQuery(""),
											className: "absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white",
											children: /* @__PURE__ */ _jsx(X, { className: "w-3.5 h-3.5" })
										})
									]
								})]
							}), /* @__PURE__ */ _jsx("div", {
								className: "p-4 overflow-y-auto grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2.5",
								children: filteredEpisodesWithIdx.map(({ ep, idx }) => {
									const isSelected = idx === selectedEpIdx;
									const rawBadge = formatEpisodeTileBadge(ep, idx);
									return /* @__PURE__ */ _jsx("button", {
										type: "button",
										onClick: () => {
											handleSelectEpisode(idx);
											setShowAllEpisodesModal(false);
										},
										className: `h-12 px-2 rounded-xl text-sm font-semibold flex items-center justify-center transition-colors cursor-pointer ${isSelected ? "bg-gradient-to-br from-[#dc2626]/30 to-[#7f1d1d]/35 border border-[#dc2626]/60 text-[#ef4444] font-bold" : "bg-[#1b1d21] hover:bg-[#25282e] text-gray-200"}`,
										children: rawBadge === "Movie" ? "01" : rawBadge
									}, ep.id || idx);
								})
							})]
						})
					}),
					lightboxImage && /* @__PURE__ */ _jsxs("div", {
						onClick: () => setLightboxImage(null),
						className: "fixed inset-0 z-50 bg-black/95 backdrop-blur-xs flex items-center justify-center p-4",
						children: [/* @__PURE__ */ _jsx("button", {
							type: "button",
							onClick: () => setLightboxImage(null),
							className: "absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center",
							children: /* @__PURE__ */ _jsx(X, { className: "w-6 h-6" })
						}), /* @__PURE__ */ _jsx("img", {
							src: lightboxImage,
							alt: "Screenshot Fullview",
							referrerPolicy: "no-referrer",
							className: "max-w-full max-h-[90vh] object-contain rounded-lg border border-white/15 shadow-2xl"
						})]
					})
				]
			})]
		})]
	});
};