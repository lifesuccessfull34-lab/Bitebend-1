import React from "react";
import "./_shared/_group.css";
import { ChevronLeft, Lock, CheckCircle2 } from "lucide-react";

export default function CustomerPayment() {
  return (
    <div className="restaurant-app-customer min-h-screen flex justify-center bg-zinc-100 p-4 font-sans">
      <div className="w-full max-w-[390px] h-[844px] bg-background rounded-[40px] shadow-2xl overflow-hidden relative border-8 border-zinc-800 flex flex-col">
        {/* Header */}
        <div className="pt-14 pb-4 px-6 bg-transparent flex items-center justify-between z-10">
          <button className="w-10 h-10 flex items-center justify-center -ml-2 rounded-full bg-white shadow-sm text-foreground hover:bg-muted">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <div className="w-10"></div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 pb-32 flex flex-col">
          <div className="flex flex-col items-center mt-2 mb-8">
            <div className="bg-primary/10 text-primary px-4 py-1.5 rounded-full text-sm font-bold tracking-widest border border-primary/20 mb-4">
              #ORD-4821
            </div>
            <p className="text-muted-foreground text-sm font-medium mb-1">Total Amount Payable</p>
            <h2 className="text-4xl font-extrabold text-foreground tracking-tight">&#8377;887</h2>
          </div>

          <h3 className="font-bold text-foreground mb-4 px-1">Payment Method</h3>
          
          <div className="space-y-3">
            {/* UPI Option */}
            <div className="bg-white rounded-3xl p-5 shadow-sm border-2 border-primary relative overflow-hidden">
              <div className="absolute top-0 right-0 bg-primary text-white text-[10px] font-bold px-3 py-1 rounded-bl-xl uppercase tracking-wider">
                Recommended
              </div>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-5 h-5 rounded-full border-4 border-primary flex items-center justify-center shrink-0">
                  <div className="w-2 h-2 rounded-full bg-primary" />
                </div>
                <span className="font-semibold text-foreground text-lg">Pay with UPI</span>
              </div>
              
              <div className="flex gap-2 mb-4 pl-8">
                <div className="bg-muted px-3 py-1.5 rounded-lg text-xs font-bold text-foreground">GPay</div>
                <div className="bg-muted px-3 py-1.5 rounded-lg text-xs font-bold text-foreground">PhonePe</div>
                <div className="bg-muted px-3 py-1.5 rounded-lg text-xs font-bold text-foreground">Paytm</div>
              </div>

              <div className="pl-8">
                <div className="relative">
                  <input 
                    type="text" 
                    placeholder="Enter UPI ID (e.g. name@okhdfc)"
                    className="w-full bg-background border border-border rounded-xl py-3 px-4 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary text-foreground placeholder:text-muted-foreground transition-all"
                  />
                </div>
              </div>
            </div>

            {/* Card Option */}
            <div className="bg-white rounded-3xl p-5 shadow-sm border border-border flex items-center gap-3 opacity-70">
              <div className="w-5 h-5 rounded-full border-2 border-muted-foreground shrink-0" />
              <span className="font-semibold text-foreground">Credit / Debit Card</span>
            </div>

            {/* Cash Option */}
            <div className="bg-white rounded-3xl p-5 shadow-sm border border-border flex items-center gap-3 opacity-70">
              <div className="w-5 h-5 rounded-full border-2 border-muted-foreground shrink-0" />
              <div className="flex flex-col">
                <span className="font-semibold text-foreground">Pay at Counter</span>
                <span className="text-xs text-muted-foreground">Cash or card at checkout</span>
              </div>
            </div>
          </div>
          
          <div className="mt-auto pt-8 flex items-center justify-center gap-2 text-muted-foreground text-xs font-medium">
            <Lock className="w-3 h-3" /> Powered by TableServe &middot; 256-bit encrypted
          </div>
        </div>

        {/* Fixed Bottom Action */}
        <div className="absolute bottom-0 left-0 right-0 bg-background/80 backdrop-blur-xl border-t border-border p-6 pb-8 shadow-[0_-10px_40px_rgba(0,0,0,0.05)] z-20">
          <button className="w-full bg-primary text-primary-foreground py-4 rounded-2xl font-bold flex items-center justify-center gap-2 text-lg shadow-xl shadow-primary/30 active:scale-[0.98] transition-transform">
            Pay &#8377;887 Securely
          </button>
        </div>
      </div>
    </div>
  );
}
