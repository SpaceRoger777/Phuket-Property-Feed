import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HotLeads } from "@/components/HotLeads";
import { ListingsBrowser } from "@/components/ListingsBrowser";
import { MarketIntelligence } from "@/components/MarketIntelligence";
import { Activity, ListFilter, TrendingUp, Radar, WifiOff, CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { useGetStatsOverview, useGetScrapeDates } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Backend health badge (top-right corner)
// ---------------------------------------------------------------------------
type HealthData = {
  status: string;
  backend_connected: boolean;
  fastapi_url: string;
  fastapi_detail: string | null;
};

function BackendStatus() {
  const [health, setHealth] = useState<HealthData | null>(null);

  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch("/api/healthz", { signal: AbortSignal.timeout(6000) });
        if (res.ok) {
          const data = await res.json() as HealthData;
          setHealth(data);
        } else {
          setHealth({ status: "error", backend_connected: false, fastapi_url: "", fastapi_detail: null });
        }
      } catch {
        setHealth({ status: "error", backend_connected: false, fastapi_url: "", fastapi_detail: null });
      }
    };
    check();
    const id = setInterval(check, 20000);
    return () => clearInterval(id);
  }, []);

  const { data: overview } = useGetStatsOverview();

  if (health === null) {
    return (
      <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground border border-border px-2 py-1 rounded bg-card/50">
        <span className="w-2 h-2 rounded-full bg-muted-foreground animate-pulse" />
        CONNECTING…
      </div>
    );
  }

  if (!health.backend_connected) {
    return (
      <div
        className="flex items-center gap-2 text-xs font-mono text-red-400 border border-red-500/30 px-2 py-1 rounded bg-red-500/10"
        title="Restart ngrok and update FASTAPI_URL in Replit Secrets"
      >
        <WifiOff className="w-3.5 h-3.5" />
        BACKEND OFFLINE
      </div>
    );
  }

  const totalPosts    = overview?.total_posts_all_time  ?? 0;
  const postsThisWeek = overview?.total_posts_this_week ?? 0;

  return (
    <div className="flex items-center gap-3">
      {totalPosts > 0 && (
        <div className="hidden sm:flex items-center gap-3 text-xs font-mono text-muted-foreground">
          <span className="border border-border/50 px-2 py-1 rounded bg-card/50">
            <span className="text-foreground font-bold">{totalPosts.toLocaleString()}</span> posts
          </span>
          <span className="border border-border/50 px-2 py-1 rounded bg-card/50">
            <span className="text-primary font-bold">{postsThisWeek.toLocaleString()}</span> this week
          </span>
        </div>
      )}
      <div className="flex items-center gap-2 text-xs font-mono text-green-400 border border-green-500/30 px-2 py-1 rounded bg-green-500/10">
        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
        LIVE
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Date picker bar — compact, uses available scrape dates
// ---------------------------------------------------------------------------
function DateFilterBar({
  selected,
  onChange,
}: {
  selected: string | undefined;
  onChange: (date: string | undefined) => void;
}) {
  const { data: dates = [] } = useGetScrapeDates();

  if (!dates.length) return null;

  const currentIdx = selected ? dates.indexOf(selected) : -1;

  const prev = () => {
    if (currentIdx < dates.length - 1) onChange(dates[currentIdx + 1]);
  };
  const next = () => {
    if (currentIdx > 0) onChange(dates[currentIdx - 1]);
  };
  const clear = () => onChange(undefined);

  return (
    <div className="flex items-center gap-2 border border-border/50 rounded-lg bg-card/50 px-3 py-1.5 text-xs">
      <CalendarDays className="w-3.5 h-3.5 text-muted-foreground shrink-0" />

      {/* Prev day */}
      <button
        onClick={prev}
        disabled={currentIdx >= dates.length - 1}
        className="p-0.5 rounded hover:bg-muted disabled:opacity-30 transition-colors"
        title="Previous day"
      >
        <ChevronLeft className="w-3.5 h-3.5" />
      </button>

      {/* Date selector */}
      <select
        value={selected ?? ""}
        onChange={(e) => onChange(e.target.value || undefined)}
        className="bg-transparent text-foreground font-medium focus:outline-none cursor-pointer"
      >
        <option value="">All dates</option>
        {dates.map((d) => (
          <option key={d} value={d}>{d}</option>
        ))}
      </select>

      {/* Next day */}
      <button
        onClick={next}
        disabled={currentIdx <= 0}
        className="p-0.5 rounded hover:bg-muted disabled:opacity-30 transition-colors"
        title="Next day"
      >
        <ChevronRight className="w-3.5 h-3.5" />
      </button>

      {/* Clear */}
      {selected && (
        <button
          onClick={clear}
          className="ml-1 text-muted-foreground hover:text-foreground transition-colors"
          title="Show all dates"
        >
          ✕
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------
export default function Dashboard() {
  const [scraped_date, setScrapedDate] = useState<string | undefined>(undefined);

  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex flex-col">
      {/* Top Navbar */}
      <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 h-14 flex items-center justify-between gap-4">
          {/* Brand */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="bg-primary/10 p-1.5 rounded-lg border border-primary/20">
              <Radar className="w-4 h-4 text-primary" />
            </div>
            <div className="flex flex-col leading-none">
              <span className="font-bold text-base tracking-tight">PhuketDeal</span>
              <span className="text-[9px] text-muted-foreground uppercase tracking-widest font-medium">Intelligence</span>
            </div>
          </div>

          {/* Date filter (centre) */}
          <DateFilterBar selected={scraped_date} onChange={setScrapedDate} />

          {/* Backend status (right) */}
          <BackendStatus />
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 container mx-auto px-4 py-6">
        <Tabs defaultValue="hot-leads" className="w-full">
          <TabsList className="mb-5 bg-muted/50 border border-border/50 p-1">
            <TabsTrigger value="hot-leads" className="flex items-center gap-2 data-[state=active]:bg-card data-[state=active]:shadow-sm text-sm">
              <Activity className="w-3.5 h-3.5" />Hot Leads
            </TabsTrigger>
            <TabsTrigger value="browser" className="flex items-center gap-2 data-[state=active]:bg-card data-[state=active]:shadow-sm text-sm">
              <ListFilter className="w-3.5 h-3.5" />Listings Browser
            </TabsTrigger>
            <TabsTrigger value="market" className="flex items-center gap-2 data-[state=active]:bg-card data-[state=active]:shadow-sm text-sm">
              <TrendingUp className="w-3.5 h-3.5" />Market Intelligence
            </TabsTrigger>
          </TabsList>

          <TabsContent value="hot-leads"  className="m-0"><HotLeads       scraped_date={scraped_date} /></TabsContent>
          <TabsContent value="browser"    className="m-0"><ListingsBrowser scraped_date={scraped_date} /></TabsContent>
          <TabsContent value="market"     className="m-0"><MarketIntelligence /></TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
