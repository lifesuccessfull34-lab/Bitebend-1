import React from "react";
import "./_shared/_group.css";
import { LayoutDashboard, ChefHat, MenuSquare, QrCode, TrendingUp, Settings, Search, Bell, User, Clock, MessageCircle } from "lucide-react";

export default function AdminDashboard() {
  const orders = [
    { id: "4821", table: "7", type: "Dine-In", time: "2 mins ago", items: ["Butter Chicken", "Dal Makhani", "Garlic Naan x2"], total: 887, status: "Pending" },
    { id: "4820", table: "12", type: "Dine-In", time: "14 mins ago", items: ["Paneer Tikka", "Veg Biryani"], total: 550, status: "Preparing" },
    { id: "4819", table: "-", type: "Takeaway", time: "18 mins ago", items: ["Mutton Rogan Josh", "Tandoori Roti x4"], total: 610, status: "Preparing" },
    { id: "4818", table: "3", type: "Dine-In", time: "25 mins ago", items: ["Chicken Tikka", "Mint Mojito x2"], total: 450, status: "Ready" },
    { id: "4817", table: "5", type: "Dine-In", time: "32 mins ago", items: ["Palak Paneer", "Jeera Rice"], total: 390, status: "Ready" },
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Pending': return 'bg-red-500/10 text-red-500 border-red-500/20';
      case 'Preparing': return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
      case 'Ready': return 'bg-green-500/10 text-green-500 border-green-500/20';
      default: return 'bg-muted text-muted-foreground border-border';
    }
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
          <a href="#" className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors font-medium">
            <LayoutDashboard className="w-5 h-5" /> Dashboard
          </a>
          <a href="#" className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-primary/10 text-primary font-bold shadow-sm">
            <Clock className="w-5 h-5" /> Live Orders
            <span className="ml-auto bg-primary text-primary-foreground text-xs px-2 py-0.5 rounded-full">24</span>
          </a>
          <a href="#" className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors font-medium">
            <MenuSquare className="w-5 h-5" /> Menu Manager
          </a>
          <a href="#" className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors font-medium">
            <QrCode className="w-5 h-5" /> QR Codes
          </a>
          <a href="#" className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors font-medium">
            <TrendingUp className="w-5 h-5" /> Revenue
          </a>
        </nav>

        <div className="p-3 border-t border-border mt-auto">
          <a href="#" className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors font-medium">
            <Settings className="w-5 h-5" /> Settings
          </a>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Top Header */}
        <header className="h-20 border-b border-border bg-background flex items-center justify-between px-8 shrink-0">
          <div className="relative w-96">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input 
              type="text" 
              placeholder="Search orders, tables..." 
              className="w-full bg-card border border-border rounded-lg py-2 pl-10 pr-4 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
            />
          </div>
          
          <div className="flex items-center gap-6">
            <button className="relative text-muted-foreground hover:text-foreground transition-colors">
              <Bell className="w-5 h-5" />
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-background"></span>
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

        {/* Page Content */}
        <div className="flex-1 overflow-y-auto p-8">
          <div className="flex items-end justify-between mb-8">
            <div>
              <h2 className="text-3xl font-extrabold tracking-tight mb-2">Live Orders</h2>
              <p className="text-muted-foreground font-medium">Today: 24 orders &middot; &#8377;18,420 revenue</p>
            </div>
            
            <div className="flex bg-card p-1 rounded-lg border border-border">
              <button className="px-4 py-1.5 text-sm font-semibold rounded-md bg-muted text-foreground">All (24)</button>
              <button className="px-4 py-1.5 text-sm font-semibold rounded-md text-muted-foreground hover:text-foreground">Pending (8)</button>
              <button className="px-4 py-1.5 text-sm font-semibold rounded-md text-muted-foreground hover:text-foreground">Preparing (11)</button>
              <button className="px-4 py-1.5 text-sm font-semibold rounded-md text-muted-foreground hover:text-foreground">Ready (5)</button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {orders.map((order, i) => (
              <div key={i} className="bg-card border border-border rounded-xl p-5 hover:border-primary/50 transition-colors group relative overflow-hidden">
                {order.status === 'Pending' && (
                  <div className="absolute top-0 left-0 w-1 h-full bg-red-500"></div>
                )}
                {order.status === 'Preparing' && (
                  <div className="absolute top-0 left-0 w-1 h-full bg-amber-500"></div>
                )}
                {order.status === 'Ready' && (
                  <div className="absolute top-0 left-0 w-1 h-full bg-green-500"></div>
                )}

                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-xl font-bold font-mono">#{order.id}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs font-bold bg-muted px-2 py-0.5 rounded text-muted-foreground">
                        {order.type === 'Dine-In' ? `Table ${order.table}` : 'Takeaway'}
                      </span>
                      <span className="text-xs text-muted-foreground font-medium">{order.time}</span>
                    </div>
                  </div>
                  <span className={`px-2.5 py-1 rounded-md text-xs font-bold border ${getStatusColor(order.status)}`}>
                    {order.status}
                  </span>
                </div>

                <div className="min-h-[60px] mb-4">
                  <ul className="text-sm text-muted-foreground space-y-1">
                    {order.items.map((item, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span className="text-primary/70 mt-0.5">&bull;</span> {item}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="flex items-center justify-between mt-auto pt-4 border-t border-border">
                  <span className="font-bold text-lg">&#8377;{order.total}</span>
                  
                  <div className="flex gap-2">
                    {order.status === 'Ready' && (
                      <button className="p-2 bg-green-500/10 text-green-500 rounded-lg border border-green-500/20 hover:bg-green-500 hover:text-white transition-colors" title="Send Bill">
                        <MessageCircle className="w-4 h-4" />
                      </button>
                    )}
                    <button className="px-4 py-2 bg-primary text-primary-foreground text-sm font-bold rounded-lg hover:bg-primary/90 transition-colors">
                      {order.status === 'Pending' ? 'Accept' : order.status === 'Preparing' ? 'Mark Ready' : 'Mark Served'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
