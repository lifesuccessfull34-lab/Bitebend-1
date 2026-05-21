import { FileText, Download, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PdfResource } from "@/data/resources";

interface Props {
  pdf: PdfResource;
}

export function PdfCard({ pdf }: Props) {
  return (
    <div className="group bg-card border border-border rounded-xl p-4 hover:shadow-md transition-all duration-200 flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-red-50 border border-red-100 flex items-center justify-center shrink-0">
          <FileText className="w-5 h-5 text-red-500" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sm text-foreground line-clamp-1">{pdf.title}</h3>
          {pdf.sizeLabel && (
            <p className="text-[10px] text-muted-foreground mt-0.5">{pdf.sizeLabel}</p>
          )}
        </div>
      </div>

      <p className="text-xs text-muted-foreground line-clamp-2 flex-1">{pdf.description}</p>

      <div className="flex gap-2 mt-auto">
        <a
          href={pdf.url}
          download
          className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium py-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white transition-colors"
        >
          <Download className="w-3 h-3" />
          Download
        </a>
        <a
          href={pdf.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center w-8 h-8 rounded-lg border border-border hover:bg-accent text-muted-foreground transition-colors"
          title="Open in browser"
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>
    </div>
  );
}

export function PdfCardSkeleton() {
  return (
    <div className="bg-card border border-border rounded-xl p-4 animate-pulse space-y-3">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-muted shrink-0" />
        <div className="flex-1 space-y-1.5">
          <div className="h-4 bg-muted rounded w-3/4" />
          <div className="h-3 bg-muted rounded w-1/4" />
        </div>
      </div>
      <div className="h-3 bg-muted rounded w-full" />
      <div className="h-3 bg-muted rounded w-2/3" />
      <div className="h-8 bg-muted rounded-lg" />
    </div>
  );
}

export function PdfEmptyState({ query }: { query: string }) {
  return (
    <div className={cn("col-span-full flex flex-col items-center py-12 text-muted-foreground")}>
      <FileText className="w-10 h-10 mb-3 opacity-20" />
      <p className="font-medium text-sm">No documents found</p>
      {query && <p className="text-xs mt-1">No results for "{query}"</p>}
    </div>
  );
}
