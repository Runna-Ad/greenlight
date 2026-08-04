import { IntakeForm } from "@/components/intake/intake-form";

export default async function NuevoBriefPage({
  params,
}: {
  params: Promise<{ cliente: string }>;
}) {
  const { cliente } = await params;
  return <IntakeForm cliente={cliente} />;
}
