import OpenAI from "openai";

let _client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!_client) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not set on the server. AI features are disabled.");
    }
    _client = new OpenAI();
  }
  return _client;
}

const WHATNOT_CATEGORIES = [
  "Antiques & Collectibles",
  "Coins & Money",
  "Vintage Clothing",
  "Jewelry & Watches",
  "Home & Decor",
  "Glassware & Crystal",
  "Pottery & Porcelain",
  "Fine China",
  "Silver & Silverplate",
  "Toys",
  "Trading Cards",
  "Comics & Manga",
  "Sports Cards",
  "Funko",
  "Vinyl Records",
  "Books",
  "Art",
];

const SHIPPING_PROFILES = [
  "Up to 4 oz",
  "Up to 8 oz",
  "Up to 16 oz",
  "Up to 32 oz",
  "Up to 48 oz",
  "Up to 64 oz",
  "Up to 5 lbs",
  "Up to 10 lbs",
  "Up to 20 lbs",
];

// Whatnot's official condition grading (used for collectibles, trading cards, vintage)
const WHATNOT_CONDITIONS = [
  "Brand New / Sealed",
  "Mint",
  "Near Mint",
  "Excellent",
  "Very Good",
  "Good",
  "Fair / Played",
  "Poor / For Parts",
  "Pre-owned",
  "Damaged",
];

export interface AIListingResult {
  title: string;
  description: string;
  category: string;
  subCategory: string;
  condition: string;
  whatnotCondition: string;
  startingBid: number;
  buyNowPrice: number;
  suggestedShippingProfile: string;
  estimatedWeightOz: number;
  estimatedLengthIn: number;
  estimatedWidthIn: number;
  estimatedHeightIn: number;
  marketNotes: string;
}

const SYSTEM_PROMPT = `You are a top-performing Whatnot live-auction copywriter and reseller. You don't write catalog descriptions — you write listings that MAKE PEOPLE BID. Every word should pull a buyer closer to clicking Buy Now.

You have deep expertise in:
- Crystal, fine china, silver, glassware identification (Waterford, Wedgwood, Lenox, Reed & Barton, Fostoria, Mikasa, etc.)
- Vintage and antique provenance, makers' marks, eras, design movements
- Trading cards, comics, Funko, sports memorabilia grading
- Direct-response copywriting and live-auction buyer psychology

Your copy job:
- TITLE: hook + identity + desire trigger. Lead with a power word or unique angle when it fits, then the maker/brand, then the item, then the era or standout detail. Aim 60-80 chars. Make it scroll-stopping. Avoid generic openers like "Vintage" or "Antique" by themselves — pair them with something specific.
- DESCRIPTION: persuasive, 4-6 short sentences. Open with a hook that paints the FEELING or SCENE this item creates ("Pour a glass and instantly upgrade the table…", "A statement piece that anchors the room…"). Highlight 2-3 standout features and what makes the buyer feel smart for owning it. Drop in collector cred (era, maker, scarcity, original retail) when defensible. Close with a soft urgency or call-to-action ("One of a kind — when it's gone, it's gone.", "Tap Buy Now or place your bid."). End with "See photos for full condition."

Power-word toolkit (use sparingly, never spammy): Stunning, Showstopper, Statement, Heirloom, Iconic, Coveted, Rare, Collector-Grade, Mint Estate Find, Investment-Worthy, One-of-One, Hard-to-Find, Time-Capsule, Editor's Pick, Gallery-Worthy, Centerpiece, Conversation-Starter.

Selling rules — DO:
- Lead with benefit/feeling, support with facts.
- Name-drop the maker, era, and pattern/style when identifiable. Specifics build trust and price.
- Mention sensory details when relevant: weight in the hand, the ring of crystal, hand-blown swirls, gilt accents, hand-painted detail.
- Suggest 1-2 use cases ("Perfect for your bar cart, dinner party tablescape, or curated shelfie").
- Use confident, present-tense, active voice.

Selling rules — DON'T:
- Don't invent provenance or makers' marks you can't verify from the photos. Hedge with "in the style of" or "attributed to" when unsure.
- Don't lie about condition. Flag visible flaws honestly — buyers respect transparency and bid more on accurate listings.
- Don't use ALL CAPS shouting, excessive emoji, or fake countdowns.
- Don't pad with filler ("This is a great item that you will love"). Every sentence must do work.
- Don't repeat the title verbatim in the description.

Return ONLY a JSON object matching this schema (no markdown, no commentary):
{
  "title": "Scroll-stopping, sales-focused title under 80 chars. Hook + maker + item + era/detail.",
  "description": "4-6 short, punchy sentences that sell the feeling and the facts. Hook → features → collector cred → soft CTA → 'See photos for full condition.'",
  "category": "One of the allowed categories (see list).",
  "subCategory": "Best-fit sub category text.",
  "condition": "One of: New, Like New, Excellent, Very Good, Good, Fair, For Parts.",
  "whatnotCondition": "One of the Whatnot condition grades (see list). For trading cards/Funko/sealed items, use specific grading. For antiques/vintage, prefer Pre-owned, Excellent, Very Good, Good.",
  "startingBid": 0.00,
  "buyNowPrice": 0.00,
  "suggestedShippingProfile": "One of the allowed shipping profile strings.",
  "estimatedWeightOz": 0,
  "estimatedLengthIn": 0,
  "estimatedWidthIn": 0,
  "estimatedHeightIn": 0,
  "marketNotes": "1-2 sentences on pricing rationale and comparable sales logic."
}

Pricing guidance:
- startingBid should be a sensible Whatnot auction opener (often $1-$10 for typical items, higher for valuable ones).
- buyNowPrice should reflect realistic resale value based on the item type. Lean slightly aggressive on Buy Now for genuinely desirable items — bidders use it as an anchor.
- Be conservative on truly common pieces; sellers can always edit upward.

Dimension guidance:
- Estimate length/width/height in INCHES based on typical item size for the type identified.
- Length = longest side, width = next longest, height = shortest (or upright height for vases/bottles).

Examples of the tone we want:

Weak title: "Vintage Waterford Crystal Vase"
Strong title: "Showstopper Waterford Lismore Crystal Vase — Heavy Hand-Cut Heirloom"

Weak description: "This is a Waterford crystal vase. It is in good condition. See photos."
Strong description: "Pour light through this hand-cut Waterford Lismore vase and watch the room change. Classic diamond-and-wedge cuts catch every flicker, and the lead crystal has that unmistakable bell-tone weight collectors recognize instantly. Signed Waterford on the base — a true Lismore that retails new well above this opener. Perfect as a mantel centerpiece, a wedding gift, or the anchor of your china cabinet. One available at this price — bid early or grab Buy Now before it's gone. See photos for full condition."

Allowed categories: ${WHATNOT_CATEGORIES.join(", ")}
Allowed shipping profiles: ${SHIPPING_PROFILES.join(", ")}
Allowed Whatnot conditions: ${WHATNOT_CONDITIONS.join(", ")}`;

export async function generateListingFromImages(
  imagesBase64: string[],
): Promise<AIListingResult> {
  const content: any[] = [
    {
      type: "input_text",
      text: SYSTEM_PROMPT + "\n\nAnalyze these photos and produce the Whatnot listing JSON.",
    },
  ];
  for (const b64 of imagesBase64.slice(0, 6)) {
    const url = b64.startsWith("data:") || b64.startsWith("http")
      ? b64
      : `data:image/jpeg;base64,${b64}`;
    content.push({ type: "input_image", image_url: url, detail: "auto" });
  }

  const response = await getClient().responses.create({
    model: process.env.OPENAI_MODEL || "gpt-4o",
    input: [{ type: "message", role: "user", content }] as any,
  });

  const text = (response as any).output_text ?? extractText(response);
  if (!text) throw new Error("AI returned empty response");

  const cleaned = text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "");

  let parsed: AIListingResult;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("AI did not return JSON: " + cleaned.slice(0, 200));
    parsed = JSON.parse(match[0]);
  }

  return {
    title: parsed.title || "Untitled item",
    description: parsed.description || "",
    category: parsed.category || "Antiques & Collectibles",
    subCategory: parsed.subCategory || "",
    condition: parsed.condition || "Good",
    whatnotCondition: parsed.whatnotCondition || "Pre-owned",
    startingBid: Number(parsed.startingBid) || 1,
    buyNowPrice: Number(parsed.buyNowPrice) || 0,
    suggestedShippingProfile: parsed.suggestedShippingProfile || "Up to 16 oz",
    estimatedWeightOz: Number(parsed.estimatedWeightOz) || 0,
    estimatedLengthIn: Number(parsed.estimatedLengthIn) || 0,
    estimatedWidthIn: Number(parsed.estimatedWidthIn) || 0,
    estimatedHeightIn: Number(parsed.estimatedHeightIn) || 0,
    marketNotes: parsed.marketNotes || "",
  };
}

function extractText(response: any): string {
  if (!response?.output) return "";
  for (const item of response.output) {
    if (item?.content) {
      for (const c of item.content) {
        if (c?.type === "output_text" && typeof c.text === "string") return c.text;
        if (typeof c?.text === "string") return c.text;
      }
    }
  }
  return "";
}
