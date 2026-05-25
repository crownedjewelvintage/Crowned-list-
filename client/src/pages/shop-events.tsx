import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { AppHeader } from "@/components/AppHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Calendar, Loader2, Plus, Pencil, Trash2, ExternalLink, EyeOff, Eye } from "lucide-react";

type WebEvent = {
  id: number;
  title: string;
  description: string;
  startAt: string;
  endAt: string;
  timezone: string;
  kind: "whatnot" | "in_person" | "sale" | "other";
  location: string;
  url: string;
  imageUrl: string;
  published: number;
  recurrence: "none" | "weekly";
  createdAt: number;
  updatedAt: number;
};

const KIND_LABELS: Record<WebEvent["kind"], string> = {
  whatnot: "Whatnot live show",
  in_person: "In-person event",
  sale: "Sale / promotion",
  other: "Other",
};

const TZ = "America/Chicago";

// Convert "2026-05-30T22:00" (local datetime-local input) to ISO with offset.
function localInputToIso(local: string, timezone: string): string {
  if (!local) return "";
  // datetime-local has no timezone; interpret as the given timezone.
  // Build a Date as if UTC, then adjust by the offset for that zone at that time.
  const asUtc = new Date(local + "Z"); // pretend UTC
  // Find what time that wall-clock represents in target tz:
  const tzOffsetMs = getTimezoneOffsetMs(local, timezone);
  const real = new Date(asUtc.getTime() - tzOffsetMs);
  return real.toISOString();
}

function isoToLocalInput(iso: string): string {
  if (!iso) return "";
  // Convert ISO to a "YYYY-MM-DDTHH:MM" string in the user's local time so the input renders consistently.
  const d = new Date(iso);
  const tzOffset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tzOffset).toISOString().slice(0, 16);
}

// Compute offset in ms for a given local time + tz (DST aware enough for our purposes).
function getTimezoneOffsetMs(local: string, timezone: string): number {
  const ref = new Date(local + ":00");
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(formatter.formatToParts(ref).map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - ref.getTime();
}

function formatEventTime(iso: string, tz: string = TZ): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    timeZone: tz,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

type EventFormState = {
  title: string;
  description: string;
  startLocal: string;
  endLocal: string;
  timezone: string;
  kind: WebEvent["kind"];
  location: string;
  url: string;
  imageUrl: string;
  published: boolean;
  recurrence: WebEvent["recurrence"];
};

function blankForm(): EventFormState {
  return {
    title: "",
    description: "",
    startLocal: "",
    endLocal: "",
    timezone: TZ,
    kind: "whatnot",
    location: "",
    url: "",
    imageUrl: "",
    published: true,
    recurrence: "none",
  };
}

function eventToForm(e: WebEvent): EventFormState {
  return {
    title: e.title,
    description: e.description,
    startLocal: isoToLocalInput(e.startAt),
    endLocal: isoToLocalInput(e.endAt),
    timezone: e.timezone || TZ,
    kind: e.kind,
    location: e.location,
    url: e.url,
    imageUrl: e.imageUrl,
    published: !!e.published,
    recurrence: e.recurrence || "none",
  };
}

export default function ShopEventsPage() {
  const { toast } = useToast();
  const { data: events = [], isLoading } = useQuery<WebEvent[]>({
    queryKey: ["/api/shop/admin/events"],
  });

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<EventFormState>(blankForm());

  function openNew() {
    setEditingId(null);
    setForm(blankForm());
    setEditorOpen(true);
  }
  function openEdit(e: WebEvent) {
    setEditingId(e.id);
    setForm(eventToForm(e));
    setEditorOpen(true);
  }

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim(),
        startAt: form.startLocal ? localInputToIso(form.startLocal, form.timezone) : "",
        endAt: form.endLocal ? localInputToIso(form.endLocal, form.timezone) : "",
        timezone: form.timezone,
        kind: form.kind,
        location: form.location.trim(),
        url: form.url.trim(),
        imageUrl: form.imageUrl.trim(),
        published: form.published ? 1 : 0,
        recurrence: form.recurrence,
      };
      if (!payload.title) throw new Error("Title is required");
      if (editingId == null) {
        const res = await apiRequest("POST", "/api/shop/admin/events", payload);
        return res.json();
      } else {
        const res = await apiRequest("PATCH", `/api/shop/admin/events/${editingId}`, payload);
        return res.json();
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/shop/admin/events"] });
      setEditorOpen(false);
      toast({ description: editingId == null ? "Event created" : "Event updated" });
    },
    onError: (err: any) =>
      toast({ description: err.message || "Save failed", variant: "destructive" }),
  });

  const togglePublished = useMutation({
    mutationFn: async ({ id, published }: { id: number; published: number }) => {
      const res = await apiRequest("PATCH", `/api/shop/admin/events/${id}`, { published });
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/shop/admin/events"] }),
  });

  const remove = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/shop/admin/events/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/shop/admin/events"] });
      toast({ description: "Event deleted" });
    },
  });

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        <div className="flex items-center justify-between gap-3 mb-5">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
              <Calendar className="size-6" /> Events
            </h1>
            <p className="text-sm text-muted-foreground">
              Schedule live shows and events that appear on the shop's Events page.
            </p>
          </div>
          <Button onClick={openNew}>
            <Plus className="size-4 mr-1.5" /> New event
          </Button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : events.length === 0 ? (
          <Card className="p-10 text-center text-muted-foreground">
            <Calendar className="size-10 mx-auto mb-3 opacity-50" />
            <p>No events yet. Click "New event" to schedule your first show.</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {events.map((e) => (
              <Card key={e.id} className="p-4">
                <div className="flex flex-wrap items-start gap-4 justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <h3 className="text-lg font-semibold tracking-tight">{e.title}</h3>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                        {KIND_LABELS[e.kind]}
                      </span>
                      {!e.published && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200">
                          Draft
                        </span>
                      )}
                      {e.recurrence === "weekly" && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900 dark:bg-emerald-900/30 dark:text-emerald-200">
                          Weekly
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {formatEventTime(e.startAt, e.timezone || TZ)}
                      {e.endAt && (
                        <>
                          {" "}
                          → {formatEventTime(e.endAt, e.timezone || TZ)}
                        </>
                      )}
                    </div>
                    {e.location && (
                      <div className="text-sm text-muted-foreground mt-0.5">{e.location}</div>
                    )}
                    {e.description && (
                      <p className="text-sm mt-2 whitespace-pre-line">{e.description}</p>
                    )}
                    {e.url && (
                      <a
                        href={e.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm mt-2 inline-flex items-center gap-1 text-primary hover:underline"
                      >
                        Event link <ExternalLink className="size-3.5" />
                      </a>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        togglePublished.mutate({ id: e.id, published: e.published ? 0 : 1 })
                      }
                      title={e.published ? "Unpublish" : "Publish"}
                    >
                      {e.published ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => openEdit(e)}>
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => {
                        if (confirm(`Delete "${e.title}"? This cannot be undone.`)) {
                          remove.mutate(e.id);
                        }
                      }}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editingId == null ? "New event" : "Edit event"}</DialogTitle>
            <DialogDescription>
              Events appear on the shop's public Events page when published.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="ev-title">Title</Label>
              <Input
                id="ev-title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="e.g., Wednesday Vintage Show"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="ev-start">Starts</Label>
                <Input
                  id="ev-start"
                  type="datetime-local"
                  value={form.startLocal}
                  onChange={(e) => setForm({ ...form, startLocal: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ev-end">Ends (optional)</Label>
                <Input
                  id="ev-end"
                  type="datetime-local"
                  value={form.endLocal}
                  onChange={(e) => setForm({ ...form, endLocal: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select
                  value={form.kind}
                  onValueChange={(v) => setForm({ ...form, kind: v as WebEvent["kind"] })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="whatnot">Whatnot live show</SelectItem>
                    <SelectItem value="in_person">In-person event</SelectItem>
                    <SelectItem value="sale">Sale / promotion</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Recurrence</Label>
                <Select
                  value={form.recurrence}
                  onValueChange={(v) => setForm({ ...form, recurrence: v as WebEvent["recurrence"] })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">One-time</SelectItem>
                    <SelectItem value="weekly">Weekly (label only)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ev-loc">Location (optional)</Label>
              <Input
                id="ev-loc"
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                placeholder="e.g., Online (Whatnot) or Dallas, TX"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ev-url">Link (Whatnot show URL, RSVP, etc.)</Label>
              <Input
                id="ev-url"
                value={form.url}
                onChange={(e) => setForm({ ...form, url: e.target.value })}
                placeholder="https://whatnot.com/live/..."
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ev-desc">Description</Label>
              <Textarea
                id="ev-desc"
                rows={3}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="What can attendees expect? Featured categories, special drops, etc."
              />
            </div>

            <div className="flex items-center justify-between gap-3 pt-1">
              <div className="flex items-center gap-2">
                <Switch
                  checked={form.published}
                  onCheckedChange={(v) => setForm({ ...form, published: v })}
                />
                <Label className="text-sm font-normal">
                  {form.published ? "Visible on shop" : "Draft (hidden)"}
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" onClick={() => setEditorOpen(false)}>Cancel</Button>
                <Button onClick={() => save.mutate()} disabled={save.isPending}>
                  {save.isPending && <Loader2 className="size-4 animate-spin mr-1.5" />}
                  {editingId == null ? "Create event" : "Save changes"}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
