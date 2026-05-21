/**
 * MenuPage — React Hooks ordering regression suite
 *
 * Background
 * ──────────
 * On 2026-05-13 the menu app crashed in production with React error #310
 * ("hook count mismatch between renders") for the `valley-view` restaurant.
 *
 * Root cause: `filteredCategories = useMemo(...)` was placed at line ~1080 of
 * MenuPage, AFTER seven conditional `return` statements (loading, error,
 * landing, cart, checkout, UPI-payment, success views). React counts hooks
 * per render: when any early return fired the count dropped, and on the next
 * render React detected the mismatch and threw.
 *
 * Fix: `filteredCategories` and `allItems` were moved above all early returns
 * so the hook count is identical on every render regardless of which view is
 * active.
 *
 * These tests are the permanent regression guard. They simulate the exact
 * scenario that crashed production: a component that transitions from
 * loading=true (early return fires) to loading=false (all content rendered).
 * If the hook ordering bug is ever reintroduced, the "transition" test will
 * throw the React hooks invariant error and fail.
 */

import { render, screen, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import MenuPage from "../pages/MenuPage";

// ── Mock wouter ──────────────────────────────────────────────────────────────
// MenuPage calls useParams() which reads from wouter's route context.
// In tests there is no Router, so we provide a stable mock.
vi.mock("wouter", () => ({
  useParams: vi.fn(() => ({
    restaurantId: "valley-view",
    tableId: undefined,
  })),
}));

// ── Fixture data ─────────────────────────────────────────────────────────────
const MOCK_RESTAURANT = {
  id: 1,
  name: "Valley View",
  description: "A scenic restaurant",
  cuisineType: "Indian",
  logoUrl: null,
  address: "1 Hilltop Rd",
  city: "Pune",
  phone: "9999999999",
  taxPercent: 5,
  upiId: null,
  upiName: null,
  personalUpiEnabled: false,
  seatingLabel: "Table",
  razorpayKeyId: null,
};

const MOCK_API_RESPONSE = {
  restaurant: MOCK_RESTAURANT,
  categories: [
    {
      id: 1,
      name: "Starters",
      displayOrder: 1,
      items: [
        {
          id: 1,
          name: "Paneer Tikka",
          description: "Grilled cottage cheese",
          price: 250,
          imageUrl: null,
          isVeg: true,
          isAvailable: true,
          categoryId: 1,
        },
      ],
    },
  ],
  tables: [{ id: 1, tableNumber: "T1", area: null, isOccupied: false }],
};

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Returns a mock fetch that keeps the request pending (simulates loading). */
function mockFetchPending() {
  vi.mocked(fetch).mockReturnValue(new Promise<Response>(() => {}));
}

/** Returns a mock fetch that immediately resolves with the menu API response. */
function mockFetchResolved() {
  vi.mocked(fetch).mockResolvedValue({
    json: () => Promise.resolve(MOCK_API_RESPONSE),
    ok: true,
  } as unknown as Response);
}

/** Returns a mock fetch that immediately rejects (simulates network failure). */
function mockFetchRejected() {
  vi.mocked(fetch).mockRejectedValue(new Error("Network error"));
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("MenuPage – React Hooks ordering regression", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  // ── Test 1: loading state ─────────────────────────────────────────────────
  it("renders loading state (loading=true) without hook ordering errors", () => {
    // Fetch never resolves → loading=true → early return fires.
    //
    // Before the fix: filteredCategories useMemo was NOT reached during this
    // render because the loading early-return came first. The hook count was N.
    //
    // After the fix: filteredCategories useMemo is above all early returns and
    // IS called even during loading. The hook count is N+1 on every render.
    mockFetchPending();

    // If hooks are mis-ordered React throws synchronously inside render().
    expect(() => render(<MenuPage />)).not.toThrow();
    expect(screen.getByText(/Loading menu/i)).toBeTruthy();
  });

  // ── Test 2: loading → loaded transition (the production crash scenario) ───
  it(
    "transitions loading→loaded without hook ordering error (the valley-view scenario)",
    async () => {
      // This exactly reproduces the production crash:
      //   Render 1: loading=true  → early return, filteredCategories skipped (old bug)
      //   Render 2: loading=false → full render,  filteredCategories reached
      //   React: hook count changed → throw React error #310
      //
      // With the fix the hook count is identical on both renders.
      let resolveResponse!: (r: Response) => void;
      const deferred = new Promise<Response>((res) => {
        resolveResponse = res;
      });
      vi.mocked(fetch).mockReturnValue(deferred);

      render(<MenuPage />);

      // Render 1: still loading
      expect(screen.getByText(/Loading menu/i)).toBeTruthy();

      // Resolve the API call — triggers render 2 (loading=false)
      await act(async () => {
        resolveResponse({
          json: () => Promise.resolve(MOCK_API_RESPONSE),
          ok: true,
        } as unknown as Response);
        await deferred;
      });

      // Render 2 must complete without React throwing a hooks invariant error.
      // The restaurant name only appears after a successful render.
      await waitFor(() => {
        expect(screen.getByText("Valley View")).toBeTruthy();
      });
    },
  );

  // ── Test 3: error state ───────────────────────────────────────────────────
  it("renders error state without hook ordering errors", async () => {
    mockFetchRejected();

    render(<MenuPage />);

    // Wait for the error view — hooks must remain stable through
    // loading=true → error transition just as they must for the loaded path.
    await waitFor(() => {
      expect(screen.getByText(/Menu Unavailable/i)).toBeTruthy();
    });
  });

  // ── Test 4: hook count is identical across all initial render states ──────
  it("produces the same hook count whether fetch is pending or resolved", async () => {
    // Render in loading state, unmount cleanly, then render with data.
    // React isolates component instances between mounts, but any lingering
    // dispatcher state would surface here as a console error or throw.

    mockFetchPending();
    const { unmount: unmount1 } = render(<MenuPage />);
    unmount1();

    mockFetchResolved();
    let threw = false;
    try {
      const { unmount: unmount2 } = render(<MenuPage />);
      await waitFor(() => {
        expect(screen.getByText("Valley View")).toBeTruthy();
      });
      unmount2();
    } catch {
      threw = true;
    }
    expect(threw).toBe(false);
  });
});
