import { useGetDirectOwners, getGetDirectOwnersQueryKey, useGetBuyerRequests, getGetBuyerRequestsQueryKey } from "@workspace/api-client-react";
import { formatPrice, getOpportunityColor } from "@/lib/formatters";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ExternalLink, User, MapPin, Clock, AlertTriangle } from "lucide-react";
import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function ListingCard({ listing, isDemand }: { listing: any, isDemand?: boolean }) {
  return (
    <Card className="bg-card/50 border-border/50 hover:bg-card transition-colors flex flex-col h-full">
      <CardHeader className="pb-3 border-b border-border/30">
        <div className="flex justify-between items-start gap-2">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Badge variant={isDemand ? "secondary" : "default"} className="font-mono text-xs uppercase tracking-wider">
                {listing.property_type || "Property"}
              </Badge>
              {listing.opportunity_score && !isDemand && (
                <Badge variant={getOpportunityColor(listing.opportunity_score)} className="text-xs">
                  {listing.opportunity_score} score
                </Badge>
              )}
            </div>
            <CardTitle className="text-lg font-bold text-foreground">
              {listing.price_thb ? formatPrice(listing.price_thb) : (
                listing.price_thb_min && listing.price_thb_max 
                  ? `${formatPrice(listing.price_thb_min)} - ${formatPrice(listing.price_thb_max)}` 
                  : "Price N/A"
              )}
            </CardTitle>
          </div>
          {listing.post_url && (
            <a href={listing.post_url} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary shrink-0">
              <ExternalLink className="w-4 h-4" />
            </a>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-3 flex-grow flex flex-col gap-3">
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <div className="flex items-center gap-1.5 truncate">
            <User className="w-3.5 h-3.5 shrink-0" />
            {listing.author_profile_url ? (
              <a href={listing.author_profile_url} target="_blank" rel="noopener noreferrer" className="hover:text-primary truncate">
                {listing.author_name || "Unknown Author"}
              </a>
            ) : (
              <span className="truncate">{listing.author_name || "Unknown Author"}</span>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <MapPin className="w-3.5 h-3.5" />
            <span>{listing.district || listing.phuket_zone || "Unknown Area"}</span>
          </div>
        </div>

        {listing.decision_summary && (
          <div className="text-sm text-foreground/80 mt-2 line-clamp-3">
            {listing.decision_summary}
          </div>
        )}

        {listing.urgency_signals && listing.urgency_signals.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-auto pt-2">
            {listing.urgency_signals.map((sig: string, i: number) => (
              <Badge key={i} variant="outline" className="text-[10px] py-0 h-5 border-amber-500/30 text-amber-500 bg-amber-500/10">
                <AlertTriangle className="w-3 h-3 mr-1" />
                {sig}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
      <CardFooter className="pt-0 pb-3 text-xs text-muted-foreground flex items-center gap-1.5 border-t border-border/30 mt-3 pt-3">
        <Clock className="w-3.5 h-3.5" />
        {listing.created_at ? new Date(listing.created_at).toLocaleDateString() : "Unknown Date"}
      </CardFooter>
    </Card>
  );
}

export function HotLeads() {
  const [phuketZone, setPhuketZone] = useState<string>("all");
  const [propertyType, setPropertyType] = useState<string>("all");

  const queryParams = {
    ...(phuketZone !== "all" ? { phuket_zone: phuketZone } : {}),
    ...(propertyType !== "all" ? { property_type: propertyType } : {}),
  };

  const { data: directOwners, isLoading: isLoadingOwners } = useGetDirectOwners(queryParams, {
    query: { queryKey: getGetDirectOwnersQueryKey(queryParams) }
  });

  const { data: buyerRequests, isLoading: isLoadingBuyers } = useGetBuyerRequests(queryParams, {
    query: { queryKey: getGetBuyerRequestsQueryKey(queryParams) }
  });

  return (
    <div className="flex flex-col gap-6 h-full">
      <div className="flex flex-wrap items-end gap-4 p-4 bg-card border border-border rounded-lg">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Zone</Label>
          <Select value={phuketZone} onValueChange={setPhuketZone}>
            <SelectTrigger className="w-[160px] h-8">
              <SelectValue placeholder="All Zones" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Zones</SelectItem>
              <SelectItem value="north">North</SelectItem>
              <SelectItem value="central">Central</SelectItem>
              <SelectItem value="south">South</SelectItem>
              <SelectItem value="east">East</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Property Type</Label>
          <Select value={propertyType} onValueChange={setPropertyType}>
            <SelectTrigger className="w-[160px] h-8">
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="villa">Villa</SelectItem>
              <SelectItem value="condo">Condo</SelectItem>
              <SelectItem value="house">House</SelectItem>
              <SelectItem value="land">Land</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Direct Owners Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold tracking-tight flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-primary" />
              Direct Owner Listings
            </h2>
            <Badge variant="outline">{directOwners?.length || 0}</Badge>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {isLoadingOwners ? (
              Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-[200px] rounded-lg" />
              ))
            ) : !directOwners || directOwners.length === 0 ? (
              <div className="col-span-full p-8 text-center border border-dashed rounded-lg bg-card/30">
                <p className="text-muted-foreground">No direct owner listings found for these filters.</p>
              </div>
            ) : (
              directOwners.map(listing => (
                <ListingCard key={listing.post_id} listing={listing} />
              ))
            )}
          </div>
        </div>

        {/* Buyer Requests Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold tracking-tight flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-amber-500" />
              Demand Signals (Buyers/Renters)
            </h2>
            <Badge variant="outline">{buyerRequests?.length || 0}</Badge>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {isLoadingBuyers ? (
              Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-[200px] rounded-lg" />
              ))
            ) : !buyerRequests || buyerRequests.length === 0 ? (
              <div className="col-span-full p-8 text-center border border-dashed rounded-lg bg-card/30">
                <p className="text-muted-foreground">No buyer requests found for these filters.</p>
              </div>
            ) : (
              buyerRequests.map(listing => (
                <ListingCard key={listing.post_id} listing={listing} isDemand={true} />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
