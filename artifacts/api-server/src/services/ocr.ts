import OpenAI from "openai";

export interface OcrResult {
  amount: number | null;
  utr: string | null;
  status: string | null;
  merchant: string | null;
  timestamp: string | null;
  confidence: number;
  ocrConfigured: boolean;
  rawText?: string;
  error?: string;
}

export function isOcrConfigured(): boolean {
  return !!(process.env.GOOGLE_VISION_API_KEY && process.env.OPENAI_API_KEY);
}

export async function extractPaymentData(
  base64Image: string,
  _mimeType: string = "image/jpeg",
): Promise<OcrResult> {
  const googleKey = process.env.GOOGLE_VISION_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (!googleKey || !openaiKey) {
    return {
      amount: null,
      utr: null,
      status: null,
      merchant: null,
      timestamp: null,
      confidence: 0,
      ocrConfigured: false,
    };
  }

  // Strip data URL prefix if present (e.g. "data:image/jpeg;base64,")
  const rawBase64 = base64Image.replace(/^data:[^;]+;base64,/, "");

  let rawText = "";

  try {
    const visionResp = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${googleKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requests: [
            {
              image: { content: rawBase64 },
              features: [{ type: "DOCUMENT_TEXT_DETECTION", maxResults: 1 }],
            },
          ],
        }),
      },
    );

    if (!visionResp.ok) {
      throw new Error(`Google Vision API returned ${visionResp.status}: ${await visionResp.text()}`);
    }

    const visionData = (await visionResp.json()) as {
      responses?: Array<{
        fullTextAnnotation?: { text: string };
        textAnnotations?: Array<{ description: string }>;
        error?: { message: string };
      }>;
    };

    if (visionData?.responses?.[0]?.error) {
      throw new Error(`Vision error: ${visionData.responses[0].error.message}`);
    }

    rawText =
      visionData?.responses?.[0]?.fullTextAnnotation?.text ??
      visionData?.responses?.[0]?.textAnnotations?.[0]?.description ??
      "";
  } catch (err) {
    return {
      amount: null,
      utr: null,
      status: null,
      merchant: null,
      timestamp: null,
      confidence: 0,
      ocrConfigured: true,
      rawText: "",
      error: `Vision OCR failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  if (!rawText.trim()) {
    return {
      amount: null,
      utr: null,
      status: null,
      merchant: null,
      timestamp: null,
      confidence: 10,
      ocrConfigured: true,
      rawText: "",
    };
  }

  try {
    const openai = new OpenAI({ apiKey: openaiKey });

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 512,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are a UPI payment screenshot parser. Extract structured payment data from OCR text and return ONLY a valid JSON object.",
        },
        {
          role: "user",
          content: `Extract payment details from this OCR text of an Indian UPI payment screenshot:

${rawText}

Return a JSON object with these exact fields:
{
  "amount": <number in INR or null if not found>,
  "utr": <12-digit UTR/transaction reference string or null if not found>,
  "status": <"success" if text contains successful/success/completed/credited/approved, "failed" if it contains failed/declined, else null>,
  "merchant": <receiver/merchant/payee name string or null>,
  "timestamp": <payment date-time string or null>,
  "confidence": <integer 0-100: confidence this is a valid successful UPI payment — 80-100 requires clear amount+UTR+success, 40-79 has some fields missing, 0-39 is unclear/failed>
}`,
        },
      ],
    });

    const parsed = JSON.parse(
      completion.choices[0]?.message?.content ?? "{}",
    ) as Partial<OcrResult>;

    return {
      amount: typeof parsed.amount === "number" ? parsed.amount : null,
      utr: typeof parsed.utr === "string" && parsed.utr ? parsed.utr : null,
      status: typeof parsed.status === "string" && parsed.status ? parsed.status : null,
      merchant:
        typeof parsed.merchant === "string" && parsed.merchant ? parsed.merchant : null,
      timestamp:
        typeof parsed.timestamp === "string" && parsed.timestamp ? parsed.timestamp : null,
      confidence: Math.min(
        100,
        Math.max(
          0,
          typeof parsed.confidence === "number" ? Math.round(parsed.confidence) : 0,
        ),
      ),
      ocrConfigured: true,
      rawText,
    };
  } catch (err) {
    return {
      amount: null,
      utr: null,
      status: null,
      merchant: null,
      timestamp: null,
      confidence: 0,
      ocrConfigured: true,
      rawText,
      error: `OpenAI extraction failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

export function matchPayment(
  result: OcrResult,
  orderTotal: number,
): { matched: boolean; reason: string } {
  if (!result.ocrConfigured) {
    return { matched: false, reason: "OCR not configured" };
  }
  if (result.error) {
    return { matched: false, reason: result.error };
  }

  const amountMatch =
    result.amount !== null && Math.abs(result.amount - orderTotal) < 2;
  const statusOk = result.status?.toLowerCase() === "success";
  const utrFound = !!result.utr;
  const highConfidence = result.confidence >= 95;

  if (amountMatch && statusOk && utrFound && highConfidence) {
    return { matched: true, reason: "Amount, UTR, and success status verified" };
  }

  const reasons: string[] = [];
  if (!amountMatch)
    reasons.push(
      `Amount mismatch (expected ₹${orderTotal}, got ₹${result.amount ?? "unknown"})`,
    );
  if (!statusOk)
    reasons.push(`Status not success (got "${result.status ?? "unknown"}")`);
  if (!utrFound) reasons.push("UTR not detected");
  if (!highConfidence) reasons.push(`Low confidence (${result.confidence}%)`);

  return {
    matched: false,
    reason: reasons.join("; ") || "Verification failed",
  };
}
