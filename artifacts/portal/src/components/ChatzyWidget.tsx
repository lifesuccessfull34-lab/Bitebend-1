import { useEffect } from "react";

// ── Chatzy AI customer support widget ───────────────────────────────────────
//
// Flip this to `false` to disable the widget everywhere without touching any
// other code (modular on/off switch).
export const CHATZY_WIDGET_ENABLED = true;

const CHATZY_SCRIPT_ID = "cbb7204f-7e36-4a4f-82df-82649e17bdf0";
const CHATZY_SCRIPT_SRC =
  "https://chatzy-kb-store.s3.amazonaws.com/icons/56706cc4-b3ba-4eba-9610-f2fb07008a5c";

// Module-level guard (not component state) — survives React StrictMode's
// mount → unmount → remount cycle in dev, so the script is only ever
// injected once per page load regardless of how many times this component
// re-mounts.
let chatzyScriptInjected = false;

/**
 * Mounts the Chatzy AI support widget once, globally, for the lifetime of
 * the app. Render this a single time near the app root (outside of routed
 * pages) so client-side navigation never re-triggers the script load.
 */
export function ChatzyWidget() {
  useEffect(() => {
    if (!CHATZY_WIDGET_ENABLED) return;

    // Belt-and-braces: also check the live DOM in case the script tag was
    // already injected by a previous mount (StrictMode) or a stale HMR
    // module instance still holds `chatzyScriptInjected = true` from before.
    if (chatzyScriptInjected || document.getElementById(CHATZY_SCRIPT_ID)) {
      return;
    }
    chatzyScriptInjected = true;

    try {
      const script = document.createElement("script");
      script.src = CHATZY_SCRIPT_SRC;
      script.id = CHATZY_SCRIPT_ID;
      script.className = "chatzy_widget_script";
      script.defer = true;
      document.body.appendChild(script);
    } catch (err) {
      // Never let a third-party widget failure break the app.
      console.error("[ChatzyWidget] failed to load support widget", err);
    }
  }, []);

  return null;
}
