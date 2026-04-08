import { Router, type IRouter } from "express";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const FASTAPI_BASE = process.env.FASTAPI_URL ?? "http://localhost:8000";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** GET request to FastAPI with optional query params. */
async function fetchFastAPI(
  path: string,
  params?: Record<string, string | number | boolean | undefined>,
): Promise<unknown> {
  const url = new URL(`${FASTAPI_BASE}${path}`);
  if (params) {
    for (const [key, val] of Object.entries(params)) {
      if (val !== undefined && val !== null && val !== "") {
        url.searchParams.set(key, String(val));
      }
    }
  }
  const res = await fetch(url.toString(), {
    headers: { "Content-Type": "application/json", "ngrok-skip-browser-warning": "true" },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`FastAPI GET ${path} returned ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

/** POST / DELETE / PATCH request to FastAPI, forwarding an optional JSON body. */
async function mutateFastAPI(
  method: "POST" | "DELETE" | "PATCH",
  path: string,
  body?: unknown,
): Promise<unknown> {
  const url = `${FASTAPI_BASE}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      "ngrok-skip-browser-warning": "true",
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`FastAPI ${method} ${path} returned ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Text-parsing utilities
// Extract structured data from raw FB post text when Ollama extraction
// hasn't run (or failed). These are best-effort fallbacks.
// ---------------------------------------------------------------------------

/** Decode common HTML entities that the FB scraper leaves in strings. */
function decodeHtml(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extract the first Thai Baht price from post text.
 * Handles: ฿45,000 | ฿4.5M | THB 45,000 | 45,000 THB | 45,000 baht
 * Returns null if no price found or value is implausible.
 */
function parsePriceThb(text: string): number | null {
  // ฿ symbol with optional M/K suffix
  const m1 = text.match(/฿\s*([\d,]+(?:\.\d+)?)\s*(M|K|m|k)?/);
  if (m1) {
    let val = parseFloat(m1[1].replace(/,/g, ""));
    const suffix = (m1[2] || "").toUpperCase();
    if (suffix === "M") val *= 1_000_000;
    else if (suffix === "K") val *= 1_000;
    if (val >= 5_000 && val <= 999_000_000) return Math.round(val);
  }
  // "THB 45,000" or "THB45000"
  const m2 = text.match(/\bTHB\s*([\d,]+(?:\.\d+)?)/i);
  if (m2) {
    const val = parseFloat(m2[1].replace(/,/g, ""));
    if (val >= 5_000 && val <= 999_000_000) return Math.round(val);
  }
  // "45,000 THB" or "45,000 baht"
  const m3 = text.match(/([\d,]+(?:\.\d+)?)\s*(?:THB|baht|บาท)\b/i);
  if (m3) {
    const val = parseFloat(m3[1].replace(/,/g, ""));
    if (val >= 5_000 && val <= 999_000_000) return Math.round(val);
  }
  return null;
}

/** Detect for_sale / for_rent from post text. */
function parseListingType(text: string): string | null {
  if (/for rent|to rent|property to rent|\/month|\/mo\b|per month|monthly|long.?term rental|short.?term rental/i.test(text)) {
    return "for_rent";
  }
  if (/for sale|sale price|selling price|asking price|freehold|leasehold/i.test(text)) {
    return "for_sale";
  }
  return null;
}

/** Detect villa / condo / house / land from post text. */
function parsePropertyType(text: string): string | null {
  if (/\bvilla\b/i.test(text)) return "villa";
  if (/\bcondo\b|\bcondominium\b|\bapartment\b|\bstudio\b/i.test(text)) return "condo";
  if (/\bhouse\b|\btownhouse\b|\btown house\b|\bบ้าน\b/i.test(text)) return "house";
  if (/\bland\b|\bplot\b|\brai\b|\bที่ดิน\b/i.test(text)) return "land";
  return null;
}

/** Parse bedroom count from post text: "4 Beds", "4 BR", "4-bedroom", "4 ห้องนอน" */
function parseBedrooms(text: string): number | null {
  const m = text.match(/(\d+)\s*(?:bed(?:room)?s?|BR\b|ห้องนอน)/i);
  if (m) {
    const val = parseInt(m[1], 10);
    if (val >= 0 && val <= 20) return val;
  }
  return null;
}

/** Parse bathroom count from post text. */
function parseBathrooms(text: string): number | null {
  const m = text.match(/(\d+)\s*(?:bath(?:room)?s?|ห้องน้ำ)/i);
  if (m) {
    const val = parseInt(m[1], 10);
    if (val >= 0 && val <= 20) return val;
  }
  return null;
}

/** Parse size in sqm: "120 sqm", "120 sq.m", "120 ตร.ม" */
function parseSizeSqm(text: string): number | null {
  const m = text.match(/([\d,]+(?:\.\d+)?)\s*(?:sq\.?m(?:eters?)?|ตร\.?ม)/i);
  if (m) {
    const val = parseFloat(m[1].replace(/,/g, ""));
    if (val >= 10 && val <= 100_000) return Math.round(val);
  }
  return null;
}

/**
 * Rough Phuket zone detection from district / location text.
 * Fallback only — Ollama extraction is more accurate.
 */
function detectZone(district: string | null, location: string | null): string | null {
  const text = `${district ?? ""} ${location ?? ""}`.toLowerCase();
  if (!text.trim()) return null;
  if (/rawai|nai harn|kata\b|karon|chalong|ao sane|cape panwa/i.test(text)) return "south";
  if (/patong|kamala|kalim/i.test(text)) return "central";
  if (/bang.?tao|bangtao|laguna|cherng.?talay|surin|layan|mai khao|thalang/i.test(text)) return "north";
  if (/phuket city|phuket town|ao por|pa klok|cape yamu|east/i.test(text)) return "east";
  return null;
}

// ---------------------------------------------------------------------------
// normalizePost
// Maps a raw /api/posts item into the Listing shape the frontend expects.
// Uses text-parsing fallbacks so that cards show useful data even when
// Ollama structured extraction hasn't run yet.
// ---------------------------------------------------------------------------
function normalizePost(item: Record<string, unknown>) {
  // Decode HTML entities in post text and author name
  const postText = decodeHtml(String(item.post_text ?? "").trim());
  const authorName = item.author_name
    ? decodeHtml(String(item.author_name))
    : null;

  // Real Ollama decision_summary (from sd.decision_summary in _POST_SELECT).
  // Empty string means not extracted — treat as null.
  const realSummary =
    typeof item.decision_summary === "string" && item.decision_summary.trim()
      ? item.decision_summary.trim()
      : null;

  // Ollama key_features (JSON array string from DB)
  let keyFeatures: string[] = [];
  const rawFeatures = item.key_features;
  if (Array.isArray(rawFeatures)) {
    keyFeatures = rawFeatures as string[];
  } else if (typeof rawFeatures === "string" && rawFeatures.startsWith("[")) {
    try { keyFeatures = JSON.parse(rawFeatures); } catch { keyFeatures = []; }
  }

  // urgency_signals: parse from JSON string if needed.
  let urgencySignals: string[] = [];
  const rawUrgency = item.urgency_signals;
  if (Array.isArray(rawUrgency)) {
    urgencySignals = rawUrgency as string[];
  } else if (typeof rawUrgency === "string" && rawUrgency.startsWith("[")) {
    try { urgencySignals = JSON.parse(rawUrgency); } catch { urgencySignals = []; }
  }

  // labels_csv: "favorite,contacted" → ["favorite", "contacted"]
  const labelsCsv = String(item.labels_csv ?? "").trim();
  const labels = labelsCsv ? labelsCsv.split(",").filter(Boolean) : [];

  // ---------------------------------------------------------------------------
  // Text-parsing fallbacks — only used when the Ollama field is null/empty.
  // Priority: DB structured data > text parsing > null
  // ---------------------------------------------------------------------------
  const price    = (item.price_thb    != null) ? item.price_thb    : parsePriceThb(postText);
  const listType = (item.listing_type != null && item.listing_type !== "")
    ? item.listing_type
    : parseListingType(postText);
  const propType = (item.property_type != null && item.property_type !== "")
    ? item.property_type
    : parsePropertyType(postText);
  const beds     = (item.bedrooms  != null) ? item.bedrooms  : parseBedrooms(postText);
  const baths    = (item.bathrooms != null) ? item.bathrooms : parseBathrooms(postText);
  const sqm      = (item.size_sqm  != null) ? item.size_sqm  : parseSizeSqm(postText);
  const zone     = (item.phuket_zone != null && item.phuket_zone !== "")
    ? item.phuket_zone
    : detectZone(item.district as string | null, item.location as string | null);

  return {
    post_id:             item.post_id,
    post_url:            item.post_url ?? null,
    author_name:         authorName,
    author_profile_url:  item.author_profile_url ?? null,
    post_text:           postText || null,
    created_at:          item.created_at ?? null,
    scraped_at:          item.scraped_at ?? null,
    comment_count:       item.comment_count ?? null,
    like_count:          item.like_count ?? null,
    is_hot:              item.is_hot ?? null,
    is_direct_owner:     item.is_direct_owner ?? null,
    is_agent:            item.is_agent ?? null,
    is_discarded:        item.is_discarded ?? false,
    classification_label: item.classification_label ?? null,
    listing_type:        listType,
    price_thb:           price,
    price_thb_min:       item.price_thb_min ?? null,
    price_thb_max:       item.price_thb_max ?? null,
    price_unit:          item.price_unit ?? null,
    property_type:       propType,
    bedrooms:            beds,
    bathrooms:           baths,
    size_sqm:            sqm,
    location:            item.location ? decodeHtml(String(item.location)) : null,
    district:            item.district ? decodeHtml(String(item.district)) : null,
    phuket_zone:         zone,
    furnished:           item.furnished ?? null,
    has_pool:            item.has_pool ?? null,
    has_sea_view:        item.has_sea_view ?? null,
    has_mountain_view:   item.has_mountain_view ?? null,
    has_gym:             item.has_gym ?? null,
    has_security:        item.has_security ?? null,
    has_parking:         item.has_parking ?? null,
    has_garden:          item.has_garden ?? null,
    screenshot_path:     item.screenshot_path ?? null,
    // Ollama-extracted intelligence fields
    opportunity_score:   item.opportunity_score ?? null,
    confidence:          item.confidence ?? null,
    decision_summary:    realSummary,          // null when Ollama not run
    urgency_signals:     urgencySignals,
    key_features:        keyFeatures,
    // User labels
    labels,
  };
}

// ---------------------------------------------------------------------------
// GET /api/listings
// Proxies to FastAPI /api/posts (all posts via LEFT JOIN).
// Applies text-parsing fallbacks in normalizePost(), then client-side filters.
// ---------------------------------------------------------------------------
router.get("/listings", async (req, res): Promise<void> => {
  try {
    const q = req.query as Record<string, string>;

    const data = await fetchFastAPI("/api/posts", {
      filter: "all",
      scraped_date: q.scraped_date || undefined,
      limit: 300,
      offset: q.offset ? Number(q.offset) : 0,
    }) as { items?: unknown[] } | unknown[];

    const raw: Record<string, unknown>[] = Array.isArray(data)
      ? (data as Record<string, unknown>[])
      : ((data as { items?: unknown[] })?.items ?? []) as Record<string, unknown>[];

    let items = raw.map(normalizePost);

    // Client-side filters — applied after text-parsing so parsed values are available
    if (q.listing_type) {
      items = items.filter(item => item.listing_type === q.listing_type);
    }
    if (q.property_type) {
      const pt = q.property_type.toLowerCase();
      items = items.filter(item =>
        (item.property_type as string | null)?.toLowerCase() === pt,
      );
    }
    if (q.phuket_zone) {
      const zone = q.phuket_zone.toLowerCase();
      items = items.filter(item =>
        (item.phuket_zone as string | null)?.toLowerCase() === zone,
      );
    }
    if (q.district) {
      const d = q.district.toLowerCase();
      items = items.filter(item =>
        (item.district as string | null)?.toLowerCase().includes(d) ||
        (item.location as string | null)?.toLowerCase().includes(d),
      );
    }
    if (q.poster_type === "owner") {
      items = items.filter(item => Boolean(item.is_direct_owner));
    } else if (q.poster_type === "agent") {
      items = items.filter(item => Boolean(item.is_agent));
    }
    if (q.min_price) {
      const min = Number(q.min_price);
      items = items.filter(item => item.price_thb != null && (item.price_thb as number) >= min);
    }
    if (q.max_price) {
      const max = Number(q.max_price);
      items = items.filter(item => item.price_thb != null && (item.price_thb as number) <= max);
    }

    res.json(items);
  } catch (err) {
    req.log.warn({ err }, "FastAPI error for /listings, returning empty array");
    res.json([]);
  }
});

// ---------------------------------------------------------------------------
// GET /api/leads/direct-owners → /api/posts?filter=owner_confirmed
// Filters zone/property_type client-side (after text parsing) since those
// fields are Ollama-extracted and often null in the DB.
// ---------------------------------------------------------------------------
router.get("/leads/direct-owners", async (req, res): Promise<void> => {
  try {
    const q = req.query as Record<string, string>;
    const params: Record<string, string | number | boolean | undefined> = {
      filter: "owner_confirmed",
      limit: 200,
      offset: 0,
    };
    if (q.scraped_date) params.scraped_date = q.scraped_date;

    const data = await fetchFastAPI("/api/posts", params) as { items?: unknown[] } | unknown[];

    const raw: Record<string, unknown>[] = Array.isArray(data)
      ? (data as Record<string, unknown>[])
      : ((data as { items?: unknown[] })?.items ?? []) as Record<string, unknown>[];

    let items = raw.map(normalizePost);

    // Client-side filters (after text-parsing fallbacks are applied)
    if (q.phuket_zone) {
      const zone = q.phuket_zone.toLowerCase();
      items = items.filter(item =>
        (item.phuket_zone as string | null)?.toLowerCase() === zone,
      );
    }
    if (q.property_type) {
      const pt = q.property_type.toLowerCase();
      items = items.filter(item =>
        (item.property_type as string | null)?.toLowerCase() === pt,
      );
    }

    res.json(items);
  } catch (err) {
    req.log.warn({ err }, "FastAPI error for /leads/direct-owners");
    res.json([]);
  }
});

// ---------------------------------------------------------------------------
// GET /api/leads/buyers → buyer request posts
// Uses listing_type=unknown heuristic since buyers don't post prices.
// ---------------------------------------------------------------------------
router.get("/leads/buyers", async (req, res): Promise<void> => {
  try {
    const q = req.query as Record<string, string>;
    const data = await fetchFastAPI("/api/posts", {
      filter: "all",
      listing_type: "unknown",
      limit: 200,
      offset: 0,
      scraped_date: q.scraped_date || undefined,
    }) as { items?: unknown[] } | unknown[];

    const raw: Record<string, unknown>[] = Array.isArray(data)
      ? (data as Record<string, unknown>[])
      : ((data as { items?: unknown[] })?.items ?? []) as Record<string, unknown>[];

    res.json(raw.map(normalizePost));
  } catch (err) {
    req.log.warn({ err }, "FastAPI error for /leads/buyers");
    res.json([]);
  }
});

// ---------------------------------------------------------------------------
// TASK-02: Action routes — label, discard, restore, scrape-dates
// ---------------------------------------------------------------------------

// POST /api/posts/:id/label
// Body: { "label": "favorite" | "contacted" | "hot_lead" | "to_list" | "archived" | "not_interested" }
router.post("/posts/:id/label", async (req, res): Promise<void> => {
  try {
    const { id } = req.params;
    const result = await mutateFastAPI("POST", `/api/posts/${id}/label`, req.body);
    res.json(result);
  } catch (err) {
    req.log.warn({ err }, `FastAPI error POST /posts/${req.params.id}/label`);
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// DELETE /api/posts/:id/label/:label
router.delete("/posts/:id/label/:label", async (req, res): Promise<void> => {
  try {
    const { id, label } = req.params;
    const result = await mutateFastAPI("DELETE", `/api/posts/${id}/label/${label}`);
    res.json(result);
  } catch (err) {
    req.log.warn({ err }, `FastAPI error DELETE /posts/${req.params.id}/label/${req.params.label}`);
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// POST /api/posts/:id/discard
router.post("/posts/:id/discard", async (req, res): Promise<void> => {
  try {
    const { id } = req.params;
    const result = await mutateFastAPI("POST", `/api/posts/${id}/discard`);
    res.json(result);
  } catch (err) {
    req.log.warn({ err }, `FastAPI error POST /posts/${req.params.id}/discard`);
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// POST /api/posts/:id/restore
router.post("/posts/:id/restore", async (req, res): Promise<void> => {
  try {
    const { id } = req.params;
    const result = await mutateFastAPI("POST", `/api/posts/${id}/restore`);
    res.json(result);
  } catch (err) {
    req.log.warn({ err }, `FastAPI error POST /posts/${req.params.id}/restore`);
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// GET /api/scrape-dates → /api/posts/scrape-dates
// Returns: string[] of "YYYY-MM-DD" strings, most recent first.
router.get("/scrape-dates", async (req, res): Promise<void> => {
  try {
    const data = await fetchFastAPI("/api/posts/scrape-dates") as { dates?: string[] };
    res.json(data?.dates ?? []);
  } catch (err) {
    req.log.warn({ err }, "FastAPI error for /scrape-dates");
    res.json([]);
  }
});

// ---------------------------------------------------------------------------
// Stats routes (unchanged)
// ---------------------------------------------------------------------------

router.get("/stats/overview", async (req, res): Promise<void> => {
  try {
    const data = await fetchFastAPI("/api/stats/market") as {
      sale?: Record<string, number | null>;
      rental?: Record<string, number | null>;
      overall?: Record<string, number | null>;
    };

    const overall = data?.overall ?? {};
    const sale = data?.sale ?? {};
    const rental = data?.rental ?? {};

    const postsThisWeek = (overall.posts_this_week ?? overall.new_this_week ?? overall.total_posts ?? 0) as number;

    res.json({
      total_posts_this_week: postsThisWeek,
      total_posts_all_time: overall.total_posts ?? 0,
      direct_owner_count:
        Math.round(((sale.direct_owner_pct ?? 0) / 100) * (sale.total ?? 0)) +
        Math.round(((rental.direct_owner_pct ?? 0) / 100) * (rental.total ?? 0)),
      direct_owner_pct: ((sale.direct_owner_pct ?? 0) + (rental.direct_owner_pct ?? 0)) / 2,
      for_sale_count: sale.total ?? 0,
      for_rent_count: rental.total ?? 0,
      high_opportunity_count:
        (sale.high_opportunity_count ?? 0) + (rental.high_opportunity_count ?? 0),
      avg_price_thb: sale.median_price ?? rental.median_price ?? null,
    });
  } catch (err) {
    req.log.warn({ err }, "FastAPI error for /stats/overview");
    res.json({
      total_posts_this_week: 0,
      total_posts_all_time: 0,
      direct_owner_count: 0,
      direct_owner_pct: 0,
      for_sale_count: 0,
      for_rent_count: 0,
      high_opportunity_count: 0,
      avg_price_thb: null,
    });
  }
});

router.get("/stats/by-district", async (req, res): Promise<void> => {
  try {
    const data = await fetchFastAPI("/api/stats/districts") as {
      sale?: Array<{ district?: string; count?: number; [key: string]: unknown }>;
      rental?: Array<{ district?: string; count?: number; [key: string]: unknown }>;
    };

    const merged: Record<string, number> = {};
    for (const item of [...(data?.sale ?? []), ...(data?.rental ?? [])]) {
      const district = (item.district ?? "Unknown") as string;
      merged[district] = (merged[district] ?? 0) + ((item.count as number) ?? 1);
    }

    const result = Object.entries(merged)
      .map(([district, count]) => ({ district, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12);

    res.json(result);
  } catch (err) {
    req.log.warn({ err }, "FastAPI error for /stats/by-district");
    res.json([]);
  }
});

router.get("/stats/by-property-type", async (req, res): Promise<void> => {
  try {
    const data = await fetchFastAPI("/api/stats/distributions") as {
      property_types?: Array<{ property_type?: string; type?: string; count?: number; [key: string]: unknown }>;
    };

    const types = (data?.property_types ?? []).map((item) => ({
      property_type: item.property_type ?? item.type ?? "unknown",
      count: item.count ?? 0,
    }));

    res.json(types);
  } catch (err) {
    req.log.warn({ err }, "FastAPI error for /stats/by-property-type");
    res.json([]);
  }
});

router.get("/stats/price-per-sqm", async (req, res): Promise<void> => {
  try {
    const data = await fetchFastAPI("/api/stats/districts") as {
      sale?: Array<{
        district?: string;
        avg_price_per_sqm?: number | null;
        median_price_per_sqm?: number | null;
        min_price_per_sqm?: number | null;
        max_price_per_sqm?: number | null;
        count?: number;
        [key: string]: unknown;
      }>;
    };

    const result = (data?.sale ?? [])
      .filter((item) => item.district)
      .map((item) => ({
        district: item.district ?? "Unknown",
        avg_price_per_sqm: item.avg_price_per_sqm ?? null,
        median_price_per_sqm: item.median_price_per_sqm ?? null,
        min_price_per_sqm: item.min_price_per_sqm ?? null,
        max_price_per_sqm: item.max_price_per_sqm ?? null,
        count: item.count ?? 0,
      }));

    res.json(result);
  } catch (err) {
    req.log.warn({ err }, "FastAPI error for /stats/price-per-sqm");
    res.json([]);
  }
});

router.get("/stats/posts-over-time", async (req, res): Promise<void> => {
  try {
    const data = await fetchFastAPI("/api/stats/trends", { days: 30 }) as {
      daily_volume?: Array<{ date?: string; total?: number; [key: string]: unknown }>;
    };

    const result = (data?.daily_volume ?? []).map((item) => ({
      date: item.date ?? "",
      count: item.total ?? 0,
    }));

    res.json(result);
  } catch (err) {
    req.log.warn({ err }, "FastAPI error for /stats/posts-over-time");
    res.json([]);
  }
});

export default router;
