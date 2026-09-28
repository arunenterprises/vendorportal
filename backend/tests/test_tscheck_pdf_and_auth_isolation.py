"""Criterion: PDF downloads work; unauthenticated access is rejected (401)."""


def test_bill_pdf_download(vendor_client):
    r = vendor_client.get("/bills")
    bill = r.json()[0]
    assert bill["invoice_no"] == "BILL00042627"
    r2 = vendor_client.get(f"/bills/{bill['id']}/pdf")
    assert r2.status_code == 200, r2.text
    assert r2.headers.get("content-type", "").startswith("application/pdf"), r2.headers
    assert r2.content[:4] == b"%PDF", r2.content[:20]


def test_work_order_pdf_download(vendor_client):
    r = vendor_client.get("/work-orders")
    wo = r.json()[0]
    assert wo["po_number"] == "P00020"
    r2 = vendor_client.get(f"/work-orders/{wo['id']}/pdf")
    assert r2.status_code == 200, r2.text
    assert r2.headers.get("content-type", "").startswith("application/pdf"), r2.headers
    assert r2.content[:4] == b"%PDF", r2.content[:20]


def test_unauthenticated_bills_rejected(client):
    r = client.get("/bills")
    assert r.status_code == 401, r.text
