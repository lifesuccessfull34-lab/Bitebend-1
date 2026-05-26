import React, { useState } from "react";
import "./_shared/_group.css";
import {
  LayoutDashboard, ChefHat, MenuSquare, QrCode, TrendingUp,
  Settings, Search, Bell, User, Clock, Plus, Edit2, Trash2,
  ToggleLeft, ToggleRight, Upload, X, Check, ImagePlus, Flame,
  Star, Leaf
} from "lucide-react";

const categories = ["All", "Starters", "Main Course", "Biryani", "Breads", "Desserts", "Drinks"];

const initialMenuItems = [
  { id: 1, name: "Butter Chicken", category: "Main Course", price: 320, veg: false, available: true, bestseller: true, spicy: false, image: null, description: "Tender chicken in rich tomato-cream sauce" },
  { id: 2, name: "Dal Makhani", category: "Main Course", price: 280, veg: true, available: true, bestseller: true, spicy: false, image: null, description: "Slow-cooked black lentils with butter and cream" },
  { id: 3, name: "Paneer Tikka", category: "Starters", price: 280, veg: true, available: true, bestseller: false, spicy: true, image: null, description: "Chargrilled cottage cheese with spiced marinade" },
  { id: 4, name: "Veg Biryani", category: "Biryani", price: 260, veg: true, available: true, bestseller: false, spicy: false, image: null, description: "Fragrant basmati rice with seasonal vegetables" },
  { id: 5, name: "Mutton Rogan Josh", category: "Main Course", price: 420, veg: false, available: false, bestseller: false, spicy: true, image: null, description: "Slow-braised mutton in Kashmiri spices" },
  { id: 6, name: "Garlic Naan", category: "Breads", price: 60, veg: true, available: true, bestseller: false, spicy: false, image: null, description: "Soft leavened flatbread with garlic butter" },
  { id: 7, name: "Gulab Jamun", category: "Desserts", price: 120, veg: true, available: true, bestseller: false, spicy: false, image: null, description: "Soft milk dumplings in rose-cardamom syrup" },
  { id: 8, name: "Mango Lassi", category: "Drinks", price: 130, veg: true, available: true, bestseller: true, spicy: false, image: null, description: "Chilled yoghurt blended with Alphonso mango" },
];

type MenuItem = typeof initialMenuItems[0];

function ImagePlaceholder({ veg }: { veg: boolean }) {
  const gradient = veg
    ? "linear-gradient(135deg, #4ade80 0%, #16a34a 100%)"
    : "linear-gradient(135deg, #fb923c 0%, #dc2626 100%)";
  return (
    <div
      className="w-full h-full rounded-lg flex items-center justify-center"
      style={{ background: gradient }}
    >
      <Leaf className={`w-7 h-7 ${veg ? "text-white/70" : "text-white/70"}`} />
    </div>
  );
}

function AddEditModal({ item, onSave, onClose }: {
  item: MenuItem | null;
  onSave: (data: Partial<MenuItem>) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    name: item?.name ?? "",
    category: item?.category ?? "Starters",
    price: item?.price ?? 0,
    description: item?.description ?? "",
    veg: item?.veg ?? true,
    bestseller: item?.bestseller ?? false,
    spicy: item?.spicy ?? false,
    available: item?.available ?? true,
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.7)" }}>
      <div className="bg-card border border-border rounded-2xl w-[520px] max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h3 className="text-lg font-bold">{item ? "Edit Dish" : "Add New Dish"}</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Photo Upload */}
          <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Food Photo
            </label>
            <div
              className="border-2 border-dashed border-border rounded-xl h-36 flex flex-col items-center justify-center gap-2 hover:border-primary/50 transition-colors cursor-pointer group"
              style={{ background: "hsl(var(--muted)/30%)" }}
            >
              <ImagePlus className="w-8 h-8 text-muted-foreground group-hover:text-primary transition-colors" />
              <span className="text-sm text-muted-foreground">Click to upload photo</span>
              <span className="text-xs text-muted-foreground/60">JPG, PNG up to 5MB</span>
            </div>
          </div>

          {/* Name */}
          <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Dish Name *
            </label>
            <input
              type="text"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Butter Chicken"
              className="w-full bg-muted border border-border rounded-lg px-4 py-2.5 text-sm focus:border-primary outline-none transition-all"
            />
          </div>

          {/* Category + Price */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Category *
              </label>
              <select
                value={form.category}
                onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                className="w-full bg-muted border border-border rounded-lg px-4 py-2.5 text-sm focus:border-primary outline-none transition-all"
              >
                {categories.filter(c => c !== "All").map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Price (₹) *
              </label>
              <input
                type="number"
                value={form.price}
                onChange={e => setForm(f => ({ ...f, price: Number(e.target.value) }))}
                placeholder="280"
                className="w-full bg-muted border border-border rounded-lg px-4 py-2.5 text-sm focus:border-primary outline-none transition-all"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Description
            </label>
            <textarea
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Brief description of the dish..."
              rows={2}
              className="w-full bg-muted border border-border rounded-lg px-4 py-2.5 text-sm focus:border-primary outline-none transition-all resize-none"
            />
          </div>

          {/* Toggles */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { key: "veg", label: "Vegetarian", icon: "🟢" },
              { key: "spicy", label: "Spicy", icon: "🌶" },
              { key: "bestseller", label: "Bestseller", icon: "⭐" },
              { key: "available", label: "Available Now", icon: "✓" },
            ].map(({ key, label, icon }) => (
              <button
                key={key}
                onClick={() => setForm(f => ({ ...f, [key]: !f[key as keyof typeof f] }))}
                className={`flex items-center justify-between px-4 py-3 rounded-xl border transition-all text-sm font-semibold ${
                  form[key as keyof typeof form]
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-muted text-muted-foreground"
                }`}
              >
                <span>{label}</span>
                <span className="text-base">{icon}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="p-6 pt-0 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-xl border border-border text-sm font-semibold text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-all"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave(form)}
            className="flex-1 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-all flex items-center justify-center gap-2"
          >
            <Check className="w-4 h-4" />
            {item ? "Save Changes" : "Add Dish"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function AdminMenuManager() {
  const [activeCategory, setActiveCategory] = useState("All");
  const [items, setItems] = useState<MenuItem[]>(initialMenuItems);
  const [search, setSearch] = useState("");
  const [modalItem, setModalItem] = useState<MenuItem | null | undefined>(undefined);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const filtered = items.filter(item => {
    const matchCat = activeCategory === "All" || item.category === activeCategory;
    const matchSearch = item.name.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  const toggleAvailable = (id: number) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, available: !i.available } : i));
  };

  const handleSave = (data: Partial<MenuItem>) => {
    if (modalItem === null) {
      setItems(prev => [...prev, { ...data, id: Date.now() } as MenuItem]);
    } else if (modalItem) {
      setItems(prev => prev.map(i => i.id === modalItem.id ? { ...i, ...data } : i));
    }
    setModalItem(undefined);
  };

  return (
    <div className="restaurant-app-admin min-h-screen bg-background flex font-sans text-foreground">
      {modalItem !== undefined && (
        <AddEditModal
          item={modalItem}
          onSave={handleSave}
          onClose={() => setModalItem(undefined)}
        />
      )}

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
            { icon: MenuSquare, label: "Menu Manager", active: true },
            { icon: QrCode, label: "QR Codes" },
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
        {/* Top Header */}
        <header className="h-20 border-b border-border bg-background flex items-center justify-between px-8 shrink-0">
          <div className="relative w-96">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search menu items..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-card border border-border rounded-lg py-2 pl-10 pr-4 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
            />
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

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8">
          {/* Page Header */}
          <div className="flex items-end justify-between mb-6">
            <div>
              <h2 className="text-3xl font-extrabold tracking-tight mb-1">Menu Manager</h2>
              <p className="text-muted-foreground font-medium">{items.length} dishes &middot; {items.filter(i => i.available).length} available</p>
            </div>
            <button
              onClick={() => setModalItem(null)}
              className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground font-bold rounded-xl hover:bg-primary/90 transition-all shadow-lg shadow-primary/20"
            >
              <Plus className="w-4 h-4" /> Add Dish
            </button>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-4 gap-4 mb-7">
            {[
              { label: "Total Dishes", value: items.length, color: "text-foreground" },
              { label: "Available", value: items.filter(i => i.available).length, color: "text-green-400" },
              { label: "Unavailable", value: items.filter(i => !i.available).length, color: "text-red-400" },
              { label: "Bestsellers", value: items.filter(i => i.bestseller).length, color: "text-primary" },
            ].map(stat => (
              <div key={stat.label} className="bg-card border border-border rounded-xl px-5 py-4">
                <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-1">{stat.label}</p>
                <p className={`text-2xl font-extrabold ${stat.color}`}>{stat.value}</p>
              </div>
            ))}
          </div>

          {/* Category Tabs */}
          <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-4 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-all border ${
                  activeCategory === cat
                    ? "bg-primary text-primary-foreground border-primary shadow-md shadow-primary/20"
                    : "bg-card text-muted-foreground border-border hover:text-foreground hover:border-foreground/30"
                }`}
              >
                {cat}
                {cat !== "All" && (
                  <span className="ml-1.5 text-xs opacity-60">
                    ({items.filter(i => i.category === cat).length})
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Menu Items Table */}
          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-6 py-4 text-xs font-bold text-muted-foreground uppercase tracking-wider">Dish</th>
                  <th className="text-left px-4 py-4 text-xs font-bold text-muted-foreground uppercase tracking-wider">Category</th>
                  <th className="text-left px-4 py-4 text-xs font-bold text-muted-foreground uppercase tracking-wider">Price</th>
                  <th className="text-center px-4 py-4 text-xs font-bold text-muted-foreground uppercase tracking-wider">Tags</th>
                  <th className="text-center px-4 py-4 text-xs font-bold text-muted-foreground uppercase tracking-wider">Availability</th>
                  <th className="text-center px-4 py-4 text-xs font-bold text-muted-foreground uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map(item => (
                  <tr key={item.id} className={`hover:bg-muted/30 transition-colors ${!item.available ? "opacity-50" : ""}`}>
                    {/* Dish */}
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-lg overflow-hidden shrink-0 border border-border">
                          <ImagePlaceholder veg={item.veg} />
                        </div>
                        <div>
                          <p className="font-bold text-sm">{item.name}</p>
                          <p className="text-xs text-muted-foreground mt-0.5 max-w-[180px] truncate">{item.description}</p>
                        </div>
                      </div>
                    </td>

                    {/* Category */}
                    <td className="px-4 py-4">
                      <span className="px-2.5 py-1 bg-muted text-muted-foreground rounded-lg text-xs font-semibold">{item.category}</span>
                    </td>

                    {/* Price */}
                    <td className="px-4 py-4">
                      <span className="font-bold text-sm">&#8377;{item.price}</span>
                    </td>

                    {/* Tags */}
                    <td className="px-4 py-4">
                      <div className="flex items-center justify-center gap-1.5">
                        <span
                          className="w-4 h-4 rounded-sm border-2 flex items-center justify-center"
                          title={item.veg ? "Veg" : "Non-Veg"}
                          style={{
                            borderColor: item.veg ? "#22c55e" : "#ef4444",
                            backgroundColor: item.veg ? "#22c55e22" : "#ef444422",
                          }}
                        >
                          <span
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: item.veg ? "#22c55e" : "#ef4444" }}
                          />
                        </span>
                        {item.bestseller && (
                          <span className="flex items-center gap-1 px-1.5 py-0.5 bg-amber-500/10 text-amber-400 rounded text-xs font-bold border border-amber-500/20">
                            <Star className="w-2.5 h-2.5" /> Best
                          </span>
                        )}
                        {item.spicy && (
                          <span className="flex items-center gap-1 px-1.5 py-0.5 bg-red-500/10 text-red-400 rounded text-xs font-bold border border-red-500/20">
                            <Flame className="w-2.5 h-2.5" /> Hot
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Availability Toggle */}
                    <td className="px-4 py-4">
                      <div className="flex justify-center">
                        <button
                          onClick={() => toggleAvailable(item.id)}
                          className="flex items-center gap-2 transition-colors"
                          title={item.available ? "Mark Unavailable" : "Mark Available"}
                        >
                          {item.available ? (
                            <>
                              <ToggleRight className="w-8 h-8 text-green-400" />
                              <span className="text-xs font-semibold text-green-400">Live</span>
                            </>
                          ) : (
                            <>
                              <ToggleLeft className="w-8 h-8 text-muted-foreground" />
                              <span className="text-xs font-semibold text-muted-foreground">Off</span>
                            </>
                          )}
                        </button>
                      </div>
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-4">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => setModalItem(item)}
                          className="p-2 rounded-lg bg-muted hover:bg-primary/10 hover:text-primary text-muted-foreground transition-all"
                          title="Edit"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setItems(prev => prev.filter(i => i.id !== item.id))}
                          className="p-2 rounded-lg bg-muted hover:bg-red-500/10 hover:text-red-400 text-muted-foreground transition-all"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {filtered.length === 0 && (
              <div className="py-16 flex flex-col items-center gap-3 text-muted-foreground">
                <MenuSquare className="w-10 h-10 opacity-30" />
                <p className="font-semibold">No dishes found</p>
                <p className="text-sm opacity-60">Try adjusting your search or category filter</p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
