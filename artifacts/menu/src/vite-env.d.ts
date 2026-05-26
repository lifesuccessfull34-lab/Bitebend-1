/// <reference types="vite/client" />

/**
 * Build-time constants injected by Vite's `define` config.
 * Values are baked into the JS bundle at build time — never at runtime.
 * Available in all source files without any import.
 */
declare const __APP_BUILD__: {
  readonly commit: string;
  readonly timestamp: string;
  readonly version: string;
};

interface Window {
  /** Exposed by main.tsx at startup for browser-console diagnostics. */
  __BUILD_INFO__: typeof __APP_BUILD__;
}
