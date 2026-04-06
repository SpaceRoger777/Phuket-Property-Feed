# PhuketDeal — Real Estate Intelligence Dashboard

## Overview

A real estate intelligence dashboard for a Phuket property agent/investor. Built as a dark-mode React + Vite app that proxies to an existing Python FastAPI backend (SQLite-based) on port 8000.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Frontend**: React + Vite + Tailwind CSS + Recharts (at `artifacts/phuket-deal/`)
- **API framework**: Express 5 (proxy layer at `artifacts/api-server/`)
- **External backend**: Python FastAPI on `http://localhost:8000` (user-managed)
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle for api-server)

## Architecture

The Node.js Express server (`artifacts/api-server`) acts as a proxy adapter between the React frontend and the user's existing Python FastAPI backend running on port 8000. 

When FastAPI is not available (returns error/unreachable), the proxy gracefully returns empty arrays so the frontend shows clean empty states rather than error screens.

## Key App Features

### Tab 1: Hot Leads
- **Direct Owner Listings** — `is_direct_owner=true` or `classification_label IN (owner_confirmed, owner_suspected)`
- **Demand Signals (Buyers/Renters)** — posts where `listing_type=unknown` or buyer intent text
- Filters: phuket_zone, property_type, min/max price, has_pool, date range

### Tab 2: Listings Browser  
- Full sortable/filterable table of all property listings
- Expandable rows with full post text, AI decision summary, and amenities
- Copy-to-clipboard per row in formatted string

### Tab 3: Market Intelligence
- KPI cards: This week's posts, direct owner %, for sale vs rent, high opportunity count
- Charts: District distribution (bar), property type breakdown (bar), posts over time (line)
- Price/sqm table by district with avg, median, min, max

## API Endpoints (proxy routes)

The Express server proxies these to FastAPI:
- `GET /api/listings` — joined fb_posts + fb_structured_data with filters
- `GET /api/leads/direct-owners` — direct owner posts
- `GET /api/leads/buyers` — buyer/renter demand posts
- `GET /api/stats/overview` — KPI aggregates
- `GET /api/stats/by-district` — listing counts per district
- `GET /api/stats/by-property-type` — listing counts per property type
- `GET /api/stats/price-per-sqm` — price/sqm stats by district
- `GET /api/stats/posts-over-time` — daily post counts (last 30 days)

## FastAPI Backend (user-managed)

Point the existing Python FastAPI backend to port 8000 and ensure it exposes:
- `GET /api/listings` (joins fb_posts + fb_structured_data)
- `GET /api/stats` or individual `/api/stats/*` endpoints
- `GET /api/posts?classification_label=&is_direct_owner=` as fallbacks

Set `FASTAPI_URL` env var to override the default `http://localhost:8000`.

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/api-server run dev` — run API proxy server locally
- `pnpm --filter @workspace/phuket-deal run dev` — run frontend locally

## Data Format Notes

- Prices displayed as ฿X,XXX,XXX Thai Baht with comma separators
- Land size shown in both sqm AND Rai-Ngan-Wah (1 Rai = 1,600 sqm; 1 Ngan = 400 sqm; 1 Wah = 4 sqm)

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
