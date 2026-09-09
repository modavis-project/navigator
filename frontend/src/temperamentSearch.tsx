import type { TemperamentSearchInterpretation } from "./api";

export function temperamentSearchUrl(wording: string): string {
  return `/temperaments?q=${encodeURIComponent(wording)}&scope=identity`;
}

export function TemperamentSearchNotice({
  interpretation,
  compact = false,
}: {
  interpretation?: TemperamentSearchInterpretation | null;
  compact?: boolean;
}) {
  if (!interpretation?.queries.length) return null;
  return (
    <p
      className={
        compact ? "temperament-lookup-note" : "notice temperament-lookup-note"
      }
      role="status"
    >
      {interpretation.kind === "related"
        ? "Related catalogue names"
        : "Matching catalogue names"}
      : <strong>{interpretation.queries.join(" / ")}</strong>.
      {!compact &&
        interpretation.kind === "related" &&
        " Your complete wording is retained above, including qualifications or adaptations."}
    </p>
  );
}
