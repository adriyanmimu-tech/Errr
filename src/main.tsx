import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { initClientSecurityShield } from "./utils/securityShield";

initClientSecurityShield();

if (typeof window !== "undefined") {
  if ("caches" in window) {
    caches
      .keys()
      .then((keys) => {
        for (const key of keys) {
          if (key.includes("workbox") || key.includes("precache") || key.includes("vite-pwa")) {
            caches.delete(key).catch(() => {});
          }
        }
      })
      .catch(() => {});
  }
}

createRoot(document.getElementById("root")!).render(<App />);
