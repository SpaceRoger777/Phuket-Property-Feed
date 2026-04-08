import { useState, useCallback } from "react";
import {
  useGetDirectOwners,
  getGetDirectOwnersQueryKey,
  useGetBuyerRequests,
  getGetBuyerRequestsQueryKey,
  useAddPostLabel,
  useRemovePostLabel,
  useDiscardPost,
} from "@workspace/api-client-react";
import type { Listing, PostLabel } from "@workspace/api-client-react";
import {
  formatPriceRange,
  formatRelativeDate,
  getOpportunityClass,
  getClassificationClass,
  getListingTypeClass,
} from "@/lib/formatters";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  ExternalLink,
  User,
  MapPin,
  Clock,
  AlertTriangle,
  Star,
  Phone,
  Bookmark,
  Trash2,
  BedDouble,
  Bath,
  Maximize2,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Per-card action state — optimistic updates
// ---------------------------------------------------------------------------
type CardState = { labels: Set<PostLabel>; discarded: boolean };

function useCardActions(listing: Listing) {
  const [state, setState] = useState<CardState>({
    labels: new Set((listing.labels ?? []) as PostLabel[]),
    discarded: Boolean(listing.is_discarded),
  });

  const { mutate: addLabel }    = useAddPostLabel();
  const { mutate: removeLabel } = useRemovePostLabel();
  const { mutate: discard }     = useDiscardPost();

  const toggleLabel = useCallback(
    (label: PostLabel) => {
      const has = state.labels.has(label);
      setState((prev) => {
        const next = new Set(prev.labels);
        has ? next.delete(label) : next.add(label);
        return { ...prev, labels: next };
      });
      if (has) {
        removeLabel(
          { post_id: listing.post_id, label },
          { onError: () => setState((p) => { const n = new Set(p.labels); n.add(label); return { ...p, labels: n }; }) },
        );
      } else {
        addLabel(
          { post_id: listing.post_id, body: { label } },
          { onError: () => setState((p) => { const n = new Set(p.labels); n.delete(label); return { ...p, labels: n }; }) },
        );
      }
    },
    [state.labels, listing.post_id, addLabel, removeLabel],
  );

  const handleDiscard = useCallback(() => {
    setState((p) => ({ ...p, discarded: true }));
    discard(
      { post_id: listing.post_id },
      { onError: () => setState((p) => ({ ...p, discarded: false })) },
    );
  }, [listing.post_id, discard]);

  return { state, toggleLabel, handleDiscard };
}

// ---------------------------------------------------------------------------
// Action icon button
// ---------------------------------------------------------------------------
function ActionBtn({
  icon, active, activeClass, title, onClick, danger = false,
}: {
  icon: React.ReactNode;
  active: boolean;
  activeClass: string;
  title: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn(
        "p-1.5 rounded-md transition-colors",
        active
          ? cn(activeClass, "opacity-100")
          : danger
          ? "text-muted-foreground/40 hover:text-red-400 hover:bg-red-400/10"
          : "text-muted-foreground/40 hover:text-foreground hover:bg-muted/60",
      )}
    >
      {icon}
    </button>
  );
}

// ---------------------------------------------------------------------------
// ListingCard
// ---------------------------------------------------------------------------
function ListingCard({ listing, isDemand = false }: { listing: Listing; isDemand?: boolean }) {
  const { state, toggleLabel, handleDiscard } = useCardActions(listing);
  if (state.discarded) return null;

  const price   = formatPriceRange(listing.price_thb, listing.price_thb_min, listing.price_thb_max, listing.listing_type);
  const loc     = listing.district || listing.phuket_zone || listing.location;
  const isOwner = listing.is_direct_owner || (listing.classification_label ?? "").toUpperCase().includes("OWNER");
  const date    = listing.scraped_at || listing.created_at;

  return (
    <div className={cn(
      "flex flex-col bg-card border border-border/60 rounded-xl overflow-hidden",
      "hover:border-border/80 transition-colors",
      state.labels.has("hot_lead") && "border-amber-500/50 ring-1 ring-amber-500/20",
    )}>

      {/* Header: badges + link */}
      <div className="flex items-start justify-between gap-2 px-4 pt-3.5 pb-1">
        <div className="flex flex-wrap gap-1.5 min-w-0">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {listing.property_type || "Property"}
          </span>
          {listing.listing_type && (
            <span className={cn("inline-flex items-center px-1.5 rounded text-[10px] font-bold uppercase border", getListingTypeClass(listing.listing_type))}>
              {listing.listing_type === "for_sale" ? "Sale" : listing.listing_type === "for_rent" ? "Rent" : listing.listing_type}
            </span>
          )}
          {!isDemand && (
            <span className={cn("inline-flex items-center px-1.5 rounded text-[10px] font-bold uppercase border", getClassificationClass(listing.classification_label))}>
              {isOwner ? "Owner" : "Agent"}
            </span>
          )}
          {!isDemand && listing.opportunity_score && (
            <span className={cn("inline-flex items-center px-1.5 rounded text-[10px] font-medium border", getOpportunityClass(listing.opportunity_score))}>
              {listing.opportunity_score.toUpperCase()}
            </span>
          )}
        </div>
        {listing.post_url && (
          <a href={listing.post_url} target="_blank" rel="noopener noreferrer"
            className="shrink-0 p-0.5 text-muted-foreground/40 hover:text-primary transition-colors" title="Open post">
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
      </div>

      {/* Price */}
      <div className="px-4 pb-2">
        <p className="text-xl font-bold text-foreground leading-tight">{price}</p>
      </div>

      {/* Stats strip */}
      {(listing.bedrooms != null || listing.bathrooms != null || listing.size_sqm != null) && (
        <div className="flex flex-wrap items-center gap-3 px-4 pb-2 text-xs text-muted-foreground">
          {listing.bedrooms  != null && <span className="flex items-center gap-1"><BedDouble className="w-3 h-3"/>{listing.bedrooms} bed</span>}
          {listing.bathrooms != null && <span className="flex items-center gap-1"><Bath      className="w-3 h-3"/>{listing.bathrooms} bath</span>}
          {listing.size_sqm  != null && <span className="flex items-center gap-1"><Maximize2 className="w-3 h-3"/>{listing.size_sqm.toLocaleString()} ㎡</span>}
          {listing.has_pool     && <span className="text-cyan-400 font-medium">🏊</span>}
          {listing.has_sea_view && <span className="text-sky-400  font-medium">🌊</span>}
        </div>
      )}

      {/* Author + location */}
      <div className="flex items-center justify-between gap-2 px-4 pb-2 text-[11px] text-muted-foreground">
        <div className="flex items-center gap-1 min-w-0 truncate">
          <User className="w-3 h-3 shrink-0"/>
          {listing.author_profile_url ? (
            <a href={listing.author_profile_url} target="_blank" rel="noopener noreferrer"
              className="hover:text-primary truncate transition-colors">{listing.author_name || "Unknown"}</a>
          ) : (
            <span className="truncate">{listing.author_name || "Unknown"}</span>
          )}
        </div>
        {loc && (
          <span className="flex items-center gap-1 shrink-0">
            <MapPin className="w-3 h-3"/>{loc}
          </span>
        )}
      </div>

      {/* AI decision summary */}
      {listing.decision_summary && (
        <p className="px-4 pb-2 text-[11px] text-muted-foreground/70 italic line-clamp-2 leading-relaxed">
          {listing.decision_summary}
        </p>
      )}

      {/* Urgency signals */}
      {listing.urgency_signals && listing.urgency_signals.length > 0 && (
        <div className="flex flex-wrap gap-1 px-4 pb-2">
          {listing.urgency_signals.map((sig, i) => (
            <span key={i} className="inline-flex items-center gap-0.5 px-1.5 rounded text-[10px] font-medium bg-red-500/10 text-red-400 border border-red-500/25">
              <AlertTriangle className="w-2.5 h-2.5"/>{sig}
            </span>
          ))}
        </div>
      )}

      {/* Footer: date + action buttons */}
      <div className="mt-auto border-t border-border/40 px-3 py-1.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1 text-[11px] text-muted-foreground/50">
          <Clock className="w-3 h-3"/>{formatRelativeDate(date)}
        </div>
        {!isDemand && (
          <div className="flex items-center">
            <ActionBtn icon={<Star     className="w-3.5 h-3.5"/>} active={state.labels.has("favorite")}  activeClass="text-yellow-400" title="Favorite"  onClick={() => toggleLabel("favorite")}/>
            <ActionBtn icon={<Phone    className="w-3.5 h-3.5"/>} active={state.labels.has("contacted")} activeClass="text-green-400"  title="Contacted" onClick={() => toggleLabel("contacted")}/>
            <ActionBtn icon={<Bookmark className="w-3.5 h-3.5"/>} active={state.labels.has("hot_lead")}  activeClass="text-amber-400" title="Hot lead"  onClick={() => toggleLabel("hot_lead")}/>
            <ActionBtn icon={<Trash2   className="w-3.5 h-3.5"/>} active={false} activeClass="text-red-400" title="Discard" onClick={handleDiscard} danger/>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// HotLeads page — receives scraped_date from Dashboard date picker
// ---------------------------------------------------------------------------
export function HotLeads({ scraped_date }: { scraped_date?: string }) {
  const [phuketZone,   setPhuketZone]   = useState("all");
  const [propertyType, setPropertyType] = useState("all");

  const qp = {
    ...(phuketZone   !== "all" ? { phuket_zone:   phuketZone   } : {}),
    ...(propertyType !== "all" ? { property_type: propertyType } : {}),
    ...(scraped_date            ? { scraped_date }               : {}),
  };

  const { data: directOwners, isLoading: loadOwners } = useGetDirectOwners(qp, {
    query: { queryKey: getGetDirectOwnersQueryKey(qp) },
  });
  const { data: buyerRequests, isLoading: loadBuyers } = useGetBuyerRequests(qp, {
    query: { queryKey: getGetBuyerRequestsQueryKey(qp) },
  });

  return (
    <div className="flex flex-col gap-5">
      {/* Filter bar */}
      <div className="flex flex-wrap items-end gap-4 p-4 bg-card border border-border rounded-lg">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Zone</Label>
          <Select value={phuketZone} onValueChange={setPhuketZone}>
            <SelectTrigger className="w-[140px] h-8 text-sm"><SelectValue placeholder="All Zones"/></SelectTrigger>
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
            <SelectTrigger className="w-[140px] h-8 text-sm"><SelectValue placeholder="All Types"/></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="villa">Villa</SelectItem>
              <SelectItem value="condo">Condo</SelectItem>
              <SelectItem value="house">House</SelectItem>
              <SelectItem value="land">Land</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {scraped_date && (
          <div className="ml-auto text-xs text-muted-foreground/70 border border-border/50 rounded px-2.5 py-1">
            Showing: <span className="text-foreground font-medium">{scraped_date}</span>
          </div>
        )}
      </div>

      {/* Two-column grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Direct Owner Listings */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold flex items-center gap-2 uppercase tracking-wider text-muted-foreground">
              <span className="w-2 h-2 rounded-full bg-primary"/>Direct Owner Listings
            </h2>
            <Badge variant="outline" className="font-mono text-xs">{directOwners?.length ?? 0}</Badge>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-3">
            {loadOwners
              ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-52 rounded-xl"/>)
              : !directOwners?.length
              ? <p className="col-span-full p-8 text-center text-sm text-muted-foreground border border-dashed rounded-xl">No direct owner listings found.</p>
              : directOwners.map((l) => <ListingCard key={l.post_id} listing={l}/>)}
          </div>
        </section>

        {/* Demand Signals */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold flex items-center gap-2 uppercase tracking-wider text-muted-foreground">
              <span className="w-2 h-2 rounded-full bg-amber-500"/>Demand Signals
            </h2>
            <Badge variant="outline" className="font-mono text-xs">{buyerRequests?.length ?? 0}</Badge>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-3">
            {loadBuyers
              ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-xl"/>)
              : !buyerRequests?.length
              ? <p className="col-span-full p-8 text-center text-sm text-muted-foreground border border-dashed rounded-xl">No buyer requests found.</p>
              : buyerRequests.map((l) => <ListingCard key={l.post_id} listing={l} isDemand/>)}
          </div>
        </section>
      </div>
    </div>
  );
}
