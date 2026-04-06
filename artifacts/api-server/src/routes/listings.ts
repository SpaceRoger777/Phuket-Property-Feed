import { Router, type IRouter } from "express";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const FASTAPI_BASE = process.env.FASTAPI_URL ?? "http://localhost:8000";

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
    throw new Error(`FastAPI returned ${res.status} for ${path}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

function parseBool(val: unknown): boolean | undefined {
  if (val === "true" || val === true || val === "1") return true;
  if (val === "false" || val === false || val === "0") return false;
  return undefined;
}

// Normalize a raw /api/posts item into a shape the frontend Listing card can render.
// /api/posts items have all the key fields we need — including price_thb, district,
// bedrooms, property_type — but no structured AI fields (opportunity_score, decision_summary).
// We gracefully populate what's available and fall back for the rest.
function normalizePost(item: Record<string, unknown>) {
  // Build a 1–2 sentence decision_summary from post_text if no AI summary
  const postText = String(item.post_text ?? "").trim();
  const decisionSummary = postText
    ? postText.replace(/\s+/g, " ").slice(0, 220) + (postText.length > 220 ? "…" : "")
    : null;

  // urgency_signals: parse from JSON string if needed
  let urgencySignals: string[] = [];
  const rawUrgency = item.urgency_signals;
  if (Array.isArray(rawUrgency)) {
    urgencySignals = rawUrgency as string[];
  } else if (typeof rawUrgency === "string") {
    try { urgencySignals = JSON.parse(rawUrgency); } catch { urgencySignals = []; }
  }

  return {
    post_id: item.post_id,
    post_url: item.post_url ?? null,
    author_name: item.author_name ?? null,
    author_profile_url: item.author_profile_url ?? null,
    post_text: postText || null,
    created_at: item.created_at ?? null,
    comment_count: item.comment_count ?? null,
    like_count: item.like_count ?? null,
    is_hot: item.is_hot ?? null,
    is_direct_owner: item.is_direct_owner ?? null,
    classification_label: item.classification_label ?? null,
    listing_type: item.listing_type ?? null,
    price_thb: item.price_thb ?? null,
    price_thb_min: item.price_thb_min ?? null,
    price_thb_max: item.price_thb_max ?? null,
    property_type: item.property_type ?? null,
    bedrooms: item.bedrooms ?? null,
    bathrooms: item.bathrooms ?? null,
    size_sqm: item.size_sqm ?? null,
    location: item.location ?? null,
    district: item.district ?? null,
    phuket_zone: item.phuket_zone ?? null,
    furnished: item.furnished ?? null,
    has_pool: item.has_pool ?? null,
    has_sea_view: item.has_sea_view ?? null,
    screenshot_path: item.screenshot_path ?? null,
    // AI structured fields — will be null for non-extracted posts
    opportunity_score: item.opportunity_score ?? null,
    confidence: item.confidence ?? null,
    decision_summary: (item.decision_summary as string) ?? decisionSummary,
    urgency_signals: urgencySignals,
    key_features: Array.isArray(item.key_features) ? item.key_features : [],
  };
}

// GET /api/listings → /structured/listings (unwrap .listings array)
router.get("/listings", async (req, res): Promise<void> => {
  try {
    const q = req.query as Record<string, string>;
    const data = await fetchFastAPI("/structured/listings", {
      listing_type: q.listing_type,
      district: q.district,
      phuket_zone: q.phuket_zone,
      poster_type: q.poster_type,
      opportunity_score: q.opportunity_score,
      is_direct_owner: parseBool(q.is_direct_owner),
      has_pool: parseBool(q.has_pool),
      has_sea_view: parseBool(q.has_sea_view),
      min_price: q.min_price ? Number(q.min_price) : undefined,
      max_price: q.max_price ? Number(q.max_price) : undefined,
      min_bedrooms: q.min_bedrooms ? Number(q.min_bedrooms) : undefined,
      max_bedrooms: q.max_bedrooms ? Number(q.max_bedrooms) : undefined,
      limit: q.limit ? Number(q.limit) : 200,
      offset: q.offset ? Number(q.offset) : 0,
    }) as { listings?: unknown[]; total?: number };

    const listings = data?.listings ?? [];
    res.json(listings);
  } catch (err) {
    req.log.warn({ err }, "FastAPI error for /listings, returning empty array");
    res.json([]);
  }
});

// GET /api/leads/direct-owners
// Primary: /api/posts?filter=owner_confirmed — returns 136 classified direct-owner posts
// immediately, no Ollama dependency. As structured extraction completes, these posts
// will also have price_thb, district, bedrooms etc filled in directly by the extractor.
router.get("/leads/direct-owners", async (req, res): Promise<void> => {
  try {
    const q = req.query as Record<string, string>;
    const params: Record<string, string | number | boolean | undefined> = {
      filter: "owner_confirmed",
      limit: 200,
      offset: 0,
    };
    // Pass zone/type filters through if the backend supports them
    if (q.phuket_zone) params.phuket_zone = q.phuket_zone;
    if (q.listing_type) params.listing_type = q.listing_type;
    if (q.district) params.district = q.district;

    const data = await fetchFastAPI("/api/posts", params) as { items?: unknown[] } | unknown[];

    // /api/posts returns { items: [...] }
    const items: Record<string, unknown>[] = Array.isArray(data)
      ? (data as Record<string, unknown>[])
      : ((data as { items?: unknown[] })?.items ?? []) as Record<string, unknown>[];

    res.json(items.map(normalizePost));
  } catch (err) {
    req.log.warn({ err }, "FastAPI error for /leads/direct-owners");
    res.json([]);
  }
});

// GET /api/leads/buyers → /api/posts?listing_type=unknown
// Returns ~74 posts that are unclassified / potential buyer-renter demand signals
router.get("/leads/buyers", async (req, res): Promise<void> => {
  try {
    const data = await fetchFastAPI("/api/posts", {
      listing_type: "unknown",
      limit: 200,
      offset: 0,
    }) as { items?: unknown[] } | unknown[];

    const items: Record<string, unknown>[] = Array.isArray(data)
      ? (data as Record<string, unknown>[])
      : ((data as { items?: unknown[] })?.items ?? []) as Record<string, unknown>[];

    res.json(items.map(normalizePost));
  } catch (err) {
    req.log.warn({ err }, "FastAPI error for /leads/buyers");
    res.json([]);
  }
});

// GET /api/stats/overview → /api/stats/market (transform nested response)
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

    // Backend confirmed: overall.posts_this_week is now populated (same as new_this_week)
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

// GET /api/stats/by-district → /api/stats/districts (combine sale + rental)
router.get("/stats/by-district", async (req, res): Promise<void> => {
  try {
    const data = await fetchFastAPI("/api/stats/districts") as {
      sale?: Array<{ district?: string; count?: number; [key: string]: unknown }>;
      rental?: Array<{ district?: string; count?: number; [key: string]: unknown }>;
    };

    // Merge sale + rental counts by district
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

// GET /api/stats/by-property-type → /api/stats/distributions (extract property_types)
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

// GET /api/stats/price-per-sqm → /api/stats/districts (sale array with sqm stats)
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

// GET /api/stats/posts-over-time → /api/stats/trends (extract daily_volume)
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
