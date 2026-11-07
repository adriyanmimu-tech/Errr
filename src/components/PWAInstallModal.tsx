// @ts-nocheck
import React from "react";
import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { ArrowUpDown, Bell, BookOpen, Bookmark, Calendar, Captions, Check, ChevronDown, ChevronLeft, ChevronRight, CircleCheck, Clock, Copy, Download, FastForward, Film, Flame, FolderHeart, Globe, History, House, Layers, ListPlus, LoaderCircle, Maximize2, Maximize, MessageSquarePlus, Mic, Minimize2, Minimize, Pause, PictureInPicture2, Play, RefreshCw, RotateCcw, RotateCw, ScanLine, Search, Send, Server, Settings, Share2, Share, SlidersHorizontal, Smartphone, Sparkles, SquarePlus, Star, Sun, Trash2, Trophy, Tv, Upload, User, Volume2, VolumeX, WifiOff, X } from "lucide-react";
// src/components/PWAInstallModal.tsx
export var PWAInstallModal = ({ isOpen, onClose, isInstallable, isInstalled, onTriggerInstall }) => {
	const [copiedLink, setCopiedLink] = React.useState(false);
	if (!isOpen) return null;
	const liveUrl = typeof window !== "undefined" ? `${window.location.origin}${window.location.pathname}` : "";
	const handleCopyLiveLink = async () => {
		try {
			await navigator.clipboard.writeText(liveUrl);
			setCopiedLink(true);
			setTimeout(() => setCopiedLink(false), 2500);
		} catch {}
	};
	const handleNativeShare = async () => {
		if (navigator.share) try {
			await navigator.share({
				title: "CinePulse HD — Movie, Series & Anime App",
				text: "Ad-free HD Movie, Web Series & Anime Streaming App (iPhone & Android)",
				url: liveUrl
			});
			return;
		} catch {}
		handleCopyLiveLink();
	};
	return /* @__PURE__ */ _jsx("div", {
		className: "fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-end sm:items-center justify-center sm:p-4",
		onClick: (e) => {
			if (e.target === e.currentTarget) onClose();
		},
		children: /* @__PURE__ */ _jsxs("div", {
			className: "bg-[#14171f] border-t sm:border border-white/10 rounded-t-3xl sm:rounded-3xl w-full max-w-md p-5 sm:p-6 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto",
			children: [
				/* @__PURE__ */ _jsxs("div", {
					className: "flex items-center justify-between gap-3",
					children: [/* @__PURE__ */ _jsxs("div", {
						className: "flex items-center gap-3",
						children: [/* @__PURE__ */ _jsx("div", {
							className: "w-11 h-11 rounded-2xl bg-[#00e68a]/15 border border-[#00e68a]/40 text-[#00e68a] flex items-center justify-center shrink-0",
							children: /* @__PURE__ */ _jsx(Smartphone, { className: "w-6 h-6" })
						}), /* @__PURE__ */ _jsxs("div", { children: [/* @__PURE__ */ _jsx("h3", {
							className: "text-base font-extrabold text-white",
							children: "Install & Share Live App"
						}), /* @__PURE__ */ _jsx("p", {
							className: "text-xs text-slate-400",
							children: "iPhone, Android ও সব ইউজারদের জন্য ফুল-স্ক্রিন অ্যাপ"
						})] })]
					}), /* @__PURE__ */ _jsx("button", {
						type: "button",
						onClick: onClose,
						"aria-label": "Close install guide",
						className: "min-h-[40px] min-w-[40px] rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 flex items-center justify-center transition-colors",
						children: /* @__PURE__ */ _jsx(X, { className: "w-5 h-5" })
					})]
				}),
				/* @__PURE__ */ _jsxs("div", {
					className: "rounded-2xl bg-[#0c0e12] border border-[#00e68a]/25 p-3.5 space-y-2.5",
					children: [
						/* @__PURE__ */ _jsxs("div", {
							className: "flex items-center justify-between",
							children: [/* @__PURE__ */ _jsxs("span", {
								className: "text-xs font-bold text-[#00e68a] flex items-center gap-1.5",
								children: [/* @__PURE__ */ _jsx(Globe, { className: "w-3.5 h-3.5" }), /* @__PURE__ */ _jsx("span", { children: "সবার জন্য লাইভ অ্যাপ লিংক (Share Link)" })]
							}), /* @__PURE__ */ _jsx("span", {
								className: "px-2 py-0.5 rounded-full bg-[#00e68a]/15 text-[#00e68a] text-[10px] font-bold",
								children: "LIVE 24/7"
							})]
						}),
						/* @__PURE__ */ _jsxs("div", {
							className: "flex items-center gap-2 bg-[#161a24] border border-white/10 rounded-xl px-3 py-2",
							children: [/* @__PURE__ */ _jsx("input", {
								type: "text",
								readOnly: true,
								value: liveUrl,
								className: "flex-1 bg-transparent text-xs text-slate-200 font-mono focus:outline-none truncate"
							}), /* @__PURE__ */ _jsxs("button", {
								type: "button",
								onClick: handleCopyLiveLink,
								className: "px-2.5 py-1 rounded-lg bg-[#00e68a] text-black font-extrabold text-[11px] flex items-center gap-1 shrink-0",
								children: [copiedLink ? /* @__PURE__ */ _jsx(Check, { className: "w-3.5 h-3.5" }) : /* @__PURE__ */ _jsx(Copy, { className: "w-3.5 h-3.5" }), /* @__PURE__ */ _jsx("span", { children: copiedLink ? "Copied" : "Copy" })]
							})]
						}),
						/* @__PURE__ */ _jsxs("button", {
							type: "button",
							onClick: handleNativeShare,
							className: "w-full py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white font-bold text-xs flex items-center justify-center gap-2 transition-colors",
							children: [/* @__PURE__ */ _jsx(Share2, { className: "w-4 h-4 text-[#00e68a]" }), /* @__PURE__ */ _jsx("span", { children: "বন্ধুদের সাথে অ্যাপ লিংক শেয়ার করুন (Share App)" })]
						})
					]
				}),
				isInstalled ? /* @__PURE__ */ _jsxs("div", {
					className: "rounded-2xl bg-[#00e68a]/10 border border-[#00e68a]/30 p-4 flex items-center gap-3 text-emerald-200 text-xs",
					children: [/* @__PURE__ */ _jsx(CircleCheck, { className: "w-5 h-5 text-[#00e68a] shrink-0" }), /* @__PURE__ */ _jsx("span", { children: "অ্যাপটি ইতিমধ্যে আপনার ডিভাইসের হোম স্ক্রিনে ইনস্টল করা আছে!" })]
				}) : /* @__PURE__ */ _jsxs("div", {
					className: "space-y-3.5",
					children: [isInstallable && /* @__PURE__ */ _jsxs("button", {
						type: "button",
						onClick: async () => {
							if (await onTriggerInstall()) onClose();
						},
						className: "w-full min-h-[48px] px-4 py-3 rounded-2xl bg-[#00e68a] hover:bg-[#19f59c] text-black font-extrabold text-sm flex items-center justify-center gap-2 shadow-[0_8px_25px_rgba(0,230,138,0.3)] transition-all",
						children: [/* @__PURE__ */ _jsx(Download, { className: "w-4 h-4 stroke-[2.5]" }), /* @__PURE__ */ _jsx("span", { children: "1-Tap Install App (Android / Chrome)" })]
					}), /* @__PURE__ */ _jsxs("div", {
						className: "rounded-2xl bg-[#0c0e12] border border-white/10 p-4 space-y-3",
						children: [
							/* @__PURE__ */ _jsxs("div", {
								className: "text-xs font-extrabold text-white flex items-center justify-between",
								children: [/* @__PURE__ */ _jsx("span", { children: "iPhone / iPad (Safari) হোম স্ক্রিনে অ্যাপ করার নিয়ম:" }), /* @__PURE__ */ _jsx("span", {
									className: "text-[10px] px-2 py-0.5 rounded bg-white/10 text-slate-300",
									children: "iOS App"
								})]
							}),
							/* @__PURE__ */ _jsxs("div", {
								className: "flex items-start gap-3 text-xs text-slate-300",
								children: [/* @__PURE__ */ _jsx("div", {
									className: "w-6 h-6 rounded-lg bg-[#181c26] border border-[#00e68a]/30 flex items-center justify-center text-[#00e68a] shrink-0 font-extrabold",
									children: "1"
								}), /* @__PURE__ */ _jsxs("div", {
									className: "leading-relaxed",
									children: [
										"আইফোনের ",
										/* @__PURE__ */ _jsx("strong", {
											className: "text-white",
											children: "Safari"
										}),
										" ব্রাউজারে এই লিংকটি ওপেন করে নিচে থাকা",
										" ",
										/* @__PURE__ */ _jsx("strong", {
											className: "text-white",
											children: "Share"
										}),
										" বাটনে ট্যাপ করুন।",
										/* @__PURE__ */ _jsx("span", {
											className: "inline-flex items-center ml-1.5 px-1.5 py-0.5 rounded bg-white/10 text-[#00e68a]",
											children: /* @__PURE__ */ _jsx(Share, { className: "w-3.5 h-3.5" })
										})
									]
								})]
							}),
							/* @__PURE__ */ _jsxs("div", {
								className: "flex items-start gap-3 text-xs text-slate-300",
								children: [/* @__PURE__ */ _jsx("div", {
									className: "w-6 h-6 rounded-lg bg-[#181c26] border border-[#00e68a]/30 flex items-center justify-center text-[#00e68a] shrink-0 font-extrabold",
									children: "2"
								}), /* @__PURE__ */ _jsxs("div", {
									className: "leading-relaxed",
									children: [
										"নিচে স্ক্রল করে ",
										/* @__PURE__ */ _jsx("strong", {
											className: "text-white",
											children: "Add to Home Screen"
										}),
										" অপশনে ট্যাপ করুন।",
										/* @__PURE__ */ _jsx("span", {
											className: "inline-flex items-center ml-1.5 px-1.5 py-0.5 rounded bg-white/10 text-amber-300",
											children: /* @__PURE__ */ _jsx(SquarePlus, { className: "w-3.5 h-3.5" })
										})
									]
								})]
							}),
							/* @__PURE__ */ _jsxs("div", {
								className: "flex items-start gap-3 text-xs text-slate-300",
								children: [/* @__PURE__ */ _jsx("div", {
									className: "w-6 h-6 rounded-lg bg-[#181c26] border border-[#00e68a]/30 flex items-center justify-center text-[#00e68a] shrink-0 font-extrabold",
									children: "3"
								}), /* @__PURE__ */ _jsxs("div", {
									className: "leading-relaxed",
									children: [
										"উপরে ডান কোণায় ",
										/* @__PURE__ */ _jsx("strong", {
											className: "text-white",
											children: "Add"
										}),
										" বাটনে ট্যাপ করলেই আপনার আইফোনে",
										" ",
										/* @__PURE__ */ _jsx("strong", {
											className: "text-[#00e68a]",
											children: "CinePulse"
										}),
										" নেটিভ অ্যাপ হিসেবে যুক্ত হয়ে যাবে!"
									]
								})]
							})
						]
					})]
				}),
				/* @__PURE__ */ _jsxs("div", {
					className: "rounded-2xl bg-[#0c0e12] border border-emerald-500/25 p-4 space-y-2.5",
					children: [/* @__PURE__ */ _jsxs("div", {
						className: "flex items-center justify-between",
						children: [/* @__PURE__ */ _jsx("span", {
							className: "text-xs font-extrabold text-white",
							children: "GitHub Auto-Hosting (ফ্রি লাইভ হোস্টিং রেডি):"
						}), /* @__PURE__ */ _jsx("span", {
							className: "text-[10px] px-2 py-0.5 rounded bg-[#00e68a]/15 text-[#00e68a] font-bold",
							children: "Configured ✓"
						})]
					}), /* @__PURE__ */ _jsxs("ol", {
						className: "text-xs text-slate-300 space-y-1.5 list-decimal list-inside leading-relaxed",
						children: [
							/* @__PURE__ */ _jsxs("li", { children: [
								"AI Studio-এর একদম উপরে ",
								/* @__PURE__ */ _jsx("strong", {
									className: "text-white",
									children: "GitHub"
								}),
								" বাটনে চাপ দিয়ে রিপোজিটরি তৈরি করুন।"
							] }),
							/* @__PURE__ */ _jsxs("li", { children: [
								"আমরা ভেতরে ",
								/* @__PURE__ */ _jsx("code", {
									className: "text-[#00e68a]",
									children: ".github/workflows/deploy.yml"
								}),
								" ও",
								" ",
								/* @__PURE__ */ _jsx("code", {
									className: "text-[#00e68a]",
									children: "render.yaml"
								}),
								" যুক্ত করে দিয়েছি।"
							] }),
							/* @__PURE__ */ _jsxs("li", { children: [
								"GitHub-এ গিয়ে ",
								/* @__PURE__ */ _jsx("strong", {
									className: "text-white",
									children: "Settings ➔ Pages ➔ Source: GitHub Actions"
								}),
								" সিলেক্ট করলেই অটোমেটিক আপনার স্থায়ী গিটহাব লিংক লাইভ হয়ে যাবে!"
							] })
						]
					})]
				}),
				/* @__PURE__ */ _jsx("button", {
					type: "button",
					onClick: onClose,
					className: "w-full min-h-[44px] rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-bold transition-colors",
					children: "ঠিক আছে (Close)"
				})
			]
		})
	});
};