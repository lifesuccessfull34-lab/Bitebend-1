import React from "react";
import { LayoutDashboard, Store, UserPlus, CreditCard, TrendingUp, Settings, Bell, User, ChevronRight } from "lucide-react";
import "./_group.css";

export default function AppShell({ children, activePage }: { children: React.ReactNode, activePage: string }) {
  const navItems = [
    { name: "Overview", icon: LayoutDashboard, href: "#" },
    { name: "Restaurants", icon: Store, href: "#" },
    { name: "Onboarding", icon: UserPlus, href: "#" },
    { name: "Subscriptions", icon: CreditCard, href: "#" },
    { name: "Revenue Share", icon: TrendingUp, href: "#" },
  ];

  return (
    <div className="super-admin min-h-screen bg-background flex font-sans text-foreground">
      {/* Sidebar */}
      <aside className="w-64 border-r border-border bg-card flex flex-col shrink-0">
        <div className="p-6 pb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold text-lg shadow-sm shadow-primary/20">
              T
            </div>
            <h1 className="text-xl font-bold tracking-tight">TableServe</h1>
          </div>
          <span className="text-[10px] font-bold tracking-wider px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 uppercase">
            Super Admin
          </span>
        </div>
        
        <nav className="flex-1 px-3 space-y-1">
          {navItems.map((item) => (
            <a 
              key={item.name}
              href={item.href} 
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg font-medium transition-all duration-200 ${
                activePage === item.name 
                  ? "bg-primary text-primary-foreground shadow-md shadow-primary/20" 
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              <item.icon className="w-5 h-5" /> {item.name}
            </a>
          ))}
        </nav>

        <div className="p-3 border-t border-border mt-auto">
          <a href="#" className={`flex items-center gap-3 px-3 py-2.5 rounded-lg font-medium transition-colors ${
                activePage === "Settings" 
                  ? "bg-primary text-primary-foreground shadow-sm" 
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}>
            <Settings className="w-5 h-5" /> Settings
          </a>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Top Header */}
        <header className="h-16 border-b border-border bg-background/95 backdrop-blur flex items-center justify-between px-8 shrink-0 sticky top-0 z-10">
          <div className="flex items-center text-sm text-muted-foreground font-medium">
            <span>Admin</span>
            <ChevronRight className="w-4 h-4 mx-2 text-border" />
            <span className="text-foreground">{activePage}</span>
          </div>
          
          <div className="flex items-center gap-6">
            <button className="relative text-muted-foreground hover:text-foreground transition-colors">
              <Bell className="w-5 h-5" />
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-primary rounded-full border-2 border-background"></span>
            </button>
            <div className="flex items-center gap-3 border-l border-border pl-6">
              <div className="text-right hidden md:block">
                <p className="text-sm font-bold text-foreground">Vikram S.</p>
                <p className="text-xs text-muted-foreground font-medium">Platform Ops</p>
              </div>
              <div className="w-9 h-9 rounded-full bg-card border border-border flex items-center justify-center text-foreground font-bold shadow-sm">
                <User className="w-4 h-4" />
              </div>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 overflow-y-auto bg-background p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
