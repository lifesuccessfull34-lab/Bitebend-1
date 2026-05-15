import React from "react";
import "./_shared/_group.css";
import { ChevronLeft, Plus, Minus, FileText } from "lucide-react";

export default function CustomerCart() {
  return (
    <div className="restaurant-app-customer min-h-screen flex justify-center bg-zinc-100 p-4 font-sans">
      <div className="w-full max-w-[390px] h-[844px] bg-background rounded-[40px] shadow-2xl overflow-hidden relative border-8 border-zinc-800 flex flex-col">
        {/* Header */}
        <div className="pt-14 pb-4 px-6 bg-white border-b border-border shadow-sm flex items-center justify-between z-10">
          <button className="w-10 h-10 flex items-center justify-center -ml-2 rounded-full hover:bg-muted text-foreground">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <h1 className="text-lg font-bold text-foreground">Your Order</h1>
          <div className="w-10"></div>
        </div>

        <div className="flex-1 overflow-y-auto pb-32">
          <div className="p-6">
            <div className="flex items-center gap-2 mb-6">
              <span className="bg-foreground text-background px-3 py-1 rounded-md text-sm font-semibold shadow-sm">
                Dine-In
              </span>
              <span className="text-muted-foreground text-sm font-medium">Table 7</span>
            </div>

            <div className="bg-white rounded-3xl p-5 shadow-sm border border-border mb-6 space-y-5">
              <div className="flex items-center justify-between">
                <div className="flex items-start gap-3">
                  <div className="w-4 h-4 border border-red-600 flex items-center justify-center p-[2px] mt-1 shrink-0">
                    <div className="w-2 h-2 rounded-full bg-red-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground text-sm">Butter Chicken</h3>
                    <p className="text-muted-foreground text-sm mt-0.5">&#8377;320</p>
                  </div>
                </div>
                <div className="flex items-center bg-muted rounded-xl overflow-hidden shadow-inner shrink-0">
                  <button className="w-8 h-8 flex items-center justify-center text-foreground hover:bg-black/5">
                    <Minus className="w-4 h-4" />
                  </button>
                  <span className="w-6 text-center font-semibold text-sm">1</span>
                  <button className="w-8 h-8 flex items-center justify-center text-foreground hover:bg-black/5">
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-start gap-3">
                  <div className="w-4 h-4 border border-green-600 flex items-center justify-center p-[2px] mt-1 shrink-0">
                    <div className="w-2 h-2 rounded-full bg-green-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground text-sm">Dal Makhani</h3>
                    <p className="text-muted-foreground text-sm mt-0.5">&#8377;280</p>
                  </div>
                </div>
                <div className="flex items-center bg-muted rounded-xl overflow-hidden shadow-inner shrink-0">
                  <button className="w-8 h-8 flex items-center justify-center text-foreground hover:bg-black/5">
                    <Minus className="w-4 h-4" />
                  </button>
                  <span className="w-6 text-center font-semibold text-sm">1</span>
                  <button className="w-8 h-8 flex items-center justify-center text-foreground hover:bg-black/5">
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-start gap-3">
                  <div className="w-4 h-4 border border-green-600 flex items-center justify-center p-[2px] mt-1 shrink-0">
                    <div className="w-2 h-2 rounded-full bg-green-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground text-sm">Garlic Naan</h3>
                    <p className="text-muted-foreground text-sm mt-0.5">&#8377;60</p>
                  </div>
                </div>
                <div className="flex items-center bg-muted rounded-xl overflow-hidden shadow-inner shrink-0">
                  <button className="w-8 h-8 flex items-center justify-center text-foreground hover:bg-black/5">
                    <Minus className="w-4 h-4" />
                  </button>
                  <span className="w-6 text-center font-semibold text-sm">2</span>
                  <button className="w-8 h-8 flex items-center justify-center text-foreground hover:bg-black/5">
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
              
              <div className="pt-2">
                <button className="w-full py-3 border-2 border-dashed border-border text-foreground font-semibold rounded-xl flex items-center justify-center gap-2 hover:bg-muted transition-colors">
                  <Plus className="w-4 h-4" /> Add more items
                </button>
              </div>
            </div>

            <div className="bg-white rounded-3xl p-5 shadow-sm border border-border mb-6">
              <div className="flex items-center gap-2 mb-3 text-foreground font-semibold">
                <FileText className="w-4 h-4 text-muted-foreground" />
                Special Instructions
              </div>
              <textarea 
                placeholder="Any allergies or requests?" 
                className="w-full bg-muted/50 border border-border rounded-xl p-3 text-sm min-h-[80px] outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 resize-none text-foreground placeholder:text-muted-foreground"
              />
            </div>

            <div className="bg-white rounded-3xl p-6 shadow-sm border border-border">
              <h3 className="font-bold text-foreground mb-4">Bill Summary</h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span>Subtotal</span>
                  <span className="font-medium text-foreground">&#8377;840</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>GST (5%)</span>
                  <span className="font-medium text-foreground">&#8377;42</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Platform Fee</span>
                  <span className="font-medium text-foreground">&#8377;5</span>
                </div>
                <div className="border-t border-dashed border-border pt-3 mt-1 flex justify-between font-bold text-lg text-foreground">
                  <span>Total</span>
                  <span>&#8377;887</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Fixed Bottom Action */}
        <div className="absolute bottom-0 left-0 right-0 bg-white border-t border-border p-6 pb-8 shadow-[0_-10px_40px_rgba(0,0,0,0.05)]">
          <button className="w-full bg-primary text-primary-foreground py-4 rounded-2xl font-bold flex items-center justify-center gap-2 text-lg shadow-xl shadow-primary/30 active:scale-[0.98] transition-transform">
            Proceed to Payment <span className="opacity-80 ml-2 border-l border-white/30 pl-3">&#8377;887</span>
          </button>
        </div>
      </div>
    </div>
  );
}
