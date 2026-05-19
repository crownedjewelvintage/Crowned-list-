import { API_URL, getAuthToken } from "./queryClient";
import type { Item } from "@shared/schema";

// Resolve a stored photo path to a URL the browser can fetch in BOTH dev and
// deployed contexts. Stored values may be:
//   - relative "/uploads/xyz.jpg"
//   - absolute "http://localhost:5000/uploads/xyz.jpg" (legacy — broken in deployed)
//   - absolute external URL
//   - data URL
// We always rewrite anything that looks like an /uploads/... path through the
// queryClient API_BASE so it goes through the deploy proxy.
export function resolvePhotoUrl(stored: string): string {
  if (!stored) return stored;
  if (stored.startsWith("data:")) return stored;
  // Pull out /uploads/<filename> if present anywhere in the URL.
  const m = stored.match(/\/uploads\/[^?#]+/);
  if (m) return API_URL(m[0]);
  if (stored.startsWith("/")) return API_URL(stored);
  return stored;
}

// Returns the RAW stored values — do not transform here, because parseImages
// is also used to seed the edit form state, which gets saved back to the DB.
// For rendering, wrap with resolvePhotoUrl() at the call site.
export function parseImages(json: string): string[] {
  try {
    const arr = JSON.parse(json);
    return Array.isArray(arr) ? arr.filter((s) => typeof s === "string") : [];
  } catch {
    return [];
  }
}

export async function uploadPhotos(files: File[]): Promise<string[]> {
  if (files.length === 0) return [];
  const fd = new FormData();
  files.forEach((f) => fd.append("photos", f));
  const res = await fetch(API_URL("/api/upload"), {
    method: "POST",
    headers: { Authorization: `Bearer ${getAuthToken()}` },
    body: fd,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Upload failed (${res.status})`);
  }
  const data = (await res.json()) as { files: { url: string; absoluteUrl: string }[] };
  // Always store the RELATIVE path ("/uploads/<file>"). resolvePhotoUrl will
  // route it through the deploy proxy (__PORT_5000__) at render time.
  // The legacy absoluteUrl (e.g. http://localhost:5000/...) is unreachable from
  // a deployed S3-hosted frontend, so we never persist it.
  return data.files.map((f) => f.url);
}

export async function downloadCsv(url: string, filename: string): Promise<void> {
  const sep = url.includes("?") ? "&" : "?";
  const tokenParam = `${sep}token=${encodeURIComponent(getAuthToken() || "")}`;
  const res = await fetch(API_URL(url + tokenParam), {
    headers: { Authorization: `Bearer ${getAuthToken()}` },
  });
  if (!res.ok) throw new Error("Export failed");
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}

export function profit(item: Item): number {
  const p = item.buyNowPrice || item.price || 0;
  const c = item.sellerCost || 0;
  return (p - c) * (item.quantity || 1);
}

export function marginPct(item: Item): number {
  const p = item.buyNowPrice || item.price || 0;
  const c = item.sellerCost || 0;
  if (p <= 0) return 0;
  return ((p - c) / p) * 100;
}
