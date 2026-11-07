// @ts-nocheck
import React from "react";
import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { ArrowUpDown, Bell, BookOpen, Bookmark, Calendar, Captions, Check, ChevronDown, ChevronLeft, ChevronRight, CircleCheck, Clock, Copy, Download, FastForward, Film, Flame, FolderHeart, Globe, History, House, Layers, ListPlus, LoaderCircle, Maximize2, Maximize, MessageSquarePlus, Mic, Minimize2, Minimize, Pause, PictureInPicture2, Play, RefreshCw, RotateCcw, RotateCw, ScanLine, Search, Send, Server, Settings, Share2, Share, SlidersHorizontal, Smartphone, Sparkles, SquarePlus, Star, Sun, Trash2, Trophy, Tv, Upload, User, Volume2, VolumeX, WifiOff, X } from "lucide-react";
import { universalApiFetch } from "../services/liveClientEngine";
// src/components/MovieRequestModal.tsx
export function getUploaderSiteInfo(_path) {
	return {
		id: "MOVIEBOX",
		name: "CinePulse HD",
		uploaderText: "CinePulse HD",
		badgeClass: "bg-emerald-600/90 text-white border-emerald-400/50"
	};
}
var EN_TO_BN_DIGITS = {
	"0": "০",
	"1": "১",
	"2": "২",
	"3": "৩",
	"4": "৪",
	"5": "৫",
	"6": "৬",
	"7": "৭",
	"8": "৮",
	"9": "৯"
};
function toBengaliNumber(val) {
	return String(val).replace(/[0-9]/g, (d) => EN_TO_BN_DIGITS[d] || d);
}
function hashItemKey(str) {
	let h = 2166136261;
	for (let i = 0; i < str.length; i++) {
		h ^= str.charCodeAt(i);
		h = Math.imul(h, 16777619) >>> 0;
	}
	return h >>> 0;
}
function getExactBengaliUploadTime(item, idx, nowMs) {
	const baseMins = getItemMinutesAgo(item, idx, nowMs);
	const h = hashItemKey(`${item.path || item.id}::${item.title}`);
	const uniqueOffset = baseMins >= 45 ? h % 37 : h % 9;
	const exactMinutesAgo = Math.max(2, Math.min(1435, baseMins + uniqueOffset));
	const uploadEpoch = nowMs - exactMinutesAgo * 6e4;
	const uploadDate = new Date(uploadEpoch);
	const nowDate = new Date(nowMs);
	const isSameDay = uploadDate.getDate() === nowDate.getDate() && uploadDate.getMonth() === nowDate.getMonth() && uploadDate.getFullYear() === nowDate.getFullYear();
	const hours24 = uploadDate.getHours();
	let periodBn = "রাত";
	if (hours24 >= 4 && hours24 < 6) periodBn = "ভোর";
	else if (hours24 >= 6 && hours24 < 12) periodBn = "সকাল";
	else if (hours24 >= 12 && hours24 < 15) periodBn = "দুপুর";
	else if (hours24 >= 15 && hours24 < 18) periodBn = "বিকাল";
	else if (hours24 >= 18 && hours24 < 20) periodBn = "সন্ধ্যা";
	const hour12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
	const min2 = String(uploadDate.getMinutes()).padStart(2, "0");
	const amPm = hours24 >= 12 ? "PM" : "AM";
	const timeBn = `${toBengaliNumber(String(hour12).padStart(2, "0"))}:${toBengaliNumber(min2)} ${amPm}`;
	const dayPrefix = isSameDay ? `আজ ${periodBn}` : `গতকাল ${periodBn}`;
	const agoBn = exactMinutesAgo < 60 ? `${toBengaliNumber(exactMinutesAgo)} মি. আগে` : `${toBengaliNumber(Math.floor(exactMinutesAgo / 60))} ঘণ্টা ${exactMinutesAgo % 60 > 0 ? `${toBengaliNumber(exactMinutesAgo % 60)} মি. ` : ""}আগে`;
	return {
		exactMinutesAgo,
		clockBn: `${dayPrefix} ${timeBn}`,
		agoBn
	};
}
export var MovieRequestModal = ({ isOpen, initialTitle = "", initialType = "MOVIE", activeNodeId, onSelectNode, onClose, last24hItems = [], liveClockNow = Date.now(), isRefreshing24h = false, onRefresh24h, onSelectMovie, continueWatching = [], onClearWatchHistory }) => {
	const [activeModalTab, setActiveModalTab] = React.useState("UPLOADS_24H");
	const [siteFilter, setSiteFilter] = React.useState("ALL");
	const [justRefreshed, setJustRefreshed] = React.useState(false);
	const [reqTitle, setReqTitle] = React.useState(initialTitle);
	const [reqType, setReqType] = React.useState(initialType);
	const [reqLanguage, setReqLanguage] = React.useState("Bangla Dubbed / Dual Audio");
	const [reqNotes, setReqNotes] = React.useState("");
	const [submittingReq, setSubmittingReq] = React.useState(false);
	const [reqSubmittedMsg, setReqSubmittedMsg] = React.useState("");
	const [communityRequests, setCommunityRequests] = React.useState([]);
	React.useEffect(() => {
		if (!isOpen) return;
		if (initialTitle) {
			setReqTitle(initialTitle);
			setReqType(initialType || "BROKEN_LINK");
			setActiveModalTab("REQUEST_FORM");
		}
		universalApiFetch("/api/requests").then((res) => {
			if (res?.ok && Array.isArray(res.requests)) setCommunityRequests(res.requests);
		}).catch(() => {});
	}, [
		isOpen,
		initialTitle,
		initialType
	]);
	const siteCounts = React.useMemo(() => {
		let mb = 0;
		let mlbd = 0;
		let mf = 0;
		for (const item of last24hItems) {
			const info = getUploaderSiteInfo(item.path);
			if (info.id === "MOVIEBOX") mb++;
			else if (info.id === "MYFLIX") mf++;
			else mlbd++;
		}
		return {
			total: last24hItems.length,
			mb,
			mlbd,
			mf
		};
	}, [last24hItems]);
	const filtered24h = React.useMemo(() => {
		return (siteFilter === "ALL" ? last24hItems : last24hItems.filter((i) => getUploaderSiteInfo(i.path).id === siteFilter)).map((item, idx) => ({
			item,
			timeInfo: getExactBengaliUploadTime(item, idx, liveClockNow)
		})).sort((a, b) => a.timeInfo.exactMinutesAgo - b.timeInfo.exactMinutesAgo);
	}, [
		last24hItems,
		siteFilter,
		liveClockNow
	]);
	if (!isOpen) return null;
	const handleTriggerRefresh = () => {
		if (onRefresh24h) {
			onRefresh24h();
			setJustRefreshed(true);
			window.setTimeout(() => setJustRefreshed(false), 2e3);
		}
	};
	const handleSubmitRequest = async (e) => {
		e.preventDefault();
		const trimmed = reqTitle.trim();
		if (!trimmed || submittingReq) return;
		setSubmittingReq(true);
		setReqSubmittedMsg("");
		try {
			const res = await universalApiFetch("/api/requests", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					title: trimmed,
					type: reqType,
					language: reqLanguage,
					notes: reqNotes.trim()
				})
			});
			if (res?.ok) {
				if (Array.isArray(res.requests)) setCommunityRequests(res.requests);
				setReqTitle("");
				setReqNotes("");
				setReqSubmittedMsg("আপনার রিকোয়েস্ট সফলভাবে যুক্ত হয়েছে!");
				window.setTimeout(() => setReqSubmittedMsg(""), 3500);
			}
		} catch {} finally {
			setSubmittingReq(false);
		}
	};
	return /* @__PURE__ */ _jsx("div", {
		className: "fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-end sm:items-center justify-center sm:p-4",
		onClick: (e) => {
			if (e.target === e.currentTarget) onClose();
		},
		children: /* @__PURE__ */ _jsxs("div", {
			className: "bg-[#111319] border-t sm:border border-white/15 rounded-t-3xl sm:rounded-3xl w-full max-w-xl max-h-[85dvh] flex flex-col overflow-hidden px-4 pt-4 pb-5 shadow-2xl",
			children: [
				/* @__PURE__ */ _jsxs("div", {
					className: "shrink-0 flex items-center justify-between gap-2 border-b border-white/[0.08] pb-3",
					children: [/* @__PURE__ */ _jsxs("div", {
						className: "flex items-center gap-2 min-w-0",
						children: [
							/* @__PURE__ */ _jsx(Clock, { className: "w-4 h-4 text-[#ef4444] shrink-0" }),
							/* @__PURE__ */ _jsx("h3", {
								className: "text-sm font-extrabold text-white truncate",
								children: activeModalTab === "UPLOADS_24H" ? "Last 24 Hours · CinePulse HD নতুন আপলোড" : "মুভি রিকোয়েস্ট ও লিংক রিপোর্ট"
							}),
							/* @__PURE__ */ _jsx("span", {
								className: "px-2 py-0.5 rounded-full bg-[#dc2626] text-white text-[10px] font-black font-mono tabular-nums shrink-0",
								children: activeModalTab === "UPLOADS_24H" ? siteCounts.total : communityRequests.length
							})
						]
					}), /* @__PURE__ */ _jsxs("div", {
						className: "flex items-center gap-1.5 shrink-0",
						children: [activeModalTab === "UPLOADS_24H" && /* @__PURE__ */ _jsxs("button", {
							type: "button",
							onClick: handleTriggerRefresh,
							disabled: isRefreshing24h,
							className: "h-8 px-3 rounded-lg bg-[#dc2626] hover:bg-[#b91c1c] text-white text-xs font-extrabold flex items-center gap-1.5 active:scale-95 transition-all",
							children: [/* @__PURE__ */ _jsx(RefreshCw, { className: `w-3.5 h-3.5 ${isRefreshing24h ? "animate-spin" : ""}` }), /* @__PURE__ */ _jsx("span", { children: justRefreshed ? "আপডেট ✓" : "রিফ্রেশ" })]
						}), /* @__PURE__ */ _jsx("button", {
							type: "button",
							onClick: onClose,
							"aria-label": "Close",
							className: "h-8 w-8 rounded-lg bg-white/10 hover:bg-white/15 text-slate-200 flex items-center justify-center transition-colors",
							children: /* @__PURE__ */ _jsx(X, { className: "w-4 h-4" })
						})]
					})]
				}),
				/* @__PURE__ */ _jsxs("div", {
					className: "shrink-0 grid grid-cols-2 gap-2 pt-2.5 pb-2 border-b border-white/[0.06]",
					children: [/* @__PURE__ */ _jsxs("button", {
						type: "button",
						onClick: () => setActiveModalTab("UPLOADS_24H"),
						className: `h-9 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 border transition-all ${activeModalTab === "UPLOADS_24H" ? "bg-[#dc2626] text-white border-[#ef4444]" : "bg-[#171a22] text-gray-300 border-white/10 hover:text-white"}`,
						children: [/* @__PURE__ */ _jsx(Clock, { className: "w-3.5 h-3.5" }), /* @__PURE__ */ _jsxs("span", { children: [
							"Last 24h নতুন আপলোড (",
							siteCounts.total,
							")"
						] })]
					}), /* @__PURE__ */ _jsxs("button", {
						type: "button",
						onClick: () => setActiveModalTab("REQUEST_FORM"),
						className: `h-9 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 border transition-all ${activeModalTab === "REQUEST_FORM" ? "bg-[#dc2626] text-white border-[#ef4444]" : "bg-[#171a22] text-gray-300 border-white/10 hover:text-white"}`,
						children: [/* @__PURE__ */ _jsx(MessageSquarePlus, { className: "w-3.5 h-3.5" }), /* @__PURE__ */ _jsx("span", { children: "মুভি রিকোয়েস্ট / রিপোর্ট" })]
					})]
				}),
				activeModalTab === "UPLOADS_24H" ? /* @__PURE__ */ _jsxs(_Fragment, { children: [/* @__PURE__ */ _jsx("div", {
					className: "shrink-0 flex items-center gap-2 overflow-x-auto no-scrollbar py-2.5 border-b border-white/[0.06]",
					children: [{
						id: "ALL",
						label: "CinePulse HD (সকল নতুন আপলোড)",
						count: siteCounts.total
					}].map((tab) => /* @__PURE__ */ _jsxs("button", {
						type: "button",
						onClick: () => setSiteFilter("ALL"),
						className: "h-8 px-3 rounded-xl text-xs font-extrabold whitespace-nowrap shrink-0 flex items-center gap-1.5 border transition-all bg-emerald-600 text-white border-emerald-400 shadow-[0_2px_10px_rgba(16,185,129,0.4)]",
						children: [/* @__PURE__ */ _jsx("span", { children: tab.label }), /* @__PURE__ */ _jsxs("span", {
							className: "text-[11px] opacity-90 font-mono",
							children: [
								"(",
								tab.count,
								")"
							]
						})]
					}, tab.id))
				}), /* @__PURE__ */ _jsx("div", {
					className: "min-h-0 flex-1 divide-y divide-white/[0.06] overflow-y-auto pt-1 pb-6 pr-0.5",
					children: filtered24h.map(({ item, timeInfo }, idx) => {
						const site = getUploaderSiteInfo(item.path);
						return /* @__PURE__ */ _jsxs("button", {
							type: "button",
							onClick: () => {
								if (onSelectMovie) {
									onClose();
									onSelectMovie(item);
								}
							},
							className: "w-full py-2.5 px-1.5 hover:bg-white/[0.06] rounded-xl flex items-center gap-3 text-left transition-colors",
							children: [
								/* @__PURE__ */ _jsx("div", {
									className: "w-10 h-14 rounded-lg overflow-hidden bg-[#161922] shrink-0 border border-white/10",
									children: item.poster ? /* @__PURE__ */ _jsx("img", {
										src: item.poster,
										alt: item.title,
										referrerPolicy: "no-referrer",
										loading: "lazy",
										className: "w-full h-full object-cover"
									}) : /* @__PURE__ */ _jsx("div", {
										className: "w-full h-full flex items-center justify-center",
										children: /* @__PURE__ */ _jsx(Film, { className: "w-4 h-4 text-gray-500" })
									})
								}),
								/* @__PURE__ */ _jsxs("div", {
									className: "min-w-0 flex-1",
									children: [
										/* @__PURE__ */ _jsxs("div", {
											className: "flex flex-wrap items-center gap-1.5",
											children: [
												/* @__PURE__ */ _jsx("span", {
													className: `px-1.5 py-0.5 rounded text-[9px] font-extrabold border ${site.badgeClass}`,
													children: site.uploaderText
												}),
												/* @__PURE__ */ _jsx("span", {
													className: "text-[10px] text-amber-300 font-semibold",
													children: timeInfo.clockBn
												}),
												/* @__PURE__ */ _jsxs("span", {
													className: "text-[10px] text-emerald-400 font-bold",
													children: ["• ", timeInfo.agoBn]
												})
											]
										}),
										/* @__PURE__ */ _jsx("div", {
											className: "text-xs sm:text-sm font-bold text-white truncate mt-1",
											children: item.title
										}),
										/* @__PURE__ */ _jsxs("div", {
											className: "text-[10px] text-gray-400 truncate mt-0.5",
											children: [
												item.episodePill ? `${item.episodePill} · ` : "",
												item.quality || "1080p HD",
												" · ",
												item.language || "Multi Audio"
											]
										})
									]
								}),
								/* @__PURE__ */ _jsx("div", {
									className: "w-7 h-7 rounded-full bg-[#dc2626]/20 border border-[#dc2626]/40 flex items-center justify-center shrink-0 mr-1",
									children: /* @__PURE__ */ _jsx(Play, { className: "w-3.5 h-3.5 text-[#ef4444] fill-current ml-0.5" })
								})
							]
						}, `${item.path}-${idx}`);
					})
				})] }) : /* @__PURE__ */ _jsxs("div", {
					className: "min-h-0 flex-1 overflow-y-auto pt-3 pb-6 space-y-4 pr-0.5",
					children: [
						/* @__PURE__ */ _jsxs("form", {
							onSubmit: handleSubmitRequest,
							className: "bg-[#161922] border border-white/10 rounded-2xl p-3.5 space-y-3",
							children: [
								/* @__PURE__ */ _jsx("div", {
									className: "grid grid-cols-4 gap-1.5",
									children: [
										{
											id: "MOVIE",
											label: "Movie"
										},
										{
											id: "SERIES",
											label: "Series"
										},
										{
											id: "ANIME",
											label: "Anime"
										},
										{
											id: "BROKEN_LINK",
											label: "Broken Link"
										}
									].map((t) => /* @__PURE__ */ _jsx("button", {
										type: "button",
										onClick: () => setReqType(t.id),
										className: `h-8 rounded-lg text-[11px] font-bold border transition-all ${reqType === t.id ? "bg-[#dc2626] text-white border-[#ef4444]" : "bg-[#0e1017] text-gray-300 border-white/10 hover:text-white"}`,
										children: t.label
									}, t.id))
								}),
								/* @__PURE__ */ _jsxs("div", { children: [/* @__PURE__ */ _jsx("label", {
									className: "block text-[11px] font-bold text-gray-300 mb-1",
									children: "মুভি / সিরিজের নাম (Title & Year)"
								}), /* @__PURE__ */ _jsx("input", {
									type: "text",
									value: reqTitle,
									onChange: (e) => setReqTitle(e.target.value),
									placeholder: "যেমন: Pushpa 2 (2025) Bangla Dubbed...",
									required: true,
									className: "w-full h-9 px-3 rounded-xl bg-[#0c0e14] border border-white/15 text-xs text-white placeholder:text-gray-500 focus:outline-none focus:border-[#ef4444]"
								})] }),
								/* @__PURE__ */ _jsxs("div", {
									className: "grid grid-cols-1 sm:grid-cols-2 gap-2.5",
									children: [/* @__PURE__ */ _jsxs("div", { children: [/* @__PURE__ */ _jsx("label", {
										className: "block text-[11px] font-bold text-gray-300 mb-1",
										children: "পছন্দের অডিও / ভাষা"
									}), /* @__PURE__ */ _jsxs("select", {
										value: reqLanguage,
										onChange: (e) => setReqLanguage(e.target.value),
										className: "w-full h-9 px-2.5 rounded-xl bg-[#0c0e14] border border-white/15 text-xs text-white focus:outline-none focus:border-[#ef4444]",
										children: [
											/* @__PURE__ */ _jsx("option", {
												value: "Bangla Dubbed / Dual Audio",
												children: "Bangla Dubbed / Dual Audio"
											}),
											/* @__PURE__ */ _jsx("option", {
												value: "Hindi Dubbed",
												children: "Hindi Dubbed"
											}),
											/* @__PURE__ */ _jsx("option", {
												value: "Original + Bangla Sub",
												children: "Original + Bangla Sub"
											}),
											/* @__PURE__ */ _jsx("option", {
												value: "1080p Full HD",
												children: "1080p Full HD"
											})
										]
									})] }), /* @__PURE__ */ _jsxs("div", { children: [/* @__PURE__ */ _jsx("label", {
										className: "block text-[11px] font-bold text-gray-300 mb-1",
										children: "অতিরিক্ত নোট (ঐচ্ছিক)"
									}), /* @__PURE__ */ _jsx("input", {
										type: "text",
										value: reqNotes,
										onChange: (e) => setReqNotes(e.target.value),
										placeholder: "যেমন: Episode 5 বা 1080p লিংক...",
										className: "w-full h-9 px-3 rounded-xl bg-[#0c0e14] border border-white/15 text-xs text-white placeholder:text-gray-500 focus:outline-none focus:border-[#ef4444]"
									})] })]
								}),
								reqSubmittedMsg && /* @__PURE__ */ _jsxs("div", {
									className: "flex items-center gap-1.5 text-xs font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-3 py-2",
									children: [/* @__PURE__ */ _jsx(CircleCheck, { className: "w-4 h-4 shrink-0" }), /* @__PURE__ */ _jsx("span", { children: reqSubmittedMsg })]
								}),
								/* @__PURE__ */ _jsxs("button", {
									type: "submit",
									disabled: submittingReq || !reqTitle.trim(),
									className: "w-full h-9 rounded-xl bg-[#dc2626] hover:bg-[#b91c1c] disabled:opacity-50 text-white text-xs font-extrabold flex items-center justify-center gap-1.5 transition-all",
									children: [/* @__PURE__ */ _jsx(Send, { className: "w-3.5 h-3.5" }), /* @__PURE__ */ _jsx("span", { children: submittingReq ? "সাবমিট হচ্ছে..." : reqType === "BROKEN_LINK" ? "লিংক রিপোর্ট পাঠান" : "মুভি রিকোয়েস্ট পাঠান" })]
								})
							]
						}),
						/* @__PURE__ */ _jsxs("div", {
							className: "bg-[#161922] border border-white/10 rounded-2xl p-3 space-y-2.5",
							children: [/* @__PURE__ */ _jsxs("div", {
								className: "flex items-center justify-between",
								children: [/* @__PURE__ */ _jsxs("span", {
									className: "text-xs font-bold text-white flex items-center gap-1.5",
									children: [/* @__PURE__ */ _jsx(Server, { className: "w-3.5 h-3.5 text-[#ef4444]" }), /* @__PURE__ */ _jsx("span", { children: "অ্যাক্টিভ সার্ভার নোড" })]
								}), continueWatching.length > 0 && onClearWatchHistory && /* @__PURE__ */ _jsxs("button", {
									type: "button",
									onClick: onClearWatchHistory,
									className: "text-[11px] font-bold text-red-400 hover:text-red-300 flex items-center gap-1",
									children: [/* @__PURE__ */ _jsx(Trash2, { className: "w-3 h-3" }), /* @__PURE__ */ _jsxs("span", { children: [
										"হিস্ট্রি ক্লিয়ার (",
										continueWatching.length,
										")"
									] })]
								})]
							}), /* @__PURE__ */ _jsx("div", {
								className: "grid grid-cols-1 gap-1.5",
								children: [{
									id: "node-moviebox",
									label: "CinePulse HD (Official Global 4K/1080p Server)"
								}].map((nd) => /* @__PURE__ */ _jsx("button", {
									type: "button",
									onClick: () => onSelectNode(nd.id),
									className: "h-8 rounded-lg text-[11px] font-bold border transition-all bg-emerald-600/90 text-white border-emerald-400",
									children: nd.label
								}, nd.id))
							})]
						}),
						/* @__PURE__ */ _jsxs("div", {
							className: "space-y-2",
							children: [/* @__PURE__ */ _jsxs("h4", {
								className: "text-xs font-extrabold text-gray-300 px-1",
								children: [
									"সাম্প্রতিক ইউজার রিকোয়েস্ট ও স্ট্যাটাস (",
									communityRequests.length,
									")"
								]
							}), /* @__PURE__ */ _jsx("div", {
								className: "divide-y divide-white/[0.06] bg-[#161922] border border-white/10 rounded-2xl overflow-hidden",
								children: communityRequests.map((req) => /* @__PURE__ */ _jsxs("div", {
									className: "p-3 flex items-center justify-between gap-2",
									children: [/* @__PURE__ */ _jsxs("div", {
										className: "min-w-0",
										children: [/* @__PURE__ */ _jsxs("div", {
											className: "flex items-center gap-1.5",
											children: [/* @__PURE__ */ _jsx("span", {
												className: "px-1.5 py-0.5 rounded bg-white/10 text-[9px] font-extrabold text-gray-200",
												children: req.type
											}), /* @__PURE__ */ _jsx("span", {
												className: "text-xs font-bold text-white truncate",
												children: req.title
											})]
										}), /* @__PURE__ */ _jsxs("p", {
											className: "text-[10px] text-gray-400 mt-0.5 truncate",
											children: [
												req.language,
												" ",
												req.notes ? `• ${req.notes}` : ""
											]
										})]
									}), /* @__PURE__ */ _jsx("span", {
										className: `px-2 py-0.5 rounded-full text-[10px] font-extrabold shrink-0 ${req.status === "Processing" ? "bg-amber-500/20 text-amber-300 border border-amber-500/30" : "bg-blue-500/20 text-blue-300 border border-blue-500/30"}`,
										children: req.status
									})]
								}, req.id))
							})]
						})
					]
				})
			]
		})
	});
};