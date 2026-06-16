import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build as esbuild } from "esbuild";
import esbuildPluginPino from "esbuild-plugin-pino";
import { rm, cp } from "node:fs/promises";
import { execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";

// Plugins (e.g. 'esbuild-plugin-pino') may use `require` to resolve dependencies
globalThis.require = createRequire(import.meta.url);

const artifactDir = path.dirname(fileURLToPath(import.meta.url));

// ── Build metadata ────────────────────────────────────────────────────────────
//
// Injected as literal string constants via esbuild `define`.
// Accessible anywhere in the server bundle as __BUILD_COMMIT__ etc.
// TypeScript declarations are in src/globals.d.ts.

const commitHash = (() => {
  try {
    return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return "unknown";
  }
})();

const buildTime = new Date().toISOString();

const pkg = JSON.parse(readFileSync(path.join(artifactDir, "package.json"), "utf-8"));
const buildVersion = pkg.version ?? "0.0.0";

console.log(
  `[build] commit=${commitHash} ts=${buildTime} v=${buildVersion}`,
);

async function buildAll() {
  const distDir = path.resolve(artifactDir, "dist");
  await rm(distDir, { recursive: true, force: true });

  await esbuild({
    entryPoints: [
      { in: path.resolve(artifactDir, "src/index.ts"),          out: "index" },
      { in: path.resolve(artifactDir, "src/seed-admin.ts"),     out: "seed-admin" },
      { in: path.resolve(artifactDir, "src/seed-dev-entry.ts"), out: "seed-dev" },
      { in: path.resolve(artifactDir, "src/reset-db.ts"),       out: "reset-db" },
      { in: path.resolve(artifactDir, "src/migrate.ts"),        out: "migrate" },
      { in: path.resolve(artifactDir, "src/validate-db.ts"),    out: "validate-db" },
    ],
    platform: "node",
    bundle: true,
    format: "esm",
    outdir: distDir,
    outExtension: { ".js": ".mjs" },
    logLevel: "info",
    // ── Build-time constants ────────────────────────────────────────────────
    // Replaced with string literals in the output bundle.
    // TypeScript declarations: src/globals.d.ts
    define: {
      __BUILD_COMMIT__: JSON.stringify(commitHash),
      __BUILD_TIME__: JSON.stringify(buildTime),
      __BUILD_VERSION__: JSON.stringify(buildVersion),
    },
    // Some packages may not be bundleable, so we externalize them, we can add more here as needed.
    // Some of the packages below may not be imported or installed, but we're adding them in case they are in the future.
    // Examples of unbundleable packages:
    // - uses native modules and loads them dynamically (e.g. sharp)
    // - use path traversal to read files (e.g. @google-cloud/secret-manager loads sibling .proto files)
    external: [
      "*.node",
      "sharp",
      "better-sqlite3",
      "sqlite3",
      "canvas",
      "bcrypt",
      "argon2",
      "fsevents",
      "re2",
      "farmhash",
      "xxhash-addon",
      "bufferutil",
      "utf-8-validate",
      "ssh2",
      "cpu-features",
      "dtrace-provider",
      "isolated-vm",
      "lightningcss",
      "pg-native",
      "oracledb",
      "mongodb-client-encryption",
      "nodemailer",
      "handlebars",
      "knex",
      "typeorm",
      "protobufjs",
      "onnxruntime-node",
      "@tensorflow/*",
      "@prisma/client",
      "@mikro-orm/*",
      "@grpc/*",
      "@swc/*",
      "@aws-sdk/*",
      "@azure/*",
      "@opentelemetry/*",
      "@google-cloud/*",
      "@google/*",
      "googleapis",
      "firebase-admin",
      "@parcel/watcher",
      "@sentry/profiling-node",
      "@tree-sitter/*",
      "aws-sdk",
      "classic-level",
      "dd-trace",
      "ffi-napi",
      "grpc",
      "hiredis",
      "kerberos",
      "leveldown",
      "miniflare",
      "mysql2",
      "newrelic",
      "odbc",
      "piscina",
      "realm",
      "ref-napi",
      "rocksdb",
      "sass-embedded",
      "sequelize",
      "serialport",
      "snappy",
      "tinypool",
      "usb",
      "workerd",
      "wrangler",
      "zeromq",
      "zeromq-prebuilt",
      "playwright",
      "puppeteer",
      "puppeteer-core",
      "electron",
    ],
    sourcemap: "linked",
    plugins: [
      // pino relies on workers to handle logging, instead of externalizing it we use a plugin to handle it
      esbuildPluginPino({ transports: ["pino-pretty"] })
    ],
    // Make sure packages that are cjs only (e.g. express) but are bundled continue to work in our esm output file
    banner: {
      js: `import { createRequire as __bannerCrReq } from 'node:module';
import __bannerPath from 'node:path';
import __bannerUrl from 'node:url';

globalThis.require = __bannerCrReq(import.meta.url);
globalThis.__filename = __bannerUrl.fileURLToPath(import.meta.url);
globalThis.__dirname = __bannerPath.dirname(globalThis.__filename);
    `,
    },
  });
}

async function copyMigrations(distDir) {
  const workspaceRoot = path.resolve(artifactDir, "..", "..");
  const migrationsSource = path.resolve(workspaceRoot, "lib/db/drizzle");
  const migrationsDest = path.resolve(distDir, "migrations");

  if (!existsSync(migrationsSource)) {
    console.warn("[build] no lib/db/drizzle folder found — skipping migrations copy");
    return;
  }

  await cp(migrationsSource, migrationsDest, { recursive: true });
  console.log(`[build] copied migrations → dist/migrations`);
}

buildAll()
  .then(() => copyMigrations(path.resolve(artifactDir, "dist")))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
