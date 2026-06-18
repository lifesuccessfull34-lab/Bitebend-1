import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  UtensilsCrossed,
  Table2,
  Settings,
  LogOut,
  Menu,
  X,
  CreditCard,
  Users,
  MessageCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import logo from "@/assets/logo.png";

interface NavItem {
  name: string;
  href: string;
  icon: React.ElementType;
  ownerOnly?: boolean;
}

const NAV: NavItem[] = [
  { name: "Dashboard",   href: "/restaurant/dashboard",             icon: LayoutDashboard },
  { name: "Menu",        href: "/restaurant/menu",                  icon: UtensilsCrossed },
  { name: "Tables & QR", href: "/restaurant/tables",               icon: Table2 },
  { name: "Customers",   href: "/restaurant/customers/analytics",   icon: Users },
  { name: "Subscription", href: "/restaurant/subscription",        icon: CreditCard, ownerOnly: true },
  { name: "WhatsApp",    href: "/restaurant/whatsapp",             icon: MessageCircle },
  { name: "Profile",     href: "/restaurant/profile",              icon: Settings },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navItems = NAV.filter((item) => {
    if (item.ownerOnly && user?.role !== "owner") return false;
    return true;
  });

  const Sidebar = () => (
    <div className="flex flex-col h-full">
      <div className="h-16 flex items-center px-4 border-b border-border shrink-0">
        <img src={logo} alt="Bitebend" className="w-40 h-auto object-contain" />
      </div>
      <nav className="flex-1 overflow-y-auto p-3 space-y-1">
        {navItems.map((item) => {
          const active = location === item.href || location.startsWith(item.href + "/");
          return (
            <Link
              key={item.name}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
                active
                  ? "bg-orange-50 text-orange-600 dark:bg-orange-950/30"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <item.icon className="w-5 h-5 shrink-0" />
              {item.name}
            </Link>
          );
        })}
      </nav>
      <div className="p-3 border-t border-border">
        <div className="px-3 py-2 mb-1">
          <p className="text-xs font-semibold text-foreground truncate">{user?.name}</p>
          <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-muted-foreground hover:text-destructive"
          onClick={logout}
        >
          <LogOut className="w-4 h-4 mr-2" />
          Sign out
        </Button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background flex">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-64 border-r border-border bg-card shrink-0 flex-col fixed h-full z-20">
        <Sidebar />
      </aside>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <aside
        className={cn(
          "fixed top-0 left-0 h-full w-64 z-40 bg-card border-r border-border flex-col transition-transform duration-200 md:hidden",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
          "flex"
        )}
      >
        <Sidebar />
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col md:ml-64 min-h-screen">
        {/* Mobile topbar */}
        <div className="md:hidden h-14 border-b border-border bg-card flex items-center px-4 gap-3 sticky top-0 z-10">
          <Button variant="ghost" size="icon" onClick={() => setMobileOpen(true)}>
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </Button>
          <img src={logo} alt="Bitebend" className="h-9 w-auto object-contain" />
        </div>

        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
