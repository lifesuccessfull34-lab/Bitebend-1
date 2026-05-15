// ── Test environment setup ───────────────────────────────────────────────────
// Runs before every test file in @workspace/menu.
// Keep this file minimal — only add what is genuinely needed across all tests.

import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Unmount React trees after every test so DOM state never bleeds between tests.
// @testing-library/react registers its own afterEach in some environments, but
// registering it explicitly here guarantees cleanup regardless of runner config.
afterEach(cleanup);

// Suppress "window.matchMedia is not a function" in happy-dom.
// Tailwind / some Radix primitives call matchMedia; the stub is enough for tests.
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});
