import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, FileUp, Trash2 } from "lucide-react";
import AppLayout from "@/components/AppLayout";
import RequireAuth from "@/components/RequireAuth";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { apiDelete, apiGet, apiPost } from "@/lib/api";
import { downloadFile } from "@/lib/download";
import { useAuth } from "@/lib/useAuth";

// Exactly the documents a vendor is allowed to submit.
const DOC_TYPES = [
  "Sale Invoice",
  "Aadhaar Card",
  "PAN Card",
  "Cancelled Cheque",
  "GST Certificate",
  "Udyam Certificate",
  "Photo",
];

const MAX_BYTES = 350 * 1024; // 350 KB

function readAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function prettySize(bytes) {
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

function DocumentsInner() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const fileRef = useRef(null);
  const [name, setName] = useState("");
  const [docType, setDocType] = useState(DOC_TYPES[0]);
  const [file, setFile] = useState(null);

  const docs = useQuery({ queryKey: ["documents"], queryFn: () => apiGet("/documents"), retry: false });

  const upload = useMutation({
    mutationFn: (payload) => apiPost("/documents", payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["documents"] });
      toast.success("Document uploaded");
      setName("");
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
    },
    onError: (e) => toast.error(e?.body?.detail || "Upload failed"),
  });

  const remove = useMutation({
    mutationFn: (id) => apiDelete(`/documents/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["documents"] });
      toast.success("Document deleted");
    },
    onError: () => toast.error("Could not delete document"),
  });

  function onPickFile(e) {
    const f = e.target.files?.[0] ?? null;
    if (f && f.size > MAX_BYTES) {
      toast.error(`File is ${prettySize(f.size)} — maximum allowed size is 350 KB`);
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    setFile(f);
  }

  async function onUpload(e) {
    e.preventDefault();
    if (!file || !name.trim()) {
      toast.error("Please fill all required fields");
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("Maximum allowed file size is 350 KB");
      return;
    }
    const dataUrl = await readAsBase64(file);
    upload.mutate({
      name: name.trim(),
      doc_type: docType,
      content_type: file.type || "application/octet-stream",
      data_base64: dataUrl,
    });
  }

  const rows = docs.isError ? [] : docs.data ?? [];
  const isVendor = user?.role === "vendor";
  const isAdmin = user?.role === "admin";

  return (
    <AppLayout
      title="Compliance & Documents"
      subtitle={
        isAdmin
          ? "All documents submitted by vendors. Only the admin can download them."
          : "Upload your Sale Invoice and statutory documents. Maximum file size 350 KB. Downloads are available to the admin only."
      }
    >
      <div className={isVendor ? "grid grid-cols-1 xl:grid-cols-[340px_1fr] gap-6" : "grid grid-cols-1 gap-6"}>
        {isVendor && (
          <Card className="p-6 bg-white border-slate-200 rounded-xl shadow-sm h-fit">
            <h2 className="text-base font-semibold text-slate-900 mb-5">Upload Document</h2>
            <form onSubmit={onUpload} className="space-y-4" data-testid="document-upload-form">
              <div className="space-y-2">
                <Label htmlFor="docname">Document Name</Label>
                <Input
                  id="docname"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder=""
                  data-testid="document-name-input"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="doctype">Document Type</Label>
                <Select value={docType} onValueChange={setDocType}>
                  <SelectTrigger id="doctype" data-testid="document-type-select" className="w-full">
                    <SelectValue>{(v) => v}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {DOC_TYPES.map((d) => (
                      <SelectItem key={d} value={d} data-testid={`document-type-option-${d}`}>
                        {d}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="docfile">Choose File</Label>
                <Input
                  id="docfile"
                  type="file"
                  ref={fileRef}
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={onPickFile}
                  data-testid="document-file-input"
                  className="cursor-pointer"
                />
                <p className="text-xs text-slate-400" data-testid="document-size-hint">
                  Maximum 350 KB · PDF, JPG or PNG
                </p>
              </div>
              <Button
                type="submit"
                disabled={upload.isPending}
                data-testid="document-upload-button"
                className="bg-[#1D4ED8] hover:bg-[#1E40AF] text-white gap-2 active:scale-[0.98] [transition:background-color_.18s_ease,transform_.1s_ease]"
              >
                <FileUp size={15} /> Upload Document
              </Button>
            </form>
          </Card>
        )}

        <Card className="bg-white border-slate-200 rounded-xl shadow-sm p-0 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Documents</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {isAdmin
                  ? "Compliance documents submitted by vendors — download or remove."
                  : "Your uploaded compliance documents. Maximum 350 KB per file."}
              </p>
            </div>
            <span className="text-xs font-semibold text-slate-500" data-testid="documents-count">
              {rows.length} {rows.length === 1 ? "document" : "documents"}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table
              className={`w-full text-sm table-fixed ${isAdmin ? "min-w-[920px]" : "min-w-[640px]"}`}
              data-testid="documents-table"
            >
              <colgroup>
                {isAdmin && <col className="w-[20%]" />}
                <col className={isAdmin ? "w-[24%]" : "w-[34%]"} />
                <col className={isAdmin ? "w-[16%]" : "w-[26%]"} />
                <col className="w-[9%]" />
                <col className="w-[12%]" />
                <col className={isAdmin ? "w-[19%]" : "w-[19%]"} />
              </colgroup>
              <thead className="bg-slate-50 text-slate-500">
                <tr className="text-left">
                  {isAdmin && (
                    <th className="px-3 py-3 font-semibold text-[11px] uppercase tracking-wide">Vendor</th>
                  )}
                  <th className="px-3 py-3 font-semibold text-[11px] uppercase tracking-wide">Document Name</th>
                  <th className="px-3 py-3 font-semibold text-[11px] uppercase tracking-wide">Type</th>
                  <th className="px-3 py-3 font-semibold text-[11px] uppercase tracking-wide text-right">Size</th>
                  <th className="px-3 py-3 font-semibold text-[11px] uppercase tracking-wide">Uploaded</th>
                  <th className="px-3 py-3 font-semibold text-[11px] uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={isAdmin ? 6 : 5} className="px-5 py-14 text-center text-slate-400" data-testid="documents-empty">
                      {docs.isLoading ? "Loading…" : docs.isError ? "Could not load documents" : "No documents yet"}
                    </td>
                  </tr>
                )}
                {rows.map((d) => (
                  <tr
                    key={d.id}
                    className="border-t border-slate-100 align-middle hover:bg-slate-50/70 [transition:background-color_.18s_ease]"
                    data-testid={`document-row-${d.id}`}
                  >
                    {isAdmin && (
                      <td className="px-3 py-3 truncate" data-testid={`document-vendor-${d.id}`}>
                        <span className="block text-slate-900 truncate" title={d.vendor_name}>
                          {d.vendor_name || "—"}
                        </span>
                        <span className="block font-mono text-[11px] text-[#1D4ED8] truncate">{d.vendor_code}</span>
                      </td>
                    )}
                    <td className="px-3 py-3 text-slate-900 truncate" title={d.name}>{d.name}</td>
                    <td className="px-3 py-3 text-slate-600 truncate" title={d.doc_type}>{d.doc_type}</td>
                    <td className="px-3 py-3 text-slate-500 whitespace-nowrap text-right text-xs">{prettySize(d.size)}</td>
                    <td className="px-3 py-3 text-slate-500 whitespace-nowrap text-xs">
                      {new Date(d.uploaded_at).toLocaleDateString("en-IN")}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex gap-1.5">
                        {isAdmin && (
                          <Button
                            variant="outline"
                            size="sm"
                            data-testid={`document-download-${d.id}`}
                            onClick={() => downloadFile(`/api/documents/${d.id}/download`, d.name)}
                            className="h-8 gap-1.5 text-xs px-2"
                          >
                            <Download size={13} /> Download
                          </Button>
                        )}
                        {isAdmin && (
                          <Button
                            variant="outline"
                            size="sm"
                            data-testid={`document-delete-${d.id}`}
                            onClick={() => remove.mutate(d.id)}
                            className="h-8 px-2 text-red-700 border-red-200 hover:bg-red-50"
                          >
                            <Trash2 size={13} />
                          </Button>
                        )}
                        {!isAdmin && <span className="text-xs text-slate-400">—</span>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </AppLayout>
  );
}

export default function Documents() {
  return (
    <RequireAuth>
      <DocumentsInner />
    </RequireAuth>
  );
}
