import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, ShoppingBag, Truck, FileText } from "lucide-react";
import { ShippingLabelDialog } from "@/components/ShippingLabelDialog";

type ShopOrder = {
  id: number;
  orderNumber: string;
  customerId: number;
  customerName: string;
  customerEmail: string;
  itemsJson: string;
  subtotal: number;
  shippingTotal: number;
  total: number;
  pointsRedeemed: number;
  pointsEarned: number;
  paymentStatus: string;
  fulfillmentStatus: string;
  trackingNumber: string;
  shippingAddress: string;
  labelUrl?: string;
  carrier?: string;
  serviceLevel?: string;
  createdAt: number;
};

const STATUSES = ["new", "processing", "shipped", "delivered", "cancelled"];

function StatusBadge({ s }: { s: string }) {
  const map: Record<string, string> = {
    new: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200",
    processing: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
    shipped: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
    delivered: "bg-green-100 text-green-900 dark:bg-green-900/40 dark:text-green-200",
    cancelled: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
  };
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${map[s] || "bg-muted"}`}>{s}</span>
  );
}

export default function ShopOrdersPage() {
  const { toast } = useToast();
  const [trackingDrafts, setTrackingDrafts] = useState<Record<number, string>>({});
  const [labelDialogOrderId, setLabelDialogOrderId] = useState<number | null>(null);
  const { data: orders = [], isLoading } = useQuery<ShopOrder[]>({
    queryKey: ["/api/shop/admin/orders"],
  });

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: number; patch: any }) => {
      const res = await apiRequest("PATCH", `/api/shop/admin/orders/${id}`, patch);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/shop/admin/orders"] });
      toast({ description: "Order updated" });
    },
    onError: (err: any) => toast({ description: err.message, variant: "destructive" }),
  });

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <div className="flex items-center gap-3 mb-6">
          <ShoppingBag className="size-6 text-muted-foreground" />
          <h2 className="text-xl font-semibold tracking-tight" style={{ fontFamily: "var(--font-serif)" }}>
            Shop Orders
          </h2>
          <span className="text-sm text-muted-foreground">{orders.length} total</span>
        </div>
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : orders.length === 0 ? (
          <Card className="p-10 text-center text-muted-foreground">No shop orders yet.</Card>
        ) : (
          <div className="space-y-3">
            {orders.map((o) => {
              let items: any[] = [];
              try {
                items = JSON.parse(o.itemsJson || "[]");
              } catch {}
              return (
                <Card key={o.id} className="p-4">
                  <div className="flex flex-wrap items-start gap-4 justify-between">
                    <div className="min-w-0">
                      <div className="font-mono text-sm font-medium">{o.orderNumber}</div>
                      <div className="text-sm">
                        {o.customerName || "—"}{" "}
                        <span className="text-muted-foreground">{o.customerEmail}</span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {new Date(o.createdAt).toLocaleString()}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-semibold">${o.total.toFixed(2)}</div>
                      <div className="text-xs text-muted-foreground">
                        sub ${o.subtotal.toFixed(2)} · ship ${o.shippingTotal.toFixed(2)}
                      </div>
                    </div>
                  </div>
                  <ul className="mt-3 text-sm space-y-1">
                    {items.map((li, i) => (
                      <li key={i} className="flex justify-between gap-3">
                        <span className="truncate">
                          {li.qty}× {li.title}
                        </span>
                        <span className="font-mono tabular-nums text-muted-foreground">
                          ${(li.unitPrice * li.qty).toFixed(2)}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Status:</span>
                      <StatusBadge s={o.fulfillmentStatus} />
                      <Select
                        value={o.fulfillmentStatus}
                        onValueChange={(v) => update.mutate({ id: o.id, patch: { fulfillmentStatus: v } })}
                      >
                        <SelectTrigger className="h-8 w-40 text-xs">
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
                    </div>
                    <div className="flex items-center gap-2 flex-1 min-w-[260px]">
                      <span className="text-xs text-muted-foreground">Tracking:</span>
                      <Input
                        className="h-8"
                        placeholder="Tracking #"
                        value={trackingDrafts[o.id] ?? o.trackingNumber}
                        onChange={(e) => setTrackingDrafts((d) => ({ ...d, [o.id]: e.target.value }))}
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={update.isPending}
                        onClick={() =>
                          update.mutate({
                            id: o.id,
                            patch: { trackingNumber: trackingDrafts[o.id] ?? o.trackingNumber },
                          })
                        }
                      >
                        Save
                      </Button>
                    </div>
                  </div>
                  {o.shippingAddress && (
                    <div className="mt-2 text-xs text-muted-foreground whitespace-pre-line">
                      {(() => {
                        try {
                          const a = JSON.parse(o.shippingAddress);
                          if (a && typeof a === "object") {
                            const lines = [
                              a.name,
                              a.street1 || a.line1,
                              a.street2 || a.line2,
                              [a.city, a.state, a.zip].filter(Boolean).join(", "),
                              a.country !== "US" ? a.country : null,
                            ].filter(Boolean);
                            return lines.join("\n");
                          }
                        } catch {}
                        return o.shippingAddress;
                      })()}
                    </div>
                  )}
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {o.labelUrl ? (
                      <>
                        <a
                          href={o.labelUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex"
                        >
                          <Button size="sm" variant="outline">
                            <FileText className="size-4 mr-1.5" />
                            View label
                          </Button>
                        </a>
                        <span className="text-xs text-muted-foreground">
                          {o.carrier} {o.serviceLevel}
                        </span>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setLabelDialogOrderId(o.id)}
                        >
                          New label
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => setLabelDialogOrderId(o.id)}
                        disabled={!o.shippingAddress}
                      >
                        <Truck className="size-4 mr-1.5" />
                        Generate label
                      </Button>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
      {labelDialogOrderId !== null && (
        <ShippingLabelDialog
          orderId={labelDialogOrderId}
          open={labelDialogOrderId !== null}
          onOpenChange={(v) => { if (!v) setLabelDialogOrderId(null); }}
        />
      )}
    </div>
  );
}
