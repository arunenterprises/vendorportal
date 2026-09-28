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

const MAX_BYTES = 100 * 1024; // 100 KB

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
      toast.error(`File is ${prettySize(f.size)} — maximum allowed size is 100 KB`);
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
      toast.error("Maximum allowed file size is 100 KB");
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
          : "Upload your Sale Invoice and statutory documents. Maximum file size 100 KB. Downloads are available to the admin only."
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
                  Maximum 100 KB · PDF, JPG or PNG
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
          <div className="px-5 py-4 border-b border-slate-200">
            <h2 className="text-base font-semibold text-slate-900">Documents</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm table-fixed" data-testid="documents-table">
              <thead className="bg-slate-50 text-slate-500">
                <tr className="text-left">
                  {isAdmin && (
                    <th className="px-5 py-3 font-semibold text-xs uppercase tracking-wide w-[22%]">Vendor</th>
                  )}
                  <th className={`px-5 py-3 font-semibold text-xs uppercase tracking-wide ${isAdmin ? "w-[28%]" : "w-[34%]"}`}>
                    Document Name
                  </th>
                  <th className={`px-5 py-3 font-semibold text-xs uppercase tracking-wide ${isAdmin ? "w-[18%]" : "w-[26%]"}`}>Type</th>
                  <th className="px-5 py-3 font-semibold text-xs uppercase tracking-wide w-[10%]">Size</th>
                  <th className="px-5 py-3 font-semibold text-xs uppercase tracking-wide w-[12%]">Uploaded</th>
                  <th className="px-5 py-3 font-semibold text-xs uppercase tracking-wide w-[14%]">Actions</th>
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
                    className="border-t border-slate-100 hover:bg-slate-50/70 [transition:background-color_.18s_ease]"
                    data-testid={`document-row-${d.id}`}
                  >
                    {isAdmin && (
                      <td className="px-5 py-3 truncate" data-testid={`document-vendor-${d.id}`}>
                        <span className="block text-slate-900 truncate" title={d.vendor_name}>
                          {d.vendor_name || "—"}
                        </span>
                        <span className="block font-mono text-[11px] text-[#1D4ED8]">{d.vendor_code}</span>
                      </td>
                    )}
                    <td className="px-5 py-3 text-slate-900 truncate" title={d.name}>{d.name}</td>
                    <td className="px-5 py-3 text-slate-600 truncate">{d.doc_type}</td>
                    <td className="px-5 py-3 text-slate-500 whitespace-nowrap">{prettySize(d.size)}</td>
                    <td className="px-5 py-3 text-slate-500 whitespace-nowrap">
                      {new Date(d.uploaded_at).toLocaleDateString("en-IN")}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex gap-2">
                        {isAdmin && (
                          <Button
                            variant="outline"
                            size="sm"
                            data-testid={`document-download-${d.id}`}
                            onClick={() => downloadFile(`/api/documents/${d.id}/download`, d.name)}
                            className="h-8 gap-1.5"
                          >
                            <Download size={14} /> Download
                          </Button>
                        )}
                        {isVendor && (
                          <Button
                            variant="outline"
                            size="sm"
                            data-testid={`document-delete-${d.id}`}
                            onClick={() => remove.mutate(d.id)}
                            className="h-8 text-red-700 border-red-200 hover:bg-red-50"
                          >
                            <Trash2 size={14} />
                          </Button>
                        )}
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
