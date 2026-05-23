/**
 * Shippo API client.
 *
 * Implements just what we need: shipment creation (returns rates) and
 * transaction creation (buys a rate, returns label URL + tracking).
 *
 * Docs: https://docs.goshippo.com/docs/api
 */

const SHIPPO_BASE = "https://api.goshippo.com";

export type ShippoAddress = {
  name: string;
  street1: string;
  street2?: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  phone?: string;
  email?: string;
};

export type ShippoParcel = {
  length: string; // inches as string
  width: string;
  height: string;
  distance_unit: "in";
  weight: string; // ounces as string
  mass_unit: "oz";
};

export type ShippoRate = {
  object_id: string;
  amount: string; // "8.42"
  currency: string;
  provider: string; // "USPS"
  servicelevel: { name: string; token: string }; // "Priority Mail"
  estimated_days: number;
  duration_terms: string;
  attributes?: string[]; // ["CHEAPEST"], ["FASTEST"], ["BESTVALUE"]
};

export type ShippoShipment = {
  object_id: string;
  object_status: string;
  rates: ShippoRate[];
  messages?: Array<{ source: string; code: string; text: string }>;
};

export type ShippoTransaction = {
  object_id: string;
  status: "SUCCESS" | "ERROR" | "QUEUED" | "WAITING";
  label_url: string;
  tracking_number: string;
  tracking_url_provider: string;
  rate: string;
  messages?: Array<{ source: string; code: string; text: string }>;
};

function token(): string {
  const t = process.env.SHIPPO_API_TOKEN;
  if (!t) throw new Error("SHIPPO_API_TOKEN not set");
  return t;
}

async function shippoFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${SHIPPO_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `ShippoToken ${token()}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let body: any;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  if (!res.ok) {
    const msg = body?.detail || body?.message || text || `Shippo HTTP ${res.status}`;
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  return body as T;
}

export function fromAddressFromEnv(): ShippoAddress {
  const required = [
    "SHIPPING_FROM_NAME",
    "SHIPPING_FROM_STREET1",
    "SHIPPING_FROM_CITY",
    "SHIPPING_FROM_STATE",
    "SHIPPING_FROM_ZIP",
  ];
  for (const k of required) {
    if (!process.env[k]) throw new Error(`${k} env var not configured`);
  }
  return {
    name: process.env.SHIPPING_FROM_NAME!,
    street1: process.env.SHIPPING_FROM_STREET1!,
    street2: process.env.SHIPPING_FROM_STREET2 || "",
    city: process.env.SHIPPING_FROM_CITY!,
    state: process.env.SHIPPING_FROM_STATE!,
    zip: process.env.SHIPPING_FROM_ZIP!,
    country: process.env.SHIPPING_FROM_COUNTRY || "US",
    phone: process.env.SHIPPING_FROM_PHONE || "",
    email: process.env.SHIPPING_FROM_EMAIL || "",
  };
}

export async function createShipment(
  to: ShippoAddress,
  parcel: ShippoParcel,
): Promise<ShippoShipment> {
  return shippoFetch<ShippoShipment>("/shipments/", {
    method: "POST",
    body: JSON.stringify({
      address_from: fromAddressFromEnv(),
      address_to: to,
      parcels: [parcel],
      async: false,
    }),
  });
}

export async function buyRate(rateId: string): Promise<ShippoTransaction> {
  return shippoFetch<ShippoTransaction>("/transactions/", {
    method: "POST",
    body: JSON.stringify({
      rate: rateId,
      label_file_type: "PDF_4x6",
      async: false,
    }),
  });
}

/**
 * Convert raw shippingAddress text (either JSON-stringified object or
 * plain multi-line text) to a Shippo-compatible address.
 */
export function parseStoredShippingAddress(raw: string, fallbackName = "", fallbackEmail = ""): ShippoAddress | null {
  if (!raw) return null;
  // Try JSON first
  try {
    const obj = JSON.parse(raw);
    if (obj && typeof obj === "object" && (obj.street1 || obj.line1 || obj.address1)) {
      return {
        name: obj.name || fallbackName,
        street1: obj.street1 || obj.line1 || obj.address1 || "",
        street2: obj.street2 || obj.line2 || obj.address2 || "",
        city: obj.city || "",
        state: obj.state || obj.region || "",
        zip: obj.zip || obj.postalCode || obj.postal_code || "",
        country: obj.country || "US",
        phone: obj.phone || "",
        email: obj.email || fallbackEmail,
      };
    }
  } catch {
    // not JSON — try to parse loose text
  }
  return null;
}
