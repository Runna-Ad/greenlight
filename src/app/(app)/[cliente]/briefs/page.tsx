import Link from "next/link";
import { Plus, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";

// P2 placeholder list — real brief rows land when Supabase is wired.
export default async function BriefsPage({
  params,
}: {
  params: Promise<{ cliente: string }>;
}) {
  const { cliente } = await params;
  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">
            {cliente} · Briefs
          </p>
          <h2 className="mt-1 text-2xl font-semibold text-foreground">Briefs</h2>
        </div>
        <Button asChild>
          <Link href={`/${cliente}/briefs/nuevo`}>
            <Plus className="size-4" /> Nuevo brief
          </Link>
        </Button>
      </div>

      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16 text-center">
        <FileText className="size-8 text-muted-foreground/40" />
        <p className="mt-3 text-sm text-muted-foreground">
          Aún no hay briefs. Crea el primero para capturar ideas.
        </p>
        <Button asChild variant="outline" className="mt-4">
          <Link href={`/${cliente}/briefs/nuevo`}>Capturar idea</Link>
        </Button>
      </div>
    </div>
  );
}
