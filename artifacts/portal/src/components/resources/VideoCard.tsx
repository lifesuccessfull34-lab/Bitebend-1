import { useState } from "react";
import { Play, Clock, X, Heart } from "lucide-react";
import { cn } from "@/lib/utils";
import { resolveImageUrl } from "@/lib/api";
import type { VideoResource } from "@/data/resources";
import { trackVideoPlay, trackResourceOpen } from "@/services/resourceService";

interface Props {
  video: VideoResource;
  isFavorited?: boolean;
  onToggleFavorite?: () => void;
}

function getYouTubeThumbnail(url: string): string | null {
  const match = url.match(/embed\/([^?]+)/);
  if (match) return `https://img.youtube.com/vi/${match[1]}/hqdefault.jpg`;
  return null;
}

export function VideoCard({ video, isFavorited, onToggleFavorite }: Props) {
  const [embedOpen, setEmbedOpen] = useState(false);

  const thumbnail = video.thumbnailUrl ?? getYouTubeThumbnail(video.url);
  const isEmbed = video.source === "youtube" || video.source === "self-hosted";

  const handlePlay = () => {
    trackVideoPlay(video.id);
    trackResourceOpen(video.id);
    if (isEmbed) {
      setEmbedOpen(true);
    } else {
      window.open(video.url, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <>
      <div className="group bg-card border border-border rounded-xl overflow-hidden hover:shadow-md transition-all duration-200 flex flex-col">
        {/* Thumbnail */}
        <div
          className="relative bg-muted aspect-video cursor-pointer overflow-hidden"
          onClick={handlePlay}
        >
          {thumbnail ? (
            <img
              src={resolveImageUrl(thumbnail)!}
              alt={video.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-orange-50 to-amber-100">
              <Play className="w-10 h-10 text-orange-400" />
            </div>
          )}
          {/* Overlay */}
          <div className="absolute inset-0 bg-black/25 group-hover:bg-black/35 transition-colors flex items-center justify-center">
            <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
              <Play className="w-5 h-5 text-orange-500 ml-0.5" fill="currentColor" />
            </div>
          </div>
          {/* Duration */}
          {video.duration && (
            <div className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded flex items-center gap-1">
              <Clock className="w-2.5 h-2.5" />
              {video.duration}
            </div>
          )}
          {/* Favorite */}
          {onToggleFavorite && (
            <button
              onClick={(e) => { e.stopPropagation(); onToggleFavorite(); }}
              className={cn(
                "absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center transition-all shadow-md",
                isFavorited
                  ? "bg-red-500 text-white"
                  : "bg-black/40 text-white hover:bg-black/60",
              )}
              title={isFavorited ? "Remove from saved" : "Save resource"}
            >
              <Heart className={cn("w-3.5 h-3.5", isFavorited && "fill-white")} />
            </button>
          )}
        </div>

        {/* Info */}
        <div className="p-4 flex flex-col flex-1">
          <h3 className="font-semibold text-sm text-foreground line-clamp-1 mb-1">{video.title}</h3>
          <p className="text-xs text-muted-foreground line-clamp-2 flex-1">{video.description}</p>
          <div className="mt-3 flex gap-2">
            <button
              onClick={handlePlay}
              className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium py-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white transition-colors"
            >
              <Play className="w-3 h-3" fill="currentColor" />
              Watch
            </button>
          </div>
        </div>
      </div>

      {/* Embed modal */}
      {embedOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setEmbedOpen(false)}
        >
          <div
            className="relative w-full max-w-3xl aspect-video bg-black rounded-xl overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setEmbedOpen(false)}
              className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-black/60 flex items-center justify-center text-white hover:bg-black/80 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
            {video.source === "youtube" ? (
              <iframe
                src={`${video.url}?autoplay=1`}
                title={video.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="w-full h-full"
              />
            ) : (
              <video src={resolveImageUrl(video.url)} controls autoPlay className="w-full h-full" />
            )}
          </div>
        </div>
      )}
    </>
  );
}

export function VideoCardSkeleton() {
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden animate-pulse">
      <div className="aspect-video bg-muted" />
      <div className="p-4 space-y-2">
        <div className="h-4 bg-muted rounded w-3/4" />
        <div className="h-3 bg-muted rounded w-full" />
        <div className="h-3 bg-muted rounded w-2/3" />
        <div className="h-8 bg-muted rounded-lg mt-3" />
      </div>
    </div>
  );
}

export function VideoEmptyState({ query }: { query: string }) {
  return (
    <div className={cn("col-span-full flex flex-col items-center py-12 text-muted-foreground")}>
      <Play className="w-10 h-10 mb-3 opacity-20" />
      <p className="font-medium text-sm">No videos found</p>
      {query && <p className="text-xs mt-1">No results for "{query}"</p>}
    </div>
  );
}
