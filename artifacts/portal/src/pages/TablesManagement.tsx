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

// Injected at build time (see vite.config.ts define).
// __SITE_URL__: canonical production domain (e.g. https://bitebend.in) — takes priority.
// __REPLIT_DOMAINS__: .replit.app hostname — fallback when SITE_URL not set.
declare const __SITE_URL__: string;
declare const __REPLIT_DOMAINS__: string;

/* ─────────────────────────────────────────────────────────────────────────────
   QR label builder
   Physical size: 9.5 cm × 20 cm (portrait), rendered at 300 DPI.
   Layout (top → bottom):
     1. Orange gradient header — Bitebend brand + restaurant name
     2. Large centred QR code
     3. "Table No: ______" placeholder
     4. Footer — brand name at exactly 16 pt

   "Bitebend" brand text: 16 pt × (300 / 72) = 67 px
───────────────────────────────────────────────────────────────────────────── */

/** Convert centimetres → pixels at 300 DPI */
function cm(v: number) { return Math.round(v * 300 / 2.54); }
/** Convert points → pixels at 300 DPI */
function pt(v: number) { return Math.round(v * 300 / 72); }

async function buildQRLabelPNG(opts: {
  url: string;
  restaurantName: string;
  domain: string;
}): Promise<string> {
  const { url, restaurantName, domain } = opts;

  // ── Physical canvas: 9.5 cm wide × 20 cm tall at 300 DPI ─────────────────
  const W = cm(9.5);  // 1122 px
  const H = cm(20);   // 2362 px

  // ── Section heights ───────────────────────────────────────────────────────
  const HDR_H     = cm(4.0);   // header: 4 cm  — branding + restaurant name
  const QR_PAD_T  = cm(0.7);   // gap above QR
  const QR_SIZE   = cm(7.5);   // QR:  7.5 cm square — centred in 9.5 cm width
  const QR_PAD_B  = cm(0.6);   // gap below QR
  const FTR_H     = cm(2.0);   // footer: 2 cm  — "bitebend" at 16 pt

  // Derived
  const QR_LEFT  = Math.round((W - QR_SIZE) / 2);  // ~119 px — 1 cm margin each side
  const QR_TOP   = HDR_H + QR_PAD_T;
  const TBL_TOP  = QR_TOP + QR_SIZE + QR_PAD_B;
  const TBL_H    = H - TBL_TOP - FTR_H;            // remaining space for table placeholder
  const FTR_TOP  = H - FTR_H;

  const H_PAD    = cm(0.55);                        // horizontal text padding
  const MAX_TXT  = W - H_PAD * 2;

  // ── 1. Generate QR at full print resolution ───────────────────────────────
  //    margin:4 = ISO quiet zone; level H = 30% data recovery.
  const qrCanvas = document.createElement("canvas");
  await QRCodeLib.toCanvas(qrCanvas, url, {
    width: QR_SIZE,
    margin: 4,
    color: { dark: "#1a1a1a", light: "#ffffff" },
    errorCorrectionLevel: "H",
  });

  // ── 2. Compose label canvas ───────────────────────────────────────────────
  const canvas = document.createElement("canvas");
  canvas.width  = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  // White background
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);

  // ── Header: orange gradient ───────────────────────────────────────────────
  const grad = ctx.createLinearGradient(0, 0, 0, HDR_H);
  grad.addColorStop(0, "#ea580c");
  grad.addColorStop(1, "#c2410c");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, HDR_H);

  // Header accent stripe at bottom
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  ctx.fillRect(0, HDR_H - 4, W, 4);

  // "Bitebend" brand — centred, 16 pt, top quarter of header
  ctx.fillStyle    = "rgba(255,255,255,0.92)";
  ctx.font         = `700 ${pt(16)}px system-ui,-apple-system,sans-serif`;
  ctx.textAlign    = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(domain, W / 2, Math.round(HDR_H * 0.30));

  // Restaurant name — centred, 15 pt bold, mid-header
  ctx.fillStyle = "#ffffff";
  ctx.font      = `900 ${pt(15)}px system-ui,-apple-system,sans-serif`;
  ctx.fillText(restaurantName, W / 2, Math.round(HDR_H * 0.57), MAX_TXT);

  // Subtitle — centred, 9 pt, lower header
  ctx.fillStyle = "rgba(255,255,255,0.88)";
  ctx.font      = `500 ${pt(9)}px system-ui,-apple-system,sans-serif`;
  ctx.fillText("Scan to View Menu & Order", W / 2, Math.round(HDR_H * 0.80));

  // ── QR card ───────────────────────────────────────────────────────────────
  const cardPad = cm(0.22);
  const cx = QR_LEFT - cardPad;
  const cy = QR_TOP  - cardPad;
  const cw = QR_SIZE + cardPad * 2;
  const ch = QR_SIZE + cardPad * 2;
  const cr = cm(0.2);
  ctx.fillStyle   = "#ffffff";
  ctx.strokeStyle = "#e5e7eb";
  ctx.lineWidth   = 2;
  ctx.beginPath();
  ctx.moveTo(cx + cr, cy);
  ctx.lineTo(cx + cw - cr, cy);
  ctx.arcTo(cx + cw, cy,       cx + cw, cy + cr,      cr);
  ctx.lineTo(cx + cw, cy + ch - cr);
  ctx.arcTo(cx + cw, cy + ch,  cx + cw - cr, cy + ch, cr);
  ctx.lineTo(cx + cr, cy + ch);
  ctx.arcTo(cx,       cy + ch, cx, cy + ch - cr,       cr);
  ctx.lineTo(cx, cy + cr);
  ctx.arcTo(cx,       cy,      cx + cr, cy,             cr);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Draw QR centred in its card
  ctx.drawImage(qrCanvas, QR_LEFT, QR_TOP, QR_SIZE, QR_SIZE);

  // ── Table No placeholder section ──────────────────────────────────────────
  // Top separator
  ctx.fillStyle = "#e5e7eb";
  ctx.fillRect(H_PAD, TBL_TOP + cm(0.25), MAX_TXT, 2);

  // "Table No: ______" — centred, 22 pt
  ctx.fillStyle    = "#111827";
  ctx.font         = `900 ${pt(22)}px system-ui,-apple-system,sans-serif`;
  ctx.textAlign    = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("Table No: ______", W / 2, TBL_TOP + TBL_H / 2, MAX_TXT);

  // Bottom separator
  ctx.fillStyle = "#e5e7eb";
  ctx.fillRect(H_PAD, FTR_TOP - cm(0.25), MAX_TXT, 2);

  // ── Footer — brand name at exactly 16 pt ─────────────────────────────────
  ctx.fillStyle    = "#ea580c";
  ctx.font         = `700 ${pt(16)}px system-ui,-apple-system,sans-serif`;
  ctx.textAlign    = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(domain, W / 2, FTR_TOP + FTR_H / 2);

  return canvas.toDataURL("image/png");
}

/* ─────────────────────────────────────────────────────────────────────────────
   Print / PDF path — opens a new browser window with
   @page { size: 9.5cm 20cm; margin: 0 }
   Portrait layout (top → bottom):
     1. Orange gradient header — brand + restaurant name + subtitle
     2. Large centred QR code
     3. "Table No: ______" placeholder
     4. Footer — brand at exactly 16 pt
   Physical dimensions are exact regardless of screen DPI or browser zoom.
   "Save as PDF" from the print dialog produces a pixel-accurate PDF.
───────────────────────────────────────────────────────────────────────────── */
async function printQRLabel(opts: {
  url: string;
  restaurantName: string;
  domain: string;
}): Promise<boolean> {
  const { url, restaurantName, domain } = opts;

  // Generate QR as a data-URI for embedding in the print page
  const qrDataUrl = await QRCodeLib.toDataURL(url, {
    width: 600,
    margin: 4,
    color: { dark: "#1a1a1a", light: "#ffffff" },
    errorCorrectionLevel: "H",
  });

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>QR Label — ${restaurantName}</title>
<style>
  @page {
    size: 9.5cm 20cm;
    margin: 0;
  }
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body {
    width: 9.5cm;
    height: 20cm;
    overflow: hidden;
    background: #fff;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  /* ── Portrait label — column flex ────────────────────── */
  .label {
    display: flex;
    flex-direction: column;
    width: 9.5cm;
    height: 20cm;
    font-family: system-ui, -apple-system, 'Segoe UI', Arial, sans-serif;
  }

  /* ── Header: orange gradient ─────────────────────────── */
  .header {
    background: linear-gradient(180deg, #ea580c 0%, #c2410c 100%);
    padding: 0.55cm 0.55cm 0.5cm;
    text-align: center;
    flex-shrink: 0;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .brand-top {
    font-size: 16pt;
    font-weight: 700;
    color: rgba(255,255,255,0.92);
    letter-spacing: -0.01em;
    margin-bottom: 0.15cm;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .rest-name {
    font-size: 15pt;
    font-weight: 900;
    color: #fff;
    line-height: 1.15;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    margin-bottom: 0.18cm;
  }
  .scan-text {
    font-size: 9pt;
    font-weight: 500;
    color: rgba(255,255,255,0.88);
  }

  /* ── QR section ──────────────────────────────────────── */
  .qr-section {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.7cm 0 0.6cm;
    background: #fff;
  }
  .qr-wrap {
    background: #fff;
    border: 1.5px solid #e5e7eb;
    border-radius: 0.2cm;
    padding: 0.2cm;
    display: inline-flex;
  }
  .qr-wrap img {
    display: block;
    width: 7.5cm;
    height: 7.5cm;
    image-rendering: crisp-edges;
    image-rendering: pixelated;
  }

  /* ── Table placeholder section ───────────────────────── */
  .table-section {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.3cm;
    padding: 0 0.55cm;
    overflow: hidden;
  }
  .divider {
    width: 100%;
    height: 1px;
    background: #e5e7eb;
    flex-shrink: 0;
  }
  .table-label {
    font-size: 22pt;
    font-weight: 900;
    color: #111827;
    letter-spacing: -0.02em;
    line-height: 1;
    white-space: nowrap;
    text-align: center;
  }

  /* ── Footer: brand at exactly 16 pt ─────────────────── */
  .footer {
    flex-shrink: 0;
    height: 2cm;
    border-top: 1px solid #e5e7eb;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .brand-footer {
    font-size: 16pt;
    font-weight: 700;
    color: #ea580c;
    letter-spacing: -0.02em;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
</style>
</head>
<body>
<div class="label">
  <div class="header">
    <div class="brand-top">${domain}</div>
    <div class="rest-name">${restaurantName}</div>
    <div class="scan-text">Scan to View Menu &amp; Order</div>
  </div>
  <div class="qr-section">
    <div class="qr-wrap">
      <img src="${qrDataUrl}" alt="QR Code" />
    </div>
  </div>
  <div class="table-section">
    <div class="divider"></div>
    <div class="table-label">Table No: ______</div>
    <div class="divider"></div>
  </div>
  <div class="footer">
    <span class="brand-footer">${domain}</span>
  </div>
</div>
</body>
</html>`;

  const win = window.open("", "_blank", "width=500,height=800");
  if (!win) return false;
  win.document.write(html);
  win.document.close();
  // Give the browser a moment to render before opening the print dialog
  setTimeout(() => win.print(), 350);
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

  // Strip TLD — e.g. "bitebend.replit.app" → "bitebend"
  const brandLabel = window.location.hostname.split(".")[0];

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
        domain: brandLabel,
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
        domain: brandLabel,
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
