/**
 * seed-dev.ts
 * Full development seed: subscription plans, admin user, demo restaurant + menu.
 * Run with: pnpm --filter @workspace/api-server run seed:dev
 * Safe to re-run — uses upserts throughout.
 */
import bcrypt from "bcrypt";
import { db } from "@workspace/db";
import {
  subscriptionPlans,
  users,
  restaurants,
  menuCategories,
  menuItems,
  restaurantTables,
  platformSettings,
} from "@workspace/db";
import { eq, sql } from "drizzle-orm";

async function main() {
  console.log("[seed-dev] starting…");

  // ── Subscription plans ────────────────────────────────────────────────────
  const plans = [
    { name: "Starter",   price: 19900,  customerLimit: 500,   description: "Perfect for new restaurants",         displayOrder: 1, validityType: "months" as const, validityValue: 1 },
    { name: "Growth",    price: 49900,  customerLimit: 2000,  description: "For growing restaurants",              displayOrder: 2, validityType: "months" as const, validityValue: 1 },
    { name: "Pro",       price: 99900,  customerLimit: 5000,  description: "For established restaurants",          displayOrder: 3, validityType: "months" as const, validityValue: 1 },
    { name: "Unlimited", price: 199900, customerLimit: 999999, description: "No customer limit — scale freely",   displayOrder: 4, validityType: "months" as const, validityValue: 1 },
  ];

  for (const plan of plans) {
    await db
      .insert(subscriptionPlans)
      .values({ ...plan, isActive: true })
      .onConflictDoNothing();
  }
  console.log("[seed-dev] subscription plans ✓");

  // ── Platform settings ──────────────────────────────────────────────────────
  await db
    .insert(platformSettings)
    .values({ key: "platform_upi_id", value: "bitebend@upi", updatedAt: new Date() })
    .onConflictDoUpdate({ target: platformSettings.key, set: { value: "bitebend@upi" } });
  console.log("[seed-dev] platform settings ✓");

  // ── Admin user ─────────────────────────────────────────────────────────────
  const adminHash = await bcrypt.hash("admin123", 10);
  const [admin] = await db
    .insert(users)
    .values({ email: "admin@bitebend.in", passwordHash: adminHash, name: "Platform Admin", role: "super_admin" })
    .onConflictDoUpdate({ target: users.email, set: { passwordHash: adminHash, role: "super_admin" } })
    .returning({ id: users.id });
  console.log(`[seed-dev] admin user ✓ (id=${admin.id})`);

  // ── Demo owner user ────────────────────────────────────────────────────────
  const ownerHash = await bcrypt.hash("demo123", 10);
  const [owner] = await db
    .insert(users)
    .values({ email: "demo@spicegarden.com", passwordHash: ownerHash, name: "Spice Garden Owner", role: "owner" })
    .onConflictDoUpdate({ target: users.email, set: { passwordHash: ownerHash } })
    .returning({ id: users.id });
  console.log(`[seed-dev] demo owner ✓ (id=${owner.id})`);

  // ── Demo restaurant ────────────────────────────────────────────────────────
  const [starterPlan] = await db
    .select({ id: subscriptionPlans.id })
    .from(subscriptionPlans)
    .where(eq(subscriptionPlans.name, "Starter"))
    .limit(1);

  const [restaurant] = await db
    .insert(restaurants)
    .values({
      name: "Spice Garden",
      slug: "spice-garden",
      description: "Authentic Indian cuisine in the heart of the city",
      cuisineType: "North Indian",
      city: "Mumbai",
      state: "Maharashtra",
      phone: "9876543210",
      email: "demo@spicegarden.com",
      ownerId: owner.id,
      isActive: true,
      upiId: "spicegarden@upi",
      whatsappNumber: "9876543210",
      taxPercent: 5,
      seatingLabel: "Table",
      planId: starterPlan?.id ?? null,
      customerLimit: 500,
      subscriptionStatus: "active",
      subscriptionStartedAt: new Date(),
      termsAccepted: true,
      privacyAccepted: true,
      acceptedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: restaurants.slug,
      set: { ownerId: owner.id, isActive: true },
    })
    .returning({ id: restaurants.id });
  console.log(`[seed-dev] restaurant ✓ (id=${restaurant.id})`);

  // Link owner → restaurant
  await db.update(users).set({ restaurantId: restaurant.id }).where(eq(users.id, owner.id));

  // ── Menu categories ────────────────────────────────────────────────────────
  const categoryData = [
    { name: "Starters",     displayOrder: 1 },
    { name: "Main Course",  displayOrder: 2 },
    { name: "Breads",       displayOrder: 3 },
    { name: "Rice & Biryani", displayOrder: 4 },
    { name: "Desserts",     displayOrder: 5 },
    { name: "Beverages",    displayOrder: 6 },
  ];

  const categoryIds: Record<string, number> = {};
  for (const cat of categoryData) {
    // Check if exists
    const existing = await db
      .select({ id: menuCategories.id })
      .from(menuCategories)
      .where(sql`${menuCategories.restaurantId} = ${restaurant.id} AND ${menuCategories.name} = ${cat.name}`)
      .limit(1);

    if (existing.length > 0) {
      categoryIds[cat.name] = existing[0].id;
    } else {
      const [inserted] = await db
        .insert(menuCategories)
        .values({ restaurantId: restaurant.id, ...cat, isActive: true })
        .returning({ id: menuCategories.id });
      categoryIds[cat.name] = inserted.id;
    }
  }
  console.log("[seed-dev] menu categories ✓");

  // ── Menu items ─────────────────────────────────────────────────────────────
  const items = [
    // Starters
    { cat: "Starters",       name: "Veg Samosa (2 pcs)",       price: 8000,  isVeg: true,  displayOrder: 1, description: "Crispy pastry filled with spiced potatoes" },
    { cat: "Starters",       name: "Chicken Tikka",            price: 28000, isVeg: false, displayOrder: 2, description: "Tender chicken marinated in yoghurt and spices" },
    { cat: "Starters",       name: "Paneer Tikka",             price: 24000, isVeg: true,  displayOrder: 3, description: "Chargrilled cottage cheese with peppers" },
    { cat: "Starters",       name: "Hara Bhara Kebab",         price: 19000, isVeg: true,  displayOrder: 4, description: "Green pea and spinach patties" },
    // Main Course
    { cat: "Main Course",    name: "Butter Chicken",           price: 32000, isVeg: false, displayOrder: 1, description: "Tender chicken in rich tomato-cream sauce" },
    { cat: "Main Course",    name: "Dal Makhani",              price: 28000, isVeg: true,  displayOrder: 2, description: "Slow-cooked black lentils with butter and cream" },
    { cat: "Main Course",    name: "Palak Paneer",             price: 27000, isVeg: true,  displayOrder: 3, description: "Cottage cheese in creamy spinach gravy" },
    { cat: "Main Course",    name: "Mutton Rogan Josh",        price: 42000, isVeg: false, displayOrder: 4, description: "Slow-braised mutton in Kashmiri spices" },
    { cat: "Main Course",    name: "Shahi Paneer",             price: 29000, isVeg: true,  displayOrder: 5, description: "Paneer in rich cashew and tomato gravy" },
    // Breads
    { cat: "Breads",         name: "Butter Naan",              price: 5000,  isVeg: true,  displayOrder: 1, description: "Soft leavened flatbread with butter" },
    { cat: "Breads",         name: "Garlic Naan",              price: 6000,  isVeg: true,  displayOrder: 2, description: "Naan topped with garlic butter" },
    { cat: "Breads",         name: "Laccha Paratha",           price: 5500,  isVeg: true,  displayOrder: 3, description: "Flaky whole-wheat layered bread" },
    // Rice & Biryani
    { cat: "Rice & Biryani", name: "Chicken Biryani",          price: 38000, isVeg: false, displayOrder: 1, description: "Aromatic basmati with spiced chicken" },
    { cat: "Rice & Biryani", name: "Veg Biryani",              price: 26000, isVeg: true,  displayOrder: 2, description: "Fragrant basmati with seasonal vegetables" },
    { cat: "Rice & Biryani", name: "Jeera Rice",               price: 15000, isVeg: true,  displayOrder: 3, description: "Steamed basmati with cumin" },
    // Desserts
    { cat: "Desserts",       name: "Gulab Jamun (2 pcs)",      price: 12000, isVeg: true,  displayOrder: 1, description: "Soft milk dumplings in rose-cardamom syrup" },
    { cat: "Desserts",       name: "Kulfi",                    price: 15000, isVeg: true,  displayOrder: 2, description: "Traditional Indian ice cream" },
    // Beverages
    { cat: "Beverages",      name: "Mango Lassi",              price: 13000, isVeg: true,  displayOrder: 1, description: "Chilled yoghurt blended with Alphonso mango" },
    { cat: "Beverages",      name: "Masala Chai",              price: 5000,  isVeg: true,  displayOrder: 2, description: "Spiced Indian tea with milk" },
    { cat: "Beverages",      name: "Fresh Lime Soda",          price: 8000,  isVeg: true,  displayOrder: 3, description: "Sweet or salted lime soda" },
  ];

  for (const item of items) {
    const catId = categoryIds[item.cat];
    if (!catId) continue;
    const existing = await db
      .select({ id: menuItems.id })
      .from(menuItems)
      .where(sql`${menuItems.restaurantId} = ${restaurant.id} AND ${menuItems.name} = ${item.name}`)
      .limit(1);
    if (existing.length === 0) {
      await db.insert(menuItems).values({
        restaurantId: restaurant.id,
        categoryId: catId,
        name: item.name,
        price: item.price,
        isVeg: item.isVeg,
        displayOrder: item.displayOrder,
        description: item.description,
        isAvailable: true,
      });
    }
  }
  console.log("[seed-dev] menu items ✓");

  // ── Tables ─────────────────────────────────────────────────────────────────
  const tableData = [
    { tableNumber: "T1", area: "Ground Floor" },
    { tableNumber: "T2", area: "Ground Floor" },
    { tableNumber: "T3", area: "Ground Floor" },
    { tableNumber: "T4", area: "First Floor" },
    { tableNumber: "T5", area: "First Floor" },
    { tableNumber: "T6", area: "Rooftop" },
  ];

  for (const t of tableData) {
    const existing = await db
      .select({ id: restaurantTables.id })
      .from(restaurantTables)
      .where(sql`${restaurantTables.restaurantId} = ${restaurant.id} AND ${restaurantTables.tableNumber} = ${t.tableNumber}`)
      .limit(1);
    if (existing.length === 0) {
      await db.insert(restaurantTables).values({ restaurantId: restaurant.id, ...t });
    }
  }
  console.log("[seed-dev] tables ✓");

  console.log("\n[seed-dev] done!");
  console.log("  Admin:   admin@bitebend.in  / admin123");
  console.log("  Owner:   demo@spicegarden.com / demo123");
  console.log(`  Menu:    /menu/${restaurant.id}/table/1`);
  process.exit(0);
}

main().catch((err) => {
  console.error("[seed-dev] failed:", err);
  process.exit(1);
});
