import React, { useState } from "react";
import "./_shared/_group.css";
import {
  LayoutDashboard, ChefHat, MenuSquare, QrCode, TrendingUp,
  Settings, Bell, User, Clock, Download, Copy, Printer,
  Check, Smartphone, RefreshCw, ExternalLink, Info
} from "lucide-react";

const restaurantUrl = "https://tableserve.in/menu/spicehouse";

function QRPattern({ size = 200 }: { size?: number }) {
  const cells = 25;
  const cellSize = size / cells;
  const seed = 42;

  const getCell = (r: number, c: number) => {
    if (r < 7 && c < 7) return true;
    if (r < 7 && c > cells - 8) return true;
    if (r > cells - 8 && c < 7) return true;
    if (r < 3 && c < 3) return false;
    if (r < 3 && c > cells - 4) return false;
    if (r > cells - 4 && c < 3) return false;
    if (r === 6 || c === 6) return r < 8 || c < 8 || r > cells - 9 || c > cells - 9 ? false : (r + c) % 2 === 0;
    return ((r * 11 + c * 17 + seed * 5) % 3) !== 0;
  };

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: "block" }}>
      <rect width={size} height={size} fill="white" />
      {Array.from({ length: cells }, (_, r) =>
        Array.from({ length: cells }, (_, c) =>
          getCell(r, c) ? (
            <rect
              key={`${r}-${c}`}
              x={c * cellSize + 0.5}
              y={r * cellSize + 0.5}
              width={cellSize - 0.5}
              height={cellSize - 0.5}
              fill="#13141A"
              rx="0.5"
            />
          ) : null
        )
      )}
    </svg>
  );
}

function CopiedBadge() {
  return (
    <span className="flex items-center gap-1 text-green-400 text-xs font-bold">
      <Check className="w-3 h-3" /> Copied
    </span>
  );
}

export function AdminQRCodes() {
  const [copied, setCopied] = useState(false);
  const [showRegenConfirm, setShowRegenConfirm] = useState(false);

  const totalScans = 582;
  const todayScans = 68;
  const weekScans = 321;

  const handleCopy = () => {
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="restaurant-app-admin min-h-screen bg-background flex font-sans text-foreground">
      {/* Sidebar */}
      <aside className="w-64 border-r border-border bg-card flex flex-col shrink-0">
        <div className="p-6 pb-8">
          <h1 className="text-2xl font-extrabold tracking-tight flex items-center gap-2">
            <span className="text-primary bg-primary/10 p-1.5 rounded-lg border border-primary/20">
              <ChefHat className="w-6 h-6" />
            </span>
            TableServe<span className="text-primary">.</span>
          </h1>
        </div>
        <nav className="flex-1 px-3 space-y-1">
          {[
            { icon: LayoutDashboard, label: "Dashboard" },
            { icon: Clock, label: "Live Orders", badge: "24" },
            { icon: MenuSquare, label: "Menu Manager" },
            { icon: QrCode, label: "QR Code", active: true },
            { icon: TrendingUp, label: "Revenue" },
          ].map(({ icon: Icon, label, badge, active }) => (
            <a
              key={label}
              href="#"
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg font-medium transition-colors ${
                active
                  ? "bg-primary/10 text-primary font-bold shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              <Icon className="w-5 h-5" /> {label}
              {badge && (
                <span className="ml-auto bg-primary text-primary-foreground text-xs px-2 py-0.5 rounded-full">{badge}</span>
              )}
            </a>
          ))}
        </nav>
        <div className="p-3 border-t border-border mt-auto">
          <a href="#" className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors font-medium">
            <Settings className="w-5 h-5" /> Settings
          </a>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="h-20 border-b border-border bg-background flex items-center justify-between px-8 shrink-0">
          <div>
            <h2 className="text-2xl font-extrabold tracking-tight">Restaurant QR Code</h2>
            <p className="text-sm text-muted-foreground">One code for your entire restaurant — customers enter their table on arrival</p>
          </div>
          <div className="flex items-center gap-6">
            <button className="relative text-muted-foreground hover:text-foreground transition-colors">
              <Bell className="w-5 h-5" />
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-background" />
            </button>
            <div className="flex items-center gap-3 border-l border-border pl-6">
              <div className="text-right hidden md:block">
                <p className="text-sm font-bold">The Spice House</p>
                <p className="text-xs text-muted-foreground">Admin</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-primary/20 border border-primary flex items-center justify-center text-primary font-bold">
                <User className="w-5 h-5" />
              </div>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-8">
          {/* How it works banner */}
          <div className="flex items-start gap-3 bg-primary/5 border border-primary/20 rounded-xl px-5 py-4 mb-8">
            <Info className="w-5 h-5 text-primary mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-bold text-primary">How it works</p>
              <p className="text-sm text-muted-foreground mt-0.5">
                Place this single QR code on every table, at your entrance, and on takeaway receipts.
                When customers scan it, they will enter their table number or choose Takeaway — no separate QR per table needed.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-[auto,1fr] gap-8 items-start">
            {/* QR Code card */}
            <div className="flex flex-col items-center gap-5">
              <div className="bg-white rounded-3xl p-7 border border-border shadow-xl shadow-black/20">
                {/* Restaurant branding above QR */}
                <div className="text-center mb-5">
                  <div className="inline-flex items-center gap-2 mb-1">
                    <div className="w-6 h-6 rounded bg-[#F4821F] flex items-center justify-center">
                      <ChefHat className="w-4 h-4 text-white" />
                    </div>
                    <span className="text-base font-extrabold text-gray-900 tracking-tight">TableServe</span>
                  </div>
                  <p className="text-[11px] font-bold text-gray-700 uppercase tracking-[0.15em]">The Spice House</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">Bandra, Mumbai</p>
                </div>

                <QRPattern size={200} />

                {/* Below QR */}
                <div className="text-center mt-5">
                  <p className="text-sm font-extrabold text-gray-900">Scan to Order</p>
                  <p className="text-[11px] text-gray-400 mt-1">Enter table number or choose Takeaway</p>
                  <div className="mt-3 border-t border-gray-100 pt-3">
                    <p className="text-[9px] text-gray-300 font-mono break-all">tableserve.in/menu/spicehouse</p>
                  </div>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex gap-2 w-full">
                <button className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-bold hover:bg-primary/90 transition-all shadow-lg shadow-primary/20">
                  <Download className="w-4 h-4" /> Download PNG
                </button>
                <button className="flex items-center justify-center gap-2 px-4 py-2.5 bg-muted border border-border rounded-xl text-sm font-semibold text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-all">
                  <Printer className="w-4 h-4" /> Print
                </button>
              </div>

              <button className="flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors w-full justify-center">
                <Smartphone className="w-4 h-4" /> Test on phone
              </button>
            </div>

            {/* Right panel */}
            <div className="flex flex-col gap-6">
              {/* Scan stats */}
              <div className="bg-card border border-border rounded-2xl p-6">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-4">Scan Activity</p>
                <div className="grid grid-cols-3 gap-4">
                  {[
                    { label: "Today", value: todayScans, color: "text-foreground" },
                    { label: "This Week", value: weekScans, color: "text-foreground" },
                    { label: "All Time", value: totalScans, color: "text-primary" },
                  ].map(stat => (
                    <div key={stat.label} className="bg-muted rounded-xl px-5 py-4 text-center">
                      <p className={`text-3xl font-extrabold ${stat.color}`}>{stat.value}</p>
                      <p className="text-xs text-muted-foreground mt-1">{stat.label}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Menu URL */}
              <div className="bg-card border border-border rounded-2xl p-6">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Menu URL</p>
                <div className="flex items-center gap-3 bg-muted border border-border rounded-xl px-4 py-3">
                  <ExternalLink className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span className="text-sm font-mono text-muted-foreground flex-1 truncate">{restaurantUrl}</span>
                  <button onClick={handleCopy} className="shrink-0 ml-2">
                    {copied ? <CopiedBadge /> : <Copy className="w-4 h-4 text-muted-foreground hover:text-primary transition-colors" />}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Share this link directly or embed it in your website — it works exactly like the QR code.
                </p>
              </div>

              {/* Customer flow preview */}
              <div className="bg-card border border-border rounded-2xl p-6">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-4">Customer Experience After Scan</p>
                <div className="flex items-center gap-0">
                  {[
                    { step: "1", label: "Scan QR", sub: "Camera opens menu link" },
                    { step: "2", label: "Enter Table", sub: "Type table no. or pick Takeaway" },
                    { step: "3", label: "Browse Menu", sub: "Dynamic, real-time menu" },
                    { step: "4", label: "Order & Pay", sub: "UPI, Card or Pay at Counter" },
                  ].map((s, i, arr) => (
                    <React.Fragment key={s.step}>
                      <div className="flex flex-col items-center gap-2 flex-1">
                        <div className="w-9 h-9 rounded-full bg-primary/10 border border-primary/30 text-primary font-extrabold text-sm flex items-center justify-center">
                          {s.step}
                        </div>
                        <p className="text-xs font-bold text-center leading-tight">{s.label}</p>
                        <p className="text-[11px] text-muted-foreground text-center leading-tight">{s.sub}</p>
                      </div>
                      {i < arr.length - 1 && (
                        <div className="w-8 h-px bg-border mb-6 shrink-0" />
                      )}
                    </React.Fragment>
                  ))}
                </div>
              </div>

              {/* Regenerate */}
              <div className="bg-card border border-border rounded-2xl p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-bold text-sm">Regenerate QR Code</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Generates a new code and invalidates the existing one. You will need to reprint and replace all physical copies.
                    </p>
                  </div>
                  {showRegenConfirm ? (
                    <div className="flex gap-2 shrink-0">
                      <button onClick={() => setShowRegenConfirm(false)} className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-border text-muted-foreground hover:text-foreground transition-all">Cancel</button>
                      <button onClick={() => setShowRegenConfirm(false)} className="px-3 py-1.5 text-xs font-bold rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500 hover:text-white transition-all">Confirm</button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowRegenConfirm(true)}
                      className="flex items-center gap-2 px-4 py-2 bg-muted border border-border rounded-xl text-sm font-semibold text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-all shrink-0"
                    >
                      <RefreshCw className="w-4 h-4" /> Regenerate
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
