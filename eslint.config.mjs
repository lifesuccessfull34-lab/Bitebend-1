// ── ESLint flat config ─────────────────────────────────────────────────────
// Covers the two React artifacts: menu and portal.
// Rules are intentionally minimal: we enforce React Hooks correctness only.
//
// Rules of Hooks violations (rules-of-hooks) are ERRORS — they cause runtime
// crashes and must never reach production. The exhaustive-deps rule is a
// WARNING because some intentional dependency omissions are legitimate, but
// every warning should be reviewed.
//
// Run:
//   pnpm run lint            — show all errors and warnings
//   pnpm run check:hooks     — exit non-zero on any hooks error (CI gate)

import tsParser from "@typescript-eslint/parser";
import reactHooks from "eslint-plugin-react-hooks";

export default [
  {
    files: [
      "artifacts/menu/src/**/*.{ts,tsx}",
      "artifacts/portal/src/**/*.{ts,tsx}",
    ],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: {
      // ── React Hooks correctness ─────────────────────────────────────────
      //
      // RULE: hooks must be called unconditionally at the top level of a
      // component function — never after a conditional return, never inside
      // an if/for/while, never inside a nested function.
      //
      // Violation = React error #310 at runtime (hook count mismatch between
      // renders). This is always a bug and must be fixed immediately.
      "react-hooks/rules-of-hooks": "error",

      // RULE: every value referenced inside a hook's callback must appear in
      // its dependency array. Missing deps cause stale-closure bugs.
      //
      // Violation = warning (not a hard error) because some intentional
      // omissions are valid. Review every warning before dismissing.
      "react-hooks/exhaustive-deps": "warn",
    },
  },
];
