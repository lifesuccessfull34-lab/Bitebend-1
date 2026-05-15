/**
 * scroll-debug.ts — mobile scroll diagnostics
 *
 * Activate from browser devtools (any environment):
 *   window.__SCROLL_DEBUG__ = true;   ← set BEFORE page load, or call initScrollDebug() after
 *   window.__SCROLL_DEBUG_STOP__();   ← tear down all listeners
 *
 * Or add to URL for a single session:
 *   /menu/1/table/3#__scroll_debug__
 *
 * Logs five event streams:
 *   1. window.innerHeight changes            — layout viewport resize (toolbar hide/show)
 *   2. visualViewport.height changes         — keyboard open / close detection
 *   3. Sticky element state transitions      — STUCK ↑ / RELEASED ↓ via IntersectionObserver sentinel
 *   4. Scroll container dimensions on scroll — body scrollHeight, clientHeight, scrollY
 *   5. visualViewport.scroll                 — pageTop / offsetTop while keyboard is open
 *
 * All output uses console.debug (items 4+5, high-frequency) or console.log (items 1-3).
 * Filter the DevTools console to "[scroll-debug]" to isolate output.
 *
 * This module is always bundled but is a zero-cost no-op until the flag is set.
 * It does NOT tree-shake in production (the function is called from main.tsx)
 * but it adds < 2 KB gzipped.
 */

declare global {
  interface Window {
    __SCROLL_DEBUG__?: boolean;
    __SCROLL_DEBUG_STOP__?: () => void;
  }
}

const P = "[scroll-debug]";

function snap() {
  const vv = window.visualViewport;
  const scale = vv?.scale ?? 1;
  return {
    innerW:        window.innerWidth,
    innerH:        window.innerHeight,
    scrollY:       Math.round(window.scrollY),
    bodyScrollH:   document.body.scrollHeight,
    docClientH:    document.documentElement.clientHeight,
    vvWidth:       vv ? Math.round(vv.width)     : "n/a",
    vvHeight:      vv ? Math.round(vv.height)    : "n/a",
    // scale: 1.00 = normal, > 1.00 = pinched in (zoomed), < 1.00 = pinched out
    vvScale:       vv ? scale.toFixed(3)         : "n/a",
    vvZoomed:      scale > 1.01,
    vvOffsetTop:   vv ? Math.round(vv.offsetTop) : "n/a",
    vvPageTop:     vv ? Math.round(vv.pageTop)   : "n/a",
  };
}

/** Estimate keyboard height from the gap between window.innerHeight and
 *  visualViewport.height + visualViewport.offsetTop.
 *  Returns 0 when the keyboard is not open (gap < 100 px threshold). */
function estimateKeyboardHeight(): number {
  const vv = window.visualViewport;
  if (!vv) return 0;
  const gap = window.innerHeight - vv.height - vv.offsetTop;
  return gap > 100 ? Math.round(gap) : 0;
}

export function initScrollDebug(): void {
  const autoActivate =
    window.__SCROLL_DEBUG__ === true ||
    window.location.hash.includes("__scroll_debug__");

  if (!autoActivate) return;

  if (window.__SCROLL_DEBUG_STOP__) {
    console.log(`${P} already running — call window.__SCROLL_DEBUG_STOP__() first`);
    return;
  }

  const cleanups: Array<() => void> = [];

  function listen(
    target: EventTarget,
    type: string,
    handler: EventListenerOrEventListenerObject,
    opts?: boolean | AddEventListenerOptions,
  ) {
    target.addEventListener(type, handler, opts);
    cleanups.push(() => target.removeEventListener(type, handler, opts));
  }

  console.log(`${P} ─── INIT ──────────────────────────────────────────`, snap());

  // ── 1. window.innerHeight changes (layout viewport / toolbar hide+show) ──────
  let prevInnerH = window.innerHeight;
  listen(window, "resize", () => {
    const h = window.innerHeight;
    if (h === prevInnerH) return;
    const delta = h - prevInnerH;
    console.log(
      `${P} [1] window.innerHeight ${prevInnerH} → ${h}  (Δ ${delta > 0 ? "+" : ""}${delta}px)`,
      snap(),
    );
    prevInnerH = h;
  });

  // ── 2 & 5. visualViewport resize (keyboard) + scroll (pan while keyboard open) ──
  const vv = window.visualViewport;
  if (vv) {
    let prevVvH = vv.height;
    let prevOffsetTop = vv.offsetTop;
    let prevPageTop = vv.pageTop;
    let prevScale = vv.scale;
    let kbWasOpen = false;

    const onVvResize = () => {
      const h = vv.height;
      const ot = vv.offsetTop;
      const sc = vv.scale;
      const kbH = estimateKeyboardHeight();
      const kbOpen = kbH > 0;

      // ── [6] pinch-zoom scale change ──────────────────────────────────────
      // Fires whenever visualViewport.scale changes — i.e. every frame during
      // a pinch gesture and once when the user lifts fingers.
      // After zoom, compare scrollY and bodyScrollHeight: if bodyScrollH shrinks
      // proportionally to scale, the scroll container is following the zoom
      // correctly. If scrollY becomes stuck at the same value while vvScale is
      // > 1, the compositor coordinate mismatch bug is active.
      if (Math.abs(sc - prevScale) > 0.005) {
        const direction = sc > prevScale ? "ZOOM IN  ↑" : "ZOOM OUT ↓";
        console.log(
          `${P} [6] pinch-zoom scale ${prevScale.toFixed(3)} → ${sc.toFixed(3)}  ${direction}` +
          `  scrollY: ${Math.round(window.scrollY)}` +
          `  vvH: ${Math.round(h)}  innerH: ${window.innerHeight}` +
          (sc > 1.01 ? "  ⚠ ZOOMED — verify scroll still works" : "  ✓ back to 1:1"),
          snap(),
        );
        prevScale = sc;
      }

      // ── [2] keyboard open / close ─────────────────────────────────────────
      if (Math.abs(h - prevVvH) > 1) {
        console.log(
          `${P} [2] visualViewport.height ${Math.round(prevVvH)} → ${Math.round(h)}` +
          (kbOpen !== kbWasOpen
            ? `  ← keyboard ${kbOpen ? `OPEN (${kbH}px)` : "CLOSED"}`
            : `  (keyboard ${kbOpen ? `open ${kbH}px` : "closed"})`),
          snap(),
        );
        prevVvH = h;
        kbWasOpen = kbOpen;
      }
      if (Math.abs(ot - prevOffsetTop) > 1) {
        console.log(
          `${P} [2] visualViewport.offsetTop ${Math.round(prevOffsetTop)} → ${Math.round(ot)}`,
          snap(),
        );
        prevOffsetTop = ot;
      }
    };

    const onVvScroll = () => {
      const pt = vv.pageTop;
      if (Math.abs(pt - prevPageTop) < 2) return;
      console.debug(
        `${P} [5] visualViewport.scroll  pageTop: ${Math.round(pt)}` +
        `  offsetTop: ${Math.round(vv.offsetTop)}  keyboard: ${estimateKeyboardHeight()}px`,
      );
      prevPageTop = pt;
    };

    vv.addEventListener("resize", onVvResize);
    vv.addEventListener("scroll", onVvScroll);
    cleanups.push(
      () => vv.removeEventListener("resize", onVvResize),
      () => vv.removeEventListener("scroll", onVvScroll),
    );
  } else {
    console.warn(`${P} window.visualViewport unavailable — keyboard events will not be logged`);
  }

  // ── 3. Sticky element state transitions ──────────────────────────────────────
  // Strategy: insert an invisible 1-px sentinel div immediately before each
  // sticky element. When the sentinel leaves the viewport upward, the sticky
  // element is now "stuck" at the top. When the sentinel re-enters, it released.
  function attachStickyObservers() {
    const stickyEls = Array.from(document.querySelectorAll<HTMLElement>("[class*='sticky']"));
    if (stickyEls.length === 0) {
      console.warn(`${P} [3] no sticky elements found in DOM yet`);
      return;
    }

    stickyEls.forEach((el) => {
      const sentinel = document.createElement("div");
      sentinel.setAttribute("aria-hidden", "true");
      sentinel.style.cssText =
        "position:absolute;height:1px;width:1px;" +
        "visibility:hidden;pointer-events:none;" +
        "margin:0;padding:0;border:none;";

      el.parentElement?.insertBefore(sentinel, el);

      let stuck = false;

      const obs = new IntersectionObserver(
        ([entry]) => {
          const nowStuck = !entry.isIntersecting;
          if (nowStuck === stuck) return;
          stuck = nowStuck;
          console.log(
            `${P} [3] sticky ${nowStuck ? "STUCK   ↑" : "RELEASED↓"}` +
            `  scrollY: ${Math.round(window.scrollY)}` +
            `  el: .${[...el.classList].join(".")}`,
            snap(),
          );
        },
        { threshold: 0 },
      );

      obs.observe(sentinel);
      cleanups.push(() => {
        obs.disconnect();
        sentinel.remove();
      });
    });

    console.log(`${P} [3] observing ${stickyEls.length} sticky element(s)`);
  }

  // React renders async — wait one frame after mount
  requestAnimationFrame(() => setTimeout(attachStickyObservers, 300));

  // ── 4. Scroll container dimensions (throttled via rAF) ───────────────────────
  let scrollPending = false;
  const onScroll = () => {
    if (scrollPending) return;
    scrollPending = true;
    requestAnimationFrame(() => {
      console.debug(
        `${P} [4] scroll` +
        `  y: ${Math.round(window.scrollY)}` +
        `  bodyH: ${document.body.scrollHeight}` +
        `  clientH: ${document.documentElement.clientHeight}` +
        `  remaining: ${document.body.scrollHeight - window.scrollY - document.documentElement.clientHeight}px`,
      );
      scrollPending = false;
    });
  };
  listen(window, "scroll", onScroll, { passive: true });

  // ── Expose snapshot helper for manual inspection ──────────────────────────────
  (window as unknown as Record<string, unknown>).__SCROLL_DEBUG_SNAP__ = () => {
    console.table(snap());
    return snap();
  };

  // ── Cleanup ────────────────────────────────────────────────────────────────────
  window.__SCROLL_DEBUG_STOP__ = () => {
    cleanups.forEach((fn) => fn());
    console.log(`${P} stopped — all listeners removed`);
    delete window.__SCROLL_DEBUG_STOP__;
    delete (window as unknown as Record<string, unknown>).__SCROLL_DEBUG_SNAP__;
  };

  console.log(
    `${P} active — streams:\n` +
    `  [1] window.innerHeight changes      (layout viewport / toolbar hide+show)\n` +
    `  [2] visualViewport.height changes   (keyboard open / close)\n` +
    `  [3] sticky element transitions      (STUCK ↑ / RELEASED ↓)\n` +
    `  [4] scroll container dims           (scrollY, bodyScrollH, remaining — rAF throttled)\n` +
    `  [5] visualViewport.scroll           (pageTop pan while keyboard open)\n` +
    `  [6] pinch-zoom scale changes        (visualViewport.scale — ⚠ marks post-zoom state)\n` +
    `${P} helpers: window.__SCROLL_DEBUG_SNAP__()  |  window.__SCROLL_DEBUG_STOP__()`,
  );
}
