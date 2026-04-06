# PhuketDeal — Real Estate Intelligence Dashboard

## Overview

A real estate intelligence dashboard for a Phuket property agent/investor. Built as a dark-mode React + Vite app that proxies to an existing Python FastAPI backend (SQLite-based) running locally on Windows, exposed via ngrok.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Frontend**: React + Vite + Tailwind CSS + Recharts (`artifacts/phuket-deal/`)
- **Proxy layer**: Node.js Express 5 (`artifacts/api-server/`)
- **External backend**: Python FastAPI + SQLite (user-managed, Windows local)
- **Tunnel**: ngrok (free tier — URL changes on restart, update `FASTAPI_URL` secret)
- **API codegen**: Orval (generates hooks from OpenAPI spec in `lib/api-spec/`)

## Architecture

```
React UI (phuket-deal)
    ↓ /api/*
Node.js Proxy (api-server :8080)
    ↓ ngrok tunnel (FASTAPI_URL env var)
Python FastAPI (user's Windows machine :8000)
    ↓
SQLite (fb_posts + fb_structured_data)
```

The proxy maps frontend routes to FastAPI endpoints and normalises response shapes. When FastAPI is unreachable, all endpoints return graceful empty responses (no crash).

## Key App Features

### Tab 1: Hot Leads
- **Direct Owner Listings** — `/api/posts?filter=owner_confirmed` (136 classified owners, works without Ollama)
- **Demand Signals** — `/api/posts?listing_type=unknown` (74 unextracted posts / buyer intent)
- Filters: phuket_zone, property_type

### Tab 2: Listings Browser
- Full sortable/filterable table from `/structured/listings` (301/375 Ollama-extracted)
- Copy-to-clipboard per row

### Tab 3: Market Intelligence
- KPI cards: This week's posts, direct owner %, for sale vs rent, high opportunity count
- Charts: District distribution (bar), property type breakdown (bar), posts over time (line)
- Price/sqm table by district

## Proxy Route Mappings (`artifacts/api-server/src/routes/listings.ts`)

| Frontend Route | FastAPI Endpoint | Notes |
|---|---|---|
| `GET /api/listings` | `GET /structured/listings` | Unwraps `.listings` array |
| `GET /api/leads/direct-owners` | `GET /api/posts?filter=owner_confirmed` | Uses `data.items`, 136 posts |
| `GET /api/leads/buyers` | `GET /api/posts?listing_type=unknown` | Uses `data.items`, 74 posts |
| `GET /api/stats/overview` | `GET /api/stats/market` | Reshapes nested sale/rental/overall |
| `GET /api/stats/by-district` | `GET /api/stats/districts` | Merges sale+rental arrays |
| `GET /api/stats/by-property-type` | `GET /api/stats/distributions` | Extracts `.property_types` |
| `GET /api/stats/price-per-sqm` | `GET /api/stats/districts` | Extracts `.sale[].avg_price_per_sqm` |
| `GET /api/stats/posts-over-time` | `GET /api/stats/trends?days=30` | Extracts `.daily_volume` |

## FastAPI `/api/posts` Response

Returns `{ "items": [...] }` — **not** `{ "posts": [...] }` and **not** a plain array.

Each item includes: `post_id`, `post_url`, `author_name`, `author_profile_url`, `author_key`, `post_text`, `created_at`, `scraped_at`, `comment_count`, `like_count`, `is_hot`, `is_direct_owner`, `is_agent`, `classification_label`, `classification_confidence`, `listing_type`, `price_thb`, `bedrooms`, `bathrooms`, `size_sqm`, `property_type`, `location`, `district`, `furnished`, `has_pool`, `screenshot_path`, plus more.

## Backend Connection

- **`FASTAPI_URL`** secret must be set to the current ngrok URL (e.g. `https://xxxx.ngrok-free.app`)
- ngrok free tier changes URL on restart — update `FASTAPI_URL` each time
- Dashboard header shows live connectivity status: green "LIVE" when connected, red "BACKEND OFFLINE" when not

## Data Status (as of 2026-04-06)

- 375 total posts scraped
- 301/375 Ollama-extracted (structured data: price, district, bedrooms, property_type, etc.)
- 136 `OWNER_CONFIRMED` posts (classification-based, no Ollama needed)
- 74 `listing_type=unknown` posts (potential buyer demand signals)

## Key Commands

```bash
pnpm run typecheck                                          # full typecheck
pnpm --filter @workspace/api-spec run codegen              # regen API hooks from openapi.yaml
pnpm --filter @workspace/api-server run dev                # run proxy server
pnpm --filter @workspace/phuket-deal run dev               # run frontend
```

## Price Display

- Thai Baht formatting: ฿X,XXX,XXX
- Land size: sqm and Rai-Ngan-Wah (1 Rai = 1,600 sqm)
