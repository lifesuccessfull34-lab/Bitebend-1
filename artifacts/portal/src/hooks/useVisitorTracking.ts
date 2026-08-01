/**
 * useVisitorTracking
 *
 * Fire-and-forget visitor tracking hook.
 * Call once on any page you want to track — it sends a single POST
 * to /api/platform/analytics/visit and never blocks rendering.
 *
 * Privacy:
 *  - Respects the browser's Do Not Track setting (navigator.doNotTrack === "1")
 *  - Visitor UUID is stored in localStorage (key: bb:visitor_id)
 *  - Session UUID is stored in sessionStorage (key: bb:session_id)
 *  - No PII is ever sent
 */

import { useEffect } from "react";

const VISITOR_KEY = "bb:visitor_id";
const SESSION_KEY = "bb:session_id";

function getOrCreate(storage: Storage, key: string): string {
  let id = storage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    storage.setItem(key, id);
  }
  return id;
}

export function useVisitorTracking(page: string): void {
  useEffect(() => {
    // Respect Do Not Track
    if (navigator.doNotTrack === "1") return;

    let visitorId: string;
    let sessionId: string;
    try {
      visitorId = getOrCreate(localStorage, VISITOR_KEY);
      sessionId = getOrCreate(sessionStorage, SESSION_KEY);
    } catch {
      // localStorage/sessionStorage unavailable (e.g. private browsing restrictions)
      return;
    }

    const params = new URLSearchParams(window.location.search);

    const payload = {
      visitorId,
      sessionId,
      page,
      referrer: document.referrer || undefined,
      utmSource:   params.get("utm_source")   || undefined,
      utmMedium:   params.get("utm_medium")   || undefined,
      utmCampaign: params.get("utm_campaign") || undefined,
      utmContent:  params.get("utm_content")  || undefined,
      screenWidth:  window.screen.width,
      screenHeight: window.screen.height,
      language: navigator.language,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      userAgent: navigator.userAgent,
    };

    // Fire-and-forget: errors are silently swallowed so tracking never affects UX
    fetch("/api/platform/analytics/visit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      // keepalive so the request completes even if the page unloads
      keepalive: true,
    }).catch(() => {/* intentionally silent */});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once on mount
}
