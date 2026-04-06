import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HotLeads } from "@/components/HotLeads";
import { ListingsBrowser } from "@/components/ListingsBrowser";
import { MarketIntelligence } from "@/components/MarketIntelligence";
import { Activity, ListFilter, TrendingUp, Radar, WifiOff } from "lucide-react";
import { useEffect, useState } from "react";
import { useGetStatsOverview } from "@workspace/api-client-react";

type HealthData = {
  status: string;
  backend_connected: boolean;
  fastapi_url: string;
  fastapi_detail: string | null;
};

function BackendStatus() {
  const [health, setHealth] = useState<HealthData | null>(null);

  // Ping the health endpoint every 20 seconds — now reports real FastAPI connectivity
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
      <div className="flex items-center gap-2 text-xs font-mono text-red-400 border border-red-500/30 px-2 py-1 rounded bg-red-500/10" title="Restart ngrok and update FASTAPI_URL in Replit Secrets">
        <WifiOff className="w-3.5 h-3.5" />
        BACKEND OFFLINE — restart ngrok &amp; update FASTAPI_URL
      </div>
    );
  }

  const totalPosts = overview?.total_posts_all_time ?? 0;
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

export default function Dashboard() {
  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex flex-col">
      {/* Top Navbar */}
      <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-primary/10 p-2 rounded-lg border border-primary/20">
              <Radar className="w-5 h-5 text-primary" />
            </div>
            <div className="flex flex-col">
              <span className="font-bold text-lg leading-none tracking-tight">PhuketDeal</span>
              <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium">Intelligence</span>
            </div>
          </div>
          <BackendStatus />
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 container mx-auto px-4 py-8">
        <Tabs defaultValue="hot-leads" className="w-full flex flex-col h-full">
          <div className="flex justify-between items-center mb-6">
            <TabsList className="bg-muted/50 border border-border/50 p-1">
              <TabsTrigger value="hot-leads" className="flex items-center gap-2 data-[state=active]:bg-card data-[state=active]:shadow-sm">
                <Activity className="w-4 h-4" />
                Hot Leads
              </TabsTrigger>
              <TabsTrigger value="browser" className="flex items-center gap-2 data-[state=active]:bg-card data-[state=active]:shadow-sm">
                <ListFilter className="w-4 h-4" />
                Listings Browser
              </TabsTrigger>
              <TabsTrigger value="market" className="flex items-center gap-2 data-[state=active]:bg-card data-[state=active]:shadow-sm">
                <TrendingUp className="w-4 h-4" />
                Market Intelligence
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 mt-2">
            <TabsContent value="hot-leads" className="m-0 h-full">
              <HotLeads />
            </TabsContent>
            <TabsContent value="browser" className="m-0 h-full">
              <ListingsBrowser />
            </TabsContent>
            <TabsContent value="market" className="m-0 h-full">
              <MarketIntelligence />
            </TabsContent>
          </div>
        </Tabs>
      </main>
    </div>
  );
}
