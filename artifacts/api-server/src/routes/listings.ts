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
    throw new Error(`FastAPI returned ${res.status} for ${path}`);
  }
  return res.json();
}

function parseBool(val: unknown): boolean | undefined {
  if (val === "true" || val === true || val === "1") return true;
  if (val === "false" || val === false || val === "0") return false;
  return undefined;
}

router.get("/listings", async (req, res): Promise<void> => {
  try {
    const q = req.query as Record<string, string>;
    const data = await fetchFastAPI("/api/listings", {
      listing_type: q.listing_type,
      property_type: q.property_type,
      district: q.district,
      phuket_zone: q.phuket_zone,
      poster_type: q.poster_type,
      opportunity_score: q.opportunity_score,
      is_direct_owner: parseBool(q.is_direct_owner),
      has_pool: parseBool(q.has_pool),
      min_price: q.min_price ? Number(q.min_price) : undefined,
      max_price: q.max_price ? Number(q.max_price) : undefined,
      min_bedrooms: q.min_bedrooms ? Number(q.min_bedrooms) : undefined,
      max_bedrooms: q.max_bedrooms ? Number(q.max_bedrooms) : undefined,
      limit: q.limit ? Number(q.limit) : 200,
      offset: q.offset ? Number(q.offset) : 0,
    });
    res.json(data);
  } catch (err) {
    req.log.warn({ err }, "FastAPI unavailable for /listings, returning empty array");
    res.json([]);
  }
});

router.get("/leads/direct-owners", async (req, res): Promise<void> => {
  try {
    const q = req.query as Record<string, string>;
    let data: unknown;
    try {
      data = await fetchFastAPI("/api/leads/direct-owners", {
        phuket_zone: q.phuket_zone,
        property_type: q.property_type,
        min_price: q.min_price ? Number(q.min_price) : undefined,
        max_price: q.max_price ? Number(q.max_price) : undefined,
        has_pool: parseBool(q.has_pool),
        date_from: q.date_from,
        date_to: q.date_to,
      });
    } catch {
      data = await fetchFastAPI("/api/posts", {
        classification_label: "owner_confirmed",
        is_direct_owner: true,
        phuket_zone: q.phuket_zone,
        property_type: q.property_type,
        limit: 200,
      });
    }
    res.json(data);
  } catch (err) {
    req.log.warn({ err }, "FastAPI unavailable for /leads/direct-owners, returning empty array");
    res.json([]);
  }
});

router.get("/leads/buyers", async (req, res): Promise<void> => {
  try {
    const q = req.query as Record<string, string>;
    let data: unknown;
    try {
      data = await fetchFastAPI("/api/leads/buyers", {
        phuket_zone: q.phuket_zone,
        property_type: q.property_type,
        date_from: q.date_from,
        date_to: q.date_to,
      });
    } catch {
      data = await fetchFastAPI("/api/posts", {
        listing_type: "unknown",
        limit: 200,
      });
    }
    res.json(data);
  } catch (err) {
    req.log.warn({ err }, "FastAPI unavailable for /leads/buyers, returning empty array");
    res.json([]);
  }
});

router.get("/stats/overview", async (req, res): Promise<void> => {
  try {
    let data: unknown;
    try {
      data = await fetchFastAPI("/api/stats/overview");
    } catch {
      data = await fetchFastAPI("/api/stats");
    }
    res.json(data);
  } catch (err) {
    req.log.warn({ err }, "FastAPI unavailable for /stats/overview, returning zeros");
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
    let data: unknown;
    try {
      data = await fetchFastAPI("/api/stats/by-district");
    } catch {
      const raw = (await fetchFastAPI("/api/stats")) as Record<string, unknown>;
      const byDistrict = raw?.by_district ?? raw?.districts ?? [];
      data = byDistrict;
    }
    res.json(data);
  } catch (err) {
    req.log.warn({ err }, "FastAPI unavailable for /stats/by-district");
    res.json([]);
  }
});

router.get("/stats/by-property-type", async (req, res): Promise<void> => {
  try {
    let data: unknown;
    try {
      data = await fetchFastAPI("/api/stats/by-property-type");
    } catch {
      const raw = (await fetchFastAPI("/api/stats")) as Record<string, unknown>;
      const byType = raw?.by_property_type ?? raw?.property_types ?? [];
      data = byType;
    }
    res.json(data);
  } catch (err) {
    req.log.warn({ err }, "FastAPI unavailable for /stats/by-property-type");
    res.json([]);
  }
});

router.get("/stats/price-per-sqm", async (req, res): Promise<void> => {
  try {
    let data: unknown;
    try {
      data = await fetchFastAPI("/api/stats/price-per-sqm");
    } catch {
      const raw = (await fetchFastAPI("/api/stats")) as Record<string, unknown>;
      data = raw?.price_per_sqm ?? [];
    }
    res.json(data);
  } catch (err) {
    req.log.warn({ err }, "FastAPI unavailable for /stats/price-per-sqm");
    res.json([]);
  }
});

router.get("/stats/posts-over-time", async (req, res): Promise<void> => {
  try {
    let data: unknown;
    try {
      data = await fetchFastAPI("/api/stats/posts-over-time");
    } catch {
      const raw = (await fetchFastAPI("/api/stats")) as Record<string, unknown>;
      data = raw?.posts_over_time ?? raw?.daily_counts ?? [];
    }
    res.json(data);
  } catch (err) {
    req.log.warn({ err }, "FastAPI unavailable for /stats/posts-over-time");
    res.json([]);
  }
});

export default router;
