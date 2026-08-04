import { cn } from "@/lib/utils";

// The Greenlight wordmark. Two treatments because no bright green is legible
// as text on white:
//   on="dark"  → signal green + soft glow, straight on the surface
//   on="light" → the same green inside a dark pill (keeps the brightness)
export function Wordmark({
  on = "dark",
  className,
  showDot = true,
}: {
  on?: "dark" | "light";
  className?: string;
  showDot?: boolean;
}) {
  const mark = (
    <span
      className={cn(
        "inline-flex items-center font-[family-name:var(--font-unbounded)] font-bold tracking-[-0.02em] text-greenlight",
        on === "dark" && "[text-shadow:0_0_18px_color-mix(in_srgb,var(--greenlight)_55%,transparent)]",
      )}
    >
      {showDot && (
        <span
          aria-hidden
          className="mr-2 size-[7px] shrink-0 rounded-full bg-greenlight shadow-[0_0_10px_var(--greenlight)]"
        />
      )}
      Greenlight
    </span>
  );

  if (on === "light") {
    return (
      <span
        className={cn(
          "inline-flex items-center rounded-lg bg-sidebar px-2.5 py-1",
          className,
        )}
      >
        {mark}
      </span>
    );
  }

  return <span className={className}>{mark}</span>;
}
