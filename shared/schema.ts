import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Users
export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull().unique(),
  password: text("password").notNull(), // bcrypt hash
  createdAt: integer("created_at").notNull().default(0),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Inventory items (Whatnot listings)
export const items = sqliteTable("items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull(),
  // Core listing fields
  title: text("title").notNull().default(""),
  description: text("description").notNull().default(""),
  category: text("category").notNull().default(""),
  subCategory: text("sub_category").notNull().default(""),
  condition: text("condition").notNull().default("Good"),
  // Whatnot-specific condition (their grading system)
  whatnotCondition: text("whatnot_condition").notNull().default(""),
  // Pricing
  type: text("type").notNull().default("Auction"), // Auction | Buy It Now | Giveaway
  price: real("price").notNull().default(0), // starting bid OR buy-now price
  buyNowPrice: real("buy_now_price").notNull().default(0),
  sellerCost: real("seller_cost").notNull().default(0),
  // Logistics
  quantity: integer("quantity").notNull().default(1),
  weightOz: real("weight_oz").notNull().default(0),
  lengthIn: real("length_in").notNull().default(0),
  widthIn: real("width_in").notNull().default(0),
  heightIn: real("height_in").notNull().default(0),
  shippingProfile: text("shipping_profile").notNull().default(""),
  offerable: integer("offerable").notNull().default(0), // 0/1
  hazmat: integer("hazmat").notNull().default(0), // 0/1
  // Identifiers
  sku: text("sku").notNull().default(""),
  status: text("status").notNull().default("Active"), // Active | Sold | Inactive
  notes: text("notes").notNull().default(""),
  // Photos: JSON array of URLs (data: URLs OR public http(s) URLs from /uploads/)
  imagesJson: text("images_json").notNull().default("[]"),
  // Crowned Jewel Vintage shop fields
  webVisible: integer("web_visible").notNull().default(0),
  webPrice: real("web_price").notNull().default(0),
  webDescription: text("web_description").notNull().default(""),
  createdAt: integer("created_at").notNull().default(0),
});

export const insertItemSchema = createInsertSchema(items).omit({
  id: true,
  userId: true,
  createdAt: true,
});

export type InsertItem = z.infer<typeof insertItemSchema>;
export type Item = typeof items.$inferSelect;

// Shows (Whatnot live shows)
export const shows = sqliteTable("shows", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull(),
  name: text("name").notNull().default(""),
  scheduledAt: integer("scheduled_at").notNull().default(0), // ms epoch
  description: text("description").notNull().default(""),
  createdAt: integer("created_at").notNull().default(0),
});

export const insertShowSchema = createInsertSchema(shows).omit({
  id: true,
  userId: true,
  createdAt: true,
});

export type InsertShow = z.infer<typeof insertShowSchema>;
export type Show = typeof shows.$inferSelect;

// Show <-> items join with order
export const showItems = sqliteTable("show_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  showId: integer("show_id").notNull(),
  itemId: integer("item_id").notNull(),
  position: integer("position").notNull().default(0),
});

export type ShowItem = typeof showItems.$inferSelect;

// Orders (sales records — buyer + item + show)
export const orders = sqliteTable("orders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull(),
  orderNumber: text("order_number").notNull().default(""), // CL-O-YYYYMMDD-XXXX
  // Smart bundling: orders to the same buyer are grouped into bundles up to
  // 5 lb / 12x12x12 box. Empty string = unassigned (auto-bundled at create time).
  bundleNumber: text("bundle_number").notNull().default(""),
  itemId: integer("item_id").notNull(),
  showId: integer("show_id").notNull().default(0), // 0 if not from a show
  // Snapshots for resilience if item is later changed/deleted
  itemSku: text("item_sku").notNull().default(""),
  itemTitle: text("item_title").notNull().default(""),
  // Buyer
  buyerName: text("buyer_name").notNull().default(""),
  buyerHandle: text("buyer_handle").notNull().default(""), // whatnot username
  buyerAddress: text("buyer_address").notNull().default(""),
  // Sale data
  salePrice: real("sale_price").notNull().default(0),
  quantity: integer("quantity").notNull().default(1),
  packed: integer("packed").notNull().default(0), // 0/1
  shipped: integer("shipped").notNull().default(0), // 0/1
  trackingNumber: text("tracking_number").notNull().default(""),
  notes: text("notes").notNull().default(""),
  createdAt: integer("created_at").notNull().default(0),
});

export const insertOrderSchema = createInsertSchema(orders).omit({
  id: true,
  userId: true,
  orderNumber: true,
  createdAt: true,
});

export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof orders.$inferSelect;

// ----- Business settings (one row per user) -----
export const businessSettings = sqliteTable("business_settings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().unique(),
  // Whatnot fees (defaults reflect Whatnot's published seller fee schedule:
  //   8% platform commission + 2.9% + $0.30 payment processing).
  commissionPct: real("commission_pct").notNull().default(8),
  paymentFeePct: real("payment_fee_pct").notNull().default(2.9),
  paymentFeeFixed: real("payment_fee_fixed").notNull().default(0.3),
  // Monthly budgeting targets (in dollars).
  monthlyInventoryBudget: real("monthly_inventory_budget").notNull().default(0),
  monthlyPayrollBudget: real("monthly_payroll_budget").notNull().default(0),
  monthlySavingsTarget: real("monthly_savings_target").notNull().default(0),
  // Per-shipment shipping cost assumption used for profit estimates when an
  // order has no explicit shipping cost recorded.
  defaultShippingCost: real("default_shipping_cost").notNull().default(0),
  updatedAt: integer("updated_at").notNull().default(0),
});
export const insertBusinessSettingsSchema = createInsertSchema(businessSettings).omit({
  id: true,
  userId: true,
  updatedAt: true,
});
export type InsertBusinessSettings = z.infer<typeof insertBusinessSettingsSchema>;
export type BusinessSettings = typeof businessSettings.$inferSelect;

// ----- Employees -----
export const employees = sqliteTable("employees", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull(),
  name: text("name").notNull().default(""),
  role: text("role").notNull().default(""),
  monthlyPay: real("monthly_pay").notNull().default(0),
  active: integer("active").notNull().default(1), // 0/1
  createdAt: integer("created_at").notNull().default(0),
});
export const insertEmployeeSchema = createInsertSchema(employees).omit({
  id: true,
  userId: true,
  createdAt: true,
});
export type InsertEmployee = z.infer<typeof insertEmployeeSchema>;
export type Employee = typeof employees.$inferSelect;

// ----- Expenses (inventory purchases, shipping, payroll, other) -----
export const expenses = sqliteTable("expenses", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull(),
  // ISO date (YYYY-MM-DD) so we can group by month easily.
  date: text("date").notNull().default(""),
  // inventory | shipping | payroll | supplies | software | other
  category: text("category").notNull().default("other"),
  amount: real("amount").notNull().default(0),
  description: text("description").notNull().default(""),
  createdAt: integer("created_at").notNull().default(0),
});
export const insertExpenseSchema = createInsertSchema(expenses).omit({
  id: true,
  userId: true,
  createdAt: true,
});
export type InsertExpense = z.infer<typeof insertExpenseSchema>;
export type Expense = typeof expenses.$inferSelect;

// ----- Customers (Crowned Jewel Vintage shop accounts) -----
export const customers = sqliteTable("customers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  firstName: text("first_name").notNull().default(""),
  lastName: text("last_name").notNull().default(""),
  phone: text("phone").notNull().default(""),
  addressLine1: text("address_line1").notNull().default(""),
  addressLine2: text("address_line2").notNull().default(""),
  city: text("city").notNull().default(""),
  state: text("state").notNull().default(""),
  postalCode: text("postal_code").notNull().default(""),
  country: text("country").notNull().default("US"),
  pointsBalance: integer("points_balance").notNull().default(0),
  lifetimePointsEarned: integer("lifetime_points_earned").notNull().default(0),
  tier: text("tier").notNull().default("Bronze"),
  referralCode: text("referral_code").notNull().unique(),
  referredByCode: text("referred_by_code").notNull().default(""),
  createdAt: integer("created_at").notNull().default(0),
});
export const insertCustomerSchema = createInsertSchema(customers).omit({
  id: true,
  pointsBalance: true,
  lifetimePointsEarned: true,
  tier: true,
  referralCode: true,
  createdAt: true,
});
export type InsertCustomer = z.infer<typeof insertCustomerSchema>;
export type Customer = typeof customers.$inferSelect;

// ----- Web orders (shop orders, separate from Whatnot orders) -----
export const webOrders = sqliteTable("web_orders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  orderNumber: text("order_number").notNull().default(""),
  customerId: integer("customer_id").notNull(),
  itemsJson: text("items_json").notNull().default("[]"),
  subtotal: real("subtotal").notNull().default(0),
  shippingTotal: real("shipping_total").notNull().default(0),
  tax: real("tax").notNull().default(0),
  discount: real("discount").notNull().default(0),
  pointsRedeemed: integer("points_redeemed").notNull().default(0),
  pointsValueApplied: real("points_value_applied").notNull().default(0),
  total: real("total").notNull().default(0),
  pointsEarned: integer("points_earned").notNull().default(0),
  stripePaymentIntentId: text("stripe_payment_intent_id").notNull().default(""),
  paymentStatus: text("payment_status").notNull().default("pending"),
  fulfillmentStatus: text("fulfillment_status").notNull().default("new"),
  trackingNumber: text("tracking_number").notNull().default(""),
  shippingAddress: text("shipping_address").notNull().default(""),
  notes: text("notes").notNull().default(""),
  createdAt: integer("created_at").notNull().default(0),
});
export const insertWebOrderSchema = createInsertSchema(webOrders).omit({
  id: true,
  createdAt: true,
});
export type InsertWebOrder = z.infer<typeof insertWebOrderSchema>;
export type WebOrder = typeof webOrders.$inferSelect;

// ----- Rewards transactions (audit log) -----
export const rewardsTransactions = sqliteTable("rewards_transactions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  customerId: integer("customer_id").notNull(),
  delta: integer("delta").notNull().default(0),
  reason: text("reason").notNull().default("manual_adjust"),
  relatedOrderId: integer("related_order_id").notNull().default(0),
  note: text("note").notNull().default(""),
  createdAt: integer("created_at").notNull().default(0),
});
export const insertRewardsTransactionSchema = createInsertSchema(rewardsTransactions).omit({
  id: true,
  createdAt: true,
});
export type InsertRewardsTransaction = z.infer<typeof insertRewardsTransactionSchema>;
export type RewardsTransaction = typeof rewardsTransactions.$inferSelect;

// ----- Shop settings (one row per operator) -----
export const shopSettings = sqliteTable("shop_settings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().unique(),
  pointsPerDollar: real("points_per_dollar").notNull().default(1),
  pointsPerDollarRedeem: real("points_per_dollar_redeem").notNull().default(20),
  signupBonus: integer("signup_bonus").notNull().default(100),
  referralBonus: integer("referral_bonus").notNull().default(250),
  tierSilverAt: integer("tier_silver_at").notNull().default(500),
  tierGoldAt: integer("tier_gold_at").notNull().default(2000),
  tierPlatinumAt: integer("tier_platinum_at").notNull().default(5000),
  stripePublishableKey: text("stripe_publishable_key").notNull().default(""),
  stripeSecretKey: text("stripe_secret_key").notNull().default(""),
  freeShippingThreshold: real("free_shipping_threshold").notNull().default(100),
  flatShippingRate: real("flat_shipping_rate").notNull().default(9),
  updatedAt: integer("updated_at").notNull().default(0),
});
export const insertShopSettingsSchema = createInsertSchema(shopSettings).omit({
  id: true,
  userId: true,
  updatedAt: true,
});
export type InsertShopSettings = z.infer<typeof insertShopSettingsSchema>;
export type ShopSettings = typeof shopSettings.$inferSelect;
