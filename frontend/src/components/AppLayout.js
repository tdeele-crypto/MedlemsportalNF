import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard,
  Users,
  Calendar,
  UserCog,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";

const LOGO_URL = "https://customer-assets.emergentagent.com/job_member-events-3/artifacts/zysp8e23_nflogo.jpg";

const navItems = [
  { to: "/", label: "Oversigt", icon: LayoutDashboard, end: true, key: "dashboard" },
  { to: "/medlemmer", label: "Medlemmer", icon: Users, key: "members" },
  { to: "/arrangementer", label: "Arrangementer", icon: Calendar, key: "events" },
];

export default function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const items = [...navItems];
  if (user?.role === "admin") {
    items.push({ to: "/brugere", label: "Brugere", icon: UserCog, key: "users" });
  }

  return (
    <div className="min-h-screen flex bg-background" data-testid="app-shell">
      {/* Sidebar */}
      <aside className="hidden md:flex md:flex-col w-64 border-r border-border bg-white">
        <div className="h-16 flex items-center gap-2 px-6 border-b border-border">
          <img src={LOGO_URL} alt="Nyreforeningen" className="w-7 h-7 object-contain" />
          <span className="font-semibold tracking-tight text-foreground">Medlemsportal</span>
        </div>
        <nav className="flex-1 px-3 py-6 space-y-1">
          {items.map((it) => (
            <NavLink
              key={it.key}
              to={it.to}
              end={it.end}
              data-testid={`nav-${it.key}`}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                  isActive
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-foreground/70 hover:text-foreground hover:bg-muted"
                )
              }
            >
              <it.icon className="w-4 h-4" strokeWidth={1.6} />
              {it.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-4 border-t border-border space-y-3">
          <div className="px-2">
            <div className="text-xs text-muted-foreground">Logget ind som</div>
            <div className="text-sm font-medium truncate" data-testid="current-user-email">
              {user?.email}
            </div>
            <div className="label-tiny mt-1">{user?.role === "admin" ? "Administrator" : "Bruger"}</div>
          </div>
          <Button
            variant="ghost"
            className="w-full justify-start text-foreground/70 hover:text-foreground"
            onClick={handleLogout}
            data-testid="logout-button"
          >
            <LogOut className="w-4 h-4 mr-2" strokeWidth={1.6} />
            Log ud
          </Button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="md:hidden h-14 px-4 flex items-center justify-between border-b border-border bg-white">
          <div className="flex items-center gap-2">
            <img src={LOGO_URL} alt="Nyreforeningen" className="w-7 h-7 object-contain" />
            <span className="font-semibold tracking-tight text-sm">Medlemsportal</span>
          </div>
          <Button variant="ghost" size="sm" onClick={handleLogout} data-testid="logout-button-mobile">
            <LogOut className="w-4 h-4" strokeWidth={1.6} />
          </Button>
        </header>
        <div className="md:hidden border-b border-border bg-white overflow-x-auto">
          <nav className="flex gap-1 px-3 py-2">
            {items.map((it) => (
              <NavLink
                key={it.key}
                to={it.to}
                end={it.end}
                data-testid={`nav-mobile-${it.key}`}
                className={({ isActive }) =>
                  cn(
                    "px-3 py-1.5 rounded-md text-xs whitespace-nowrap",
                    isActive ? "bg-primary/10 text-primary font-medium" : "text-foreground/70"
                  )
                }
              >
                {it.label}
              </NavLink>
            ))}
          </nav>
        </div>

        <main className="flex-1 overflow-x-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
