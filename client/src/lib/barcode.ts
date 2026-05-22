// Barcode generation + label printing for Crown List.
//
// Code 128 barcodes via jsbarcode, rendered as inline SVG. Supports two
// label formats:
//   - Avery 5160 sheet (Letter paper, 30 labels per page, 2.625" x 1")
//   - Dymo single-label thermal printers (one label per page, continuous feed)
//
// Dymo printers (LabelWriter 450, 550, etc.) appear as a normal system printer
// after installing Dymo's driver. They accept any HTML/CSS so long as @page
// size matches the loaded label. Browser print dialog -> choose Dymo printer.

import JsBarcode from "jsbarcode";
import type { Item } from "@shared/schema";

export function renderBarcodeSvg(
  el: SVGSVGElement,
  value: string,
  opts: { height?: number; fontSize?: number; displayValue?: boolean; margin?: number } = {},
) {
  if (!value) return;
  try {
    JsBarcode(el, value, {
      format: "CODE128",
      lineColor: "#000",
      width: 1.6,
      height: opts.height ?? 40,
      displayValue: opts.displayValue ?? false,
      fontSize: opts.fontSize ?? 11,
      margin: opts.margin ?? 0,
      background: "transparent",
    });
  } catch {
    // jsbarcode throws on invalid characters; render empty in that case.
  }
}

export function barcodeSvgString(
  value: string,
  opts: { height?: number; width?: number; displayValue?: boolean; fontSize?: number } = {},
): string {
  if (!value) return "";
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  try {
    JsBarcode(svg, value, {
      format: "CODE128",
      lineColor: "#000",
      width: opts.width ?? 1.6,
      height: opts.height ?? 40,
      displayValue: opts.displayValue ?? false,
      fontSize: opts.fontSize ?? 11,
      margin: 0,
      background: "transparent",
    });
  } catch {
    return "";
  }
  return new XMLSerializer().serializeToString(svg);
}

// ---------- Label format definitions ----------

export type LabelFormatId =
  | "avery5160"
  | "dymo30252"
  | "dymo30334"
  | "dymo30336"
  | "dymo30256";

export type LabelFormat = {
  id: LabelFormatId;
  name: string;
  description: string;
  // Dimensions in inches. For sheet formats, this is the single-label size.
  widthIn: number;
  heightIn: number;
  // Layout type: "sheet" lays out a grid on Letter paper; "single" prints
  // one label per page sized exactly to the label (for Dymo continuous feed).
  layout: "sheet" | "single";
  // For sheet layouts:
  sheetCols?: number;
  sheetRows?: number;
  sheetMarginTop?: number;
  sheetMarginLeft?: number;
  sheetColGap?: number;
};

export const LABEL_FORMATS: Record<LabelFormatId, LabelFormat> = {
  avery5160: {
    id: "avery5160",
    name: "Avery 5160 (30-up sheet)",
    description: "Letter paper, 30 labels per page, 2.625\" \u00d7 1\". Best for laser/inkjet.",
    widthIn: 2.625,
    heightIn: 1,
    layout: "sheet",
    sheetCols: 3,
    sheetRows: 10,
    sheetMarginTop: 0.5,
    sheetMarginLeft: 0.1875,
    sheetColGap: 0.125,
  },
  dymo30252: {
    id: "dymo30252",
    name: "Dymo 30252 Address (1.125\" \u00d7 3.5\")",
    description: "Most common Dymo label. One per page, continuous feed. Best for product labels.",
    widthIn: 3.5,
    heightIn: 1.125,
    layout: "single",
  },
  dymo30334: {
    id: "dymo30334",
    name: "Dymo 30334 Multi-Purpose (1.25\" \u00d7 2.25\")",
    description: "Compact square-ish Dymo label. Great for small vintage pieces.",
    widthIn: 2.25,
    heightIn: 1.25,
    layout: "single",
  },
  dymo30336: {
    id: "dymo30336",
    name: "Dymo 30336 Small Multipurpose (1\" \u00d7 2.125\")",
    description: "Smallest common Dymo label. Best when shelf space is tight.",
    widthIn: 2.125,
    heightIn: 1,
    layout: "single",
  },
  dymo30256: {
    id: "dymo30256",
    name: "Dymo 30256 Shipping (2.3125\" \u00d7 4\")",
    description: "Large shipping label \u2014 great for packing slip-style labels.",
    widthIn: 4,
    heightIn: 2.3125,
    layout: "single",
  },
};

// Remember the operator's last choice so they don't pick every time.
const PREF_KEY = "crown-list-label-format";
export function loadLabelFormatPref(): LabelFormatId {
  try {
    const v = localStorage.getItem(PREF_KEY);
    if (v && v in LABEL_FORMATS) return v as LabelFormatId;
  } catch {}
  return "avery5160";
}
export function saveLabelFormatPref(id: LabelFormatId) {
  try {
    localStorage.setItem(PREF_KEY, id);
  } catch {}
}

// ---------- Print orchestration ----------

export function printBarcodeLabels(
  items: Pick<Item, "sku" | "title" | "webPrice">[],
  formatId: LabelFormatId = "avery5160",
) {
  if (items.length === 0) return;
  const fmt = LABEL_FORMATS[formatId] || LABEL_FORMATS.avery5160;

  const html = fmt.layout === "sheet" ? buildSheetHtml(items, fmt) : buildSingleHtml(items, fmt);
  openPrintHtml(html);
}

// ----- Sheet layout (Avery 5160) -----

function buildSheetHtml(
  items: Pick<Item, "sku" | "title" | "webPrice">[],
  fmt: LabelFormat,
): string {
  const labelHtml = items
    .map((item) => labelInner(item, { fontTitle: 8.5, fontSku: 8, barcodeHeightIn: 0.4, barcodeWidth: 1.4 }))
    .join("");

  const cols = fmt.sheetCols ?? 3;
  const colGap = fmt.sheetColGap ?? 0.125;
  const marginTop = fmt.sheetMarginTop ?? 0.5;
  const marginLeft = fmt.sheetMarginLeft ?? 0.1875;

  return baseDoc(
    `<div class="toolbar">
      <button onclick="window.print()">Print</button>
      <span class="meta">${items.length} label${items.length === 1 ? "" : "s"} \u2014 ${fmt.name}</span>
    </div>
    <div class="sheet">${labelHtml}</div>`,
    `
    .sheet {
      width: 8.5in; padding: ${marginTop}in ${marginLeft}in; margin: 16px auto;
      background: #fff;
      display: grid; grid-template-columns: repeat(${cols}, ${fmt.widthIn}in);
      column-gap: ${colGap}in; row-gap: 0;
    }
    .label {
      width: ${fmt.widthIn}in; height: ${fmt.heightIn}in;
      padding: 0.08in 0.12in; overflow: hidden;
      display: flex; flex-direction: column; justify-content: center;
      align-items: center; text-align: center;
      border: 1px dashed #ddd;
    }
    @media print {
      .toolbar { display: none; }
      .sheet { margin: 0; padding: ${marginTop}in ${marginLeft}in; }
      .label { border: 0; }
      @page { size: Letter; margin: 0; }
    }
    `,
  );
}

// ----- Single-label layout (Dymo thermal) -----

function buildSingleHtml(
  items: Pick<Item, "sku" | "title" | "webPrice">[],
  fmt: LabelFormat,
): string {
  // Tune font/barcode size based on label dimensions
  const small = fmt.widthIn < 2.3 || fmt.heightIn < 1.1;
  const fontTitle = small ? 7.5 : 9;
  const fontSku = small ? 7 : 8;
  const barcodeHeightIn = Math.min(0.5, fmt.heightIn * 0.45);
  const barcodeWidth = small ? 1.1 : 1.5;

  const labelHtml = items
    .map((item) =>
      `<div class="page"><div class="label">${labelInner(item, {
        fontTitle,
        fontSku,
        barcodeHeightIn,
        barcodeWidth,
        showPrice: !small,
      })}</div></div>`,
    )
    .join("");

  return baseDoc(
    `<div class="toolbar">
      <button onclick="window.print()">Print</button>
      <span class="meta">${items.length} label${items.length === 1 ? "" : "s"} \u2014 ${fmt.name}</span>
      <span class="hint">In the print dialog: choose your Dymo printer, set scale to 100%, no headers/footers.</span>
    </div>
    ${labelHtml}`,
    `
    .page {
      width: ${fmt.widthIn}in; height: ${fmt.heightIn}in;
      background: #fff; margin: 8px auto;
      page-break-after: always;
      box-shadow: 0 1px 4px rgba(0,0,0,0.08);
    }
    .label {
      width: 100%; height: 100%;
      padding: 0.06in 0.1in; overflow: hidden;
      display: flex; flex-direction: column; justify-content: center;
      align-items: center; text-align: center;
      border: 1px dashed #ddd;
    }
    @media print {
      .toolbar { display: none; }
      .page { margin: 0; box-shadow: none; }
      .label { border: 0; }
      @page { size: ${fmt.widthIn}in ${fmt.heightIn}in; margin: 0; }
    }
    `,
  );
}

// ----- Label inner template (shared by both layouts) -----

function labelInner(
  item: Pick<Item, "sku" | "title" | "webPrice">,
  opts: { fontTitle: number; fontSku: number; barcodeHeightIn: number; barcodeWidth: number; showPrice?: boolean },
): string {
  const sku = (item.sku || "").trim();
  const title = (item.title || "").trim();
  const price = item.webPrice && item.webPrice > 0 ? `$${Number(item.webPrice).toFixed(2)}` : "";
  const svg = barcodeSvgString(sku, {
    height: opts.barcodeHeightIn * 72, // pt
    width: opts.barcodeWidth,
  });
  const safeTitle = escapeHtml(title);
  const safeSku = escapeHtml(sku);
  const safePrice = escapeHtml(price);

  return `
    <div class="label-title" style="font-size:${opts.fontTitle}pt;" title="${safeTitle}">${safeTitle || "&nbsp;"}</div>
    <div class="label-barcode" style="height:${opts.barcodeHeightIn}in;">${svg || `<div class='label-empty'>${safeSku || "(no SKU)"}</div>`}</div>
    <div class="label-sku" style="font-size:${opts.fontSku}pt;">${safeSku || ""}${opts.showPrice && safePrice ? `  \u00b7  <strong>${safePrice}</strong>` : ""}</div>
  `;
}

function baseDoc(body: string, extraCss: string): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Crown List \u2014 Print Labels</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #f7f5f0; color: #000; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif; }
  .toolbar {
    position: sticky; top: 0; background: #fff; border-bottom: 1px solid #ddd;
    padding: 12px 16px; display: flex; gap: 12px; align-items: center; z-index: 10; flex-wrap: wrap;
  }
  .toolbar button {
    background: #0a3a2a; color: #fff; border: 0; border-radius: 6px;
    padding: 8px 14px; font-weight: 600; cursor: pointer; font-size: 14px;
  }
  .toolbar .meta { color: #555; font-size: 13px; }
  .toolbar .hint { color: #777; font-size: 12px; flex-basis: 100%; }
  .label-title {
    line-height: 1.15; font-weight: 600;
    max-height: 2.4em; overflow: hidden; text-overflow: ellipsis;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
    width: 100%;
  }
  .label-barcode { margin: 2px 0; line-height: 0; display: flex; align-items: center; justify-content: center; width: 100%; }
  .label-barcode svg { max-width: 95%; height: 100%; display: block; }
  .label-empty { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 9pt; }
  .label-sku { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: 0.3px; }
  ${extraCss}
</style>
</head>
<body>${body}</body>
</html>`;
}

// ----- Open helper (iframe -> blob -> download fallback) -----

function openPrintHtml(html: string) {
  try {
    const existing = document.getElementById("crown-list-print-frame");
    if (existing) existing.remove();

    const iframe = document.createElement("iframe");
    iframe.id = "crown-list-print-frame";
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;";
    iframe.srcdoc = html;

    iframe.onload = () => {
      try {
        const win = iframe.contentWindow;
        if (!win) throw new Error("No iframe window");
        win.focus();
        win.print();
        setTimeout(() => iframe.remove(), 60_000);
      } catch {
        iframe.remove();
        openBlobFallback(html);
      }
    };
    document.body.appendChild(iframe);
    return;
  } catch {}
  openBlobFallback(html);
}

function openBlobFallback(html: string) {
  try {
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch {
    downloadLabelsHtml(html);
  }
}

function downloadLabelsHtml(html: string) {
  try {
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "crown-list-labels.html";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch {
    alert("Unable to print barcodes. Please try again from a different browser.");
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
