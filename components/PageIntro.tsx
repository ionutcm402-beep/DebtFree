import { LucideIcon } from "lucide-react";

export function PageIntro({ icon: Icon, title, description, tone = "text-snowball" }: { icon: LucideIcon; title: string; description: string; tone?: string }) {
  return (
    <section className="mx-auto max-w-3xl">
      <Icon aria-hidden="true" className={`mx-auto size-7 ${tone}`} />
      <h1 className="mt-4 planner-title">{title}</h1>
      <p className="mt-3 planner-copy">{description}</p>
    </section>
  );
}
