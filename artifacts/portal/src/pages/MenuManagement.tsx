import { useState, useEffect, useCallback, useRef } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { apiFetch, API_BASE, resolveImageUrl } from "@/lib/api";
import type { MenuCategory, MenuItem } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  ChevronDown,
  ChevronRight,
  Leaf,
  Drumstick,
  X,
  Check,
  ImagePlus,
  ImageOff,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ItemFormData {
  categoryId: number;
  name: string;
  description: string;
  price: string;
  isVeg: boolean;
  isAvailable: boolean;
  imageUrl: string | null;
}

interface CatFormData {
  name: string;
}

interface ItemFormProps {
  catId: number;
  itemForm: ItemFormData;
  setItemForm: React.Dispatch<React.SetStateAction<ItemFormData>>;
  itemLoading: boolean;
  onSave: () => void;
  onCancel: () => void;
}

const MAX_DIMENSION = 1200;
const COMPRESS_QUALITY = 0.82;
const MAX_INPUT_SIZE_BYTES = 30 * 1024 * 1024;
const MAX_OUTPUT_SIZE_BYTES = 5 * 1024 * 1024;

/**
 * Resize, EXIF-correct, and compress an image using the Canvas API.
 * Modern browsers automatically apply EXIF orientation when painting an
 * <img> element onto a canvas, so portrait shots from phones display upright.
 * Outputs WebP at COMPRESS_QUALITY when supported, falls back to JPEG.
 */
function compressImage(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    if (file.size === 0) {
      reject(new Error("The selected file is empty or corrupted."));
      return;
    }
    if (file.size > MAX_INPUT_SIZE_BYTES) {
      reject(new Error(`File is too large (${(file.size / 1024 / 1024).toFixed(0)} MB). Please select an image under 30 MB.`));
      return;
    }

    const srcUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(srcUrl);

      let w = img.naturalWidth;
      let h = img.naturalHeight;
      if (w === 0 || h === 0) {
        reject(new Error("Could not read image dimensions. The file may be corrupted."));
        return;
      }

      if (w > MAX_DIMENSION || h > MAX_DIMENSION) {
        const ratio = Math.min(MAX_DIMENSION / w, MAX_DIMENSION / h);
        w = Math.round(w * ratio);
        h = Math.round(h * ratio);
      }

      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Image processing is not available in this browser."));
        return;
      }

      ctx.drawImage(img, 0, 0, w, h);

      const tryBlob = (mime: string, q: number): Promise<Blob | null> =>
        new Promise((res) => canvas.toBlob((b) => res(b && b.size > 0 ? b : null), mime, q));

      tryBlob("image/webp", COMPRESS_QUALITY)
        .then((webp) => webp ?? tryBlob("image/jpeg", COMPRESS_QUALITY))
        .then((blob) => {
          if (!blob) { reject(new Error("Failed to process image.")); return; }
          resolve(blob);
        })
        .catch(() => reject(new Error("Failed to process image.")));
    };

    img.onerror = () => {
      URL.revokeObjectURL(srcUrl);
      reject(new Error("Could not load image. The format may not be supported by your browser."));
    };

    img.src = srcUrl;
  });
}

type UploadStatus = "idle" | "processing" | "uploading";

function ItemForm({ itemForm, setItemForm, itemLoading, onSave, onCancel }: ItemFormProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>("idle");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const localPreviewRef = useRef<string | null>(null);

  const revokeLocalPreview = () => {
    if (localPreviewRef.current) {
      URL.revokeObjectURL(localPreviewRef.current);
      localPreviewRef.current = null;
    }
    setLocalPreview(null);
  };

  useEffect(() => {
    return () => { if (localPreviewRef.current) URL.revokeObjectURL(localPreviewRef.current); };
  }, []);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setUploadError(null);
    revokeLocalPreview();

    setUploadStatus("processing");
    let blob: Blob;
    try {
      blob = await compressImage(file);
    } catch (err) {
      setUploadStatus("idle");
      setUploadError(err instanceof Error ? err.message : "Failed to process image.");
      return;
    }

    if (blob.size > MAX_OUTPUT_SIZE_BYTES) {
      setUploadStatus("idle");
      setUploadError("Image is still too large after compression. Please use a smaller photo.");
      return;
    }

    const previewUrl = URL.createObjectURL(blob);
    localPreviewRef.current = previewUrl;
    setLocalPreview(previewUrl);

    setUploadStatus("uploading");
    try {
      const ext = blob.type === "image/webp" ? ".webp" : ".jpg";
      const baseName = file.name.replace(/\.[^.]+$/, "");
      const formData = new FormData();
      formData.append("image", blob, `${baseName}${ext}`);

      const res = await fetch(`${API_BASE}/owner/upload-image`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? "Upload failed. Please try again.");
      }
      const data = (await res.json()) as { imageUrl: string };
      setItemForm((f) => ({ ...f, imageUrl: data.imageUrl }));
      revokeLocalPreview();
    } catch (err) {
      revokeLocalPreview();
      if (err instanceof TypeError && err.message.includes("fetch")) {
        setUploadError("Network error — check your connection and try again.");
      } else {
        setUploadError(err instanceof Error ? err.message : "Upload failed. Please try again.");
      }
    } finally {
      setUploadStatus("idle");
    }
  };

  return (
    <div className="mx-4 mb-3 p-4 bg-muted/50 rounded-xl border border-border space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 space-y-1">
          <Label className="text-xs">Item Name *</Label>
          <Input
            value={itemForm.name}
            onChange={(e) => setItemForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="e.g. Butter Chicken"
            className="h-9 text-sm"
            autoFocus
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Price (₹) *</Label>
          <Input
            type="number"
            value={itemForm.price}
            onChange={(e) => setItemForm((f) => ({ ...f, price: e.target.value }))}
            placeholder="299"
            className="h-9 text-sm"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Type</Label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setItemForm((f) => ({ ...f, isVeg: true }))}
              className={cn("flex-1 h-9 rounded-lg border text-xs font-medium flex items-center justify-center gap-1.5 transition-all",
                itemForm.isVeg ? "bg-green-500 text-white border-green-500" : "border-border text-muted-foreground")}
            >
              <Leaf className="w-3 h-3" /> Veg
            </button>
            <button
              type="button"
              onClick={() => setItemForm((f) => ({ ...f, isVeg: false }))}
              className={cn("flex-1 h-9 rounded-lg border text-xs font-medium flex items-center justify-center gap-1.5 transition-all",
                !itemForm.isVeg ? "bg-red-500 text-white border-red-500" : "border-border text-muted-foreground")}
            >
              <Drumstick className="w-3 h-3" /> Non-Veg
            </button>
          </div>
        </div>
        <div className="col-span-2 space-y-1">
          <Label className="text-xs">Description (optional)</Label>
          <Input
            value={itemForm.description}
            onChange={(e) => setItemForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="Tender chicken in rich tomato gravy..."
            className="h-9 text-sm"
          />
        </div>

        {/* ── Photo Upload ─────────────────────────────────────────────────── */}
        <div className="col-span-2 space-y-2">
          <Label className="text-xs">Dish Photo (optional)</Label>
          <div className="flex items-start gap-3">
            {/* Preview / placeholder — shows local blob while uploading, server URL once done */}
            <div
              className={cn(
                "w-20 h-20 rounded-lg border-2 border-dashed flex items-center justify-center shrink-0 overflow-hidden transition-all relative",
                (localPreview || itemForm.imageUrl) ? "border-transparent" : "border-border bg-muted/30"
              )}
            >
              {(localPreview || itemForm.imageUrl) ? (
                <img
                  src={localPreview ?? resolveImageUrl(itemForm.imageUrl)!}
                  alt="Dish preview"
                  className="w-full h-full object-cover rounded-lg"
                />
              ) : (
                <ImagePlus className="w-6 h-6 text-muted-foreground/50" />
              )}
              {uploadStatus !== "idle" && (
                <div className="absolute inset-0 bg-black/40 rounded-lg flex items-center justify-center">
                  <Loader2 className="w-5 h-5 text-white animate-spin" />
                </div>
              )}
            </div>

            <div className="flex-1 space-y-1.5">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture={undefined}
                className="hidden"
                onChange={handleFileChange}
                disabled={uploadStatus !== "idle"}
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="w-full h-8 text-xs"
                disabled={uploadStatus !== "idle"}
                onClick={() => { setUploadError(null); fileInputRef.current?.click(); }}
              >
                {uploadStatus === "processing" ? (
                  <><Loader2 className="w-3 h-3 animate-spin mr-1.5" />Optimising…</>
                ) : uploadStatus === "uploading" ? (
                  <><Loader2 className="w-3 h-3 animate-spin mr-1.5" />Uploading…</>
                ) : (
                  <><ImagePlus className="w-3 h-3 mr-1.5" />{(localPreview || itemForm.imageUrl) ? "Change Photo" : "Upload Photo"}</>
                )}
              </Button>
              {itemForm.imageUrl && uploadStatus === "idle" && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="w-full h-7 text-xs text-destructive hover:text-destructive"
                  onClick={() => { setItemForm((f) => ({ ...f, imageUrl: null })); revokeLocalPreview(); setUploadError(null); }}
                >
                  <ImageOff className="w-3 h-3 mr-1.5" />Remove Photo
                </Button>
              )}
              {uploadError ? (
                <p className="text-[11px] text-destructive leading-tight">{uploadError}</p>
              ) : (
                <div className="text-[11px] text-muted-foreground space-y-0.5">
                  <p>Any photo format · Auto-resized to 1200 px · Max 5 MB output</p>
                  <p>Square, 800×800 px or larger recommended</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        <Button
          size="sm"
          className="bg-orange-500 hover:bg-orange-600 text-white h-8"
          onClick={onSave}
          disabled={itemLoading || uploadStatus !== "idle"}
        >
          {itemLoading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Check className="w-3 h-3 mr-1" />}
          Save
        </Button>
        <Button size="sm" variant="ghost" className="h-8" onClick={onCancel}>
          <X className="w-3 h-3 mr-1" /> Cancel
        </Button>
      </div>
    </div>
  );
}

export default function MenuManagement() {
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const [catForm, setCatForm] = useState<CatFormData>({ name: "" });
  const [editingCatId, setEditingCatId] = useState<number | null>(null);
  const [showAddCat, setShowAddCat] = useState(false);
  const [catLoading, setCatLoading] = useState(false);

  const emptyItemForm = (catId = 0): ItemFormData => ({
    categoryId: catId,
    name: "",
    description: "",
    price: "",
    isVeg: true,
    isAvailable: true,
    imageUrl: null,
  });

  const [itemForm, setItemForm] = useState<ItemFormData>(emptyItemForm());
  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  const [addingItemForCatId, setAddingItemForCatId] = useState<number | null>(null);
  const [itemLoading, setItemLoading] = useState(false);

  const fetchAll = useCallback(async () => {
    try {
      const [cats, its] = await Promise.all([
        apiFetch<MenuCategory[]>("/owner/categories"),
        apiFetch<MenuItem[]>("/owner/menu-items"),
      ]);
      setCategories(cats);
      setItems(its);
      if (cats.length > 0) {
        setExpanded(new Set(cats.map((c) => c.id)));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleSaveCat = async () => {
    if (!catForm.name.trim()) return;
    setCatLoading(true);
    try {
      if (editingCatId) {
        await apiFetch(`/owner/categories/${editingCatId}`, {
          method: "PUT",
          body: JSON.stringify({ name: catForm.name }),
        });
      } else {
        await apiFetch("/owner/categories", {
          method: "POST",
          body: JSON.stringify({ name: catForm.name }),
        });
      }
      setCatForm({ name: "" });
      setEditingCatId(null);
      setShowAddCat(false);
      await fetchAll();
    } finally {
      setCatLoading(false);
    }
  };

  const handleDeleteCat = async (id: number) => {
    if (!confirm("Delete this category and all its items?")) return;
    setDeleteError(null);
    setDeletingId(id);
    try {
      await apiFetch(`/owner/categories/${id}`, { method: "DELETE" });
      await fetchAll();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete category.");
    } finally {
      setDeletingId(null);
    }
  };

  const startAddItem = (catId: number) => {
    setAddingItemForCatId(catId);
    setEditingItemId(null);
    setItemForm(emptyItemForm(catId));
  };

  const startEditItem = (item: MenuItem) => {
    setEditingItemId(item.id);
    setAddingItemForCatId(null);
    setItemForm({
      categoryId: item.categoryId,
      name: item.name,
      description: item.description ?? "",
      price: String(item.price),
      isVeg: item.isVeg,
      isAvailable: item.isAvailable,
      imageUrl: item.imageUrl ?? null,
    });
  };

  const handleSaveItem = async () => {
    if (!itemForm.name.trim() || !itemForm.price) return;
    setItemLoading(true);
    try {
      const payload = {
        categoryId: itemForm.categoryId,
        name: itemForm.name,
        description: itemForm.description || null,
        price: parseInt(itemForm.price),
        isVeg: itemForm.isVeg,
        isAvailable: itemForm.isAvailable,
        imageUrl: itemForm.imageUrl ?? null,
      };
      if (editingItemId) {
        await apiFetch(`/owner/menu-items/${editingItemId}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch("/owner/menu-items", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }
      setEditingItemId(null);
      setAddingItemForCatId(null);
      await fetchAll();
    } finally {
      setItemLoading(false);
    }
  };

  const handleCancelItem = () => {
    setEditingItemId(null);
    setAddingItemForCatId(null);
  };

  const handleDeleteItem = async (id: number) => {
    if (!confirm("Delete this menu item?")) return;
    setDeleteError(null);
    setDeletingId(id);
    try {
      await apiFetch(`/owner/menu-items/${id}`, { method: "DELETE" });
      await fetchAll();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete item.");
    } finally {
      setDeletingId(null);
    }
  };

  const toggleAvailability = async (item: MenuItem) => {
    await apiFetch(`/owner/menu-items/${item.id}`, {
      method: "PUT",
      body: JSON.stringify({ isAvailable: !item.isAvailable }),
    });
    await fetchAll();
  };

  const toggleExpanded = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="p-4 md:p-6 lg:p-8 max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Menu Management</h1>
            <p className="text-sm text-muted-foreground mt-0.5">{categories.length} categories · {items.length} items</p>
          </div>
          <Button
            size="sm"
            className="bg-orange-500 hover:bg-orange-600 text-white"
            onClick={() => { setShowAddCat(true); setCatForm({ name: "" }); setEditingCatId(null); }}
          >
            <Plus className="w-4 h-4 mr-1.5" /> Add Category
          </Button>
        </div>

        {deleteError && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2.5 text-sm">
            <X className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="flex-1">{deleteError}</span>
            <button onClick={() => setDeleteError(null)} className="text-red-400 hover:text-red-600 ml-2"><X className="w-3.5 h-3.5" /></button>
          </div>
        )}

        {showAddCat && !editingCatId && (
          <div className="bg-card border border-border rounded-xl p-4 flex gap-3 items-end">
            <div className="flex-1 space-y-1">
              <Label className="text-xs">Category Name</Label>
              <Input
                autoFocus
                value={catForm.name}
                onChange={(e) => setCatForm({ name: e.target.value })}
                placeholder="e.g. Starters, Main Course"
                className="h-9"
                onKeyDown={(e) => e.key === "Enter" && handleSaveCat()}
              />
            </div>
            <Button size="sm" className="bg-orange-500 hover:bg-orange-600 text-white h-9" onClick={handleSaveCat} disabled={catLoading}>
              {catLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : "Add"}
            </Button>
            <Button size="sm" variant="ghost" className="h-9" onClick={() => setShowAddCat(false)}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        )}

        {categories.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground border-2 border-dashed border-border rounded-xl">
            <p className="font-medium">No categories yet</p>
            <p className="text-sm mt-1">Add a category to start building your menu</p>
          </div>
        ) : (
          <div className="space-y-3">
            {categories.map((cat) => {
              const catItems = items.filter((i) => i.categoryId === cat.id);
              const isExpanded = expanded.has(cat.id);

              return (
                <div key={cat.id} className="bg-card rounded-xl border border-border overflow-hidden">
                  <div className="flex items-center gap-3 p-4">
                    <button
                      onClick={() => toggleExpanded(cat.id)}
                      className="flex items-center gap-2 flex-1 text-left"
                    >
                      {isExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                      {editingCatId === cat.id ? (
                        <Input
                          value={catForm.name}
                          onChange={(e) => setCatForm({ name: e.target.value })}
                          className="h-8 w-48"
                          autoFocus
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => e.key === "Enter" && handleSaveCat()}
                        />
                      ) : (
                        <span className="font-semibold">{cat.name}</span>
                      )}
                      <span className="text-xs text-muted-foreground">({catItems.length})</span>
                    </button>
                    <div className="flex items-center gap-1">
                      {editingCatId === cat.id ? (
                        <>
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={handleSaveCat} disabled={catLoading}>
                            <Check className="w-4 h-4 text-green-600" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => setEditingCatId(null)}>
                            <X className="w-4 h-4" />
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0"
                            onClick={() => { setEditingCatId(cat.id); setCatForm({ name: cat.name }); setShowAddCat(false); }}
                          >
                            <Pencil className="w-4 h-4 text-muted-foreground" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                            disabled={deletingId === cat.id}
                            onClick={() => handleDeleteCat(cat.id)}>
                            {deletingId === cat.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                          </Button>
                        </>
                      )}
                    </div>
                  </div>

                  {isExpanded && (
                    <>
                      {catItems.map((item) => (
                        <div key={item.id}>
                          {editingItemId === item.id ? (
                            <ItemForm
                              catId={item.categoryId}
                              itemForm={itemForm}
                              setItemForm={setItemForm}
                              itemLoading={itemLoading}
                              onSave={handleSaveItem}
                              onCancel={handleCancelItem}
                            />
                          ) : (
                            <div className="flex items-center gap-3 px-4 py-3 border-t border-border hover:bg-muted/20 transition-colors">
                              {/* Dish thumbnail or veg/non-veg dot */}
                              {item.imageUrl ? (
                                <img
                                  src={resolveImageUrl(item.imageUrl)!}
                                  alt={item.name}
                                  className="w-10 h-10 rounded-lg object-cover shrink-0 border border-border"
                                />
                              ) : (
                                <span className={cn("w-2.5 h-2.5 rounded-sm shrink-0 mt-0.5", item.isVeg ? "bg-green-500" : "bg-red-500")} />
                              )}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  {item.imageUrl && (
                                    <span className={cn("w-2 h-2 rounded-sm shrink-0", item.isVeg ? "bg-green-500" : "bg-red-500")} />
                                  )}
                                  <span className={cn("text-sm font-medium", !item.isAvailable && "line-through text-muted-foreground")}>
                                    {item.name}
                                  </span>
                                  {!item.isAvailable && (
                                    <span className="text-xs px-1.5 py-0.5 bg-muted rounded text-muted-foreground">Unavailable</span>
                                  )}
                                </div>
                                {item.description && <p className="text-xs text-muted-foreground truncate">{item.description}</p>}
                              </div>
                              <span className="font-semibold text-sm shrink-0">₹{item.price}</span>
                              <div className="flex gap-1">
                                <button
                                  onClick={() => toggleAvailability(item)}
                                  className={cn("text-xs px-2 py-1 rounded border font-medium transition-all",
                                    item.isAvailable
                                      ? "border-green-200 text-green-700 hover:bg-red-50 hover:border-red-200 hover:text-red-600"
                                      : "border-red-200 text-red-600 hover:bg-green-50 hover:border-green-200 hover:text-green-700"
                                  )}
                                >
                                  {item.isAvailable ? "Available" : "Unavailable"}
                                </button>
                                <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => startEditItem(item)}>
                                  <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                                </Button>
                                <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                                  disabled={deletingId === item.id}
                                  onClick={() => handleDeleteItem(item.id)}>
                                  {deletingId === item.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}

                      {addingItemForCatId === cat.id && (
                        <ItemForm
                          catId={cat.id}
                          itemForm={itemForm}
                          setItemForm={setItemForm}
                          itemLoading={itemLoading}
                          onSave={handleSaveItem}
                          onCancel={handleCancelItem}
                        />
                      )}

                      <div className="border-t border-border p-3">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-orange-600 hover:text-orange-700 hover:bg-orange-50 w-full"
                          onClick={() => startAddItem(cat.id)}
                        >
                          <Plus className="w-4 h-4 mr-1.5" /> Add Item
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
