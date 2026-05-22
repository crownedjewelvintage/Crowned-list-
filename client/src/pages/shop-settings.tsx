import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { AppHeader } from "@/components/AppHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Save, Eye, EyeOff, ExternalLink, Truck, CreditCard, Gift, Store, Megaphone, AtSign } from "lucide-react";

type ShopSettings = {
  pointsPerDollar: number;
  pointsPerDollarRedeem: number;
  signupBonus: number;
  referralBonus: number;
  tierSilverAt: number;
  tierGoldAt: number;
  tierPlatinumAt: number;
  stripePublishableKey: string;
  stripeSecretKey: string;
  freeShippingThreshold: number;
  flatShippingRate: number;
  shopName: string;
  heroEyebrow: string;
  heroTitle: string;
  heroTitleItalic: string;
  heroSubtitle: string;
  announcementBar: string;
  aboutText: string;
  contactEmail: string;
  instagramUrl: string;
  whatnotUrl: string;
  taxRate: number;
};

export default function ShopSettingsPage() {
  const { toast } = useToast();
  const [showSecret, setShowSecret] = useState(false);
  const [form, setForm] = useState<ShopSettings | null>(null);

  const { data, isLoading } = useQuery<ShopSettings>({
    queryKey: ["/api/shop/admin/settings"],
  });

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const mutation = useMutation({
    mutationFn: async (payload: Partial<ShopSettings>) => {
      return apiRequest("PATCH", "/api/shop/admin/settings", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/shop/admin/settings"] });
      toast({ title: "Settings saved", description: "Your shop settings have been updated." });
    },
    onError: (e: any) => {
      toast({ title: "Save failed", description: e?.message || "Unknown error", variant: "destructive" });
    },
  });

  function update<K extends keyof ShopSettings>(key: K, value: ShopSettings[K]) {
    if (!form) return;
    setForm({ ...form, [key]: value });
  }

  function handleSave() {
    if (!form) return;
    mutation.mutate(form);
  }

  if (isLoading || !form) {
    return (
      <>
        <AppHeader />
        <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
          <div className="text-muted-foreground">Loading settings…</div>
        </main>
      </>
    );
  }

  return (
    <>
      <AppHeader />
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Shop Settings</h1>
          <p className="text-muted-foreground mt-1">
            Configure payments, shipping, and loyalty rewards for crownedjewelvintage.com
          </p>
        </div>

        {/* Storefront Content */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Store className="size-5" />
              Storefront Content
            </CardTitle>
            <CardDescription>
              These appear on crownedjewelvintage.com. Changes go live within a minute of saving.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="shopName">Shop Name</Label>
              <Input
                id="shopName"
                data-testid="input-shop-name"
                value={form.shopName}
                onChange={(e) => update("shopName", e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Appears in the header and browser tab.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="heroEyebrow">Hero Eyebrow (small uppercase text above the headline)</Label>
              <Input
                id="heroEyebrow"
                data-testid="input-hero-eyebrow"
                value={form.heroEyebrow}
                onChange={(e) => update("heroEyebrow", e.target.value)}
                placeholder="ESTATE-FRESH \u00b7 ONE-OF-ONE"
              />
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="heroTitle">Hero Title (regular)</Label>
                <Input
                  id="heroTitle"
                  data-testid="input-hero-title"
                  value={form.heroTitle}
                  onChange={(e) => update("heroTitle", e.target.value)}
                  placeholder="Heirloom-quality vintage,"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="heroTitleItalic">Hero Title (italic accent)</Label>
                <Input
                  id="heroTitleItalic"
                  data-testid="input-hero-title-italic"
                  value={form.heroTitleItalic}
                  onChange={(e) => update("heroTitleItalic", e.target.value)}
                  placeholder="carefully curated."
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="heroSubtitle">Hero Subtitle</Label>
              <Textarea
                id="heroSubtitle"
                data-testid="input-hero-subtitle"
                rows={3}
                value={form.heroSubtitle}
                onChange={(e) => update("heroSubtitle", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="announcementBar" className="flex items-center gap-2">
                <Megaphone className="size-4" /> Announcement Bar (optional)
              </Label>
              <Input
                id="announcementBar"
                data-testid="input-announcement-bar"
                value={form.announcementBar}
                onChange={(e) => update("announcementBar", e.target.value)}
                placeholder="Free shipping on orders over $100"
              />
              <p className="text-xs text-muted-foreground">Shows as a strip across the top of every shop page. Leave blank to hide.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="aboutText">About Page Text</Label>
              <Textarea
                id="aboutText"
                data-testid="input-about-text"
                rows={6}
                value={form.aboutText}
                onChange={(e) => update("aboutText", e.target.value)}
                placeholder="Tell your customers about your shop, sourcing process, and what makes your pieces special..."
              />
            </div>
          </CardContent>
        </Card>

        {/* Contact & Social */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AtSign className="size-5" />
              Contact & Social Links
            </CardTitle>
            <CardDescription>Customer support email and social media links.</CardDescription>
          </CardHeader>
          <CardContent className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="contactEmail">Customer Support Email</Label>
              <Input
                id="contactEmail"
                data-testid="input-contact-email"
                type="email"
                value={form.contactEmail}
                onChange={(e) => update("contactEmail", e.target.value)}
                placeholder="hello@crownedjewelvintage.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="instagramUrl">Instagram URL</Label>
              <Input
                id="instagramUrl"
                data-testid="input-instagram"
                value={form.instagramUrl}
                onChange={(e) => update("instagramUrl", e.target.value)}
                placeholder="https://instagram.com/crownedjewelvintage"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="whatnotUrl">Whatnot URL</Label>
              <Input
                id="whatnotUrl"
                data-testid="input-whatnot"
                value={form.whatnotUrl}
                onChange={(e) => update("whatnotUrl", e.target.value)}
                placeholder="https://whatnot.com/user/crownedjewel"
              />
            </div>
          </CardContent>
        </Card>

        {/* Stripe Payments */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="size-5" />
              Stripe Payments
            </CardTitle>
            <CardDescription>
              Connect Stripe to accept credit card payments. Get your keys from{" "}
              <a
                href="https://dashboard.stripe.com/apikeys"
                target="_blank"
                rel="noreferrer"
                className="text-primary underline inline-flex items-center gap-1"
                data-testid="link-stripe-dashboard"
              >
                dashboard.stripe.com/apikeys
                <ExternalLink className="size-3" />
              </a>
              . Start with test keys (pk_test_… / sk_test_…) then switch to live keys when ready.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="pk">Publishable Key</Label>
              <Input
                id="pk"
                data-testid="input-stripe-publishable"
                value={form.stripePublishableKey}
                onChange={(e) => update("stripePublishableKey", e.target.value)}
                placeholder="pk_test_..."
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">Safe to expose. Used by the storefront to tokenize card details.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="sk">Secret Key</Label>
              <div className="flex gap-2">
                <Input
                  id="sk"
                  data-testid="input-stripe-secret"
                  type={showSecret ? "text" : "password"}
                  value={form.stripeSecretKey}
                  onChange={(e) => update("stripeSecretKey", e.target.value)}
                  placeholder="sk_test_..."
                  autoComplete="off"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setShowSecret(!showSecret)}
                  data-testid="button-toggle-secret"
                  aria-label={showSecret ? "Hide secret" : "Show secret"}
                >
                  {showSecret ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Never share this. Used server-side to charge cards.</p>
            </div>
          </CardContent>
        </Card>

        {/* Shipping */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Truck className="size-5" />
              Shipping
            </CardTitle>
            <CardDescription>
              Flat-rate shipping with a free-shipping threshold to encourage bigger orders.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="flat">Flat Shipping Rate ($)</Label>
              <Input
                id="flat"
                data-testid="input-flat-shipping"
                type="number"
                min="0"
                step="0.5"
                value={form.flatShippingRate}
                onChange={(e) => update("flatShippingRate", parseFloat(e.target.value) || 0)}
              />
              <p className="text-xs text-muted-foreground">Charged on every order under the free threshold.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="free">Free Shipping Over ($)</Label>
              <Input
                id="free"
                data-testid="input-free-threshold"
                type="number"
                min="0"
                step="5"
                value={form.freeShippingThreshold}
                onChange={(e) => update("freeShippingThreshold", parseFloat(e.target.value) || 0)}
              />
              <p className="text-xs text-muted-foreground">Orders ≥ this subtotal ship free.</p>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="taxRate">Sales Tax Rate (%)</Label>
              <Input
                id="taxRate"
                data-testid="input-tax-rate"
                type="number"
                min="0"
                max="15"
                step="0.01"
                value={form.taxRate}
                onChange={(e) => update("taxRate", parseFloat(e.target.value) || 0)}
              />
              <p className="text-xs text-muted-foreground">Texas state tax is 6.25%; with Dallas local tax it&apos;s usually 8.25%. Leave 0 to not charge tax.</p>
            </div>
          </CardContent>
        </Card>

        {/* Loyalty */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Gift className="size-5" />
              Loyalty & Rewards
            </CardTitle>
            <CardDescription>How customers earn and redeem points.</CardDescription>
          </CardHeader>
          <CardContent className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="ppd">Points Earned per $1 Spent</Label>
              <Input
                id="ppd"
                data-testid="input-points-per-dollar"
                type="number"
                min="0"
                step="0.1"
                value={form.pointsPerDollar}
                onChange={(e) => update("pointsPerDollar", parseFloat(e.target.value) || 0)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ppdr">Points Needed for $1 Discount</Label>
              <Input
                id="ppdr"
                data-testid="input-points-redeem"
                type="number"
                min="1"
                step="1"
                value={form.pointsPerDollarRedeem}
                onChange={(e) => update("pointsPerDollarRedeem", parseFloat(e.target.value) || 0)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="signup">Sign-up Bonus (points)</Label>
              <Input
                id="signup"
                data-testid="input-signup-bonus"
                type="number"
                min="0"
                value={form.signupBonus}
                onChange={(e) => update("signupBonus", parseInt(e.target.value) || 0)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="referral">Referral Bonus (points)</Label>
              <Input
                id="referral"
                data-testid="input-referral-bonus"
                type="number"
                min="0"
                value={form.referralBonus}
                onChange={(e) => update("referralBonus", parseInt(e.target.value) || 0)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="silver">Silver Tier at (points)</Label>
              <Input
                id="silver"
                data-testid="input-tier-silver"
                type="number"
                min="0"
                value={form.tierSilverAt}
                onChange={(e) => update("tierSilverAt", parseInt(e.target.value) || 0)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="gold">Gold Tier at (points)</Label>
              <Input
                id="gold"
                data-testid="input-tier-gold"
                type="number"
                min="0"
                value={form.tierGoldAt}
                onChange={(e) => update("tierGoldAt", parseInt(e.target.value) || 0)}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="platinum">Platinum Tier at (points)</Label>
              <Input
                id="platinum"
                data-testid="input-tier-platinum"
                type="number"
                min="0"
                value={form.tierPlatinumAt}
                onChange={(e) => update("tierPlatinumAt", parseInt(e.target.value) || 0)}
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end sticky bottom-4">
          <Button
            data-testid="button-save-settings"
            size="lg"
            onClick={handleSave}
            disabled={mutation.isPending}
            className="shadow-lg"
          >
            <Save className="size-4 mr-2" />
            {mutation.isPending ? "Saving…" : "Save All Settings"}
          </Button>
        </div>
      </main>
    </>
  );
}
