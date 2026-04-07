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

function parseBool(val: unknown): boolean | undefined {
  if (val === "true" || val === true || val === "1") return true;
  if (val === "false" || val === false || val === "0") return false;
  return undefined;
}

// ---------------------------------------------------------------------------
// normalizePost
// Maps a raw /api/posts item (which LEFT-JOINs fb_post_structured_data) into
// the Listing shape the frontend cards expect.
//
// Fields present from the DB LEFT JOIN (always available):
//   listing_type, price_thb, bedrooms, bathrooms, size_sqm, property_type,
//   location, district, furnished, has_pool
//
// Fields NOT in /api/posts SELECT (require Ollama extraction — will be null):
//   phuket_zone, has_sea_view, has_mountain_view, has_gym, has_security,
//   has_parking, has_garden, opportunity_score, decision_summary, urgency_signals
// ---------------------------------------------------------------------------
function normalizePost(item: Record<string, unknown>) {
  // Build a short decision_summary from post_text when no AI summary exists.
  const postText = String(item.post_text ?? "").trim();
  const decisionSummary = postText
    ? postText.replace(/\s+/g, " ").slice(0, 220) + (postText.length > 220 ? "…" : "")
    : null;

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

  return {
    post_id: item.post_id,
    post_url: item.post_url ?? null,
    author_name: item.author_name ?? null,
    author_profile_url: item.author_profile_url ?? null,
    post_text: postText || null,
    created_at: item.created_at ?? null,
    scraped_at: item.scraped_at ?? null,
    comment_count: item.comment_count ?? null,
    like_count: item.like_count ?? null,
    is_hot: item.is_hot ?? null,
    is_direct_owner: item.is_direct_owner ?? null,
    is_agent: item.is_agent ?? null,
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
    phuket_zone: item.phuket_zone ?? null,           // null unless Ollama-extracted
    furnished: item.furnished ?? null,
    has_pool: item.has_pool ?? null,
    has_sea_view: item.has_sea_view ?? null,         // null unless Ollama-extracted
    has_mountain_view: item.has_mountain_view ?? null,
    has_gym: item.has_gym ?? null,
    has_security: item.has_security ?? null,
    has_parking: item.has_parking ?? null,
    has_garden: item.has_garden ?? null,
    screenshot_path: item.screenshot_path ?? null,
    // AI structured fields — null for non-extracted posts
    opportunity_score: item.opportunity_score ?? null,
    confidence: item.confidence ?? null,
    decision_summary: (item.decision_summary as string | null) ?? decisionSummary,
    urgency_signals: urgencySignals,
    key_features: Array.isArray(item.key_features) ? item.key_features : [],
    // User-applied labels (comma-separated from DB GROUP_CONCAT)
    labels,
    is_discarded: item.is_discarded ?? false,
  };
}

// ---------------------------------------------------------------------------
// TASK-01 FIX: GET /api/listings
// ---------------------------------------------------------------------------
// Previously proxied to /structured/listings (Ollama-only → 0 results when
// extraction is incomplete). Now uses /api/posts?filter=all, which LEFT-JOINs
// fb_post_structured_data — all 390+ posts are visible immediately.
//
// Filtering strategy:
//   listing_type, scraped_date  → FastAPI query params (native)
//   property_type, district,    → client-side in Express (fields come from JOIN)
//   poster_type, min/max_price
//   phuket_zone                 → silently ignored here (not in /api/posts SELECT);
//                                  add via /structured/listings overlay in a later
//                                  task once Ollama extraction coverage is sufficient.
// ---------------------------------------------------------------------------
router.get("/listings", async (req, res): Promise<void> => {
  try {
    const q = req.query as Record<string, string>;

    const data = await fetchFastAPI("/api/posts", {
      filter: "all",
      listing_type: q.listing_type || undefined,
      scraped_date: q.scraped_date || undefined,
      limit: 200,
      offset: q.offset ? Number(q.offset) : 0,
    }) as { items?: unknown[] } | unknown[];

    const raw: Record<string, unknown>[] = Array.isArray(data)
      ? (data as Record<string, unknown>[])
      : ((data as { items?: unknown[] })?.items ?? []) as Record<string, unknown>[];

    let items = raw.map(normalizePost);

    // Client-side filters — only applied when param is present & non-empty.
    if (q.property_type) {
      const pt = q.property_type.toLowerCase();
      items = items.filter(item =>
        (item.property_type as string | null)?.toLowerCase() === pt,
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
// ---------------------------------------------------------------------------
router.get("/leads/direct-owners", async (req, res): Promise<void> => {
  try {
    const q = req.query as Record<string, string>;
    const params: Record<string, string | number | boolean | undefined> = {
      filter: "owner_confirmed",
      limit: 200,
      offset: 0,
    };
    if (q.phuket_zone) params.phuket_zone = q.phuket_zone;
    if (q.listing_type) params.listing_type = q.listing_type;
    if (q.district) params.district = q.district;
    if (q.scraped_date) params.scraped_date = q.scraped_date;

    const data = await fetchFastAPI("/api/posts", params) as { items?: unknown[] } | unknown[];

    const items: Record<string, unknown>[] = Array.isArray(data)
      ? (data as Record<string, unknown>[])
      : ((data as { items?: unknown[] })?.items ?? []) as Record<string, unknown>[];

    res.json(items.map(normalizePost));
  } catch (err) {
    req.log.warn({ err }, "FastAPI error for /leads/direct-owners");
    res.json([]);
  }
});

// ---------------------------------------------------------------------------
// GET /api/leads/buyers → /api/posts?listing_type=unknown
// ---------------------------------------------------------------------------
router.get("/leads/buyers", async (req, res): Promise<void> => {
  try {
    const q = req.query as Record<string, string>;
    const data = await fetchFastAPI("/api/posts", {
      listing_type: "unknown",
      limit: 200,
      offset: 0,
      scraped_date: q.scraped_date || undefined,
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
