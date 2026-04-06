export function formatPrice(price: number | null | undefined): string {
  if (price == null) return "N/A";
  return `฿${price.toLocaleString("en-US")}`;
}

export function formatArea(sqm: number | null | undefined, rai: number | null | undefined): string {
  if (!sqm && !rai) return "N/A";
  
  const parts: string[] = [];
  if (sqm) parts.push(`${sqm.toLocaleString("en-US")} sqm`);
  
  if (rai && rai > 0) {
    const totalSqWa = rai * 400; // 1 Rai = 400 Sq.Wah
    const raiUnits = Math.floor(totalSqWa / 400);
    const nganUnits = Math.floor((totalSqWa % 400) / 100);
    const wahUnits = totalSqWa % 100;
    parts.push(`(${raiUnits}-${nganUnits}-${wahUnits} Rai)`);
  }
  
  return parts.join(" ");
}

export function getOpportunityColor(score: string | null | undefined) {
  if (!score) return "default";
  const s = score.toLowerCase();
  if (s === "high") return "destructive"; // Red/amber
  if (s === "medium") return "secondary"; // Warning/Amber
  return "outline"; // Gray/low
}
