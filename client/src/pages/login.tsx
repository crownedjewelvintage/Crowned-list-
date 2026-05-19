import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { Sparkles } from "lucide-react";
import { CrownLogo } from "@/components/AppHeader";

export default function LoginPage() {
  const { login, signup, loading } = useAuth();
  const { toast } = useToast();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      toast({ title: "Missing fields", description: "Username and password required", variant: "destructive" });
      return;
    }
    try {
      if (mode === "login") await login(username.trim(), password);
      else await signup(username.trim(), password);
    } catch (err: any) {
      toast({ title: mode === "login" ? "Login failed" : "Signup failed", description: err.message, variant: "destructive" });
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Left: brand panel */}
      <div
        className="hidden lg:flex relative overflow-hidden text-[hsl(var(--brand-gold))]"
        style={{
          background:
            "linear-gradient(155deg, hsl(var(--brand-emerald-deep)) 0%, hsl(var(--brand-ink)) 100%)",
        }}
      >
        {/* Gold dust pattern */}
        <div
          className="absolute inset-0 opacity-[0.18]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 30%, hsl(var(--brand-gold)) 1px, transparent 1.5px), radial-gradient(circle at 80% 70%, hsl(var(--brand-gold)) 1px, transparent 1.5px)",
            backgroundSize: "40px 40px, 60px 60px",
          }}
        />
        {/* Gold corner glint */}
        <div
          className="absolute -top-32 -right-32 size-96 rounded-full opacity-20 blur-3xl"
          style={{ background: "hsl(var(--brand-gold))" }}
        />
        <div className="relative z-10 flex flex-col justify-between p-12 w-full">
          <div className="flex items-center gap-3">
            <CrownLogo size={40} />
            <span
              className="text-2xl font-semibold tracking-tight text-[hsl(var(--brand-gold))]"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              Crown List
            </span>
          </div>
          <div className="space-y-6 max-w-md">
            <h1
              className="text-4xl leading-tight text-white"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              Treat every listing like the crown jewel.
            </h1>
            <p className="text-base text-white/85 leading-relaxed">
              Snap photos of your antiques, crystal, china, or collectibles. AI writes a sales-focused title and
              description, suggests pricing, generates a SKU, plans your shows, tracks orders, and exports the
              Whatnot CSV in one tap.
            </p>
            <ul className="space-y-2.5 text-sm text-white/85">
              <FeatureLi>AI-drafted, sales-focused titles & descriptions</FeatureLi>
              <FeatureLi>Smart starting bid + Buy-Now pricing</FeatureLi>
              <FeatureLi>Show planner & live-show CSV export</FeatureLi>
              <FeatureLi>Order tracking & packing-list export</FeatureLi>
            </ul>
          </div>
          <p className="text-xs text-white/60">Built for vintage and antique resellers.</p>
        </div>
      </div>

      {/* Right: form */}
      <div className="flex items-center justify-center p-6 sm:p-12 bg-background">
        <div className="w-full max-w-sm space-y-7">
          <div className="lg:hidden flex items-center gap-2.5">
            <CrownLogo size={32} />
            <span className="text-lg font-semibold tracking-tight" style={{ fontFamily: "var(--font-serif)" }}>
              Crown List
            </span>
          </div>
          <div>
            <h2 className="text-2xl font-semibold tracking-tight" style={{ fontFamily: "var(--font-serif)" }}>
              {mode === "login" ? "Welcome back" : "Create your account"}
            </h2>
            <p className="text-sm text-muted-foreground mt-1.5">
              {mode === "login" ? "Sign in to manage your inventory." : "Free to start. Your inventory stays private to your account."}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                data-testid="input-username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="your_handle"
                autoComplete="username"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                data-testid="input-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
              />
            </div>
            <Button type="submit" data-testid="button-submit-auth" className="w-full" disabled={loading}>
              {loading ? (
                "Working..."
              ) : (
                <>
                  <Sparkles className="size-4 mr-2" />
                  {mode === "login" ? "Sign in" : "Create account"}
                </>
              )}
            </Button>
          </form>

          <div className="text-center text-sm text-muted-foreground">
            {mode === "login" ? (
              <>
                No account?{" "}
                <button data-testid="link-toggle-mode" onClick={() => setMode("signup")} className="text-primary hover:underline font-medium">
                  Create one
                </button>
              </>
            ) : (
              <>
                Already have one?{" "}
                <button data-testid="link-toggle-mode" onClick={() => setMode("login")} className="text-primary hover:underline font-medium">
                  Sign in
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function FeatureLi({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5">
      <span className="mt-1.5 size-1.5 rounded-full bg-current opacity-80 shrink-0" />
      <span>{children}</span>
    </li>
  );
}


