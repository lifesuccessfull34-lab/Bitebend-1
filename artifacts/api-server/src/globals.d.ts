/**
 * Build-time constants injected by esbuild's `define` option in build.mjs.
 * Values are literal strings baked into the bundle — never runtime expressions.
 *
 * In development (tsx watch): these are defined in build.mjs before the
 * dev-build step, so they are always present in the running bundle.
 */

declare const __BUILD_COMMIT__: string;
declare const __BUILD_TIME__: string;
declare const __BUILD_VERSION__: string;
