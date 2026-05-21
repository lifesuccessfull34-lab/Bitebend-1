import { X, Bell } from "lucide-react";
import { type ResourceNotification, dismissNotification } from "@/services/resourceService";
import { useState } from "react";

interface Props {
  notification: ResourceNotification;
  onDismiss: () => void;
}

export function NotificationBanner({ notification, onDismiss }: Props) {
  const [hiding, setHiding] = useState(false);

  const handleDismiss = () => {
    setHiding(true);
    dismissNotification(notification.id);
    setTimeout(onDismiss, 300);
  };

  return (
    <div
      className="rounded-xl border border-orange-200 bg-gradient-to-r from-orange-50 to-amber-50 px-4 py-3 mb-4 flex items-start gap-3 transition-all duration-300"
      style={{ opacity: hiding ? 0 : 1, transform: hiding ? "translateY(-8px)" : "none" }}
    >
      <div className="w-7 h-7 rounded-full bg-orange-100 flex items-center justify-center shrink-0 mt-0.5">
        <Bell className="w-3.5 h-3.5 text-orange-600" />
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-orange-900 leading-tight">{notification.title}</p>
        <p className="text-xs text-orange-700 mt-0.5 leading-relaxed">{notification.message}</p>
        {notification.ctaLabel && notification.ctaUrl && (
          <a
            href={notification.ctaUrl}
            className="inline-block mt-1.5 text-xs font-semibold text-orange-600 hover:text-orange-800 hover:underline transition-colors"
          >
            {notification.ctaLabel} →
          </a>
        )}
      </div>

      <button
        onClick={handleDismiss}
        className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-orange-400 hover:text-orange-700 hover:bg-orange-100 transition-colors mt-0.5"
        aria-label="Dismiss notification"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
