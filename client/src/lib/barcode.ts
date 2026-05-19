// Barcode generation + label printing for Crown List.
//
// We use Code 128 (encodes alphanumeric SKUs, compact, scans well at small
// label sizes) via the jsbarcode library. The barcode is rendered into an
// inline SVG so it scales crisply on screen and on a printed sheet.

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

// Returns the barcode as a stand-alone SVG string suitable for embedding in
// the print window (string-based so it works without React there).
export function barcodeSvgString(
  value: string,
  opts: { height?: number; width?: number; displayValue?: boolean; fontSize?: number } = {},
): string {
  if (!value) return "";
  // jsbarcode supports rendering into a detached SVG element via xmldom, but
  // in browser context we just create an SVGElement, render, and serialize.
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

// Open a print window with one or more SKU labels formatted for Avery 5160
// (or any 2.625" \u00d7 1" 30-up label sheet). Browser print dialog handles
// paper size + margins; we just lay out the grid in real inches via CSS.
export function printBarcodeLabels(items: Pick<Item, "sku" | "title">[]) {
  if (items.length === 0) return;

  const labelHtml = items
    .map((item) => {
      const sku = (item.sku || "").trim();
      const title = (item.title || "").trim();
      const svg = barcodeSvgString(sku, { height: 38, width: 1.4 });
      const safeTitle = escapeHtml(title);
      const safeSku = escapeHtml(sku);
      return `
        <div class="label">
          <div class="label-title" title="${safeTitle}">${safeTitle || "&nbsp;"}</div>
          <div class="label-barcode">${svg || `<div class='label-empty'>${safeSku || "(no SKU)"}</div>`}</div>
          <div class="label-sku">${safeSku || ""}</div>
        </div>
      `;
    })
    .join("");

  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Crown List \u2014 Print Barcodes</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; color: #000; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif; }
  .toolbar {
    position: sticky; top: 0; background: #fff; border-bottom: 1px solid #ddd;
    padding: 12px 16px; display: flex; gap: 12px; align-items: center; z-index: 10;
  }
  .toolbar button {
    background: #0a3a2a; color: #fff; border: 0; border-radius: 6px;
    padding: 8px 14px; font-weight: 600; cursor: pointer; font-size: 14px;
  }
  .toolbar button.secondary { background: #fff; color: #0a3a2a; border: 1px solid #0a3a2a; }
  .toolbar .meta { color: #555; font-size: 13px; }

  /* Avery 5160 / standard 30-up label sheet:
     Letter (8.5" x 11"), 3 columns x 10 rows, 2.625" x 1" labels,
     0.5" top/bottom margins, 0.1875" left/right (\u22480.19"), gutter \u2248 0.125" between cols. */
  .sheet {
    width: 8.5in; padding: 0.5in 0.1875in; margin: 16px auto;
    background: #fff;
    display: grid; grid-template-columns: repeat(3, 2.625in);
    column-gap: 0.125in; row-gap: 0;
  }
  .label {
    width: 2.625in; height: 1in;
    padding: 0.08in 0.12in; overflow: hidden;
    display: flex; flex-direction: column; justify-content: center;
    align-items: center; text-align: center;
    border: 1px dashed #ddd; /* visible on screen, hidden on print */
  }
  .label-title {
    font-size: 8.5pt; line-height: 1.15; font-weight: 600;
    max-height: 2.4em; overflow: hidden; text-overflow: ellipsis;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
    width: 100%;
  }
  .label-barcode { margin: 2px 0; line-height: 0; }
  .label-barcode svg { width: 2.3in; height: 0.4in; display: block; }
  .label-empty { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 9pt; }
  .label-sku { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 8pt; letter-spacing: 0.3px; }

  @media print {
    .toolbar { display: none; }
    .sheet { margin: 0; padding: 0.5in 0.1875in; }
    .label { border: 0; }
    @page { size: Letter; margin: 0; }
  }
</style>
</head>
<body>
  <div class="toolbar">
    <button onclick="window.print()">Print</button>
    <span class="meta">${items.length} label${items.length === 1 ? "" : "s"} \u2014 Avery 5160 (2.625\u201d \u00d7 1\u201d, 30 per sheet)</span>
  </div>
  <div class="sheet">${labelHtml}</div>
</body>
</html>`;

  // ---------- Strategy 1: hidden iframe ----------
  // window.open() is blocked inside the Perplexity sandbox iframe and inside
  // an installed iOS PWA — it surfaces as an "about:blank" error. A hidden
  // iframe with srcdoc avoids the pop-up entirely.
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
        // Leave the iframe in the DOM long enough for the print dialog to
        // capture the document, then clean up.
        setTimeout(() => iframe.remove(), 60_000);
      } catch {
        iframe.remove();
        openBlobFallback(html);
      }
    };

    document.body.appendChild(iframe);
    return;
  } catch {
    // fall through to blob fallback
  }

  openBlobFallback(html);
}

// Open the labels HTML as a Blob URL via a clicked anchor. This works in
// many contexts where window.open() is blocked. If the new tab is blocked
// too, we download the file as a last resort.
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
