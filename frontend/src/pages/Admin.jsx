import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Building2, Download, KeyRound, RefreshCw, Trash2, UserPlus, Eye, EyeOff } from "lucide-react";
import AppLayout from "@/components/AppLayout";
import RequireAuth from "@/components/RequireAuth";
import StatusBadge from "@/components/StatusBadge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api";
import { formatINR, useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/useAuth";
import WorkOrderCopyUpload from "@/components/WorkOrderCopyUpload";
import { downloadFile } from "@/lib/download";

const EMPTY_USER = { email: "", name: "", role: "vendor", vendor_code: "", password: "" };
const ROLE_LABELS = { vendor: "Vendor", staff: "Staff (view only)", admin: "Administrator" };

function AdminInner() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { user: me } = useAuth();
  const isAdmin = me?.role === "admin";  // staff may view everything but change nothing
  const qc = useQueryClient();
  const [userOpen, setUserOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_USER);
  const [pwDraft, setPwDraft] = useState({});
  const [pwUser, setPwUser] = useState(null);

  const users = useQuery({ queryKey: ["users"], queryFn: () => apiGet("/users"), retry: false });
  const vendors = useQuery({ queryKey: ["vendors"], queryFn: () => apiGet("/vendors"), retry: false });
  const bills = useQuery({ queryKey: ["bills"], queryFn: () => apiGet("/bills"), retry: false });
  const orders = useQuery({ queryKey: ["work-orders"], queryFn: () => apiGet("/work-orders"), retry: false });
  const syncInfo = useQuery({ queryKey: ["sync-status"], queryFn: () => apiGet("/sync/status"), retry: false });
  const syncRuns = useQuery({ queryKey: ["sync-runs"], queryFn: () => apiGet("/sync/runs"), retry: false });
  const register = useQuery({
    queryKey: ["payments-register"],
    queryFn: () => apiGet("/bills/payments-register"),
    retry: false,
  });

  const userRows = users.isError ? [] : users.data ?? [];
  const syncRows = syncRuns.isError ? [] : syncRuns.data ?? [];
  const registerRows = register.isError ? [] : register.data ?? [];
  const vendorRows = vendors.isError ? [] : vendors.data ?? [];
  const billRows = bills.isError ? [] : bills.data ?? [];
  // admin bills view: status + date-range filters for month-end checks
  const [billStatus, setBillStatus] = useState("all");
  const [billFrom, setBillFrom] = useState("");
  const [billTo, setBillTo] = useState("");
  const filteredBills = useMemo(() => {
    return billRows.filter((b) => {
      if (billStatus !== "all" && b.status !== billStatus) return false;
      const day = String(b.filling_date || b.invoice_date || "").slice(0, 10);
      if (billFrom && (!day || day < billFrom)) return false;
      if (billTo && (!day || day > billTo)) return false;
      return true;
    });
  }, [billRows, billStatus, billFrom, billTo]);
  const filteredTotal = filteredBills.reduce((s, b) => s + (b.total_amount || 0), 0);
  const orderRows = useMemo(() => {
    const list = orders.isError ? [] : orders.data ?? [];
    // one row per work order, even if an older id scheme left a stale copy behind
    const seen = new Map();
    for (const o of list) {
      const key = `${o.vendor_id}::${o.po_number}`;
      if (!seen.has(key)) seen.set(key, o);
    }
    return [...seen.values()];
  }, [orders.data, orders.isError]);

  const runSync = useMutation({
    mutationFn: () => apiPost("/sync/arun"),
    onSuccess: (r) => {
      ["vendors", "bills", "work-orders", "summary", "sync-status", "users", "payments-register", "sync-runs"].forEach((k) =>
        qc.invalidateQueries({ queryKey: [k] }),
      );
      toast.success(
        `${t("sync_done")}: ${r.vendors} vendors · ${r.work_orders} work orders · ${r.bills} bills`,
      );
    },
    onError: (e) => toast.error(e?.body?.detail || t("sync_failed")),
  });

  const createUser = useMutation({
    mutationFn: (payload) => apiPost("/users", payload),
    onSuccess: (u) => {
      qc.invalidateQueries({ queryKey: ["users"] });
      toast.success(`${t("user_created")}: ${u.email}`);
      setUserOpen(false);
      setForm(EMPTY_USER);
    },
    onError: (e) => toast.error(e?.body?.detail || t("user_create_failed")),
  });

  const setOrderLive = useMutation({
    mutationFn: ({ id, live }) => apiPatch(`/work-orders/${id}/visibility`, { live }),
    onSuccess: (wo) => {
      qc.invalidateQueries({ queryKey: ["work-orders"] });
      toast.success(wo.live ? "Work order is live for the vendor" : "Work order taken off-air");
    },
    onError: (e) => toast.error(e.message || "Could not update visibility"),
  });

  const resetPw = useMutation({
    mutationFn: ({ id, password }) => apiPatch(`/users/${id}/password`, { password }),
    onSuccess: () => {
      toast.success(t("password_reset_done"));
      setPwDraft({});
      setPwUser(null);
    },
    onError: (e) => toast.error(e?.body?.detail || "Could not reset password"),
  });

  const removeUser = useMutation({
    mutationFn: (id) => apiDelete(`/users/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      toast.success(t("user_deleted"));
    },
    onError: (e) => toast.error(e?.body?.detail || "Could not delete user"),
  });

  const changeRole = useMutation({
    mutationFn: ({ id, role }) => apiPatch(`/users/${id}/role`, { role }),
    onSuccess: (u) => {
      qc.invalidateQueries({ queryKey: ["users"] });
      toast.success(`${u.email} is now ${ROLE_LABELS[u.role] ?? u.role}`);
    },
    onError: (e) => toast.error(e?.body?.detail || "Could not change role"),
  });

  function submitUser(e) {
    e.preventDefault();
    if (!form.email.trim()) {
      toast.error(t("required_fields"));
      return;
    }
    if (form.role === "vendor" && !form.vendor_code.trim()) {
      toast.error(t("vendor_code_required"));
      return;
    }
    if (form.role !== "vendor" && !form.password.trim()) {
      toast.error(t("password_required_admin"));
      return;
    }
    createUser.mutate({
      email: form.email.trim(),
      name: form.name.trim(),
      role: form.role,
      vendor_code: form.vendor_code.trim() || null,
      password: form.password.trim() || null,
    });
  }

  const linked = syncInfo.isError ? null : syncInfo.data;

  return (
    <AppLayout
      title={t("nav_admin")}
      subtitle={t("admin_subtitle")}
      action={
        isAdmin ? (
        <Button
          onClick={() => runSync.mutate()}
          disabled={runSync.isPending}
          data-testid="admin-sync-arun-button"
          className="bg-[#D97706] hover:bg-[#B45309] text-white gap-2 active:scale-[0.98] [transition:background-color_.18s_ease,transform_.1s_ease]"
        >
          <RefreshCw size={15} className={runSync.isPending ? "animate-spin" : ""} />
          {runSync.isPending ? t("syncing") : t("sync_arun")}
        </Button>
        ) : null
      }
    >
      {/* linked-records banner */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6">
        {[
          { key: "linked_vendors", label: t("nav_profile"), value: linked?.linked_vendors },
          { key: "linked_work_orders", label: t("nav_work_orders"), value: linked?.linked_work_orders },
          { key: "linked_bills", label: t("nav_bills"), value: linked?.linked_bills },
          { key: "portal_users", label: t("nav_users"), value: userRows.length },
        ].map((s) => (
          <Card key={s.key} className="p-4 bg-white border-slate-200 rounded-xl shadow-sm" data-testid={`admin-stat-${s.key}`}>
            <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500 font-semibold">{s.label}</p>
            <p className="text-2xl font-semibold text-slate-900 mt-1.5">{s.value ?? "—"}</p>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="users">
        <TabsList className="mb-6" data-testid="admin-tabs">
          <TabsTrigger value="users" data-testid="admin-tab-users">{t("nav_users")}</TabsTrigger>
          <TabsTrigger value="vendors" data-testid="admin-tab-vendors">{t("admin_vendors")}</TabsTrigger>
          <TabsTrigger value="orders" data-testid="admin-tab-orders">{t("nav_work_orders")}</TabsTrigger>
          <TabsTrigger value="bills" data-testid="admin-tab-bills">{t("nav_bills")}</TabsTrigger>
          <TabsTrigger value="sync" data-testid="admin-tab-sync">Sync Log</TabsTrigger>
        </TabsList>

        {/* ---------- USERS: the only records created in this portal ---------- */}
        <TabsContent value="users">
          <Card className="bg-white border-slate-200 rounded-xl shadow-sm p-0 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-slate-900">{t("nav_users")}</h2>
                <p className="text-xs text-slate-500 mt-0.5">{t("users_note")}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {isAdmin ? (
                <Dialog open={userOpen} onOpenChange={setUserOpen}>
                <DialogTrigger
                  render={
                    <Button data-testid="admin-add-user-open" className="bg-[#1D4ED8] hover:bg-[#1E40AF] text-white gap-2 h-9">
                      <UserPlus size={15} /> {t("create_user")}
                    </Button>
                  }
                />
                <DialogContent className="bg-white sm:max-w-[520px]">
                  <DialogHeader>
                    <DialogTitle>{t("create_user")}</DialogTitle>
                    <DialogDescription>{t("create_user_hint")}</DialogDescription>
                  </DialogHeader>
                  <form onSubmit={submitUser} className="space-y-4" data-testid="admin-user-form">
                    <div className="space-y-2">
                      <Label htmlFor="u-role">{t("role")}</Label>
                      <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                        <SelectTrigger id="u-role" data-testid="admin-user-role-select" className="w-full">
                          <SelectValue>{(v) => ROLE_LABELS[v] ?? v}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="vendor" data-testid="admin-user-role-vendor">Vendor</SelectItem>
                          <SelectItem value="staff" data-testid="admin-user-role-staff">Staff (view only)</SelectItem>
                          <SelectItem value="admin" data-testid="admin-user-role-admin">Administrator</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-[11px] text-slate-500">
                        Only an Administrator can change data in this portal. Staff can see everything but cannot edit.
                      </p>
                    </div>

                    {form.role === "vendor" && (
                      <div className="space-y-2">
                        <Label htmlFor="u-code">{t("vendor_code")}</Label>
                        <Select
                          value={form.vendor_code}
                          onValueChange={(v) => {
                            const ven = vendorRows.find((x) => x.code === v);
                            setForm({
                              ...form,
                              vendor_code: v,
                              email: form.email || ven?.email || "",
                              name: form.name || ven?.contact_person || "",
                            });
                          }}
                        >
                          <SelectTrigger id="u-code" data-testid="admin-user-vendor-select" className="w-full">
                            <SelectValue placeholder={t("select_vendor")}>
                              {(v) => v || t("select_vendor")}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {vendorRows.map((v) => (
                              <SelectItem key={v.id} value={v.code} data-testid={`admin-user-vendor-option-${v.code}`}>
                                {v.code} · {v.company_name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-slate-500">{t("vendor_code_hint")}</p>
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label htmlFor="u-email">{t("email")}</Label>
                      <Input
                        id="u-email"
                        value={form.email}
                        onChange={(e) => setForm({ ...form, email: e.target.value })}
                        data-testid="admin-user-email-input"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="u-name">{t("contact_person")}</Label>
                      <Input
                        id="u-name"
                        value={form.name}
                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                        data-testid="admin-user-name-input"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="u-pass">
                        {form.role === "admin" ? t("password") : `${t("password")} (${t("optional")})`}
                      </Label>
                      <Input
                        id="u-pass"
                        value={form.password}
                        onChange={(e) => setForm({ ...form, password: e.target.value })}
                        placeholder={form.role === "vendor" ? form.vendor_code || t("vendor_code") : ""}
                        data-testid="admin-user-password-input"
                      />
                    </div>
                    <DialogFooter>
                      <Button type="button" variant="outline" onClick={() => setUserOpen(false)}>{t("cancel")}</Button>
                      <Button
                        type="submit"
                        disabled={createUser.isPending}
                        data-testid="admin-user-submit"
                        className="bg-[#1D4ED8] hover:bg-[#1E40AF] text-white"
                      >
                        {t("submit")}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
                ) : null}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm table-fixed" data-testid="admin-users-table">
                <thead className="bg-slate-50 text-slate-500">
                  <tr className="text-left">
                    {[
                      ["email", "w-[26%]"],
                      ["contact_person", "w-[18%]"],
                      ["role", "w-[12%]"],
                      ["vendor_code", "w-[14%]"],
                      ["reset_password", "w-[20%]"],
                      ["actions", "w-[10%]"],
                    ].map(([h, w]) => (
                      <th key={h} className={`px-4 py-3 font-semibold text-xs uppercase tracking-wide ${w}`}>{t(h)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {userRows.length === 0 && (
                    <tr><td colSpan={6} className="px-5 py-14 text-center text-slate-400" data-testid="admin-users-empty">
                      {users.isLoading ? t("loading") : t("no_data")}
                    </td></tr>
                  )}
                  {userRows.map((u) => (
                    <tr key={u.id} className="border-t border-slate-100" data-testid={`admin-user-row-${u.email}`}>
                      <td className="px-4 py-3.5 text-slate-900 truncate" title={u.email}>{u.email}</td>
                      <td className="px-4 py-3.5 text-slate-700 truncate" title={u.name}>{u.name}</td>
                      <td className="px-4 py-3.5">
                        <Badge variant="outline" className={u.role === "admin"
                          ? "bg-blue-50 text-blue-800 border-blue-200"
                          : u.role === "staff"
                            ? "bg-amber-50 text-amber-800 border-amber-200"
                            : "bg-slate-100 text-slate-700 border-slate-300"}>
                          {ROLE_LABELS[u.role] ?? u.role}
                        </Badge>
                        {isAdmin && u.id !== me?.id ? (
                          <select
                            value={u.role}
                            onChange={(e) => changeRole.mutate({ id: u.id, role: e.target.value })}
                            data-testid={`admin-user-role-change-${u.email}`}
                            className="mt-1.5 block w-full text-[11px] border border-slate-200 rounded-md px-1.5 py-1
                              bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-[#1D4ED8]"
                          >
                            <option value="admin">Administrator</option>
                            <option value="staff">Staff (view only)</option>
                            {u.vendor_code ? <option value="vendor">Vendor</option> : null}
                          </select>
                        ) : null}
                      </td>
                      <td className="px-4 py-3.5 font-mono text-xs text-[#1D4ED8]">{u.vendor_code || "—"}</td>
                      <td className="px-4 py-3.5">
                        {isAdmin ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => { setPwUser(u); setPwDraft({}); }}
                          data-testid={`admin-update-password-${u.email}`}
                          className="h-8 gap-1.5 text-xs"
                        >
                          <KeyRound size={13} /> Update Password
                        </Button>
                        ) : <span className="text-xs text-slate-400">—</span>}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex gap-1.5">
                          {isAdmin ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => removeUser.mutate(u.id)}
                            data-testid={`admin-user-delete-${u.email}`}
                            className="h-8 text-red-700 border-red-200 hover:bg-red-50"
                          >
                            <Trash2 size={13} />
                          </Button>
                          ) : <span className="text-xs text-slate-400">—</span>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Update password dialog (replaces the inline new-password field) */}
            <Dialog open={!!pwUser} onOpenChange={(o) => { if (!o) setPwUser(null); }}>
              <DialogContent className="bg-white sm:max-w-[420px]">
                <DialogHeader>
                  <DialogTitle>Update Password</DialogTitle>
                  <DialogDescription>
                    Set a new portal password for {pwUser?.email}
                  </DialogDescription>
                </DialogHeader>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const p = (pwDraft.new ?? "").trim();
                    if (p.length < 6) {
                      toast.error("Password must be at least 6 characters");
                      return;
                    }
                    if (p !== (pwDraft.confirm ?? "").trim()) {
                      toast.error("Passwords do not match");
                      return;
                    }
                    resetPw.mutate({ id: pwUser.id, password: p });
                  }}
                  className="space-y-4"
                  data-testid="admin-update-password-form"
                >
                  <div className="space-y-2">
                    <Label htmlFor="pw-new">New Password</Label>
                    <Input
                      id="pw-new"
                      type="password"
                      value={pwDraft.new ?? ""}
                      onChange={(e) => setPwDraft({ ...pwDraft, new: e.target.value })}
                      data-testid="admin-pw-new-input"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pw-confirm">Confirm New Password</Label>
                    <Input
                      id="pw-confirm"
                      type="password"
                      value={pwDraft.confirm ?? ""}
                      onChange={(e) => setPwDraft({ ...pwDraft, confirm: e.target.value })}
                      data-testid="admin-pw-confirm-input"
                    />
                  </div>
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setPwUser(null)}>
                      {t("cancel")}
                    </Button>
                    <Button
                      type="submit"
                      disabled={resetPw.isPending}
                      data-testid="admin-pw-save-button"
                      className="bg-[#1D4ED8] hover:bg-[#1E40AF] text-white"
                    >
                      Update Password
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </Card>
        </TabsContent>

        <TabsContent value="sync">
          <Card className="bg-white border-slate-200 rounded-xl shadow-sm p-0 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200">
              <h2 className="text-base font-semibold text-slate-900">Sync Log</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Last 10 sync runs from the Arun workflow portal. An automatic sync runs every 15 minutes and on every page open.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="admin-sync-log-table">
                <thead className="bg-slate-50 text-slate-500">
                  <tr className="text-left">
                    {["Run At", "Vendors", "Work Orders", "Approved WOs", "Bills", "Payments", "Changes", "New Logins", "Skipped Bills", "Duplicate Codes"].map((h) => (
                      <th key={h} className="px-4 py-3 font-semibold text-xs uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {syncRows.length === 0 && (
                    <tr><td colSpan={9} className="px-5 py-14 text-center text-slate-400" data-testid="admin-sync-log-empty">
                      {syncRuns.isLoading ? t("loading") : t("no_data")}
                    </td></tr>
                  )}
                  {syncRows.map((r, i) => (
                    <tr key={i} className="border-t border-slate-100" data-testid={`admin-sync-run-${i}`}>
                      <td className="px-4 py-3.5 text-slate-700 whitespace-nowrap">
                        {r.synced_at ? new Date(r.synced_at).toLocaleString("en-IN") : "—"}
                      </td>
                      {r.error ? (
                        <td colSpan={9} className="px-4 py-3.5 text-red-700">Failed: {r.error}</td>
                      ) : (
                        <>
                          <td className="px-4 py-3.5 text-slate-700">{r.vendors ?? 0}</td>
                          <td className="px-4 py-3.5 text-slate-700">{r.work_orders ?? 0}</td>
                          <td className="px-4 py-3.5 text-slate-700">{r.purchase_work_orders ?? 0}</td>
                          <td className="px-4 py-3.5 text-slate-700">{r.bills ?? 0}</td>
                          <td className="px-4 py-3.5 text-slate-700">{r.payments ?? 0}</td>
                          <td className="px-4 py-3.5 text-slate-900 font-medium">{r.changes ?? 0}</td>
                          <td className="px-4 py-3.5 text-slate-600 text-xs">
                            {(r.new_logins || []).map((l) => l.vendor_code).join(", ") || "—"}
                          </td>
                          <td className="px-4 py-3.5 text-amber-700 text-xs">
                            {(r.skipped_bills || []).join(", ") || "—"}
                          </td>
                          <td className="px-4 py-3.5 text-red-700 text-xs" data-testid={`admin-sync-run-duplicates-${i}`}>
                            {(r.duplicate_vendors || [])
                              .map((d) => `${d.vendor_code} (${d.firm_name})`)
                              .join(", ") || "—"}
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        {/* ---------- read-only mirrors of the workflow portal (plus WO copy upload) ---------- */}
        <TabsContent value="vendors">
          <Card className="bg-white border-slate-200 rounded-xl shadow-sm p-0 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200">
              <h2 className="text-base font-semibold text-slate-900">{t("admin_vendors")}</h2>
              <p className="text-xs text-slate-500 mt-0.5">{t("read_only_note")}</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="admin-vendors-table">
                <thead className="bg-slate-50 text-slate-500">
                  <tr className="text-left">
                    {["vendor_code", "company_name", "contact_person", "email", "gstin", "phone"].map((h) => (
                      <th key={h} className="px-5 py-3 font-semibold text-xs uppercase tracking-wide whitespace-nowrap">{t(h)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {vendorRows.length === 0 && (
                    <tr><td colSpan={6} className="px-5 py-14 text-center text-slate-400" data-testid="admin-vendors-empty">{t("no_data")}</td></tr>
                  )}
                  {vendorRows.map((v) => (
                    <tr key={v.id} className="border-t border-slate-100" data-testid={`admin-vendor-row-${v.code}`}>
                      <td className="px-5 py-3.5 font-mono text-xs text-[#1D4ED8] font-semibold">{v.code}</td>
                      <td className="px-5 py-3.5 text-slate-900">
                        <span className="flex items-center gap-2">
                          <Building2 size={14} className="text-slate-400 shrink-0" /> {v.company_name}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-slate-700">{v.contact_person}</td>
                      <td className="px-5 py-3.5 text-slate-500">{v.email}</td>
                      <td className="px-5 py-3.5 font-mono text-xs text-slate-600">{v.gstin}</td>
                      <td className="px-5 py-3.5 text-slate-600 whitespace-nowrap">{v.phone}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="orders">
          {isAdmin ? <WorkOrderCopyUpload /> : null}
          <Card className="bg-white border-slate-200 rounded-xl shadow-sm p-0 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200">
              <h2 className="text-base font-semibold text-slate-900">{t("nav_work_orders")}</h2>
              <p className="text-xs text-slate-500 mt-0.5">{t("read_only_note")}</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="admin-orders-table">
                <thead className="bg-slate-50 text-slate-500">
                  <tr className="text-left">
                    {["po_number", "vendor", "title", "value", "status"].map((h) => (
                      <th key={h} className="px-5 py-3 font-semibold text-xs uppercase tracking-wide whitespace-nowrap">{t(h)}</th>
                    ))}
                    <th className="px-5 py-3 font-semibold text-xs uppercase tracking-wide whitespace-nowrap">
                      Vendor Visibility
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {orderRows.length === 0 && (
                    <tr><td colSpan={6} className="px-5 py-14 text-center text-slate-400" data-testid="admin-orders-empty">{t("no_data")}</td></tr>
                  )}
                  {orderRows.map((o) => (
                    <tr key={o.id} className="border-t border-slate-100" data-testid={`admin-order-row-${o.po_number}`}>
                      <td className="px-5 py-3.5 font-mono text-xs text-[#1D4ED8] font-semibold">{o.po_number}</td>
                      <td className="px-5 py-3.5 text-slate-700 max-w-[200px] truncate">{o.vendor_name}</td>
                      <td className="px-5 py-3.5 text-slate-900 max-w-[280px] truncate">{o.title}</td>
                      <td className="px-5 py-3.5 whitespace-nowrap font-medium">{formatINR(o.value)}</td>
                      <td className="px-5 py-3.5"><StatusBadge status={o.status} /></td>
                      <td className="px-5 py-3.5">
                        {isAdmin ? (
                        <Button
                          size="sm"
                          variant="outline"
                          data-testid={`admin-order-live-toggle-${o.po_number}`}
                          onClick={() => setOrderLive.mutate({ id: o.id, live: o.live === false })}
                          className={`h-8 gap-1.5 text-xs ${
                            o.live === false
                              ? "text-slate-600 border-slate-200"
                              : "text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                          }`}
                        >
                          {o.live === false ? <EyeOff size={13} /> : <Eye size={13} />}
                          {o.live === false ? "Off-Air" : "Live"}
                        </Button>
                        ) : <span className="text-xs text-slate-400">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="bills">
          <Card className="bg-white border-slate-200 rounded-xl shadow-sm p-0 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <h2 className="text-base font-semibold text-slate-900">{t("nav_bills")}</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Bill details with their Payments Register voucher (GPV / PV no, payment date, UTR) in one view.
                </p>
              </div>
              <span className="text-xs font-semibold text-slate-500" data-testid="admin-register-count">
                {filteredBills.length} of {billRows.length} bills · {formatINR(filteredTotal)}
              </span>
            </div>

            <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/60 flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <Label className="text-[11px] uppercase tracking-wide text-slate-500">Status</Label>
                <select
                  value={billStatus}
                  onChange={(e) => setBillStatus(e.target.value)}
                  data-testid="admin-bill-status-filter"
                  className="h-8 text-xs border border-slate-200 rounded-md px-2 bg-white text-slate-700
                    focus:outline-none focus:ring-1 focus:ring-[#1D4ED8]"
                >
                  <option value="all">All statuses</option>
                  <option value="pending">Pending</option>
                  <option value="under_review">Under Review</option>
                  <option value="paid">Paid</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] uppercase tracking-wide text-slate-500">Bill date from</Label>
                <Input
                  type="date"
                  value={billFrom}
                  onChange={(e) => setBillFrom(e.target.value)}
                  data-testid="admin-bill-date-from"
                  className="h-8 w-[150px] text-xs bg-white"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] uppercase tracking-wide text-slate-500">Bill date to</Label>
                <Input
                  type="date"
                  value={billTo}
                  onChange={(e) => setBillTo(e.target.value)}
                  data-testid="admin-bill-date-to"
                  className="h-8 w-[150px] text-xs bg-white"
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                data-testid="admin-bill-filter-reset"
                onClick={() => { setBillStatus("all"); setBillFrom(""); setBillTo(""); }}
                className="h-8 text-xs"
              >
                Reset
              </Button>
              <Button
                size="sm"
                data-testid="admin-bill-export-button"
                onClick={() => {
                  const p = new URLSearchParams();
                  if (billStatus !== "all") p.set("status", billStatus);
                  if (billFrom) p.set("date_from", billFrom);
                  if (billTo) p.set("date_to", billTo);
                  const qs = p.toString();
                  downloadFile(`/api/bills/export.xlsx${qs ? `?${qs}` : ""}`, "arun-bills.xlsx");
                }}
                className="h-8 ml-auto gap-1.5 text-xs bg-[#1D4ED8] hover:bg-[#1E40AF] text-white
                  active:scale-[0.98] [transition:background-color_.18s_ease,transform_.1s_ease]"
              >
                <Download size={13} /> Export to Excel
              </Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm table-fixed min-w-[1080px]" data-testid="admin-bills-table">
                <colgroup>
                  <col className="w-[11%]" />
                  <col className="w-[12%]" />
                  <col className="w-[11%]" />
                  <col className="w-[9%]" />
                  <col className="w-[11%]" />
                  <col className="w-[9%]" />
                  <col className="w-[12%]" />
                  <col className="w-[16%]" />
                  <col className="w-[9%]" />
                </colgroup>
                <thead className="bg-slate-50 text-slate-500">
                  <tr className="text-left">
                    {["Bill Ref No", "Vendor", "Bill No", "Amount (₹)", "GPV / PV No", "Payment Date", "UTR No", "Current Status", "Due Date"].map((h) => (
                      <th
                        key={h}
                        className={`px-3 py-3 font-semibold text-[11px] uppercase tracking-wide ${h === "Amount (₹)" ? "text-right" : ""}`}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredBills.length === 0 && (
                    <tr><td colSpan={9} className="px-5 py-14 text-center text-slate-400" data-testid="admin-bills-empty">{t("no_data")}</td></tr>
                  )}
                  {filteredBills.map((b) => {
                    const pv = registerRows.find((p) => p.bill_ref_no === b.invoice_no) || {};
                    return (
                      <tr key={b.id} className="border-t border-slate-100 align-middle hover:bg-slate-50/70 [transition:background-color_.18s_ease]" data-testid={`admin-bill-row-${b.invoice_no}`}>
                        <td className="px-3 py-3 font-mono text-[11px] font-semibold text-slate-900 truncate" title={b.invoice_no}>{b.invoice_no}</td>
                        <td className="px-3 py-3 text-slate-700 truncate" title={b.vendor_name}>{b.vendor_name}</td>
                        <td className="px-3 py-3 font-mono text-[11px] text-slate-500 truncate" title={b.bill_no}>{b.bill_no || "—"}</td>
                        <td className="px-3 py-3 text-right whitespace-nowrap" data-testid={`admin-bill-amount-${b.invoice_no}`}>
                          {/* Amount as shown in the ERP Payments Register voucher; falls back to the bill total until a voucher exists */}
                          <span className="font-semibold text-slate-900">
                            {formatINR(pv.amount != null ? pv.amount : b.total_amount)}
                          </span>
                          {pv.amount != null && Math.round((pv.amount - (b.total_amount || 0)) * 100) !== 0 ? (
                            <span className="block text-[10px] text-slate-400" title="Invoice total on the bill">
                              {`bill ${formatINR(b.total_amount)}`}
                            </span>
                          ) : null}
                        </td>
                        <td className="px-3 py-3 font-mono text-[11px] text-[#1D4ED8] truncate" title={pv.pv_no || b.pv_no}>{pv.pv_no || b.pv_no || "—"}</td>
                        <td className="px-3 py-3 text-slate-600 text-xs whitespace-nowrap">{pv.payment_date || b.payment_date || "—"}</td>
                        <td className="px-3 py-3 font-mono text-[11px] text-slate-600 truncate" title={pv.utr_no || b.utr}>{pv.utr_no || b.utr || "—"}</td>
                        <td className="px-3 py-3 overflow-hidden">
                          <div className="max-w-full truncate" title={b.status_label || b.status}>
                            <StatusBadge status={b.status} label={b.status_label} />
                          </div>
                        </td>
                        <td className="px-3 py-3 text-slate-600 text-xs whitespace-nowrap">{b.due_date || "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </AppLayout>
  );
}

export default function Admin() {
  return (
    <RequireAuth adminOnly>
      <AdminInner />
    </RequireAuth>
  );
}
