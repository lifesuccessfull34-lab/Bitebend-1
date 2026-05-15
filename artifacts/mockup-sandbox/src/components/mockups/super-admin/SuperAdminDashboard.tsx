import React from "react";
import AppShell from "./_shared/AppShell";
import { ArrowUpRight, ArrowDownRight, MoreHorizontal, Clock, AlertTriangle, AlertCircle } from "lucide-react";

export function SuperAdminDashboard() {
  const mrrData = [180000, 230000, 290000, 340000, 410000, 482500];
  const maxMrr = 500000;
  
  // Calculate SVG polyline points
  const points = mrrData.map((val, idx) => {
    const x = (idx / (mrrData.length - 1)) * 100;
    const y = 100 - (val / maxMrr) * 100;
    return `${x},${y}`;
  }).join(" ");

  const pointsWithBase = `0,100 ${points} 100,100`;

  const recentSignups = [
    { name: "The Spice House", plan: "Growth", city: "Mumbai", date: "Today", status: "Active" },
    { name: "Punjab Da Dhaba", plan: "Pro", city: "Delhi", date: "Yesterday", status: "Active" },
    { name: "Coastal Bites", plan: "Starter", city: "Chennai", date: "2 days ago", status: "Trial" },
    { name: "Biryani Palace", plan: "Growth", city: "Hyderabad", date: "3 days ago", status: "Active" },
    { name: "The Royal Thali", plan: "Starter", city: "Jaipur", date: "4 days ago", status: "Active" },
  ];

  return (
    <AppShell activePage="Overview">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* KPI Strip */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
            <p className="text-sm font-medium text-muted-foreground mb-1">Total Restaurants</p>
            <div className="flex items-end justify-between">
              <h3 className="text-3xl font-bold">248</h3>
              <span className="flex items-center text-sm font-medium text-primary bg-primary/10 px-2 py-0.5 rounded">
                <ArrowUpRight className="w-4 h-4 mr-0.5" /> +12
              </span>
            </div>
          </div>
          
          <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
            <p className="text-sm font-medium text-muted-foreground mb-1">Monthly Recurring Revenue</p>
            <div className="flex items-end justify-between">
              <h3 className="text-3xl font-bold">&#8377;4.82L</h3>
              <span className="flex items-center text-sm font-medium text-green-500 bg-green-500/10 px-2 py-0.5 rounded">
                <ArrowUpRight className="w-4 h-4 mr-0.5" /> +18%
              </span>
            </div>
          </div>

          <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
            <p className="text-sm font-medium text-muted-foreground mb-1">Platform Rev Share (2%)</p>
            <div className="flex items-end justify-between">
              <h3 className="text-3xl font-bold">&#8377;1.24L</h3>
              <span className="flex items-center text-sm font-medium text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded">
                <ArrowUpRight className="w-4 h-4 mr-0.5" /> +22%
              </span>
            </div>
          </div>

          <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
            <p className="text-sm font-medium text-muted-foreground mb-1">Churn Rate</p>
            <div className="flex items-end justify-between">
              <h3 className="text-3xl font-bold">2.4%</h3>
              <span className="flex items-center text-sm font-medium text-green-500 bg-green-500/10 px-2 py-0.5 rounded">
                <ArrowDownRight className="w-4 h-4 mr-0.5" /> -0.3%
              </span>
            </div>
          </div>
        </div>

        {/* Charts & Tables Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* MRR Chart (2/3 width) */}
          <div className="lg:col-span-2 bg-card border border-border rounded-xl p-6 shadow-sm flex flex-col">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h3 className="text-lg font-bold">MRR Growth</h3>
                <p className="text-sm text-muted-foreground">Jan - Jun 2024</p>
              </div>
              <button className="text-muted-foreground hover:text-foreground">
                <MoreHorizontal className="w-5 h-5" />
              </button>
            </div>
            
            <div className="flex-1 relative min-h-[240px]">
              {/* Y Axis */}
              <div className="absolute inset-0 flex flex-col justify-between text-[10px] text-muted-foreground font-medium pb-6">
                <div className="flex items-center w-full border-t border-border/50 pt-1"><span>&#8377;5L</span></div>
                <div className="flex items-center w-full border-t border-border/50 pt-1"><span>&#8377;4L</span></div>
                <div className="flex items-center w-full border-t border-border/50 pt-1"><span>&#8377;3L</span></div>
                <div className="flex items-center w-full border-t border-border/50 pt-1"><span>&#8377;2L</span></div>
                <div className="flex items-center w-full border-t border-border/50 pt-1"><span>&#8377;1L</span></div>
              </div>

              {/* Chart SVG */}
              <div className="absolute inset-0 pl-8 pb-6">
                <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full overflow-visible">
                  <defs>
                    <linearGradient id="mrrGradient" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.2" />
                      <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  
                  <polygon points={pointsWithBase} fill="url(#mrrGradient)" />
                  <polyline
                    points={points}
                    fill="none"
                    stroke="hsl(var(--primary))"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                  />
                  {/* Data points */}
                  {mrrData.map((val, idx) => {
                    const x = (idx / (mrrData.length - 1)) * 100;
                    const y = 100 - (val / maxMrr) * 100;
                    return (
                      <circle key={idx} cx={x} cy={y} r="1.5" fill="hsl(var(--background))" stroke="hsl(var(--primary))" strokeWidth="1" vectorEffect="non-scaling-stroke" />
                    );
                  })}
                </svg>
              </div>

              {/* X Axis */}
              <div className="absolute bottom-0 left-8 right-0 flex justify-between text-[10px] text-muted-foreground font-medium pt-2 border-t border-border">
                <span>Jan</span>
                <span>Feb</span>
                <span>Mar</span>
                <span>Apr</span>
                <span>May</span>
                <span>Jun</span>
              </div>
            </div>
          </div>

          {/* Right Column: Donut + Table */}
          <div className="space-y-6">
            
            {/* Plan Distribution */}
            <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
              <h3 className="text-lg font-bold mb-6">Plan Distribution</h3>
              <div className="flex items-center justify-between">
                <div className="relative w-32 h-32">
                  <svg viewBox="0 0 100 100" className="w-full h-full transform -rotate-90">
                    <circle cx="50" cy="50" r="40" fill="none" stroke="hsl(var(--border))" strokeWidth="20" />
                    <circle cx="50" cy="50" r="40" fill="none" stroke="hsl(var(--primary))" strokeWidth="20" strokeDasharray="251.2" strokeDashoffset="150" /> {/* 40% Growth */}
                    <circle cx="50" cy="50" r="40" fill="none" stroke="#F59E0B" strokeWidth="20" strokeDasharray="251.2" strokeDashoffset="200" strokeDashoffset="201" transform="rotate(144 50 50)" /> {/* 20% Pro */}
                    <circle cx="50" cy="50" r="40" fill="none" stroke="hsl(var(--muted-foreground))" strokeOpacity="0.5" strokeWidth="20" strokeDasharray="251.2" strokeDashoffset="145" transform="rotate(216 50 50)" /> {/* 42% Starter */}
                  </svg>
                </div>
                <div className="space-y-3 flex-1 pl-6">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded bg-muted-foreground/50"></div>
                      <span className="font-medium text-muted-foreground">Starter</span>
                    </div>
                    <span className="font-bold">42%</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded bg-primary"></div>
                      <span className="font-medium text-muted-foreground">Growth</span>
                    </div>
                    <span className="font-bold">38%</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded bg-amber-500"></div>
                      <span className="font-medium text-muted-foreground">Pro</span>
                    </div>
                    <span className="font-bold">20%</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Recent Signups */}
            <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold">Recent Signups</h3>
                <button className="text-xs text-primary font-medium hover:underline">View All</button>
              </div>
              <div className="space-y-4">
                {recentSignups.slice(0, 3).map((restaurant, idx) => (
                  <div key={idx} className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-bold">{restaurant.name}</p>
                      <p className="text-[10px] text-muted-foreground">{restaurant.city} &bull; {restaurant.date}</p>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                      restaurant.plan === 'Pro' ? 'bg-amber-500/10 text-amber-500' :
                      restaurant.plan === 'Growth' ? 'bg-primary/10 text-primary' :
                      'bg-muted text-muted-foreground'
                    }`}>
                      {restaurant.plan}
                    </span>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>

        {/* Bottom Alerts Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
          <div className="bg-card border border-border rounded-xl p-4 flex items-start gap-4">
            <div className="bg-amber-500/10 text-amber-500 p-2 rounded-lg">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold">Trials Ending</h4>
              <p className="text-xs text-muted-foreground mt-1">4 restaurants on trial ending in 3 days.</p>
              <button className="text-xs font-bold text-amber-500 mt-2">View List &rarr;</button>
            </div>
          </div>
          
          <div className="bg-card border border-border rounded-xl p-4 flex items-start gap-4">
            <div className="bg-red-500/10 text-red-500 p-2 rounded-lg">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold">Payment Failures</h4>
              <p className="text-xs text-muted-foreground mt-1">2 subscriptions failed renewal.</p>
              <button className="text-xs font-bold text-red-500 mt-2">Follow up &rarr;</button>
            </div>
          </div>

          <div className="bg-card border border-border rounded-xl p-4 flex items-start gap-4">
            <div className="bg-primary/10 text-primary p-2 rounded-lg">
              <AlertCircle className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold">Pending Approval</h4>
              <p className="text-xs text-muted-foreground mt-1">1 new restaurant waiting for onboarding.</p>
              <button className="text-xs font-bold text-primary mt-2">Review &rarr;</button>
            </div>
          </div>
        </div>

      </div>
    </AppShell>
  );
}
