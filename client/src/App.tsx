import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "./lib/auth";
import { ThemeProvider } from "./lib/theme";
import LoginPage from "./pages/login";
import InventoryPage from "./pages/inventory";
import ShowsPage from "./pages/shows";
import ShowDetailPage from "./pages/show-detail";
import OrdersPage from "./pages/orders";
import ReportsPage from "./pages/reports";
import ShopOrdersPage from "./pages/shop-orders";
import ShopCustomersPage from "./pages/shop-customers";
import NotFound from "@/pages/not-found";

function AppRouter() {
  const { user } = useAuth();
  if (!user) return <LoginPage />;
  return (
    <Switch>
      <Route path="/" component={InventoryPage} />
      <Route path="/shows" component={ShowsPage} />
      <Route path="/shows/:id" component={ShowDetailPage} />
      <Route path="/orders" component={OrdersPage} />
      <Route path="/reports" component={ReportsPage} />
      <Route path="/shop-orders" component={ShopOrdersPage} />
      <Route path="/shop-customers" component={ShopCustomersPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <TooltipProvider>
            <Toaster />
            <Router hook={useHashLocation}>
              <AppRouter />
            </Router>
          </TooltipProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
