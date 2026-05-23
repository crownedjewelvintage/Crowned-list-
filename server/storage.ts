import {
  users,
  items,
  shows,
  showItems,
  orders,
  businessSettings,
  employees,
  expenses,
  customers,
  webOrders,
  rewardsTransactions,
  shopSettings,
} from "@shared/schema";
import type {
  User,
  InsertUser,
  Item,
  InsertItem,
  Show,
  InsertShow,
  ShowItem,
  Order,
  InsertOrder,
  BusinessSettings,
  InsertBusinessSettings,
  Employee,
  InsertEmployee,
  Expense,
  InsertExpense,
  Customer,
  InsertCustomer,
  WebOrder,
  InsertWebOrder,
  RewardsTransaction,
  InsertRewardsTransaction,
  ShopSettings,
  InsertShopSettings,
} from "@shared/schema";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq, and, desc, inArray, asc } from "drizzle-orm";
import path from "path";
import fs from "fs";

// Resolve database path. Default to ./data.db, override with DB_PATH env var
// (used in production to point at a persistent disk mount, e.g. /var/data/data.db on Render).
const dbPath = process.env.DB_PATH || "data.db";
const dbDir = path.dirname(dbPath);
if (dbDir && dbDir !== "." && !fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}
const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");

// Auto-create tables on boot
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL DEFAULT '',
    sub_category TEXT NOT NULL DEFAULT '',
    condition TEXT NOT NULL DEFAULT 'Good',
    whatnot_condition TEXT NOT NULL DEFAULT '',
    type TEXT NOT NULL DEFAULT 'Auction',
    price REAL NOT NULL DEFAULT 0,
    buy_now_price REAL NOT NULL DEFAULT 0,
    seller_cost REAL NOT NULL DEFAULT 0,
    quantity INTEGER NOT NULL DEFAULT 1,
    weight_oz REAL NOT NULL DEFAULT 0,
    length_in REAL NOT NULL DEFAULT 0,
    width_in REAL NOT NULL DEFAULT 0,
    height_in REAL NOT NULL DEFAULT 0,
    shipping_profile TEXT NOT NULL DEFAULT '',
    offerable INTEGER NOT NULL DEFAULT 0,
    hazmat INTEGER NOT NULL DEFAULT 0,
    sku TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'Active',
    notes TEXT NOT NULL DEFAULT '',
    images_json TEXT NOT NULL DEFAULT '[]',
    created_at INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS shows (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    scheduled_at INTEGER NOT NULL DEFAULT 0,
    description TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS show_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    show_id INTEGER NOT NULL,
    item_id INTEGER NOT NULL,
    position INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS business_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL UNIQUE,
    commission_pct REAL NOT NULL DEFAULT 8,
    payment_fee_pct REAL NOT NULL DEFAULT 2.9,
    payment_fee_fixed REAL NOT NULL DEFAULT 0.3,
    monthly_inventory_budget REAL NOT NULL DEFAULT 0,
    monthly_payroll_budget REAL NOT NULL DEFAULT 0,
    monthly_savings_target REAL NOT NULL DEFAULT 0,
    default_shipping_cost REAL NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS employees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL DEFAULT '',
    monthly_pay REAL NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    date TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL DEFAULT 'other',
    amount REAL NOT NULL DEFAULT 0,
    description TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    order_number TEXT NOT NULL DEFAULT '',
    item_id INTEGER NOT NULL,
    show_id INTEGER NOT NULL DEFAULT 0,
    item_sku TEXT NOT NULL DEFAULT '',
    item_title TEXT NOT NULL DEFAULT '',
    buyer_name TEXT NOT NULL DEFAULT '',
    buyer_handle TEXT NOT NULL DEFAULT '',
    buyer_address TEXT NOT NULL DEFAULT '',
    sale_price REAL NOT NULL DEFAULT 0,
    quantity INTEGER NOT NULL DEFAULT 1,
    packed INTEGER NOT NULL DEFAULT 0,
    shipped INTEGER NOT NULL DEFAULT 0,
    tracking_number TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    first_name TEXT NOT NULL DEFAULT '',
    last_name TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    address_line1 TEXT NOT NULL DEFAULT '',
    address_line2 TEXT NOT NULL DEFAULT '',
    city TEXT NOT NULL DEFAULT '',
    state TEXT NOT NULL DEFAULT '',
    postal_code TEXT NOT NULL DEFAULT '',
    country TEXT NOT NULL DEFAULT 'US',
    points_balance INTEGER NOT NULL DEFAULT 0,
    lifetime_points_earned INTEGER NOT NULL DEFAULT 0,
    tier TEXT NOT NULL DEFAULT 'Bronze',
    referral_code TEXT NOT NULL UNIQUE,
    referred_by_code TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS web_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_number TEXT NOT NULL DEFAULT '',
    customer_id INTEGER NOT NULL,
    items_json TEXT NOT NULL DEFAULT '[]',
    subtotal REAL NOT NULL DEFAULT 0,
    shipping_total REAL NOT NULL DEFAULT 0,
    tax REAL NOT NULL DEFAULT 0,
    discount REAL NOT NULL DEFAULT 0,
    points_redeemed INTEGER NOT NULL DEFAULT 0,
    points_value_applied REAL NOT NULL DEFAULT 0,
    total REAL NOT NULL DEFAULT 0,
    points_earned INTEGER NOT NULL DEFAULT 0,
    stripe_payment_intent_id TEXT NOT NULL DEFAULT '',
    payment_status TEXT NOT NULL DEFAULT 'pending',
    fulfillment_status TEXT NOT NULL DEFAULT 'new',
    tracking_number TEXT NOT NULL DEFAULT '',
    shipping_address TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS rewards_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL,
    delta INTEGER NOT NULL DEFAULT 0,
    reason TEXT NOT NULL DEFAULT 'manual_adjust',
    related_order_id INTEGER NOT NULL DEFAULT 0,
    note TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS shop_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL UNIQUE,
    points_per_dollar REAL NOT NULL DEFAULT 1,
    points_per_dollar_redeem REAL NOT NULL DEFAULT 20,
    signup_bonus INTEGER NOT NULL DEFAULT 100,
    referral_bonus INTEGER NOT NULL DEFAULT 250,
    tier_silver_at INTEGER NOT NULL DEFAULT 500,
    tier_gold_at INTEGER NOT NULL DEFAULT 2000,
    tier_platinum_at INTEGER NOT NULL DEFAULT 5000,
    stripe_publishable_key TEXT NOT NULL DEFAULT '',
    stripe_secret_key TEXT NOT NULL DEFAULT '',
    free_shipping_threshold REAL NOT NULL DEFAULT 100,
    flat_shipping_rate REAL NOT NULL DEFAULT 9,
    updated_at INTEGER NOT NULL DEFAULT 0
  );
`);

// ----- Migrations: add columns to existing items table if they don't exist -----
function ensureItemColumn(name: string, def: string) {
  const cols = sqlite
    .prepare("PRAGMA table_info(items)")
    .all() as { name: string }[];
  if (!cols.some((c) => c.name === name)) {
    sqlite.exec(`ALTER TABLE items ADD COLUMN ${name} ${def}`);
  }
}
ensureItemColumn("whatnot_condition", "TEXT NOT NULL DEFAULT ''");
ensureItemColumn("length_in", "REAL NOT NULL DEFAULT 0");
ensureItemColumn("width_in", "REAL NOT NULL DEFAULT 0");
ensureItemColumn("height_in", "REAL NOT NULL DEFAULT 0");
ensureItemColumn("web_visible", "INTEGER NOT NULL DEFAULT 0");
ensureItemColumn("web_price", "REAL NOT NULL DEFAULT 0");
ensureItemColumn("web_description", "TEXT NOT NULL DEFAULT ''");

function ensureOrderColumn(name: string, def: string) {
  const cols = sqlite
    .prepare("PRAGMA table_info(orders)")
    .all() as { name: string }[];
  if (!cols.some((c) => c.name === name)) {
    sqlite.exec(`ALTER TABLE orders ADD COLUMN ${name} ${def}`);
  }
}
ensureOrderColumn("bundle_number", "TEXT NOT NULL DEFAULT ''");

// ----- Migrations for shop_settings: add storefront content columns -----
function ensureShopSettingsColumn(name: string, def: string) {
  const cols = sqlite
    .prepare("PRAGMA table_info(shop_settings)")
    .all() as { name: string }[];
  if (!cols.some((c) => c.name === name)) {
    sqlite.exec(`ALTER TABLE shop_settings ADD COLUMN ${name} ${def}`);
  }
}
ensureShopSettingsColumn("shop_name", "TEXT NOT NULL DEFAULT 'Crowned Jewel Vintage'");
ensureShopSettingsColumn("hero_eyebrow", "TEXT NOT NULL DEFAULT 'ESTATE-FRESH \u00b7 ONE-OF-ONE'");
ensureShopSettingsColumn("hero_title", "TEXT NOT NULL DEFAULT 'Heirloom-quality vintage,'");
ensureShopSettingsColumn("hero_title_italic", "TEXT NOT NULL DEFAULT 'carefully curated.'");
ensureShopSettingsColumn("hero_subtitle", "TEXT NOT NULL DEFAULT 'Crystal, fine china, jewelry and home accents \u2014 sourced from estates and presented with the reverence each piece deserves. Every find is one-of-one.'");
ensureShopSettingsColumn("announcement_bar", "TEXT NOT NULL DEFAULT ''");
ensureShopSettingsColumn("about_text", "TEXT NOT NULL DEFAULT ''");
ensureShopSettingsColumn("contact_email", "TEXT NOT NULL DEFAULT ''");
ensureShopSettingsColumn("instagram_url", "TEXT NOT NULL DEFAULT ''");
ensureShopSettingsColumn("whatnot_url", "TEXT NOT NULL DEFAULT ''");
ensureShopSettingsColumn("tax_rate", "REAL NOT NULL DEFAULT 0");

// ----- Migrations for web_orders: shipping label columns -----
function ensureWebOrderColumn(name: string, def: string) {
  const cols = sqlite
    .prepare("PRAGMA table_info(web_orders)")
    .all() as { name: string }[];
  if (!cols.some((c) => c.name === name)) {
    sqlite.exec(`ALTER TABLE web_orders ADD COLUMN ${name} ${def}`);
  }
}
ensureWebOrderColumn("shippo_transaction_id", "TEXT NOT NULL DEFAULT ''");
ensureWebOrderColumn("label_url", "TEXT NOT NULL DEFAULT ''");
ensureWebOrderColumn("carrier", "TEXT NOT NULL DEFAULT ''");
ensureWebOrderColumn("service_level", "TEXT NOT NULL DEFAULT ''");
ensureWebOrderColumn("label_cost", "REAL NOT NULL DEFAULT 0");

// One-time backfill: auto-publish all existing Active items with quantity > 0 to the shop.
// Tracked via a settings row so it only runs once.
try {
  sqlite.exec(
    "CREATE TABLE IF NOT EXISTS app_migrations (key TEXT PRIMARY KEY, ran_at INTEGER NOT NULL)",
  );
  const already = sqlite
    .prepare("SELECT key FROM app_migrations WHERE key = ?")
    .get("backfill_web_visible_v1") as { key: string } | undefined;
  if (!already) {
    sqlite.exec(
      "UPDATE items SET web_visible = 1 WHERE status = 'Active' AND quantity > 0",
    );
    sqlite
      .prepare("INSERT INTO app_migrations (key, ran_at) VALUES (?, ?)")
      .run("backfill_web_visible_v1", Date.now());
  }
} catch (err) {
  console.warn("backfill_web_visible_v1 migration failed (non-fatal):", err);
}

export const db = drizzle(sqlite);

export interface IStorage {
  // users
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  // items
  listItems(userId: number): Promise<Item[]>;
  getItem(id: number, userId: number): Promise<Item | undefined>;
  getItemBySku(sku: string, userId: number): Promise<Item | undefined>;
  getItemsByIds(ids: number[], userId: number): Promise<Item[]>;
  createItem(userId: number, item: InsertItem): Promise<Item>;
  updateItem(id: number, userId: number, patch: Partial<InsertItem>): Promise<Item | undefined>;
  bulkUpdateItems(ids: number[], userId: number, patch: Partial<InsertItem>): Promise<number>;
  deleteItem(id: number, userId: number): Promise<boolean>;
  bulkDeleteItems(ids: number[], userId: number): Promise<number>;
  // shows
  listShows(userId: number): Promise<Show[]>;
  getShow(id: number, userId: number): Promise<Show | undefined>;
  createShow(userId: number, show: InsertShow): Promise<Show>;
  updateShow(id: number, userId: number, patch: Partial<InsertShow>): Promise<Show | undefined>;
  deleteShow(id: number, userId: number): Promise<boolean>;
  // show items
  getShowItems(showId: number, userId: number): Promise<{ items: Item[]; ids: number[] }>;
  addItemsToShow(showId: number, userId: number, itemIds: number[]): Promise<void>;
  removeItemFromShow(showId: number, userId: number, itemId: number): Promise<void>;
  reorderShowItems(showId: number, userId: number, orderedItemIds: number[]): Promise<void>;
  // orders
  listOrders(userId: number, opts?: { showId?: number }): Promise<Order[]>;
  getOrder(id: number, userId: number): Promise<Order | undefined>;
  createOrder(userId: number, order: InsertOrder & { orderNumber: string; bundleNumber?: string }): Promise<Order>;
  updateOrder(id: number, userId: number, patch: Partial<InsertOrder> & { bundleNumber?: string }): Promise<Order | undefined>;
  deleteOrder(id: number, userId: number): Promise<boolean>;
  listOrdersByBuyer(userId: number, buyerHandle: string, buyerName: string): Promise<Order[]>;
  // business
  getBusinessSettings(userId: number): Promise<BusinessSettings>;
  upsertBusinessSettings(userId: number, patch: Partial<InsertBusinessSettings>): Promise<BusinessSettings>;
  // employees
  listEmployees(userId: number): Promise<Employee[]>;
  createEmployee(userId: number, emp: InsertEmployee): Promise<Employee>;
  updateEmployee(id: number, userId: number, patch: Partial<InsertEmployee>): Promise<Employee | undefined>;
  deleteEmployee(id: number, userId: number): Promise<boolean>;
  // expenses
  listExpenses(userId: number): Promise<Expense[]>;
  createExpense(userId: number, exp: InsertExpense): Promise<Expense>;
  updateExpense(id: number, userId: number, patch: Partial<InsertExpense>): Promise<Expense | undefined>;
  deleteExpense(id: number, userId: number): Promise<boolean>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: number) {
    return db.select().from(users).where(eq(users.id, id)).get();
  }
  async getUserByUsername(username: string) {
    return db.select().from(users).where(eq(users.username, username)).get();
  }
  async createUser(insertUser: InsertUser) {
    return db
      .insert(users)
      .values({ ...insertUser, createdAt: Date.now() })
      .returning()
      .get();
  }

  async listItems(userId: number) {
    return db
      .select()
      .from(items)
      .where(eq(items.userId, userId))
      .orderBy(desc(items.createdAt))
      .all();
  }
  async getItem(id: number, userId: number) {
    return db
      .select()
      .from(items)
      .where(and(eq(items.id, id), eq(items.userId, userId)))
      .get();
  }
  async getItemBySku(sku: string, userId: number) {
    return db
      .select()
      .from(items)
      .where(and(eq(items.sku, sku), eq(items.userId, userId)))
      .get();
  }
  async getItemsByIds(ids: number[], userId: number) {
    if (ids.length === 0) return [];
    return db
      .select()
      .from(items)
      .where(and(inArray(items.id, ids), eq(items.userId, userId)))
      .all();
  }
  async createItem(userId: number, item: InsertItem) {
    return db
      .insert(items)
      .values({ ...item, userId, createdAt: Date.now() })
      .returning()
      .get();
  }
  async updateItem(id: number, userId: number, patch: Partial<InsertItem>) {
    const existing = await this.getItem(id, userId);
    if (!existing) return undefined;
    return db
      .update(items)
      .set(patch)
      .where(and(eq(items.id, id), eq(items.userId, userId)))
      .returning()
      .get();
  }
  async bulkUpdateItems(ids: number[], userId: number, patch: Partial<InsertItem>) {
    if (ids.length === 0) return 0;
    const result = db
      .update(items)
      .set(patch)
      .where(and(inArray(items.id, ids), eq(items.userId, userId)))
      .run();
    return result.changes;
  }
  async deleteItem(id: number, userId: number) {
    const result = db
      .delete(items)
      .where(and(eq(items.id, id), eq(items.userId, userId)))
      .run();
    if (result.changes > 0) {
      db.delete(showItems).where(eq(showItems.itemId, id)).run();
    }
    return result.changes > 0;
  }
  async bulkDeleteItems(ids: number[], userId: number) {
    if (ids.length === 0) return 0;
    const result = db
      .delete(items)
      .where(and(inArray(items.id, ids), eq(items.userId, userId)))
      .run();
    if (result.changes > 0) {
      db.delete(showItems).where(inArray(showItems.itemId, ids)).run();
    }
    return result.changes;
  }

  // ----- Shows -----
  async listShows(userId: number) {
    return db
      .select()
      .from(shows)
      .where(eq(shows.userId, userId))
      .orderBy(desc(shows.scheduledAt))
      .all();
  }
  async getShow(id: number, userId: number) {
    return db
      .select()
      .from(shows)
      .where(and(eq(shows.id, id), eq(shows.userId, userId)))
      .get();
  }
  async createShow(userId: number, show: InsertShow) {
    return db
      .insert(shows)
      .values({ ...show, userId, createdAt: Date.now() })
      .returning()
      .get();
  }
  async updateShow(id: number, userId: number, patch: Partial<InsertShow>) {
    const existing = await this.getShow(id, userId);
    if (!existing) return undefined;
    return db
      .update(shows)
      .set(patch)
      .where(and(eq(shows.id, id), eq(shows.userId, userId)))
      .returning()
      .get();
  }
  async deleteShow(id: number, userId: number) {
    const show = await this.getShow(id, userId);
    if (!show) return false;
    db.delete(showItems).where(eq(showItems.showId, id)).run();
    db.delete(shows).where(and(eq(shows.id, id), eq(shows.userId, userId))).run();
    return true;
  }

  async getShowItems(showId: number, userId: number) {
    const show = await this.getShow(showId, userId);
    if (!show) return { items: [], ids: [] };
    const rows: ShowItem[] = db
      .select()
      .from(showItems)
      .where(eq(showItems.showId, showId))
      .orderBy(asc(showItems.position))
      .all();
    const ids = rows.map((r) => r.itemId);
    if (ids.length === 0) return { items: [], ids: [] };
    const allItems = await this.getItemsByIds(ids, userId);
    const map = new Map(allItems.map((it) => [it.id, it]));
    const ordered = ids.map((id) => map.get(id)).filter((x): x is Item => !!x);
    return { items: ordered, ids: ordered.map((i) => i.id) };
  }

  async addItemsToShow(showId: number, userId: number, itemIds: number[]) {
    const show = await this.getShow(showId, userId);
    if (!show) return;
    const valid = await this.getItemsByIds(itemIds, userId);
    if (valid.length === 0) return;
    const existing: ShowItem[] = db
      .select()
      .from(showItems)
      .where(eq(showItems.showId, showId))
      .all();
    const existingIds = new Set(existing.map((e) => e.itemId));
    const maxPos = existing.reduce((m, e) => Math.max(m, e.position), -1);
    let nextPos = maxPos + 1;
    for (const it of valid) {
      if (existingIds.has(it.id)) continue;
      db.insert(showItems).values({ showId, itemId: it.id, position: nextPos++ }).run();
    }
  }
  async removeItemFromShow(showId: number, userId: number, itemId: number) {
    const show = await this.getShow(showId, userId);
    if (!show) return;
    db.delete(showItems)
      .where(and(eq(showItems.showId, showId), eq(showItems.itemId, itemId)))
      .run();
  }
  async reorderShowItems(showId: number, userId: number, orderedItemIds: number[]) {
    const show = await this.getShow(showId, userId);
    if (!show) return;
    orderedItemIds.forEach((itemId, idx) => {
      db.update(showItems)
        .set({ position: idx })
        .where(and(eq(showItems.showId, showId), eq(showItems.itemId, itemId)))
        .run();
    });
  }

  // ----- Orders -----
  async listOrders(userId: number, opts?: { showId?: number }) {
    const where =
      opts?.showId !== undefined
        ? and(eq(orders.userId, userId), eq(orders.showId, opts.showId))
        : eq(orders.userId, userId);
    return db.select().from(orders).where(where).orderBy(desc(orders.createdAt)).all();
  }
  async getOrder(id: number, userId: number) {
    return db
      .select()
      .from(orders)
      .where(and(eq(orders.id, id), eq(orders.userId, userId)))
      .get();
  }
  async createOrder(
    userId: number,
    order: InsertOrder & { orderNumber: string; bundleNumber?: string },
  ) {
    return db
      .insert(orders)
      .values({ ...order, userId, createdAt: Date.now() })
      .returning()
      .get();
  }

  async listOrdersByBuyer(userId: number, buyerHandle: string, buyerName: string) {
    // Match by handle if provided, otherwise fall back to name (case-insensitive).
    const all = db
      .select()
      .from(orders)
      .where(eq(orders.userId, userId))
      .all();
    const handle = (buyerHandle || "").trim().toLowerCase();
    const name = (buyerName || "").trim().toLowerCase();
    return all.filter((o) => {
      if (handle && o.buyerHandle.trim().toLowerCase() === handle) return true;
      if (!handle && name && o.buyerName.trim().toLowerCase() === name) return true;
      return false;
    });
  }
  async updateOrder(id: number, userId: number, patch: Partial<InsertOrder>) {
    const existing = await this.getOrder(id, userId);
    if (!existing) return undefined;
    return db
      .update(orders)
      .set(patch)
      .where(and(eq(orders.id, id), eq(orders.userId, userId)))
      .returning()
      .get();
  }
  async deleteOrder(id: number, userId: number) {
    const result = db
      .delete(orders)
      .where(and(eq(orders.id, id), eq(orders.userId, userId)))
      .run();
    return result.changes > 0;
  }

  // ----- Business settings -----
  async getBusinessSettings(userId: number): Promise<BusinessSettings> {
    let row = db
      .select()
      .from(businessSettings)
      .where(eq(businessSettings.userId, userId))
      .get();
    if (!row) {
      row = db
        .insert(businessSettings)
        .values({ userId, updatedAt: Date.now() })
        .returning()
        .get();
    }
    return row;
  }
  async upsertBusinessSettings(
    userId: number,
    patch: Partial<InsertBusinessSettings>,
  ): Promise<BusinessSettings> {
    await this.getBusinessSettings(userId); // ensure row exists
    return db
      .update(businessSettings)
      .set({ ...patch, updatedAt: Date.now() })
      .where(eq(businessSettings.userId, userId))
      .returning()
      .get();
  }

  // ----- Employees -----
  async listEmployees(userId: number) {
    return db
      .select()
      .from(employees)
      .where(eq(employees.userId, userId))
      .orderBy(desc(employees.createdAt))
      .all();
  }
  async createEmployee(userId: number, emp: InsertEmployee) {
    return db
      .insert(employees)
      .values({ ...emp, userId, createdAt: Date.now() })
      .returning()
      .get();
  }
  async updateEmployee(id: number, userId: number, patch: Partial<InsertEmployee>) {
    const existing = db
      .select()
      .from(employees)
      .where(and(eq(employees.id, id), eq(employees.userId, userId)))
      .get();
    if (!existing) return undefined;
    return db
      .update(employees)
      .set(patch)
      .where(and(eq(employees.id, id), eq(employees.userId, userId)))
      .returning()
      .get();
  }
  async deleteEmployee(id: number, userId: number) {
    const result = db
      .delete(employees)
      .where(and(eq(employees.id, id), eq(employees.userId, userId)))
      .run();
    return result.changes > 0;
  }

  // ----- Expenses -----
  async listExpenses(userId: number) {
    return db
      .select()
      .from(expenses)
      .where(eq(expenses.userId, userId))
      .orderBy(desc(expenses.date))
      .all();
  }
  async createExpense(userId: number, exp: InsertExpense) {
    return db
      .insert(expenses)
      .values({ ...exp, userId, createdAt: Date.now() })
      .returning()
      .get();
  }
  async updateExpense(id: number, userId: number, patch: Partial<InsertExpense>) {
    const existing = db
      .select()
      .from(expenses)
      .where(and(eq(expenses.id, id), eq(expenses.userId, userId)))
      .get();
    if (!existing) return undefined;
    return db
      .update(expenses)
      .set(patch)
      .where(and(eq(expenses.id, id), eq(expenses.userId, userId)))
      .returning()
      .get();
  }
  async deleteExpense(id: number, userId: number) {
    const result = db
      .delete(expenses)
      .where(and(eq(expenses.id, id), eq(expenses.userId, userId)))
      .run();
    return result.changes > 0;
  }

  // ----- Customers (Crowned Jewel Vintage shop) -----
  async listCustomers(): Promise<Customer[]> {
    return db.select().from(customers).orderBy(desc(customers.createdAt)).all();
  }
  async getCustomer(id: number): Promise<Customer | undefined> {
    return db.select().from(customers).where(eq(customers.id, id)).get();
  }
  async getCustomerByEmail(email: string): Promise<Customer | undefined> {
    return db
      .select()
      .from(customers)
      .where(eq(customers.email, email.toLowerCase().trim()))
      .get();
  }
  async getCustomerByReferralCode(code: string): Promise<Customer | undefined> {
    return db.select().from(customers).where(eq(customers.referralCode, code)).get();
  }
  async createCustomer(input: InsertCustomer & { referralCode: string }): Promise<Customer> {
    return db
      .insert(customers)
      .values({
        ...input,
        email: input.email.toLowerCase().trim(),
        createdAt: Date.now(),
      })
      .returning()
      .get();
  }
  async updateCustomer(id: number, patch: Partial<Customer>): Promise<Customer | undefined> {
    return db
      .update(customers)
      .set(patch)
      .where(eq(customers.id, id))
      .returning()
      .get();
  }
  async adjustCustomerPoints(
    customerId: number,
    delta: number,
    reason: string,
    relatedOrderId = 0,
    note = "",
  ): Promise<{ customer: Customer; tx: RewardsTransaction } | undefined> {
    const c = await this.getCustomer(customerId);
    if (!c) return undefined;
    const newBalance = Math.max(0, c.pointsBalance + delta);
    const newLifetime = delta > 0 ? c.lifetimePointsEarned + delta : c.lifetimePointsEarned;
    const updated = await this.updateCustomer(customerId, {
      pointsBalance: newBalance,
      lifetimePointsEarned: newLifetime,
    });
    const tx = db
      .insert(rewardsTransactions)
      .values({
        customerId,
        delta,
        reason,
        relatedOrderId,
        note,
        createdAt: Date.now(),
      })
      .returning()
      .get();
    return { customer: updated!, tx };
  }
  async listRewardsTransactions(customerId: number): Promise<RewardsTransaction[]> {
    return db
      .select()
      .from(rewardsTransactions)
      .where(eq(rewardsTransactions.customerId, customerId))
      .orderBy(desc(rewardsTransactions.createdAt))
      .all();
  }

  // ----- Web orders -----
  async listWebOrders(): Promise<WebOrder[]> {
    return db.select().from(webOrders).orderBy(desc(webOrders.createdAt)).all();
  }
  async listWebOrdersByCustomer(customerId: number): Promise<WebOrder[]> {
    return db
      .select()
      .from(webOrders)
      .where(eq(webOrders.customerId, customerId))
      .orderBy(desc(webOrders.createdAt))
      .all();
  }
  async getWebOrder(id: number): Promise<WebOrder | undefined> {
    return db.select().from(webOrders).where(eq(webOrders.id, id)).get();
  }
  async getWebOrderByNumber(orderNumber: string): Promise<WebOrder | undefined> {
    return db.select().from(webOrders).where(eq(webOrders.orderNumber, orderNumber)).get();
  }
  async createWebOrder(input: InsertWebOrder): Promise<WebOrder> {
    return db
      .insert(webOrders)
      .values({ ...input, createdAt: Date.now() })
      .returning()
      .get();
  }
  async updateWebOrder(id: number, patch: Partial<WebOrder>): Promise<WebOrder | undefined> {
    return db.update(webOrders).set(patch).where(eq(webOrders.id, id)).returning().get();
  }

  // ----- Shop settings -----
  async getShopSettings(userId: number): Promise<ShopSettings> {
    let row = db.select().from(shopSettings).where(eq(shopSettings.userId, userId)).get();
    if (!row) {
      row = db
        .insert(shopSettings)
        .values({ userId, updatedAt: Date.now() })
        .returning()
        .get();
    }
    return row;
  }
  async updateShopSettings(
    userId: number,
    patch: Partial<InsertShopSettings>,
  ): Promise<ShopSettings> {
    await this.getShopSettings(userId);
    return db
      .update(shopSettings)
      .set({ ...patch, updatedAt: Date.now() })
      .where(eq(shopSettings.userId, userId))
      .returning()
      .get();
  }

  // ----- Public web products (no userId filter — operator-wide visibility) -----
  async listWebProducts(): Promise<Item[]> {
    return db
      .select()
      .from(items)
      .where(and(eq(items.webVisible, 1), eq(items.status, "Active")))
      .orderBy(desc(items.createdAt))
      .all();
  }
  async getWebProduct(id: number): Promise<Item | undefined> {
    return db
      .select()
      .from(items)
      .where(and(eq(items.id, id), eq(items.webVisible, 1)))
      .get();
  }
  async getWebProductsByIds(ids: number[]): Promise<Item[]> {
    if (ids.length === 0) return [];
    return db
      .select()
      .from(items)
      .where(and(inArray(items.id, ids), eq(items.webVisible, 1), eq(items.status, "Active")))
      .all();
  }
}

export const storage = new DatabaseStorage();
