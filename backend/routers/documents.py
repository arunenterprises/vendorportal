import base64
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response

from lib.auth import current_user
from lib.db import db
from models.schemas import DocumentCreate, DocumentOut

router = APIRouter(prefix="/documents", tags=["documents"])

MAX_BYTES = 100 * 1024  # 100 KB cap per upload

# Vendors may upload only these document types.
ALLOWED_DOC_TYPES = [
    "Sale Invoice",
    "Aadhaar Card",
    "PAN Card",
    "Cancelled Cheque",
    "GST Certificate",
    "Udyam Certificate",
    "Photo",
]


@router.get("", response_model=list[DocumentOut])
async def list_documents(user=Depends(current_user)):
    q = {} if user.get("role") == "admin" else {"vendor_id": user.get("vendor_id")}
    docs = await db.documents.find(q, {"_id": 0, "data_base64": 0}).sort("uploaded_at", -1).to_list(500)
    vendors = await db.vendors.find({}, {"_id": 0, "id": 1, "code": 1, "company_name": 1}).to_list(1000)
    vmap = {v["id"]: v for v in vendors}
    out = []
    for d in docs:
        ts = d.get("uploaded_at")
        if isinstance(ts, datetime) and ts.tzinfo is None:
            d["uploaded_at"] = ts.replace(tzinfo=timezone.utc)
        ven = vmap.get(d.get("vendor_id"), {})
        d["vendor_code"] = ven.get("code", "")
        d["vendor_name"] = ven.get("company_name", "")
        out.append(DocumentOut(**d))
    return out


@router.post("", response_model=DocumentOut)
async def upload_document(payload: DocumentCreate, user=Depends(current_user)):
    if not user.get("vendor_id"):
        raise HTTPException(status_code=400, detail="Only vendor accounts can upload documents")
    if payload.doc_type not in ALLOWED_DOC_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Document type must be one of: {', '.join(ALLOWED_DOC_TYPES)}",
        )
    raw = payload.data_base64.split(",", 1)[-1]
    try:
        blob = base64.b64decode(raw, validate=False)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid file data")
    if not blob:
        raise HTTPException(status_code=400, detail="Empty file")
    if len(blob) > MAX_BYTES:
        raise HTTPException(status_code=400, detail="File larger than 100 KB")

    doc = {
        "id": str(uuid.uuid4()),
        "vendor_id": user["vendor_id"],
        "name": payload.name,
        "doc_type": payload.doc_type,
        "content_type": payload.content_type,
        "size": len(blob),
        "uploaded_at": datetime.now(timezone.utc),
        "data_base64": raw,
    }
    await db.documents.insert_one(dict(doc))
    doc.pop("data_base64")
    return DocumentOut(**doc)


@router.get("/{doc_id}/download")
async def download_document(doc_id: str, user=Depends(current_user)):
    doc = await db.documents.find_one({"id": doc_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    # downloads are restricted to the admin only
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Only the admin can download documents")
    blob = base64.b64decode(doc["data_base64"])
    return Response(
        content=blob, media_type=doc.get("content_type", "application/octet-stream"),
        headers={"Content-Disposition": f'attachment; filename="{doc["name"]}"'},
    )


@router.delete("/{doc_id}")
async def delete_document(doc_id: str, user=Depends(current_user)):
    doc = await db.documents.find_one({"id": doc_id}, {"_id": 0, "data_base64": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    # vendors may upload but never delete; only the admin can remove a document
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Only the admin can delete documents")
    await db.documents.delete_one({"id": doc_id})
    return {"ok": True}
