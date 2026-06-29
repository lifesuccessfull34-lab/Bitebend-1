import {
  LayoutDashboard,
  Store,
  CreditCard,
  ShoppingBag,
  Users,
  Bell,
  BarChart3,
  LogOut,
  Menu,
  X,
  Shield,
  ChevronRight,
  FileText,
  Receipt,
  BookOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useState } from "react";
import logo from "@/assets/logo.png";

export type AdminSection =
  | "overview"
  | "restaurants"
  | "plans"
  | "payments"
  | "customers"
  | "notifications"
  | "legal"
  | "bills"
  | "resources"
  | "security";

interface NavItem {
  key: AdminSection;
  label: string;
  icon: React.ElementType;
  badge?: number;
}

interface AdminShellProps {
  children: React.ReactNode;
  activeSection: AdminSection;
  onSectionChange: (s: AdminSection) => void;
  navItems: NavItem[];
}

export function AdminShell({ children, activeSection, onSectionChange, navItems }: AdminShellProps) {
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleNav = (key: AdminSection) => {
    onSectionChange(key);
    setMobileOpen(false);
  };

  const Sidebar = () => (
    <div className="flex flex-col h-full bg-gradient-to-b from-orange-900 via-orange-950 to-amber-950 text-orange-100">
      {/* Logo */}
      <div className="h-16 flex items-center px-4 border-b border-orange-800/60 shrink-0">
        <img src={logo} alt="Bitebend" className="w-36 h-auto object-contain" style={{ filter: "drop-shadow(0 1px 4px rgba(0,0,0,0.55))" }} />
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto p-3 space-y-0.5">
        <p className="text-[10px] font-bold text-orange-600 uppercase tracking-wider px-3 pt-2 pb-1.5">
          Platform
        </p>
        {navItems.map((item) => {
          const active = activeSection === item.key;
          return (
            <button
              key={item.key}
              onClick={() => handleNav(item.key)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all text-left",
                active
                  ? "bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-md shadow-orange-900/40"
                  : "text-orange-300 hover:bg-orange-800/50 hover:text-orange-100"
              )}
            >
              <item.icon className="w-[18px] h-[18px] shrink-0" />
              <span className="flex-1">{item.label}</span>
              {item.badge != null && item.badge > 0 && (
                <span className={cn(
                  "text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center",
                  active ? "bg-white/25 text-white" : "bg-red-500 text-white"
                )}>
                  {item.badge}
                </span>
              )}
              {active && <ChevronRight className="w-3.5 h-3.5 opacity-70" />}
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-orange-800/60 space-y-1">
        <div className="px-3 py-2.5 rounded-lg bg-orange-800/40 border border-orange-700/30">
          <p className="text-xs font-semibold text-orange-100 truncate">{user?.name}</p>
          <p className="text-[11px] text-orange-400 truncate">{user?.email}</p>
          <span className="inline-block mt-1 text-[10px] font-bold uppercase tracking-wider text-amber-300 bg-amber-500/20 px-1.5 py-0.5 rounded border border-amber-500/30">
            Super Admin
          </span>
        </div>
        <button
          onClick={logout}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-orange-400 hover:bg-orange-800/50 hover:text-red-400 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Sign out
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-amber-50 flex">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-60 shrink-0 flex-col fixed h-full z-20">
        <Sidebar />
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <aside
        className={cn(
          "fixed top-0 left-0 h-full w-60 z-40 flex-col transition-transform duration-200 md:hidden flex",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <Sidebar />
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col md:ml-60 min-h-screen">
        {/* Mobile topbar */}
        <div className="md:hidden h-14 border-b border-orange-200 bg-gradient-to-r from-orange-900 to-amber-900 flex items-center px-4 gap-3 sticky top-0 z-10">
          <button
            className="text-orange-300 hover:text-white"
            onClick={() => setMobileOpen((v) => !v)}
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <div className="flex items-center gap-2">
            <img src={logo} alt="Bitebend" className="h-8 w-auto object-contain" style={{ filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.55))" }} />
          </div>
        </div>

        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}

export const ADMIN_NAV_ITEMS = (
  pendingPayments: number,
  exhaustedRestaurants: number
): NavItem[] => [
  { key: "overview", label: "Overview", icon: LayoutDashboard },
  { key: "restaurants", label: "Restaurants", icon: Store, badge: exhaustedRestaurants },
  { key: "plans", label: "Plans", icon: BarChart3 },
  { key: "payments", label: "Payments", icon: CreditCard, badge: pendingPayments },
  { key: "customers", label: "Customers", icon: Users },
  { key: "notifications", label: "Notifications", icon: Bell },
  { key: "legal", label: "Legal Pages", icon: FileText },
  { key: "bills", label: "Bill Metrics", icon: Receipt },
  { key: "resources", label: "Tutorials", icon: BookOpen },
  { key: "security", label: "Security", icon: Shield },
];
