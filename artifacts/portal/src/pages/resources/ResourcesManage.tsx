import { useState, useRef, useCallback } from "react";
import { AppShell } from "@/components/layout/AppShell";
import {
  ArrowLeft, Plus, GripVertical, Pencil, Trash2, Star,
  Video, FileText, Link2, HelpCircle, CreditCard, Upload,
  X, Check, Eye, EyeOff, ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getResources,
  createResource,
  updateResource,
  deleteResource,
  reorderResources,
  type Resource,
  type ResourceType,
  type ResourceStatus,
} from "@/services/resourceService";
import { Link } from "wouter";

// ── Types ─────────────────────────────────────────────────────────────────────

type FormMode = "add" | "edit";

interface FormState {
  type: ResourceType;
  title: string;
  description: string;
  category: string;
  url: string;
  fileUrl: string;
  tags: string;
  featured: boolean;
  status: ResourceStatus;
  duration: string;
  videoSource: "youtube" | "external" | "self-hosted";
  sizeLabel: string;
  planName: string;
  planPrice: string;
  planPeriod: string;
  planFeatures: string;
  planHighlight: boolean;
  planBadge: string;
  planCta: "trial" | "contact";
  iconName: string;
  iconColor: string;
  question: string;
  answer: string;
}

const EMPTY_FORM: FormState = {
  type: "video", title: "", description: "", category: "", url: "", fileUrl: "",
  tags: "", featured: false, status: "active",
  duration: "", videoSource: "youtube",
  sizeLabel: "", planName: "", planPrice: "", planPeriod: "", planFeatures: "",
  planHighlight: false, planBadge: "", planCta: "trial",
  iconName: "link", iconColor: "bg-blue-50 text-blue-600 border-blue-200",
  question: "", answer: "",
};

const TYPE_ICONS: Record<ResourceType, { Icon: React.ElementType; color: string; label: string }> = {
  video: { Icon: Video,      color: "text-red-500",    label: "Video" },
  pdf:   { Icon: FileText,   color: "text-blue-500",   label: "PDF / Document" },
  link:  { Icon: Link2,      color: "text-green-500",  label: "Link" },
  plan:  { Icon: CreditCard, color: "text-purple-500", label: "Plan" },
  faq:   { Icon: HelpCircle, color: "text-amber-500",  label: "FAQ" },
};

function resourceToForm(r: Resource): FormState {
  return {
    type: r.type,
    title: r.title,
    description: r.description,
    category: r.category,
    url: r.url,
    fileUrl: r.fileUrl ?? "",
    tags: r.tags.join(", "),
    featured: r.featured,
    status: r.status,
    duration: r.duration ?? "",
    videoSource: r.videoSource ?? "youtube",
    sizeLabel: r.sizeLabel ?? "",
    planName: r.planName ?? "",
    planPrice: r.planPrice ?? "",
    planPeriod: r.planPeriod ?? "",
    planFeatures: r.planFeatures?.join("\n") ?? "",
    planHighlight: r.planHighlight ?? false,
    planBadge: r.planBadge ?? "",
    planCta: r.planCta ?? "trial",
    iconName: r.iconName ?? "link",
    iconColor: r.iconColor ?? "bg-blue-50 text-blue-600 border-blue-200",
    question: r.question ?? "",
    answer: r.answer ?? "",
  };
}

export default function ResourcesManage() {
  const [resources, setResources] = useState<Resource[]>(() => getResources());
  const [showForm, setShowForm] = useState(false);
  const [formMode, setFormMode] = useState<FormMode>("add");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const [pdfDragActive, setPdfDragActive] = useState(false);
  const dragSrcRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(() => setResources(getResources()), []);

  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));

  // ── Row drag-and-drop reorder ─────────────────────────────────────────────

  const handleDragStart = (id: number) => {
    dragSrcRef.current = id;
  };

  const handleDragOver = (e: React.DragEvent, id: number) => {
    e.preventDefault();
    setDragOver(id);
  };

  const handleDrop = (targetId: number) => {
    const srcId = dragSrcRef.current;
    if (!srcId || srcId === targetId) { setDragOver(null); return; }
    const ids = resources.map((r) => r.id);
    const srcIdx = ids.indexOf(srcId);
    const tgtIdx = ids.indexOf(targetId);
    const reordered = [...ids];
    reordered.splice(srcIdx, 1);
    reordered.splice(tgtIdx, 0, srcId);
    reorderResources(reordered);
    refresh();
    setDragOver(null);
    dragSrcRef.current = null;
  };

  const handleDragEnd = () => {
    setDragOver(null);
    dragSrcRef.current = null;
  };

  // ── Form helpers ──────────────────────────────────────────────────────────

  const openAdd = () => {
    setForm(EMPTY_FORM);
    setFormMode("add");
    setEditingId(null);
    setShowForm(true);
  };

  const openEdit = (r: Resource) => {
    setForm(resourceToForm(r));
    setFormMode("edit");
    setEditingId(r.id);
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
  };

  const formToResource = (): Omit<Resource, "id" | "createdAt" | "updatedAt"> => ({
    type: form.type,
    title: form.title.trim(),
    description: form.description.trim(),
    category: form.category.trim(),
    url: form.url.trim(),
    fileUrl: form.fileUrl.trim() || undefined,
    tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
    featured: form.featured,
    status: form.status,
    displayOrder: resources.length,
    // Video
    ...(form.type === "video" ? { duration: form.duration, videoSource: form.videoSource } : {}),
    // PDF
    ...(form.type === "pdf" ? { sizeLabel: form.sizeLabel } : {}),
    // Plan
    ...(form.type === "plan" ? {
      planName: form.planName,
      planPrice: form.planPrice,
      planPeriod: form.planPeriod,
      planFeatures: form.planFeatures.split("\n").map((f) => f.trim()).filter(Boolean),
      planHighlight: form.planHighlight,
      planBadge: form.planBadge,
      planCta: form.planCta,
    } : {}),
    // Link
    ...(form.type === "link" ? { iconName: form.iconName, iconColor: form.iconColor } : {}),
    // FAQ
    ...(form.type === "faq" ? { question: form.question, answer: form.answer } : {}),
  });

  const handleSave = () => {
    if (!form.title.trim()) return;
    if (formMode === "add") {
      createResource(formToResource());
    } else if (editingId !== null) {
      updateResource(editingId, formToResource());
    }
    refresh();
    closeForm();
  };

  const handleDelete = (id: number) => {
    deleteResource(id);
    refresh();
    setDeleteConfirm(null);
  };

  const handleToggleFeatured = (r: Resource) => {
    updateResource(r.id, { featured: !r.featured });
    refresh();
  };

  const handleToggleStatus = (r: Resource) => {
    updateResource(r.id, { status: r.status === "active" ? "inactive" : "active" });
    refresh();
  };

  // ── PDF drop zone ─────────────────────────────────────────────────────────

  const handlePdfDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setPdfDragActive(false);
    const file = e.dataTransfer.files[0];
    if (file?.type === "application/pdf") {
      set({ title: file.name.replace(".pdf", ""), sizeLabel: `${(file.size / 1024 / 1024).toFixed(1)} MB`, url: `/docs/${file.name}` });
    }
  };

  const handlePdfSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      set({ title: file.name.replace(".pdf", ""), sizeLabel: `${(file.size / 1024 / 1024).toFixed(1)} MB`, url: `/docs/${file.name}` });
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <AppShell>
      <div className="p-4 sm:p-6 max-w-5xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Link href="/restaurant/resources" className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-accent transition-colors">
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div>
              <h1 className="text-lg font-bold text-foreground">Manage Resources</h1>
              <p className="text-xs text-muted-foreground">{resources.length} resources · drag to reorder</p>
            </div>
          </div>
          <button
            onClick={openAdd}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Resource
          </button>
        </div>

        <div className={cn("grid gap-6", showForm ? "lg:grid-cols-[1fr_380px]" : "grid-cols-1")}>

          {/* ── Resource list ──────────────────────────────────────────────── */}
          <div className="space-y-1.5">
            {resources.map((r) => {
              const cfg = TYPE_ICONS[r.type];
              const Icon = cfg.Icon;
              const isDragTarget = dragOver === r.id;

              return (
                <div
                  key={r.id}
                  draggable
                  onDragStart={() => handleDragStart(r.id)}
                  onDragOver={(e) => handleDragOver(e, r.id)}
                  onDrop={() => handleDrop(r.id)}
                  onDragEnd={handleDragEnd}
                  className={cn(
                    "flex items-center gap-2 p-3 rounded-xl border bg-card transition-all cursor-default",
                    isDragTarget ? "border-orange-400 bg-orange-50 shadow-md" : "border-border hover:border-orange-200",
                    r.status === "inactive" && "opacity-60",
                  )}
                >
                  {/* Drag handle */}
                  <div className="cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground px-0.5">
                    <GripVertical className="w-4 h-4" />
                  </div>

                  {/* Type icon */}
                  <div className="shrink-0">
                    <Icon className={cn("w-4 h-4", cfg.color)} />
                  </div>

                  {/* Title + meta */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{r.title}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-[10px] text-muted-foreground">{cfg.label}</span>
                      {r.category && <span className="text-[10px] text-muted-foreground">· {r.category}</span>}
                      {r.tags.slice(0, 2).map((tag) => (
                        <span key={tag} className="text-[9px] bg-muted px-1.5 py-0.5 rounded-full text-muted-foreground">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    {/* Featured star */}
                    <button
                      onClick={() => handleToggleFeatured(r)}
                      title={r.featured ? "Remove from featured" : "Mark as featured"}
                      className={cn("w-7 h-7 rounded-lg flex items-center justify-center transition-colors", r.featured ? "text-amber-500 bg-amber-50" : "text-muted-foreground hover:bg-accent")}
                    >
                      <Star className={cn("w-3.5 h-3.5", r.featured && "fill-amber-500")} />
                    </button>

                    {/* Status toggle */}
                    <button
                      onClick={() => handleToggleStatus(r)}
                      title={r.status === "active" ? "Deactivate" : "Activate"}
                      className={cn("w-7 h-7 rounded-lg flex items-center justify-center transition-colors", r.status === "active" ? "text-green-600 bg-green-50" : "text-muted-foreground hover:bg-accent")}
                    >
                      {r.status === "active" ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                    </button>

                    {/* Edit */}
                    <button
                      onClick={() => openEdit(r)}
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-accent transition-colors"
                      title="Edit"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>

                    {/* Delete */}
                    {deleteConfirm === r.id ? (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleDelete(r.id)}
                          className="w-7 h-7 rounded-lg flex items-center justify-center bg-red-500 text-white hover:bg-red-600 transition-colors"
                          title="Confirm delete"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(null)}
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-accent transition-colors"
                          title="Cancel"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setDeleteConfirm(r.id)}
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-red-50 hover:text-red-500 transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

            {resources.length === 0 && (
              <div className="flex flex-col items-center py-16 text-muted-foreground">
                <FileText className="w-10 h-10 mb-3 opacity-20" />
                <p className="text-sm font-medium">No resources yet</p>
                <p className="text-xs mt-1">Click "Add Resource" to create your first one</p>
              </div>
            )}
          </div>

          {/* ── Add / Edit form ────────────────────────────────────────────── */}
          {showForm && (
            <div className="bg-card border border-border rounded-2xl p-4 self-start sticky top-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-bold text-foreground">
                  {formMode === "add" ? "Add Resource" : "Edit Resource"}
                </h2>
                <button onClick={closeForm} className="w-7 h-7 rounded-full flex items-center justify-center text-muted-foreground hover:bg-accent transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">

                {/* Type selector */}
                {formMode === "add" && (
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Resource Type</label>
                    <div className="grid grid-cols-5 gap-1">
                      {(Object.entries(TYPE_ICONS) as [ResourceType, typeof TYPE_ICONS[ResourceType]][]).map(([type, cfg]) => {
                        const Icon = cfg.Icon;
                        return (
                          <button
                            key={type}
                            onClick={() => set({ type })}
                            className={cn(
                              "flex flex-col items-center gap-1 p-2 rounded-lg border text-xs font-medium transition-all",
                              form.type === type ? "border-orange-400 bg-orange-50 text-orange-700" : "border-border text-muted-foreground hover:border-orange-200",
                            )}
                          >
                            <Icon className={cn("w-4 h-4", form.type === type ? "text-orange-500" : cfg.color)} />
                            <span className="text-[9px] leading-tight text-center">{cfg.label.split(" ")[0]}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Common fields */}
                <Field label="Title *">
                  <input value={form.title} onChange={(e) => set({ title: e.target.value })} placeholder="Resource title" className={inputCls} />
                </Field>

                <Field label="Description">
                  <textarea value={form.description} onChange={(e) => set({ description: e.target.value })} rows={2} placeholder="Short description" className={cn(inputCls, "resize-none")} />
                </Field>

                <div className="grid grid-cols-2 gap-2">
                  <Field label="Category">
                    <input value={form.category} onChange={(e) => set({ category: e.target.value })} placeholder="e.g. Setup" className={inputCls} />
                  </Field>
                  <Field label="Tags (comma-separated)">
                    <input value={form.tags} onChange={(e) => set({ tags: e.target.value })} placeholder="qr, setup" className={inputCls} />
                  </Field>
                </div>

                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={form.featured} onChange={(e) => set({ featured: e.target.checked })} className="rounded border-border" />
                    <span className="text-xs text-foreground flex items-center gap-1"><Star className="w-3 h-3 text-amber-500" /> Featured</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.status === "active"}
                      onChange={(e) => set({ status: e.target.checked ? "active" : "inactive" })}
                      className="rounded border-border"
                    />
                    <span className="text-xs text-foreground">Active</span>
                  </label>
                </div>

                <hr className="border-border" />

                {/* ── Video-specific ── */}
                {form.type === "video" && (
                  <>
                    <Field label="YouTube / Video URL *">
                      <input value={form.url} onChange={(e) => set({ url: e.target.value })} placeholder="https://youtube.com/embed/..." className={inputCls} />
                    </Field>
                    <div className="grid grid-cols-2 gap-2">
                      <Field label="Duration">
                        <input value={form.duration} onChange={(e) => set({ duration: e.target.value })} placeholder="e.g. 3:24" className={inputCls} />
                      </Field>
                      <Field label="Source">
                        <SelectField value={form.videoSource} onChange={(v) => set({ videoSource: v as FormState["videoSource"] })} options={[{ value: "youtube", label: "YouTube" }, { value: "external", label: "External" }, { value: "self-hosted", label: "Self-hosted" }]} />
                      </Field>
                    </div>
                  </>
                )}

                {/* ── PDF-specific ── */}
                {form.type === "pdf" && (
                  <>
                    <Field label="PDF URL or path">
                      <input value={form.url} onChange={(e) => set({ url: e.target.value })} placeholder="/docs/guide.pdf or https://..." className={inputCls} />
                    </Field>
                    <Field label="File size">
                      <input value={form.sizeLabel} onChange={(e) => set({ sizeLabel: e.target.value })} placeholder="e.g. 2.4 MB" className={inputCls} />
                    </Field>

                    {/* Drop zone */}
                    <div
                      onDragOver={(e) => { e.preventDefault(); setPdfDragActive(true); }}
                      onDragLeave={() => setPdfDragActive(false)}
                      onDrop={handlePdfDrop}
                      onClick={() => fileInputRef.current?.click()}
                      className={cn(
                        "border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all",
                        pdfDragActive ? "border-orange-400 bg-orange-50" : "border-border hover:border-orange-300",
                      )}
                    >
                      <Upload className="w-6 h-6 mx-auto mb-2 text-muted-foreground" />
                      <p className="text-xs text-muted-foreground">
                        {pdfDragActive ? "Drop PDF here" : "Drag & drop a PDF, or click to browse"}
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-1 opacity-60">
                        File info auto-fills title & size. Upload path will be set when backend is connected.
                      </p>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".pdf"
                        className="hidden"
                        onChange={handlePdfSelect}
                      />
                    </div>
                  </>
                )}

                {/* ── Link-specific ── */}
                {form.type === "link" && (
                  <>
                    <Field label="URL *">
                      <input value={form.url} onChange={(e) => set({ url: e.target.value })} placeholder="https://..." className={inputCls} />
                    </Field>
                    <div className="grid grid-cols-2 gap-2">
                      <Field label="Icon name">
                        <input value={form.iconName} onChange={(e) => set({ iconName: e.target.value })} placeholder="e.g. globe" className={inputCls} />
                      </Field>
                      <Field label="Color classes">
                        <input value={form.iconColor} onChange={(e) => set({ iconColor: e.target.value })} placeholder="bg-blue-50 text-blue-600..." className={inputCls} />
                      </Field>
                    </div>
                  </>
                )}

                {/* ── Plan-specific ── */}
                {form.type === "plan" && (
                  <>
                    <Field label="Plan URL">
                      <input value={form.url} onChange={(e) => set({ url: e.target.value })} placeholder="/restaurant/subscription" className={inputCls} />
                    </Field>
                    <div className="grid grid-cols-2 gap-2">
                      <Field label="Plan name">
                        <input value={form.planName} onChange={(e) => set({ planName: e.target.value })} placeholder="Starter" className={inputCls} />
                      </Field>
                      <Field label="Price">
                        <input value={form.planPrice} onChange={(e) => set({ planPrice: e.target.value })} placeholder="₹199" className={inputCls} />
                      </Field>
                    </div>
                    <Field label="Period">
                      <input value={form.planPeriod} onChange={(e) => set({ planPeriod: e.target.value })} placeholder="per 500 customers" className={inputCls} />
                    </Field>
                    <Field label="Features (one per line)">
                      <textarea value={form.planFeatures} onChange={(e) => set({ planFeatures: e.target.value })} rows={3} placeholder={"QR ordering\nUPI payments"} className={cn(inputCls, "resize-none")} />
                    </Field>
                    <div className="grid grid-cols-2 gap-2">
                      <Field label="Badge">
                        <input value={form.planBadge} onChange={(e) => set({ planBadge: e.target.value })} placeholder="Most Popular" className={inputCls} />
                      </Field>
                      <Field label="CTA">
                        <SelectField value={form.planCta} onChange={(v) => set({ planCta: v as "trial" | "contact" })} options={[{ value: "trial", label: "Start trial" }, { value: "contact", label: "Contact us" }]} />
                      </Field>
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={form.planHighlight} onChange={(e) => set({ planHighlight: e.target.checked })} className="rounded border-border" />
                      <span className="text-xs text-foreground">Highlight this plan</span>
                    </label>
                  </>
                )}

                {/* ── FAQ-specific ── */}
                {form.type === "faq" && (
                  <>
                    <Field label="Question *">
                      <textarea value={form.question} onChange={(e) => set({ question: e.target.value })} rows={2} placeholder="How does QR ordering work?" className={cn(inputCls, "resize-none")} />
                    </Field>
                    <Field label="Answer *">
                      <textarea value={form.answer} onChange={(e) => set({ answer: e.target.value })} rows={4} placeholder="Full answer text..." className={cn(inputCls, "resize-none")} />
                    </Field>
                  </>
                )}
              </div>

              {/* Save / Cancel */}
              <div className="flex gap-2 mt-4 pt-3 border-t border-border">
                <button
                  onClick={handleSave}
                  disabled={!form.title.trim()}
                  className="flex-1 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-medium transition-colors"
                >
                  {formMode === "add" ? "Add Resource" : "Save Changes"}
                </button>
                <button onClick={closeForm} className="px-4 py-2 rounded-lg border border-border text-sm font-medium text-muted-foreground hover:bg-accent transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

// ── Small helper components ───────────────────────────────────────────────────

const inputCls = "w-full text-xs px-3 py-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-orange-300 transition-all";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] font-medium text-muted-foreground mb-1 uppercase tracking-wide">{label}</label>
      {children}
    </div>
  );
}

function SelectField({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(inputCls, "appearance-none pr-7")}
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
    </div>
  );
}
