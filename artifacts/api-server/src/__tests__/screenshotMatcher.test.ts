/**
 * Unit tests for the screenshot-to-bill matching algorithm.
 *
 * These tests exercise `decideMatch` — the pure decision function in
 * screenshotMatchDecider.ts.  No database, no Express, no mocking required.
 *
 * Test inventory
 * ──────────────
 *  1. Two tables paying simultaneously
 *  2. Same customer sending multiple screenshots (retry)
 *  3. Two customers with identical timestamps
 *  4. @c.us sender — P0 chatJid match
 *  5. @lid sender  — P0 chatJid match
 *  6. Existing bill without chatJid (backward compat) — P1 phone match
 *  7. Multiple pending bills for the same phone — ambiguous, discard
 *  8. Retry webhook delivery — second delivery sees no 'sent' bill, discarded
 *  9. LID sender, senderJid absent, exactly 1 recent pending → lid_single_pending
 * 10. LID sender, senderJid absent, 2 recent pending → discard (multiple_pending_bills)
 * 11. Phone mismatch, senderJid absent, 1 recent pending → phone_mismatch (auto-reply)
 * 12. Phone mismatch, senderJid present → discard (heuristic bypassed)
 * 13. senderJid present, @lid phone unresolvable, chatJid matches → P0 wins
 * 14. senderJid present, @lid phone unresolvable, no chatJid match → discard
 * 15. No bills at all → discard
 */

import { describe, it, expect } from "vitest";
import {
  decideMatch,
  type SessionBillRow,
  type DecideMatchInput,
} from "../lib/screenshotMatchDecider";

// ── Test helpers ───────────────────────────────────────────────────────────────

const BASE_DATE = new Date("2024-07-01T12:00:00Z");

/**
 * Create a minimal valid SessionBillRow for testing.
 * Only the fields relevant to matching need to be set; the rest default safely.
 */
function makeBill(
  overrides: Partial<SessionBillRow> & { id: number },
): SessionBillRow {
  return {
    sessionId: 100 + overrides.id,
    restaurantId: 1,
    billNumber: `BILL-1-${overrides.id}`,
    subtotal: 200,
    tax: 10,
    total: 210,
    status: "sent",
    customerPhone: null,
    sentAt: BASE_DATE,
    screenshotUrl: null,
    screenshotReceivedAt: null,
    verifiedAt: null,
    verifiedBy: null,
    resentAt: null,
    resentCount: 0,
    senderPhone: null,
    phoneMismatch: false,
    chatJid: null,
    createdAt: BASE_DATE,
    updatedAt: BASE_DATE,
    ...overrides,
  };
}

/**
 * Build a DecideMatchInput with sensible defaults for most fields.
 */
function makeInput(
  overrides: Partial<DecideMatchInput>,
): DecideMatchInput {
  return {
    senderJid: undefined,
    normalizedPhone: null,
    chatJidCandidates: [],
    phoneCandidates: [],
    recentPendingBills: [],
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("decideMatch — priority order and race safety", () => {
  // ──────────────────────────────────────────────────────────────────────────
  // 1. Two tables paying simultaneously
  //    Table A and Table B each have their own chatJid.  Each request sees
  //    only its own bill in chatJidCandidates (the DB locks the other row).
  //    Both should attach to their respective bills without interference.
  // ──────────────────────────────────────────────────────────────────────────
  it("1: two tables paying simultaneously — each matches its own chatJid bill", () => {
    const billA = makeBill({ id: 1, chatJid: "919111111111@c.us", customerPhone: "919111111111" });
    const billB = makeBill({ id: 2, chatJid: "919222222222@c.us", customerPhone: "919222222222" });

    const resultA = decideMatch(makeInput({
      senderJid: "919111111111@c.us",
      normalizedPhone: "919111111111",
      chatJidCandidates: [billA],
    }));
    expect(resultA.action).toBe("attach");
    if (resultA.action === "attach") {
      expect(resultA.bill.id).toBe(1);
      expect(resultA.strategy).toBe("conversation_mapping");
      expect(resultA.phoneMismatch).toBe(false);
    }

    const resultB = decideMatch(makeInput({
      senderJid: "919222222222@c.us",
      normalizedPhone: "919222222222",
      chatJidCandidates: [billB],
    }));
    expect(resultB.action).toBe("attach");
    if (resultB.action === "attach") {
      expect(resultB.bill.id).toBe(2);
      expect(resultB.strategy).toBe("conversation_mapping");
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 2. Same customer sending multiple screenshots
  //    The first delivery attaches successfully.  The second delivery arrives
  //    after the bill is already 'awaiting_verification': the bill is no longer
  //    returned by the FOR UPDATE SKIP LOCKED query (status ≠ 'sent'), so all
  //    candidate arrays are empty.  The senderJid is present → discard with
  //    reason senderJid_present_no_phone_match.
  // ──────────────────────────────────────────────────────────────────────────
  it("2: same customer sending multiple screenshots — second is discarded", () => {
    // First delivery
    const bill = makeBill({ id: 3, chatJid: "919111111111@c.us", customerPhone: "919111111111" });
    const first = decideMatch(makeInput({
      senderJid: "919111111111@c.us",
      normalizedPhone: "919111111111",
      chatJidCandidates: [bill],
    }));
    expect(first.action).toBe("attach");

    // Second delivery: bill is now 'awaiting_verification', not returned by query
    const second = decideMatch(makeInput({
      senderJid: "919111111111@c.us",
      normalizedPhone: "919111111111",
      chatJidCandidates: [],    // bill locked/already processed
      phoneCandidates: [],      // bill no longer 'sent'
      recentPendingBills: [],   // not populated when senderJid present
    }));
    expect(second.action).toBe("discard");
    if (second.action === "discard") {
      expect(second.reason).toBe("senderJid_present_no_phone_match");
      expect(second.candidates).toBe(0);
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 3. Two customers with identical timestamps
  //    Different JIDs → different chatJidCandidates → matched independently.
  //    (The DB layer locks different rows; this test confirms the decision
  //    logic is purely per-JID with no cross-contamination.)
  // ──────────────────────────────────────────────────────────────────────────
  it("3: two customers with identical timestamps — each matches its own bill", () => {
    const time = new Date("2024-07-01T12:00:00.000Z");
    const billA = makeBill({ id: 4, chatJid: "jid-a@c.us", createdAt: time });
    const billB = makeBill({ id: 5, chatJid: "jid-b@c.us", createdAt: time });

    const rA = decideMatch(makeInput({ senderJid: "jid-a@c.us", chatJidCandidates: [billA] }));
    const rB = decideMatch(makeInput({ senderJid: "jid-b@c.us", chatJidCandidates: [billB] }));

    expect(rA.action).toBe("attach");
    expect(rB.action).toBe("attach");
    if (rA.action === "attach") expect(rA.bill.id).toBe(4);
    if (rB.action === "attach") expect(rB.bill.id).toBe(5);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 4. @c.us sender — P0 chatJid match
  // ──────────────────────────────────────────────────────────────────────────
  it("4: @c.us sender — attaches via P0 chatJid match", () => {
    const bill = makeBill({ id: 6, chatJid: "917086670033@c.us", customerPhone: "917086670033" });
    const result = decideMatch(makeInput({
      senderJid: "917086670033@c.us",
      normalizedPhone: "917086670033",
      chatJidCandidates: [bill],
    }));
    expect(result.action).toBe("attach");
    if (result.action === "attach") {
      expect(result.strategy).toBe("conversation_mapping");
      expect(result.bill.id).toBe(6);
      expect(result.phoneMismatch).toBe(false);
      expect(result.needsAutoReply).toBe(false);
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 5. @lid sender — P0 chatJid match (even when phone normalisation fails)
  //    WhatsApp multi-device delivers msg.from as a long numeric @lid JID.
  //    Because session_bills.chat_jid was captured from sentMsg.id.remote._serialized,
  //    it stores the same @lid JID → exact match, no phone needed.
  // ──────────────────────────────────────────────────────────────────────────
  it("5: @lid sender — attaches via P0 chatJid match regardless of phone", () => {
    const lidJid = "268641748652129@lid";
    const bill = makeBill({ id: 7, chatJid: lidJid, customerPhone: "919876543210" });

    // Phone normalisation fails for @lid: normalizedPhone is null
    const result = decideMatch(makeInput({
      senderJid: lidJid,
      normalizedPhone: null,          // can't resolve @lid digits to real phone
      chatJidCandidates: [bill],
    }));
    expect(result.action).toBe("attach");
    if (result.action === "attach") {
      expect(result.strategy).toBe("conversation_mapping");
      expect(result.bill.id).toBe(7);
      // effectivePhone falls back to bill.customerPhone when normalizedPhone is null
      expect(result.effectivePhone).toBe("919876543210");
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 6. Existing bill without chatJid — backward compat P1 phone match
  //    Bills created before migration 0027 have chatJid = null.  The chatJid
  //    query returns [] (NULL never equals a string), so we fall through to P1.
  // ──────────────────────────────────────────────────────────────────────────
  it("6: bill without chatJid — attaches via P1 phone match", () => {
    const bill = makeBill({ id: 8, chatJid: null, customerPhone: "917086670033" });
    const result = decideMatch(makeInput({
      senderJid: "917086670033@c.us",
      normalizedPhone: "917086670033",
      chatJidCandidates: [],          // chatJid=null, no match
      phoneCandidates: [bill],
    }));
    expect(result.action).toBe("attach");
    if (result.action === "attach") {
      expect(result.strategy).toBe("phone_match");
      expect(result.bill.id).toBe(8);
      expect(result.phoneMismatch).toBe(false);
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 7. Multiple pending bills for the same phone — ambiguous, must discard
  //    If two session bills are both in 'sent' status with the same customer
  //    phone (e.g. a resent bill), attaching to either one risks the wrong
  //    assignment.  Must discard.
  // ──────────────────────────────────────────────────────────────────────────
  it("7: multiple pending bills for same phone — discards (ambiguous)", () => {
    const bill1 = makeBill({ id: 9,  customerPhone: "917086670033" });
    const bill2 = makeBill({ id: 10, customerPhone: "917086670033" });
    const result = decideMatch(makeInput({
      senderJid: undefined,
      normalizedPhone: "917086670033",
      chatJidCandidates: [],
      phoneCandidates: [bill1, bill2],
    }));
    expect(result.action).toBe("discard");
    if (result.action === "discard") {
      expect(result.reason).toBe("ambiguous_phone_multiple_bills");
      expect(result.candidates).toBe(2);
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 8. Retry webhook delivery — bill already processed, second delivery discarded
  //    The bridge retries on network failures.  After the first delivery
  //    succeeds, the bill is 'awaiting_verification'.  The retry delivers the
  //    same webhook; the bill is not in the 'sent' query results.  All
  //    candidate arrays are empty.  With no senderJid (old bridge) and no phone
  //    match, the recent-pending heuristic also returns 0 → discard.
  // ──────────────────────────────────────────────────────────────────────────
  it("8: retry webhook delivery — second delivery is discarded cleanly", () => {
    // Scenario: old bridge, phone matches but bill is already processed
    const result = decideMatch(makeInput({
      senderJid: undefined,
      normalizedPhone: "917086670033",
      chatJidCandidates: [],
      phoneCandidates: [],          // bill is 'awaiting_verification', not 'sent'
      recentPendingBills: [],       // no other pending bills in window
    }));
    expect(result.action).toBe("discard");
    if (result.action === "discard") {
      expect(result.reason).toBe("no_recent_pending_bills");
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 9. LID sender, senderJid absent, exactly 1 recent pending → lid_single_pending
  //    Old bridge (no senderJid), @lid sender, phone unresolvable.
  //    Exactly 1 bill in 'sent' status in the last 30 min → safe to attach.
  // ──────────────────────────────────────────────────────────────────────────
  it("9: LID sender (senderJid absent), 1 recent pending — attaches via lid_single_pending", () => {
    const bill = makeBill({ id: 11, customerPhone: "919876543210" });
    const result = decideMatch(makeInput({
      senderJid: undefined,           // old bridge
      normalizedPhone: null,          // @lid, unresolvable
      chatJidCandidates: [],
      phoneCandidates: [],
      recentPendingBills: [bill],
    }));
    expect(result.action).toBe("attach");
    if (result.action === "attach") {
      expect(result.strategy).toBe("lid_single_pending");
      expect(result.bill.id).toBe(11);
      expect(result.phoneMismatch).toBe(false);
      expect(result.needsAutoReply).toBe(false);
      expect(result.effectivePhone).toBe("919876543210");
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 10. LID sender, senderJid absent, 2 recent pending → discard
  //     Two tables are both waiting for payment — cannot safely assign.
  // ──────────────────────────────────────────────────────────────────────────
  it("10: LID sender (senderJid absent), 2 recent pending — discards (multiple_pending_bills)", () => {
    const bill1 = makeBill({ id: 12, customerPhone: "919876543210" });
    const bill2 = makeBill({ id: 13, customerPhone: "919111111111" });
    const result = decideMatch(makeInput({
      senderJid: undefined,
      normalizedPhone: null,
      chatJidCandidates: [],
      phoneCandidates: [],
      recentPendingBills: [bill1, bill2],
    }));
    expect(result.action).toBe("discard");
    if (result.action === "discard") {
      expect(result.reason).toBe("multiple_pending_bills");
      expect(result.candidates).toBe(2);
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 11. Phone mismatch, senderJid absent, 1 recent pending → phone_mismatch
  //     Old bridge.  Customer's phone (in webhook) doesn't match bill's
  //     customer_phone, but there's exactly one pending bill → attach with
  //     phoneMismatch=true and needsAutoReply=true.
  // ──────────────────────────────────────────────────────────────────────────
  it("11: phone mismatch, senderJid absent, 1 recent pending — attaches with phoneMismatch flag", () => {
    const bill = makeBill({ id: 14, customerPhone: "919999999999" });
    const result = decideMatch(makeInput({
      senderJid: undefined,             // old bridge
      normalizedPhone: "917086670033",  // different from bill.customerPhone
      chatJidCandidates: [],
      phoneCandidates: [],              // phone didn't match any bill directly
      recentPendingBills: [bill],
    }));
    expect(result.action).toBe("attach");
    if (result.action === "attach") {
      expect(result.strategy).toBe("phone_mismatch");
      expect(result.phoneMismatch).toBe(true);
      expect(result.needsAutoReply).toBe(true);
      expect(result.effectivePhone).toBe("917086670033");
      expect(result.bill.id).toBe(14);
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 12. Phone mismatch, senderJid present → heuristic bypassed, discard
  //     When senderJid is present in the webhook, P0 had a chance to fire.
  //     The "exactly 1 pending" heuristic must NOT be used — fail closed.
  // ──────────────────────────────────────────────────────────────────────────
  it("12: phone mismatch with senderJid present — heuristic bypassed, discards", () => {
    const bill = makeBill({ id: 15, customerPhone: "919999999999" });
    const result = decideMatch(makeInput({
      senderJid: "917086670033@c.us",   // present — P0 ran (and missed)
      normalizedPhone: "917086670033",
      chatJidCandidates: [],
      phoneCandidates: [],
      recentPendingBills: [bill],        // would match under the heuristic — must NOT
    }));
    expect(result.action).toBe("discard");
    if (result.action === "discard") {
      expect(result.reason).toBe("senderJid_present_no_phone_match");
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 13. @lid sender, phone unresolvable, chatJid matches → P0 wins
  //     Even when normalizedPhone is null, a chatJid match is sufficient.
  //     effectivePhone falls back to bill.customerPhone for the audit trail.
  // ──────────────────────────────────────────────────────────────────────────
  it("13: @lid sender with unresolvable phone but chatJid matches — attaches via P0", () => {
    const lidJid = "268641748652129@lid";
    const bill = makeBill({ id: 16, chatJid: lidJid, customerPhone: "919876543210" });
    const result = decideMatch(makeInput({
      senderJid: lidJid,
      normalizedPhone: null,
      chatJidCandidates: [bill],
    }));
    expect(result.action).toBe("attach");
    if (result.action === "attach") {
      expect(result.strategy).toBe("conversation_mapping");
      expect(result.effectivePhone).toBe("919876543210");
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 14. @lid sender, phone unresolvable, no chatJid match → discard
  //     senderJid present but chatJid lookup found nothing; phone is also
  //     unresolvable.  Must not use the heuristic — fail closed.
  // ──────────────────────────────────────────────────────────────────────────
  it("14: @lid sender, unresolvable phone, no chatJid match — discards (fail closed)", () => {
    const pendingBill = makeBill({ id: 17, customerPhone: "919876543210" });
    const result = decideMatch(makeInput({
      senderJid: "268641748652129@lid",
      normalizedPhone: null,
      chatJidCandidates: [],
      phoneCandidates: [],
      recentPendingBills: [pendingBill],  // would trigger heuristic — must NOT
    }));
    expect(result.action).toBe("discard");
    if (result.action === "discard") {
      expect(result.reason).toBe("unresolvable_phone_no_chatjid_match");
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 15. No bills at all → discard
  // ──────────────────────────────────────────────────────────────────────────
  it("15: no bills at all — discards with no_recent_pending_bills", () => {
    const result = decideMatch(makeInput({
      senderJid: undefined,
      normalizedPhone: "917086670033",
      chatJidCandidates: [],
      phoneCandidates: [],
      recentPendingBills: [],
    }));
    expect(result.action).toBe("discard");
    if (result.action === "discard") {
      expect(result.reason).toBe("no_recent_pending_bills");
    }
  });
});

// ── P0 short-circuit guarantee ─────────────────────────────────────────────────

describe("decideMatch — P0 short-circuit (no fallback after chatJid match)", () => {
  it("P0 match ignores populated phoneCandidates and recentPendingBills", () => {
    const chatBill = makeBill({ id: 20, chatJid: "9170@c.us" });
    const phoneBill = makeBill({ id: 21, customerPhone: "917086670033" });

    const result = decideMatch(makeInput({
      senderJid: "9170@c.us",
      normalizedPhone: "917086670033",
      chatJidCandidates: [chatBill],
      phoneCandidates: [phoneBill],    // should be ignored after P0 match
      recentPendingBills: [phoneBill], // should be ignored after P0 match
    }));

    expect(result.action).toBe("attach");
    if (result.action === "attach") {
      expect(result.bill.id).toBe(20);
      expect(result.strategy).toBe("conversation_mapping");
    }
  });
});

// ── effectivePhone resolution ──────────────────────────────────────────────────

describe("decideMatch — effectivePhone fallback", () => {
  it("falls back to bill.customerPhone when normalizedPhone is null (P0 match)", () => {
    const bill = makeBill({ id: 30, chatJid: "lid@lid", customerPhone: "919111111111" });
    const result = decideMatch(makeInput({
      senderJid: "lid@lid",
      normalizedPhone: null,
      chatJidCandidates: [bill],
    }));
    expect(result.action).toBe("attach");
    if (result.action === "attach") {
      expect(result.effectivePhone).toBe("919111111111");
    }
  });

  it("falls back to null when both normalizedPhone and bill.customerPhone are null (P0 match)", () => {
    const bill = makeBill({ id: 31, chatJid: "lid@lid", customerPhone: null });
    const result = decideMatch(makeInput({
      senderJid: "lid@lid",
      normalizedPhone: null,
      chatJidCandidates: [bill],
    }));
    expect(result.action).toBe("attach");
    if (result.action === "attach") {
      expect(result.effectivePhone).toBeNull();
    }
  });
});
