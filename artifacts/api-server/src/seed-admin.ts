import bcrypt from "bcrypt";
import { db, users } from "@workspace/db";
import { eq } from "drizzle-orm";

async function main() {
  const hash = await bcrypt.hash("admin123", 10);

  // Use upsert so this works on a fresh production DB that has never had a
  // super_admin row (UPDATE-only silently skips when no row exists).
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.role, "super_admin"))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(users)
      .set({ email: "admin@bitebend.in", passwordHash: hash })
      .where(eq(users.role, "super_admin"));
    console.log(`[seed-admin] updated existing super_admin → admin@bitebend.in`);
  } else {
    await db.insert(users).values({
      email: "admin@bitebend.in",
      passwordHash: hash,
      name: "Platform Admin",
      role: "super_admin",
    });
    console.log("[seed-admin] inserted super_admin → admin@bitebend.in");
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("[seed-admin] failed:", err);
  process.exit(1);
});
