import { 
  useGetStatsOverview, getGetStatsOverviewQueryKey,
  useGetStatsByDistrict, getGetStatsByDistrictQueryKey,
  useGetStatsByPropertyType, getGetStatsByPropertyTypeQueryKey,
  useGetStatsPostsOverTime, getGetStatsPostsOverTimeQueryKey,
  useGetStatsPricePerSqm, getGetStatsPricePerSqmQueryKey
} from "@workspace/api-client-react";
import { formatPrice } from "@/lib/formatters";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line
} from "recharts";

export function MarketIntelligence() {
  const { data: overview, isLoading: isLoadingOverview } = useGetStatsOverview({
    query: { queryKey: getGetStatsOverviewQueryKey() }
  });

  const { data: districtStats, isLoading: isLoadingDistricts } = useGetStatsByDistrict({
    query: { queryKey: getGetStatsByDistrictQueryKey() }
  });

  const { data: propTypeStats, isLoading: isLoadingPropTypes } = useGetStatsByPropertyType({
    query: { queryKey: getGetStatsByPropertyTypeQueryKey() }
  });

  const { data: timeStats, isLoading: isLoadingTime } = useGetStatsPostsOverTime({
    query: { queryKey: getGetStatsPostsOverTimeQueryKey() }
  });

  const { data: sqmStats, isLoading: isLoadingSqm } = useGetStatsPricePerSqm({
    query: { queryKey: getGetStatsPricePerSqmQueryKey() }
  });

  return (
    <div className="flex flex-col gap-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-card">
          <CardHeader className="pb-2">
            <CardDescription className="uppercase tracking-wider text-xs font-semibold">Total Posts This Week</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingOverview ? <Skeleton className="h-8 w-20" /> : (
              <div className="text-3xl font-bold font-mono text-foreground">
                {overview?.total_posts_this_week?.toLocaleString() || 0}
              </div>
            )}
          </CardContent>
        </Card>
        <Card className="bg-card">
          <CardHeader className="pb-2">
            <CardDescription className="uppercase tracking-wider text-xs font-semibold">Direct Owner Signals</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingOverview ? <Skeleton className="h-8 w-20" /> : (
              <div className="flex items-baseline gap-2">
                <div className="text-3xl font-bold font-mono text-primary">
                  {overview?.direct_owner_pct ? Math.round(overview.direct_owner_pct) : 0}%
                </div>
                <div className="text-sm text-muted-foreground font-mono">
                  ({overview?.direct_owner_count || 0})
                </div>
              </div>
            )}
          </CardContent>
        </Card>
        <Card className="bg-card">
          <CardHeader className="pb-2">
            <CardDescription className="uppercase tracking-wider text-xs font-semibold">Sale vs Rent</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingOverview ? <Skeleton className="h-8 w-20" /> : (
              <div className="text-3xl font-bold font-mono text-foreground flex items-center gap-2">
                <span>{overview?.for_sale_count || 0}</span>
                <span className="text-muted-foreground text-xl font-normal">/</span>
                <span>{overview?.for_rent_count || 0}</span>
              </div>
            )}
          </CardContent>
        </Card>
        <Card className="bg-card">
          <CardHeader className="pb-2">
            <CardDescription className="uppercase tracking-wider text-xs font-semibold">High Opportunity</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingOverview ? <Skeleton className="h-8 w-20" /> : (
              <div className="text-3xl font-bold font-mono text-destructive">
                {overview?.high_opportunity_count || 0}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Posts Over Time Chart */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-lg">Scraping Volume (30 Days)</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            {isLoadingTime ? <Skeleton className="w-full h-full" /> : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={timeStats || []} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis 
                    dataKey="date" 
                    stroke="hsl(var(--muted-foreground))" 
                    fontSize={12} 
                    tickFormatter={(val) => new Date(val).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                    labelFormatter={(val) => new Date(val).toLocaleDateString()}
                  />
                  <Line type="monotone" dataKey="count" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Listings by District Chart */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-lg">Density by District</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            {isLoadingDistricts ? <Skeleton className="w-full h-full" /> : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={districtStats || []} layout="vertical" margin={{ top: 10, right: 10, left: 30, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                  <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <YAxis dataKey="district" type="category" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                    cursor={{ fill: 'hsl(var(--muted)/0.5)' }}
                  />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Price Per Sqm Table */}
        <Card className="bg-card border-border lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg">Price Per Sqm Benchmark</CardTitle>
            <CardDescription>Based on For Sale listings with valid area data</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingSqm ? <Skeleton className="w-full h-[200px]" /> : (
              <div className="border border-border rounded-md overflow-hidden">
                <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow>
                      <TableHead>District</TableHead>
                      <TableHead className="text-right">Listings</TableHead>
                      <TableHead className="text-right">Min / sqm</TableHead>
                      <TableHead className="text-right">Median / sqm</TableHead>
                      <TableHead className="text-right">Avg / sqm</TableHead>
                      <TableHead className="text-right">Max / sqm</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {!sqmStats || sqmStats.length === 0 ? (
                      <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground h-20">No data available</TableCell></TableRow>
                    ) : (
                      sqmStats.map((stat, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-medium">{stat.district || "Unknown"}</TableCell>
                          <TableCell className="text-right font-mono text-muted-foreground">{stat.count}</TableCell>
                          <TableCell className="text-right font-mono">{stat.min_price_per_sqm ? formatPrice(stat.min_price_per_sqm) : "-"}</TableCell>
                          <TableCell className="text-right font-mono text-primary font-medium">{stat.median_price_per_sqm ? formatPrice(stat.median_price_per_sqm) : "-"}</TableCell>
                          <TableCell className="text-right font-mono">{stat.avg_price_per_sqm ? formatPrice(stat.avg_price_per_sqm) : "-"}</TableCell>
                          <TableCell className="text-right font-mono text-muted-foreground">{stat.max_price_per_sqm ? formatPrice(stat.max_price_per_sqm) : "-"}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
