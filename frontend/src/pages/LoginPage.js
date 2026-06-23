import { useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatApiError } from "@/lib/api";
import { Leaf } from "lucide-react";

export default function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await login(email.trim(), password);
      navigate("/");
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2" data-testid="login-page">
      <div className="login-bg hidden lg:flex flex-col justify-between p-12 text-white">
        <div className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          <Leaf className="w-5 h-5" strokeWidth={1.5} />
          <span>Medlemsportal</span>
        </div>
        <div>
          <h1 className="text-4xl font-bold tracking-tight leading-tight">
            Hold styr på <br />arrangementer og <br /> tilmeldinger.
          </h1>
          <p className="mt-4 text-white/80 max-w-md leading-relaxed">
            Et enkelt værktøj til foreninger – importér medlemmer, opret arrangementer,
            og tilmeld deltagere med få klik.
          </p>
        </div>
        <div className="text-xs text-white/60">© Medlemsportal</div>
      </div>

      <div className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center gap-2 mb-8 text-primary font-semibold">
            <Leaf className="w-5 h-5" strokeWidth={1.5} />
            <span>Medlemsportal</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            Velkommen tilbage
          </h2>
          <p className="text-sm text-muted-foreground mt-2">
            Log ind for at administrere medlemmer og arrangementer.
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5" data-testid="login-form">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="navn@email.dk"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                data-testid="login-email-input"
                autoComplete="email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Adgangskode</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                data-testid="login-password-input"
                autoComplete="current-password"
              />
            </div>
            {error && (
              <div
                className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-3 py-2"
                data-testid="login-error"
              >
                {error}
              </div>
            )}
            <Button
              type="submit"
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
              disabled={submitting}
              data-testid="login-submit-button"
            >
              {submitting ? "Logger ind..." : "Log ind"}
            </Button>
          </form>

          <p className="mt-8 text-xs text-muted-foreground leading-relaxed">
            Har du ikke en konto? Kontakt din administrator for at få adgang.
          </p>
        </div>
      </div>
    </div>
  );
}
