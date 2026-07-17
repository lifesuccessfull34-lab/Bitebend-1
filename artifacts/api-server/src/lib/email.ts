import { setTimeout as delay } from "node:timers/promises";

export interface EmailRecipient {
  email: string;
  name?: string;
}

export interface SendEmailOptions {
  to: EmailRecipient | EmailRecipient[];
  subject: string;
  html: string;
  text?: string;
}

const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";

function getSender() {
  const from = process.env.SMTP_FROM ?? "Bitebend <support@bitebend.in>";

  const match = from.match(/^(.*?)\s*<(.+)>$/);

  if (match) {
    return {
      name: match[1].trim(),
      email: match[2].trim(),
    };
  }

  return {
    name: "Bitebend",
    email: from.trim(),
  };
}

function normaliseRecipients(recipients: EmailRecipient | EmailRecipient[]) {
  const list = Array.isArray(recipients) ? recipients : [recipients];

  return list.map((r) => ({
    email: r.email,
    ...(r.name ? { name: r.name } : {}),
  }));
}

export async function sendEmail(options: SendEmailOptions): Promise<void> {
  const apiKey = process.env.BREVO_API_KEY;

  if (!apiKey) {
    throw new Error("BREVO_API_KEY is not configured.");
  }

  const sender = getSender();

  const controller = new AbortController();

  const timeout = setTimeout(() => {
    controller.abort();
  }, 15000);

  try {
    const response = await fetch(BREVO_API_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "api-key": apiKey,
      },
      body: JSON.stringify({
        sender,
        to: normaliseRecipients(options.to),
        subject: options.subject,
        htmlContent: options.html,
        textContent: options.text,
      }),
    });

    if (!response.ok) {
      const body = await response.text();

      throw new Error(`Brevo API Error (${response.status}): ${body}`);
    }

    // tiny delay so Brevo can accept queued requests
    await delay(50);
  } finally {
    clearTimeout(timeout);
  }
}
