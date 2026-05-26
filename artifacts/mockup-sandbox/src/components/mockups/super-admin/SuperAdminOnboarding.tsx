import React from "react";
import AppShell from "./_shared/AppShell";
import { CheckCircle2, XCircle, Info, Link as LinkIcon, Send } from "lucide-react";

export function SuperAdminOnboarding() {
  const pendingApprovals = [
    { name: "Tandoor House", city: "Pune", owner: "Rohan Desai", date: "2 days ago", plan: "Growth" },
    { name: "Spicy Hub", city: "Ahmedabad", owner: "Meera Patel", date: "3 days ago", plan: "Starter" },
    { name: "The Urban Café", city: "Kolkata", owner: "Arnab Sen", date: "4 days ago", plan: "Growth" },
    { name: "Sea Food Corner", city: "Goa", owner: "Ravi Kamath", date: "5 days ago", plan: "Pro" },
    { name: "Curry Nation", city: "Nagpur", owner: "Sneha Kulkarni", date: "6 days ago", plan: "Starter" },
    { name: "Dilli Darbar", city: "Delhi", owner: "Manish Gupta", date: "1 week ago", plan: "Pro" },
  ];

  return (
    <AppShell activePage="Onboarding">
      <div className="max-w-[1400px] mx-auto flex flex-col lg:flex-row gap-8 h-full">
        
        {/* LEFT PANEL - Form */}
        <div className="flex-1 max-w-3xl space-y-6">
          <div className="bg-card border border-border rounded-xl shadow-sm p-6 lg:p-8">
            <h2 className="text-2xl font-bold mb-6">Onboard New Restaurant</h2>
            
            <form className="space-y-8">
              {/* Restaurant Details */}
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider border-b border-border pb-2">Restaurant Details</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Restaurant Name</label>
                    <input type="text" className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all" placeholder="e.g. The Spice House" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">City / Location</label>
                    <input type="text" className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all" placeholder="e.g. Mumbai" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Category</label>
                    <select className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all">
                      <option value="">Select Category</option>
                      <option>Fine Dining</option>
                      <option>Casual</option>
                      <option>QSR</option>
                      <option>Cloud Kitchen</option>
                      <option>Café</option>
                      <option>Hotel</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Number of Tables</label>
                    <input type="number" className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all" placeholder="0 if cloud kitchen" />
                  </div>
                </div>
              </div>

              {/* Owner Details */}
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider border-b border-border pb-2">Owner Contact</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5 md:col-span-2">
                    <label className="text-sm font-medium">Owner Name</label>
                    <input type="text" className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all" placeholder="e.g. Rahul Sharma" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Phone Number</label>
                    <div className="flex">
                      <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-border bg-muted/50 text-muted-foreground text-sm font-medium">
                        +91
                      </span>
                      <input type="tel" className="flex-1 bg-background border border-border rounded-none rounded-r-md px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all" placeholder="98765 43210" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Email Address</label>
                    <input type="email" className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all" placeholder="rahul@example.com" />
                  </div>
                </div>
              </div>

              {/* Subscription Plan */}
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider border-b border-border pb-2">Subscription Plan</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                  {/* Starter */}
                  <label className="relative flex flex-col bg-background border border-border rounded-xl p-4 cursor-pointer hover:border-primary/50 transition-all has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                    <input type="radio" name="plan" className="peer sr-only" />
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-bold text-foreground">Starter</span>
                      <div className="w-4 h-4 rounded-full border border-border peer-checked:border-primary peer-checked:bg-primary flex items-center justify-center">
                        <div className="w-1.5 h-1.5 rounded-full bg-background hidden peer-checked:block"></div>
                      </div>
                    </div>
                    <div className="mb-4">
                      <span className="text-xl font-bold">&#8377;999</span>
                      <span className="text-xs text-muted-foreground">/mo</span>
                    </div>
                    <ul className="text-xs text-muted-foreground space-y-2 mt-auto">
                      <li className="flex items-start gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-green-500 mt-0.5" /> Up to 50 orders/day</li>
                      <li className="flex items-start gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-green-500 mt-0.5" /> 1 location</li>
                      <li className="flex items-start gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-green-500 mt-0.5" /> Basic analytics</li>
                    </ul>
                  </label>

                  {/* Growth */}
                  <label className="relative flex flex-col bg-background border border-primary/50 rounded-xl p-4 cursor-pointer hover:border-primary transition-all has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">Most Popular</div>
                    <input type="radio" name="plan" defaultChecked className="peer sr-only" />
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-bold text-primary">Growth</span>
                      <div className="w-4 h-4 rounded-full border border-primary bg-primary flex items-center justify-center">
                        <div className="w-1.5 h-1.5 rounded-full bg-primary-foreground"></div>
                      </div>
                    </div>
                    <div className="mb-4">
                      <span className="text-xl font-bold">&#8377;2,499</span>
                      <span className="text-xs text-muted-foreground">/mo</span>
                    </div>
                    <ul className="text-xs text-muted-foreground space-y-2 mt-auto">
                      <li className="flex items-start gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-green-500 mt-0.5" /> Up to 200 orders/day</li>
                      <li className="flex items-start gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-green-500 mt-0.5" /> 3 locations</li>
                      <li className="flex items-start gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-green-500 mt-0.5" /> WhatsApp bills</li>
                    </ul>
                  </label>

                  {/* Pro */}
                  <label className="relative flex flex-col bg-background border border-border rounded-xl p-4 cursor-pointer hover:border-primary/50 transition-all has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                    <input type="radio" name="plan" className="peer sr-only" />
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-bold text-amber-500">Pro</span>
                      <div className="w-4 h-4 rounded-full border border-border peer-checked:border-primary peer-checked:bg-primary flex items-center justify-center">
                        <div className="w-1.5 h-1.5 rounded-full bg-background hidden peer-checked:block"></div>
                      </div>
                    </div>
                    <div className="mb-4">
                      <span className="text-xl font-bold">&#8377;4,999</span>
                      <span className="text-xs text-muted-foreground">/mo</span>
                    </div>
                    <ul className="text-xs text-muted-foreground space-y-2 mt-auto">
                      <li className="flex items-start gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-green-500 mt-0.5" /> Unlimited orders</li>
                      <li className="flex items-start gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-green-500 mt-0.5" /> Unlimited locations</li>
                      <li className="flex items-start gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-green-500 mt-0.5" /> Custom branding</li>
                    </ul>
                  </label>
                </div>

                <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 flex items-start gap-3 mt-4">
                  <Info className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <p className="text-sm text-foreground">
                    <span className="font-bold">Revenue Share:</span> TableServe earns 2% of GMV on top of the subscription. This is tracked automatically from order data.
                  </p>
                </div>
              </div>

              {/* Actions */}
              <div className="pt-4 flex flex-col items-center border-t border-border">
                <button type="button" className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground py-3.5 rounded-lg font-bold shadow-md hover:bg-primary/90 transition-all">
                  <Send className="w-4 h-4" /> Send Onboarding Invite
                </button>
                <div className="mt-4 flex items-center gap-4 w-full">
                  <div className="h-px bg-border flex-1"></div>
                  <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">OR</span>
                  <div className="h-px bg-border flex-1"></div>
                </div>
                <button type="button" className="mt-4 flex items-center justify-center gap-2 w-full bg-background border border-border text-foreground py-2.5 rounded-lg font-medium hover:bg-muted transition-colors text-sm">
                  <LinkIcon className="w-4 h-4" /> Share Onboarding Link
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* RIGHT PANEL - Approvals Queue */}
        <div className="w-full lg:w-96 shrink-0 flex flex-col h-full">
          <div className="bg-card border border-border rounded-xl shadow-sm flex flex-col flex-1 h-[600px] lg:h-auto overflow-hidden">
            <div className="p-4 border-b border-border bg-muted/20">
              <h3 className="font-bold flex items-center gap-2">
                Pending Onboarding
                <span className="bg-primary/20 text-primary text-xs px-2 py-0.5 rounded-full font-bold">6</span>
              </h3>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {pendingApprovals.map((req, idx) => (
                <div key={idx} className="bg-background border border-border rounded-lg p-3.5 hover:border-primary/30 transition-colors group">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h4 className="text-sm font-bold">{req.name}</h4>
                      <p className="text-xs text-muted-foreground">{req.city} &bull; {req.owner}</p>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                      req.plan === 'Pro' ? 'bg-amber-500/10 text-amber-500' :
                      req.plan === 'Growth' ? 'bg-primary/10 text-primary' :
                      'bg-muted text-muted-foreground'
                    }`}>
                      {req.plan}
                    </span>
                  </div>
                  
                  <div className="flex items-center justify-between mt-4">
                    <span className="text-[10px] font-medium text-muted-foreground flex items-center gap-1">
                      <Info className="w-3 h-3" /> {req.date}
                    </span>
                    <div className="flex items-center gap-2">
                      <button className="p-1.5 text-muted-foreground hover:bg-red-500/10 hover:text-red-500 rounded transition-colors" title="Reject">
                        <XCircle className="w-4 h-4" />
                      </button>
                      <button className="px-3 py-1 bg-green-500/10 text-green-500 hover:bg-green-500 hover:text-white border border-green-500/20 text-xs font-bold rounded transition-colors flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Approve
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>
    </AppShell>
  );
}
