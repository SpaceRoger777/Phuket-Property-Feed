import { Router, type IRouter } from "express";

const router: IRouter = Router();

const FASTAPI_BASE = process.env.FASTAPI_URL ?? "http://localhost:8000";

// Probe FastAPI reachability — tries /structured/status which is lightweight
async function checkFastAPI(): Promise<{ connected: boolean; url: string; detail?: string }> {
  try {
    const res = await fetch(`${FASTAPI_BASE}/structured/status`, {
      headers: { "ngrok-skip-browser-warning": "true" },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) {
      return { connected: false, url: FASTAPI_BASE, detail: `HTTP ${res.status}` };
    }
    const data = await res.json() as { total_posts?: number; extracted?: number };
    return {
      connected: true,
      url: FASTAPI_BASE,
      detail: `${data.extracted ?? 0}/${data.total_posts ?? 0} extracted`,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { connected: false, url: FASTAPI_BASE, detail: msg.slice(0, 80) };
  }
}

// GET /api/healthz — returns proxy status + FastAPI connectivity
router.get("/healthz", async (_req, res) => {
  const backend = await checkFastAPI();
  res.json({
    status: "ok",
    backend_connected: backend.connected,
    fastapi_url: backend.url,
    fastapi_detail: backend.detail ?? null,
  });
});

export default router;
