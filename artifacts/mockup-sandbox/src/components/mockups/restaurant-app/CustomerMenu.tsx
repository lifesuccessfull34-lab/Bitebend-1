import React, { useState } from "react";
import "./_shared/_group.css";
import { Search, Plus, Star, MapPin, ChevronRight, UtensilsCrossed, ShoppingBag } from "lucide-react";

type OrderType = "dine-in" | "takeaway" | null;

function TableEntryScreen({ onConfirm }: { onConfirm: (type: OrderType, table: string) => void }) {
  const [selected, setSelected] = useState<"dine-in" | "takeaway" | null>(null);
  const [tableInput, setTableInput] = useState("");
  const [error, setError] = useState("");

  const canProceed =
    selected === "takeaway" || (selected === "dine-in" && tableInput.trim().length > 0);

  const handleProceed = () => {
    if (selected === "dine-in" && !tableInput.trim()) {
      setError("Please enter your table number");
      return;
    }
    setError("");
    onConfirm(selected, tableInput.trim());
  };

  return (
    <div className="restaurant-app-customer min-h-screen flex justify-center bg-zinc-100 p-4 font-sans">
      <div className="w-full max-w-[390px] h-[844px] bg-background rounded-[40px] shadow-2xl overflow-hidden relative border-8 border-zinc-800 flex flex-col">
        {/* Top decoration */}
        <div className="h-1.5 w-full" style={{ background: "linear-gradient(90deg, #F4821F 0%, #f5a623 100%)" }} />

        <div className="flex-1 flex flex-col px-7 pt-10 pb-8">
          {/* Restaurant branding */}
          <div className="mb-10 text-center">
            <div className="w-16 h-16 bg-primary/10 border border-primary/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <UtensilsCrossed className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-2xl font-extrabold text-foreground tracking-tight">The Spice House</h1>
            <p className="text-sm text-muted-foreground flex items-center justify-center gap-1 mt-1">
              <MapPin className="w-3.5 h-3.5" /> Bandra, Mumbai
            </p>
          </div>

          {/* Step label */}
          <div className="mb-5">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-1">Step 1 of 2</p>
            <h2 className="text-xl font-extrabold text-foreground">How are you dining?</h2>
            <p className="text-sm text-muted-foreground mt-1">Choose your order type to get started</p>
          </div>

          {/* Order type selection */}
          <div className="flex flex-col gap-3 mb-7">
            <button
              onClick={() => { setSelected("dine-in"); setError(""); }}
              className={`flex items-center gap-4 px-5 py-4 rounded-2xl border-2 transition-all text-left ${
                selected === "dine-in"
                  ? "border-primary bg-primary/5"
                  : "border-border bg-white hover:border-primary/40"
              }`}
            >
              <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${selected === "dine-in" ? "bg-primary text-white" : "bg-muted text-muted-foreground"}`}>
                <UtensilsCrossed className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <p className={`font-bold text-sm ${selected === "dine-in" ? "text-primary" : "text-foreground"}`}>Dine-In</p>
                <p className="text-xs text-muted-foreground mt-0.5">Eat at your table</p>
              </div>
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${selected === "dine-in" ? "border-primary bg-primary" : "border-border"}`}>
                {selected === "dine-in" && <div className="w-2 h-2 rounded-full bg-white" />}
              </div>
            </button>

            <button
              onClick={() => { setSelected("takeaway"); setTableInput(""); setError(""); }}
              className={`flex items-center gap-4 px-5 py-4 rounded-2xl border-2 transition-all text-left ${
                selected === "takeaway"
                  ? "border-primary bg-primary/5"
                  : "border-border bg-white hover:border-primary/40"
              }`}
            >
              <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${selected === "takeaway" ? "bg-primary text-white" : "bg-muted text-muted-foreground"}`}>
                <ShoppingBag className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <p className={`font-bold text-sm ${selected === "takeaway" ? "text-primary" : "text-foreground"}`}>Takeaway</p>
                <p className="text-xs text-muted-foreground mt-0.5">Pick up your order at the counter</p>
              </div>
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${selected === "takeaway" ? "border-primary bg-primary" : "border-border"}`}>
                {selected === "takeaway" && <div className="w-2 h-2 rounded-full bg-white" />}
              </div>
            </button>
          </div>

          {/* Table number input — only for dine-in */}
          <div
            className="overflow-hidden transition-all"
            style={{
              maxHeight: selected === "dine-in" ? "120px" : "0px",
              opacity: selected === "dine-in" ? 1 : 0,
            }}
          >
            <div className="mb-7">
              <label className="block text-xs font-bold text-muted-foreground uppercase tracking-widest mb-2">
                Your Table Number
              </label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder="e.g.  7"
                value={tableInput}
                onChange={e => { setTableInput(e.target.value); setError(""); }}
                className={`w-full bg-white border-2 rounded-2xl py-3.5 px-5 text-xl font-bold outline-none transition-all text-center tracking-widest ${
                  error ? "border-red-400" : tableInput ? "border-primary" : "border-border focus:border-primary"
                }`}
              />
              {error && <p className="text-xs text-red-500 font-semibold mt-2 text-center">{error}</p>}
              <p className="text-xs text-muted-foreground mt-2 text-center">
                Find your table number on the stand or menu card
              </p>
            </div>
          </div>

          <div className="mt-auto">
            <button
              onClick={handleProceed}
              disabled={!selected}
              className={`w-full py-4 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all ${
                canProceed
                  ? "bg-primary text-primary-foreground shadow-lg shadow-primary/30 hover:bg-primary/90 active:scale-[0.98]"
                  : selected && !canProceed
                  ? "bg-primary/40 text-white cursor-not-allowed"
                  : "bg-muted text-muted-foreground cursor-not-allowed"
              }`}
            >
              View Menu <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CustomerMenu() {
  const [orderType, setOrderType] = useState<OrderType>(null);
  const [tableNumber, setTableNumber] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");

  const menuItems = [
    { name: "Butter Chicken", price: 320, veg: false, isBestseller: true, image: "linear-gradient(135deg, #e65c00 0%, #F9D423 100%)", desc: "Tender chicken cooked in rich tomato gravy" },
    { name: "Dal Makhani", price: 280, veg: true, isBestseller: true, image: "linear-gradient(135deg, #3E5151 0%, #DECBA4 100%)", desc: "Overnight slow-cooked black lentils" },
    { name: "Paneer Tikka", price: 260, veg: true, isBestseller: false, image: "linear-gradient(135deg, #f12711 0%, #f5af19 100%)", desc: "Charcoal grilled cottage cheese chunks" },
    { name: "Veg Biryani", price: 290, veg: true, isBestseller: false, image: "linear-gradient(135deg, #56ab2f 0%, #a8e063 100%)", desc: "Aromatic basmati rice with mixed vegetables" },
    { name: "Mutton Rogan Josh", price: 450, veg: false, isBestseller: true, image: "linear-gradient(135deg, #870000 0%, #190A05 100%)", desc: "Classic Kashmiri meat curry" },
    { name: "Garlic Naan", price: 60, veg: true, isBestseller: false, image: "linear-gradient(135deg, #D3CCE3 0%, #E9E4F0 100%)", desc: "Soft flatbread topped with garlic" },
  ];

  if (!orderType) {
    return (
      <TableEntryScreen
        onConfirm={(type, table) => {
          setOrderType(type);
          setTableNumber(table);
        }}
      />
    );
  }

  return (
    <div className="restaurant-app-customer min-h-screen flex justify-center bg-zinc-100 p-4 font-sans">
      <div className="w-full max-w-[390px] h-[844px] bg-background rounded-[40px] shadow-2xl overflow-hidden relative border-8 border-zinc-800 flex flex-col">
        {/* Header */}
        <div className="pt-12 pb-4 px-6 bg-white border-b border-border shadow-sm z-10">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h1 className="text-2xl font-bold text-foreground">The Spice House</h1>
              <p className="text-xs text-muted-foreground flex items-center mt-1">
                <MapPin className="w-3 h-3 mr-1" /> Est. 2012 &middot; Bandra, Mumbai
              </p>
            </div>
            {/* Order type badge — tappable to go back */}
            <button
              onClick={() => setOrderType(null)}
              className="bg-primary/10 text-primary px-3 py-1.5 rounded-xl text-sm font-semibold border border-primary/20 flex items-center gap-1.5"
            >
              {orderType === "dine-in" ? (
                <><UtensilsCrossed className="w-3.5 h-3.5" /> Table {tableNumber}</>
              ) : (
                <><ShoppingBag className="w-3.5 h-3.5" /> Takeaway</>
              )}
            </button>
          </div>

          <div className="relative">
            <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search dishes..."
              className="w-full bg-muted rounded-xl py-3 pl-10 pr-4 text-sm outline-none focus:ring-2 focus:ring-primary border-none"
            />
          </div>
        </div>

        {/* Categories */}
        <div className="px-6 py-4 flex gap-3 overflow-x-auto scroll-smooth whitespace-nowrap bg-background" style={{ msOverflowStyle: "none", scrollbarWidth: "none" }}>
          {["All", "Starters", "Main Course", "Biryani", "Breads", "Desserts", "Drinks"].map((cat, i) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-4 py-2 rounded-full text-sm whitespace-nowrap font-medium ${
                activeCategory === cat
                  ? "bg-primary text-white shadow-md shadow-primary/20"
                  : "bg-white text-muted-foreground border border-border"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Menu Items */}
        <div className="flex-1 overflow-y-auto px-6 pb-24 space-y-4 bg-background">
          {menuItems.map((item, i) => (
            <div key={i} className="flex gap-4 bg-white p-3 rounded-2xl shadow-sm border border-border/50">
              <div
                className="w-24 h-24 rounded-xl flex-shrink-0 shadow-inner"
                style={{ background: item.image }}
              />
              <div className="flex flex-col justify-center flex-1 py-1">
                <div className="flex items-center gap-1.5 mb-1">
                  <div className={`w-3.5 h-3.5 border ${item.veg ? "border-green-600" : "border-red-600"} flex items-center justify-center p-[2px]`}>
                    <div className={`w-2 h-2 rounded-full ${item.veg ? "bg-green-600" : "bg-red-600"}`} />
                  </div>
                  {item.isBestseller && (
                    <span className="text-[10px] uppercase font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded flex items-center">
                      <Star className="w-2 h-2 mr-0.5 fill-amber-600" /> Bestseller
                    </span>
                  )}
                </div>
                <h3 className="font-semibold text-foreground text-sm leading-tight mb-1">{item.name}</h3>
                <p className="text-xs text-muted-foreground line-clamp-2 leading-snug mb-2">{item.desc}</p>
                <div className="flex items-center justify-between mt-auto">
                  <span className="font-bold text-sm text-foreground">&#8377;{item.price}</span>
                  <button className="bg-primary/10 text-primary w-8 h-8 rounded-full flex items-center justify-center hover:bg-primary hover:text-white transition-colors">
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Floating Cart */}
        <div className="absolute bottom-6 left-6 right-6">
          <button className="w-full bg-primary text-primary-foreground py-4 rounded-2xl font-bold flex items-center justify-between px-6 shadow-xl shadow-primary/30 active:scale-[0.98] transition-transform">
            <div className="flex flex-col items-start">
              <span className="text-sm font-medium text-white/80">3 items</span>
              <span>View Cart</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-lg">&#8377;860</span>
              <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center">
                <div className="w-2 h-2 border-t-2 border-r-2 border-white rotate-45" />
              </div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
