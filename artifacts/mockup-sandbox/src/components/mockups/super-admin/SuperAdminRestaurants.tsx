import React from "react";
import AppShell from "./_shared/AppShell";
import { Search, Filter, Plus, MoreHorizontal, ChevronLeft, ChevronRight } from "lucide-react";

export function SuperAdminRestaurants() {
  const restaurants = [
    { id: "1", name: "The Spice House", city: "Mumbai", owner: "Rahul Sharma", plan: "Growth", status: "Active", billing: 2499, gmv: 124800, revShare: 2496, joined: "12 Jan 2024" },
    { id: "2", name: "Punjab Da Dhaba", city: "Delhi", owner: "Gurpreet Singh", plan: "Pro", status: "Active", billing: 4999, gmv: 318500, revShare: 6370, joined: "05 Feb 2024" },
    { id: "3", name: "Coastal Bites", city: "Chennai", owner: "Priya Nair", plan: "Starter", status: "Trial", billing: 999, gmv: 28200, revShare: 564, joined: "28 May 2024" },
    { id: "4", name: "Biryani Palace", city: "Hyderabad", owner: "Mohammed Farhan", plan: "Growth", status: "Active", billing: 2499, gmv: 205600, revShare: 4112, joined: "14 Mar 2024" },
    { id: "5", name: "The Royal Thali", city: "Jaipur", owner: "Vikram Rathore", plan: "Starter", status: "Active", billing: 999, gmv: 41300, revShare: 826, joined: "02 Apr 2024" },
    { id: "6", name: "Green Bowl", city: "Bangalore", owner: "Ananya Reddy", plan: "Growth", status: "Active", billing: 2499, gmv: 89700, revShare: 1794, joined: "19 Apr 2024" },
    { id: "7", name: "Bombay Burger Co.", city: "Mumbai", owner: "Sameer Joshi", plan: "Pro", status: "Active", billing: 4999, gmv: 412000, revShare: 8240, joined: "22 Jan 2024" },
    { id: "8", name: "Dosa Express", city: "Coimbatore", owner: "Karthik Raj", plan: "Starter", status: "Churned", billing: 999, gmv: 0, revShare: 0, joined: "10 Feb 2024" },
    { id: "9", name: "Himalayan Kitchen", city: "Shimla", owner: "Deepa Thakur", plan: "Growth", status: "Trial", billing: 2499, gmv: 15400, revShare: 308, joined: "01 Jun 2024" },
    { id: "10", name: "Moti Mahal", city: "Lucknow", owner: "Aditya Bajpai", plan: "Pro", status: "Active", billing: 4999, gmv: 276400, revShare: 5528, joined: "08 Mar 2024" },
  ];

  const getPlanBadge = (plan: string) => {
    switch (plan) {
      case 'Pro': return 'bg-amber-500/10 text-amber-500 border border-amber-500/20';
      case 'Growth': return 'bg-primary/10 text-primary border border-primary/20';
      case 'Starter': return 'bg-muted text-muted-foreground border border-border';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Active': return 'bg-green-500/10 text-green-500';
      case 'Trial': return 'bg-amber-500/10 text-amber-500';
      case 'Churned': return 'bg-red-500/10 text-red-500';
      case 'Suspended': return 'bg-orange-500/10 text-orange-500';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const formatCurrency = (num: number) => {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(num);
  };

  const totals = {
    billing: restaurants.reduce((acc, r) => acc + (r.status !== 'Churned' ? r.billing : 0), 0),
    gmv: restaurants.reduce((acc, r) => acc + r.gmv, 0),
    revShare: restaurants.reduce((acc, r) => acc + r.revShare, 0)
  };

  return (
    <AppShell activePage="Restaurants">
      <div className="max-w-[1400px] mx-auto flex flex-col h-full">
        
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold">All Restaurants</h2>
            <p className="text-sm text-muted-foreground mt-1">Manage 248 restaurants across all plans</p>
          </div>
          <button className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg font-medium shadow-sm hover:bg-primary/90 transition-colors">
            <Plus className="w-4 h-4" /> Onboard New
          </button>
        </div>

        <div className="bg-card border border-border rounded-xl shadow-sm flex flex-col flex-1 overflow-hidden">
          
          {/* Filters Bar */}
          <div className="p-4 border-b border-border flex flex-wrap items-center justify-between gap-4 bg-muted/20">
            <div className="relative w-72">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input 
                type="text" 
                placeholder="Search restaurants, owners..." 
                className="w-full bg-background border border-border rounded-md py-1.5 pl-9 pr-3 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
              />
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground font-medium">Plan:</span>
                <select className="bg-background border border-border rounded-md py-1.5 px-3 text-sm outline-none focus:border-primary">
                  <option>All Plans</option>
                  <option>Starter</option>
                  <option>Growth</option>
                  <option>Pro</option>
                </select>
              </div>
              <div className="flex items-center gap-2 text-sm ml-2">
                <span className="text-muted-foreground font-medium">Status:</span>
                <select className="bg-background border border-border rounded-md py-1.5 px-3 text-sm outline-none focus:border-primary">
                  <option>All Status</option>
                  <option>Active</option>
                  <option>Trial</option>
                  <option>Churned</option>
                </select>
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-muted/30 text-muted-foreground sticky top-0 z-10 text-xs uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-4 font-bold">Restaurant</th>
                  <th className="px-6 py-4 font-bold">Owner</th>
                  <th className="px-6 py-4 font-bold">Plan</th>
                  <th className="px-6 py-4 font-bold">Status</th>
                  <th className="px-6 py-4 font-bold text-right">Mth Billing</th>
                  <th className="px-6 py-4 font-bold text-right">Mth GMV</th>
                  <th className="px-6 py-4 font-bold text-right">Rev Share (2%)</th>
                  <th className="px-6 py-4 font-bold">Joined</th>
                  <th className="px-6 py-4 font-bold text-right"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {restaurants.map((restaurant) => (
                  <tr key={restaurant.id} className="hover:bg-muted/10 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="font-bold text-foreground">{restaurant.name}</div>
                      <div className="text-xs text-muted-foreground">{restaurant.city}</div>
                    </td>
                    <td className="px-6 py-4 text-muted-foreground font-medium">{restaurant.owner}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 rounded text-xs font-bold ${getPlanBadge(restaurant.plan)}`}>
                        {restaurant.plan}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 rounded text-xs font-bold flex inline-flex items-center gap-1.5 ${getStatusBadge(restaurant.status)}`}>
                        <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
                        {restaurant.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right font-medium text-foreground">{formatCurrency(restaurant.billing)}</td>
                    <td className="px-6 py-4 text-right font-medium text-muted-foreground">{formatCurrency(restaurant.gmv)}</td>
                    <td className="px-6 py-4 text-right font-bold text-green-500">{formatCurrency(restaurant.revShare)}</td>
                    <td className="px-6 py-4 text-muted-foreground">{restaurant.joined}</td>
                    <td className="px-6 py-4 text-right">
                      <button className="text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                        <MoreHorizontal className="w-5 h-5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-muted/30 font-bold border-t-2 border-border">
                <tr>
                  <td colSpan={4} className="px-6 py-4 text-right text-muted-foreground">Totals (Current Page)</td>
                  <td className="px-6 py-4 text-right text-foreground">{formatCurrency(totals.billing)}</td>
                  <td className="px-6 py-4 text-right text-muted-foreground">{formatCurrency(totals.gmv)}</td>
                  <td className="px-6 py-4 text-right text-green-500">{formatCurrency(totals.revShare)}</td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Pagination Footer */}
          <div className="p-4 border-t border-border flex items-center justify-between bg-background">
            <span className="text-sm text-muted-foreground font-medium">Showing 1–10 of 248 restaurants</span>
            <div className="flex gap-1">
              <button className="p-1.5 rounded border border-border text-muted-foreground hover:bg-muted disabled:opacity-50" disabled>
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button className="px-3 py-1.5 rounded bg-primary text-primary-foreground text-sm font-medium">1</button>
              <button className="px-3 py-1.5 rounded border border-border hover:bg-muted text-sm font-medium">2</button>
              <button className="px-3 py-1.5 rounded border border-border hover:bg-muted text-sm font-medium">3</button>
              <span className="px-2 py-1.5 text-muted-foreground">...</span>
              <button className="px-3 py-1.5 rounded border border-border hover:bg-muted text-sm font-medium">25</button>
              <button className="p-1.5 rounded border border-border text-muted-foreground hover:bg-muted">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

        </div>
      </div>
    </AppShell>
  );
}
