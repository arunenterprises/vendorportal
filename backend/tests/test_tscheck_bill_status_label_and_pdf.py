"""Bug-fix regression: a synced bill must show the workflow portal's EXACT
status wording (status_label), and the bill PDF must print that same wording
as a clean single-page A4 with no workflow 'Remarks:' chain line.

Covers acceptance-matrix criteria 1 and 2 of the retest briefing.
"""

import io

from pypdf import PdfReader

BILL_NO = "BILL00042627"


def test_bill_status_label_matches_upstream_wording(vendor_client):
    r = vendor_client.get("/bills")
    assert r.status_code == 200, r.text
    bills = r.json()
    bill = next((b for b in bills if b["invoice_no"] == BILL_NO), None)
    assert bill is not None, f"{BILL_NO} not found in {bills}"

    assert bill["status"] == "under_review", bill
    assert bill["approval_status"] == "Approved For Payment", bill
    assert bill["final_release_status"] == "Added to Due List (Unpaid)", bill
    assert bill["status_label"] == "Added to Due List (Unpaid)", bill
    # The old generic bucket label must NOT be what status_label carries.
    assert bill["status_label"] != "Under Finance Review", bill


def test_bill_pdf_is_single_page_a4_with_real_status_no_remarks(vendor_client):
    r = vendor_client.get("/bills")
    bill = next(b for b in r.json() if b["invoice_no"] == BILL_NO)
    bill_id = bill["id"]

    resp = vendor_client.get(f"/bills/{bill_id}/pdf")
    assert resp.status_code == 200, resp.text
    assert resp.headers["content-type"] == "application/pdf", resp.headers
    assert resp.content.startswith(b"%PDF"), resp.content[:20]

    reader = PdfReader(io.BytesIO(resp.content))
    assert len(reader.pages) == 1, f"expected 1 page, got {len(reader.pages)}"

    page = reader.pages[0]
    width = float(page.mediabox.width)
    height = float(page.mediabox.height)
    # A4 = 595 x 842 pts, allow tiny rounding tolerance.
    assert abs(width - 595) <= 2, width
    assert abs(height - 842) <= 2, height

    text = page.extract_text()
    assert "Added to Due List (Unpaid)" in text, text
    assert "Remarks:" not in text, text


def test_wrong_password_rejected_401(client):
    r = client.post(
        "/auth/login",
        json={"identifier": "AE0001JV2627", "password": "WrongPassword123"},
    )
    assert r.status_code == 401, r.text
