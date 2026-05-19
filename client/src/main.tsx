import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

if (!window.location.hash) {
  window.location.hash = "#/";
}

createRoot(document.getElementById("root")!).render(<App />);

// Register service worker so the app can be installed as a PWA.
// We register relative to where the page is served from so it works both
// at the project root and when proxied behind a path prefix on deploy.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    const swUrl = new URL("sw.js", document.baseURI).toString();
    navigator.serviceWorker
      .register(swUrl, { scope: new URL(".", document.baseURI).pathname })
      .catch((err) => {
        // SW registration is best-effort — the app still works without it.
        console.warn("Service worker registration failed:", err);
      });
  });
}
