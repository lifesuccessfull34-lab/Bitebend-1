/**
 * MenuView — mobile layout regression snapshot suite
 *
 * Background
 * ──────────
 * On 2026-05-13 a component refactor moved JSX from the monolithic MenuPage.tsx
 * into 15 subcomponents under src/pages/menu/. The new files introduced a
 * production-only CSS regression: Tailwind v4's file-system scanner (used at
 * build time) missed the new subdirectory, so critical layout classes were
 * absent from the CSS bundle on deployed builds even though dev looked correct.
 *
 * Missing classes caused:
 *   · Dish images rendering full-width below content instead of w-28 on the left
 *   · Header missing px-5 horizontal padding
 *   · Search bar losing its rounded-full pill shape
 *
 * What these tests guard
 * ──────────────────────
 * 1. Snapshot tests at 320 px and 360 px viewport widths capture the full
 *    rendered HTML of the menu view (including all className attributes).
 *    Any future refactor that accidentally removes a Tailwind class from a
 *    component's JSX will change the snapshot and fail the test.
 *
 * 2. Targeted layout assertions directly verify the specific class combinations
 *    responsible for the reported regression — flex card layout, image sizing,
 *    content overflow prevention, sticky search bar, header padding, pill input.
 *
 * Note on viewport simulation
 * ───────────────────────────
 * happy-dom does not perform CSS layout, so the rendered HTML is structurally
 * identical at 320 px and 360 px (Tailwind responsive variants are CSS-only).
 * Setting window.innerWidth documents the intended mobile-viewport context and
 * protects against any future JS that gates behaviour on viewport width.
 */

import { render, screen, waitFor, act, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import MenuPage from "../pages/MenuPage";

// ── Mock wouter ──────────────────────────────────────────────────────────────
// MenuPage calls useParams() which requires a Router context.
// We provide a stable mock identical to the hooks regression test.
vi.mock("wouter", () => ({
  useParams: vi.fn(() => ({
    restaurantId: "99",
    tableId: undefined,
  })),
  useLocation: vi.fn(() => ["/99", vi.fn()]),
}));

// ── Fixture data ──────────────────────────────────────────────────────────────
//
// seatingLabel: null → take-away mode, bypasses LandingView and renders the
// MenuView directly. This is the view with the flex card layout.

const MOCK_RESTAURANT = {
  id: 99,
  name: "Test Dhaba",
  description: "A test restaurant",
  cuisineType: "north_indian",
  logoUrl: null,
  address: "1 Test Lane",
  city: "Mumbai",
  phone: "9999999999",
  taxPercent: 5,
  upiId: null,
  upiName: null,
  personalUpiEnabled: false,
  seatingLabel: null, // take-away only — skips landing, renders menu directly
  razorpayKeyId: null,
};

const MOCK_CATEGORIES = [
  {
    id: 1,
    name: "Starters",
    displayOrder: 1,
    items: [
      {
        // Item WITHOUT an image → rendered with a colour-stripe on the left
        id: 1,
        name: "Paneer Tikka",
        description: "Grilled cottage cheese",
        price: 250,
        imageUrl: null,
        isVeg: true,
        isAvailable: true,
        categoryId: 1,
      },
      {
        // Item WITH an image → rendered with flex card (image on the left, w-28)
        id: 2,
        name: "Chicken Wings",
        description: null,
        price: 299,
        imageUrl: "https://example.com/wings.jpg",
        isVeg: false,
        isAvailable: true,
        categoryId: 1,
      },
    ],
  },
];

const MOCK_API_RESPONSE = {
  restaurant: MOCK_RESTAURANT,
  categories: MOCK_CATEGORIES,
  tables: [],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function mockFetchResolved() {
  vi.mocked(fetch).mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(MOCK_API_RESPONSE),
  } as unknown as Response);
}

/**
 * Renders MenuPage at the given viewport width and waits until the menu data
 * has loaded (confirmed by the presence of a known item name).
 */
async function renderMenuAt(viewportWidth: number): Promise<HTMLElement> {
  Object.defineProperty(window, "innerWidth", {
    value: viewportWidth,
    configurable: true,
    writable: true,
  });

  mockFetchResolved();

  let container!: HTMLElement;
  await act(async () => {
    ({ container } = render(<MenuPage />));
  });

  // Flush async fetch + state updates
  await act(async () => {
    await Promise.resolve();
  });

  // Confirm the menu view is visible (not loading, not landing, not error)
  await waitFor(() => {
    expect(screen.getByText("Paneer Tikka")).toBeTruthy();
  });

  return container;
}

// ── Setup / teardown ──────────────────────────────────────────────────────────

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("MenuView – mobile layout regression snapshots", () => {
  // ── Snapshot: 320 px ────────────────────────────────────────────────────────
  it("renders correct HTML structure at 320 px viewport", async () => {
    const container = await renderMenuAt(320);
    // Snapshot captures all className attributes. A future refactor that drops
    // a critical Tailwind class from any component JSX will change this snapshot.
    expect(container.innerHTML).toMatchSnapshot();
  });

  // ── Snapshot: 360 px ────────────────────────────────────────────────────────
  it("renders correct HTML structure at 360 px viewport", async () => {
    const container = await renderMenuAt(360);
    expect(container.innerHTML).toMatchSnapshot();
  });

  // ── Targeted: flex card layout (item WITH image) ─────────────────────────
  // Note: MenuItemCard now uses inline styles (not CSS classes) for Samsung Internet ≤18
  // compatibility — @layer-based Tailwind classes are silently dropped on those browsers.
  // We verify layout protection via inline style properties instead of class names.
  //
  // Card anatomy (new compact design):
  //   card-outer div  ← overflow:hidden + display:flex  (the element we want)
  //     3px stripe div
  //     content div   ← flex:1, minWidth:0
  //     image-wrapper div ← overflow:hidden (clips border-radius), alignSelf:center
  //       img         ← width/height fixed, objectFit:cover
  //
  // The image-wrapper also has overflow:hidden, so we walk up past it looking
  // for the outer element that has BOTH overflow:hidden AND display:flex.
  it("MenuItemCard with image uses flex layout: card has overflow:hidden via inline style", async () => {
    const container = await renderMenuAt(360);

    // Find the dish image (src from our mock data)
    const imgs = Array.from(container.querySelectorAll("img")).filter(
      (img) => img.getAttribute("src") === "https://example.com/wings.jpg",
    );
    expect(imgs.length).toBe(1);
    const img = imgs[0];
    expect(img).not.toBeNull();

    // Image must have an inline width style (prevents image from overflowing card)
    expect(img.style.width).toBeTruthy();
    // Image must have object-fit: cover to prevent stretching
    expect(img.style.objectFit).toBe("cover");

    // Walk up to find the card wrapper:
    //   must have BOTH overflow:hidden AND display:flex (the image-wrapper div
    //   has overflow:hidden for border-radius clipping but is not the flex card).
    let card: HTMLElement | null = img.parentElement;
    while (card && !(card.style.overflow === "hidden" && card.style.display === "flex")) {
      card = card.parentElement;
    }
    expect(card).not.toBeNull();
    expect(card!.style.display).toBe("flex");
    expect(card!.style.overflow).toBe("hidden");
    expect(card!.style.borderRadius).toBeTruthy();
  });

  // ── Targeted: flex + min-width on content div ────────────────────────────
  // Content div uses inline styles for cross-browser flex overflow prevention.
  it("MenuItemCard content div uses flex:1 and minWidth:0 via inline style to prevent text overflow", async () => {
    const container = await renderMenuAt(360);

    // Find the text for an item without an image (Paneer Tikka)
    const paneerText = screen.getByText("Paneer Tikka");
    // Walk up to find the content wrapper (flex:1 / minWidth:0 via inline style)
    let contentDiv: HTMLElement | null = paneerText.parentElement;
    while (contentDiv && !contentDiv.style.flex?.startsWith("1")) {
      contentDiv = contentDiv.parentElement;
    }
    expect(contentDiv).not.toBeNull();
    // flex: 1 (fills remaining card width)
    expect(contentDiv!.style.flex).toMatch(/^1/);
    // minWidth: 0 — prevents flex child from overflowing card when text is long
    expect(contentDiv!.style.minWidth).toBe("0px");
  });

  // ── Targeted: sticky search bar ──────────────────────────────────────────
  it("CategoryTabs wrapper has sticky class so search bar stays pinned at top", async () => {
    const container = await renderMenuAt(360);

    const stickyEl = container.querySelector(".sticky");
    expect(stickyEl).not.toBeNull();
  });

  // ── Targeted: search input has rounded-full ───────────────────────────────
  it("Search input has rounded-full pill shape", async () => {
    const container = await renderMenuAt(360);

    const input = container.querySelector(
      'input[placeholder="Search for dishes\u2026"]',
    );
    expect(input).not.toBeNull();
    expect(input!.className).toMatch(/\brounded-full\b/);
  });

  // ── Targeted: header has horizontal padding ───────────────────────────────
  // Previously checked for Tailwind class px-5. The header now uses inline
  // paddingLeft/paddingRight ("16px") for safe-area-inset-top compatibility
  // (env() can't be composed inside a Tailwind class). We verify the inline
  // style directly so the test remains meaningful after the migration.
  it("Menu header has horizontal padding via inline style", async () => {
    const container = await renderMenuAt(360);

    // MenuHeader root div has class="text-white" and inline paddingLeft
    const header = container.querySelector(".text-white") as HTMLElement | null;
    expect(header).not.toBeNull();
    expect(header!.style.paddingLeft).toBeTruthy();
    expect(header!.style.paddingRight).toBeTruthy();
  });
});
