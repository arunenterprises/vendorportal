import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiGet, apiPost } from "@/lib/api";

const MAX_BYTES = 500 * 1024;

/**
 * Admin-only: pick a vendor, pick one of its work orders from the list and
 * upload the original work order copy (max 500 KB). There is no manual
 * work-order entry — only work orders that actually exist can be selected.
 */
export default function WorkOrderCopyUpload() {
  const qc = useQueryClient();
  const fileRef = useRef(null);
  const [vendorId, setVendorId] = useState("");
  const [woId, setWoId] = useState("");
  const [manual, setManual] = useState(false);
  const [manualNo, setManualNo] = useState("");
  const [file, setFile] = useState(null);

  const orders = useQuery({ queryKey: ["work-orders"], queryFn: () => apiGet("/work-orders"), retry: false });
  const rows = orders.isError ? [] : orders.data ?? [];

  const vendors = useMemo(() => {
    const m = new Map();
    for (const o of rows) {
      const cur = m.get(o.vendor_id) || { id: o.vendor_id, name: o.vendor_name || o.vendor_code, count: 0 };
      cur.count += 1;
      m.set(o.vendor_id, cur);
    }
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);

  const vendorOrders = useMemo(() => rows.filter((o) => o.vendor_id === vendorId), [rows, vendorId]);
  const typed = manualNo.trim().toLowerCase();
  const selected = manual
    ? rows.find((o) => String(o.po_number).trim().toLowerCase() === typed)
    : vendorOrders.find((o) => o.id === woId);
  const target = manual ? manualNo.trim() : woId;

  const upload = useMutation({
    mutationFn: async () => {
      if (!selected) {
        throw new Error(
          manual
            ? `No work order found with number ${manualNo.trim()}`
            : "Select a work order first",
        );
      }
      const data = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result).split(",", 2)[1]);
        r.onerror = reject;
        r.readAsDataURL(file);
      });
      return apiPost(`/work-orders/${selected.id}/po-file`, {
        name: file.name,
        content_type: file.type || "application/pdf",
        data_base64: data,
      });
    },
    onSuccess: (wo) => {
      qc.invalidateQueries({ queryKey: ["work-orders"] });
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      toast.success(`Work order copy uploaded for ${wo.po_number}`);
    },
    onError: (e) => toast.error(e?.body?.detail || e.message || "Upload failed"),
  });

  function pickFile(e) {
    const f = e.target.files?.[0];
    if (!f) return setFile(null);
    if (f.size > MAX_BYTES) {
      toast.error("File must be 500 KB or smaller");
      e.target.value = "";
      return setFile(null);
    }
    setFile(f);
  }

  return (
    <Card className="p-5 bg-white border-slate-200 rounded-xl shadow-sm mb-5" data-testid="wo-copy-upload-card">
      <h2 className="text-base font-semibold text-slate-900">Upload Original Work Order</h2>
      <p className="text-xs text-slate-500 mt-0.5 mb-4">
        Select a vendor, pick the work order shown in the list, then upload the signed work order copy. Maximum file size 500 KB.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr_1fr_auto] gap-4 items-end">
        <div className="space-y-1.5">
          <Label>Vendor</Label>
          <Select
            value={vendorId}
            onValueChange={(v) => {
              setVendorId(v);
              setWoId("");
            }}
          >
            <SelectTrigger data-testid="wo-upload-vendor-select" className="bg-white">
              <SelectValue placeholder="Select vendor">
                {vendors.find((v) => v.id === vendorId)?.name ?? "Select vendor"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {vendors.map((v) => (
                <SelectItem key={v.id} value={v.id}>{`${v.name} (${v.count})`}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>Work Order</Label>
          {manual ? (
            <Input
              value={manualNo}
              onChange={(e) => setManualNo(e.target.value)}
              placeholder="Type work order no"
              data-testid="wo-upload-manual-input"
              className="bg-white"
            />
          ) : (
          <Select value={woId} onValueChange={setWoId} disabled={!vendorId}>
            <SelectTrigger data-testid="wo-upload-order-select" className="bg-white">
              <SelectValue placeholder="Select work order">
                {selected?.po_number ?? "Select work order"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {vendorOrders.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {`${o.po_number}${o.has_po_file ? " · copy attached" : ""}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          )}
          <label className="flex items-center gap-1.5 text-[11px] text-slate-500 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={manual}
              onChange={(e) => { setManual(e.target.checked); setWoId(""); setManualNo(""); }}
              data-testid="wo-upload-manual-toggle"
              className="h-3 w-3 accent-[#1D4ED8]"
            />
            Enter work order no manually
          </label>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="wo-copy-file">Work Order Copy (max 500 KB)</Label>
          <input
            id="wo-copy-file"
            ref={fileRef}
            type="file"
            accept="application/pdf,image/*"
            onChange={pickFile}
            data-testid="wo-upload-file-input"
            className="block w-full text-sm text-slate-600 border border-slate-200 rounded-md px-3 py-2
              disabled:opacity-60 disabled:cursor-not-allowed
              file:mr-3 file:border-0 file:rounded file:bg-slate-100 file:px-2 file:py-1 file:text-xs
              hover:border-slate-300 [transition:border-color_.18s_ease]"
          />
        </div>

        <Button
          onClick={() => upload.mutate()}
          disabled={!target || !file || upload.isPending}
          data-testid="wo-upload-button"
          className="bg-[#1D4ED8] hover:bg-[#1E40AF] text-white gap-2 active:scale-[0.98]
            [transition:background-color_.18s_ease,transform_.1s_ease]"
        >
          <Upload size={15} /> {upload.isPending ? "Uploading…" : "Upload"}
        </Button>
      </div>

      {selected ? (
        <p className="text-xs text-slate-500 mt-3" data-testid="wo-upload-current-file">
          {`${selected.po_number} · current copy: ${selected.po_file_name || "not uploaded"}`}
        </p>
      ) : manual && manualNo.trim() ? (
        <p className="text-xs text-amber-700 mt-3" data-testid="wo-upload-current-file">
          {`No work order found with number ${manualNo.trim()} — check the number and try again`}
        </p>
      ) : null}
    </Card>
  );
}
