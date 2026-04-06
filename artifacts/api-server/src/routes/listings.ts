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
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(10000),
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

    // /structured/listings returns {listings:[], total:N, limit, offset}
    const listings = data?.listings ?? [];
    res.json(listings);
  } catch (err) {
    req.log.warn({ err }, "FastAPI error for /listings, returning empty array");
    res.json([]);
  }
});

// GET /api/leads/direct-owners → /structured/listings?is_direct_owner=true
router.get("/leads/direct-owners", async (req, res): Promise<void> => {
  try {
    const q = req.query as Record<string, string>;
    const data = await fetchFastAPI("/structured/listings", {
      is_direct_owner: true,
      phuket_zone: q.phuket_zone,
      listing_type: q.listing_type,
      district: q.district,
      has_pool: parseBool(q.has_pool),
      min_price: q.min_price ? Number(q.min_price) : undefined,
      max_price: q.max_price ? Number(q.max_price) : undefined,
      limit: 200,
      offset: 0,
    }) as { listings?: unknown[] };

    res.json(data?.listings ?? []);
  } catch (err) {
    req.log.warn({ err }, "FastAPI error for /leads/direct-owners");
    res.json([]);
  }
});

// GET /api/leads/buyers → /api/posts?listing_type=unknown (buyer/renter demand posts)
router.get("/leads/buyers", async (req, res): Promise<void> => {
  try {
    const q = req.query as Record<string, string>;
    const data = await fetchFastAPI("/api/posts", {
      listing_type: "unknown",
      limit: 200,
      offset: 0,
    });
    // /api/posts may return an array or {posts:[], total}
    const posts = Array.isArray(data) ? data : (data as Record<string, unknown>)?.posts ?? [];
    res.json(posts);
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

    res.json({
      total_posts_this_week: overall.posts_this_week ?? overall.total_posts ?? 0,
      total_posts_all_time: overall.total_posts ?? 0,
      direct_owner_count: Math.round(((sale.direct_owner_pct ?? 0) / 100) * (sale.total ?? 0)) +
                          Math.round(((rental.direct_owner_pct ?? 0) / 100) * (rental.total ?? 0)),
      direct_owner_pct: ((sale.direct_owner_pct ?? 0) + (rental.direct_owner_pct ?? 0)) / 2,
      for_sale_count: sale.total ?? 0,
      for_rent_count: rental.total ?? 0,
      high_opportunity_count: (sale.high_opportunity_count ?? 0) + (rental.high_opportunity_count ?? 0),
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

    // Merge sale + rental by district
    const merged: Record<string, number> = {};
    for (const item of [...(data?.sale ?? []), ...(data?.rental ?? [])]) {
      const district = (item.district ?? "Unknown") as string;
      merged[district] = (merged[district] ?? 0) + ((item.count as number) ?? 1);
    }

    const result = Object.entries(merged)
      .map(([district, count]) => ({ district, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

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

// GET /api/stats/price-per-sqm → /api/stats/districts (extract sqm stats if available)
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
