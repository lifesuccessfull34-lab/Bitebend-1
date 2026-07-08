import { useState, useEffect, useCallback } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import type { Restaurant, RestaurantTable } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Plus,
  Trash2,
  Loader2,
  Download,
  QrCode,
  Copy,
  Check,
  ExternalLink,
  UtensilsCrossed,
  Store,
  Save,
  Printer,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { QRCodeCanvas } from "qrcode.react";
import QRCodeLib from "qrcode";
// Injected at build time (see vite.config.ts define).
// __SITE_URL__: canonical production domain (e.g. https://bitebend.in) — takes priority.
// __REPLIT_DOMAINS__: .replit.app hostname — fallback when SITE_URL not set.
declare const __SITE_URL__: string;
declare const __REPLIT_DOMAINS__: string;

/* ─────────────────────────────────────────────────────────────────────────────
   QR label builder
   Physical size: 8.5 cm × 14 cm (portrait), rendered at 300 DPI.
   Layout (top → bottom):
     1. Restaurant name — 28 pt bold, centred
     2. Subtitle — 24 pt, centred ("Scan to View Menu & Order")
     3. QR code — 5 cm × 5 cm, centred, Bitebend logo overlaid in centre
     4. "Table No: ______" — 26 pt bold, centred
     5. "Bitebend" footer — 22 pt, orange, centred
───────────────────────────────────────────────────────────────────────────── */

/** Convert centimetres → pixels at 300 DPI */
function cm(v: number) {
  return Math.round((v * 300) / 2.54);
}
/** Convert points → pixels at 300 DPI */
function pt(v: number) {
  return Math.round((v * 300) / 72);
}

async function buildQRLabelPNG(opts: {
  url: string;
  restaurantName: string;
}): Promise<string> {
  const { url, restaurantName } = opts;

  // ── Physical canvas: 8.5 cm wide × 14 cm tall at 300 DPI ─────────────────
  const W = cm(8.5); // 1004 px
  const H = cm(14); // 1654 px

  const H_PAD = cm(0.65);
  const MAX_TXT = W - H_PAD * 2;

  // ── Layout ────────────────────────────────────────────────────────────────
  // 0     → 3.5  cm : orange header band
  //   1.45 cm : centre restaurant name
  //   2.65 cm : centre subtitle
  // 3.5   → 3.95 cm : gap before card
  // 3.95  → 9.65 cm : QR card (5.0 QR + 0.35 pad top + 0.35 pad bottom)
  //   bottom border at 9.65 cm — "bitebend" straddles this line
  // 9.65  → 10.5  cm : gap
  // 10.5  cm : centre "Area:"
  // 11.2  cm : divider
  // 11.9  cm : centre "Table No:"

  const HEADER_H = cm(3.5);
  const NAME_Y = cm(1.45);
  const SUBTITLE_Y = cm(2.65);

  const QR_SIZE = cm(5.0);
  const CARD_PAD = cm(0.35);
  const CARD_W = QR_SIZE + CARD_PAD * 2;
  const CARD_H = QR_SIZE + CARD_PAD * 2;
  const CARD_X = Math.round((W - CARD_W) / 2);
  const CARD_Y = HEADER_H + cm(0.45);
  const QR_LEFT = CARD_X + CARD_PAD;
  const QR_TOP = CARD_Y + CARD_PAD;

  // "bitebend" straddles the bottom border of the card
  const CARD_BOTTOM = CARD_Y + CARD_H;

  const AREA_Y = CARD_BOTTOM + cm(0.85);
  const DIV_Y = AREA_Y + cm(0.7);
  const TABLE_Y = DIV_Y + cm(0.7);

  // Border weight: 4.5 pt → pixels at 300 DPI
  const BORDER_PX = pt(4.5);

  // ── 1. Generate QR ────────────────────────────────────────────────────────
  const qrCanvas = document.createElement("canvas");
  await QRCodeLib.toCanvas(qrCanvas, url, {
    width: QR_SIZE,
    margin: 3,
    color: { dark: "#1a1a1a", light: "#ffffff" },
    errorCorrectionLevel: "H",
  });

  // ── 2. Compose ────────────────────────────────────────────────────────────
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  // White background
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);

  // ── Orange header band ────────────────────────────────────────────────────
  ctx.fillStyle = "#ea580c";
  ctx.fillRect(0, 0, W, HEADER_H);

  // Restaurant name — Engravers MT / Georgia fallback, bold white uppercase, 20 pt
  ctx.fillStyle = "#ffffff";
  ctx.font = `700 ${pt(20)}px 'Engravers MT','Palatino Linotype',Georgia,serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.letterSpacing = `${pt(1)}px`;
  ctx.fillText(restaurantName.toUpperCase(), W / 2, NAME_Y, MAX_TXT);
  ctx.letterSpacing = "0px";

  // Subtitle — Times New Roman bold white, 18 pt
  ctx.fillStyle = "#ffffff";
  ctx.font = `700 ${pt(18)}px 'Times New Roman',serif`;
  ctx.fillText("Scan to View Menu & Order", W / 2, SUBTITLE_Y, MAX_TXT);

  // ── QR card — navy rounded border, fill white ─────────────────────────────
  const cardR = cm(0.35);
  function drawCardPath() {
    ctx.beginPath();
    ctx.moveTo(CARD_X + cardR, CARD_Y);
    ctx.lineTo(CARD_X + CARD_W - cardR, CARD_Y);
    ctx.arcTo(CARD_X + CARD_W, CARD_Y, CARD_X + CARD_W, CARD_Y + cardR, cardR);
    ctx.lineTo(CARD_X + CARD_W, CARD_Y + CARD_H - cardR);
    ctx.arcTo(
      CARD_X + CARD_W,
      CARD_Y + CARD_H,
      CARD_X + CARD_W - cardR,
      CARD_Y + CARD_H,
      cardR,
    );
    ctx.lineTo(CARD_X + cardR, CARD_Y + CARD_H);
    ctx.arcTo(CARD_X, CARD_Y + CARD_H, CARD_X, CARD_Y + CARD_H - cardR, cardR);
    ctx.lineTo(CARD_X, CARD_Y + cardR);
    ctx.arcTo(CARD_X, CARD_Y, CARD_X + cardR, CARD_Y, cardR);
    ctx.closePath();
  }

  // Fill white background first
  ctx.fillStyle = "#ffffff";
  drawCardPath();
  ctx.fill();

  // Stroke full border
  ctx.strokeStyle = "#162b6e";
  ctx.lineWidth = BORDER_PX;
  drawCardPath();
  ctx.stroke();

  // Draw QR code
  ctx.drawImage(qrCanvas, QR_LEFT, QR_TOP, QR_SIZE, QR_SIZE);

  // ── "bitebend" in bottom border gap ──────────────────────────────────────
  // Measure brand text width to size the gap correctly
  const brandFont18 = `italic 400 ${pt(18)}px 'Gabriola','Segoe Script',Georgia,serif`;
  ctx.font = brandFont18;
  const brandMeasure = ctx.measureText("bitebend");
  const brandTextW = brandMeasure.width;
  const gapPad = cm(0.28);
  const gapW = brandTextW + gapPad * 2;
  const gapX = W / 2 - gapW / 2;
  const gapY = CARD_BOTTOM - BORDER_PX - 1;
  const gapHt = BORDER_PX * 2 + 2;

  // Erase border segment at bottom center with white fill
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(gapX, gapY, gapW, gapHt);

  // Draw brand text centred in the gap, straddling the border line
  ctx.fillStyle = "#ea580c";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("bitebend", W / 2, CARD_BOTTOM);

  // ── "Area:" label + underline ─────────────────────────────────────────────
  ctx.fillStyle = "#162b6e";
  ctx.font = `700 ${pt(16)}px 'Times New Roman',serif`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText("Area:", H_PAD, AREA_Y);
  const areaLabelW = ctx.measureText("Area:").width;
  ctx.strokeStyle = "#162b6e";
  ctx.lineWidth = pt(1.2);
  ctx.beginPath();
  ctx.moveTo(H_PAD + areaLabelW + cm(0.22), AREA_Y + cm(0.18));
  ctx.lineTo(W - H_PAD, AREA_Y + cm(0.18));
  ctx.stroke();

  // ── Horizontal divider ────────────────────────────────────────────────────
  ctx.strokeStyle = "#d1d5db";
  ctx.lineWidth = pt(1);
  ctx.beginPath();
  ctx.moveTo(H_PAD, DIV_Y);
  ctx.lineTo(W - H_PAD, DIV_Y);
  ctx.stroke();

  // ── "Table No:" label + underline ─────────────────────────────────────────
  ctx.fillStyle = "#162b6e";
  ctx.font = `700 ${pt(16)}px 'Times New Roman',serif`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText("Table No:", H_PAD, TABLE_Y);
  const tableNoLabelW = ctx.measureText("Table No:").width;
  ctx.strokeStyle = "#162b6e";
  ctx.lineWidth = pt(1.2);
  ctx.beginPath();
  ctx.moveTo(H_PAD + tableNoLabelW + cm(0.22), TABLE_Y + cm(0.18));
  ctx.lineTo(W - H_PAD, TABLE_Y + cm(0.18));
  ctx.stroke();

  return canvas.toDataURL("image/png");
}

/* ─────────────────────────────────────────────────────────────────────────────
   Print / PDF path — opens a new browser window with
   @page { size: 8.5cm 14cm; margin: 0 }
   Portrait layout (top → bottom):
     1. Orange header band — restaurant name bold white uppercase + subtitle
     2. QR code in navy-bordered rounded card (no logo overlay)
     3. "bitebend" italic orange script flanked by horizontal lines
     4. "Area: ___" fill-in field (navy bold)
     5. Horizontal divider
     6. "Table No: ___" fill-in field (navy bold)
   Physical dimensions are exact regardless of screen DPI or browser zoom.
   "Save as PDF" from the print dialog produces a pixel-accurate PDF.
───────────────────────────────────────────────────────────────────────────── */
async function printQRLabel(opts: {
  url: string;
  restaurantName: string;
}): Promise<boolean> {
  const { url, restaurantName } = opts;

  // Generate QR as a data-URI (600 px → rendered at 5 cm ≈ 118 DPI crisp print)
  const qrDataUrl = await QRCodeLib.toDataURL(url, {
    width: 600,
    margin: 3,
    color: { dark: "#1a1a1a", light: "#ffffff" },
    errorCorrectionLevel: "H",
  });

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>QR Label \u2014 ${restaurantName}</title>
<style>
  @page {
    size: 8.5cm 14cm;
    margin: 0;
  }
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body {
    width: 8.5cm;
    height: 14cm;
    overflow: hidden;
    background: #fff;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  /* ── Portrait label ──────────────────────────────────────────── */
  .label {
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 8.5cm;
    height: 14cm;
    font-family: system-ui, -apple-system, 'Segoe UI', Arial, sans-serif;
  }

  /* ── Orange header band ──────────────────────────────────────── */
  .header {
    width: 100%;
    height: 3.5cm;
    background: #ea580c;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 0 0.65cm;
    flex-shrink: 0;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .rest-name {
    font-size: 30pt;
    font-weight: 900;
    color: #ffffff;
    text-align: center;
    line-height: 1.1;
    width: 100%;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    text-transform: uppercase;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .subtitle {
    font-size: 18pt;
    font-weight: 400;
    color: #ffffff;
    text-align: center;
    margin-top: 0.15cm;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  /* ── Body ────────────────────────────────────────────────────── */
  .body {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 0.4cm 0.65cm 0.5cm;
    width: 100%;
  }

  /* ── QR card — navy border ───────────────────────────────────── */
  .qr-container {
    display: inline-block;
    border: 2.5px solid #162b6e;
    border-radius: 0.35cm;
    padding: 0.35cm;
    background: #fff;
    line-height: 0;
    flex-shrink: 0;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .qr-img {
    display: block;
    width: 5cm;
    height: 5cm;
    image-rendering: crisp-edges;
    image-rendering: pixelated;
  }

  /* ── "bitebend" brand line ──────────────────────────────────── */
  .brand-row {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.22cm;
    margin-top: 0.5cm;
    flex-shrink: 0;
  }
  .brand-line {
    flex: 1;
    height: 1px;
    background: #ea580c;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .brand-text {
    font-family: Georgia, 'Times New Roman', serif;
    font-size: 22pt;
    font-style: italic;
    font-weight: 400;
    color: #ea580c;
    white-space: nowrap;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  /* ── Spacer ──────────────────────────────────────────────────── */
  .spacer { flex: 1; }

  /* ── Area / Table No fields ──────────────────────────────────── */
  .field-row {
    width: 100%;
    display: flex;
    align-items: flex-end;
    gap: 0.25cm;
    flex-shrink: 0;
    padding: 0.1cm 0;
  }
  .field-label {
    font-size: 20pt;
    font-weight: 700;
    color: #162b6e;
    white-space: nowrap;
    line-height: 1;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .field-line {
    flex: 1;
    border-bottom: 1.5px solid #162b6e;
    height: 1.4em;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  /* ── Divider ─────────────────────────────────────────────────── */
  .divider {
    width: 100%;
    height: 1px;
    background: #d1d5db;
    flex-shrink: 0;
    margin: 0.3cm 0;
  }
</style>
</head>
<body>
<div class="label">
  <div class="header">
    <div class="rest-name">${restaurantName}</div>
    <div class="subtitle">Scan to View Menu &amp; Order</div>
  </div>
  <div class="body">
    <div class="qr-container">
      <img class="qr-img" src="${qrDataUrl}" alt="QR Code" />
    </div>
    <div class="brand-row">
      <div class="brand-line"></div>
      <div class="brand-text">bitebend</div>
      <div class="brand-line"></div>
    </div>
    <div class="spacer"></div>
    <div class="field-row">
      <div class="field-label">Area:</div>
      <div class="field-line"></div>
    </div>
    <div class="divider"></div>
    <div class="field-row">
      <div class="field-label">Table No:</div>
      <div class="field-line"></div>
    </div>
  </div>
</div>
</body>
</html>`;

  const win = window.open("", "_blank", "width=420,height=700");
  if (!win) return false;
  win.document.write(html);
  win.document.close();
  // Allow images to decode before opening print dialog
  setTimeout(() => win.print(), 400);
  return true;
}

/* ─────────────────────────────────────────────────────────────────────────────
   Restaurant-wide QR section
───────────────────────────────────────────────────────────────────────────── */
function RestaurantQRSection({
  restaurantId,
  restaurantSlug,
  restaurantName,
  seatingLabel,
}: {
  restaurantId: number;
  restaurantSlug?: string;
  restaurantName: string;
  seatingLabel: string | null;
}) {
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [printing, setPrinting] = useState(false);

  // Resolve the correct public-facing origin at build time.
  // Priority: SITE_URL (custom domain) → REPLIT_DOMAINS (.replit.app) → current origin.

  const _publicOrigin =
    (typeof __SITE_URL__ !== "undefined" && __SITE_URL__?.trim()) ||
    window.location.origin;

  // Use slug for clean URLs; fall back to numeric ID for backward compat.

  const menuUrl = `https://menu.bitebend.in/${restaurantSlug ?? restaurantId}`;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(menuUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const dataUrl = await buildQRLabelPNG({
        url: menuUrl,
        restaurantName,
      });
      const link = document.createElement("a");
      link.download = `qr-label-${restaurantId}.png`;
      link.href = dataUrl;
      link.click();
    } finally {
      setDownloading(false);
    }
  };

  const handlePrint = async () => {
    setPrinting(true);
    try {
      const opened = await printQRLabel({
        url: menuUrl,
        restaurantName,
      });
      if (!opened) {
        alert(
          "Pop-up blocked. Please allow pop-ups for this site, then try again.",
        );
      }
    } finally {
      setPrinting(false);
    }
  };

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <div className="bg-gradient-to-r from-orange-500 to-amber-500 px-5 py-4">
        <h2 className="text-white font-bold text-base">
          Your Restaurant QR Code
        </h2>
        <p className="text-orange-100 text-xs mt-0.5">
          {seatingLabel
            ? `Print and display this at your counter or ${seatingLabel.toLowerCase()}s. Customers scan to order.`
            : "Display this at your stall. Customers scan and go straight to your menu."}
        </p>
      </div>

      <div className="p-5 flex flex-col sm:flex-row gap-6 items-center">
        <div className="shrink-0 bg-white p-3 rounded-xl border-2 border-border shadow-sm">
          <QRCodeCanvas
            value={menuUrl}
            size={176}
            level="H"
            marginSize={4}
            fgColor="#1a1a1a"
          />
        </div>

        <div className="flex-1 min-w-0 space-y-4 w-full">
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
              Menu Link
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs bg-muted px-3 py-2 rounded-lg truncate font-mono border border-border">
                {menuUrl}
              </code>
              <Button
                size="sm"
                variant="outline"
                className="h-8 shrink-0"
                onClick={handleCopy}
              >
                {copied ? (
                  <Check className="w-3.5 h-3.5 text-green-600" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </Button>
            </div>
          </div>

          <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 text-xs text-orange-700 space-y-1">
            <p className="font-semibold">How it works for customers:</p>
            {seatingLabel ? (
              <ol className="list-decimal list-inside space-y-0.5 text-orange-600">
                <li>Customer scans this QR code</li>
                <li>
                  Chooses <strong>Dine In</strong> (enters{" "}
                  {seatingLabel.toLowerCase()} no.) or{" "}
                  <strong>Take Away</strong>
                </li>
                <li>Browses your menu and places order</li>
              </ol>
            ) : (
              <ol className="list-decimal list-inside space-y-0.5 text-orange-600">
                <li>Customer scans this QR code</li>
                <li>Goes straight to your menu (Take Away)</li>
                <li>Places order and pays</li>
              </ol>
            )}
          </div>

          <div className="flex gap-2 flex-wrap">
            <Button
              size="sm"
              className="bg-orange-500 hover:bg-orange-600 text-white h-9"
              onClick={handleDownload}
              disabled={downloading || printing}
            >
              {downloading ? (
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5 mr-1.5" />
              )}
              Download PNG
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-9"
              onClick={handlePrint}
              disabled={printing || downloading}
            >
              {printing ? (
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              ) : (
                <Printer className="w-3.5 h-3.5 mr-1.5" />
              )}
              Print / Save PDF
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-9"
              onClick={() => window.open(menuUrl, "_blank")}
            >
              <ExternalLink className="w-3.5 h-3.5 mr-1.5" /> Preview Menu
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   Seating settings panel
───────────────────────────────────────────────────────────────────────────── */
function SeatingSettings({
  restaurant,
  onSaved,
}: {
  restaurant: Restaurant;
  onSaved: (label: string | null) => void;
}) {
  const [dineInEnabled, setDineInEnabled] = useState(
    restaurant.seatingLabel !== null,
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiFetch("/owner/restaurant", {
        method: "PUT",
        body: JSON.stringify({ seatingLabel: dineInEnabled ? "Table" : null }),
      });
      onSaved(dineInEnabled ? "Table" : null);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-orange-100 flex items-center justify-center shrink-0">
          <UtensilsCrossed className="w-4.5 h-4.5 text-orange-600" />
        </div>
        <div>
          <h2 className="font-bold text-base">Ordering Mode</h2>
          <p className="text-xs text-muted-foreground">
            Controls the customer ordering experience
          </p>
        </div>
      </div>

      <div className="p-5 space-y-5">
        <div className="flex gap-3">
          <button
            onClick={() => setDineInEnabled(false)}
            className={cn(
              "flex-1 flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all text-left",
              !dineInEnabled
                ? "border-primary bg-primary/5"
                : "border-border text-muted-foreground hover:border-primary/30",
            )}
          >
            <Store
              className={cn(
                "w-6 h-6",
                !dineInEnabled ? "text-primary" : "text-muted-foreground",
              )}
            />
            <div>
              <p
                className={cn(
                  "font-bold text-sm",
                  !dineInEnabled ? "text-primary" : "text-foreground",
                )}
              >
                Take Away Only
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Customers go straight to menu — no table selection
              </p>
            </div>
            {!dineInEnabled && (
              <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center self-end">
                <Check className="w-3 h-3 text-white" />
              </div>
            )}
          </button>

          <button
            onClick={() => setDineInEnabled(true)}
            className={cn(
              "flex-1 flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all text-left",
              dineInEnabled
                ? "border-primary bg-primary/5"
                : "border-border text-muted-foreground hover:border-primary/30",
            )}
          >
            <UtensilsCrossed
              className={cn(
                "w-6 h-6",
                dineInEnabled ? "text-primary" : "text-muted-foreground",
              )}
            />
            <div>
              <p
                className={cn(
                  "font-bold text-sm",
                  dineInEnabled ? "text-primary" : "text-foreground",
                )}
              >
                Dine-In Enabled
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Customers choose Dine In (enter table no.) or Take Away
              </p>
            </div>
            {dineInEnabled && (
              <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center self-end">
                <Check className="w-3 h-3 text-white" />
              </div>
            )}
          </button>
        </div>

        {dineInEnabled && (
          <p className="text-xs text-muted-foreground bg-orange-50 border border-orange-200 rounded-lg px-3 py-2">
            Customers will see <strong>"Dine In"</strong> and{" "}
            <strong>"Take Away"</strong> options. Dine In asks for their Table
            Number.
          </p>
        )}

        <Button
          onClick={handleSave}
          disabled={saving}
          className="bg-orange-500 hover:bg-orange-600 text-white h-9"
        >
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
          ) : saved ? (
            <Check className="w-4 h-4 mr-2 text-white" />
          ) : (
            <Save className="w-4 h-4 mr-2" />
          )}
          {saved ? "Saved!" : "Save Settings"}
        </Button>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   Main page
───────────────────────────────────────────────────────────────────────────── */
export default function TablesManagement() {
  const { user } = useAuth();
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [newTableNumber, setNewTableNumber] = useState("");
  const [formArea, setFormArea] = useState("");
  const [showNewAreaInput, setShowNewAreaInput] = useState(false);
  const [newAreaInput, setNewAreaInput] = useState("");
  const [addLoading, setAddLoading] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [rest, tabs] = await Promise.all([
        apiFetch<Restaurant>("/owner/restaurant"),
        apiFetch<RestaurantTable[]>("/owner/tables"),
      ]);
      setRestaurant(rest);
      setTables(tabs);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTableNumber.trim()) return;
    const area = showNewAreaInput ? newAreaInput.trim() : formArea.trim();
    setAddLoading(true);
    try {
      await apiFetch("/owner/tables", {
        method: "POST",
        body: JSON.stringify({
          tableNumber: newTableNumber.trim(),
          area: area || undefined,
        }),
      });
      setNewTableNumber("");
      if (showNewAreaInput && newAreaInput.trim()) {
        setFormArea(newAreaInput.trim());
        setShowNewAreaInput(false);
        setNewAreaInput("");
      }
      const tabs = await apiFetch<RestaurantTable[]>("/owner/tables");
      setTables(tabs);
    } finally {
      setAddLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this table?")) return;
    await apiFetch(`/owner/tables/${id}`, { method: "DELETE" });
    const tabs = await apiFetch<RestaurantTable[]>("/owner/tables");
    setTables(tabs);
  };

  const seatingLabel = restaurant?.seatingLabel ?? null;
  const labelName = seatingLabel ?? "Table";

  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </AppShell>
    );
  }

  if (loadError) {
    return (
      <AppShell>
        <div className="p-4 md:p-6 lg:p-8 max-w-4xl mx-auto">
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
            <p className="text-red-700 font-medium">{loadError}</p>
            <p className="text-sm text-red-500 mt-1">
              Your restaurant account could not be found. Please contact
              support.
            </p>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="p-4 md:p-6 lg:p-8 max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold">QR Code & Seating</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Configure your venue type, seating label, and customer ordering
            flow.
          </p>
        </div>

        {restaurant && (
          <SeatingSettings
            restaurant={restaurant}
            onSaved={(label) =>
              setRestaurant((r) => (r ? { ...r, seatingLabel: label } : r))
            }
          />
        )}

        {user?.restaurantId && restaurant && (
          <RestaurantQRSection
            restaurantId={user.restaurantId}
            restaurantSlug={restaurant.slug ?? undefined}
            restaurantName={restaurant.name}
            seatingLabel={seatingLabel}
          />
        )}

        {seatingLabel !== null &&
          (() => {
            const existingAreas = Array.from(
              new Set(
                tables.map((t) => t.area).filter((a): a is string => !!a),
              ),
            );
            const areaGroups = tables.reduce<Record<string, RestaurantTable[]>>(
              (acc, t) => {
                const key = t.area ?? "__none__";
                if (!acc[key]) acc[key] = [];
                acc[key].push(t);
                return acc;
              },
              {},
            );
            const sortedKeys = Object.keys(areaGroups).sort((a, b) =>
              a === "__none__" ? 1 : b === "__none__" ? -1 : a.localeCompare(b),
            );

            return (
              <div className="space-y-4">
                <div>
                  <h3 className="font-semibold text-base">{labelName} Setup</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Add your areas and {labelName.toLowerCase()}s. Customers
                    will select from these buttons — no manual typing.
                  </p>
                </div>

                <form
                  onSubmit={handleAdd}
                  className="bg-card border border-border rounded-xl p-4 space-y-4"
                >
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">
                      Step 1 — Select or create an area
                      <span className="text-muted-foreground font-normal ml-1">
                        (optional)
                      </span>
                    </Label>
                    <div className="flex flex-wrap gap-2">
                      {existingAreas.map((area) => (
                        <button
                          key={area}
                          type="button"
                          onClick={() => {
                            setFormArea(area);
                            setShowNewAreaInput(false);
                            setNewAreaInput("");
                          }}
                          className={cn(
                            "px-3 py-1.5 rounded-lg border text-sm font-medium transition-all",
                            formArea === area && !showNewAreaInput
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border bg-background hover:border-primary/50",
                          )}
                        >
                          {area}
                        </button>
                      ))}

                      <button
                        type="button"
                        onClick={() => {
                          setShowNewAreaInput(true);
                          setFormArea("");
                        }}
                        className={cn(
                          "px-3 py-1.5 rounded-lg border text-sm font-medium transition-all flex items-center gap-1",
                          showNewAreaInput
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-dashed border-border hover:border-primary/50 text-muted-foreground",
                        )}
                      >
                        <Plus className="w-3.5 h-3.5" /> New Area
                      </button>

                      {(formArea || showNewAreaInput) && (
                        <button
                          type="button"
                          onClick={() => {
                            setFormArea("");
                            setShowNewAreaInput(false);
                            setNewAreaInput("");
                          }}
                          className="px-3 py-1.5 rounded-lg border border-border text-sm text-muted-foreground hover:border-primary/50 transition-all"
                        >
                          No Area
                        </button>
                      )}
                    </div>

                    {showNewAreaInput && (
                      <Input
                        placeholder="Area name, e.g. Rooftop, Lounge, Ground Floor"
                        value={newAreaInput}
                        onChange={(e) => {
                          setNewAreaInput(e.target.value);
                        }}
                        className="h-10 max-w-xs"
                        autoFocus
                      />
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-medium">
                      Step 2 — Enter {labelName.toLowerCase()} number
                    </Label>
                    <div className="flex gap-3 items-center">
                      <Input
                        placeholder={`e.g. ${labelName} 1, A1, 12`}
                        value={newTableNumber}
                        onChange={(e) => setNewTableNumber(e.target.value)}
                        className="h-10 max-w-xs"
                      />
                      <Button
                        type="submit"
                        className="bg-orange-500 hover:bg-orange-600 text-white h-10 shrink-0"
                        disabled={addLoading || !newTableNumber.trim()}
                      >
                        {addLoading ? (
                          <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
                        ) : (
                          <Plus className="w-4 h-4 mr-1.5" />
                        )}
                        Add {labelName}
                      </Button>
                    </div>
                    {(formArea ||
                      (showNewAreaInput && newAreaInput.trim())) && (
                      <p className="text-xs text-muted-foreground">
                        Adding to area:{" "}
                        <strong>
                          {showNewAreaInput ? newAreaInput : formArea}
                        </strong>
                      </p>
                    )}
                  </div>
                </form>

                {tables.length === 0 ? (
                  <div className="text-center py-10 text-muted-foreground border-2 border-dashed border-border rounded-xl">
                    <QrCode className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm font-medium">
                      No {labelName.toLowerCase()}s added yet
                    </p>
                    <p className="text-xs mt-1">
                      Add areas and {labelName.toLowerCase()}s above — customers
                      will tap to select
                    </p>
                  </div>
                ) : (
                  <div className="space-y-5">
                    {sortedKeys.map((key) => (
                      <div key={key}>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                          <span className="w-4 h-px bg-border inline-block" />
                          {key === "__none__" ? "No Area" : key}
                          <span className="flex-1 h-px bg-border inline-block" />
                          <span className="normal-case font-normal tracking-normal">
                            {areaGroups[key].length} {labelName.toLowerCase()}
                            {areaGroups[key].length !== 1 ? "s" : ""}
                          </span>
                        </p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                          {areaGroups[key].map((table) => (
                            <div
                              key={table.id}
                              className={cn(
                                "bg-card border rounded-xl p-3 flex items-center justify-between gap-2",
                                table.isOccupied
                                  ? "border-orange-300 bg-orange-50/30"
                                  : "border-border",
                              )}
                            >
                              <div className="min-w-0">
                                <p className="font-semibold text-sm truncate">
                                  {table.tableNumber}
                                </p>
                                <span
                                  className={cn(
                                    "text-xs font-medium",
                                    table.isOccupied
                                      ? "text-orange-600"
                                      : "text-green-600",
                                  )}
                                >
                                  {table.isOccupied ? "Occupied" : "Available"}
                                </span>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                                  onClick={() => handleDelete(table.id)}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}
      </div>
    </AppShell>
  );
}
