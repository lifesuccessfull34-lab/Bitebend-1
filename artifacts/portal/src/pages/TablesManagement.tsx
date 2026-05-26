import { useState, useEffect, useCallback } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import type { Restaurant, RestaurantTable } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Plus, Trash2, Loader2, Download, QrCode, Copy, Check,
  ExternalLink, UtensilsCrossed, Store, Save, Printer,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { QRCodeCanvas } from "qrcode.react";
import QRCodeLib from "qrcode";
import bitebendLogoUrl from "@/assets/bitebend-logo-qr.png";

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
function cm(v: number) { return Math.round(v * 300 / 2.54); }
/** Convert points → pixels at 300 DPI */
function pt(v: number) { return Math.round(v * 300 / 72); }

/** Load an image element from a URL (resolves when fully decoded). */
function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload  = () => resolve(img);
    img.onerror = reject;
    img.crossOrigin = "anonymous";
    img.src = src;
  });
}

/** Fetch a URL and return it as a base64 data-URI (for print popup embedding). */
async function toDataUri(url: string): Promise<string> {
  const blob = await fetch(url).then((r) => r.blob());
  return new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.readAsDataURL(blob);
  });
}

async function buildQRLabelPNG(opts: {
  url: string;
  restaurantName: string;
}): Promise<string> {
  const { url, restaurantName } = opts;

  // ── Physical canvas: 8.5 cm wide × 14 cm tall at 300 DPI ─────────────────
  const W = cm(8.5);   // 1004 px
  const H = cm(14);    // 1654 px

  // ── Layout anchor points (Y-centre of each text / top of QR) ─────────────
  // Vertical allocation (cm): 0.8 pad + 1.4 name + 0.5 gap + 1.2 subtitle
  //   + 0.5 gap + 5.0 QR + 0.6 gap + 1.4 table + 0.5 gap + 1.0 brand + 0.8 pad = 14 cm
  const NAME_Y     = cm(0.8 + 0.7);             // centre of name block    = 1.5 cm
  const SUBTITLE_Y = cm(0.8 + 1.4 + 0.5 + 0.6); // centre of subtitle block = 3.3 cm
  const QR_TOP     = cm(0.8 + 1.4 + 0.5 + 1.2 + 0.5); // QR top edge = 4.4 cm
  const QR_SIZE    = cm(5.0);                   // 591 px square
  const QR_LEFT    = Math.round((W - QR_SIZE) / 2);
  const TABLE_Y    = cm(4.4 + 5.0 + 0.6 + 0.7); // centre of table block = 10.7 cm
  const BRAND_Y    = cm(4.4 + 5.0 + 0.6 + 1.4 + 0.5 + 0.5); // centre of brand = 12.4 cm

  const H_PAD  = cm(0.6);
  const MAX_TXT = W - H_PAD * 2;

  // ── 1. Generate QR at full print resolution ───────────────────────────────
  //    margin 4 = ISO quiet zone; level H = 30 % data recovery (logo safe).
  const qrCanvas = document.createElement("canvas");
  await QRCodeLib.toCanvas(qrCanvas, url, {
    width: QR_SIZE,
    margin: 4,
    color: { dark: "#1a1a1a", light: "#ffffff" },
    errorCorrectionLevel: "H",
  });

  // ── 2. Load Bitebend logo ─────────────────────────────────────────────────
  const logoImg = await loadImg(bitebendLogoUrl).catch(() => null);

  // ── 3. Compose label canvas ───────────────────────────────────────────────
  const canvas = document.createElement("canvas");
  canvas.width  = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  // White background
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);

  // Thin border
  ctx.strokeStyle = "#d1d5db";
  ctx.lineWidth   = 3;
  ctx.strokeRect(2, 2, W - 4, H - 4);

  // ── Restaurant name — 28 pt bold ──────────────────────────────────────────
  ctx.fillStyle    = "#111827";
  ctx.font         = `700 ${pt(28)}px system-ui,-apple-system,sans-serif`;
  ctx.textAlign    = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(restaurantName, W / 2, NAME_Y, MAX_TXT);

  // ── Subtitle — 24 pt ──────────────────────────────────────────────────────
  ctx.fillStyle = "#6b7280";
  ctx.font      = `400 ${pt(24)}px system-ui,-apple-system,sans-serif`;
  ctx.fillText("Scan to View Menu & Order", W / 2, SUBTITLE_Y, MAX_TXT);

  // ── QR code ───────────────────────────────────────────────────────────────
  // Subtle card shadow / border around QR
  const cardPad = cm(0.18);
  const cardX   = QR_LEFT - cardPad;
  const cardY   = QR_TOP  - cardPad;
  const cardW   = QR_SIZE + cardPad * 2;
  const cardH   = QR_SIZE + cardPad * 2;
  const cardR   = cm(0.18);
  ctx.fillStyle   = "#ffffff";
  ctx.strokeStyle = "#e5e7eb";
  ctx.lineWidth   = 2;
  ctx.beginPath();
  ctx.moveTo(cardX + cardR, cardY);
  ctx.lineTo(cardX + cardW - cardR, cardY);
  ctx.arcTo(cardX + cardW, cardY,      cardX + cardW, cardY + cardR,      cardR);
  ctx.lineTo(cardX + cardW, cardY + cardH - cardR);
  ctx.arcTo(cardX + cardW, cardY + cardH, cardX + cardW - cardR, cardY + cardH, cardR);
  ctx.lineTo(cardX + cardR, cardY + cardH);
  ctx.arcTo(cardX,          cardY + cardH, cardX, cardY + cardH - cardR,  cardR);
  ctx.lineTo(cardX, cardY + cardR);
  ctx.arcTo(cardX,          cardY,         cardX + cardR, cardY,          cardR);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.drawImage(qrCanvas, QR_LEFT, QR_TOP, QR_SIZE, QR_SIZE);

  // ── Bitebend logo centred on QR ───────────────────────────────────────────
  if (logoImg) {
    const LOGO_SIZE = cm(1.1);   // 1.1 cm — safe ≈ 22 % of QR width (well under H-level 30 %)
    const logoX = QR_LEFT  + Math.round((QR_SIZE - LOGO_SIZE) / 2);
    const logoY = QR_TOP   + Math.round((QR_SIZE - LOGO_SIZE) / 2);
    // White backing square so logo sits cleanly on QR pattern
    const backing = LOGO_SIZE + cm(0.12);
    const backX   = QR_LEFT + Math.round((QR_SIZE - backing) / 2);
    const backY   = QR_TOP  + Math.round((QR_SIZE - backing) / 2);
    const backR   = cm(0.1);
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.moveTo(backX + backR, backY);
    ctx.lineTo(backX + backing - backR, backY);
    ctx.arcTo(backX + backing, backY,     backX + backing, backY + backR,     backR);
    ctx.lineTo(backX + backing, backY + backing - backR);
    ctx.arcTo(backX + backing, backY + backing, backX + backing - backR, backY + backing, backR);
    ctx.lineTo(backX + backR, backY + backing);
    ctx.arcTo(backX,           backY + backing, backX, backY + backing - backR, backR);
    ctx.lineTo(backX, backY + backR);
    ctx.arcTo(backX,           backY,   backX + backR, backY,   backR);
    ctx.closePath();
    ctx.fill();
    ctx.drawImage(logoImg, logoX, logoY, LOGO_SIZE, LOGO_SIZE);
  }

  // ── Divider above table number ────────────────────────────────────────────
  const divY = QR_TOP + QR_SIZE + cm(0.25);
  ctx.strokeStyle = "#e5e7eb";
  ctx.lineWidth   = 2;
  ctx.beginPath();
  ctx.moveTo(H_PAD, divY);
  ctx.lineTo(W - H_PAD, divY);
  ctx.stroke();

  // ── Table No — 26 pt bold ─────────────────────────────────────────────────
  ctx.fillStyle    = "#111827";
  ctx.font         = `700 ${pt(26)}px system-ui,-apple-system,sans-serif`;
  ctx.textAlign    = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("Table No: ______", W / 2, TABLE_Y, MAX_TXT);

  // ── Divider above brand footer ────────────────────────────────────────────
  const divY2 = BRAND_Y - cm(0.6);
  ctx.strokeStyle = "#e5e7eb";
  ctx.lineWidth   = 2;
  ctx.beginPath();
  ctx.moveTo(H_PAD, divY2);
  ctx.lineTo(W - H_PAD, divY2);
  ctx.stroke();

  // ── "Bitebend" footer — 22 pt, orange ────────────────────────────────────
  ctx.fillStyle    = "#ea580c";
  ctx.font         = `700 ${pt(22)}px system-ui,-apple-system,sans-serif`;
  ctx.textAlign    = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("Bitebend", W / 2, BRAND_Y);

  return canvas.toDataURL("image/png");
}

/* ─────────────────────────────────────────────────────────────────────────────
   Print / PDF path — opens a new browser window with
   @page { size: 8.5cm 14cm; margin: 0 }
   Portrait layout (top → bottom):
     1. Restaurant name — 28 pt bold, centred
     2. Subtitle — 24 pt, centred
     3. QR code — 5 cm × 5 cm, centred, Bitebend logo overlaid in centre
     4. "Table No: ______" — 26 pt bold, centred
     5. "Bitebend" footer — 22 pt, orange, centred
   Physical dimensions are exact regardless of screen DPI or browser zoom.
   "Save as PDF" from the print dialog produces a pixel-accurate PDF.
───────────────────────────────────────────────────────────────────────────── */
async function printQRLabel(opts: {
  url: string;
  restaurantName: string;
}): Promise<boolean> {
  const { url, restaurantName } = opts;

  // Generate QR as a data-URI (600 px → rendered at 5 cm = ~118 DPI crisp print)
  const qrDataUrl = await QRCodeLib.toDataURL(url, {
    width: 600,
    margin: 4,
    color: { dark: "#1a1a1a", light: "#ffffff" },
    errorCorrectionLevel: "H",
  });

  // Load logo as data-URI so it embeds cleanly in the popup (no origin restrictions)
  const logoDataUrl = await toDataUri(bitebendLogoUrl).catch(() => "");

  const logoHtml = logoDataUrl
    ? `<img class="qr-logo" src="${logoDataUrl}" alt="" />`
    : "";

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

  /* ── Portrait label — column flex ──────────────────────────── */
  .label {
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 8.5cm;
    height: 14cm;
    padding: 0.8cm 0.6cm;
    font-family: system-ui, -apple-system, 'Segoe UI', Arial, sans-serif;
    border: 0.8px solid #d1d5db;
  }

  /* ── Restaurant name — 28 pt bold ──────────────────────────── */
  .rest-name {
    font-size: 28pt;
    font-weight: 700;
    color: #111827;
    text-align: center;
    line-height: 1.15;
    width: 100%;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    flex-shrink: 0;
    margin-bottom: 0.15cm;
  }

  /* ── Subtitle — 24 pt ──────────────────────────────────────── */
  .subtitle {
    font-size: 24pt;
    font-weight: 400;
    color: #6b7280;
    text-align: center;
    line-height: 1.2;
    width: 100%;
    flex-shrink: 0;
  }

  /* ── Spacer fills remaining vertical space evenly ─────────── */
  .spacer { flex: 1; }

  /* ── QR section ────────────────────────────────────────────── */
  .qr-section {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .qr-container {
    position: relative;
    display: inline-block;
    border: 1.5px solid #e5e7eb;
    border-radius: 0.18cm;
    padding: 0.18cm;
    background: #fff;
    line-height: 0;
  }
  .qr-container img.qr-img {
    display: block;
    width: 5cm;
    height: 5cm;
    image-rendering: crisp-edges;
    image-rendering: pixelated;
  }
  .qr-logo {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 1.1cm;
    height: 1.1cm;
    object-fit: contain;
    background: #fff;
    padding: 0.06cm;
    border-radius: 0.1cm;
  }

  /* ── Dividers ───────────────────────────────────────────────── */
  .divider {
    width: 100%;
    height: 1px;
    background: #e5e7eb;
    flex-shrink: 0;
  }

  /* ── Table number — 26 pt bold ─────────────────────────────── */
  .table-label {
    font-size: 26pt;
    font-weight: 700;
    color: #111827;
    text-align: center;
    line-height: 1;
    white-space: nowrap;
    flex-shrink: 0;
    padding: 0.35cm 0;
  }

  /* ── Brand footer — 22 pt orange ───────────────────────────── */
  .brand-footer {
    font-size: 22pt;
    font-weight: 700;
    color: #ea580c;
    text-align: center;
    letter-spacing: -0.01em;
    flex-shrink: 0;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
</style>
</head>
<body>
<div class="label">
  <div class="rest-name">${restaurantName}</div>
  <div class="subtitle">Scan to View Menu &amp; Order</div>
  <div class="spacer"></div>
  <div class="qr-section">
    <div class="qr-container">
      <img class="qr-img" src="${qrDataUrl}" alt="QR Code" />
      ${logoHtml}
    </div>
  </div>
  <div class="spacer"></div>
  <div class="divider"></div>
  <div class="table-label">Table No: ______</div>
  <div class="divider"></div>
  <div class="spacer"></div>
  <div class="brand-footer">Bitebend</div>
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
function RestaurantQRSection({ restaurantId, restaurantSlug, restaurantName, seatingLabel }: {
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
    (__SITE_URL__ && __SITE_URL__.trim()) ||
    (() => {
      const d = __REPLIT_DOMAINS__?.split(",")[0]?.trim();
      return d ? `https://${d}` : null;
    })() ||
    window.location.origin;
  // Use slug for clean URLs; fall back to numeric ID for backward compat.
  const menuUrl = `${_publicOrigin}/menu/${restaurantSlug ?? restaurantId}`;

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
        alert("Pop-up blocked. Please allow pop-ups for this site, then try again.");
      }
    } finally {
      setPrinting(false);
    }
  };

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <div className="bg-gradient-to-r from-orange-500 to-amber-500 px-5 py-4">
        <h2 className="text-white font-bold text-base">Your Restaurant QR Code</h2>
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
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Menu Link</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs bg-muted px-3 py-2 rounded-lg truncate font-mono border border-border">
                {menuUrl}
              </code>
              <Button size="sm" variant="outline" className="h-8 shrink-0" onClick={handleCopy}>
                {copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
              </Button>
            </div>
          </div>

          <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 text-xs text-orange-700 space-y-1">
            <p className="font-semibold">How it works for customers:</p>
            {seatingLabel ? (
              <ol className="list-decimal list-inside space-y-0.5 text-orange-600">
                <li>Customer scans this QR code</li>
                <li>Chooses <strong>Dine In</strong> (enters {seatingLabel.toLowerCase()} no.) or <strong>Take Away</strong></li>
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
              {downloading
                ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                : <Download className="w-3.5 h-3.5 mr-1.5" />}
              Download PNG
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-9"
              onClick={handlePrint}
              disabled={printing || downloading}
            >
              {printing
                ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                : <Printer className="w-3.5 h-3.5 mr-1.5" />}
              Print / Save PDF
            </Button>
            <Button size="sm" variant="outline" className="h-9" onClick={() => window.open(menuUrl, "_blank")}>
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
function SeatingSettings({ restaurant, onSaved }: { restaurant: Restaurant; onSaved: (label: string | null) => void }) {
  const [dineInEnabled, setDineInEnabled] = useState(restaurant.seatingLabel !== null);
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
          <p className="text-xs text-muted-foreground">Controls the customer ordering experience</p>
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
                : "border-border text-muted-foreground hover:border-primary/30"
            )}
          >
            <Store className={cn("w-6 h-6", !dineInEnabled ? "text-primary" : "text-muted-foreground")} />
            <div>
              <p className={cn("font-bold text-sm", !dineInEnabled ? "text-primary" : "text-foreground")}>Take Away Only</p>
              <p className="text-xs text-muted-foreground mt-0.5">Customers go straight to menu — no table selection</p>
            </div>
            {!dineInEnabled && <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center self-end"><Check className="w-3 h-3 text-white" /></div>}
          </button>

          <button
            onClick={() => setDineInEnabled(true)}
            className={cn(
              "flex-1 flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all text-left",
              dineInEnabled
                ? "border-primary bg-primary/5"
                : "border-border text-muted-foreground hover:border-primary/30"
            )}
          >
            <UtensilsCrossed className={cn("w-6 h-6", dineInEnabled ? "text-primary" : "text-muted-foreground")} />
            <div>
              <p className={cn("font-bold text-sm", dineInEnabled ? "text-primary" : "text-foreground")}>Dine-In Enabled</p>
              <p className="text-xs text-muted-foreground mt-0.5">Customers choose Dine In (enter table no.) or Take Away</p>
            </div>
            {dineInEnabled && <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center self-end"><Check className="w-3 h-3 text-white" /></div>}
          </button>
        </div>

        {dineInEnabled && (
          <p className="text-xs text-muted-foreground bg-orange-50 border border-orange-200 rounded-lg px-3 py-2">
            Customers will see <strong>"Dine In"</strong> and <strong>"Take Away"</strong> options. Dine In asks for their Table Number.
          </p>
        )}

        <Button
          onClick={handleSave}
          disabled={saving}
          className="bg-orange-500 hover:bg-orange-600 text-white h-9"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : saved ? <Check className="w-4 h-4 mr-2 text-white" /> : <Save className="w-4 h-4 mr-2" />}
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

  useEffect(() => { fetchData(); }, [fetchData]);

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
              Your restaurant account could not be found. Please contact support.
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
            Configure your venue type, seating label, and customer ordering flow.
          </p>
        </div>

        {restaurant && (
          <SeatingSettings
            restaurant={restaurant}
            onSaved={(label) => setRestaurant((r) => r ? { ...r, seatingLabel: label } : r)}
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

        {seatingLabel !== null && (() => {
          const existingAreas = Array.from(new Set(tables.map((t) => t.area).filter((a): a is string => !!a)));
          const areaGroups = tables.reduce<Record<string, RestaurantTable[]>>((acc, t) => {
            const key = t.area ?? "__none__";
            if (!acc[key]) acc[key] = [];
            acc[key].push(t);
            return acc;
          }, {});
          const sortedKeys = Object.keys(areaGroups).sort((a, b) =>
            a === "__none__" ? 1 : b === "__none__" ? -1 : a.localeCompare(b)
          );

          return (
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold text-base">{labelName} Setup</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Add your areas and {labelName.toLowerCase()}s. Customers will select from these buttons — no manual typing.
                </p>
              </div>

              <form onSubmit={handleAdd} className="bg-card border border-border rounded-xl p-4 space-y-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">
                    Step 1 — Select or create an area
                    <span className="text-muted-foreground font-normal ml-1">(optional)</span>
                  </Label>
                  <div className="flex flex-wrap gap-2">
                    {existingAreas.map((area) => (
                      <button
                        key={area}
                        type="button"
                        onClick={() => { setFormArea(area); setShowNewAreaInput(false); setNewAreaInput(""); }}
                        className={cn(
                          "px-3 py-1.5 rounded-lg border text-sm font-medium transition-all",
                          formArea === area && !showNewAreaInput
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-background hover:border-primary/50"
                        )}
                      >
                        {area}
                      </button>
                    ))}

                    <button
                      type="button"
                      onClick={() => { setShowNewAreaInput(true); setFormArea(""); }}
                      className={cn(
                        "px-3 py-1.5 rounded-lg border text-sm font-medium transition-all flex items-center gap-1",
                        showNewAreaInput
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-dashed border-border hover:border-primary/50 text-muted-foreground"
                      )}
                    >
                      <Plus className="w-3.5 h-3.5" /> New Area
                    </button>

                    {(formArea || showNewAreaInput) && (
                      <button
                        type="button"
                        onClick={() => { setFormArea(""); setShowNewAreaInput(false); setNewAreaInput(""); }}
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
                      onChange={(e) => { setNewAreaInput(e.target.value); }}
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
                      {addLoading
                        ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
                        : <Plus className="w-4 h-4 mr-1.5" />}
                      Add {labelName}
                    </Button>
                  </div>
                  {(formArea || (showNewAreaInput && newAreaInput.trim())) && (
                    <p className="text-xs text-muted-foreground">
                      Adding to area: <strong>{showNewAreaInput ? newAreaInput : formArea}</strong>
                    </p>
                  )}
                </div>
              </form>

              {tables.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground border-2 border-dashed border-border rounded-xl">
                  <QrCode className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm font-medium">No {labelName.toLowerCase()}s added yet</p>
                  <p className="text-xs mt-1">Add areas and {labelName.toLowerCase()}s above — customers will tap to select</p>
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
                          {areaGroups[key].length} {labelName.toLowerCase()}{areaGroups[key].length !== 1 ? "s" : ""}
                        </span>
                      </p>
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                        {areaGroups[key].map((table) => (
                          <div
                            key={table.id}
                            className={cn(
                              "bg-card border rounded-xl p-3 flex items-center justify-between gap-2",
                              table.isOccupied ? "border-orange-300 bg-orange-50/30" : "border-border"
                            )}
                          >
                            <div className="min-w-0">
                              <p className="font-semibold text-sm truncate">{table.tableNumber}</p>
                              <span className={cn(
                                "text-xs font-medium",
                                table.isOccupied ? "text-orange-600" : "text-green-600"
                              )}>
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
