import type { Express, Request, Response, NextFunction } from "express";
import type { Server } from "node:http";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import { storage } from "./storage";
import {
  insertUserSchema,
  insertItemSchema,
  insertShowSchema,
  insertOrderSchema,
  insertBusinessSettingsSchema,
  insertEmployeeSchema,
  insertExpenseSchema,
  insertCustomerSchema,
  insertShopSettingsSchema,
} from "@shared/schema";
import type { Item, Order, Expense, Customer, ShopSettings, WebOrder } from "@shared/schema";
import { generateListingFromImages } from "./ai";

const JWT_SECRET = process.env.JWT_SECRET || "crown-list-dev-secret-change-me";
const TOKEN_TTL = "30d";

declare module "express-serve-static-core" {
  interface Request {
    userId?: number;
    customerId?: number;
  }
}

function signToken(userId: number): string {
  return jwt.sign({ uid: userId }, JWT_SECRET, { expiresIn: TOKEN_TTL });
}

function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ message: "Missing auth token" });
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { uid: number };
    req.userId = payload.uid;
    next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}

function signCustomerToken(customerId: number): string {
  return jwt.sign({ cid: customerId }, JWT_SECRET, { expiresIn: TOKEN_TTL });
}

function customerAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ message: "Missing auth token" });
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { cid?: number };
    if (!payload.cid) return res.status(401).json({ message: "Invalid customer token" });
    req.customerId = payload.cid;
    next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}

// The single "operator" user id whose web inventory feeds the storefront.
// Defaults to user id 1 (Crown List's primary operator account).
function operatorUserId(): number {
  return parseInt(process.env.SHOP_OPERATOR_USER_ID || "1", 10);
}

function makeReferralCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return `CJV-${s}`;
}

function makeWebOrderNumber(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `CJ-O-${date}-${rand}`;
}

function computeTier(lifetimePoints: number, settings: ShopSettings): string {
  if (lifetimePoints >= settings.tierPlatinumAt) return "Platinum";
  if (lifetimePoints >= settings.tierGoldAt) return "Gold";
  if (lifetimePoints >= settings.tierSilverAt) return "Silver";
  return "Bronze";
}

function productPublicShape(it: Item, _originAbs: string) {
  let images: string[] = [];
  try {
    images = JSON.parse(it.imagesJson || "[]");
  } catch {}
  // Keep image paths as-is (relative /uploads/... or external https://). The shop client
  // will resolve relative paths through the backend proxy via resolveImageUrl.
  const absImages = images;
  const effectivePrice =
    it.webPrice && it.webPrice > 0
      ? it.webPrice
      : it.buyNowPrice && it.buyNowPrice > 0
      ? it.buyNowPrice
      : it.price;
  return {
    id: it.id,
    sku: it.sku,
    title: it.title,
    description: it.webDescription && it.webDescription.length > 0 ? it.webDescription : it.description,
    category: it.category,
    subCategory: it.subCategory,
    condition: it.condition,
    price: effectivePrice,
    images: absImages,
    weightOz: it.weightOz,
    quantity: it.quantity,
    status: it.status,
  };
}

let _stripeClient: any = null;
let _stripeKey: string = "";
async function getStripe(secretKey: string): Promise<any> {
  if (!secretKey) throw new Error("Stripe not configured. Operator must set Stripe keys in shop settings.");
  if (_stripeClient && _stripeKey === secretKey) return _stripeClient;
  const { default: Stripe } = await import("stripe");
  _stripeClient = new Stripe(secretKey);
  _stripeKey = secretKey;
  return _stripeClient;
}

function customerPublicShape(c: Customer) {
  return {
    id: c.id,
    email: c.email,
    firstName: c.firstName,
    lastName: c.lastName,
    phone: c.phone,
    addressLine1: c.addressLine1,
    addressLine2: c.addressLine2,
    city: c.city,
    state: c.state,
    postalCode: c.postalCode,
    country: c.country,
    pointsBalance: c.pointsBalance,
    lifetimePointsEarned: c.lifetimePointsEarned,
    tier: c.tier,
    referralCode: c.referralCode,
    referredByCode: c.referredByCode,
    createdAt: c.createdAt,
  };
}

// Allow JWT in query string for downloads (CSV) since headers can't be set on <a> clicks easily
function authFromQueryOrHeader(req: Request, res: Response, next: NextFunction) {
  let token: string | null = null;
  const header = req.headers.authorization || "";
  if (header.startsWith("Bearer ")) token = header.slice(7);
  if (!token && typeof req.query.token === "string") token = req.query.token;
  if (!token) return res.status(401).json({ message: "Missing auth token" });
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { uid: number };
    req.userId = payload.uid;
    next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}

// SKU helper: GP-YYYYMMDD-XXXX
function makeSku(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `CL-${date}-${rand}`;
}

// Order number helper: CL-O-YYYYMMDD-XXXX
function makeOrderNumber(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `CL-O-${date}-${rand}`;
}

// Bundle number helper: CL-B-YYYYMMDD-XXXX (assigned to all orders sharing
// the same shipment for one buyer).
function makeBundleNumber(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `CL-B-${date}-${rand}`;
}

// Smart bundling constraints
const BUNDLE_MAX_WEIGHT_OZ = 80; // 5 lb = 80 oz
const BUNDLE_MAX_BOX_INCHES = 12; // 12x12x12 reference box
const BUNDLE_MAX_VOLUME_IN3 = BUNDLE_MAX_BOX_INCHES ** 3; // 1728 in³

// Decide whether a new item fits into an existing bundle of items.
// Pragmatic check: any single dimension of any item must be ≤ 12”, the sum of
// item volumes must be ≤ 12³ (1728 in³), and the sum of item weights must
// be ≤ 80 oz. This is approximate — it doesn’t solve the 3D bin-packing
// problem — but matches a reasonable mental model for hand-packing into a
// 12×12×12 box.
function itemFitsBundle(
  candidate: Item,
  bundleItems: Item[],
): { fits: boolean; reason?: "weight" | "size" | "oversized" } {
  // Oversized item never fits in a 12” box.
  const tooLong = (it: Item) =>
    it.lengthIn > BUNDLE_MAX_BOX_INCHES ||
    it.widthIn > BUNDLE_MAX_BOX_INCHES ||
    it.heightIn > BUNDLE_MAX_BOX_INCHES;
  if (tooLong(candidate)) return { fits: false, reason: "oversized" };

  const sumOz =
    bundleItems.reduce((s, i) => s + (i.weightOz || 0), 0) + (candidate.weightOz || 0);
  if (sumOz > BUNDLE_MAX_WEIGHT_OZ) return { fits: false, reason: "weight" };

  const vol = (it: Item) =>
    Math.max(0, it.lengthIn || 0) * Math.max(0, it.widthIn || 0) * Math.max(0, it.heightIn || 0);
  const sumVol = bundleItems.reduce((s, i) => s + vol(i), 0) + vol(candidate);
  if (sumVol > BUNDLE_MAX_VOLUME_IN3) return { fits: false, reason: "size" };

  return { fits: true };
}

function firstHttpImage(item: Item, origin: string): string {
  try {
    const arr = JSON.parse(item.imagesJson);
    if (!Array.isArray(arr)) return "";
    for (const u of arr) {
      const abs = absolutizeImageUrl(u, origin);
      if (abs) return abs;
    }
    return "";
  } catch {
    return "";
  }
}

function csvSection(rows: (string | number)[][]): string {
  return rows.map((r) => r.map(csvEscape).join(",")).join("\n");
}

// Whatnot CSV columns (matches their bulk-upload template)
const WHATNOT_CSV_HEADERS = [
  "Category",
  "Sub Category",
  "Title",
  "Description",
  "Quantity",
  "Type",
  "Price",
  "Shipping Profile",
  "Offerable",
  "Condition",
  "Hazmat",
  "SKU",
  "Image URL 1",
  "Image URL 2",
  "Image URL 3",
  "Image URL 4",
  "Image URL 5",
  "Image URL 6",
  "Image URL 7",
  "Image URL 8",
];

function csvEscape(value: string | number): string {
  const s = String(value ?? "");
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

// Convert any image URL/path/data-url into a base64 data URL the AI can consume.
// - data: URLs pass through unchanged
// - /uploads/<file> reads from disk
// - http(s):// URLs are fetched and inlined
function urlToDataUrl(input: string): string {
  if (!input) return "";
  if (input.startsWith("data:")) return input;
  if (input.startsWith("/uploads/")) {
    const filename = path.basename(input);
    const filepath = path.join(UPLOAD_DIR, filename);
    try {
      const buf = fs.readFileSync(filepath);
      const ext = path.extname(filename).toLowerCase().replace(".", "") || "jpeg";
      const mime = ext === "jpg" ? "jpeg" : ext;
      return `data:image/${mime};base64,${buf.toString("base64")}`;
    } catch {
      return "";
    }
  }
  // For any other URL (deployed absolute URL pointing back to /uploads/, or external)
  // try to detect /uploads/ filename inside it and read locally
  const match = input.match(/\/uploads\/([^?#]+)/);
  if (match) {
    const filepath = path.join(UPLOAD_DIR, match[1]);
    try {
      const buf = fs.readFileSync(filepath);
      const ext = path.extname(match[1]).toLowerCase().replace(".", "") || "jpeg";
      const mime = ext === "jpg" ? "jpeg" : ext;
      return `data:image/${mime};base64,${buf.toString("base64")}`;
    } catch {
      // fall through to returning the URL as-is below
    }
  }
  // Last resort: return URL as-is — AI can try to fetch it
  if (/^https?:\/\//i.test(input)) return input;
  return "";
}

function absolutizeImageUrl(url: string, origin: string): string {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith("/uploads/")) return origin.replace(/\/$/, "") + url;
  return ""; // strip data: urls (Whatnot needs http URLs)
}

function itemsToCsv(items: Item[], origin: string): string {
  const rows = [WHATNOT_CSV_HEADERS.join(",")];
  for (const item of items) {
    const images: string[] = (() => {
      try {
        const arr = JSON.parse(item.imagesJson);
        return Array.isArray(arr) ? arr : [];
      } catch {
        return [];
      }
    })();
    const publicImages = images
      .map((u) => absolutizeImageUrl(u, origin))
      .filter((u) => /^https?:\/\//i.test(u));
    const imageCols: string[] = [];
    for (let i = 0; i < 8; i++) imageCols.push(publicImages[i] || "");

    const row = [
      item.category,
      item.subCategory,
      item.title,
      item.description,
      String(item.quantity),
      item.type,
      item.price.toFixed(2),
      item.shippingProfile,
      item.offerable ? "TRUE" : "FALSE",
      item.condition,
      item.hazmat ? "TRUE" : "FALSE",
      item.sku,
      ...imageCols,
    ].map(csvEscape);
    rows.push(row.join(","));
  }
  return rows.join("\n");
}

function getOrigin(req: Request): string {
  // Prefer X-Forwarded headers (deployed proxy), fallback to host
  const proto = (req.headers["x-forwarded-proto"] as string) || req.protocol;
  const host = (req.headers["x-forwarded-host"] as string) || req.headers.host || "";
  return `${proto}://${host}`;
}

// ----- Multer setup for photo uploads -----
// UPLOAD_DIR can be overridden by env var (e.g. /var/data/uploads on Render persistent disk).
const UPLOAD_DIR = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.resolve(process.cwd(), "uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || "").toLowerCase().slice(0, 6) || ".jpg";
      const safeExt = /^\.(jpe?g|png|webp|gif)$/i.test(ext) ? ext : ".jpg";
      const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      cb(null, `${id}${safeExt}`);
    },
  }),
  limits: { fileSize: 12 * 1024 * 1024, files: 8 }, // 12 MB per file, max 8
  fileFilter: (_req, file, cb) => {
    if (/^image\/(jpe?g|png|webp|gif)$/i.test(file.mimetype)) cb(null, true);
    else cb(new Error("Only image uploads allowed"));
  },
});

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  // bigger json body limit so multiple base64-encoded images can be posted
  const expressMod = (await import("express")).default;
  const bodyParser = expressMod.json({ limit: "30mb" });
  app.use("/api", bodyParser);

  // Static serving for uploaded photos (publicly accessible — needed for Whatnot CSV)
  app.use(
    "/uploads",
    expressMod.static(UPLOAD_DIR, {
      maxAge: "30d",
      immutable: true,
    }),
  );

  // ----- Auth -----
  app.post("/api/auth/signup", async (req: Request, res: Response) => {
    try {
      const data = insertUserSchema.parse(req.body);
      if (data.password.length < 6) {
        return res.status(400).json({ message: "Password must be at least 6 characters" });
      }
      const existing = await storage.getUserByUsername(data.username);
      if (existing) return res.status(409).json({ message: "Username already taken" });
      const hash = await bcrypt.hash(data.password, 10);
      const user = await storage.createUser({ username: data.username, password: hash });
      const token = signToken(user.id);
      res.json({ token, user: { id: user.id, username: user.username } });
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0]?.message || "Invalid input" });
      res.status(500).json({ message: err.message || "Signup failed" });
    }
  });

  app.post("/api/auth/login", async (req: Request, res: Response) => {
    try {
      const data = insertUserSchema.parse(req.body);
      const user = await storage.getUserByUsername(data.username);
      if (!user) return res.status(401).json({ message: "Invalid username or password" });
      const ok = await bcrypt.compare(data.password, user.password);
      if (!ok) return res.status(401).json({ message: "Invalid username or password" });
      const token = signToken(user.id);
      res.json({ token, user: { id: user.id, username: user.username } });
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0]?.message || "Invalid input" });
      res.status(500).json({ message: err.message || "Login failed" });
    }
  });

  app.get("/api/auth/me", authMiddleware, async (req: Request, res: Response) => {
    const user = await storage.getUser(req.userId!);
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json({ id: user.id, username: user.username });
  });

  // ----- Backup admin -----
  app.post("/api/admin/backup/run", authMiddleware, async (_req: Request, res: Response) => {
    const { runBackupNow } = await import("./backup-scheduler");
    const result = await runBackupNow();
    res.status(result.ok ? 200 : 500).json(result);
  });

  // ----- Photo upload (returns public URLs) -----
  app.post(
    "/api/upload",
    authMiddleware,
    upload.array("photos", 8),
    (req: Request, res: Response) => {
      const files = (req.files as Express.Multer.File[]) || [];
      const origin = getOrigin(req);
      const urls = files.map((f) => {
        const relative = `/uploads/${f.filename}`;
        return {
          url: relative,
          absoluteUrl: origin.replace(/\/$/, "") + relative,
          filename: f.filename,
          size: f.size,
        };
      });
      res.json({ files: urls });
    },
  );

  // ----- AI listing generation -----
  app.post("/api/ai/generate", authMiddleware, async (req: Request, res: Response) => {
    try {
      const schema = z.object({ images: z.array(z.string()).min(1).max(8) });
      const { images } = schema.parse(req.body);
      // Convert each image to a base64 data URL the model can consume directly.
      // We can't rely on the model fetching arbitrary URLs (sandbox/dev hosts may not be publicly reachable).
      const aiImages = images.map((u) => urlToDataUrl(u)).filter((s) => !!s);
      if (aiImages.length === 0) {
        return res.status(400).json({ message: "No readable images provided" });
      }
      const result = await generateListingFromImages(aiImages);
      res.json({ ...result, sku: makeSku() });
    } catch (err: any) {
      console.error("AI generate error:", err);
      res.status(500).json({ message: err.message || "AI generation failed" });
    }
  });

  // ----- Items CRUD -----
  app.get("/api/items", authMiddleware, async (req: Request, res: Response) => {
    const items = await storage.listItems(req.userId!);
    res.json(items);
  });

  app.post("/api/items", authMiddleware, async (req: Request, res: Response) => {
    try {
      const data = insertItemSchema.parse(req.body);
      if (!data.sku) data.sku = makeSku();
      const item = await storage.createItem(req.userId!, data);
      res.json(item);
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0]?.message || "Invalid input" });
      res.status(500).json({ message: err.message || "Create failed" });
    }
  });

  app.patch("/api/items/:id", authMiddleware, async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      const data = insertItemSchema.partial().parse(req.body);
      const item = await storage.updateItem(id, req.userId!, data);
      if (!item) return res.status(404).json({ message: "Not found" });
      res.json(item);
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0]?.message || "Invalid input" });
      res.status(500).json({ message: err.message || "Update failed" });
    }
  });

  app.delete("/api/items/:id", authMiddleware, async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const ok = await storage.deleteItem(id, req.userId!);
    if (!ok) return res.status(404).json({ message: "Not found" });
    res.json({ ok: true });
  });

  // ----- Bulk operations on items -----
  app.post("/api/items/bulk-delete", authMiddleware, async (req: Request, res: Response) => {
    try {
      const schema = z.object({ ids: z.array(z.number().int()).min(1) });
      const { ids } = schema.parse(req.body);
      const count = await storage.bulkDeleteItems(ids, req.userId!);
      res.json({ deleted: count });
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0]?.message || "Invalid input" });
      res.status(500).json({ message: err.message || "Bulk delete failed" });
    }
  });

  app.patch("/api/items/bulk-update", authMiddleware, async (req: Request, res: Response) => {
    try {
      const schema = z.object({
        ids: z.array(z.number().int()).min(1),
        patch: insertItemSchema.partial(),
      });
      const { ids, patch } = schema.parse(req.body);
      const count = await storage.bulkUpdateItems(ids, req.userId!, patch);
      res.json({ updated: count });
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0]?.message || "Invalid input" });
      res.status(500).json({ message: err.message || "Bulk update failed" });
    }
  });

  // ----- CSV export (Whatnot bulk upload format) -----
  app.get("/api/items/export.csv", authFromQueryOrHeader, async (req: Request, res: Response) => {
    const all = await storage.listItems(req.userId!);
    const status = (req.query.status as string) || "Active";
    const idsParam = (req.query.ids as string) || "";
    let filtered: Item[];
    if (idsParam) {
      const idSet = new Set(idsParam.split(",").map((x) => Number(x)).filter((x) => Number.isFinite(x)));
      filtered = all.filter((i) => idSet.has(i.id));
    } else {
      filtered = status === "all" ? all : all.filter((i) => i.status === status);
    }
    const csv = itemsToCsv(filtered, getOrigin(req));
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="whatnot-inventory-${Date.now()}.csv"`);
    res.send(csv);
  });

  // ----- Shows CRUD -----
  app.get("/api/shows", authMiddleware, async (req: Request, res: Response) => {
    const list = await storage.listShows(req.userId!);
    // Include item count + projected revenue for each show
    const enriched = await Promise.all(
      list.map(async (show) => {
        const { items } = await storage.getShowItems(show.id, req.userId!);
        const itemCount = items.length;
        const projectedRevenue = items.reduce(
          (sum, it) => sum + (it.buyNowPrice || it.price || 0) * (it.quantity || 1),
          0,
        );
        const totalCost = items.reduce(
          (sum, it) => sum + (it.sellerCost || 0) * (it.quantity || 1),
          0,
        );
        return { ...show, itemCount, projectedRevenue, totalCost };
      }),
    );
    res.json(enriched);
  });

  app.get("/api/shows/:id", authMiddleware, async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const show = await storage.getShow(id, req.userId!);
    if (!show) return res.status(404).json({ message: "Not found" });
    const { items } = await storage.getShowItems(id, req.userId!);
    res.json({ ...show, items });
  });

  app.post("/api/shows", authMiddleware, async (req: Request, res: Response) => {
    try {
      const data = insertShowSchema.parse(req.body);
      const show = await storage.createShow(req.userId!, data);
      res.json(show);
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0]?.message || "Invalid input" });
      res.status(500).json({ message: err.message || "Create failed" });
    }
  });

  app.patch("/api/shows/:id", authMiddleware, async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      const data = insertShowSchema.partial().parse(req.body);
      const show = await storage.updateShow(id, req.userId!, data);
      if (!show) return res.status(404).json({ message: "Not found" });
      res.json(show);
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0]?.message || "Invalid input" });
      res.status(500).json({ message: err.message || "Update failed" });
    }
  });

  app.delete("/api/shows/:id", authMiddleware, async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const ok = await storage.deleteShow(id, req.userId!);
    if (!ok) return res.status(404).json({ message: "Not found" });
    res.json({ ok: true });
  });

  app.post("/api/shows/:id/items", authMiddleware, async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      const schema = z.object({ itemIds: z.array(z.number().int()).min(1) });
      const { itemIds } = schema.parse(req.body);
      await storage.addItemsToShow(id, req.userId!, itemIds);
      const { items } = await storage.getShowItems(id, req.userId!);
      res.json({ items });
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0]?.message || "Invalid input" });
      res.status(500).json({ message: err.message || "Add failed" });
    }
  });

  app.delete("/api/shows/:id/items/:itemId", authMiddleware, async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const itemId = Number(req.params.itemId);
    await storage.removeItemFromShow(id, req.userId!, itemId);
    res.json({ ok: true });
  });

  app.patch("/api/shows/:id/items/order", authMiddleware, async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      const schema = z.object({ orderedItemIds: z.array(z.number().int()) });
      const { orderedItemIds } = schema.parse(req.body);
      await storage.reorderShowItems(id, req.userId!, orderedItemIds);
      const { items } = await storage.getShowItems(id, req.userId!);
      res.json({ items });
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0]?.message || "Invalid input" });
      res.status(500).json({ message: err.message || "Reorder failed" });
    }
  });

  app.get("/api/shows/:id/export.csv", authFromQueryOrHeader, async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const show = await storage.getShow(id, req.userId!);
    if (!show) return res.status(404).json({ message: "Not found" });
    const { items } = await storage.getShowItems(id, req.userId!);
    const csv = itemsToCsv(items, getOrigin(req));
    const safeName = (show.name || "show").replace(/[^a-z0-9_-]+/gi, "_").slice(0, 60);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${safeName}-${Date.now()}.csv"`);
    res.send(csv);
  });

  // ----- Orders -----

  // SKU lookup — find an item to start an order from
  app.get("/api/items/by-sku/:sku", authMiddleware, async (req: Request, res: Response) => {
    const sku = String(req.params.sku);
    const item = await storage.getItemBySku(sku, req.userId!);
    if (!item) return res.status(404).json({ message: `No item found with SKU ${sku}` });
    res.json(item);
  });

  app.get("/api/orders", authMiddleware, async (req: Request, res: Response) => {
    const showId = req.query.showId ? Number(req.query.showId) : undefined;
    const list = await storage.listOrders(req.userId!, showId !== undefined ? { showId } : undefined);
    res.json(list);
  });

  // Packing-list CSV export — for printing & shipping after a show
  // (must be registered BEFORE /api/orders/:id to avoid being matched as :id)
  app.get("/api/orders/export.csv", authFromQueryOrHeader, async (req: Request, res: Response) => {
    const showId = req.query.showId ? Number(req.query.showId) : undefined;
    const orderList = await storage.listOrders(req.userId!, showId !== undefined ? { showId } : undefined);
    const origin = getOrigin(req);

    const itemIds = Array.from(new Set(orderList.map((o) => o.itemId)));
    const itemsList = await storage.getItemsByIds(itemIds, req.userId!);
    const itemMap = new Map(itemsList.map((it) => [it.id, it]));
    const showIds = Array.from(new Set(orderList.map((o) => o.showId).filter((x) => x > 0)));
    const showMap = new Map<number, string>();
    for (const sid of showIds) {
      const s = await storage.getShow(sid, req.userId!);
      if (s) showMap.set(sid, s.name);
    }

    const headers = [
      "Bundle #",
      "Order #",
      "Buyer Name",
      "Buyer Handle",
      "Item #",
      "SKU",
      "Title",
      "Show",
      "Sale Price",
      "Qty",
      "Length (in)",
      "Width (in)",
      "Height (in)",
      "Weight (oz)",
      "Shipping Profile",
      "Buyer Address",
      "Packed",
      "Shipped",
      "Tracking #",
      "Notes",
      "Image URL",
    ];
    // Sort by bundle so packing-list groups same-buyer shipments together.
    const sortedOrders = [...orderList].sort((a, b) => {
      const aKey = a.bundleNumber || `\uffff${a.orderNumber}`;
      const bKey = b.bundleNumber || `\uffff${b.orderNumber}`;
      return aKey.localeCompare(bKey);
    });
    const rows: (string | number)[][] = [headers];
    for (const o of sortedOrders) {
      const item = itemMap.get(o.itemId);
      const showName = o.showId > 0 ? showMap.get(o.showId) || "" : "";
      rows.push([
        o.bundleNumber || "",
        o.orderNumber,
        o.buyerName,
        o.buyerHandle,
        String(o.itemId),
        o.itemSku,
        o.itemTitle,
        showName,
        o.salePrice.toFixed(2),
        String(o.quantity),
        item ? String(item.lengthIn || 0) : "",
        item ? String(item.widthIn || 0) : "",
        item ? String(item.heightIn || 0) : "",
        item ? String(item.weightOz || 0) : "",
        item ? item.shippingProfile : "",
        o.buyerAddress,
        o.packed ? "YES" : "",
        o.shipped ? "YES" : "",
        o.trackingNumber,
        o.notes,
        item ? firstHttpImage(item, origin) : "",
      ]);
    }

    const csv = csvSection(rows);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    const filename = showId !== undefined ? `packing-list-show-${showId}-${Date.now()}.csv` : `packing-list-${Date.now()}.csv`;
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(csv);
  });

  app.get("/api/orders/:id", authMiddleware, async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const order = await storage.getOrder(id, req.userId!);
    if (!order) return res.status(404).json({ message: "Not found" });
    res.json(order);
  });

  app.post("/api/orders", authMiddleware, async (req: Request, res: Response) => {
    try {
      const data = insertOrderSchema.parse(req.body);
      // Validate the item belongs to this user
      const item = await storage.getItem(data.itemId, req.userId!);
      if (!item) return res.status(400).json({ message: "Item not found" });

      // ----- Smart bundling -----
      // Find this buyer’s open (unshipped) orders. Group by bundle number.
      // Try to fit the new item into the most-recent open bundle. If it doesn’t
      // fit (weight ≥ 5 lb after add, or volume > 12×12×12), start a new bundle.
      let bundleNumber = "";
      let bundleNote: string | null = null;
      const buyerOrders = await storage.listOrdersByBuyer(
        req.userId!,
        data.buyerHandle || "",
        data.buyerName || "",
      );
      const openOrders = buyerOrders.filter((o) => !o.shipped);
      // Group open orders by their bundle number (most-recent first using created_at).
      const bundleMap = new Map<string, Order[]>();
      for (const o of openOrders) {
        const key = o.bundleNumber || `__solo_${o.id}`;
        if (!bundleMap.has(key)) bundleMap.set(key, []);
        bundleMap.get(key)!.push(o);
      }
      // Sort bundles by their newest order timestamp, descending.
      const bundleEntries = Array.from(bundleMap.entries()).sort((a, b) => {
        const aMax = Math.max(...a[1].map((o: Order) => o.createdAt));
        const bMax = Math.max(...b[1].map((o: Order) => o.createdAt));
        return bMax - aMax;
      });
      for (const [key, ordersInBundle] of bundleEntries) {
        if (key.startsWith("__solo_")) {
          // Legacy unbundled order — try to fold into a new combined bundle
          // along with the candidate, but only if the existing solo order has
          // a real bundle field we can backfill on. Skip otherwise.
          continue;
        }
        const itemIds = ordersInBundle.map((o: Order) => o.itemId);
        const bundleItems = await storage.getItemsByIds(itemIds, req.userId!);
        const result = itemFitsBundle(item, bundleItems);
        if (result.fits) {
          bundleNumber = key;
          break;
        }
      }
      if (!bundleNumber) {
        // Either this is the buyer’s first order, the item is oversized, or all
        // existing open bundles are full — start a new bundle.
        bundleNumber = makeBundleNumber();
        if (openOrders.length > 0) {
          bundleNote = "Limit reached — started a new bundle for this buyer.";
        }
      }

      // Snapshot item info + bundle
      const created = await storage.createOrder(req.userId!, {
        ...data,
        itemSku: data.itemSku || item.sku,
        itemTitle: data.itemTitle || item.title,
        salePrice: data.salePrice || item.buyNowPrice || item.price,
        showId: data.showId || 0,
        orderNumber: makeOrderNumber(),
        bundleNumber,
      });
      // Auto-update inventory: decrement quantity, mark sold + hide from shop when stock hits 0
      const orderQty = Math.max(1, data.quantity || 1);
      const newQty = Math.max(0, (item.quantity || 0) - orderQty);
      const patch: any = { quantity: newQty };
      if (newQty === 0) {
        patch.status = "Sold";
        patch.webVisible = 0;
      }
      await storage.updateItem(item.id, req.userId!, patch);
      res.json({ ...created, bundleNote });
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0]?.message || "Invalid input" });
      res.status(500).json({ message: err.message || "Create failed" });
    }
  });

  app.patch("/api/orders/:id", authMiddleware, async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      const data = insertOrderSchema.partial().parse(req.body);
      const order = await storage.updateOrder(id, req.userId!, data);
      if (!order) return res.status(404).json({ message: "Not found" });
      res.json(order);
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0]?.message || "Invalid input" });
      res.status(500).json({ message: err.message || "Update failed" });
    }
  });

  app.delete("/api/orders/:id", authMiddleware, async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const ok = await storage.deleteOrder(id, req.userId!);
    if (!ok) return res.status(404).json({ message: "Not found" });
    res.json({ ok: true });
  });

  // ----- Business settings -----
  app.get("/api/settings", authMiddleware, async (req: Request, res: Response) => {
    const row = await storage.getBusinessSettings(req.userId!);
    res.json(row);
  });
  app.patch("/api/settings", authMiddleware, async (req: Request, res: Response) => {
    try {
      const data = insertBusinessSettingsSchema.partial().parse(req.body);
      const row = await storage.upsertBusinessSettings(req.userId!, data);
      res.json(row);
    } catch (err: any) {
      if (err instanceof z.ZodError)
        return res.status(400).json({ message: err.errors[0]?.message || "Invalid input" });
      res.status(500).json({ message: err.message || "Update failed" });
    }
  });

  // ----- Employees -----
  app.get("/api/employees", authMiddleware, async (req: Request, res: Response) => {
    res.json(await storage.listEmployees(req.userId!));
  });
  app.post("/api/employees", authMiddleware, async (req: Request, res: Response) => {
    try {
      const data = insertEmployeeSchema.parse(req.body);
      res.json(await storage.createEmployee(req.userId!, data));
    } catch (err: any) {
      if (err instanceof z.ZodError)
        return res.status(400).json({ message: err.errors[0]?.message || "Invalid input" });
      res.status(500).json({ message: err.message || "Create failed" });
    }
  });
  app.patch("/api/employees/:id", authMiddleware, async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      const data = insertEmployeeSchema.partial().parse(req.body);
      const row = await storage.updateEmployee(id, req.userId!, data);
      if (!row) return res.status(404).json({ message: "Not found" });
      res.json(row);
    } catch (err: any) {
      if (err instanceof z.ZodError)
        return res.status(400).json({ message: err.errors[0]?.message || "Invalid input" });
      res.status(500).json({ message: err.message || "Update failed" });
    }
  });
  app.delete("/api/employees/:id", authMiddleware, async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const ok = await storage.deleteEmployee(id, req.userId!);
    if (!ok) return res.status(404).json({ message: "Not found" });
    res.json({ ok: true });
  });

  // ----- Expenses -----
  app.get("/api/expenses", authMiddleware, async (req: Request, res: Response) => {
    res.json(await storage.listExpenses(req.userId!));
  });
  app.post("/api/expenses", authMiddleware, async (req: Request, res: Response) => {
    try {
      const data = insertExpenseSchema.parse(req.body);
      if (!data.date) data.date = new Date().toISOString().slice(0, 10);
      res.json(await storage.createExpense(req.userId!, data));
    } catch (err: any) {
      if (err instanceof z.ZodError)
        return res.status(400).json({ message: err.errors[0]?.message || "Invalid input" });
      res.status(500).json({ message: err.message || "Create failed" });
    }
  });
  app.patch("/api/expenses/:id", authMiddleware, async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      const data = insertExpenseSchema.partial().parse(req.body);
      const row = await storage.updateExpense(id, req.userId!, data);
      if (!row) return res.status(404).json({ message: "Not found" });
      res.json(row);
    } catch (err: any) {
      if (err instanceof z.ZodError)
        return res.status(400).json({ message: err.errors[0]?.message || "Invalid input" });
      res.status(500).json({ message: err.message || "Update failed" });
    }
  });
  app.delete("/api/expenses/:id", authMiddleware, async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const ok = await storage.deleteExpense(id, req.userId!);
    if (!ok) return res.status(404).json({ message: "Not found" });
    res.json({ ok: true });
  });

  // ----- Reports summary -----
  // Computes revenue, fees, cost of goods, expenses, and net profit. Supports
  // optional ?from=YYYY-MM-DD&to=YYYY-MM-DD range filter on orders/expenses
  // by their createdAt (orders) and date (expenses).
  app.get("/api/reports/summary", authMiddleware, async (req: Request, res: Response) => {
    const userId = req.userId!;
    const fromStr = (req.query.from as string) || "";
    const toStr = (req.query.to as string) || "";
    const fromMs = fromStr ? new Date(fromStr + "T00:00:00").getTime() : 0;
    const toMs = toStr ? new Date(toStr + "T23:59:59").getTime() : Number.MAX_SAFE_INTEGER;

    const [settings, allOrders, allItems, allExpenses, allEmployees] = await Promise.all([
      storage.getBusinessSettings(userId),
      storage.listOrders(userId),
      storage.listItems(userId),
      storage.listExpenses(userId),
      storage.listEmployees(userId),
    ]);
    const itemMap = new Map(allItems.map((it) => [it.id, it]));

    const ordersInRange = allOrders.filter(
      (o) => o.createdAt >= fromMs && o.createdAt <= toMs,
    );
    const expensesInRange = allExpenses.filter((e) => {
      const t = new Date(e.date + "T12:00:00").getTime();
      return t >= fromMs && t <= toMs;
    });

    // Per-order computation
    const orderRows = ordersInRange.map((o) => {
      const gross = (o.salePrice || 0) * (o.quantity || 1);
      const commission = gross * ((settings.commissionPct || 0) / 100);
      const paymentFee =
        gross * ((settings.paymentFeePct || 0) / 100) + (settings.paymentFeeFixed || 0);
      const totalFees = commission + paymentFee;
      const item = itemMap.get(o.itemId);
      const cost = item ? (item.sellerCost || 0) * (o.quantity || 1) : 0;
      const profit = gross - totalFees - cost;
      return {
        orderId: o.id,
        orderNumber: o.orderNumber,
        createdAt: o.createdAt,
        month: new Date(o.createdAt).toISOString().slice(0, 7),
        buyer: o.buyerName || o.buyerHandle,
        itemSku: o.itemSku,
        itemTitle: o.itemTitle,
        gross,
        commission,
        paymentFee,
        totalFees,
        cost,
        profit,
      };
    });

    const totals = orderRows.reduce(
      (acc, r) => ({
        revenue: acc.revenue + r.gross,
        commission: acc.commission + r.commission,
        paymentFee: acc.paymentFee + r.paymentFee,
        totalFees: acc.totalFees + r.totalFees,
        cogs: acc.cogs + r.cost,
        grossProfit: acc.grossProfit + r.profit,
        orders: acc.orders + 1,
      }),
      { revenue: 0, commission: 0, paymentFee: 0, totalFees: 0, cogs: 0, grossProfit: 0, orders: 0 },
    );

    // Expense totals by category
    const expenseByCategory: Record<string, number> = {};
    let expensesTotal = 0;
    for (const e of expensesInRange) {
      expenseByCategory[e.category] = (expenseByCategory[e.category] || 0) + (e.amount || 0);
      expensesTotal += e.amount || 0;
    }

    const netProfit = totals.grossProfit - expensesTotal;

    // Monthly breakdown
    const months = new Map<string, { revenue: number; fees: number; cogs: number; profit: number; expenses: number; net: number }>();
    const ensure = (k: string) => {
      if (!months.has(k)) months.set(k, { revenue: 0, fees: 0, cogs: 0, profit: 0, expenses: 0, net: 0 });
      return months.get(k)!;
    };
    for (const r of orderRows) {
      const m = ensure(r.month);
      m.revenue += r.gross;
      m.fees += r.totalFees;
      m.cogs += r.cost;
      m.profit += r.profit;
    }
    for (const e of expensesInRange) {
      const month = e.date.slice(0, 7);
      const m = ensure(month);
      m.expenses += e.amount || 0;
    }
    months.forEach((v) => (v.net = v.profit - v.expenses));
    const monthly = Array.from(months.entries())
      .map(([month, v]) => ({ month, ...v }))
      .sort((a, b) => a.month.localeCompare(b.month));

    // Top items by revenue
    const itemAgg = new Map<
      number,
      { itemId: number; sku: string; title: string; units: number; revenue: number; profit: number }
    >();
    for (const r of orderRows) {
      const o = ordersInRange.find((x) => x.id === r.orderId);
      if (!o) continue;
      const key = o.itemId;
      const cur = itemAgg.get(key) || {
        itemId: key,
        sku: r.itemSku,
        title: r.itemTitle,
        units: 0,
        revenue: 0,
        profit: 0,
      };
      cur.units += o.quantity || 1;
      cur.revenue += r.gross;
      cur.profit += r.profit;
      itemAgg.set(key, cur);
    }
    const topItems = Array.from(itemAgg.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    // Budget data — current month vs target.
    const nowMonth = new Date().toISOString().slice(0, 7);
    const monthExpenses = allExpenses.filter((e) => e.date.startsWith(nowMonth));
    const monthInventorySpend = monthExpenses
      .filter((e) => e.category === "inventory")
      .reduce((s, e) => s + (e.amount || 0), 0);
    const monthPayrollSpend = monthExpenses
      .filter((e) => e.category === "payroll")
      .reduce((s, e) => s + (e.amount || 0), 0);
    const activePayroll = allEmployees
      .filter((e) => !!e.active)
      .reduce((s, e) => s + (e.monthlyPay || 0), 0);

    // Inventory on-hand value (sellerCost) — for balance-sheet style view
    const activeItems = allItems.filter((it) => it.status === "Active");
    const inventoryValue = activeItems.reduce(
      (s, it) => s + (it.sellerCost || 0) * (it.quantity || 1),
      0,
    );
    const inventoryRetailValue = activeItems.reduce(
      (s, it) => s + (it.buyNowPrice || it.price || 0) * (it.quantity || 1),
      0,
    );

    res.json({
      range: { from: fromStr, to: toStr },
      settings: {
        commissionPct: settings.commissionPct,
        paymentFeePct: settings.paymentFeePct,
        paymentFeeFixed: settings.paymentFeeFixed,
        monthlyInventoryBudget: settings.monthlyInventoryBudget,
        monthlyPayrollBudget: settings.monthlyPayrollBudget,
        monthlySavingsTarget: settings.monthlySavingsTarget,
      },
      totals: { ...totals, expensesTotal, netProfit },
      expenseByCategory,
      monthly,
      topItems,
      budget: {
        currentMonth: nowMonth,
        monthInventorySpend,
        monthPayrollSpend,
        scheduledPayroll: activePayroll,
        inventoryBudgetRemaining: (settings.monthlyInventoryBudget || 0) - monthInventorySpend,
        payrollBudgetRemaining: (settings.monthlyPayrollBudget || 0) - monthPayrollSpend,
        savingsTarget: settings.monthlySavingsTarget || 0,
      },
      inventory: {
        activeCount: activeItems.length,
        inventoryValue,
        inventoryRetailValue,
      },
      orderRows,
    });
  });

  // CSV export for the P&L report (per-order rows)
  app.get("/api/reports/orders.csv", authFromQueryOrHeader, async (req: Request, res: Response) => {
    const userId = req.userId!;
    const fromStr = (req.query.from as string) || "";
    const toStr = (req.query.to as string) || "";
    const fromMs = fromStr ? new Date(fromStr + "T00:00:00").getTime() : 0;
    const toMs = toStr ? new Date(toStr + "T23:59:59").getTime() : Number.MAX_SAFE_INTEGER;
    const [settings, allOrders, allItems] = await Promise.all([
      storage.getBusinessSettings(userId),
      storage.listOrders(userId),
      storage.listItems(userId),
    ]);
    const itemMap = new Map(allItems.map((it) => [it.id, it]));
    const rows: (string | number)[][] = [
      [
        "Order #",
        "Date",
        "Buyer",
        "SKU",
        "Title",
        "Qty",
        "Sale Price",
        "Gross",
        "Commission",
        "Payment Fee",
        "Total Fees",
        "Item Cost",
        "Profit",
      ],
    ];
    for (const o of allOrders.filter((o) => o.createdAt >= fromMs && o.createdAt <= toMs)) {
      const gross = (o.salePrice || 0) * (o.quantity || 1);
      const commission = gross * ((settings.commissionPct || 0) / 100);
      const paymentFee =
        gross * ((settings.paymentFeePct || 0) / 100) + (settings.paymentFeeFixed || 0);
      const totalFees = commission + paymentFee;
      const item = itemMap.get(o.itemId);
      const cost = item ? (item.sellerCost || 0) * (o.quantity || 1) : 0;
      const profit = gross - totalFees - cost;
      rows.push([
        o.orderNumber,
        new Date(o.createdAt).toISOString().slice(0, 10),
        o.buyerName || o.buyerHandle,
        o.itemSku,
        o.itemTitle,
        o.quantity,
        o.salePrice.toFixed(2),
        gross.toFixed(2),
        commission.toFixed(2),
        paymentFee.toFixed(2),
        totalFees.toFixed(2),
        cost.toFixed(2),
        profit.toFixed(2),
      ]);
    }
    const csv = csvSection(rows);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="crown-list-pnl-${Date.now()}.csv"`,
    );
    res.send(csv);
  });

  // ============================================================
  // CROWNED JEWEL VINTAGE SHOP ROUTES
  // ============================================================

  // ----- Public storefront -----
  app.get("/api/shop/products", async (req: Request, res: Response) => {
    const origin = getOrigin(req);
    const products = await storage.listWebProducts();
    res.json(products.map((p) => productPublicShape(p, origin)));
  });

  app.get("/api/shop/products/:id", async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const product = await storage.getWebProduct(id);
    if (!product) return res.status(404).json({ message: "Product not found" });
    res.json(productPublicShape(product, getOrigin(req)));
  });

  app.get("/api/shop/settings", async (_req: Request, res: Response) => {
    const s = await storage.getShopSettings(operatorUserId());
    res.json({
      pointsPerDollar: s.pointsPerDollar,
      pointsPerDollarRedeem: s.pointsPerDollarRedeem,
      signupBonus: s.signupBonus,
      referralBonus: s.referralBonus,
      tierSilverAt: s.tierSilverAt,
      tierGoldAt: s.tierGoldAt,
      tierPlatinumAt: s.tierPlatinumAt,
      freeShippingThreshold: s.freeShippingThreshold,
      flatShippingRate: s.flatShippingRate,
      stripePublishableKey: s.stripePublishableKey,
      stripeEnabled: !!(s.stripePublishableKey && s.stripeSecretKey),
      shopName: s.shopName,
      heroEyebrow: s.heroEyebrow,
      heroTitle: s.heroTitle,
      heroTitleItalic: s.heroTitleItalic,
      heroSubtitle: s.heroSubtitle,
      announcementBar: s.announcementBar,
      aboutText: s.aboutText,
      contactEmail: s.contactEmail,
      instagramUrl: s.instagramUrl,
      whatnotUrl: s.whatnotUrl,
      taxRate: s.taxRate,
    });
  });

  // ----- Customer auth -----
  app.post("/api/shop/customers/signup", async (req: Request, res: Response) => {
    try {
      const schema = z.object({
        email: z.string().email(),
        password: z.string().min(6),
        firstName: z.string().min(1),
        lastName: z.string().min(1),
        referralCode: z.string().optional().default(""),
      });
      const data = schema.parse(req.body);
      const existing = await storage.getCustomerByEmail(data.email);
      if (existing) return res.status(409).json({ message: "Email already registered" });

      // Generate unique referral code
      let refCode = makeReferralCode();
      while (await storage.getCustomerByReferralCode(refCode)) refCode = makeReferralCode();

      const hash = await bcrypt.hash(data.password, 10);
      const referredByCode = (data.referralCode || "").toUpperCase().trim();
      const customer = await storage.createCustomer({
        email: data.email,
        password: hash,
        firstName: data.firstName,
        lastName: data.lastName,
        phone: "",
        addressLine1: "",
        addressLine2: "",
        city: "",
        state: "",
        postalCode: "",
        country: "US",
        referredByCode,
        referralCode: refCode,
      });

      // Apply signup bonus
      const settings = await storage.getShopSettings(operatorUserId());
      if (settings.signupBonus > 0) {
        await storage.adjustCustomerPoints(
          customer.id,
          settings.signupBonus,
          "signup_bonus",
          0,
          "Welcome bonus",
        );
      }

      const fresh = (await storage.getCustomer(customer.id))!;
      const token = signCustomerToken(customer.id);
      res.json({ token, customer: customerPublicShape(fresh) });
    } catch (err: any) {
      if (err instanceof z.ZodError)
        return res.status(400).json({ message: err.errors[0]?.message || "Invalid input" });
      res.status(500).json({ message: err.message || "Signup failed" });
    }
  });

  app.post("/api/shop/customers/login", async (req: Request, res: Response) => {
    try {
      const schema = z.object({ email: z.string().email(), password: z.string().min(1) });
      const data = schema.parse(req.body);
      const customer = await storage.getCustomerByEmail(data.email);
      if (!customer) return res.status(401).json({ message: "Invalid email or password" });
      const ok = await bcrypt.compare(data.password, customer.password);
      if (!ok) return res.status(401).json({ message: "Invalid email or password" });
      const token = signCustomerToken(customer.id);
      res.json({ token, customer: customerPublicShape(customer) });
    } catch (err: any) {
      if (err instanceof z.ZodError)
        return res.status(400).json({ message: err.errors[0]?.message || "Invalid input" });
      res.status(500).json({ message: err.message || "Login failed" });
    }
  });

  app.get("/api/shop/customers/me", customerAuthMiddleware, async (req: Request, res: Response) => {
    const customer = await storage.getCustomer(req.customerId!);
    if (!customer) return res.status(404).json({ message: "Customer not found" });
    res.json(customerPublicShape(customer));
  });

  app.patch(
    "/api/shop/customers/me",
    customerAuthMiddleware,
    async (req: Request, res: Response) => {
      const allowed = [
        "firstName",
        "lastName",
        "phone",
        "addressLine1",
        "addressLine2",
        "city",
        "state",
        "postalCode",
        "country",
      ];
      const patch: any = {};
      for (const k of allowed) {
        if (req.body[k] !== undefined) patch[k] = String(req.body[k]);
      }
      const updated = await storage.updateCustomer(req.customerId!, patch);
      if (!updated) return res.status(404).json({ message: "Customer not found" });
      res.json(customerPublicShape(updated));
    },
  );

  app.get(
    "/api/shop/customers/me/orders",
    customerAuthMiddleware,
    async (req: Request, res: Response) => {
      const orders = await storage.listWebOrdersByCustomer(req.customerId!);
      res.json(orders);
    },
  );

  app.get(
    "/api/shop/customers/me/rewards",
    customerAuthMiddleware,
    async (req: Request, res: Response) => {
      const txs = await storage.listRewardsTransactions(req.customerId!);
      res.json(txs);
    },
  );

  // ----- Checkout -----
  async function computeCartSummary(
    cartItems: Array<{ itemId: number; qty: number }>,
    pointsToRedeem: number,
  ) {
    const settings = await storage.getShopSettings(operatorUserId());
    const itemIds = cartItems.map((c) => c.itemId);
    // Operator-wide visibility check (matches public shop listing) — not userId-scoped
    const products = await storage.getWebProductsByIds(itemIds);
    const productMap = new Map(products.map((p) => [p.id, p]));
    const lineItems: any[] = [];
    let subtotal = 0;
    for (const c of cartItems) {
      const p = productMap.get(c.itemId);
      if (!p) throw new Error(`Product ${c.itemId} no longer available`);
      if (p.status !== "Active" || p.webVisible !== 1)
        throw new Error(`Product "${p.title}" is no longer available`);
      if (p.quantity < c.qty) throw new Error(`Insufficient stock for "${p.title}"`);
      const unitPrice =
        p.webPrice && p.webPrice > 0
          ? p.webPrice
          : p.buyNowPrice && p.buyNowPrice > 0
          ? p.buyNowPrice
          : p.price;
      let images: string[] = [];
      try {
        images = JSON.parse(p.imagesJson || "[]");
      } catch {}
      lineItems.push({
        itemId: p.id,
        sku: p.sku,
        title: p.title,
        qty: c.qty,
        unitPrice,
        imageUrl: images[0] || "",
      });
      subtotal += unitPrice * c.qty;
    }
    const shippingTotal = subtotal >= settings.freeShippingThreshold ? 0 : settings.flatShippingRate;
    // Points redemption -> dollar discount
    const maxPointsValue = subtotal; // can't redeem more than subtotal
    const requestedValue =
      settings.pointsPerDollarRedeem > 0 ? pointsToRedeem / settings.pointsPerDollarRedeem : 0;
    const pointsValueApplied = Math.max(0, Math.min(maxPointsValue, requestedValue));
    const pointsActuallyRedeemed = Math.round(pointsValueApplied * settings.pointsPerDollarRedeem);
    const discount = pointsValueApplied;
    const tax = 0;
    const total = Math.max(0, subtotal + shippingTotal + tax - discount);
    const pointsEarned = Math.round(subtotal * settings.pointsPerDollar);
    return {
      lineItems,
      subtotal,
      shippingTotal,
      tax,
      discount,
      pointsRedeemed: pointsActuallyRedeemed,
      pointsValueApplied,
      total,
      pointsEarned,
      settings,
    };
  }

  const shippingAddressSchema = z
    .union([
      z.string(),
      z.object({
        firstName: z.string().optional().default(""),
        lastName: z.string().optional().default(""),
        addressLine1: z.string().optional().default(""),
        addressLine2: z.string().optional().default(""),
        city: z.string().optional().default(""),
        state: z.string().optional().default(""),
        postalCode: z.string().optional().default(""),
        country: z.string().optional().default("US"),
        phone: z.string().optional().default(""),
      }),
    ])
    .default("")
    .transform((v) => (typeof v === "string" ? v : JSON.stringify(v)));

  app.post(
    "/api/shop/checkout/create-intent",
    customerAuthMiddleware,
    async (req: Request, res: Response) => {
      try {
        const schema = z.object({
          items: z.array(z.object({ itemId: z.number(), qty: z.number().min(1) })).min(1),
          pointsToRedeem: z.number().min(0).default(0),
          shippingAddress: shippingAddressSchema,
        });
        const data = schema.parse(req.body);
        const customer = await storage.getCustomer(req.customerId!);
        if (!customer) return res.status(404).json({ message: "Customer not found" });
        if (data.pointsToRedeem > customer.pointsBalance)
          return res.status(400).json({ message: "Not enough points to redeem" });
        const summary = await computeCartSummary(data.items, data.pointsToRedeem);
        if (!summary.settings.stripeSecretKey) {
          return res.status(400).json({
            message: "Stripe not configured. Operator must set Stripe keys in shop settings.",
          });
        }
        const stripe = await getStripe(summary.settings.stripeSecretKey);
        const intent = await stripe.paymentIntents.create({
          amount: Math.round(summary.total * 100),
          currency: "usd",
          automatic_payment_methods: { enabled: true },
          metadata: {
            customerId: String(customer.id),
            customerEmail: customer.email,
          },
        });
        res.json({
          clientSecret: intent.client_secret,
          paymentIntentId: intent.id,
          summary: {
            lineItems: summary.lineItems,
            subtotal: summary.subtotal,
            shippingTotal: summary.shippingTotal,
            tax: summary.tax,
            discount: summary.discount,
            pointsRedeemed: summary.pointsRedeemed,
            pointsValueApplied: summary.pointsValueApplied,
            total: summary.total,
            pointsEarned: summary.pointsEarned,
          },
        });
      } catch (err: any) {
        if (err instanceof z.ZodError)
          return res.status(400).json({ message: err.errors[0]?.message || "Invalid input" });
        res.status(400).json({ message: err.message || "Could not create payment intent" });
      }
    },
  );

  app.post(
    "/api/shop/checkout/confirm",
    customerAuthMiddleware,
    async (req: Request, res: Response) => {
      try {
        const schema = z.object({
          paymentIntentId: z.string().min(1),
          items: z.array(z.object({ itemId: z.number(), qty: z.number().min(1) })).min(1),
          pointsToRedeem: z.number().min(0).default(0),
          shippingAddress: shippingAddressSchema,
        });
        const data = schema.parse(req.body);
        const customer = await storage.getCustomer(req.customerId!);
        if (!customer) return res.status(404).json({ message: "Customer not found" });
        const summary = await computeCartSummary(data.items, data.pointsToRedeem);
        const stripe = await getStripe(summary.settings.stripeSecretKey);
        const intent = await stripe.paymentIntents.retrieve(data.paymentIntentId);
        if (intent.status !== "succeeded") {
          return res.status(400).json({ message: `Payment not completed (status: ${intent.status})` });
        }

        // Mark items as sold, decrement quantity, hide if zero
        for (const li of summary.lineItems) {
          const item = await storage.getItem(li.itemId, operatorUserId());
          if (!item) continue;
          const newQty = Math.max(0, item.quantity - li.qty);
          const patch: any = { quantity: newQty };
          if (newQty === 0) {
            patch.status = "Sold";
            patch.webVisible = 0;
          }
          await storage.updateItem(item.id, operatorUserId(), patch);
        }

        const orderNumber = makeWebOrderNumber();
        const order = await storage.createWebOrder({
          orderNumber,
          customerId: customer.id,
          itemsJson: JSON.stringify(summary.lineItems),
          subtotal: summary.subtotal,
          shippingTotal: summary.shippingTotal,
          tax: summary.tax,
          discount: summary.discount,
          pointsRedeemed: summary.pointsRedeemed,
          pointsValueApplied: summary.pointsValueApplied,
          total: summary.total,
          pointsEarned: summary.pointsEarned,
          stripePaymentIntentId: data.paymentIntentId,
          paymentStatus: "paid",
          fulfillmentStatus: "new",
          trackingNumber: "",
          shippingAddress: data.shippingAddress,
          notes: "",
        });

        // Deduct points redeemed
        if (summary.pointsRedeemed > 0) {
          await storage.adjustCustomerPoints(
            customer.id,
            -summary.pointsRedeemed,
            "redeemed",
            order.id,
            `Redeemed at checkout ${orderNumber}`,
          );
        }
        // Award points earned
        if (summary.pointsEarned > 0) {
          await storage.adjustCustomerPoints(
            customer.id,
            summary.pointsEarned,
            "earned_purchase",
            order.id,
            `Earned on ${orderNumber}`,
          );
        }

        // First-purchase referral bonus
        const prevOrders = await storage.listWebOrdersByCustomer(customer.id);
        const isFirst = prevOrders.length === 1; // includes the order we just created
        if (isFirst && customer.referredByCode) {
          const referrer = await storage.getCustomerByReferralCode(customer.referredByCode);
          if (referrer && summary.settings.referralBonus > 0) {
            await storage.adjustCustomerPoints(
              referrer.id,
              summary.settings.referralBonus,
              "referral_bonus",
              order.id,
              `Referral bonus from ${customer.email}`,
            );
            // Re-evaluate referrer's tier
            const refFresh = await storage.getCustomer(referrer.id);
            if (refFresh) {
              const newTier = computeTier(refFresh.lifetimePointsEarned, summary.settings);
              if (newTier !== refFresh.tier) {
                await storage.updateCustomer(referrer.id, { tier: newTier });
              }
            }
          }
        }

        // Re-evaluate this customer's tier
        const fresh = (await storage.getCustomer(customer.id))!;
        const newTier = computeTier(fresh.lifetimePointsEarned, summary.settings);
        if (newTier !== fresh.tier) {
          await storage.updateCustomer(customer.id, { tier: newTier });
        }

        const finalCustomer = (await storage.getCustomer(customer.id))!;
        res.json({
          orderNumber,
          pointsEarned: summary.pointsEarned,
          newBalance: finalCustomer.pointsBalance,
          newTier: finalCustomer.tier,
        });
      } catch (err: any) {
        if (err instanceof z.ZodError)
          return res.status(400).json({ message: err.errors[0]?.message || "Invalid input" });
        res.status(400).json({ message: err.message || "Checkout failed" });
      }
    },
  );

  // ----- Public order lookup (by number, for confirmation page) -----
  app.get(
    "/api/shop/orders/:orderNumber",
    customerAuthMiddleware,
    async (req: Request, res: Response) => {
      const order = await storage.getWebOrderByNumber(req.params.orderNumber);
      if (!order) return res.status(404).json({ message: "Order not found" });
      if (order.customerId !== req.customerId)
        return res.status(403).json({ message: "Not your order" });
      res.json(order);
    },
  );

  // ----- Operator item web fields -----
  app.patch("/api/items/:id/web", authMiddleware, async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const schema = z.object({
      webVisible: z.union([z.literal(0), z.literal(1)]).optional(),
      webPrice: z.number().min(0).optional(),
      webDescription: z.string().optional(),
    });
    try {
      const patch = schema.parse(req.body);
      const item = await storage.updateItem(id, req.userId!, patch as any);
      if (!item) return res.status(404).json({ message: "Item not found" });
      res.json(item);
    } catch (err: any) {
      if (err instanceof z.ZodError)
        return res.status(400).json({ message: err.errors[0]?.message || "Invalid input" });
      res.status(500).json({ message: err.message || "Update failed" });
    }
  });

  app.post("/api/items/bulk/web", authMiddleware, async (req: Request, res: Response) => {
    const schema = z.object({
      ids: z.array(z.number()).min(1),
      webVisible: z.union([z.literal(0), z.literal(1)]),
    });
    try {
      const data = schema.parse(req.body);
      const updated = await storage.bulkUpdateItems(data.ids, req.userId!, {
        webVisible: data.webVisible,
      } as any);
      res.json({ updated });
    } catch (err: any) {
      if (err instanceof z.ZodError)
        return res.status(400).json({ message: err.errors[0]?.message || "Invalid input" });
      res.status(500).json({ message: err.message || "Bulk update failed" });
    }
  });

  // ----- Operator shop admin -----
  app.get("/api/shop/admin/orders", authMiddleware, async (_req: Request, res: Response) => {
    const orders = await storage.listWebOrders();
    const customers = await storage.listCustomers();
    const cmap = new Map(customers.map((c) => [c.id, c]));
    res.json(
      orders.map((o) => {
        const c = cmap.get(o.customerId);
        return {
          ...o,
          customerName: c ? `${c.firstName} ${c.lastName}`.trim() || c.email : "",
          customerEmail: c?.email || "",
        };
      }),
    );
  });

  app.patch("/api/shop/admin/orders/:id", authMiddleware, async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const allowed = ["fulfillmentStatus", "trackingNumber", "notes", "paymentStatus"];
    const patch: any = {};
    for (const k of allowed) if (req.body[k] !== undefined) patch[k] = req.body[k];
    const updated = await storage.updateWebOrder(id, patch);
    if (!updated) return res.status(404).json({ message: "Order not found" });
    res.json(updated);
  });

  // ----- Shipping label (Shippo) -----
  // Fetch rates for an order. Operator supplies parcel dims + weight in body.
  app.post("/api/shop/admin/orders/:id/shipping/rates", authMiddleware, async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      const order = await storage.getWebOrder(id);
      if (!order) return res.status(404).json({ message: "Order not found" });

      const { lengthIn, widthIn, heightIn, weightOz } = req.body || {};
      const L = Number(lengthIn), W = Number(widthIn), H = Number(heightIn), Wt = Number(weightOz);
      if (!(L > 0 && W > 0 && H > 0 && Wt > 0)) {
        return res.status(400).json({ message: "lengthIn, widthIn, heightIn, weightOz must all be > 0" });
      }

      const customer = await storage.getCustomer(order.customerId);
      const { parseStoredShippingAddress, createShipment } = await import("./shippo");
      const to = parseStoredShippingAddress(
        order.shippingAddress,
        customer?.name || "",
        customer?.email || "",
      );
      if (!to) {
        return res.status(400).json({
          message: "Order has no parseable shipping address",
        });
      }

      const shipment = await createShipment(to, {
        length: String(L),
        width: String(W),
        height: String(H),
        distance_unit: "in",
        weight: String(Wt),
        mass_unit: "oz",
      });
      const rates = (shipment.rates || []).map((r) => ({
        rateId: r.object_id,
        carrier: r.provider,
        service: r.servicelevel?.name || r.servicelevel?.token || "",
        amount: Number(r.amount),
        currency: r.currency,
        estimatedDays: r.estimated_days,
        attributes: r.attributes || [],
      }));
      rates.sort((a, b) => a.amount - b.amount);
      res.json({ shipmentId: shipment.object_id, rates, messages: shipment.messages || [] });
    } catch (err: any) {
      console.error("[shipping rates]", err);
      res.status(500).json({ message: err.message || "Failed to fetch rates" });
    }
  });

  // Buy a rate, store the label URL + tracking number on the order.
  app.post("/api/shop/admin/orders/:id/shipping/label", authMiddleware, async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      const { rateId, carrier, serviceLevel } = req.body || {};
      if (!rateId) return res.status(400).json({ message: "rateId required" });

      const order = await storage.getWebOrder(id);
      if (!order) return res.status(404).json({ message: "Order not found" });

      const { buyRate } = await import("./shippo");
      const txn = await buyRate(String(rateId));
      if (txn.status !== "SUCCESS") {
        const msg = (txn.messages || []).map((m) => m.text).join("; ") || `Shippo status ${txn.status}`;
        return res.status(502).json({ message: `Label purchase failed: ${msg}` });
      }

      const updated = await storage.updateWebOrder(id, {
        shippoTransactionId: txn.object_id,
        labelUrl: txn.label_url,
        trackingNumber: txn.tracking_number,
        carrier: carrier || "",
        serviceLevel: serviceLevel || "",
        fulfillmentStatus: order.fulfillmentStatus === "shipped" ? order.fulfillmentStatus : "shipped",
      });
      res.json({
        ok: true,
        labelUrl: txn.label_url,
        trackingNumber: txn.tracking_number,
        trackingUrl: txn.tracking_url_provider,
        order: updated,
      });
    } catch (err: any) {
      console.error("[shipping label]", err);
      res.status(500).json({ message: err.message || "Failed to buy label" });
    }
  });

  app.get("/api/shop/admin/customers", authMiddleware, async (_req: Request, res: Response) => {
    const customers = await storage.listCustomers();
    const orders = await storage.listWebOrders();
    const out = customers.map((c) => {
      const cOrders = orders.filter((o) => o.customerId === c.id);
      const lifetimeSpend = cOrders.reduce((sum, o) => sum + (o.total || 0), 0);
      return {
        ...customerPublicShape(c),
        ordersCount: cOrders.length,
        lifetimeSpend,
      };
    });
    res.json(out);
  });

  app.get("/api/shop/admin/customers/:id", authMiddleware, async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const c = await storage.getCustomer(id);
    if (!c) return res.status(404).json({ message: "Customer not found" });
    const orders = await storage.listWebOrdersByCustomer(id);
    const rewards = await storage.listRewardsTransactions(id);
    res.json({ customer: customerPublicShape(c), orders, rewards });
  });

  app.patch(
    "/api/shop/admin/customers/:id/points",
    authMiddleware,
    async (req: Request, res: Response) => {
      const id = Number(req.params.id);
      const schema = z.object({
        delta: z.number().int(),
        note: z.string().default(""),
      });
      try {
        const data = schema.parse(req.body);
        const result = await storage.adjustCustomerPoints(
          id,
          data.delta,
          "manual_adjust",
          0,
          data.note,
        );
        if (!result) return res.status(404).json({ message: "Customer not found" });
        // Re-eval tier
        const settings = await storage.getShopSettings(operatorUserId());
        const newTier = computeTier(result.customer.lifetimePointsEarned, settings);
        if (newTier !== result.customer.tier) {
          await storage.updateCustomer(id, { tier: newTier });
        }
        const fresh = await storage.getCustomer(id);
        res.json({ customer: customerPublicShape(fresh!), tx: result.tx });
      } catch (err: any) {
        if (err instanceof z.ZodError)
          return res.status(400).json({ message: err.errors[0]?.message || "Invalid input" });
        res.status(500).json({ message: err.message || "Adjustment failed" });
      }
    },
  );

  app.get("/api/shop/admin/settings", authMiddleware, async (req: Request, res: Response) => {
    const s = await storage.getShopSettings(operatorUserId());
    res.json(s);
  });

  app.patch("/api/shop/admin/settings", authMiddleware, async (req: Request, res: Response) => {
    try {
      const schema = insertShopSettingsSchema.partial();
      const patch = schema.parse(req.body);
      const s = await storage.updateShopSettings(operatorUserId(), patch);
      res.json(s);
    } catch (err: any) {
      if (err instanceof z.ZodError)
        return res.status(400).json({ message: err.errors[0]?.message || "Invalid input" });
      res.status(500).json({ message: err.message || "Settings update failed" });
    }
  });

  app.get("/api/shop/admin/analytics", authMiddleware, async (_req: Request, res: Response) => {
    const orders = await storage.listWebOrders();
    const customers = await storage.listCustomers();
    const now = Date.now();
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    const recent = orders.filter((o) => now - o.createdAt < thirtyDays);
    const webRevenue30d = recent.reduce((s, o) => s + (o.total || 0), 0);
    const webOrders30d = recent.length;
    // Top web products: aggregate from items_json
    const productAgg = new Map<number, { itemId: number; title: string; qty: number; revenue: number }>();
    for (const o of orders) {
      try {
        const items = JSON.parse(o.itemsJson || "[]") as any[];
        for (const li of items) {
          const cur = productAgg.get(li.itemId) || {
            itemId: li.itemId,
            title: li.title,
            qty: 0,
            revenue: 0,
          };
          cur.qty += li.qty || 0;
          cur.revenue += (li.unitPrice || 0) * (li.qty || 0);
          productAgg.set(li.itemId, cur);
        }
      } catch {}
    }
    const topWebProducts = Array.from(productAgg.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);
    const totalCustomers = customers.length;
    const totalPointsOutstanding = customers.reduce((s, c) => s + c.pointsBalance, 0);
    const totalPointsRedeemed = orders.reduce((s, o) => s + (o.pointsRedeemed || 0), 0);
    res.json({
      webRevenue30d,
      webOrders30d,
      topWebProducts,
      totalCustomers,
      totalPointsOutstanding,
      totalPointsRedeemed,
    });
  });

  // health
  app.get("/api/health", (_req, res) => res.json({ ok: true }));

  return httpServer;
}
