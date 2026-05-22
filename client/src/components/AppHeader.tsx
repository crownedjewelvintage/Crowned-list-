import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import { LogOut, Sun, Moon, Package, Calendar, ListOrdered, BarChart3, ShoppingBag, Users, Settings } from "lucide-react";

export function CrownLogo({ size = 32 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-label="Crown List"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="32" height="32" rx="7" fill="hsl(var(--brand-emerald-deep))" />
      {/* Crown silhouette: V-cut between three peaks, with gold accents */}
      <path
        d="M7 12.5 L10.5 17 L13 11 L16 16 L19 11 L21.5 17 L25 12.5 L24 22 H8 Z"
        fill="hsl(var(--brand-gold))"
        stroke="hsl(var(--brand-gold-deep))"
        strokeWidth="0.6"
        strokeLinejoin="round"
      />
      {/* Crown band */}
      <rect x="8" y="21" width="16" height="2.4" rx="0.6" fill="hsl(var(--brand-gold-deep))" />
      {/* Gem dots on the three peaks */}
      <circle cx="10.5" cy="17.4" r="0.9" fill="hsl(var(--brand-emerald))" />
      <circle cx="16" cy="16.4" r="1" fill="hsl(var(--brand-emerald))" />
      <circle cx="21.5" cy="17.4" r="0.9" fill="hsl(var(--brand-emerald))" />
    </svg>
  );
}

export function AppHeader() {
  const { user, logout } = useAuth();
  const { theme, toggle: toggleTheme } = useTheme();
  const [location] = useLocation();

  // active match: "/" === inventory, "/shows*" === shows
  const isInventory = location === "/" || location === "";
  const isShows = location.startsWith("/shows");
  const isOrders = location.startsWith("/orders");
  const isReports = location.startsWith("/reports");
  const isShopOrders = location.startsWith("/shop-orders");
  const isShopCustomers = location.startsWith("/shop-customers");
  const isShopSettings = location.startsWith("/shop-settings");

  return (
    <header className="border-b border-border bg-card/50 backdrop-blur sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/" className="flex items-center gap-2.5 min-w-0">
            <CrownLogo size={32} />
            <div className="min-w-0 hidden sm:block">
              <h1
                className="text-base font-semibold tracking-tight truncate"
                style={{ fontFamily: "var(--font-serif)" }}
              >
                Crown List
              </h1>
              <p className="text-xs text-muted-foreground truncate">@{user?.username}</p>
            </div>
          </Link>
          <nav className="ml-1 sm:ml-3 flex items-center gap-1">
            <Link href="/">
              <Button
                data-testid="nav-inventory"
                variant={isInventory ? "secondary" : "ghost"}
                size="sm"
                className="gap-1.5"
              >
                <Package className="size-4" />
                <span className="hidden sm:inline">Inventory</span>
              </Button>
            </Link>
            <Link href="/shows">
              <Button
                data-testid="nav-shows"
                variant={isShows ? "secondary" : "ghost"}
                size="sm"
                className="gap-1.5"
              >
                <Calendar className="size-4" />
                <span className="hidden sm:inline">Shows</span>
              </Button>
            </Link>
            <Link href="/orders">
              <Button
                data-testid="nav-orders"
                variant={isOrders ? "secondary" : "ghost"}
                size="sm"
                className="gap-1.5"
              >
                <ListOrdered className="size-4" />
                <span className="hidden sm:inline">Orders</span>
              </Button>
            </Link>
            <Link href="/reports">
              <Button
                data-testid="nav-reports"
                variant={isReports ? "secondary" : "ghost"}
                size="sm"
                className="gap-1.5"
              >
                <BarChart3 className="size-4" />
                <span className="hidden sm:inline">Reports</span>
              </Button>
            </Link>
            <Link href="/shop-orders">
              <Button
                data-testid="nav-shop-orders"
                variant={isShopOrders ? "secondary" : "ghost"}
                size="sm"
                className="gap-1.5"
              >
                <ShoppingBag className="size-4" />
                <span className="hidden md:inline">Shop Orders</span>
              </Button>
            </Link>
            <Link href="/shop-customers">
              <Button
                data-testid="nav-shop-customers"
                variant={isShopCustomers ? "secondary" : "ghost"}
                size="sm"
                className="gap-1.5"
              >
                <Users className="size-4" />
                <span className="hidden md:inline">Shop Customers</span>
              </Button>
            </Link>
            <Link href="/shop-settings">
              <Button
                data-testid="nav-shop-settings"
                variant={isShopSettings ? "secondary" : "ghost"}
                size="sm"
                className="gap-1.5"
              >
                <Settings className="size-4" />
                <span className="hidden md:inline">Settings</span>
              </Button>
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            data-testid="button-toggle-theme"
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            aria-label="Toggle theme"
          >
            {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </Button>
          <Button data-testid="button-logout" variant="ghost" size="sm" onClick={logout}>
            <LogOut className="size-4 mr-1.5" />
            <span className="hidden sm:inline">Sign out</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
