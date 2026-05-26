import React from "react";
import "./_shared/_group.css";
import { LayoutDashboard, ChefHat, ArrowLeft, Clock, CheckCircle2, MessageCircle, Printer, User, Phone, Check } from "lucide-react";

export default function AdminOrderDetail() {
  return (
    <div className="restaurant-app-admin min-h-screen bg-background flex font-sans text-foreground">
      {/* Sidebar (Collapsed for focus) */}
      <aside className="w-20 border-r border-border bg-card flex flex-col shrink-0 items-center py-6">
        <div className="text-primary bg-primary/10 p-2 rounded-xl border border-primary/20 mb-8">
          <ChefHat className="w-8 h-8" />
        </div>
        <nav className="flex-1 space-y-4">
          <a href="#" className="w-12 h-12 flex items-center justify-center rounded-xl text-muted-foreground hover:bg-muted/50"><LayoutDashboard className="w-6 h-6" /></a>
          <a href="#" className="w-12 h-12 flex items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20 shadow-[0_0_15px_rgba(244,130,31,0.15)]"><Clock className="w-6 h-6" /></a>
        </nav>
      </aside>

      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Header */}
        <header className="h-20 border-b border-border bg-background flex items-center px-8 shrink-0">
          <button className="flex items-center gap-2 text-muted-foreground hover:text-foreground font-medium transition-colors mr-6">
            <ArrowLeft className="w-5 h-5" /> Back
          </button>
          <h2 className="text-2xl font-bold font-mono tracking-tight mr-4">Order #4821</h2>
          <span className="bg-amber-500/10 text-amber-500 border border-amber-500/20 px-3 py-1 rounded-md text-sm font-bold">
            Preparing
          </span>
          
          <div className="ml-auto flex items-center gap-3">
            <span className="text-sm font-medium text-muted-foreground mr-2">Payment:</span>
            <div className="bg-card p-1 rounded-lg border border-border flex items-center">
              <button className="px-4 py-1.5 text-sm font-bold rounded-md text-muted-foreground hover:text-foreground transition-colors">Unpaid</button>
              <button className="px-4 py-1.5 text-sm font-bold rounded-md bg-green-500/20 text-green-500 shadow-sm border border-green-500/30 flex items-center gap-1.5">
                <Check className="w-4 h-4" /> Paid
              </button>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-hidden flex">
          {/* Left Column: Details */}
          <div className="flex-1 overflow-y-auto p-8 border-r border-border">
            <div className="grid grid-cols-2 gap-6 mb-8">
              <div className="bg-card border border-border rounded-xl p-5">
                <h3 className="text-sm text-muted-foreground font-medium mb-4 uppercase tracking-wider">Order Info</h3>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Type</span>
                    <span className="font-bold">Dine-In &middot; Table 7</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Placed At</span>
                    <span className="font-medium">1:42 PM (Today)</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Source</span>
                    <span className="font-medium">QR Menu</span>
                  </div>
                </div>
              </div>
              
              <div className="bg-card border border-border rounded-xl p-5">
                <h3 className="text-sm text-muted-foreground font-medium mb-4 uppercase tracking-wider">Customer</h3>
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-12 h-12 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold text-lg border border-primary/30">
                    RM
                  </div>
                  <div>
                    <p className="font-bold text-lg">Rahul Mehta</p>
                    <p className="text-muted-foreground flex items-center gap-1 text-sm mt-0.5">
                      <Phone className="w-3 h-3" /> +91 98765 43210
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Timeline */}
            <div className="bg-card border border-border rounded-xl p-6 mb-8">
              <div className="flex items-center justify-between relative">
                <div className="absolute top-1/2 left-4 right-4 h-0.5 bg-border -translate-y-1/2 z-0"></div>
                <div className="absolute top-1/2 left-4 right-1/2 h-0.5 bg-primary -translate-y-1/2 z-0"></div>
                
                <div className="relative z-10 flex flex-col items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold shadow-[0_0_10px_rgba(244,130,31,0.5)]">
                    <Check className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-bold text-primary">Received</span>
                </div>
                
                <div className="relative z-10 flex flex-col items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-background border-2 border-primary text-primary flex items-center justify-center font-bold shadow-[0_0_10px_rgba(244,130,31,0.2)]">
                    <div className="w-3 h-3 bg-primary rounded-full"></div>
                  </div>
                  <span className="text-xs font-bold text-primary">Preparing</span>
                </div>
                
                <div className="relative z-10 flex flex-col items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-background border-2 border-border text-muted-foreground flex items-center justify-center">
                    3
                  </div>
                  <span className="text-xs font-medium text-muted-foreground">Ready</span>
                </div>
                
                <div className="relative z-10 flex flex-col items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-background border-2 border-border text-muted-foreground flex items-center justify-center">
                    4
                  </div>
                  <span className="text-xs font-medium text-muted-foreground">Served</span>
                </div>
              </div>
            </div>

            {/* Order Items Table */}
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <table className="w-full text-left">
                <thead className="bg-muted/30 border-b border-border">
                  <tr>
                    <th className="px-6 py-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">Item</th>
                    <th className="px-6 py-4 text-xs font-medium text-muted-foreground uppercase tracking-wider text-center">Qty</th>
                    <th className="px-6 py-4 text-xs font-medium text-muted-foreground uppercase tracking-wider text-right">Price</th>
                    <th className="px-6 py-4 text-xs font-medium text-muted-foreground uppercase tracking-wider text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  <tr>
                    <td className="px-6 py-4 font-semibold">Butter Chicken</td>
                    <td className="px-6 py-4 text-center font-mono">1</td>
                    <td className="px-6 py-4 text-right text-muted-foreground">&#8377;320</td>
                    <td className="px-6 py-4 text-right font-bold">&#8377;320</td>
                  </tr>
                  <tr>
                    <td className="px-6 py-4 font-semibold">Dal Makhani</td>
                    <td className="px-6 py-4 text-center font-mono">1</td>
                    <td className="px-6 py-4 text-right text-muted-foreground">&#8377;280</td>
                    <td className="px-6 py-4 text-right font-bold">&#8377;280</td>
                  </tr>
                  <tr>
                    <td className="px-6 py-4 font-semibold">Garlic Naan</td>
                    <td className="px-6 py-4 text-center font-mono">2</td>
                    <td className="px-6 py-4 text-right text-muted-foreground">&#8377;60</td>
                    <td className="px-6 py-4 text-right font-bold">&#8377;120</td>
                  </tr>
                </tbody>
              </table>
              <div className="bg-muted/10 p-6 border-t border-border">
                <div className="w-64 ml-auto space-y-3">
                  <div className="flex justify-between text-muted-foreground text-sm">
                    <span>Subtotal</span>
                    <span className="font-medium text-foreground">&#8377;840</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground text-sm">
                    <span>GST (5%)</span>
                    <span className="font-medium text-foreground">&#8377;42</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground text-sm">
                    <span>Platform Fee</span>
                    <span className="font-medium text-foreground">&#8377;5</span>
                  </div>
                  <div className="border-t border-border pt-3 mt-3 flex justify-between font-bold text-xl">
                    <span>Grand Total</span>
                    <span className="text-primary">&#8377;887</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Actions */}
          <div className="w-96 bg-card flex flex-col p-6 overflow-y-auto">
            <h3 className="font-bold text-lg mb-6 uppercase tracking-wider text-muted-foreground text-sm">Quick Actions</h3>
            
            <div className="grid grid-cols-2 gap-3 mb-8">
              <button className="bg-background border border-border text-foreground hover:bg-muted font-bold py-3 rounded-xl transition-colors">
                Mark Received
              </button>
              <button className="bg-amber-500 text-amber-950 font-bold py-3 rounded-xl shadow-[0_0_20px_rgba(245,158,11,0.2)] hover:bg-amber-400 transition-colors">
                Mark Ready
              </button>
              <button className="col-span-2 bg-background border border-border text-muted-foreground hover:text-foreground font-bold py-3 rounded-xl transition-colors">
                Mark Served
              </button>
            </div>

            <div className="bg-background border border-border rounded-xl p-5 mb-4 relative overflow-hidden group">
              <div className="absolute top-0 right-0 bg-green-500/20 text-green-500 px-3 py-1 rounded-bl-xl text-xs font-bold border-l border-b border-green-500/30">
                Recommended
              </div>
              <h4 className="font-bold mb-4 flex items-center gap-2">
                <MessageCircle className="w-5 h-5 text-green-500" /> Share Bill
              </h4>
              
              <div className="bg-card border border-border rounded-lg p-4 text-xs font-mono text-muted-foreground mb-4 leading-relaxed whitespace-pre-wrap">
                <span className="text-foreground">Hi Rahul! Your bill from The Spice House:</span>
                {"\n\n"}Butter Chicken x1 - &#8377;320
                {"\n"}Dal Makhani x1 - &#8377;280
                {"\n"}Garlic Naan x2 - &#8377;120
                {"\n"}GST (5%) - &#8377;42
                {"\n"}Platform Fee - &#8377;5
                {"\n\n"}<span className="font-bold text-foreground">Total: &#8377;887</span>
                {"\n\n"}Thank you for dining with us!
              </div>

              <button className="w-full bg-[#25D366] hover:bg-[#20bd5a] text-white font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(37,211,102,0.3)] transition-colors">
                <MessageCircle className="w-5 h-5 fill-current" /> Send on WhatsApp
              </button>
            </div>

            <button className="w-full bg-background border border-border text-foreground hover:bg-muted font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 transition-colors">
              <Printer className="w-5 h-5 text-muted-foreground" /> Print Receipt
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
