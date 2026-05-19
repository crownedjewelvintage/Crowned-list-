import { useState, useMemo } from "react";
import { Link, useRoute } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { AppHeader } from "@/components/AppHeader";
import { downloadCsv, parseImages, resolvePhotoUrl } from "@/lib/items";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  Loader2,
  Download,
  Plus,
  X,
  Search,
  Image as ImageIcon,
  Package,
  DollarSign,
  Calendar,
  ClipboardList,
} from "lucide-react";
import type { Item, Show } from "@shared/schema";

type ShowDetail = Show & { items: Item[] };

function fmtMoney(n: number) {
  return `$${(n || 0).toFixed(2)}`;
}
function fmtDate(ms: number) {
  if (!ms) return "Not scheduled";
  return new Date(ms).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function ShowDetailPage() {
  const [match, params] = useRoute("/shows/:id");
  const id = match ? Number(params.id) : 0;
  const { toast } = useToast();
  const [addOpen, setAddOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [pickedIds, setPickedIds] = useState<Set<number>>(new Set());

  const { data: show, isLoading } = useQuery<ShowDetail>({
    queryKey: ["/api/shows", id],
    enabled: id > 0,
  });

  const { data: allItems = [] } = useQuery<Item[]>({
    queryKey: ["/api/items"],
  });

  const reorderMutation = useMutation({
    mutationFn: async (orderedItemIds: number[]) => {
      const res = await apiRequest("PATCH", `/api/shows/${id}/items/order`, { orderedItemIds });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/shows", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/shows"] });
    },
    onError: (err: any) => toast({ title: "Reorder failed", description: err.message, variant: "destructive" }),
  });

  const addMutation = useMutation({
    mutationFn: async (itemIds: number[]) => {
      const res = await apiRequest("POST", `/api/shows/${id}/items`, { itemIds });
      return res.json();
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/shows", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/shows"] });
      setAddOpen(false);
      setPickedIds(new Set());
      toast({ title: `Added ${vars.length} item${vars.length === 1 ? "" : "s"}` });
    },
    onError: (err: any) => toast({ title: "Add failed", description: err.message, variant: "destructive" }),
  });

  const removeMutation = useMutation({
    mutationFn: async (itemId: number) => {
      await apiRequest("DELETE", `/api/shows/${id}/items/${itemId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/shows", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/shows"] });
    },
    onError: (err: any) => toast({ title: "Remove failed", description: err.message, variant: "destructive" }),
  });

  const items = show?.items || [];
  const orderedIds = items.map((it) => it.id);

  const projectedRevenue = items.reduce(
    (sum, it) => sum + (it.buyNowPrice || it.price || 0) * (it.quantity || 1),
    0,
  );
  const totalCost = items.reduce(
    (sum, it) => sum + (it.sellerCost || 0) * (it.quantity || 1),
    0,
  );

  const candidateItems = useMemo(() => {
    const inShow = new Set(orderedIds);
    const q = search.trim().toLowerCase();
    return allItems
      .filter((it) => !inShow.has(it.id))
      .filter((it) => it.status === "Active")
      .filter((it) => {
        if (!q) return true;
        return (
          it.title.toLowerCase().includes(q) ||
          it.sku.toLowerCase().includes(q) ||
          it.category.toLowerCase().includes(q)
        );
      });
  }, [allItems, orderedIds, search]);

  const move = (idx: number, dir: -1 | 1) => {
    const next = [...orderedIds];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    reorderMutation.mutate(next);
  };

  const exportShowCsv = async () => {
    if (!show) return;
    try {
      await downloadCsv(`/api/shows/${id}/export.csv`, `${show.name || "show"}-${Date.now()}.csv`);
      toast({ title: "CSV exported", description: "Ready to upload to Whatnot." });
    } catch (e: any) {
      toast({ title: "Export failed", description: e.message, variant: "destructive" });
    }
  };

  const exportPackingList = async () => {
    if (!show) return;
    try {
      await downloadCsv(`/api/orders/export.csv?showId=${id}`, `packing-list-${show.name || "show"}-${Date.now()}.csv`);
      toast({ title: "Packing list exported" });
    } catch (e: any) {
      toast({ title: "Export failed", description: e.message, variant: "destructive" });
    }
  };

  if (isLoading || !show) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <div className="py-16 text-center text-muted-foreground">
          <Loader2 className="size-5 animate-spin inline mr-2" />
          Loading show…
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <Link href="/shows">
          <Button data-testid="button-back-to-shows" variant="ghost" size="sm" className="gap-1.5 mb-3 -ml-2">
            <ArrowLeft className="size-4" />
            All shows
          </Button>
        </Link>

        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-6">
          <div>
            <h2
              className="text-2xl sm:text-3xl font-semibold tracking-tight"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              {show.name || "(untitled)"}
            </h2>
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground mt-1">
              <Calendar className="size-3.5" />
              {fmtDate(show.scheduledAt)}
            </div>
            {show.description && (
              <p className="text-sm text-muted-foreground mt-1 max-w-2xl">{show.description}</p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              data-testid="button-add-items"
              variant="outline"
              onClick={() => setAddOpen(true)}
              className="gap-1.5"
            >
              <Plus className="size-4" />
              Add items
            </Button>
            <Button
              data-testid="button-export-show-csv"
              variant="outline"
              onClick={exportShowCsv}
              className="gap-1.5"
              disabled={items.length === 0}
            >
              <Download className="size-4" />
              Whatnot CSV
            </Button>
            <Button
              data-testid="button-export-packing-list"
              variant="outline"
              onClick={exportPackingList}
              className="gap-1.5"
            >
              <ClipboardList className="size-4" />
              Packing list
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <Card className="p-3 sm:p-4">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
              <Package className="size-3.5" />
              Items
            </div>
            <div className="text-xl sm:text-2xl font-semibold mt-1">{items.length}</div>
          </Card>
          <Card className="p-3 sm:p-4">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
              <DollarSign className="size-3.5" />
              Projected
            </div>
            <div className="text-xl sm:text-2xl font-semibold mt-1">{fmtMoney(projectedRevenue)}</div>
          </Card>
          <Card className="p-3 sm:p-4">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
              <DollarSign className="size-3.5" />
              Cost
            </div>
            <div className="text-xl sm:text-2xl font-semibold mt-1">{fmtMoney(totalCost)}</div>
          </Card>
        </div>

        {/* Items list */}
        {items.length === 0 ? (
          <Card className="p-12 text-center">
            <Package className="size-10 mx-auto text-muted-foreground mb-3" />
            <h3 className="text-lg font-semibold">No items queued</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
              Add items from your inventory and arrange them in the order you'll feature them on the show.
            </p>
            <Button onClick={() => setAddOpen(true)} className="mt-4 gap-1.5">
              <Plus className="size-4" />
              Add items
            </Button>
          </Card>
        ) : (
          <div className="grid gap-2">
            {items.map((it, idx) => {
              const imgs = parseImages(it.imagesJson);
              return (
                <Card key={it.id} data-testid={`card-show-item-${it.id}`} className="p-3 sm:p-4">
                  <div className="flex items-center gap-3">
                    {/* Position + reorder */}
                    <div className="flex flex-col items-center gap-0.5 w-10">
                      <Button
                        data-testid={`button-move-up-${it.id}`}
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => move(idx, -1)}
                        disabled={idx === 0 || reorderMutation.isPending}
                        aria-label="Move up"
                      >
                        <ArrowUp className="size-3.5" />
                      </Button>
                      <span className="text-xs font-mono font-semibold text-muted-foreground tabular-nums">
                        {idx + 1}
                      </span>
                      <Button
                        data-testid={`button-move-down-${it.id}`}
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => move(idx, 1)}
                        disabled={idx === items.length - 1 || reorderMutation.isPending}
                        aria-label="Move down"
                      >
                        <ArrowDown className="size-3.5" />
                      </Button>
                    </div>
                    {/* Thumb */}
                    <div className="size-14 sm:size-16 rounded-md overflow-hidden bg-muted shrink-0 border border-border/60">
                      {imgs[0] ? (
                        <img
                          src={resolvePhotoUrl(imgs[0])}
                          alt=""
                          className="size-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="size-full flex items-center justify-center text-muted-foreground">
                          <ImageIcon className="size-5" />
                        </div>
                      )}
                    </div>
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{it.title || "(untitled)"}</div>
                      <div className="text-xs text-muted-foreground truncate font-mono">{it.sku}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {it.category}
                        {it.subCategory ? ` · ${it.subCategory}` : ""}
                      </div>
                    </div>
                    {/* Price */}
                    <div className="text-right hidden sm:block">
                      <div className="text-sm font-semibold tabular-nums">
                        {fmtMoney(it.buyNowPrice || it.price)}
                      </div>
                      <div className="text-xs text-muted-foreground">{it.type}</div>
                    </div>
                    {/* Remove */}
                    <Button
                      data-testid={`button-remove-from-show-${it.id}`}
                      variant="ghost"
                      size="icon"
                      onClick={() => removeMutation.mutate(it.id)}
                      aria-label="Remove from show"
                    >
                      <X className="size-4" />
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </main>

      {/* Add items dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add items to show</DialogTitle>
            <DialogDescription>
              Pick from your active inventory. New items go to the end of the queue — reorder afterwards.
            </DialogDescription>
          </DialogHeader>

          <div className="relative">
            <Search className="size-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              data-testid="input-search-add-items"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by title, SKU, or category…"
              className="pl-9"
            />
          </div>

          <div className="max-h-[420px] overflow-y-auto -mx-6 px-6 divide-y divide-border">
            {candidateItems.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                {allItems.length === 0
                  ? "No items in your inventory yet."
                  : "No matching items available to add."}
              </div>
            ) : (
              candidateItems.map((it) => {
                const imgs = parseImages(it.imagesJson);
                const checked = pickedIds.has(it.id);
                return (
                  <label
                    key={it.id}
                    className="flex items-center gap-3 py-2.5 cursor-pointer hover:bg-muted/30 rounded -mx-2 px-2"
                  >
                    <Checkbox
                      data-testid={`checkbox-add-item-${it.id}`}
                      checked={checked}
                      onCheckedChange={(v) => {
                        const next = new Set(pickedIds);
                        if (v) next.add(it.id);
                        else next.delete(it.id);
                        setPickedIds(next);
                      }}
                    />
                    <div className="size-10 rounded overflow-hidden bg-muted shrink-0">
                      {imgs[0] ? (
                        <img src={resolvePhotoUrl(imgs[0])} alt="" className="size-full object-cover" loading="lazy" />
                      ) : (
                        <div className="size-full flex items-center justify-center text-muted-foreground">
                          <ImageIcon className="size-4" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{it.title || "(untitled)"}</div>
                      <div className="text-xs text-muted-foreground truncate font-mono">{it.sku}</div>
                    </div>
                    <div className="text-sm font-semibold tabular-nums">
                      {fmtMoney(it.buyNowPrice || it.price)}
                    </div>
                  </label>
                );
              })
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button
              data-testid="button-confirm-add-items"
              disabled={pickedIds.size === 0 || addMutation.isPending}
              onClick={() => addMutation.mutate(Array.from(pickedIds))}
            >
              {addMutation.isPending && <Loader2 className="size-4 animate-spin mr-1.5" />}
              Add {pickedIds.size} item{pickedIds.size === 1 ? "" : "s"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
