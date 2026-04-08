// ---------------------------------------------------------------------------
// Price formatting
// ---------------------------------------------------------------------------

/**
 * Format a Thai Baht price.
 *   ≥ 1M  → ฿4.5M   (or ฿4.5M/mo for rentals)
 *   ≥ 1K  → ฿850K
 *   else  → ฿500
 */
export function formatPrice(
  price: number | null | undefined,
  listingType?: string | null,
): string {
  if (price == null) return "Price TBD";
  const suffix = listingType === "for_rent" ? "/mo" : "";
  if (price >= 1_000_000) {
    const m = price / 1_000_000;
    return `฿${m % 1 === 0 ? m : m.toFixed(1)}M${suffix}`;
  }
  if (price >= 1_000) {
    const k = price / 1_000;
    return `฿${Math.round(k)}K${suffix}`;
  }
  return `฿${price.toLocaleString("en-US")}${suffix}`;
}

/** Format price with range fallback. */
export function formatPriceRange(
  price: number | null | undefined,
  min: number | null | undefined,
  max: number | null | undefined,
  listingType?: string | null,
): string {
  if (price != null) return formatPrice(price, listingType);
  if (min != null && max != null)
    return `${formatPrice(min, listingType)} – ${formatPrice(max, listingType)}`;
  if (min != null) return `From ${formatPrice(min, listingType)}`;
  if (max != null) return `Up to ${formatPrice(max, listingType)}`;
  return "Price TBD";
}

// ---------------------------------------------------------------------------
// Area formatting
// ---------------------------------------------------------------------------

export function formatArea(
  sqm: number | null | undefined,
  rai: number | null | undefined,
): string {
  if (!sqm && !rai) return "N/A";
  const parts: string[] = [];
  if (sqm) parts.push(`${sqm.toLocaleString("en-US")} sqm`);
  if (rai && rai > 0) {
    const total = rai * 400;
    const r = Math.floor(total / 400);
    const n = Math.floor((total % 400) / 100);
    const w = total % 100;
    parts.push(`(${r}-${n}-${w} Rai)`);
  }
  return parts.join(" ");
}

// ---------------------------------------------------------------------------
// Date formatting
// ---------------------------------------------------------------------------

export function formatRelativeDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "–";
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return "–";
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ---------------------------------------------------------------------------
// Badge / color helpers
// ---------------------------------------------------------------------------

export function getOpportunityColor(score: string | null | undefined) {
  if (!score) return "outline" as const;
  const s = score.toLowerCase();
  if (s === "high") return "destructive" as const;
  if (s === "medium") return "secondary" as const;
  return "outline" as const;
}

export function getOpportunityClass(score: string | null | undefined): string {
  if (!score) return "text-muted-foreground border-border";
  switch (score.toLowerCase()) {
    case "high":   return "bg-red-500/15 text-red-400 border-red-500/30";
    case "medium": return "bg-amber-500/15 text-amber-400 border-amber-500/30";
    default:       return "bg-muted text-muted-foreground border-border";
  }
}

export function getClassificationClass(label: string | null | undefined): string {
  if (!label) return "bg-muted text-muted-foreground border-border";
  const l = label.toUpperCase();
  if (l.includes("OWNER")) return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
  if (l.includes("AGENT")) return "bg-amber-500/15 text-amber-400 border-amber-500/30";
  return "bg-muted text-muted-foreground border-border";
}

export function getListingTypeClass(type: string | null | undefined): string {
  if (!type) return "bg-muted/50 text-muted-foreground border-border";
  if (type === "for_sale") return "bg-blue-500/15 text-blue-400 border-blue-500/30";
  if (type === "for_rent") return "bg-violet-500/15 text-violet-400 border-violet-500/30";
  return "bg-muted/50 text-muted-foreground border-border";
}
