import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Item, InsertItem, Show } from "@shared/schema";
import { AppHeader } from "@/components/AppHeader";
import { parseImages, uploadPhotos, downloadCsv, profit, marginPct, resolvePhotoUrl } from "@/lib/items";
import { printBarcodeLabels, LABEL_FORMATS, saveLabelFormatPref, type LabelFormatId } from "@/lib/barcode";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Barcode } from "@/components/Barcode";
import { BarcodeScanner } from "@/components/BarcodeScanner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Card } from "@/components/ui/card";
import { ToastAction } from "@/components/ui/toast";
import {
  Sparkles,
  Upload,
  Download,
  Pencil,
  Trash2,
  Plus,
  Search,
  Image as ImageIcon,
  Loader2,
  X,
  Package,
  CheckCircle2,
  TrendingUp,
  DollarSign,
  Wallet,
  CalendarPlus,
  Printer,
  ScanLine,
  Eye,
  EyeOff,
} from "lucide-react";

const STATUSES = ["Active", "Sold", "Inactive"] as const;
const TYPES = ["Auction", "Buy It Now", "Giveaway"] as const;
const CONDITIONS = ["New", "Like New", "Excellent", "Very Good", "Good", "Fair", "For Parts"];
export const WHATNOT_CONDITIONS = [
  "",
  "Brand New / Sealed",
  "Mint",
  "Near Mint",
  "Excellent",
  "Very Good",
  "Good",
  "Fair / Played",
  "Poor / For Parts",
  "Pre-owned",
  "Damaged",
];
const CATEGORIES = [
  "Antiques & Collectibles",
  "Coins & Money",
  "Vintage Clothing",
  "Jewelry & Watches",
  "Home & Decor",
  "Glassware & Crystal",
  "Pottery & Porcelain",
  "Fine China",
  "Silver & Silverplate",
  "Toys",
  "Trading Cards",
  "Comics & Manga",
  "Sports Cards",
  "Funko",
  "Vinyl Records",
  "Books",
  "Art",
];
const SHIPPING_PROFILES = [
  "Up to 4 oz",
  "Up to 8 oz",
  "Up to 16 oz",
  "Up to 32 oz",
  "Up to 48 oz",
  "Up to 64 oz",
  "Up to 5 lbs",
  "Up to 10 lbs",
  "Up to 20 lbs",
];

function emptyItem(): InsertItem {
  return {
    title: "",
    description: "",
    category: "Antiques & Collectibles",
    subCategory: "",
    condition: "Good",
    whatnotCondition: "",
    type: "Auction",
    price: 1,
    buyNowPrice: 0,
    sellerCost: 0,
    quantity: 1,
    weightOz: 0,
    lengthIn: 0,
    widthIn: 0,
    heightIn: 0,
    shippingProfile: "Up to 16 oz",
    offerable: 0,
    hazmat: 0,
    sku: "",
    status: "Active",
    notes: "",
    imagesJson: "[]",
  };
}

export default function InventoryPage() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [editingItem, setEditingItem] = useState<Item | "new" | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [addToShowOpen, setAddToShowOpen] = useState(false);

  const { data: items = [], isLoading } = useQuery<Item[]>({
    queryKey: ["/api/items"],
  });

  const filtered = useMemo(() => {
    return items.filter((it) => {
      if (statusFilter !== "all" && it.status !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          it.title.toLowerCase().includes(q) ||
          it.sku.toLowerCase().includes(q) ||
          it.category.toLowerCase().includes(q) ||
          it.description.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [items, search, statusFilter]);

  // Clean up selection when items disappear from filter or get deleted
  useEffect(() => {
    setSelected((cur) => {
      const valid = new Set(filtered.map((i) => i.id));
      const next = new Set<number>();
      cur.forEach((id) => {
        if (valid.has(id)) next.add(id);
      });
      return next.size === cur.size ? cur : next;
    });
  }, [filtered]);

  const stats = useMemo(() => {
    const active = items.filter((i) => i.status === "Active");
    const sold = items.filter((i) => i.status === "Sold");
    const inactive = items.filter((i) => i.status === "Inactive");
    const inventoryValue = active.reduce(
      (s, i) => s + (i.buyNowPrice || i.price) * i.quantity,
      0,
    );
    const soldRevenue = sold.reduce(
      (s, i) => s + (i.buyNowPrice || i.price) * i.quantity,
      0,
    );
    const totalCost = items.reduce((s, i) => s + i.sellerCost * i.quantity, 0);
    const activeCost = active.reduce((s, i) => s + i.sellerCost * i.quantity, 0);
    const soldCost = sold.reduce((s, i) => s + i.sellerCost * i.quantity, 0);
    const projectedProfit = inventoryValue - activeCost;
    const realizedProfit = soldRevenue - soldCost;
    // avg margin % on active items
    const marginItems = active.filter((i) => (i.buyNowPrice || i.price) > 0);
    const avgMargin =
      marginItems.length === 0
        ? 0
        : marginItems.reduce((s, i) => s + marginPct(i), 0) / marginItems.length;
    return {
      total: items.length,
      active: active.length,
      sold: sold.length,
      inactive: inactive.length,
      inventoryValue,
      soldRevenue,
      totalCost,
      projectedProfit,
      realizedProfit,
      avgMargin,
    };
  }, [items]);

  const deleteMut = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/items/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      toast({ title: "Item deleted" });
    },
  });

  const bulkDeleteMut = useMutation({
    mutationFn: async (ids: number[]) => {
      const res = await apiRequest("POST", "/api/items/bulk-delete", { ids });
      return res.json();
    },
    onSuccess: (data: { deleted: number }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/shows"] });
      setSelected(new Set());
      toast({ title: `${data.deleted} item${data.deleted === 1 ? "" : "s"} deleted` });
    },
    onError: (err: any) => {
      toast({ title: "Bulk delete failed", description: err.message, variant: "destructive" });
    },
  });

  const bulkUpdateMut = useMutation({
    mutationFn: async ({ ids, patch }: { ids: number[]; patch: Partial<InsertItem> }) => {
      const res = await apiRequest("PATCH", "/api/items/bulk-update", { ids, patch });
      return res.json();
    },
    onSuccess: (data: { updated: number }, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      const noun = variables.patch.status ? `marked ${variables.patch.status}` : "updated";
      toast({ title: `${data.updated} item${data.updated === 1 ? "" : "s"} ${noun}` });
    },
    onError: (err: any) => {
      toast({ title: "Bulk update failed", description: err.message, variant: "destructive" });
    },
  });

  const handleExport = async (selectionOnly = false) => {
    try {
      let url: string;
      if (selectionOnly && selected.size > 0) {
        url = `/api/items/export.csv?ids=${Array.from(selected).join(",")}`;
      } else {
        const status = statusFilter !== "all" ? statusFilter : "Active";
        url = `/api/items/export.csv?status=${encodeURIComponent(status)}`;
      }
      await downloadCsv(url, `whatnot-inventory-${Date.now()}.csv`);
      toast({ title: "CSV exported", description: "Ready to upload to Whatnot." });
    } catch (err: any) {
      toast({ title: "Export failed", description: err.message, variant: "destructive" });
    }
  };

  const allFilteredSelected = filtered.length > 0 && filtered.every((i) => selected.has(i.id));
  const someFilteredSelected = filtered.some((i) => selected.has(i.id)) && !allFilteredSelected;
  const toggleAll = () => {
    if (allFilteredSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((i) => i.id)));
    }
  };
  const toggleOne = (id: number) => {
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard icon={<Package className="size-4" />} label="Total items" value={stats.total} />
          <StatCard
            icon={<Sparkles className="size-4 text-primary" />}
            label="Active"
            value={`${stats.active} · $${stats.inventoryValue.toFixed(0)}`}
            accent
          />
          <StatCard
            icon={<TrendingUp className="size-4" />}
            label="Projected profit"
            value={`$${stats.projectedProfit.toFixed(0)}`}
            sub={`${stats.avgMargin.toFixed(0)}% avg margin`}
          />
          <StatCard
            icon={<CheckCircle2 className="size-4" />}
            label="Realized profit"
            value={`$${stats.realizedProfit.toFixed(0)}`}
            sub={`${stats.sold} sold`}
          />
        </div>

        {/* Cost row (smaller) */}
        <div className="grid grid-cols-3 gap-3 -mt-3">
          <CompactStat icon={<Wallet className="size-3.5" />} label="Total cost basis" value={`$${stats.totalCost.toFixed(2)}`} />
          <CompactStat icon={<DollarSign className="size-3.5" />} label="Sold revenue" value={`$${stats.soldRevenue.toFixed(2)}`} />
          <CompactStat icon={<Package className="size-3.5" />} label="Inactive" value={String(stats.inactive)} />
        </div>

        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
          <div className="relative flex-1">
            <Search className="size-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <Input
              data-testid="input-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by title, SKU, or category..."
              className="pl-9 pr-10"
            />
            <Button
              data-testid="button-open-scanner"
              variant="ghost"
              size="icon"
              type="button"
              onClick={() => setScannerOpen(true)}
              className="absolute right-1 top-1/2 -translate-y-1/2 size-8"
              aria-label="Scan barcode"
              title="Scan barcode"
            >
              <ScanLine className="size-4 text-primary" />
            </Button>
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger data-testid="select-status-filter" className="sm:w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button data-testid="button-export-csv" variant="outline" onClick={() => handleExport(false)}>
            <Download className="size-4 mr-1.5" />
            Export CSV
          </Button>
          <Button data-testid="button-new-item" onClick={() => setEditingItem("new")}>
            <Plus className="size-4 mr-1.5" />
            New listing
          </Button>
        </div>

        {/* Bulk action bar */}
        {selected.size > 0 && (
          <Card className="p-3 flex flex-col sm:flex-row sm:items-center gap-2 border-primary/40 bg-primary/5">
            <div className="text-sm font-medium flex-1" data-testid="text-bulk-count">
              {selected.size} selected
            </div>
            <div className="flex flex-wrap gap-2">
              <Select
                onValueChange={(v) => {
                  bulkUpdateMut.mutate({ ids: Array.from(selected), patch: { status: v } });
                }}
              >
                <SelectTrigger data-testid="select-bulk-status" className="h-9 w-[140px]">
                  <SelectValue placeholder="Set status..." />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      Mark {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                data-testid="button-bulk-add-show"
                size="sm"
                variant="outline"
                onClick={() => setAddToShowOpen(true)}
              >
                <CalendarPlus className="size-4 mr-1.5" />
                Add to show
              </Button>
              <Button
                data-testid="button-bulk-export"
                size="sm"
                variant="outline"
                onClick={() => handleExport(true)}
              >
                <Download className="size-4 mr-1.5" />
                Export selected
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    data-testid="button-bulk-print-barcodes"
                    size="sm"
                    variant="outline"
                  >
                    <Printer className="size-4 mr-1.5" />
                    Print barcodes
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-72">
                  <DropdownMenuLabel>Choose label format</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {Object.values(LABEL_FORMATS).map((fmt) => (
                    <DropdownMenuItem
                      key={fmt.id}
                      data-testid={`print-format-${fmt.id}`}
                      onClick={() => {
                        saveLabelFormatPref(fmt.id as LabelFormatId);
                        const selectedItems = items.filter((it) => selected.has(it.id));
                        printBarcodeLabels(selectedItems, fmt.id as LabelFormatId);
                      }}
                      className="flex flex-col items-start gap-0.5 py-2"
                    >
                      <div className="font-medium text-sm">{fmt.name}</div>
                      <div className="text-xs text-muted-foreground">{fmt.description}</div>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                data-testid="button-bulk-delete"
                size="sm"
                variant="destructive"
                onClick={() => setBulkDeleteOpen(true)}
              >
                <Trash2 className="size-4 mr-1.5" />
                Delete
              </Button>
              <Button
                data-testid="button-bulk-clear"
                size="sm"
                variant="ghost"
                onClick={() => setSelected(new Set())}
              >
                Clear
              </Button>
            </div>
          </Card>
        )}

        {/* Table / Cards */}
        {isLoading ? (
          <Card className="p-12 flex items-center justify-center">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </Card>
        ) : filtered.length === 0 ? (
          <EmptyState onCreate={() => setEditingItem("new")} hasItems={items.length > 0} />
        ) : (
          <ItemsTable
            items={filtered}
            selected={selected}
            allSelected={allFilteredSelected}
            someSelected={someFilteredSelected}
            onToggleAll={toggleAll}
            onToggleOne={toggleOne}
            onEdit={(it) => setEditingItem(it)}
            onDelete={(id) => setDeleteId(id)}
          />
        )}
      </main>

      {editingItem && (
        <ItemEditor
          item={editingItem === "new" ? null : editingItem}
          onClose={() => setEditingItem(null)}
        />
      )}

      <AlertDialog open={deleteId !== null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this item?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the listing from your inventory.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              data-testid="button-confirm-delete"
              onClick={() => {
                if (deleteId !== null) deleteMut.mutate(deleteId);
                setDeleteId(null);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selected.size} item{selected.size === 1 ? "" : "s"}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes all selected listings and pulls them from any shows they're in.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              data-testid="button-confirm-bulk-delete"
              onClick={() => {
                bulkDeleteMut.mutate(Array.from(selected));
                setBulkDeleteOpen(false);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete {selected.size}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {addToShowOpen && (
        <AddToShowDialog
          itemIds={Array.from(selected)}
          onClose={() => setAddToShowOpen(false)}
          onAdded={() => {
            setSelected(new Set());
            setAddToShowOpen(false);
          }}
        />
      )}

      <BarcodeScanner
        open={scannerOpen}
        onOpenChange={setScannerOpen}
        onScan={(sku) => {
          setSearch(sku);
          toast({ title: "Scanned", description: sku });
        }}
      />
    </div>
  );
}

// ----- StatCard -----
function StatCard({
  icon,
  label,
  value,
  accent = false,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  accent?: boolean;
  sub?: string;
}) {
  return (
    <Card className={`p-4 ${accent ? "border-primary/30" : ""}`}>
      <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium">
        {icon}
        <span>{label}</span>
      </div>
      <div
        className="mt-2 text-xl font-semibold tracking-tight"
        data-testid={`stat-${label.replace(/\s/g, "-").toLowerCase()}`}
      >
        {value}
      </div>
      {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
    </Card>
  );
}

function CompactStat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2 text-xs px-3 py-2 rounded-md border border-border bg-card/40">
      <span className="text-muted-foreground">{icon}</span>
      <span className="text-muted-foreground truncate">{label}</span>
      <span className="ml-auto font-medium">{value}</span>
    </div>
  );
}

// ----- Empty state -----
function EmptyState({ onCreate, hasItems }: { onCreate: () => void; hasItems: boolean }) {
  return (
    <Card className="p-12 sm:p-16 flex flex-col items-center text-center">
      <div className="size-14 rounded-full bg-primary/10 flex items-center justify-center mb-4">
        <Sparkles className="size-7 text-primary" />
      </div>
      <h3 className="text-lg font-semibold mb-1.5" style={{ fontFamily: "var(--font-serif)" }}>
        {hasItems ? "No items match your filters" : "Start your first AI-generated listing"}
      </h3>
      <p className="text-sm text-muted-foreground max-w-sm mb-5">
        {hasItems
          ? "Try clearing the search or status filter."
          : "Upload a few photos of your item — AI drafts the title, description, pricing, category, and SKU. You review, save, and export to Whatnot."}
      </p>
      {!hasItems && (
        <Button data-testid="button-empty-create" onClick={onCreate}>
          <Plus className="size-4 mr-1.5" />
          Create your first listing
        </Button>
      )}
    </Card>
  );
}

// ----- Items table -----
function ItemsTable({
  items,
  selected,
  allSelected,
  someSelected,
  onToggleAll,
  onToggleOne,
  onEdit,
  onDelete,
}: {
  items: Item[];
  selected: Set<number>;
  allSelected: boolean;
  someSelected: boolean;
  onToggleAll: () => void;
  onToggleOne: (id: number) => void;
  onEdit: (it: Item) => void;
  onDelete: (id: number) => void;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
              <th className="w-10 px-4 py-3">
                <Checkbox
                  data-testid="checkbox-select-all"
                  checked={allSelected ? true : someSelected ? "indeterminate" : false}
                  onCheckedChange={onToggleAll}
                  aria-label="Select all"
                />
              </th>
              <th className="text-left font-medium px-4 py-3">Item</th>
              <th className="text-left font-medium px-4 py-3 hidden md:table-cell">SKU</th>
              <th className="text-left font-medium px-4 py-3 hidden lg:table-cell">Category</th>
              <th className="text-left font-medium px-4 py-3">Price</th>
              <th className="text-left font-medium px-4 py-3 hidden lg:table-cell">Profit</th>
              <th className="text-left font-medium px-4 py-3 hidden md:table-cell">Qty</th>
              <th className="text-left font-medium px-4 py-3">Status</th>
              <th className="text-left font-medium px-4 py-3 hidden md:table-cell">Shop</th>
              <th className="text-right font-medium px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <ItemRow
                key={it.id}
                item={it}
                selected={selected.has(it.id)}
                onToggle={() => onToggleOne(it.id)}
                onEdit={() => onEdit(it)}
                onDelete={() => onDelete(it.id)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function WebVisibleToggle({ item }: { item: Item }) {
  const { toast } = useToast();
  const visible = item.webVisible === 1;
  const mut = useMutation({
    mutationFn: async (next: boolean) => {
      const res = await apiRequest("PATCH", `/api/items/${item.id}/web`, {
        webVisible: next ? 1 : 0,
      });
      return res.json();
    },
    onSuccess: (_data, next) => {
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      toast({
        title: next ? "Visible on shop" : "Hidden from shop",
        description: item.title || `Item #${item.id}`,
      });
    },
    onError: (err: any) => {
      toast({ title: "Update failed", description: err.message, variant: "destructive" });
    },
  });
  return (
    <div className="flex items-center gap-2">
      <Switch
        data-testid={`switch-web-visible-${item.id}`}
        checked={visible}
        disabled={mut.isPending}
        onCheckedChange={(v) => mut.mutate(v)}
        aria-label="Toggle shop visibility"
      />
      {visible ? (
        <Eye className="size-3.5 text-emerald-700 dark:text-emerald-400" />
      ) : (
        <EyeOff className="size-3.5 text-muted-foreground" />
      )}
    </div>
  );
}

function ItemRow({
  item,
  selected,
  onToggle,
  onEdit,
  onDelete,
}: {
  item: Item;
  selected: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const images = parseImages(item.imagesJson);
  const thumb = images[0];
  const p = profit(item);
  const m = marginPct(item);
  const profitClass = p > 0 ? "text-emerald-700 dark:text-emerald-400" : p < 0 ? "text-destructive" : "text-muted-foreground";
  return (
    <tr
      className={`border-b border-border last:border-0 hover-elevate ${selected ? "bg-primary/5" : ""}`}
      data-testid={`row-item-${item.id}`}
    >
      <td className="px-4 py-3 align-middle">
        <Checkbox
          data-testid={`checkbox-item-${item.id}`}
          checked={selected}
          onCheckedChange={onToggle}
          aria-label={`Select ${item.title || "item"}`}
        />
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="size-12 rounded-md bg-muted shrink-0 overflow-hidden flex items-center justify-center">
            {thumb ? (
              <img src={resolvePhotoUrl(thumb)} alt="" className="w-full h-full object-cover" />
            ) : (
              <ImageIcon className="size-5 text-muted-foreground" />
            )}
          </div>
          <div className="min-w-0">
            <div className="font-medium truncate max-w-[12rem] sm:max-w-xs" data-testid={`text-title-${item.id}`}>
              {item.title || "Untitled"}
            </div>
            <div className="text-xs text-muted-foreground truncate max-w-[12rem] sm:max-w-xs">
              {item.condition} · {item.type}
            </div>
          </div>
        </div>
      </td>
      <td className="px-4 py-3 hidden md:table-cell font-mono text-xs text-muted-foreground">{item.sku}</td>
      <td className="px-4 py-3 hidden lg:table-cell text-muted-foreground">{item.category}</td>
      <td className="px-4 py-3">
        <div className="font-medium">${item.price.toFixed(2)}</div>
        {item.buyNowPrice > 0 && (
          <div className="text-xs text-muted-foreground">BIN ${item.buyNowPrice.toFixed(2)}</div>
        )}
      </td>
      <td className="px-4 py-3 hidden lg:table-cell">
        <div className={`font-medium ${profitClass}`} data-testid={`text-profit-${item.id}`}>
          ${p.toFixed(2)}
        </div>
        <div className="text-xs text-muted-foreground">{m.toFixed(0)}%</div>
      </td>
      <td className="px-4 py-3 hidden md:table-cell">{item.quantity}</td>
      <td className="px-4 py-3">
        <StatusBadge status={item.status} />
      </td>
      <td className="px-4 py-3 hidden md:table-cell">
        <WebVisibleToggle item={item} />
      </td>
      <td className="px-4 py-3 text-right">
        <div className="inline-flex gap-1">
          <Button
            data-testid={`button-print-barcode-${item.id}`}
            variant="ghost"
            size="icon"
            onClick={() => printBarcodeLabels([item])}
            aria-label="Print barcode"
            title="Print barcode label"
          >
            <Printer className="size-4" />
          </Button>
          <Button data-testid={`button-edit-${item.id}`} variant="ghost" size="icon" onClick={onEdit} aria-label="Edit">
            <Pencil className="size-4" />
          </Button>
          <Button data-testid={`button-delete-${item.id}`} variant="ghost" size="icon" onClick={onDelete} aria-label="Delete">
            <Trash2 className="size-4" />
          </Button>
        </div>
      </td>
    </tr>
  );
}

function StatusBadge({ status }: { status: string }) {
  const variant = status === "Active" ? "default" : status === "Sold" ? "secondary" : "outline";
  return (
    <Badge variant={variant as any} data-testid={`badge-status-${status.toLowerCase()}`}>
      {status}
    </Badge>
  );
}

// ----- Add-to-show dialog -----
function AddToShowDialog({
  itemIds,
  onClose,
  onAdded,
}: {
  itemIds: number[];
  onClose: () => void;
  onAdded: () => void;
}) {
  const { toast } = useToast();
  const [selectedShow, setSelectedShow] = useState<string>("");
  const [creatingNew, setCreatingNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDate, setNewDate] = useState("");

  const { data: shows = [] } = useQuery<(Show & { itemCount: number })[]>({
    queryKey: ["/api/shows"],
  });

  const addMut = useMutation({
    mutationFn: async (showId: number) => {
      await apiRequest("POST", `/api/shows/${showId}/items`, { itemIds });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/shows"] });
      toast({ title: `${itemIds.length} item${itemIds.length === 1 ? "" : "s"} added to show` });
      onAdded();
    },
    onError: (err: any) => {
      toast({ title: "Add failed", description: err.message, variant: "destructive" });
    },
  });

  const createMut = useMutation({
    mutationFn: async () => {
      const scheduledAt = newDate ? new Date(newDate).getTime() : 0;
      const res = await apiRequest("POST", "/api/shows", {
        name: newName,
        scheduledAt,
        description: "",
      });
      const show = (await res.json()) as Show;
      await apiRequest("POST", `/api/shows/${show.id}/items`, { itemIds });
      return show;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/shows"] });
      toast({ title: `Show created with ${itemIds.length} item${itemIds.length === 1 ? "" : "s"}` });
      onAdded();
    },
    onError: (err: any) => {
      toast({ title: "Create failed", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle style={{ fontFamily: "var(--font-serif)" }}>Add {itemIds.length} item{itemIds.length === 1 ? "" : "s"} to a show</DialogTitle>
          <DialogDescription>Pick a show to plan, or create a new one.</DialogDescription>
        </DialogHeader>

        {!creatingNew ? (
          <div className="space-y-4">
            {shows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No shows yet — create one below.</p>
            ) : (
              <div className="space-y-2">
                <Label className="text-xs font-medium">Existing show</Label>
                <Select value={selectedShow} onValueChange={setSelectedShow}>
                  <SelectTrigger data-testid="select-target-show">
                    <SelectValue placeholder="Select a show..." />
                  </SelectTrigger>
                  <SelectContent>
                    {shows.map((s) => (
                      <SelectItem key={s.id} value={String(s.id)}>
                        {s.name || `Show #${s.id}`}
                        {s.scheduledAt
                          ? ` · ${new Date(s.scheduledAt).toLocaleDateString()}`
                          : ""}
                        {" · "}
                        {s.itemCount} items
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <Button
              data-testid="button-create-new-show"
              variant="outline"
              size="sm"
              onClick={() => setCreatingNew(true)}
              className="w-full"
            >
              <Plus className="size-4 mr-1.5" />
              Create a new show
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <Label className="text-xs font-medium">Show name</Label>
              <Input
                data-testid="input-new-show-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Friday Night Antiques Drop"
                className="mt-1.5"
              />
            </div>
            <div>
              <Label className="text-xs font-medium">Scheduled date (optional)</Label>
              <Input
                data-testid="input-new-show-date"
                type="datetime-local"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                className="mt-1.5"
              />
            </div>
            <Button
              data-testid="button-back-to-existing"
              variant="ghost"
              size="sm"
              onClick={() => setCreatingNew(false)}
            >
              ← Pick existing show
            </Button>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          {!creatingNew ? (
            <Button
              data-testid="button-confirm-add-show"
              disabled={!selectedShow || addMut.isPending}
              onClick={() => addMut.mutate(Number(selectedShow))}
            >
              {addMut.isPending && <Loader2 className="size-4 mr-2 animate-spin" />}
              Add to show
            </Button>
          ) : (
            <Button
              data-testid="button-confirm-create-show"
              disabled={!newName.trim() || createMut.isPending}
              onClick={() => createMut.mutate()}
            >
              {createMut.isPending && <Loader2 className="size-4 mr-2 animate-spin" />}
              Create show & add items
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ----- Item editor (create + edit) -----
function ItemEditor({ item, onClose }: { item: Item | null; onClose: () => void }) {
  const isNew = item === null;
  const { toast } = useToast();

  const [form, setForm] = useState<InsertItem>(() => {
    if (item) {
      const { id, userId, createdAt, ...rest } = item;
      return rest;
    }
    return emptyItem();
  });
  const [images, setImages] = useState<string[]>(() => (item ? parseImages(item.imagesJson) : []));
  const [generating, setGenerating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [aiNotes, setAiNotes] = useState<string>("");
  const fileRef = useRef<HTMLInputElement>(null);

  // sync images into form
  useEffect(() => {
    setForm((f) => ({ ...f, imagesJson: JSON.stringify(images) }));
  }, [images]);

  const update = <K extends keyof InsertItem>(key: K, value: InsertItem[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
  };

  const saveMut = useMutation({
    mutationFn: async () => {
      if (isNew) {
        const res = await apiRequest("POST", "/api/items", form);
        return res.json();
      } else {
        const res = await apiRequest("PATCH", `/api/items/${item!.id}`, form);
        return res.json();
      }
    },
    onSuccess: (saved: Item) => {
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      const sku = saved?.sku || form.sku;
      const title = saved?.title || form.title || "";
      toast({
        title: isNew ? "Listing saved" : "Listing updated",
        description: sku ? `SKU ${sku}` : undefined,
        action: sku ? (
          <ToastAction
            altText="Print barcode"
            onClick={() => printBarcodeLabels([{ sku, title }])}
          >
            Print barcode
          </ToastAction>
        ) : undefined,
      });
      onClose();
    },
    onError: (err: any) => {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    },
  });

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const remaining = 8 - images.length;
    const toAdd = Array.from(files).slice(0, remaining);
    setUploading(true);
    try {
      const urls = await uploadPhotos(toAdd);
      setImages((cur) => [...cur, ...urls]);
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const removeImage = (idx: number) => setImages((cur) => cur.filter((_, i) => i !== idx));

  const generateWithAI = async () => {
    if (images.length === 0) {
      toast({ title: "Add at least one photo", description: "AI needs photos to analyze.", variant: "destructive" });
      return;
    }
    setGenerating(true);
    try {
      const res = await apiRequest("POST", "/api/ai/generate", { images });
      const data = await res.json();
      setForm((f) => ({
        ...f,
        title: data.title || f.title,
        description: data.description || f.description,
        category: data.category || f.category,
        subCategory: data.subCategory || f.subCategory,
        condition: data.condition || f.condition,
        whatnotCondition: data.whatnotCondition || f.whatnotCondition,
        price: typeof data.startingBid === "number" ? data.startingBid : f.price,
        buyNowPrice: typeof data.buyNowPrice === "number" ? data.buyNowPrice : f.buyNowPrice,
        shippingProfile: data.suggestedShippingProfile || f.shippingProfile,
        weightOz: typeof data.estimatedWeightOz === "number" ? data.estimatedWeightOz : f.weightOz,
        lengthIn: typeof data.estimatedLengthIn === "number" ? data.estimatedLengthIn : f.lengthIn,
        widthIn: typeof data.estimatedWidthIn === "number" ? data.estimatedWidthIn : f.widthIn,
        heightIn: typeof data.estimatedHeightIn === "number" ? data.estimatedHeightIn : f.heightIn,
        sku: f.sku || data.sku || "",
      }));
      setAiNotes(data.marketNotes || "");
      toast({ title: "AI listing generated", description: "Review the fields and edit anything before saving." });
    } catch (err: any) {
      toast({ title: "AI generation failed", description: err.message, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  // computed margin for the editor
  const editorProfit =
    ((form.buyNowPrice || form.price || 0) - (form.sellerCost || 0)) * (form.quantity || 1);
  const editorMargin =
    (form.buyNowPrice || form.price || 0) > 0
      ? (((form.buyNowPrice || form.price || 0) - (form.sellerCost || 0)) /
          (form.buyNowPrice || form.price || 0)) *
        100
      : 0;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle style={{ fontFamily: "var(--font-serif)" }}>
            {isNew ? "New listing" : "Edit listing"}
          </DialogTitle>
          <DialogDescription>
            {isNew
              ? "Upload photos, generate with AI, then review the details."
              : "Update any field. Changes save when you click Save."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Photos */}
          <section className="space-y-2">
            <Label>Photos ({images.length}/8)</Label>
            <div className="flex flex-wrap gap-2">
              {images.map((src, i) => (
                <div key={i} className="relative size-20 sm:size-24 rounded-md overflow-hidden border border-border group">
                  <img src={resolvePhotoUrl(src)} alt={`Item photo ${i + 1}`} className="w-full h-full object-cover" />
                  <button
                    data-testid={`button-remove-image-${i}`}
                    type="button"
                    onClick={() => removeImage(i)}
                    className="absolute top-1 right-1 size-5 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                    aria-label="Remove image"
                  >
                    <X className="size-3" />
                  </button>
                </div>
              ))}
              {images.length < 8 && (
                <button
                  data-testid="button-add-photos"
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="size-20 sm:size-24 rounded-md border-2 border-dashed border-border flex flex-col items-center justify-center gap-1 text-muted-foreground hover-elevate text-xs disabled:opacity-50"
                >
                  {uploading ? <Loader2 className="size-5 animate-spin" /> : <Upload className="size-5" />}
                  <span>{uploading ? "Uploading" : "Add"}</span>
                </button>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  handleFiles(e.target.files);
                  if (fileRef.current) fileRef.current.value = "";
                }}
              />
            </div>
            <Button
              type="button"
              data-testid="button-generate-ai"
              onClick={generateWithAI}
              disabled={generating || images.length === 0 || uploading}
              className="w-full sm:w-auto"
            >
              {generating ? (
                <>
                  <Loader2 className="size-4 mr-2 animate-spin" />
                  Analyzing photos...
                </>
              ) : (
                <>
                  <Sparkles className="size-4 mr-2" />
                  Generate listing with AI
                </>
              )}
            </Button>
            {aiNotes && (
              <p className="text-xs text-muted-foreground italic border-l-2 border-primary/40 pl-3" data-testid="text-ai-notes">
                AI pricing notes: {aiNotes}
              </p>
            )}
          </section>

          {/* Listing core */}
          <section className="space-y-3">
            <Field label="Title">
              <Input data-testid="input-title" value={form.title} onChange={(e) => update("title", e.target.value)} />
            </Field>
            <Field label="Description">
              <Textarea
                data-testid="input-description"
                rows={4}
                value={form.description}
                onChange={(e) => update("description", e.target.value)}
              />
            </Field>
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Category">
                <Select value={form.category} onValueChange={(v) => update("category", v)}>
                  <SelectTrigger data-testid="select-category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Sub-category">
                <Input
                  data-testid="input-subcategory"
                  value={form.subCategory}
                  onChange={(e) => update("subCategory", e.target.value)}
                  placeholder="e.g. Crystal, Bone China"
                />
              </Field>
              <Field label="Condition">
                <Select value={form.condition} onValueChange={(v) => update("condition", v)}>
                  <SelectTrigger data-testid="select-condition">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CONDITIONS.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Whatnot condition">
                <Select
                  value={form.whatnotCondition || "none"}
                  onValueChange={(v) => update("whatnotCondition", v === "none" ? "" : v)}
                >
                  <SelectTrigger data-testid="select-whatnot-condition">
                    <SelectValue placeholder="Use AI to suggest" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Not set —</SelectItem>
                    {WHATNOT_CONDITIONS.filter((c) => c).map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Type">
                <Select value={form.type} onValueChange={(v) => update("type", v)}>
                  <SelectTrigger data-testid="select-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </section>

          {/* Pricing */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold tracking-tight text-muted-foreground uppercase">Pricing & inventory</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <Field label={form.type === "Auction" ? "Starting bid ($)" : "Price ($)"}>
                <Input
                  data-testid="input-price"
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.price}
                  onChange={(e) => update("price", parseFloat(e.target.value) || 0)}
                />
              </Field>
              <Field label="Buy Now ($)">
                <Input
                  data-testid="input-buynow"
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.buyNowPrice}
                  onChange={(e) => update("buyNowPrice", parseFloat(e.target.value) || 0)}
                />
              </Field>
              <Field label="Seller cost ($)">
                <Input
                  data-testid="input-cost"
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.sellerCost}
                  onChange={(e) => update("sellerCost", parseFloat(e.target.value) || 0)}
                />
              </Field>
              <Field label="Quantity">
                <Input
                  data-testid="input-quantity"
                  type="number"
                  min="1"
                  value={form.quantity}
                  onChange={(e) => update("quantity", parseInt(e.target.value) || 1)}
                />
              </Field>
              <Field label="Weight (oz)">
                <Input
                  data-testid="input-weight"
                  type="number"
                  step="0.1"
                  min="0"
                  value={form.weightOz}
                  onChange={(e) => update("weightOz", parseFloat(e.target.value) || 0)}
                />
              </Field>
              <Field label="Length (in)">
                <Input
                  data-testid="input-length"
                  type="number"
                  step="0.1"
                  min="0"
                  value={form.lengthIn}
                  onChange={(e) => update("lengthIn", parseFloat(e.target.value) || 0)}
                />
              </Field>
              <Field label="Width (in)">
                <Input
                  data-testid="input-width"
                  type="number"
                  step="0.1"
                  min="0"
                  value={form.widthIn}
                  onChange={(e) => update("widthIn", parseFloat(e.target.value) || 0)}
                />
              </Field>
              <Field label="Height (in)">
                <Input
                  data-testid="input-height"
                  type="number"
                  step="0.1"
                  min="0"
                  value={form.heightIn}
                  onChange={(e) => update("heightIn", parseFloat(e.target.value) || 0)}
                />
              </Field>
              <Field label="Shipping profile">
                <Select value={form.shippingProfile} onValueChange={(v) => update("shippingProfile", v)}>
                  <SelectTrigger data-testid="select-shipping">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {SHIPPING_PROFILES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            {/* Profit summary */}
            <div className="flex items-center gap-3 px-3 py-2 rounded-md bg-muted/40 border border-border text-sm">
              <TrendingUp className="size-4 text-muted-foreground" />
              <span className="text-muted-foreground">Projected profit</span>
              <span
                className={`ml-auto font-semibold ${editorProfit > 0 ? "text-emerald-700 dark:text-emerald-400" : editorProfit < 0 ? "text-destructive" : ""}`}
                data-testid="text-editor-profit"
              >
                ${editorProfit.toFixed(2)}
              </span>
              <span className="text-xs text-muted-foreground tabular-nums">{editorMargin.toFixed(0)}% margin</span>
            </div>
          </section>

          {/* Meta */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold tracking-tight text-muted-foreground uppercase">Listing meta</h3>
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="SKU">
                <Input data-testid="input-sku" value={form.sku} onChange={(e) => update("sku", e.target.value)} placeholder="Auto-generated if blank" />
                {form.sku && (
                  <div className="mt-2 flex items-center gap-3 rounded-md border border-border bg-muted/30 p-2">
                    <Barcode value={form.sku} height={36} />
                    <Button
                      type="button"
                      data-testid="button-modal-print-barcode"
                      size="sm"
                      variant="outline"
                      onClick={() => printBarcodeLabels([{ sku: form.sku || "", title: form.title || "" }])}
                    >
                      <Printer className="size-3.5 mr-1.5" />
                      Print
                    </Button>
                  </div>
                )}
              </Field>
              <Field label="Status">
                <Select value={form.status} onValueChange={(v) => update("status", v)}>
                  <SelectTrigger data-testid="select-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <ToggleField
                label="Accept offers"
                checked={!!form.offerable}
                onChange={(v) => update("offerable", v ? 1 : 0)}
                testId="toggle-offerable"
              />
              <ToggleField
                label="Contains hazmat"
                checked={!!form.hazmat}
                onChange={(v) => update("hazmat", v ? 1 : 0)}
                testId="toggle-hazmat"
              />
            </div>
            <Field label="Internal notes (not exported)">
              <Textarea
                data-testid="input-notes"
                rows={2}
                value={form.notes}
                onChange={(e) => update("notes", e.target.value)}
              />
            </Field>
          </section>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} data-testid="button-cancel">
            Cancel
          </Button>
          <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending} data-testid="button-save">
            {saveMut.isPending ? <Loader2 className="size-4 mr-2 animate-spin" /> : null}
            {isNew ? "Save listing" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium">{label}</Label>
      {children}
    </div>
  );
}

function ToggleField({
  label,
  checked,
  onChange,
  testId,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  testId: string;
}) {
  return (
    <label className="flex items-center justify-between rounded-md border border-border px-3 py-2 cursor-pointer hover-elevate">
      <span className="text-sm">{label}</span>
      <input
        data-testid={testId}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 accent-primary"
      />
    </label>
  );
}
