import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { DecodeHintType, BarcodeFormat } from "@zxing/library";
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
import { Camera, Keyboard, ScanLine, X, Loader2 } from "lucide-react";

interface BarcodeScannerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onScan: (sku: string) => void;
}

export function BarcodeScanner({ open, onOpenChange, onScan }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const [mode, setMode] = useState<"camera" | "manual">("camera");
  const [manualSku, setManualSku] = useState("");
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);

  // Stop everything cleanly
  const stopCamera = () => {
    try {
      controlsRef.current?.stop?.();
    } catch {}
    controlsRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => {
        try {
          t.stop();
        } catch {}
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      try {
        videoRef.current.srcObject = null;
      } catch {}
    }
  };

  // Start camera when dialog opens in camera mode
  useEffect(() => {
    if (!open || mode !== "camera") return;

    let cancelled = false;
    setError("");
    setStarting(true);

    const start = async () => {
      try {
        // Configure ZXing reader to focus on Code 128 (what we generate)
        const hints = new Map();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.CODE_128,
          BarcodeFormat.CODE_39,
          BarcodeFormat.EAN_13,
          BarcodeFormat.EAN_8,
          BarcodeFormat.UPC_A,
          BarcodeFormat.UPC_E,
          BarcodeFormat.QR_CODE,
        ]);
        hints.set(DecodeHintType.TRY_HARDER, true);

        const reader = new BrowserMultiFormatReader(hints);
        readerRef.current = reader;

        // Request rear camera explicitly
        const constraints: MediaStreamConstraints = {
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }

        // Start continuous decoding from the stream we already have
        const controls = await reader.decodeFromStream(
          stream,
          videoRef.current!,
          (result, err) => {
            if (result && !cancelled) {
              const text = result.getText().trim();
              if (text) {
                stopCamera();
                onScan(text);
                onOpenChange(false);
              }
            }
            // err on each frame is normal — ignore NotFoundException-style misses
          },
        );
        controlsRef.current = controls as any;
        setStarting(false);
      } catch (e: any) {
        if (cancelled) return;
        const msg =
          e?.name === "NotAllowedError"
            ? "Camera access was blocked. Allow camera permission in your browser, or use Manual entry."
            : e?.name === "NotFoundError"
              ? "No camera was found on this device. Use Manual entry instead."
              : e?.message || "Could not start the camera. Use Manual entry instead.";
        setError(msg);
        setStarting(false);
      }
    };

    start();

    return () => {
      cancelled = true;
      stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode]);

  // Stop camera when dialog closes
  useEffect(() => {
    if (!open) {
      stopCamera();
      setManualSku("");
      setError("");
      setMode("camera");
    }
  }, [open]);

  const submitManual = () => {
    const v = manualSku.trim();
    if (!v) return;
    onScan(v);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="dialog-scanner">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanLine className="size-5 text-primary" />
            Scan barcode
          </DialogTitle>
          <DialogDescription>
            Point your camera at a Crown List barcode, or type a SKU manually.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-1.5 p-1 bg-muted rounded-md">
          <button
            data-testid="tab-scan-camera"
            type="button"
            onClick={() => setMode("camera")}
            className={`flex-1 text-sm py-1.5 rounded-sm flex items-center justify-center gap-1.5 transition-colors ${
              mode === "camera"
                ? "bg-background shadow-sm font-medium"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Camera className="size-3.5" />
            Camera
          </button>
          <button
            data-testid="tab-scan-manual"
            type="button"
            onClick={() => setMode("manual")}
            className={`flex-1 text-sm py-1.5 rounded-sm flex items-center justify-center gap-1.5 transition-colors ${
              mode === "manual"
                ? "bg-background shadow-sm font-medium"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Keyboard className="size-3.5" />
            Manual
          </button>
        </div>

        {mode === "camera" ? (
          <div className="space-y-2">
            <div className="relative aspect-[4/3] w-full overflow-hidden rounded-md bg-black">
              <video
                ref={videoRef}
                className="size-full object-cover"
                playsInline
                muted
                data-testid="video-scanner"
              />
              {/* Scan guide overlay */}
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="relative w-4/5 h-1/3 border-2 border-primary/80 rounded-md">
                  <div className="absolute -top-1 -left-1 size-3 border-t-2 border-l-2 border-primary" />
                  <div className="absolute -top-1 -right-1 size-3 border-t-2 border-r-2 border-primary" />
                  <div className="absolute -bottom-1 -left-1 size-3 border-b-2 border-l-2 border-primary" />
                  <div className="absolute -bottom-1 -right-1 size-3 border-b-2 border-r-2 border-primary" />
                  <div className="absolute left-2 right-2 top-1/2 h-px bg-primary/70 animate-pulse" />
                </div>
              </div>
              {starting && (
                <div className="absolute inset-0 flex items-center justify-center text-white/80 text-sm gap-2">
                  <Loader2 className="size-4 animate-spin" />
                  Starting camera…
                </div>
              )}
            </div>
            {error && (
              <p className="text-xs text-destructive" data-testid="text-scanner-error">
                {error}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Hold steady, ~6&quot; from the label. Good light helps a lot.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <Label>SKU</Label>
              <Input
                data-testid="input-manual-sku"
                autoFocus
                className="font-mono"
                placeholder="CL-20260507-A1B2"
                value={manualSku}
                onChange={(e) => setManualSku(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitManual();
                }}
              />
            </div>
            <Button
              data-testid="button-submit-manual-sku"
              onClick={submitManual}
              disabled={!manualSku.trim()}
              className="w-full"
            >
              Look up SKU
            </Button>
          </div>
        )}

        <div className="flex justify-end">
          <Button
            data-testid="button-close-scanner"
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="gap-1.5"
          >
            <X className="size-4" />
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
