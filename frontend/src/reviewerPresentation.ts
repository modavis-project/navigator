export function reportedManualCount(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 0 ? Math.floor(value) : null;
  }
  const text = String(value ?? "").trim();
  if (!text) return null;
  const direct = text.match(/^\s*(\d+)\s*(?:manuals?|keyboards?)?\s*$/i);
  if (direct) return Math.max(1, Number.parseInt(direct[1], 10));
  const labelled = text.match(/(?:manuals?|keyboards?)\s*[:=]?\s*(\d+)|(\d+)\s*(?:manuals?|keyboards?)/i);
  if (labelled) return Math.max(1, Number.parseInt(labelled[1] || labelled[2], 10));
  const roman = text.match(/^\s*(I|II|III|IV|V|VI)\s*(?:\/\s*P)?\s*$/i);
  if (roman) return ({ I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6 } as Record<string, number>)[roman[1].toUpperCase()];
  const items = text.split(/[,;|]/).map((item) => item.trim()).filter(Boolean);
  return items.length > 1 ? items.length : null;
}

export function componentMetricValue(
  count: number | undefined,
  options: { keyboard?: boolean; reportedManuals?: number | null } = {},
): string | number {
  if (typeof count === "number" && count > 0) return count;
  if (options.keyboard && (options.reportedManuals || 0) > 0) return "Not separately modelled";
  return "Not recorded";
}

export function cleanCapturedDisplayText(value: unknown): string {
  const text = String(value ?? "");
  return text.replace(/\s*=\s*$/, "").trim() || text;
}

export function safeExternalUrl(value: unknown): string | null {
  const text = String(value ?? "").trim();
  if (!text || /\s|;/.test(text)) return null;
  try {
    const parsed = new URL(text);
    return (parsed.protocol === "http:" || parsed.protocol === "https:") && parsed.host ? text : null;
  } catch {
    return null;
  }
}

export function codeLabel(value?: string | null): string {
  const text = String(value || "").trim();
  if (!text) return "Not recorded";
  if (!text.includes("_") && /[A-Z]/.test(text.slice(1))) return text;
  const normalized = text.replace(/_/g, " ");
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

export function virtualEntityScopeLabel(granularity?: string | null): string {
  const state = String(granularity || "").toLowerCase();
  if (/(stop|rank|component)/.test(state)) return "Component evidence entity";
  if (/(variant|edition|configuration)/.test(state)) return "Edition or variant evidence entity";
  return "Package or product evidence entity";
}
