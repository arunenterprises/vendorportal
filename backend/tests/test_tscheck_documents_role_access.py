"""Criterion: vendor can upload documents but cannot download/delete; admin can
download and sees vendor identity columns. Uses a fixture doc created by the
test itself - never touches the pre-seeded GST/Cheque documents."""

import base64

TINY_PDF_B64 = base64.b64encode(b"%PDF-1.4 tscheck-doc-role fixture").decode()


def _upload_fixture_doc(vendor_client):
    payload = {
        "name": "tscheck-doc-role-fixture",
        "doc_type": "Photo",
        "content_type": "application/pdf",
        "data_base64": f"data:application/pdf;base64,{TINY_PDF_B64}",
    }
    r = vendor_client.post("/documents", json=payload)
    assert r.status_code == 200, r.text
    return r.json()


def test_vendor_can_upload_but_not_download_or_delete(vendor_client):
    doc = _upload_fixture_doc(vendor_client)

    r_dl = vendor_client.get(f"/documents/{doc['id']}/download")
    assert r_dl.status_code == 403, r_dl.text

    r_del = vendor_client.delete(f"/documents/{doc['id']}")
    assert r_del.status_code == 403, r_del.text


def test_admin_can_download_and_sees_vendor_identity(vendor_client, admin_client):
    doc = _upload_fixture_doc(vendor_client)

    listing = admin_client.get("/documents").json()
    row = next(d for d in listing if d["id"] == doc["id"])
    assert row["vendor_code"] == "AE0001JV2627", row
    assert row["vendor_name"], row

    r_dl = admin_client.get(f"/documents/{doc['id']}/download")
    assert r_dl.status_code == 200, r_dl.text
    assert len(r_dl.content) > 0

    # cleanup: only the admin may delete, and it is its own fixture row
    admin_client.delete(f"/documents/{doc['id']}")


def test_upload_rejects_disallowed_doc_type(vendor_client):
    payload = {
        "name": "tscheck-doc-role-bad-type",
        "doc_type": "Passport",
        "content_type": "application/pdf",
        "data_base64": f"data:application/pdf;base64,{TINY_PDF_B64}",
    }
    r = vendor_client.post("/documents", json=payload)
    assert r.status_code == 400, r.text
