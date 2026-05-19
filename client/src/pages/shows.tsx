import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
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
import {
  Calendar,
  Plus,
  Loader2,
  ArrowRight,
  Trash2,
  Package,
  DollarSign,
  TrendingUp,
} from "lucide-react";
import type { Show } from "@shared/schema";

type ShowWithStats = Show & {
  itemCount: number;
  projectedRevenue: number;
  totalCost: number;
};

function fmtMoney(n: number) {
  return `$${(n || 0).toFixed(2)}`;
}

function fmtDate(ms: number) {
  if (!ms) return "Not scheduled";
  const d = new Date(ms);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// HTML datetime-local needs YYYY-MM-DDTHH:MM (local time)
function toDatetimeLocal(ms: number): string {
  if (!ms) return "";
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromDatetimeLocal(s: string): number {
  if (!s) return 0;
  const d = new Date(s);
  return isNaN(d.getTime()) ? 0 : d.getTime();
}

export default function ShowsPage() {
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [form, setForm] = useState({ name: "", scheduledAt: "", description: "" });

  const { data: shows = [], isLoading } = useQuery<ShowWithStats[]>({
    queryKey: ["/api/shows"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: { name: string; scheduledAt: number; description: string }) => {
      const res = await apiRequest("POST", "/api/shows", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/shows"] });
      setCreateOpen(false);
      setForm({ name: "", scheduledAt: "", description: "" });
      toast({ title: "Show created" });
    },
    onError: (err: any) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/shows/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/shows"] });
      setDeleteId(null);
      toast({ title: "Show deleted" });
    },
    onError: (err: any) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  const submit = () => {
    if (!form.name.trim()) {
      toast({ title: "Name required", variant: "destructive" });
      return;
    }
    createMutation.mutate({
      name: form.name.trim(),
      scheduledAt: fromDatetimeLocal(form.scheduledAt),
      description: form.description,
    });
  };

  // Sort: upcoming first (closest first), then unscheduled, then past
  const now = Date.now();
  const sorted = [...shows].sort((a, b) => {
    const aUp = a.scheduledAt >= now;
    const bUp = b.scheduledAt >= now;
    if (aUp !== bUp) return aUp ? -1 : 1;
    if (aUp) return a.scheduledAt - b.scheduledAt;
    return b.scheduledAt - a.scheduledAt;
  });

  const totalProjected = shows.reduce((sum, s) => sum + s.projectedRevenue, 0);
  const totalItems = shows.reduce((sum, s) => sum + s.itemCount, 0);

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <h2
              className="text-2xl sm:text-3xl font-semibold tracking-tight"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              Shows
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Plan your live Whatnot shows. Add items in any order, then export a Whatnot-ready CSV.
            </p>
          </div>
          <Button data-testid="button-create-show" onClick={() => setCreateOpen(true)} className="gap-1.5">
            <Plus className="size-4" />
            <span className="hidden sm:inline">New show</span>
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
          <Card className="p-4">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
              <Calendar className="size-3.5" />
              Total shows
            </div>
            <div className="text-2xl font-semibold mt-1" data-testid="stat-show-count">
              {shows.length}
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
              <Package className="size-3.5" />
              Items queued
            </div>
            <div className="text-2xl font-semibold mt-1" data-testid="stat-items-queued">
              {totalItems}
            </div>
          </Card>
          <Card className="p-4 col-span-2 sm:col-span-1">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
              <TrendingUp className="size-3.5" />
              Projected revenue
            </div>
            <div className="text-2xl font-semibold mt-1" data-testid="stat-projected-revenue">
              {fmtMoney(totalProjected)}
            </div>
          </Card>
        </div>

        {/* List */}
        {isLoading ? (
          <div className="py-16 text-center text-muted-foreground">
            <Loader2 className="size-5 animate-spin inline mr-2" />
            Loading shows…
          </div>
        ) : sorted.length === 0 ? (
          <Card className="p-12 text-center">
            <Calendar className="size-10 mx-auto text-muted-foreground mb-3" />
            <h3 className="text-lg font-semibold">No shows yet</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
              Create your first show, then queue items from your inventory in the order you'll feature them.
            </p>
            <Button onClick={() => setCreateOpen(true)} className="mt-4 gap-1.5">
              <Plus className="size-4" />
              Create a show
            </Button>
          </Card>
        ) : (
          <div className="grid gap-3">
            {sorted.map((show) => {
              const upcoming = show.scheduledAt >= now;
              return (
                <Card
                  key={show.id}
                  data-testid={`card-show-${show.id}`}
                  className="p-4 sm:p-5 hover:border-primary/40 transition-colors"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-base sm:text-lg font-semibold truncate">{show.name || "(untitled)"}</h3>
                        {show.scheduledAt > 0 && (
                          <span
                            className={
                              "text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-md font-medium " +
                              (upcoming
                                ? "bg-primary/10 text-primary"
                                : "bg-muted text-muted-foreground")
                            }
                          >
                            {upcoming ? "Upcoming" : "Past"}
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground mt-0.5">{fmtDate(show.scheduledAt)}</div>
                      {show.description && (
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{show.description}</p>
                      )}
                      <div className="flex items-center gap-4 mt-2 text-sm">
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <Package className="size-3.5" />
                          <span data-testid={`text-itemcount-${show.id}`}>{show.itemCount}</span> items
                        </span>
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <DollarSign className="size-3.5" />
                          {fmtMoney(show.projectedRevenue)} projected
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Link href={`/shows/${show.id}`}>
                        <Button data-testid={`button-open-show-${show.id}`} className="gap-1.5">
                          Open
                          <ArrowRight className="size-3.5" />
                        </Button>
                      </Link>
                      <Button
                        data-testid={`button-delete-show-${show.id}`}
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeleteId(show.id)}
                        aria-label="Delete show"
                      >
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </main>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create show</DialogTitle>
            <DialogDescription>Plan an upcoming Whatnot live show.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Show name</Label>
              <Input
                data-testid="input-show-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Friday Antiques Drop"
              />
            </div>
            <div>
              <Label>Scheduled date & time</Label>
              <Input
                data-testid="input-show-scheduled"
                type="datetime-local"
                value={form.scheduledAt}
                onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })}
              />
            </div>
            <div>
              <Label>Description (optional)</Label>
              <Textarea
                data-testid="input-show-description"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Theme, special features, notes…"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button data-testid="button-submit-create-show" onClick={submit} disabled={createMutation.isPending}>
              {createMutation.isPending && <Loader2 className="size-4 animate-spin mr-1.5" />}
              Create show
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={deleteId !== null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this show?</AlertDialogTitle>
            <AlertDialogDescription>
              The show will be removed but the items themselves will stay in your inventory.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              data-testid="button-confirm-delete-show"
              onClick={() => deleteId !== null && deleteMutation.mutate(deleteId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
