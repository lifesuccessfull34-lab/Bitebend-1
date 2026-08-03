/**
 * useVisitorTracking
 *
 * Fire-and-forget visitor tracking hook.
 * Call once on any page you want to track — it sends a POST to
 * /api/platform/analytics/visit and never blocks rendering.
 *
 * On page unload it fires a sendBeacon to record how long the visitor
 * spent on the page (navigator.sendBeacon works even during unload).
 *
 * Privacy:
 *  - Respects the browser's Do Not Track setting (navigator.doNotTrack === "1")
 *  - Visitor UUID stored in localStorage  (key: bb:visitor_id)
 *  - Session UUID stored in sessionStorage (key: bb:session_id)
 *  - No PII is ever sent
 *
 * Also exports:
 *  - trackEvent(name, properties?)  — generic named event (for funnel tracking)
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

function getIds(): { visitorId: string; sessionId: string } | null {
  try {
    return {
      visitorId: getOrCreate(localStorage, VISITOR_KEY),
      sessionId: getOrCreate(sessionStorage, SESSION_KEY),
    };
  } catch {
    // localStorage/sessionStorage unavailable (private browsing restrictions)
    return null;
  }
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useVisitorTracking(page: string): void {
  useEffect(() => {
    if (navigator.doNotTrack === "1") return;

    const ids = getIds();
    if (!ids) return;
    const { visitorId, sessionId } = ids;

    const params = new URLSearchParams(window.location.search);
    const startTime = Date.now();

    // Page-view ping
    fetch("/api/platform/analytics/visit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        visitorId,
        sessionId,
        page,
        referrer:    document.referrer || undefined,
        utmSource:   params.get("utm_source")   || undefined,
        utmMedium:   params.get("utm_medium")   || undefined,
        utmCampaign: params.get("utm_campaign") || undefined,
        utmContent:  params.get("utm_content")  || undefined,
        screenWidth:  window.screen.width,
        screenHeight: window.screen.height,
        language: navigator.language,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        userAgent: navigator.userAgent,
      }),
      keepalive: true,
    }).catch(() => {/* intentionally silent */});

    // Duration beacon — fires reliably on tab close / navigate away
    const sendDuration = () => {
      const durationSeconds = (Date.now() - startTime) / 1000;
      if (durationSeconds < 1) return; // ignore accidental sub-second stays

      const payload = JSON.stringify({ visitorId, page, durationSeconds });

      // sendBeacon is the only reliable way to fire on unload; fall back to
      // a keepalive fetch for browsers that don't support it (very rare).
      const sent = navigator.sendBeacon
        ? navigator.sendBeacon("/api/platform/analytics/duration", new Blob([payload], { type: "application/json" }))
        : false;

      if (!sent) {
        fetch("/api/platform/analytics/duration", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: payload,
          keepalive: true,
        }).catch(() => {});
      }
    };

    window.addEventListener("beforeunload", sendDuration);
    return () => window.removeEventListener("beforeunload", sendDuration);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once on mount
}

// ── Standalone event tracker ──────────────────────────────────────────────────
// Call from anywhere in the portal to record named events for funnel tracking.
//
// Usage:
//   trackEvent("register_tab_clicked");
//   trackEvent("plan_selected", { plan: "starter" });

export function trackEvent(
  eventName: string,
  properties?: Record<string, unknown>,
): void {
  if (navigator.doNotTrack === "1") return;

  const ids = getIds();
  if (!ids) return;
  const { visitorId, sessionId } = ids;

  fetch("/api/platform/analytics/event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      visitorId,
      sessionId,
      eventName,
      page: window.location.pathname,
      properties: properties ?? null,
    }),
    keepalive: true,
  }).catch(() => {/* intentionally silent */});
}
