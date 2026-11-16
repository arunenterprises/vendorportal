import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Lock, ShieldCheck, TrendingUp, FileCheck2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiPost } from "@/lib/api";
import { beginSession } from "@/lib/session";
import { useI18n } from "@/lib/i18n";

const HERO =
  "https://images.unsplash.com/photo-1786026632790-1f228b894919?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2OTF8MHwxfHNlYXJjaHwzfHxpbmR1c3RyaWFsJTIwZW50ZXJwcmlzZSUyMGxvZ2lzdGljcyUyMHdhcmVob3VzZSUyMHdvcmtlcnxlbnwwfHx8fDE3OTA1OTI2NzZ8MA&ixlib=rb-4.1.0&q=85";

export default function Login() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const login = useMutation({
    mutationFn: (creds) => apiPost("/auth/login", creds),
    onSuccess: (user) => {
      beginSession();
      toast.success(`${t("welcome_back")}, ${user.name}`);
      navigate(["superadmin", "admin", "staff"].includes(user.role) ? "/admin" : "/dashboard", { replace: true });
    },
    onError: () => toast.error(t("login_failed")),
  });

  function onSubmit(e) {
    e.preventDefault();
    if (!email.trim() || !password) {
      toast.error(t("required_fields"));
      return;
    }
    login.mutate({ identifier: email.trim(), password });
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-[1.05fr_1fr] bg-[#F8FAFC]">
      {/* Brand panel */}
      <div className="relative hidden lg:flex flex-col justify-between p-12 overflow-hidden bg-[#0B132B]">
        <img
          src={HERO}
          alt="Industrial enterprise logistics facility"
          className="absolute inset-0 w-full h-full object-cover opacity-25"
        />
        <div className="absolute inset-0 bg-[#0B132B]/80" />
        <div className="relative flex items-center gap-3">
          <img
            src="/arun-logo.jpg"
            alt="Arun Enterprises"
            className="h-14 w-14 rounded-xl object-cover bg-white"
          />
          <div>
            <p className="font-heading text-xl text-white leading-tight">ARUN ENTERPRISES</p>
            <p className="text-[10px] uppercase tracking-[0.18em] text-slate-400 mt-1">
              {t("app_tagline")}
            </p>
          </div>
        </div>
        <div className="relative max-w-xl mx-auto text-center">
          <h2
            className="font-heading text-white tracking-tight"
            data-testid="login-brand-heading"
          >
            <span className="block text-[44px] leading-[1.05]">Vendor Portal</span>
            <span className="block text-[26px] leading-[1.2] mt-2 text-blue-300 uppercase tracking-[0.08em]">
              for Arun Enterprises
            </span>
          </h2>
          <span className="mt-5 block h-px w-24 mx-auto bg-gradient-to-r from-transparent via-[#1D4ED8] to-transparent" />
          <p className="text-slate-300 mt-5 leading-relaxed">{t("login_sub")}</p>
          <div className="grid grid-cols-3 gap-4 mt-10 text-left">
            {[
              { icon: FileCheck2, label: "Work Orders", value: "PO tracking" },
              { icon: TrendingUp, label: "Payments", value: "Live status" },
              { icon: ShieldCheck, label: "Compliance", value: "GST / MSME" },
            ].map((s) => (
              <div key={s.label} className="border-l-2 border-[#1D4ED8] pl-3">
                <s.icon size={18} className="text-blue-400 mb-2" />
                <p className="text-white text-sm font-semibold">{s.label}</p>
                <p className="text-slate-400 text-xs mt-0.5">{s.value}</p>
              </div>
            ))}
          </div>
        </div>
        <p className="relative text-xs text-slate-500">
          {t("company_addr")}
          <br />
          {t("toll_free")}: 9429694552 · info@arunenterprises.online · www.arunenterprises.com.in
        </p>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-[420px] vp-rise">
          <div className="flex items-center justify-between mb-8">
            <div className="lg:hidden flex items-center gap-2">
              <img src="/arun-logo.jpg" alt="Arun Enterprises" className="h-9 w-9 rounded-lg object-cover" />
              <p className="font-heading text-base text-slate-900 leading-tight">ARUN ENTERPRISES</p>
            </div>
          </div>

          <div className="inline-flex items-center gap-2 text-[#1D4ED8] mb-3">
            <Lock size={16} />
            <span className="text-[11px] uppercase tracking-[0.15em] font-semibold">
              Secure Access
            </span>
          </div>
          <h1 className="text-[32px] font-semibold text-slate-900 leading-tight">
            {t("login_title")}
          </h1>
          <p className="text-sm text-slate-500 mt-2">{t("login_sub")}</p>

          <form onSubmit={onSubmit} className="mt-8 space-y-5" data-testid="login-form">
            <div className="space-y-2">
              <Label htmlFor="identifier">{t("vendor_code_or_email")}</Label>
              <Input
                id="identifier"
                type="text"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder=""
                data-testid="login-email-input"
                autoComplete="off"
              />
              <p className="text-xs text-slate-500">{t("vendor_code_hint")}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{t("password")}</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder=""
                data-testid="login-password-input"
                autoComplete="new-password"
              />
            </div>
            <Button
              type="submit"
              disabled={login.isPending}
              data-testid="login-submit-button"
              className="w-full bg-[#1D4ED8] hover:bg-[#1E40AF] text-white h-11 active:scale-[0.98] [transition:background-color_.18s_ease,transform_.1s_ease]"
            >
              {login.isPending ? t("signing_in") : t("sign_in")}
            </Button>
          </form>

          <div className="mt-8 pt-6 border-t border-slate-200">
            <p className="text-xs text-slate-400 leading-relaxed text-center">
              {t("company_addr")}
              <br />
              {t("toll_free")}: 9429694552 · info@arunenterprises.online
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
