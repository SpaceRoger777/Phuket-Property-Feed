import { useGetListings, getGetListingsQueryKey } from "@workspace/api-client-react";
import { formatPrice, formatArea, getOpportunityColor } from "@/lib/formatters";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { ChevronDown, ExternalLink, Copy, Check } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

export function ListingsBrowser() {
  const [filters, setFilters] = useState({
    listing_type: "all",
    property_type: "all",
    district: "",
    phuket_zone: "all",
    poster_type: "all",
    min_price: "",
    max_price: ""
  });

  const queryParams: any = {};
  if (filters.listing_type !== "all") queryParams.listing_type = filters.listing_type;
  if (filters.property_type !== "all") queryParams.property_type = filters.property_type;
  if (filters.district) queryParams.district = filters.district;
  if (filters.phuket_zone !== "all") queryParams.phuket_zone = filters.phuket_zone;
  if (filters.poster_type !== "all") queryParams.poster_type = filters.poster_type;
  if (filters.min_price) queryParams.min_price = parseInt(filters.min_price, 10);
  if (filters.max_price) queryParams.max_price = parseInt(filters.max_price, 10);

  const { data: listings, isLoading } = useGetListings(queryParams, {
    query: { queryKey: getGetListingsQueryKey(queryParams) }
  });

  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copyToClipboard = (listing: any, e: React.MouseEvent) => {
    e.stopPropagation();
    const text = `[${listing.property_type || "Property"}] ${listing.bedrooms || 0}BR | ${listing.district || "Unknown Area"} | ${listing.price_thb ? formatPrice(listing.price_thb) : "N/A"} | Direct Owner: ${listing.is_direct_owner ? "Yes" : "No"} | ${listing.post_url || ""}`;
    navigator.clipboard.writeText(text);
    setCopiedId(listing.post_id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="flex flex-col gap-6 h-full">
      {/* Filter Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 p-4 bg-card border border-border rounded-lg">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Listing Type</Label>
          <Select value={filters.listing_type} onValueChange={v => setFilters(prev => ({...prev, listing_type: v}))}>
            <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="All" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="for_sale">For Sale</SelectItem>
              <SelectItem value="for_rent">For Rent</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Property Type</Label>
          <Select value={filters.property_type} onValueChange={v => setFilters(prev => ({...prev, property_type: v}))}>
            <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="All" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="villa">Villa</SelectItem>
              <SelectItem value="condo">Condo</SelectItem>
              <SelectItem value="house">House</SelectItem>
              <SelectItem value="land">Land</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Zone</Label>
          <Select value={filters.phuket_zone} onValueChange={v => setFilters(prev => ({...prev, phuket_zone: v}))}>
            <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="All" /></SelectTrigger>
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
          <Label className="text-xs text-muted-foreground">Poster</Label>
          <Select value={filters.poster_type} onValueChange={v => setFilters(prev => ({...prev, poster_type: v}))}>
            <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="All" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="owner">Owner</SelectItem>
              <SelectItem value="agent">Agent</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">District</Label>
          <Input className="h-8 text-sm" placeholder="e.g. Rawai" value={filters.district} onChange={e => setFilters(prev => ({...prev, district: e.target.value}))} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Min Price</Label>
          <Input className="h-8 text-sm" type="number" placeholder="Min ฿" value={filters.min_price} onChange={e => setFilters(prev => ({...prev, min_price: e.target.value}))} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Max Price</Label>
          <Input className="h-8 text-sm" type="number" placeholder="Max ฿" value={filters.max_price} onChange={e => setFilters(prev => ({...prev, max_price: e.target.value}))} />
        </div>
      </div>

      <div className="border border-border rounded-lg bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead className="w-[100px]">Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Beds</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Owner?</TableHead>
                <TableHead>Score</TableHead>
                <TableHead className="w-[80px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={8}><Skeleton className="h-8 w-full" /></TableCell>
                  </TableRow>
                ))
              ) : !listings || listings.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                    No listings found.
                  </TableCell>
                </TableRow>
              ) : (
                listings.map((listing) => (
                  <Collapsible key={listing.post_id} asChild>
                    <>
                      <TableRow className="cursor-pointer hover:bg-muted/50 group">
                        <TableCell className="text-xs text-muted-foreground">
                          {listing.created_at ? new Date(listing.created_at).toLocaleDateString() : "N/A"}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <CollapsibleTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-6 w-6 p-0 shrink-0">
                                <ChevronDown className="h-4 w-4" />
                              </Button>
                            </CollapsibleTrigger>
                            <span className="font-medium capitalize">{listing.property_type || "N/A"}</span>
                            {listing.listing_type === "for_rent" && <Badge variant="outline" className="text-[10px]">Rent</Badge>}
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-sm font-medium">
                          {listing.price_thb ? formatPrice(listing.price_thb) : "N/A"}
                        </TableCell>
                        <TableCell>{listing.bedrooms ? `${listing.bedrooms} BR` : "-"}</TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="text-sm font-medium">{listing.district || "N/A"}</span>
                            <span className="text-[10px] text-muted-foreground capitalize">{listing.phuket_zone || "-"}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {listing.is_direct_owner ? (
                            <Badge variant="default" className="bg-primary/20 text-primary hover:bg-primary/30 border-none">Yes</Badge>
                          ) : (
                            <span className="text-muted-foreground text-sm">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {listing.opportunity_score ? (
                            <Badge variant={getOpportunityColor(listing.opportunity_score)} className="text-xs">
                              {listing.opportunity_score}
                            </Badge>
                          ) : "-"}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => copyToClipboard(listing, e)}>
                              {copiedId === listing.post_id ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                            </Button>
                            {listing.post_url && (
                              <Button variant="ghost" size="icon" className="h-7 w-7" asChild onClick={e => e.stopPropagation()}>
                                <a href={listing.post_url} target="_blank" rel="noopener noreferrer">
                                  <ExternalLink className="h-3.5 w-3.5" />
                                </a>
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                      <CollapsibleContent asChild>
                        <TableRow className="bg-muted/20 border-b">
                          <TableCell colSpan={8} className="p-0 border-b-0">
                            <div className="p-4 grid grid-cols-1 lg:grid-cols-3 gap-6">
                              <div className="col-span-2 space-y-4">
                                <div>
                                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Original Post</h4>
                                  <p className="text-sm whitespace-pre-wrap break-words">{listing.post_text}</p>
                                </div>
                                {listing.decision_summary && (
                                  <div className="bg-primary/10 border border-primary/20 p-3 rounded-md">
                                    <h4 className="text-xs font-semibold text-primary uppercase tracking-wider mb-1">AI Summary</h4>
                                    <p className="text-sm text-primary/90">{listing.decision_summary}</p>
                                  </div>
                                )}
                              </div>
                              <div className="space-y-4 text-sm">
                                <div>
                                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Details</h4>
                                  <div className="grid grid-cols-2 gap-2 text-muted-foreground">
                                    <div>Area:</div><div className="text-foreground font-medium">{formatArea(listing.size_sqm, listing.land_rai)}</div>
                                    <div>Bathrooms:</div><div className="text-foreground font-medium">{listing.bathrooms || "-"}</div>
                                    <div>Author:</div><div className="text-foreground font-medium">{listing.author_name || "Unknown"}</div>
                                    <div>Poster Type:</div><div className="text-foreground font-medium capitalize">{listing.poster_type || "-"}</div>
                                  </div>
                                </div>
                                <div>
                                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Amenities</h4>
                                  <div className="flex flex-wrap gap-2">
                                    {listing.has_pool && <Badge variant="secondary">Pool</Badge>}
                                    {listing.has_sea_view && <Badge variant="secondary">Sea View</Badge>}
                                    {listing.has_mountain_view && <Badge variant="secondary">Mountain View</Badge>}
                                    {listing.has_gym && <Badge variant="secondary">Gym</Badge>}
                                    {listing.has_security && <Badge variant="secondary">Security</Badge>}
                                    {listing.has_parking && <Badge variant="secondary">Parking</Badge>}
                                    {listing.has_garden && <Badge variant="secondary">Garden</Badge>}
                                    {!listing.has_pool && !listing.has_sea_view && !listing.has_mountain_view && !listing.has_gym && !listing.has_security && !listing.has_parking && !listing.has_garden && (
                                      <span className="text-muted-foreground italic">None extracted</span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      </CollapsibleContent>
                    </>
                  </Collapsible>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
