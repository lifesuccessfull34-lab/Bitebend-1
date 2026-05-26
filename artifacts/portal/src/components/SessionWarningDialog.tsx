import { Clock } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SessionWarningDialogProps {
  open: boolean;
  secondsRemaining: number;
  onKeepAlive: () => void;
  onLogout: () => void;
}

export function SessionWarningDialog({
  open,
  secondsRemaining,
  onKeepAlive,
  onLogout,
}: SessionWarningDialogProps) {
  if (!open) return null;

  const minutes = Math.floor(secondsRemaining / 60);
  const secs = secondsRemaining % 60;
  const timeLabel =
    minutes > 0
      ? `${minutes}:${String(secs).padStart(2, "0")} minutes`
      : `${secondsRemaining} second${secondsRemaining !== 1 ? "s" : ""}`;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="session-warning-title"
    >
      <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full mx-4 overflow-hidden">
        <div className="bg-amber-500 px-6 py-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center shrink-0">
            <Clock className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 id="session-warning-title" className="text-white font-bold text-base">
              Session Expiring Soon
            </h2>
            <p className="text-amber-100 text-xs">You'll be logged out due to inactivity</p>
          </div>
        </div>

        <div className="px-6 py-5 space-y-4">
          <p className="text-slate-600 text-sm leading-relaxed">
            Your session will expire in{" "}
            <span className="font-bold text-amber-600">{timeLabel}</span>.{" "}
            Do you want to stay logged in?
          </p>

          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1 border-slate-200 text-slate-600"
              onClick={onLogout}
            >
              Logout
            </Button>
            <Button
              className="flex-1 bg-orange-500 hover:bg-orange-600 text-white"
              onClick={onKeepAlive}
            >
              Stay Logged In
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
