import { useEffect, useRef, useCallback } from "react";

interface UseInactivityTimerOptions {
  timeoutMs: number;
  warningMs: number;
  onWarning: () => void;
  onTimeout: () => void;
  enabled: boolean;
}

const ACTIVITY_EVENTS = [
  "mousemove", "mousedown", "keydown",
  "touchstart", "scroll", "click", "visibilitychange",
] as const;

/**
 * Tracks user inactivity via DOM events.
 * Fires onWarning at (timeoutMs - warningMs) of inactivity,
 * then fires onTimeout warningMs later if the user still hasn't acted.
 * Calling reset() restarts the timers (used when user clicks "Stay Logged In").
 */
export function useInactivityTimer({
  timeoutMs,
  warningMs,
  onWarning,
  onTimeout,
  enabled,
}: UseInactivityTimerOptions) {
  const warningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timeoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep latest callbacks in refs so reset() never goes stale
  const onWarningRef = useRef(onWarning);
  const onTimeoutRef = useRef(onTimeout);
  useEffect(() => { onWarningRef.current = onWarning; }, [onWarning]);
  useEffect(() => { onTimeoutRef.current = onTimeout; }, [onTimeout]);

  const clearTimers = useCallback(() => {
    if (warningTimerRef.current) { clearTimeout(warningTimerRef.current); warningTimerRef.current = null; }
    if (timeoutTimerRef.current) { clearTimeout(timeoutTimerRef.current); timeoutTimerRef.current = null; }
  }, []);

  const reset = useCallback(() => {
    clearTimers();
    const warningDelay = Math.max(0, timeoutMs - warningMs);
    warningTimerRef.current = setTimeout(() => {
      onWarningRef.current();
      timeoutTimerRef.current = setTimeout(() => {
        onTimeoutRef.current();
      }, warningMs);
    }, warningDelay);
  }, [timeoutMs, warningMs, clearTimers]);

  useEffect(() => {
    if (!enabled) { clearTimers(); return; }

    reset();

    const handleActivity = () => reset();
    ACTIVITY_EVENTS.forEach((ev) =>
      window.addEventListener(ev, handleActivity, { passive: true })
    );

    return () => {
      ACTIVITY_EVENTS.forEach((ev) =>
        window.removeEventListener(ev, handleActivity)
      );
      clearTimers();
    };
  }, [enabled, reset, clearTimers]);

  return { reset };
}
