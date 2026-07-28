import { Request, Response } from 'express';
import { getReadyClient, reportClientFailure } from '../services/whatsappClient';
import config from '../config';
import logger from '../utils/logger';

interface SendMessageBody {
  restaurantId: number;
  phone: string;
  message: string;
}

export async function sendMessage(req: Request, res: Response): Promise<void> {
  const { restaurantId, phone, message }: Partial<SendMessageBody> = req.body;

  if (!restaurantId || typeof restaurantId !== 'number') {
    res.status(400).json({ success: false, error: 'restaurantId (number) is required' });
    return;
  }
  if (!phone || typeof phone !== 'string') {
    res.status(400).json({ success: false, error: 'phone (string) is required' });
    return;
  }
  if (!message || typeof message !== 'string' || message.trim() === '') {
    res.status(400).json({ success: false, error: 'message (non-empty string) is required' });
    return;
  }

  const normalised = phone.replace(/[^\d]/g, '');
  if (normalised.length < 10) {
    res.status(400).json({ success: false, error: 'Invalid phone number format' });
    return;
  }
  const chatId = `${normalised}@c.us`;

  try {
    getReadyClient(restaurantId);
  } catch (err) {
    res.status(409).json({
      success: false,
      error: (err as Error).message,
      hint: 'Ensure the restaurant has a connected WhatsApp session',
    });
    return;
  }

  const maxAttempts = config.messageRetryAttempts;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let client;
    try {
      // Re-fetch on every attempt so a mid-retry reconnect (triggered by
      // reportClientFailure below) is picked up instead of reusing a client
      // whose Puppeteer page/frame has already died.
      client = getReadyClient(restaurantId);
    } catch (err) {
      lastError = err as Error;
      logger.warn(`Client unavailable on attempt ${attempt}/${maxAttempts}`, {
        restaurantId,
        to: normalised,
        error: lastError.message,
      });
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 1000 * attempt));
        continue;
      }
      break;
    }

    try {
      // Capture the return value — wwebjs returns a Message object whose
      // id.remote._serialized is the WhatsApp-server-assigned JID for this
      // conversation.  This JID matches msg.from on all subsequent inbound
      // messages from the same contact, whether they use @c.us or @lid
      // (multi-device linked identity).  We surface it as chatJid so the
      // caller can store it alongside the bill for deterministic screenshot
      // matching later.
      //
      // NOTE: id.remote._serialized is verified stable by the wwebjs Message
      // model (Client.js:1558).  Log it on every send so production can
      // confirm the @c.us vs @lid form before relying on it for matching.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sentMsg = await client.sendMessage(chatId, message.trim()) as any;
      const chatJid: string | null = sentMsg?.id?.remote?._serialized ?? null;

      // ── [JID-AUDIT] Temporary production-validation log ────────────────────
      // Purpose: confirm that sentMsg.id.remote._serialized is identical to
      //   msg.from on the inbound screenshot webhook (Priority 0 matching
      //   relies on this being true).
      //
      // chatId           — what we sent to; always built as "<digits>@c.us"
      // chatJid          — what WA assigned as the conversation JID
      //   If they are identical → @c.us contacts stay @c.us (expected for
      //     normal contacts).
      //   If chatJid has @lid suffix → WA normalised this contact to its
      //     linked-device identity at send time.  The inbound msg.from for
      //     screenshots will also be @lid, so Priority 0 still matches —
      //     this log confirms both sides use the same JID.
      //
      // Remove once production logs confirm 100% match rate for both
      // @c.us and @lid conversations.
      logger.info(`[jid-audit:send] sentMsg.id.remote._serialized vs sent-to chatId`, {
        event:            'jid_audit_send',
        sentTo:           chatId,
        sentMsgIdRemote:  chatJid,
        jidMatch:         chatId === chatJid,
        sentToSuffix:     '@c.us',
        returnedSuffix:   chatJid?.includes('@lid')  ? '@lid'
                        : chatJid?.includes('@c.us') ? '@c.us'
                        : chatJid ? 'other' : null,
        restaurantId,
        to: normalised,
        attempt,
      });

      logger.info(`Message sent`, {
        restaurantId,
        to: normalised,
        attempt,
        chatJid,
        chatJidSuffix: chatJid?.includes('@lid')  ? '@lid'
                     : chatJid?.includes('@c.us') ? '@c.us'
                     : chatJid ? 'other' : null,
      });
      res.json({ success: true, message: 'Message sent', restaurantId, to: normalised, chatJid });
      return;
    } catch (err) {
      lastError = err as Error;
      logger.warn(`Send attempt ${attempt}/${maxAttempts} failed`, {
        restaurantId,
        to: normalised,
        error: lastError.message,
      });
      await reportClientFailure(restaurantId, lastError);
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
    }
  }

  res.status(500).json({
    success: false,
    error: 'Failed to send message after retries',
    detail: lastError?.message,
  });
}
