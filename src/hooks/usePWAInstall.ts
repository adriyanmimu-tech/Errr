// @ts-nocheck
import React from "react";
import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";

// src/hooks/usePWAInstall.ts
export function usePWAInstall() {
	const [deferredPrompt, setDeferredPrompt] = React.useState(null);
	const [isInstalled, setIsInstalled] = React.useState(false);
	const [isIOS, setIsIOS] = React.useState(false);
	const [isOnline, setIsOnline] = React.useState(typeof navigator !== "undefined" ? navigator.onLine : true);
	React.useEffect(() => {
		const isStandalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
		setIsInstalled(isStandalone);
		const ua = window.navigator.userAgent.toLowerCase();
		const isIOSDevice = /iphone|ipad|ipod/.test(ua) || window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1;
		setIsIOS(isIOSDevice);
		const handleBeforeInstallPrompt = (e) => {
			e.preventDefault();
			setDeferredPrompt(e);
		};
		const handleAppInstalled = () => {
			setIsInstalled(true);
			setDeferredPrompt(null);
		};
		const handleOnline = () => setIsOnline(true);
		const handleOffline = () => setIsOnline(false);
		window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
		window.addEventListener("appinstalled", handleAppInstalled);
		window.addEventListener("online", handleOnline);
		window.addEventListener("offline", handleOffline);
		return () => {
			window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
			window.removeEventListener("appinstalled", handleAppInstalled);
			window.removeEventListener("online", handleOnline);
			window.removeEventListener("offline", handleOffline);
		};
	}, []);
	const install = async () => {
		if (!deferredPrompt) return false;
		await deferredPrompt.prompt();
		const { outcome } = await deferredPrompt.userChoice;
		if (outcome === "accepted") {
			setIsInstalled(true);
			setDeferredPrompt(null);
			return true;
		}
		return false;
	};
	return {
		isInstallable: !!deferredPrompt,
		isInstalled,
		isIOS,
		isOnline,
		install
	};
}