/**
 * screenshotMatchDecider.ts
 *
 * Pure, side-effect-free decision function for attaching a WhatsApp payment
 * screenshot to a session bill.
 *
 * This file has NO runtime dependencies (no DB, no logger, no Express).
 * It can be unit-tested without mocking anything.
 *
 * Priority order
 * ─────────────
 *   P0  conversation_mapping   chatJid exact match            deterministic
 *   P1  phone_match            normalised phone, exactly 1    deterministic
 *   P1  ambiguous              normalised phone, 2+ matches   → discard
 *   P1.5 phone_mismatch        phone present, 0 matches,      heuristic
 *                              senderJid absent, 1 pending    (backward compat)
 *   P2  lid_single_pending     phone absent (LID),            heuristic
 *                              senderJid absent, 1 pending    (backward compat)
 *   —   discard                everything else
 *
 * The "exactly one pending bill" heuristic (P1.5 / P2) is ONLY applied when
 * senderJid was absent from the webhook payload, i.e. an older bridge version
 * that does not send the JID.  When senderJid is present, P0 had a chance to
 * match via chatJid; falling back to a count-based heuristic at that point
 * risks attaching the screenshot to the wrong bill (requirement 2).
 */

// ── Types ──────────────────────────────────────────────────────────────────────

/**
 * Minimal bill shape required by the decision function.
 * Mirrors the columns in session_bills that matter for matching.
 * Using a structural interface rather than `typeof sessionBills.$inferSelect`
 * keeps this file free of any runtime DB imports.
 */
export interface SessionBillRow {
  id: number;
  sessionId: number;
  restaurantId: number;
  billNumber: string;
  subtotal: number;
  tax: number;
  total: number;
  status: string;
  customerPhone: string | null;
  sentAt: Date | null;
  screenshotUrl: string | null;
  screenshotReceivedAt: Date | null;
  verifiedAt: Date | null;
  verifiedBy: number | null;
  resentAt: Date | null;
  resentCount: number;
  senderPhone: string | null;
  phoneMismatch: boolean;
  chatJid: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type MatchStrategy =
  | "conversation_mapping" // P0: chatJid exact match
  | "phone_match"          // P1: deterministic phone match
  | "phone_mismatch"       // P1.5: heuristic single-pending, wrong phone
  | "lid_single_pending";  // P2: heuristic single-pending, unresolvable phone

export type UnmatchedReason =
  | "unresolvable_phone_no_chatjid_match"   // @lid + senderJid present but no chatJid match
  | "senderJid_present_no_phone_match"      // senderJid present, phone present but no bill match
  | "ambiguous_phone_multiple_bills"        // 2+ bills match by phone
  | "phone_mismatch_senderJid_present"      // P1.5 skipped: senderJid was in webhook
  | "phone_mismatch_ambiguous"              // P1.5: 0 or 2+ pending bills (unused, kept for clarity)
  | "no_recent_pending_bills"               // heuristic: 0 pending bills
  | "multiple_pending_bills"                // heuristic: 2+ pending bills
  | "no_sent_bill_to_match";                // generic fallthrough

export type MatchDecision =
  | {
      action: "attach";
      bill: SessionBillRow;
      strategy: MatchStrategy;
      phoneMismatch: boolean;
      effectivePhone: string | null;
      /** True when the bridge should auto-reply to the sender about phone mismatch */
      needsAutoReply: boolean;
    }
  | {
      action: "discard";
      reason: UnmatchedReason;
      details: string;
      candidates: number;
    };

export interface DecideMatchInput {
  /**
   * Raw msg.from JID from whatsapp-web.js ("917086670033@c.us" or "268641748652129@lid").
   * Undefined when the bridge version pre-dates the senderJid field.
   */
  senderJid: string | undefined;
  /**
   * Phone number normalised to 12 digits with country code ("917086670033"), or
   * null when normalisation failed (raw @lid digits that are not a real phone).
   */
  normalizedPhone: string | null;
  /**
   * Bills returned by: SELECT … WHERE chat_jid = senderJid AND status = 'sent' FOR UPDATE.
   * Empty when senderJid is absent, or when no bill carries that chatJid.
   */
  chatJidCandidates: SessionBillRow[];
  /**
   * Bills returned by: SELECT … WHERE customer_phone IN (normalizedPhone, phone10) AND status = 'sent' LIMIT 2 FOR UPDATE.
   * Empty when normalizedPhone is null.
   */
  phoneCandidates: SessionBillRow[];
  /**
   * Bills returned by: SELECT … WHERE status = 'sent' AND sent_at >= now-30m LIMIT 2 FOR UPDATE.
   * Only populated when senderJid is absent AND all deterministic queries returned empty.
   */
  recentPendingBills: SessionBillRow[];
}

// ── Pure decision function ─────────────────────────────────────────────────────

/**
 * Given pre-fetched candidate bill arrays and matching context, decide what to
 * do with the incoming screenshot.
 *
 * Guaranteed properties:
 *   • Returns 'attach' for at most ONE bill — the first deterministic match wins.
 *   • Never returns 'attach' when candidate arrays are ambiguous (≥2 options).
 *   • Never uses the "exactly one pending" heuristic when senderJid is present.
 */
export function decideMatch(input: DecideMatchInput): MatchDecision {
  const { senderJid, normalizedPhone, chatJidCandidates, phoneCandidates, recentPendingBills } = input;

  // ── P0: chatJid exact match ────────────────────────────────────────────────
  // A match here is 100% deterministic: the bill's chat_jid was captured from
  // sentMsg.id.remote._serialized at send-time; msg.from on the inbound
  // screenshot is the identical JID, regardless of @c.us vs @lid addressing.
  if (chatJidCandidates.length >= 1) {
    const bill = chatJidCandidates[0]!;
    return {
      action: "attach",
      bill,
      strategy: "conversation_mapping",
      phoneMismatch: false,
      // For @lid senders, normalizedPhone may be null; fall back to the phone
      // stored on the bill so the audit trail is always populated.
      effectivePhone: normalizedPhone ?? bill.customerPhone ?? null,
      needsAutoReply: false,
    };
  }

  // ── P1: deterministic phone match ──────────────────────────────────────────
  // Reached when: senderJid absent, OR chatJid not stored on any 'sent' bill
  // (bills created before migration 0027).
  if (normalizedPhone !== null) {
    if (phoneCandidates.length === 1) {
      return {
        action: "attach",
        bill: phoneCandidates[0]!,
        strategy: "phone_match",
        phoneMismatch: false,
        effectivePhone: normalizedPhone,
        needsAutoReply: false,
      };
    }

    if (phoneCandidates.length > 1) {
      // Two or more bills in 'sent' status carry the same customer phone.
      // Attaching to the most-recent one would risk mis-assignment — discard.
      return {
        action: "discard",
        reason: "ambiguous_phone_multiple_bills",
        details: `${phoneCandidates.length} bills in 'sent' status match the customer phone — cannot assign unambiguously`,
        candidates: phoneCandidates.length,
      };
    }

    // phoneCandidates.length === 0: phone present, no bill carries it.
    // ── P1.5: phone-mismatch heuristic — ONLY when senderJid absent ──────────
    if (senderJid !== undefined) {
      // senderJid was present in the webhook: P0 had a chance to fire.
      // Using the "exactly one pending" heuristic here would risk attaching a
      // concurrent table's screenshot to the wrong bill.  Fail closed.
      return {
        action: "discard",
        reason: "senderJid_present_no_phone_match",
        details:
          "senderJid present in webhook payload; chatJid lookup returned no 'sent' bill and phone match also failed — heuristic not used",
        candidates: 0,
      };
    }

    // Old bridge (senderJid absent): exactly-one-pending heuristic (backward compat).
    if (recentPendingBills.length === 1) {
      return {
        action: "attach",
        bill: recentPendingBills[0]!,
        strategy: "phone_mismatch",
        phoneMismatch: true,
        effectivePhone: normalizedPhone,
        needsAutoReply: true,
      };
    }

    return {
      action: "discard",
      reason:
        recentPendingBills.length === 0
          ? "no_recent_pending_bills"
          : "multiple_pending_bills",
      details:
        recentPendingBills.length === 0
          ? "phone not matched on any 'sent' bill and no recent pending bills exist"
          : `phone not matched on any 'sent' bill and ${recentPendingBills.length} recent pending bills exist — cannot assign unambiguously`,
      candidates: recentPendingBills.length,
    };
  }

  // ── normalizedPhone is null (unresolvable @lid / non-Indian number) ────────
  // P0 already ran above and found nothing.
  if (senderJid !== undefined) {
    // senderJid was present but chatJid lookup found no 'sent' bill, and phone
    // is unresolvable.  Do NOT fall back to the heuristic — fail closed.
    return {
      action: "discard",
      reason: "unresolvable_phone_no_chatjid_match",
      details:
        "senderJid present in webhook payload; chatJid lookup found no 'sent' bill, and phone normalisation failed — heuristic not used",
      candidates: 0,
    };
  }

  // ── P2: LID fallback — ONLY when senderJid absent ─────────────────────────
  // Old bridge version, @lid sender, no chatJid, phone unresolvable.
  // Safety: exactly one recent pending bill → unambiguous assignment.
  if (recentPendingBills.length === 1) {
    const bill = recentPendingBills[0]!;
    return {
      action: "attach",
      bill,
      strategy: "lid_single_pending",
      phoneMismatch: false,
      effectivePhone: bill.customerPhone ?? null,
      needsAutoReply: false,
    };
  }

  return {
    action: "discard",
    reason:
      recentPendingBills.length === 0
        ? "no_recent_pending_bills"
        : "multiple_pending_bills",
    details:
      recentPendingBills.length === 0
        ? "LID sender, no chatJid match, phone unresolvable, no recent pending bills"
        : `LID sender, no chatJid match, phone unresolvable, ${recentPendingBills.length} recent pending bills — cannot assign unambiguously`,
    candidates: recentPendingBills.length,
  };
}
