import { Card, CardContent } from "@/components/ui/card";
import { Clock } from "lucide-react";

export default function ComingSoon({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="mx-auto w-full max-w-3xl p-6">
      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <div
            className="flex h-12 w-12 items-center justify-center rounded-full text-primary"
            style={{ background: "var(--accent-tint)" }}
          >
            <Clock className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-semibold">{title}</h1>
          <p className="max-w-md text-sm text-muted-foreground">
            {description ?? "Cet écran arrive bientôt dans l'espace agent."}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
