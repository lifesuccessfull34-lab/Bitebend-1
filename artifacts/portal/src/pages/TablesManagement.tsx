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
  ExternalLink, UtensilsCrossed, Store, Save,
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
   QR label builder — always includes static "Table No: ______" placeholder.
   One QR per restaurant; owners write/stick the table number after printing.
───────────────────────────────────────────────────────────────────────────── */
async function buildQRLabelPNG(opts: {
  url: string;
  restaurantName: string;
  domain: string;
}): Promise<string> {
  const { url, restaurantName, domain } = opts;

  // Render at 2× physical pixels for print-crisp output
  const SCALE = 2;

  const W = 500;
  const HEADER_H = 160;
  const QR_SIZE = 300;
  const QR_PAD = 30;
  const QR_ZONE_H = QR_PAD + QR_SIZE + QR_PAD;
  const TABLE_H = 130;
  const FOOTER_H = 80;
  const H = HEADER_H + QR_ZONE_H + TABLE_H + FOOTER_H;

  // 1. Generate QR onto an offscreen canvas via qrcode lib.
  //    margin: 4 = ISO-standard quiet zone (4 modules). Without this many
  //    scanners (Google Lens, iPhone camera) refuse to read the code.
  //    errorCorrectionLevel "H" = 30% data recovery — best for printed codes.
  const qrCanvas = document.createElement("canvas");
  await QRCodeLib.toCanvas(qrCanvas, url, {
    width: QR_SIZE * SCALE,
    margin: 4,
    color: { dark: "#1a1a1a", light: "#ffffff" },
    errorCorrectionLevel: "H",
  });

  // 2. Build label canvas at 2× physical resolution for print sharpness
  const canvas = document.createElement("canvas");
  canvas.width = W * SCALE;
  canvas.height = H * SCALE;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(SCALE, SCALE);

  // ── Background ──────────────────────────────────────────────────────────
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);

  // ── Orange gradient header ──────────────────────────────────────────────
  const grad = ctx.createLinearGradient(0, 0, 0, HEADER_H);
  grad.addColorStop(0, "#ea580c");
  grad.addColorStop(1, "#c2410c");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, HEADER_H);

  // Header bottom accent stripe
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  ctx.fillRect(0, HEADER_H - 4, W, 4);

  // Restaurant name
  ctx.fillStyle = "#ffffff";
  ctx.font = "800 26px system-ui, -apple-system, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(restaurantName, W / 2, 78, W - 40);

  // Subtitle
  ctx.fillStyle = "rgba(255,255,255,0.88)";
  ctx.font = "500 16px system-ui, -apple-system, sans-serif";
  ctx.fillText("Scan to View Menu & Order", W / 2, 114);

  // ── QR zone ─────────────────────────────────────────────────────────────
  const qrTop = HEADER_H + QR_PAD;   // y where QR starts
  const qrLeft = (W - QR_SIZE) / 2;  // x centre

  // White card behind QR
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#e5e7eb";
  ctx.lineWidth = 1.5;
  const cardPad = 8;
  ctx.beginPath();
  const rx = qrLeft - cardPad;
  const ry = qrTop - cardPad;
  const rw = QR_SIZE + cardPad * 2;
  const rh = QR_SIZE + cardPad * 2;
  const radius = 10;
  ctx.moveTo(rx + radius, ry);
  ctx.lineTo(rx + rw - radius, ry);
  ctx.arcTo(rx + rw, ry, rx + rw, ry + radius, radius);
  ctx.lineTo(rx + rw, ry + rh - radius);
  ctx.arcTo(rx + rw, ry + rh, rx + rw - radius, ry + rh, radius);
  ctx.lineTo(rx + radius, ry + rh);
  ctx.arcTo(rx, ry + rh, rx, ry + rh - radius, radius);
  ctx.lineTo(rx, ry + radius);
  ctx.arcTo(rx, ry, rx + radius, ry, radius);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Draw QR
  ctx.drawImage(qrCanvas, qrLeft, qrTop, QR_SIZE, QR_SIZE);

  // ── Static "Table No: ______" placeholder ───────────────────────────────
  const tblTop = HEADER_H + QR_ZONE_H;

  // Separator
  ctx.fillStyle = "#e5e7eb";
  ctx.fillRect(40, tblTop + 14, W - 80, 1.5);

  // Static placeholder — bold, large, always printed
  ctx.fillStyle = "#111827";
  ctx.font = "900 46px system-ui, -apple-system, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillText("Table No: ______", W / 2, tblTop + 100, W - 40);

  // ── Footer ───────────────────────────────────────────────────────────────
  const footerTop = HEADER_H + QR_ZONE_H + TABLE_H;

  // Separator
  ctx.fillStyle = "#e5e7eb";
  ctx.fillRect(40, footerTop + 12, W - 80, 1.5);

  // Domain label — strip TLD, show only the brand name (e.g. "bitebend")
  ctx.fillStyle = "#6b7280";
  ctx.font = "500 30px system-ui, -apple-system, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(domain, W / 2, footerTop + 58);

  return canvas.toDataURL("image/png");
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
      // Strip TLD — e.g. "bitebend.replit.app" → "bitebend"
      const brandLabel = window.location.hostname.split(".")[0];
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
              disabled={downloading}
            >
              {downloading
                ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                : <Download className="w-3.5 h-3.5 mr-1.5" />}
              Download QR Label
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
