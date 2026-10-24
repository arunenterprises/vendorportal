import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Building2, FileText, KeyRound, LayoutDashboard, LogOut, Menu, Receipt, ShieldCheck, Sparkles, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiGet } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/useAuth";
import { endSession } from "@/lib/session";
import { useAutoSync } from "@/lib/useAutoSync";

function navItems(role) {
  const base = [
    { to: "/dashboard", key: "nav_dashboard", icon: LayoutDashboard, id: "dashboard" },
    { to: "/work-orders", key: "nav_work_orders", icon: FileText, id: "work-orders" },
    { to: "/bills", key: "nav_bills", icon: Receipt, id: "bills" },
    { to: "/vendor-profile", key: "nav_profile", icon: Building2, id: "vendor-profile" },
    { to: "/documents", key: "nav_documents", icon: ShieldCheck, id: "documents" },
  ];
  if (role === "admin" || role === "staff") {
    base.push({ to: "/admin", key: "nav_admin", icon: Sparkles, id: "admin" });
  }
  return base;
}

export default function AppLayout({ children, title, subtitle, action }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const isVendor = user?.role === "vendor";
  // keep this portal in step with the workflow portal on every page open
  useAutoSync(Boolean(user));
  const { data: vendor } = useQuery({
    queryKey: ["vendor", "me"],
    queryFn: () => apiGet("/vendors/me"),
    retry: false,
    enabled: isVendor,
  });

  const items = navItems(user?.role);

  async function handleLogout() {
    await endSession();
    navigate("/login", { replace: true });
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex">
      {/* Sidebar */}
      <aside
        data-testid="app-sidebar"
        className={`fixed lg:static inset-y-0 left-0 z-40 w-[264px] bg-[#0B132B] text-slate-100 flex flex-col
          ${open ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0
          transition-transform duration-200 ease-out`}
      >
        <div className="px-5 py-5 border-b border-slate-800">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <img
                src="/arun-logo.jpg"
                alt="Arun Enterprises"
                data-testid="sidebar-logo"
                className="h-11 w-11 rounded-lg object-cover bg-white shrink-0"
              />
              <div className="min-w-0">
                <p className="font-heading text-[15px] leading-tight text-white truncate">
                  ARUN ENTERPRISES
                </p>
                <p className="text-[10px] uppercase tracking-[0.12em] text-slate-400 mt-1 leading-tight">
                  {t("app_tagline")}
                </p>
              </div>
            </div>
            <button
              className="lg:hidden text-slate-400"
              onClick={() => setOpen(false)}
              data-testid="sidebar-close-button"
              aria-label="Close menu"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <nav className="flex-1 px-3 py-5 space-y-1 overflow-y-auto">
          {items.map((item) => {
            const active = location.pathname.startsWith(item.to);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setOpen(false)}
                data-testid={`nav-link-${item.id}`}
                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm
                  [transition:background-color_.18s_ease,color_.18s_ease]
                  ${active
                    ? "bg-[#1D4ED8] text-white font-semibold"
                    : "text-slate-300 hover:bg-[#16213E] hover:text-white"}`}
              >
                <Icon size={17} strokeWidth={2} />
                {item.label ?? t(item.key)}
              </Link>
            );
          })}
        </nav>

        {user && (
          <div className="px-4 py-4 border-t border-slate-800" data-testid="sidebar-user-block">
            {/* vendors see their OWN firm name + firm email, not the contact person */}
            <p className="text-sm text-white font-medium truncate" data-testid="sidebar-user-name">
              {isVendor ? vendor?.company_name || user.name : user.name}
            </p>
            <p className="text-xs text-slate-400 truncate" data-testid="sidebar-user-email">
              {isVendor ? vendor?.email || user.email : user.email}
            </p>
            {isVendor && vendor?.code && (
              <p className="text-[11px] font-mono text-blue-300 mt-1" data-testid="sidebar-vendor-code">
                {vendor.code}
              </p>
            )}
            {isVendor && vendor?.contact_person && (
              <p className="text-[11px] text-slate-500 mt-1 truncate" data-testid="sidebar-contact-person">
                Contact: {vendor.contact_person}
              </p>
            )}
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="inline-block text-[11px] px-2 py-0.5 rounded bg-[#16213E] text-blue-300 border border-slate-700">
                {user.role === "admin" ? t("role_admin") : user.role === "staff" ? "Staff" : t("role_vendor")}
              </span>
              <Link
                to="/change-password"
                onClick={() => setOpen(false)}
                data-testid="nav-link-change-password"
                title="Update Password"
                className={`flex items-center gap-1.5 text-[11px] px-2 py-1 rounded border
                  [transition:background-color_.18s_ease,color_.18s_ease]
                  ${location.pathname.startsWith("/change-password")
                    ? "bg-[#1D4ED8] text-white border-[#1D4ED8]"
                    : "text-slate-300 border-slate-700 hover:bg-[#16213E] hover:text-white"}`}
              >
                <KeyRound size={12} /> Update Password
              </Link>
            </div>
          </div>
        )}
      </aside>

      {open && (
        <div
          className="fixed inset-0 bg-slate-900/50 z-30 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Main column */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="bg-white border-b border-slate-200 sticky top-0 z-20">
          <div className="px-5 lg:px-8 py-3.5 flex items-center gap-4">
            <button
              className="lg:hidden text-slate-700"
              onClick={() => setOpen(true)}
              data-testid="sidebar-open-button"
              aria-label="Open menu"
            >
              <Menu size={20} />
            </button>
            <p className="text-sm text-slate-500 hidden sm:block flex-1 truncate">
              {t("app_name")}
            </p>
            <div className="flex-1 sm:flex-none" />
            <Button
              variant="outline"
              size="sm"
              onClick={handleLogout}
              data-testid="logout-button"
              className="gap-2"
            >
              <LogOut size={15} />
              <span className="hidden sm:inline">{t("logout")}</span>
            </Button>
          </div>
        </header>

        <main className="flex-1 px-5 lg:px-8 py-6 lg:py-8">
          <div className="max-w-[1320px]">
            <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
              <div>
                <h1 className="text-[38px] leading-tight font-semibold text-slate-900" data-testid="page-title">
                  {title}
                </h1>
                {subtitle && (
                  <p className="text-base font-semibold text-slate-700 mt-2 max-w-2xl">{subtitle}</p>
                )}
              </div>
              {action}
            </div>
            <div className="vp-rise">{children}</div>
          </div>
        </main>
      </div>
    </div>
  );
}
