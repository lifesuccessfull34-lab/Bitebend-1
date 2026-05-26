import { useState, useCallback, useMemo, useEffect } from "react";
import { useLocation } from "wouter";
import { AdminShell, ADMIN_NAV_ITEMS } from "@/components/layout/AdminShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  Plus, X, Save, Loader2, BookOpen, CheckCircle, Ban, Edit2, Trash2,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface AdminResource {
  id: number; title: string; description: string | null; type: string;
  category: string | null; thumbnail: string | null; url: string | null;
  fileUrl: string | null; tags: string[]; featured: boolean;
  displayOrder: number; status: string; approvalStatus: string;
  visibleTo: string; createdBy: number | null; approvedBy: number | null;
  updatedBy: number | null; reviewNotes: string | null; rejectionReason: string | null;
  deletedAt: string | null; publishAt: string | null; expireAt: string | null;
  duration: string | null; videoSource: string | null; sizeLabel: string | null;
  planName: string | null; planPrice: string | null; planPeriod: string | null;
  planFeatures: string[] | null; planHighlight: boolean | null;
  planBadge: string | null; planCta: string | null;
  iconName: string | null; iconColor: string | null;
  question: string | null; answer: string | null;
  createdAt: string; updatedAt: string;
}

interface ResourceFormState {
  id: number | null; title: string; description: string; type: string;
  category: string; url: string; fileUrl: string; tags: string;
  featured: boolean; displayOrder: number; status: string; approvalStatus: string;
  visibleTo: string; reviewNotes: string;
  duration: string; videoSource: string; sizeLabel: string;
  planName: string; planPrice: string; planPeriod: string;
  planFeatures: string; planHighlight: boolean; planBadge: string; planCta: string;
  iconName: string; iconColor: string; question: string; answer: string;
}

function emptyForm(): ResourceFormState {
  return {
    id: null, title: "", description: "", type: "video", category: "",
    url: "", fileUrl: "", tags: "", featured: false, displayOrder: 0,
    status: "draft", approvalStatus: "pending", visibleTo: "all", reviewNotes: "",
    duration: "", videoSource: "youtube", sizeLabel: "",
    planName: "", planPrice: "", planPeriod: "", planFeatures: "",
    planHighlight: false, planBadge: "", planCta: "",
    iconName: "", iconColor: "", question: "", answer: "",
  };
}

function resourceToForm(r: AdminResource): ResourceFormState {
  return {
    id: r.id, title: r.title, description: r.description ?? "",
    type: r.type, category: r.category ?? "", url: r.url ?? "",
    fileUrl: r.fileUrl ?? "", tags: (r.tags ?? []).join(", "),
    featured: r.featured, displayOrder: r.displayOrder, status: r.status,
    approvalStatus: r.approvalStatus, visibleTo: r.visibleTo ?? "all",
    reviewNotes: r.reviewNotes ?? "",
    duration: r.duration ?? "", videoSource: r.videoSource ?? "youtube",
    sizeLabel: r.sizeLabel ?? "", planName: r.planName ?? "",
    planPrice: r.planPrice ?? "", planPeriod: r.planPeriod ?? "",
    planFeatures: (r.planFeatures ?? []).join("\n"),
    planHighlight: r.planHighlight ?? false, planBadge: r.planBadge ?? "",
    planCta: r.planCta ?? "", iconName: r.iconName ?? "",
    iconColor: r.iconColor ?? "", question: r.question ?? "", answer: r.answer ?? "",
  };
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ResourcesManage() {
  const [, navigate] = useLocation();

  const [resources, setResources] = useState<AdminResource[]>([]);
  const [resFilter, setResFilter] = useState<"all" | "pending" | "approved" | "rejected">("all");
  const [form, setForm] = useState<ResourceFormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [actionId, setActionId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const handleAuthError = useCallback((e: unknown) => {
    if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
      fetch("/api/auth/logout", { method: "POST", credentials: "include" })
        .catch(() => {})
        .finally(() => { window.location.href = "/portal/admin/login"; });
      return true;
    }
    return false;
  }, []);

  useEffect(() => {
    apiFetch<AdminResource[]>("/admin/resources")
      .then((data) => setResources(data))
      .catch((e) => { handleAuthError(e); })
      .finally(() => setLoading(false));
  }, [handleAuthError]);

  const handleSave = useCallback(async () => {
    if (!form) return;
    setSaving(true);
    try {
      const body = {
        title: form.title.trim(), description: form.description.trim() || null,
        type: form.type, category: form.category.trim() || null,
        url: form.url.trim() || null, fileUrl: form.fileUrl.trim() || null,
        tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
        featured: form.featured, displayOrder: form.displayOrder,
        status: form.status, approvalStatus: form.approvalStatus,
        visibleTo: form.visibleTo,
        duration: form.duration.trim() || null,
        videoSource: form.videoSource || null,
        sizeLabel: form.sizeLabel.trim() || null,
        planName: form.planName.trim() || null,
        planPrice: form.planPrice.trim() || null,
        planPeriod: form.planPeriod.trim() || null,
        planFeatures: form.planFeatures.split("\n").map((f) => f.trim()).filter(Boolean),
        planHighlight: form.planHighlight,
        planBadge: form.planBadge.trim() || null,
        planCta: form.planCta || null,
        iconName: form.iconName.trim() || null,
        iconColor: form.iconColor.trim() || null,
        question: form.question.trim() || null,
        answer: form.answer.trim() || null,
        reviewNotes: form.reviewNotes.trim() || null,
      };
      if (form.id) {
        const updated = await apiFetch<AdminResource>(`/admin/resources/${form.id}`, { method: "PUT", body: JSON.stringify(body) });
        setResources((prev) => prev.map((r) => r.id === form.id ? updated : r));
      } else {
        const created = await apiFetch<AdminResource>("/admin/resources", { method: "POST", body: JSON.stringify(body) });
        setResources((prev) => [...prev, created]);
      }
      setForm(null);
    } catch (e) { handleAuthError(e); }
    finally { setSaving(false); }
  }, [form, handleAuthError]);

  const handleApprove = useCallback(async (id: number) => {
    setActionId(id);
    try {
      const updated = await apiFetch<AdminResource>(`/admin/resources/${id}/approve`, { method: "POST" });
      setResources((prev) => prev.map((r) => r.id === id ? updated : r));
    } catch (e) { handleAuthError(e); }
    finally { setActionId(null); }
  }, [handleAuthError]);

  const handleReject = useCallback(async (id: number) => {
    const reason = window.prompt("Rejection reason (optional):");
    if (reason === null) return;
    setActionId(id);
    try {
      const updated = await apiFetch<AdminResource>(`/admin/resources/${id}/reject`, {
        method: "POST",
        body: JSON.stringify({ rejectionReason: reason.trim() || undefined }),
      });
      setResources((prev) => prev.map((r) => r.id === id ? updated : r));
    } catch (e) { handleAuthError(e); }
    finally { setActionId(null); }
  }, [handleAuthError]);

  const handleFeature = useCallback(async (id: number) => {
    setActionId(id);
    try {
      const updated = await apiFetch<AdminResource>(`/admin/resources/${id}/feature`, { method: "POST" });
      setResources((prev) => prev.map((r) => r.id === id ? updated : r));
    } catch (e) { handleAuthError(e); }
    finally { setActionId(null); }
  }, [handleAuthError]);

  const handleDelete = useCallback(async (id: number) => {
    if (!confirm("Archive this resource? It will be soft-deleted and hidden from all views.")) return;
    setActionId(id);
    try {
      await apiFetch(`/admin/resources/${id}`, { method: "DELETE" });
      setResources((prev) => prev.filter((r) => r.id !== id));
    } catch (e) { handleAuthError(e); }
    finally { setActionId(null); }
  }, [handleAuthError]);

  const filtered = useMemo(() =>
    resFilter === "all" ? resources
      : resources.filter((r) => r.approvalStatus === resFilter),
    [resources, resFilter],
  );

  const f = form;
  const setF = (patch: Partial<ResourceFormState>) =>
    setForm((prev) => prev ? { ...prev, ...patch } : prev);

  const navItems = ADMIN_NAV_ITEMS(0, 0);

  return (
    <AdminShell
      activeSection="resources"
      onSectionChange={(s) => navigate(s === "resources" ? "/admin/resources" : "/admin/dashboard")}
      navItems={navItems}
    >
      <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-5">

        {/* Page header */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-lg font-bold text-slate-800">Resources CMS</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              {resources.length} resources · {resources.filter((r) => r.approvalStatus === "pending").length} pending
            </p>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="/portal/resources"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-indigo-600 hover:underline font-medium"
            >
              Preview public page ↗
            </a>
            <Button size="sm" onClick={() => setForm(emptyForm())}
              className="bg-indigo-600 hover:bg-indigo-700 text-white">
              <Plus className="w-3.5 h-3.5 mr-1.5" /> Add Resource
            </Button>
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2 flex-wrap">
          {(["all", "pending", "approved", "rejected"] as const).map((filter) => {
            const count = filter === "all" ? resources.length
              : resources.filter((r) => r.approvalStatus === filter).length;
            return (
              <button key={filter} onClick={() => setResFilter(filter)}
                className={cn("px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors capitalize",
                  resFilter === filter
                    ? filter === "pending" ? "bg-amber-500 text-white border-amber-500"
                      : filter === "approved" ? "bg-emerald-600 text-white border-emerald-600"
                      : filter === "rejected" ? "bg-red-500 text-white border-red-500"
                      : "bg-indigo-600 text-white border-indigo-600"
                    : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                )}>
                {filter === "all" ? "All" : filter} <span className="ml-0.5 opacity-70">{count}</span>
              </button>
            );
          })}
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-16 text-slate-400">
            <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading resources…
          </div>
        )}

        {/* Create / Edit form */}
        {f && (
          <div className="bg-white rounded-xl border border-indigo-200 shadow-sm p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-slate-800">{f.id ? "Edit Resource" : "New Resource"}</h3>
              <button onClick={() => setForm(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Type */}
              <div className="space-y-1">
                <Label className="text-xs">Type *</Label>
                <select value={f.type} onChange={(e) => setF({ type: e.target.value })}
                  className="w-full text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300">
                  {(["video", "pdf", "link", "plan", "faq"] as const).map((t) => (
                    <option key={t} value={t}>{t.toUpperCase()}</option>
                  ))}
                </select>
              </div>
              {/* Status */}
              <div className="space-y-1">
                <Label className="text-xs">Status</Label>
                <select value={f.status} onChange={(e) => setF({ status: e.target.value })}
                  className="w-full text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300">
                  <option value="draft">Draft</option>
                  <option value="active">Active</option>
                  <option value="archived">Archived</option>
                </select>
              </div>
              {/* Approval */}
              <div className="space-y-1">
                <Label className="text-xs">Approval</Label>
                <select value={f.approvalStatus} onChange={(e) => setF({ approvalStatus: e.target.value })}
                  className="w-full text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300">
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>
              {/* Visible To */}
              <div className="space-y-1">
                <Label className="text-xs">Visible To</Label>
                <select value={f.visibleTo} onChange={(e) => setF({ visibleTo: e.target.value })}
                  className="w-full text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300">
                  <option value="public">Public (anyone)</option>
                  <option value="restaurant">Restaurant owners only</option>
                  <option value="admin">Admin only</option>
                  <option value="all">All authenticated</option>
                </select>
              </div>
              {/* Display Order */}
              <div className="space-y-1">
                <Label className="text-xs">Display Order</Label>
                <Input type="number" value={f.displayOrder}
                  onChange={(e) => setF({ displayOrder: parseInt(e.target.value) || 0 })} />
              </div>
              {/* Featured */}
              <div className="flex items-center gap-2 pt-5">
                <input type="checkbox" id="res-featured" checked={f.featured}
                  onChange={(e) => setF({ featured: e.target.checked })}
                  className="w-4 h-4 rounded accent-indigo-600" />
                <label htmlFor="res-featured" className="text-sm font-medium text-slate-700">Featured</label>
              </div>
              {/* Title */}
              <div className="sm:col-span-2 space-y-1">
                <Label className="text-xs">Title *</Label>
                <Input value={f.title} onChange={(e) => setF({ title: e.target.value })} placeholder="Resource title" />
              </div>
              {/* Description */}
              <div className="sm:col-span-2 space-y-1">
                <Label className="text-xs">Description</Label>
                <Input value={f.description} onChange={(e) => setF({ description: e.target.value })} placeholder="Brief description" />
              </div>
              {/* Category */}
              <div className="space-y-1">
                <Label className="text-xs">Category</Label>
                <Input value={f.category} onChange={(e) => setF({ category: e.target.value })} placeholder="e.g. Setup, Payments" />
              </div>
              {/* URL */}
              <div className="space-y-1">
                <Label className="text-xs">URL</Label>
                <Input value={f.url} onChange={(e) => setF({ url: e.target.value })} placeholder="https://" />
              </div>
              {/* Tags */}
              <div className="space-y-1">
                <Label className="text-xs">Tags (comma-separated)</Label>
                <Input value={f.tags} onChange={(e) => setF({ tags: e.target.value })} placeholder="setup, tutorial, demo" />
              </div>

              {/* Video-specific */}
              {f.type === "video" && (<>
                <div className="space-y-1">
                  <Label className="text-xs">Duration</Label>
                  <Input value={f.duration} onChange={(e) => setF({ duration: e.target.value })} placeholder="3:24" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Video Source</Label>
                  <select value={f.videoSource} onChange={(e) => setF({ videoSource: e.target.value })}
                    className="w-full text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300">
                    <option value="youtube">YouTube</option>
                    <option value="external">External</option>
                    <option value="self-hosted">Self-hosted</option>
                  </select>
                </div>
              </>)}

              {/* PDF-specific */}
              {f.type === "pdf" && (
                <div className="space-y-1">
                  <Label className="text-xs">File URL</Label>
                  <Input value={f.fileUrl} onChange={(e) => setF({ fileUrl: e.target.value })} placeholder="/docs/guide.pdf or https://…" />
                </div>
              )}

              {/* Plan-specific */}
              {f.type === "plan" && (<>
                <div className="space-y-1">
                  <Label className="text-xs">Plan Name</Label>
                  <Input value={f.planName} onChange={(e) => setF({ planName: e.target.value })} placeholder="Starter" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Price</Label>
                  <Input value={f.planPrice} onChange={(e) => setF({ planPrice: e.target.value })} placeholder="₹199" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Period</Label>
                  <Input value={f.planPeriod} onChange={(e) => setF({ planPeriod: e.target.value })} placeholder="per 500 customers" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Badge</Label>
                  <Input value={f.planBadge} onChange={(e) => setF({ planBadge: e.target.value })} placeholder="Most Popular" />
                </div>
                <div className="sm:col-span-2 space-y-1">
                  <Label className="text-xs">Features (one per line)</Label>
                  <textarea value={f.planFeatures} onChange={(e) => setF({ planFeatures: e.target.value })}
                    className="w-full text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 h-24 resize-none"
                    placeholder={"Up to 500 unique customers\nQR table ordering\nBasic menu management"} />
                </div>
                <div className="flex items-center gap-2">
                  <input type="checkbox" id="plan-highlight" checked={f.planHighlight}
                    onChange={(e) => setF({ planHighlight: e.target.checked })}
                    className="w-4 h-4 rounded accent-indigo-600" />
                  <label htmlFor="plan-highlight" className="text-sm font-medium text-slate-700">Highlight (recommended)</label>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">CTA</Label>
                  <select value={f.planCta} onChange={(e) => setF({ planCta: e.target.value })}
                    className="w-full text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300">
                    <option value="">None</option>
                    <option value="trial">Start Trial</option>
                    <option value="contact">Contact Us</option>
                  </select>
                </div>
              </>)}

              {/* Link-specific */}
              {f.type === "link" && (<>
                <div className="space-y-1">
                  <Label className="text-xs">Icon Name</Label>
                  <Input value={f.iconName} onChange={(e) => setF({ iconName: e.target.value })} placeholder="calendar, globe, mail…" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Icon Color Classes</Label>
                  <Input value={f.iconColor} onChange={(e) => setF({ iconColor: e.target.value })} placeholder="bg-blue-50 text-blue-600 border-blue-200" />
                </div>
              </>)}

              {/* FAQ-specific */}
              {f.type === "faq" && (<>
                <div className="sm:col-span-2 space-y-1">
                  <Label className="text-xs">Question</Label>
                  <Input value={f.question} onChange={(e) => setF({ question: e.target.value })} placeholder="How does QR ordering work?" />
                </div>
                <div className="sm:col-span-2 space-y-1">
                  <Label className="text-xs">Answer</Label>
                  <textarea value={f.answer} onChange={(e) => setF({ answer: e.target.value })}
                    className="w-full text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 h-24 resize-none"
                    placeholder="Detailed answer…" />
                </div>
              </>)}

              {/* Review notes */}
              <div className="sm:col-span-2 space-y-1">
                <Label className="text-xs text-slate-400">Review Notes (internal, admin-only)</Label>
                <Input value={f.reviewNotes} onChange={(e) => setF({ reviewNotes: e.target.value })} placeholder="e.g. Approved — checked content quality" />
              </div>
            </div>

            <div className="flex gap-2 justify-end pt-1">
              <Button variant="outline" size="sm" onClick={() => setForm(null)}>
                <X className="w-3.5 h-3.5 mr-1" /> Cancel
              </Button>
              <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white"
                disabled={saving || !f.title.trim() || !f.type}
                onClick={handleSave}>
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Save className="w-3.5 h-3.5 mr-1" />}
                {f.id ? "Update" : "Create"}
              </Button>
            </div>
          </div>
        )}

        {/* Resource list */}
        {!loading && filtered.length === 0 && (
          <div className="text-center py-14 text-slate-400">
            <BookOpen className="w-10 h-10 mx-auto mb-3 opacity-20" />
            <p className="font-medium text-sm">
              {resFilter === "all" ? "No resources yet" : `No ${resFilter} resources`}
            </p>
            {resFilter === "all" && (
              <p className="text-xs mt-1">Click "Add Resource" to create your first one</p>
            )}
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <div className="space-y-2">
            {filtered.map((r) => (
              <div key={r.id}
                className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div className={cn(
                    "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-[10px] font-bold uppercase",
                    r.type === "video" ? "bg-red-100 text-red-600"
                      : r.type === "pdf" ? "bg-blue-100 text-blue-600"
                      : r.type === "link" ? "bg-green-100 text-green-600"
                      : r.type === "plan" ? "bg-purple-100 text-purple-600"
                      : "bg-amber-100 text-amber-600"
                  )}>
                    {r.type.slice(0, 3)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-sm text-slate-800 truncate">{r.title}</p>
                      {r.featured && (
                        <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-semibold">★ Featured</span>
                      )}
                      <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-semibold",
                        r.approvalStatus === "approved" ? "bg-emerald-100 text-emerald-700"
                          : r.approvalStatus === "rejected" ? "bg-red-100 text-red-700"
                          : "bg-amber-100 text-amber-700"
                      )}>{r.approvalStatus}</span>
                      <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-semibold",
                        r.status === "active" ? "bg-blue-100 text-blue-700"
                          : r.status === "archived" ? "bg-slate-100 text-slate-500"
                          : "bg-gray-100 text-gray-500"
                      )}>{r.status}</span>
                      <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-semibold border",
                        r.visibleTo === "public" ? "bg-teal-50 text-teal-700 border-teal-200"
                          : r.visibleTo === "restaurant" ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                          : r.visibleTo === "admin" ? "bg-slate-100 text-slate-600 border-slate-200"
                          : "bg-orange-50 text-orange-700 border-orange-200"
                      )}>{r.visibleTo}</span>
                    </div>
                    {r.description && (
                      <p className="text-xs text-slate-500 truncate mt-0.5">{r.description}</p>
                    )}
                    {r.rejectionReason && r.approvalStatus === "rejected" && (
                      <p className="text-[11px] text-red-500 mt-0.5">⚠ Rejected: {r.rejectionReason}</p>
                    )}
                    {r.reviewNotes && r.approvalStatus === "approved" && (
                      <p className="text-[11px] text-emerald-600 mt-0.5">✓ {r.reviewNotes}</p>
                    )}
                    {r.category && (
                      <p className="text-[11px] text-slate-400 mt-0.5">{r.category}</p>
                    )}
                  </div>
                </div>

                <div className="flex gap-1.5 items-center shrink-0 flex-wrap">
                  {r.approvalStatus === "pending" && (<>
                    <Button size="sm" variant="outline"
                      className="text-xs border-emerald-200 text-emerald-700 hover:bg-emerald-50 h-7 px-2"
                      disabled={actionId === r.id}
                      onClick={() => handleApprove(r.id)}>
                      {actionId === r.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3 mr-1" />}
                      Approve
                    </Button>
                    <Button size="sm" variant="outline"
                      className="text-xs border-red-200 text-red-600 hover:bg-red-50 h-7 px-2"
                      disabled={actionId === r.id}
                      onClick={() => handleReject(r.id)}>
                      <Ban className="w-3 h-3 mr-1" /> Reject
                    </Button>
                  </>)}
                  {r.approvalStatus === "rejected" && (
                    <Button size="sm" variant="outline"
                      className="text-xs border-emerald-200 text-emerald-700 hover:bg-emerald-50 h-7 px-2"
                      disabled={actionId === r.id}
                      onClick={() => handleApprove(r.id)}>
                      <CheckCircle className="w-3 h-3 mr-1" /> Re-approve
                    </Button>
                  )}
                  <Button size="sm" variant="ghost"
                    className={cn("text-xs h-7 px-2 font-bold", r.featured ? "text-amber-500" : "text-slate-300 hover:text-amber-400")}
                    disabled={actionId === r.id}
                    title="Toggle featured"
                    onClick={() => handleFeature(r.id)}>
                    ★
                  </Button>
                  <Button size="sm" variant="outline"
                    className="text-xs h-7 px-2 text-slate-500"
                    onClick={() => setForm(resourceToForm(r))}>
                    <Edit2 className="w-3 h-3" />
                  </Button>
                  <Button size="sm" variant="outline"
                    className="text-xs border-red-200 text-red-500 hover:bg-red-50 h-7 px-2"
                    disabled={actionId === r.id}
                    onClick={() => handleDelete(r.id)}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Back link */}
        <div className="pt-4">
          <button
            onClick={() => navigate("/admin/dashboard")}
            className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
          >
            ← Back to Admin Dashboard
          </button>
        </div>

      </div>
    </AdminShell>
  );
}
