export {};

/**
 * test-resources-integration.ts
 *
 * Integration test: verifies the Resources API end-to-end using the running
 * local server.  Tests:
 *   1. Create (POST /api/admin/resources)
 *   2. Approve (POST /api/admin/resources/:id/approve)
 *   3. Verify visible publicly (GET /api/resources)
 *   4. Reject (POST /api/admin/resources/:id/reject)
 *   5. Verify hidden publicly after reject (GET /api/resources)
 *   6. Soft-delete (DELETE /api/admin/resources/:id)
 *   7. Verify gone from admin list
 *   8. Unauthorized access returns 403 (owner session) / 401 (no session)
 *
 * Usage: pnpm --filter @workspace/scripts run test:resources-integration
 *
 * Requirements: API server must be running on localhost:80
 */

const BASE = process.env["API_BASE"] ?? "http://localhost:80/api";
const ADMIN_EMAIL    = "admin@bitebend.in";
const ADMIN_PASSWORD = "admin123";
const OWNER_EMAIL    = "demo@spicegarden.com";
const OWNER_PASSWORD = "demo123";

let passed = 0;
let failed = 0;

function ok(label: string) {
  console.log(`  ✅  ${label}`);
  passed++;
}
function fail(label: string, detail?: string) {
  console.error(`  ❌  ${label}${detail ? `\n     ${detail}` : ""}`);
  failed++;
}

async function post(url: string, body: unknown, cookie?: string) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body),
  });
  return res;
}

async function get(url: string, cookie?: string) {
  return fetch(url, { headers: cookie ? { Cookie: cookie } : {} });
}

async function del(url: string, cookie?: string) {
  return fetch(url, { method: "DELETE", headers: cookie ? { Cookie: cookie } : {} });
}

async function login(email: string, password: string): Promise<string | null> {
  const res = await post(`${BASE}/auth/login`, { email, password });
  if (!res.ok) return null;
  const setCookie = res.headers.get("set-cookie");
  if (!setCookie) return null;
  const match = setCookie.match(/connect\.sid=[^;]+/);
  return match ? match[0] : null;
}

// ── Main ──────────────────────────────────────────────────────────────────────

console.log("=== Resources Integration Test ===\n");
console.log(`  Target: ${BASE}\n`);

// Step 0 — Login
console.log("Step 0: Auth setup");
const adminCookie = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
if (!adminCookie) { console.error("❌  Fatal: admin login failed"); process.exit(1); }
ok("Admin login");
const ownerCookie = await login(OWNER_EMAIL, OWNER_PASSWORD);
if (!ownerCookie) { console.error("❌  Fatal: owner login failed"); process.exit(1); }
ok("Owner login");

// Step 1 — Create (admin)
console.log("\nStep 1: Create resource (admin)");
const createRes = await post(`${BASE}/admin/resources`, {
  title: "Integration Test Resource",
  description: "Created by automated integration test",
  type: "link",
  status: "draft",
  approvalStatus: "pending",
  tags: ["test", "integration"],
  featured: false,
  displayOrder: 999,
}, adminCookie);

if (!createRes.ok) {
  fail(`POST /admin/resources returned ${createRes.status}`);
  process.exit(1);
}
const created = await createRes.json() as { id: number; approvalStatus: string; status: string };
ok(`Resource created with id=${created.id}`);

if (created.approvalStatus !== "pending") fail("approvalStatus should default to pending", `got: ${created.approvalStatus}`);
else ok("approvalStatus defaulted to 'pending'");
if (created.status !== "draft") fail("status should default to draft", `got: ${created.status}`);
else ok("status defaulted to 'draft'");

// Step 2 — Verify NOT visible publicly (pending)
console.log("\nStep 2: Verify NOT visible publicly while pending");
const pub1 = await get(`${BASE}/resources`);
const pubList1 = await pub1.json() as { id: number }[];
const inPub1 = pubList1.some((r) => r.id === created.id);
if (inPub1) fail("Pending resource should NOT appear on public endpoint");
else ok("Pending resource correctly hidden from public");

// Step 3 — Approve
console.log("\nStep 3: Approve resource (admin)");
const approveRes = await post(`${BASE}/admin/resources/${created.id}/approve`,
  { reviewNotes: "Approved by integration test" }, adminCookie);
if (!approveRes.ok) {
  fail(`POST /admin/resources/${created.id}/approve returned ${approveRes.status}`);
} else {
  const approved = await approveRes.json() as { approvalStatus: string; status: string; approvedBy: number };
  if (approved.approvalStatus !== "approved") fail("approvalStatus should be 'approved'", `got: ${approved.approvalStatus}`);
  else ok("approvalStatus is 'approved'");
  if (approved.status !== "active") fail("status should be 'active' after approve", `got: ${approved.status}`);
  else ok("status is 'active'");
  if (!approved.approvedBy) fail("approvedBy should be set", `got: ${approved.approvedBy}`);
  else ok(`approvedBy set to userId=${approved.approvedBy}`);
}

// Step 4 — Verify NOW visible publicly
console.log("\nStep 4: Verify visible publicly after approve");
const pub2 = await get(`${BASE}/resources`);
const pubList2 = await pub2.json() as { id: number }[];
const inPub2 = pubList2.some((r) => r.id === created.id);
if (!inPub2) fail("Approved+active resource should appear on public endpoint");
else ok("Approved resource is visible publicly");

// Step 5 — Reject
console.log("\nStep 5: Reject resource (admin)");
const rejectRes = await post(`${BASE}/admin/resources/${created.id}/reject`,
  { rejectionReason: "Test rejection — integration test cleanup" }, adminCookie);
if (!rejectRes.ok) {
  fail(`POST /admin/resources/${created.id}/reject returned ${rejectRes.status}`);
} else {
  const rejected = await rejectRes.json() as { approvalStatus: string; status: string; rejectionReason: string };
  if (rejected.approvalStatus !== "rejected") fail("approvalStatus should be 'rejected'", `got: ${rejected.approvalStatus}`);
  else ok("approvalStatus is 'rejected'");
  if (rejected.status !== "draft") fail("status should be 'draft' after reject", `got: ${rejected.status}`);
  else ok("status reset to 'draft'");
  if (!rejected.rejectionReason) fail("rejectionReason should be stored");
  else ok(`rejectionReason stored: "${rejected.rejectionReason}"`);
}

// Step 6 — Verify hidden publicly after reject
console.log("\nStep 6: Verify hidden publicly after reject");
const pub3 = await get(`${BASE}/resources`);
const pubList3 = await pub3.json() as { id: number }[];
const inPub3 = pubList3.some((r) => r.id === created.id);
if (inPub3) fail("Rejected resource should NOT appear on public endpoint");
else ok("Rejected resource correctly hidden from public");

// Step 7 — Unauthorized access (owner cannot call admin endpoints)
console.log("\nStep 7: Authorization enforcement");
const ownerCreate = await post(`${BASE}/admin/resources`,
  { title: "Should fail", type: "link" }, ownerCookie);
if (ownerCreate.status === 403) ok("Owner POST /admin/resources → 403 Forbidden");
else fail(`Expected 403 for owner, got ${ownerCreate.status}`);

const ownerApprove = await post(`${BASE}/admin/resources/${created.id}/approve`, {}, ownerCookie);
if (ownerApprove.status === 403) ok("Owner POST /admin/resources/:id/approve → 403 Forbidden");
else fail(`Expected 403 for owner, got ${ownerApprove.status}`);

const noAuth = await get(`${BASE}/admin/resources`);
if (noAuth.status === 401) ok("Unauthenticated GET /admin/resources → 401 Unauthorized");
else fail(`Expected 401 for no-auth, got ${noAuth.status}`);

const noAuthStats = await get(`${BASE}/admin/resources/stats`);
if (noAuthStats.status === 401) ok("Unauthenticated GET /admin/resources/stats → 401 Unauthorized");
else fail(`Expected 401 for no-auth stats, got ${noAuthStats.status}`);

// Step 8 — Stats endpoint
console.log("\nStep 8: Stats endpoint");
const statsRes = await get(`${BASE}/admin/resources/stats`, adminCookie);
if (!statsRes.ok) {
  fail(`GET /admin/resources/stats returned ${statsRes.status}`);
} else {
  const stats = await statsRes.json() as Record<string, number>;
  const keys = ["pendingCount", "approvedCount", "rejectedCount", "featuredCount", "draftCount"];
  const missing = keys.filter((k) => typeof stats[k] !== "number");
  if (missing.length > 0) fail(`Stats missing keys: ${missing.join(", ")}`);
  else ok(`Stats returned: ${JSON.stringify(stats)}`);
}

// Step 9 — Soft delete
console.log("\nStep 9: Soft delete");
const deleteRes = await del(`${BASE}/admin/resources/${created.id}`, adminCookie);
if (!deleteRes.ok) {
  fail(`DELETE /admin/resources/${created.id} returned ${deleteRes.status}`);
} else {
  ok("Soft-delete returned 200");
}

// Verify gone from admin list
const adminList = await get(`${BASE}/admin/resources`, adminCookie);
const adminListData = await adminList.json() as { id: number }[];
const stillInAdmin = adminListData.some((r) => r.id === created.id);
if (stillInAdmin) fail("Soft-deleted resource should not appear in admin list");
else ok("Soft-deleted resource not in admin list");

// Verify gone from public list
const pub4 = await get(`${BASE}/resources`);
const pubList4 = await pub4.json() as { id: number }[];
const stillInPub = pubList4.some((r) => r.id === created.id);
if (stillInPub) fail("Soft-deleted resource should not appear on public endpoint");
else ok("Soft-deleted resource not in public list");

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${"─".repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed === 0) {
  console.log("\n✅  All integration tests PASSED.");
} else {
  console.error(`\n❌  ${failed} test(s) FAILED.`);
  process.exit(1);
}
