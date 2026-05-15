import bcrypt from "bcrypt";
import { db, users } from "@workspace/db";
import { eq } from "drizzle-orm";

async function main() {
  const hash = await bcrypt.hash("admin123", 10);

  const result = await db
    .update(users)
    .set({ email: "admin@bitebend.in", passwordHash: hash })
    .where(eq(users.role, "super_admin"))
    .returning({ id: users.id, email: users.email });

  if (result.length > 0) {
    console.log(`[seed-admin] updated admin → admin@bitebend.in (rows: ${result.length})`);
  } else {
    console.log("[seed-admin] no super_admin row found — skipped");
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("[seed-admin] failed:", err);
  process.exit(1);
});
