import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { AppHeader } from "@/components/AppHeader";
import { downloadCsv, parseImages, resolvePhotoUrl } from "@/lib/items";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Search,
  Loader2,
  Plus,
  Trash2,
  Download,
  ClipboardList,
  Image as ImageIcon,
  CheckCircle2,
  Truck,
  X,
  Package,
  ScanLine,
  ChevronDown,
  ChevronUp,
  TrendingUp,
  TrendingDown,
  Receipt,
} from "lucide-react";
import { BarcodeScanner } from "@/components/BarcodeScanner";
import type { Item, Order, Show, BusinessSettings } from "@shared/schema";

function computeFees(
  salePrice: number,
  quantity: number,
  settings: BusinessSettings | undefined,
) {
  const gross = (salePrice || 0) * (quantity || 1);
  const commissionPct = settings?.commissionPct ?? 8;
  const paymentFeePct = settings?.paymentFeePct ?? 2.9;
  const paymentFeeFixed = settings?.paymentFeeFixed ?? 0.3;
  const commission = gross * (commissionPct / 100);
  const paymentFee = gross * (paymentFeePct / 100) + (gross > 0 ? paymentFeeFixed : 0);
  const totalFees = commission + paymentFee;
  return { gross, commission, paymentFee, totalFees };
}

function fmtMoney(n: number) {
  return `$${(n || 0).toFixed(2)}`;
}
function fmtDate(ms: number) {
  if (!ms) return "";
  return new Date(ms).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function OrdersPage() {
  const { toast } = useToast();
  const [skuInput, setSkuInput] = useState("");
  const [lookedUpItem, setLookedUpItem] = useState<Item | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState("");

  // Buyer fields (only meaningful when an item is loaded)
  const [buyerName, setBuyerName] = useState("");
  const [buyerHandle, setBuyerHandle] = useState("");
  const [buyerAddress, setBuyerAddress] = useState("");
  const [salePriceText, setSalePriceText] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [showId, setShowId] = useState<string>("0");
  const [orderNotes, setOrderNotes] = useState("");

  // Filters / list state
  const [filterShowId, setFilterShowId] = useState<string>("all");
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  const { data: settings } = useQuery<BusinessSettings>({
    queryKey: ["/api/settings"],
  });

  const { data: orders = [], isLoading: ordersLoading } = useQuery<Order[]>({
    queryKey: ["/api/orders"],
  });

  const { data: shows = [] } = useQuery<(Show & { itemCount: number })[]>({
    queryKey: ["/api/shows"],
  });

  // When item changes, prime sale price from item
  useEffect(() => {
    if (lookedUpItem) {
      const price = lookedUpItem.buyNowPrice || lookedUpItem.price || 0;
      setSalePriceText(price ? price.toFixed(2) : "");
      setQuantity(1);
    }
  }, [lookedUpItem]);

  const lookupSku = async (sku: string) => {
    const trimmed = sku.trim();
    if (!trimmed) return;
    setLookupLoading(true);
    setLookupError("");
    try {
      const res = await apiRequest("GET", `/api/items/by-sku/${encodeURIComponent(trimmed)}`);
      const item = (await res.json()) as Item;
      setLookedUpItem(item);
      if (item.status === "Sold") {
        toast({
          title: "Heads up",
          description: "This item is already marked Sold. You can still record a duplicate order if needed.",
        });
      }
    } catch (e: any) {
      setLookedUpItem(null);
      setLookupError(e.message || "Item not found");
    } finally {
      setLookupLoading(false);
    }
  };

  const clearForm = () => {
    setSkuInput("");
    setLookedUpItem(null);
    setLookupError("");
    setBuyerName("");
    setBuyerHandle("");
    setBuyerAddress("");
    setSalePriceText("");
    setQuantity(1);
    setShowId("0");
    setOrderNotes("");
  };

  const createOrderMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await apiRequest("POST", "/api/orders", payload);
      return res.json();
    },
    onSuccess: (created: Order & { bundleNote?: string | null }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      const description = created.bundleNote
        ? created.bundleNote
        : created.bundleNumber
          ? `Item marked Sold. Bundle ${created.bundleNumber}.`
          : "Item marked Sold automatically.";
      toast({
        title: `Order ${created.orderNumber} created`,
        description,
      });
      clearForm();
    },
    onError: (err: any) =>
      toast({ title: "Failed to create order", description: err.message, variant: "destructive" }),
  });

  const submitOrder = () => {
    if (!lookedUpItem) {
      toast({ title: "Look up an item first", variant: "destructive" });
      return;
    }
    if (!buyerName.trim() && !buyerHandle.trim()) {
      toast({ title: "Add a buyer name or @handle", variant: "destructive" });
      return;
    }
    const salePrice = Number(salePriceText) || 0;
    createOrderMutation.mutate({
      itemId: lookedUpItem.id,
      showId: Number(showId) || 0,
      itemSku: lookedUpItem.sku,
      itemTitle: lookedUpItem.title,
      buyerName: buyerName.trim(),
      buyerHandle: buyerHandle.trim(),
      buyerAddress: buyerAddress.trim(),
      salePrice,
      quantity,
      packed: 0,
      shipped: 0,
      trackingNumber: "",
      notes: orderNotes,
    });
  };

  const updateOrderMutation = useMutation({
    mutationFn: async ({ id, patch }: { id: number; patch: Partial<Order> }) => {
      const res = await apiRequest("PATCH", `/api/orders/${id}`, patch);
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/orders"] }),
    onError: (err: any) =>
      toast({ title: "Update failed", description: err.message, variant: "destructive" }),
  });

  const deleteOrderMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/orders/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      setDeleteId(null);
      toast({ title: "Order deleted" });
    },
    onError: (err: any) =>
      toast({ title: "Delete failed", description: err.message, variant: "destructive" }),
  });

  const filteredOrders = useMemo(() => {
    let list = orders;
    if (filterShowId !== "all") {
      const sid = Number(filterShowId);
      list = list.filter((o) => o.showId === sid);
    }
    return [...list].sort((a, b) => b.createdAt - a.createdAt);
  }, [orders, filterShowId]);

  const showLookup = useMemo(() => {
    const m = new Map<number, string>();
    shows.forEach((s) => m.set(s.id, s.name));
    return m;
  }, [shows]);

  const totals = useMemo(() => {
    const revenue = filteredOrders.reduce(
      (sum, o) => sum + (o.salePrice || 0) * (o.quantity || 1),
      0,
    );
    const packed = filteredOrders.filter((o) => o.packed).length;
    const shipped = filteredOrders.filter((o) => o.shipped).length;
    return { count: filteredOrders.length, revenue, packed, shipped };
  }, [filteredOrders]);

  const { data: allItems = [] } = useQuery<Item[]>({ queryKey: ["/api/items"] });

  // Group orders into multi-order shipping bundles. Show bundles that have
  // 2+ open (unshipped) orders so the user can see what’s being combined.
  const multiBundles = useMemo(() => {
    const itemMap = new Map(allItems.map((it) => [it.id, it]));
    const groups = new Map<string, Order[]>();
    for (const o of filteredOrders) {
      if (!o.bundleNumber || o.shipped) continue;
      if (!groups.has(o.bundleNumber)) groups.set(o.bundleNumber, []);
      groups.get(o.bundleNumber)!.push(o);
    }
    const out: {
      bundleNumber: string;
      orders: Order[];
      buyerLabel: string;
      totalWeightOz: number;
      totalVolumeIn3: number;
    }[] = [];
    Array.from(groups.entries()).forEach(([bundleNumber, list]) => {
      if (list.length < 2) return;
      const totalWeightOz = list.reduce((s: number, o: Order) => {
        const it = itemMap.get(o.itemId);
        return s + (it?.weightOz || 0);
      }, 0);
      const totalVolumeIn3 = list.reduce((s: number, o: Order) => {
        const it = itemMap.get(o.itemId);
        if (!it) return s;
        return s + (it.lengthIn || 0) * (it.widthIn || 0) * (it.heightIn || 0);
      }, 0);
      const buyerLabel = list[0].buyerName || list[0].buyerHandle || "(buyer)";
      out.push({ bundleNumber, orders: list, buyerLabel, totalWeightOz, totalVolumeIn3 });
    });
    return out.sort((a, b) => b.orders.length - a.orders.length);
  }, [filteredOrders, allItems]);

  const exportPackingList = async () => {
    try {
      const url =
        filterShowId === "all"
          ? "/api/orders/export.csv"
          : `/api/orders/export.csv?showId=${filterShowId}`;
      const filename =
        filterShowId === "all"
          ? `packing-list-${Date.now()}.csv`
          : `packing-list-show-${filterShowId}-${Date.now()}.csv`;
      await downloadCsv(url, filename);
      toast({ title: "Packing list exported" });
    } catch (e: any) {
      toast({ title: "Export failed", description: e.message, variant: "destructive" });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <div className="mb-6">
          <h2
            className="text-2xl sm:text-3xl font-semibold tracking-tight"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            Orders
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Look up an item by SKU, add the buyer, and we'll generate an order number, mark the item Sold, and queue it
            for the packing list.
          </p>
        </div>

        {/* Create order section */}
        <Card className="p-4 sm:p-6 mb-6">
          <h3 className="text-base sm:text-lg font-semibold mb-3 flex items-center gap-2">
            <Plus className="size-4" />
            New order
          </h3>

          {/* Buyer @handle + SKU + Sale price — primary row */}
          <div className="grid sm:grid-cols-[1fr_1.4fr_1fr_auto] gap-2 items-end mb-3">
            <div>
              <Label>Buyer @username</Label>
              <Input
                data-testid="input-buyer-handle"
                value={buyerHandle}
                onChange={(e) => setBuyerHandle(e.target.value)}
                placeholder="@janedoe"
              />
            </div>
            <div>
              <Label>Item SKU</Label>
              <div className="relative">
                <Search className="size-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                <Input
                  data-testid="input-sku-lookup"
                  className="pl-9 pr-20 font-mono"
                  placeholder="CL-20260507-A1B2"
                  value={skuInput}
                  onChange={(e) => setSkuInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") lookupSku(skuInput);
                  }}
                />
                <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                  <Button
                    data-testid="button-open-scanner"
                    variant="ghost"
                    size="icon"
                    type="button"
                    onClick={() => setScannerOpen(true)}
                    className="size-8"
                    aria-label="Scan barcode"
                    title="Scan barcode"
                  >
                    <ScanLine className="size-4 text-primary" />
                  </Button>
                  <Button
                    data-testid="button-lookup-sku"
                    variant="ghost"
                    size="icon"
                    type="button"
                    onClick={() => lookupSku(skuInput)}
                    disabled={!skuInput.trim() || lookupLoading}
                    className="size-8"
                    aria-label="Look up"
                  >
                    {lookupLoading ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Search className="size-4" />
                    )}
                  </Button>
                </div>
              </div>
            </div>
            <div>
              <Label>Sale price</Label>
              <Input
                data-testid="input-sale-price"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={salePriceText}
                onChange={(e) => setSalePriceText(e.target.value)}
              />
            </div>
            <Button
              data-testid="button-create-order"
              onClick={submitOrder}
              disabled={!lookedUpItem || createOrderMutation.isPending}
              className="gap-1.5"
            >
              {createOrderMutation.isPending && <Loader2 className="size-4 animate-spin" />}
              <Plus className="size-4" />
              Create order
            </Button>
          </div>

          {lookupError && (
            <div className="text-sm text-destructive mb-3" data-testid="text-lookup-error">
              {lookupError}
            </div>
          )}

          {/* Item preview + profit preview */}
          {lookedUpItem && (
            <div className="border border-border rounded-lg overflow-hidden mb-2" data-testid="card-lookup-result">
              <div className="flex items-center gap-3 p-3 bg-muted/30">
                <div className="size-14 rounded-md overflow-hidden bg-muted shrink-0">
                  {parseImages(lookedUpItem.imagesJson)[0] ? (
                    <img
                      src={resolvePhotoUrl(parseImages(lookedUpItem.imagesJson)[0])}
                      alt=""
                      className="size-full object-cover"
                    />
                  ) : (
                    <div className="size-full flex items-center justify-center text-muted-foreground">
                      <ImageIcon className="size-5" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{lookedUpItem.title || "(untitled)"}</div>
                  <div className="text-xs text-muted-foreground font-mono">{lookedUpItem.sku}</div>
                  <div className="text-xs text-muted-foreground">
                    {lookedUpItem.category}
                    {lookedUpItem.subCategory ? ` · ${lookedUpItem.subCategory}` : ""}
                    {" · "}
                    <span
                      className={
                        lookedUpItem.status === "Sold"
                          ? "text-amber-600 dark:text-amber-400 font-medium"
                          : "text-emerald-600 dark:text-emerald-400 font-medium"
                      }
                    >
                      {lookedUpItem.status}
                    </span>
                    {" · cost "}
                    <span className="tabular-nums">{fmtMoney(lookedUpItem.sellerCost || 0)}</span>
                  </div>
                </div>
                <Button
                  data-testid="button-clear-lookup"
                  variant="ghost"
                  size="icon"
                  onClick={clearForm}
                  aria-label="Clear"
                >
                  <X className="size-4" />
                </Button>
              </div>

              {/* Profit preview */}
              <ProfitPreview
                salePrice={Number(salePriceText) || 0}
                quantity={quantity}
                itemCost={lookedUpItem.sellerCost || 0}
                settings={settings}
              />
            </div>
          )}

          {/* More options collapsible */}
          <button
            type="button"
            data-testid="button-toggle-more-options"
            onClick={() => setMoreOpen((v) => !v)}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 mt-2"
          >
            {moreOpen ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
            {moreOpen ? "Hide" : "More"} options (name, address, show, notes, qty)
          </button>
          {moreOpen && (
            <div className="mt-3 grid sm:grid-cols-2 gap-3 border-t border-border pt-3">
              <div>
                <Label>Buyer name (optional)</Label>
                <Input
                  data-testid="input-buyer-name"
                  value={buyerName}
                  onChange={(e) => setBuyerName(e.target.value)}
                  placeholder="Jane Doe"
                />
              </div>
              <div>
                <Label>Quantity</Label>
                <Input
                  data-testid="input-quantity"
                  type="number"
                  min={1}
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
                />
              </div>
              <div className="sm:col-span-2">
                <Label>Show (optional)</Label>
                <Select value={showId} onValueChange={setShowId}>
                  <SelectTrigger data-testid="select-show">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">— No show —</SelectItem>
                    {shows.map((s) => (
                      <SelectItem key={s.id} value={String(s.id)}>
                        {s.name || `Show #${s.id}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-2">
                <Label>Buyer address (for shipping)</Label>
                <Textarea
                  data-testid="input-buyer-address"
                  value={buyerAddress}
                  onChange={(e) => setBuyerAddress(e.target.value)}
                  rows={2}
                  placeholder="Street, City, State, ZIP"
                />
              </div>
              <div className="sm:col-span-2">
                <Label>Notes (optional)</Label>
                <Input
                  data-testid="input-order-notes"
                  value={orderNotes}
                  onChange={(e) => setOrderNotes(e.target.value)}
                  placeholder="Gift wrap, fragile, etc."
                />
              </div>
            </div>
          )}
        </Card>

        {/* Bundles overview — only shown when there are multi-order bundles */}
        {multiBundles.length > 0 && (
          <Card className="p-4 sm:p-5 mb-6 border-accent/40 bg-accent/5" data-testid="card-bundles-overview">
            <div className="flex items-center justify-between gap-2 mb-3">
              <h3 className="text-base sm:text-lg font-semibold flex items-center gap-2">
                <Package className="size-4 text-accent-foreground" />
                Smart bundles
              </h3>
              <span className="text-xs text-muted-foreground">
                Auto-grouped ≤ 5 lb / 12×12×12
              </span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {multiBundles.map((b) => {
                const lbs = b.totalWeightOz / 16;
                const weightPct = Math.min(100, (b.totalWeightOz / 80) * 100);
                const volPct = Math.min(100, (b.totalVolumeIn3 / 1728) * 100);
                return (
                  <div
                    key={b.bundleNumber}
                    className="rounded-lg border border-border bg-card p-3"
                    data-testid={`bundle-summary-${b.bundleNumber}`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="font-mono text-xs text-primary font-semibold">
                        {b.bundleNumber}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {b.orders.length} items
                      </span>
                    </div>
                    <div className="text-sm font-medium truncate">{b.buyerLabel}</div>
                    <div className="mt-2 space-y-1.5">
                      <div>
                        <div className="flex justify-between text-[11px] text-muted-foreground mb-0.5">
                          <span>Weight</span>
                          <span className="tabular-nums">{lbs.toFixed(2)} / 5.00 lb</span>
                        </div>
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary rounded-full transition-all"
                            style={{ width: `${weightPct}%` }}
                          />
                        </div>
                      </div>
                      <div>
                        <div className="flex justify-between text-[11px] text-muted-foreground mb-0.5">
                          <span>Box fill</span>
                          <span className="tabular-nums">
                            {Math.round(b.totalVolumeIn3)} / 1728 in³
                          </span>
                        </div>
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-accent rounded-full transition-all"
                            style={{ width: `${volPct}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {/* Orders list header / filters */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-4">
          <div>
            <h3 className="text-base sm:text-lg font-semibold flex items-center gap-2">
              <ClipboardList className="size-4" />
              All orders
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {totals.count} order{totals.count === 1 ? "" : "s"} · {fmtMoney(totals.revenue)} revenue
              {" · "}
              {totals.packed} packed · {totals.shipped} shipped
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={filterShowId} onValueChange={setFilterShowId}>
              <SelectTrigger data-testid="select-filter-show" className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All shows</SelectItem>
                <SelectItem value="0">No show</SelectItem>
                {shows.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    {s.name || `Show #${s.id}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              data-testid="button-export-packing-list"
              variant="outline"
              onClick={exportPackingList}
              className="gap-1.5"
              disabled={filteredOrders.length === 0}
            >
              <Download className="size-4" />
              <span className="hidden sm:inline">Packing list</span>
            </Button>
          </div>
        </div>

        {/* Orders list */}
        {ordersLoading ? (
          <div className="py-12 text-center text-muted-foreground">
            <Loader2 className="size-5 animate-spin inline mr-2" />
            Loading orders…
          </div>
        ) : filteredOrders.length === 0 ? (
          <Card className="p-12 text-center">
            <Package className="size-10 mx-auto text-muted-foreground mb-3" />
            <h3 className="text-lg font-semibold">No orders yet</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
              Look up an item by SKU above and add the buyer to record your first sale.
            </p>
          </Card>
        ) : (
          <div className="grid gap-2">
            {filteredOrders.map((o) => (
              <OrderRow
                key={o.id}
                order={o}
                showName={o.showId > 0 ? showLookup.get(o.showId) : undefined}
                onTogglePacked={(v) => updateOrderMutation.mutate({ id: o.id, patch: { packed: v ? 1 : 0 } })}
                onToggleShipped={(v) => updateOrderMutation.mutate({ id: o.id, patch: { shipped: v ? 1 : 0 } })}
                onTracking={(t) => updateOrderMutation.mutate({ id: o.id, patch: { trackingNumber: t } })}
                onDelete={() => setDeleteId(o.id)}
              />
            ))}
          </div>
        )}
      </main>

      <AlertDialog open={deleteId !== null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this order?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the order record only. The item's status stays as Sold — change it back from the inventory
              page if needed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              data-testid="button-confirm-delete-order"
              onClick={() => deleteId !== null && deleteOrderMutation.mutate(deleteId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <BarcodeScanner
        open={scannerOpen}
        onOpenChange={setScannerOpen}
        onScan={(sku) => {
          setSkuInput(sku);
          lookupSku(sku);
        }}
      />
    </div>
  );
}

function ProfitPreview({
  salePrice,
  quantity,
  itemCost,
  settings,
}: {
  salePrice: number;
  quantity: number;
  itemCost: number;
  settings: BusinessSettings | undefined;
}) {
  const { gross, commission, paymentFee, totalFees } = computeFees(salePrice, quantity, settings);
  const cost = itemCost * (quantity || 1);
  const profitAmt = gross - totalFees - cost;
  const isProfit = profitAmt >= 0;
  const marginPct = gross > 0 ? (profitAmt / gross) * 100 : 0;

  return (
    <div className="p-3 bg-card border-t border-border" data-testid="profit-preview">
      <div className="flex items-center gap-2 mb-2">
        <Receipt className="size-3.5 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Profit preview
        </span>
        <span className="text-[10px] text-muted-foreground">
          ({settings?.commissionPct ?? 8}% commission · {settings?.paymentFeePct ?? 2.9}% + ${(settings?.paymentFeeFixed ?? 0.3).toFixed(2)})
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-sm">
        <div>
          <div className="text-[11px] text-muted-foreground">Gross</div>
          <div className="font-semibold tabular-nums">${gross.toFixed(2)}</div>
        </div>
        <div>
          <div className="text-[11px] text-muted-foreground">Commission</div>
          <div className="tabular-nums text-destructive/80">−${commission.toFixed(2)}</div>
        </div>
        <div>
          <div className="text-[11px] text-muted-foreground">Payment fee</div>
          <div className="tabular-nums text-destructive/80">−${paymentFee.toFixed(2)}</div>
        </div>
        <div>
          <div className="text-[11px] text-muted-foreground">Item cost</div>
          <div className="tabular-nums text-destructive/80">−${cost.toFixed(2)}</div>
        </div>
        <div
          className={`col-span-2 sm:col-span-1 rounded-md px-2 py-1 ${
            isProfit
              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
              : "bg-destructive/10 text-destructive"
          }`}
        >
          <div className="text-[11px] opacity-80 flex items-center gap-1">
            {isProfit ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
            Profit
          </div>
          <div className="font-semibold tabular-nums">
            ${profitAmt.toFixed(2)}
            <span className="text-[10px] opacity-70 ml-1">({marginPct.toFixed(0)}%)</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function OrderRow({
  order,
  showName,
  onTogglePacked,
  onToggleShipped,
  onTracking,
  onDelete,
}: {
  order: Order;
  showName?: string;
  onTogglePacked: (v: boolean) => void;
  onToggleShipped: (v: boolean) => void;
  onTracking: (t: string) => void;
  onDelete: () => void;
}) {
  const [trackingDraft, setTrackingDraft] = useState(order.trackingNumber);
  useEffect(() => setTrackingDraft(order.trackingNumber), [order.trackingNumber]);

  // Fetch the underlying item for thumbnail (shared cache from /api/items)
  const { data: items = [] } = useQuery<Item[]>({ queryKey: ["/api/items"] });
  const item = items.find((it) => it.id === order.itemId);
  const thumb = item ? parseImages(item.imagesJson)[0] : "";

  return (
    <Card data-testid={`card-order-${order.id}`} className="p-3 sm:p-4">
      <div className="flex items-start gap-3">
        <div className="size-14 sm:size-16 rounded-md overflow-hidden bg-muted shrink-0 border border-border/60">
          {thumb ? (
            <img src={resolvePhotoUrl(thumb)} alt="" className="size-full object-cover" loading="lazy" />
          ) : (
            <div className="size-full flex items-center justify-center text-muted-foreground">
              <ImageIcon className="size-5" />
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-mono font-semibold text-primary" data-testid={`text-order-number-${order.id}`}>
              {order.orderNumber}
            </span>
            {order.bundleNumber && (
              <span
                className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-accent/20 text-accent-foreground border border-accent/40 font-mono"
                title={`Bundle ${order.bundleNumber} — ≤5lb / 12×12×12 box`}
                data-testid={`badge-bundle-${order.id}`}
              >
                <Package className="size-2.5 inline -mt-0.5 mr-0.5" />
                {order.bundleNumber.split("-").pop()}
              </span>
            )}
            {showName && (
              <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                {showName}
              </span>
            )}
            <span className="text-xs text-muted-foreground">{fmtDate(order.createdAt)}</span>
          </div>
          <div className="font-medium truncate mt-0.5">{order.itemTitle || "(untitled)"}</div>
          <div className="text-xs text-muted-foreground font-mono">
            Item #{order.itemId} · {order.itemSku}
          </div>
          <div className="text-sm mt-1">
            <span className="font-medium">{order.buyerName || order.buyerHandle || "(no buyer)"}</span>
            {order.buyerHandle && order.buyerName && (
              <span className="text-muted-foreground"> · {order.buyerHandle}</span>
            )}
            <span className="text-muted-foreground"> · </span>
            <span className="font-semibold tabular-nums">{fmtMoney(order.salePrice * (order.quantity || 1))}</span>
            {order.quantity > 1 && (
              <span className="text-muted-foreground text-xs"> ({order.quantity} × {fmtMoney(order.salePrice)})</span>
            )}
          </div>
          {order.buyerAddress && (
            <div className="text-xs text-muted-foreground mt-1 line-clamp-1">📍 {order.buyerAddress}</div>
          )}

          {/* Pack/ship controls */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-2.5">
            <label className="flex items-center gap-1.5 cursor-pointer text-sm">
              <Checkbox
                data-testid={`checkbox-packed-${order.id}`}
                checked={!!order.packed}
                onCheckedChange={(v) => onTogglePacked(!!v)}
              />
              <span className="flex items-center gap-1">
                <CheckCircle2 className="size-3.5" />
                Packed
              </span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer text-sm">
              <Checkbox
                data-testid={`checkbox-shipped-${order.id}`}
                checked={!!order.shipped}
                onCheckedChange={(v) => onToggleShipped(!!v)}
              />
              <span className="flex items-center gap-1">
                <Truck className="size-3.5" />
                Shipped
              </span>
            </label>
            <div className="flex items-center gap-1.5 flex-1 min-w-[180px]">
              <Input
                data-testid={`input-tracking-${order.id}`}
                value={trackingDraft}
                onChange={(e) => setTrackingDraft(e.target.value)}
                onBlur={() => {
                  if (trackingDraft !== order.trackingNumber) onTracking(trackingDraft);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && trackingDraft !== order.trackingNumber) onTracking(trackingDraft);
                }}
                placeholder="Tracking #"
                className="h-8 text-sm"
              />
            </div>
          </div>
        </div>
        <Button
          data-testid={`button-delete-order-${order.id}`}
          variant="ghost"
          size="icon"
          onClick={onDelete}
          aria-label="Delete order"
        >
          <Trash2 className="size-4 text-destructive" />
        </Button>
      </div>
    </Card>
  );
}
