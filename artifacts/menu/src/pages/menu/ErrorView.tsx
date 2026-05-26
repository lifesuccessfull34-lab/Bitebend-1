import { AlertCircle } from "lucide-react";

interface Props {
  error: string | null;
}

export function ErrorView({ error }: Props) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="text-center">
        <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-3" />
        <h1 className="text-xl font-bold mb-2">Menu Unavailable</h1>
        <p className="text-muted-foreground text-sm">
          {error ?? "Restaurant not found"}
        </p>
      </div>
    </div>
  );
}
