import { useEffect, useRef } from "react";
import { renderBarcodeSvg } from "@/lib/barcode";

interface BarcodeProps {
  value: string;
  height?: number;
  displayValue?: boolean;
  fontSize?: number;
  className?: string;
  ariaLabel?: string;
}

/**
 * Renders a Code 128 barcode for the given value (typically an item SKU).
 * Re-renders if the value changes. Falls back to nothing when value is empty.
 */
export function Barcode({
  value,
  height = 36,
  displayValue = false,
  fontSize = 11,
  className,
  ariaLabel,
}: BarcodeProps) {
  const ref = useRef<SVGSVGElement | null>(null);
  useEffect(() => {
    if (ref.current && value) {
      renderBarcodeSvg(ref.current, value, { height, displayValue, fontSize });
    }
  }, [value, height, displayValue, fontSize]);

  if (!value) {
    return (
      <div className={`text-xs text-muted-foreground italic ${className || ""}`}>
        No SKU
      </div>
    );
  }
  return (
    <svg
      ref={ref}
      className={className}
      role="img"
      aria-label={ariaLabel || `Barcode for ${value}`}
      data-testid={`barcode-${value}`}
    />
  );
}
