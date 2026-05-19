import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Users } from "lucide-react";

type ShopCustomer = {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  tier: string;
  pointsBalance: number;
  lifetimePointsEarned: number;
  ordersCount: number;
  lifetimeSpend: number;
  referralCode: string;
  createdAt: number;
};

type CustomerDetail = {
  customer: ShopCustomer;
  orders: any[];
  rewards: { id: number; delta: number; reason: string; note: string; createdAt: number }[];
};

const TIER_COLORS: Record<string, string> = {
  Bronze: "bg-stone-200 text-stone-800 dark:bg-stone-800 dark:text-stone-200",
  Silver: "bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-100",
  Gold: "bg-amber-200 text-amber-900 dark:bg-amber-700/40 dark:text-amber-200",
  Platinum: "bg-violet-200 text-violet-900 dark:bg-violet-800/50 dark:text-violet-200",
};

function TierBadge({ t }: { t: string }) {
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${TIER_COLORS[t] || "bg-muted"}`}>
      {t}
    </span>
  );
}

export default function ShopCustomersPage() {
  const { toast } = useToast();
  const [openId, setOpenId] = useState<number | null>(null);
  const [delta, setDelta] = useState("");
  const [note, setNote] = useState("");

  const { data: customers = [], isLoading } = useQuery<ShopCustomer[]>({
    queryKey: ["/api/shop/admin/customers"],
  });

  const { data: detail } = useQuery<CustomerDetail>({
    queryKey: ["/api/shop/admin/customers", openId],
    enabled: openId !== null,
  });

  const adjust = useMutation({
    mutationFn: async () => {
      const d = parseInt(delta, 10);
      if (!Number.isFinite(d) || d === 0) throw new Error("Enter a non-zero number");
      const res = await apiRequest("PATCH", `/api/shop/admin/customers/${openId}/points`, {
        delta: d,
        note,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/shop/admin/customers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/shop/admin/customers", openId] });
      setDelta("");
      setNote("");
      toast({ description: "Points adjusted" });
    },
    onError: (err: any) => toast({ description: err.message, variant: "destructive" }),
  });

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <div className="flex items-center gap-3 mb-6">
          <Users className="size-6 text-muted-foreground" />
          <h2
            className="text-xl font-semibold tracking-tight"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            Shop Customers
          </h2>
          <span className="text-sm text-muted-foreground">{customers.length} total</span>
        </div>
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : customers.length === 0 ? (
          <Card className="p-10 text-center text-muted-foreground">No customers yet.</Card>
        ) : (
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2">Name</th>
                  <th className="text-left px-3 py-2">Email</th>
                  <th className="text-left px-3 py-2">Tier</th>
                  <th className="text-right px-3 py-2">Points</th>
                  <th className="text-right px-3 py-2">Lifetime pts</th>
                  <th className="text-right px-3 py-2">Orders</th>
                  <th className="text-right px-3 py-2">Spend</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => setOpenId(c.id)}
                    className="border-t cursor-pointer hover:bg-muted/30"
                  >
                    <td className="px-3 py-2">
                      {c.firstName} {c.lastName}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{c.email}</td>
                    <td className="px-3 py-2">
                      <TierBadge t={c.tier} />
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">
                      {c.pointsBalance}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-muted-foreground">
                      {c.lifetimePointsEarned}
                    </td>
                    <td className="px-3 py-2 text-right">{c.ordersCount}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">
                      ${c.lifetimeSpend.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>

      <Dialog open={openId !== null} onOpenChange={(o) => !o && setOpenId(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {detail?.customer
                ? `${detail.customer.firstName} ${detail.customer.lastName} — ${detail.customer.email}`
                : "Customer"}
            </DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div className="rounded border p-3">
                  <div className="text-xs text-muted-foreground">Balance</div>
                  <div className="font-mono text-lg">{detail.customer.pointsBalance}</div>
                </div>
                <div className="rounded border p-3">
                  <div className="text-xs text-muted-foreground">Lifetime</div>
                  <div className="font-mono text-lg">{detail.customer.lifetimePointsEarned}</div>
                </div>
                <div className="rounded border p-3">
                  <div className="text-xs text-muted-foreground">Tier</div>
                  <div className="text-lg">
                    <TierBadge t={detail.customer.tier} />
                  </div>
                </div>
              </div>

              <div className="border rounded p-3 space-y-2">
                <div className="text-sm font-medium">Adjust points</div>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    placeholder="±100"
                    value={delta}
                    onChange={(e) => setDelta(e.target.value)}
                    className="w-28"
                  />
                  <Input
                    placeholder="Note (optional)"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                  <Button onClick={() => adjust.mutate()} disabled={adjust.isPending}>
                    Apply
                  </Button>
                </div>
              </div>

              <div>
                <div className="text-sm font-medium mb-2">Recent points history</div>
                {detail.rewards.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No transactions yet.</div>
                ) : (
                  <ul className="text-sm space-y-1">
                    {detail.rewards.slice(0, 20).map((r) => (
                      <li key={r.id} className="flex justify-between gap-3 border-b py-1">
                        <span>
                          <span
                            className={
                              r.delta >= 0 ? "text-emerald-600" : "text-red-600"
                            }
                          >
                            {r.delta >= 0 ? "+" : ""}
                            {r.delta}
                          </span>{" "}
                          <span className="text-muted-foreground">{r.reason}</span>{" "}
                          {r.note && <span className="text-xs">{r.note}</span>}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(r.createdAt).toLocaleDateString()}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
