import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Loader2, Truck, ExternalLink } from "lucide-react";

type Rate = {
  rateId: string;
  carrier: string;
  service: string;
  amount: number;
  currency: string;
  estimatedDays: number;
  attributes: string[];
};

type Props = {
  orderId: number;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  // Optional inventory-derived defaults
  defaultLengthIn?: number;
  defaultWidthIn?: number;
  defaultHeightIn?: number;
  defaultWeightOz?: number;
};

export function ShippingLabelDialog({
  orderId,
  open,
  onOpenChange,
  defaultLengthIn,
  defaultWidthIn,
  defaultHeightIn,
  defaultWeightOz,
}: Props) {
  const { toast } = useToast();
  const [lengthIn, setLengthIn] = useState(defaultLengthIn ? String(defaultLengthIn) : "");
  const [widthIn, setWidthIn] = useState(defaultWidthIn ? String(defaultWidthIn) : "");
  const [heightIn, setHeightIn] = useState(defaultHeightIn ? String(defaultHeightIn) : "");
  const [weightOz, setWeightOz] = useState(defaultWeightOz ? String(defaultWeightOz) : "");
  const [rates, setRates] = useState<Rate[]>([]);
  const [selectedRate, setSelectedRate] = useState<Rate | null>(null);

  const getRates = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/shop/admin/orders/${orderId}/shipping/rates`, {
        lengthIn: Number(lengthIn),
        widthIn: Number(widthIn),
        heightIn: Number(heightIn),
        weightOz: Number(weightOz),
      });
      return res.json();
    },
    onSuccess: (data: { rates: Rate[]; messages?: any[] }) => {
      setRates(data.rates || []);
      setSelectedRate(null);
      if (!data.rates?.length) {
        toast({
          description: "No rates returned. Check the shipping address.",
          variant: "destructive",
        });
      }
    },
    onError: (err: any) =>
      toast({ description: err.message || "Failed to fetch rates", variant: "destructive" }),
  });

  const buyLabel = useMutation({
    mutationFn: async (rate: Rate) => {
      const res = await apiRequest("POST", `/api/shop/admin/orders/${orderId}/shipping/label`, {
        rateId: rate.rateId,
        carrier: rate.carrier,
        serviceLevel: rate.service,
      });
      return res.json();
    },
    onSuccess: (data: { labelUrl: string; trackingNumber: string }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/shop/admin/orders"] });
      toast({ description: `Label ready · ${data.trackingNumber}` });
      if (data.labelUrl) window.open(data.labelUrl, "_blank", "noopener");
      onOpenChange(false);
    },
    onError: (err: any) =>
      toast({ description: err.message || "Failed to buy label", variant: "destructive" }),
  });

  const dimsReady = Number(lengthIn) > 0 && Number(widthIn) > 0 && Number(heightIn) > 0 && Number(weightOz) > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="size-5" /> Generate shipping label
          </DialogTitle>
          <DialogDescription>
            Enter package dimensions and weight. We'll fetch USPS rates via Shippo and print the
            label as a PDF.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="len" className="text-xs">Length (in)</Label>
            <Input id="len" type="number" step="0.1" min="0" value={lengthIn} onChange={(e) => setLengthIn(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="wid" className="text-xs">Width (in)</Label>
            <Input id="wid" type="number" step="0.1" min="0" value={widthIn} onChange={(e) => setWidthIn(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="hgt" className="text-xs">Height (in)</Label>
            <Input id="hgt" type="number" step="0.1" min="0" value={heightIn} onChange={(e) => setHeightIn(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="wt" className="text-xs">Weight (oz)</Label>
            <Input id="wt" type="number" step="0.1" min="0" value={weightOz} onChange={(e) => setWeightOz(e.target.value)} />
          </div>
        </div>

        <Button
          onClick={() => getRates.mutate()}
          disabled={!dimsReady || getRates.isPending}
          className="w-full"
          variant="outline"
        >
          {getRates.isPending ? (
            <>
              <Loader2 className="size-4 animate-spin mr-2" /> Fetching rates...
            </>
          ) : (
            "Get rates"
          )}
        </Button>

        {rates.length > 0 && (
          <div className="space-y-2 max-h-72 overflow-y-auto">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Available rates
            </div>
            {rates.map((r) => {
              const selected = selectedRate?.rateId === r.rateId;
              return (
                <Card
                  key={r.rateId}
                  onClick={() => setSelectedRate(r)}
                  className={`p-3 cursor-pointer transition border-2 ${
                    selected ? "border-primary" : "border-transparent hover:border-muted-foreground/30"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate">
                        {r.carrier} · {r.service}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {r.estimatedDays ? `~${r.estimatedDays} day${r.estimatedDays === 1 ? "" : "s"}` : "—"}
                        {r.attributes?.includes("CHEAPEST") && " · Cheapest"}
                        {r.attributes?.includes("FASTEST") && " · Fastest"}
                        {r.attributes?.includes("BESTVALUE") && " · Best value"}
                      </div>
                    </div>
                    <div className="font-mono text-base font-semibold tabular-nums">
                      ${r.amount.toFixed(2)}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {selectedRate && (
          <Button
            onClick={() => buyLabel.mutate(selectedRate)}
            disabled={buyLabel.isPending}
            className="w-full"
          >
            {buyLabel.isPending ? (
              <>
                <Loader2 className="size-4 animate-spin mr-2" /> Purchasing label...
              </>
            ) : (
              <>
                Buy {selectedRate.carrier} {selectedRate.service} · ${selectedRate.amount.toFixed(2)}
                <ExternalLink className="size-4 ml-2" />
              </>
            )}
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
