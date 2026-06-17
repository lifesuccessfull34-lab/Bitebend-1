import { useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";

export default function Logout() {
  const { logout } = useAuth();

  useEffect(() => {
    logout().catch(() => {}).finally(() => {
      window.location.replace(
        (import.meta.env.BASE_URL || "/portal/") + "restaurant/auth"
      );
    });
  }, [logout]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
    </div>
  );
}
