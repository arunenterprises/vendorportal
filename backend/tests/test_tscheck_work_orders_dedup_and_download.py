"""Criterion: Work Orders list has one row per PO number, with a downloadable
original PO file for rows that have one, and a 403/empty response otherwise."""


def test_vendor_work_orders_one_row_per_po_number(vendor_client):
    r = vendor_client.get("/work-orders")
    assert r.status_code == 200, r.text
    rows = r.json()
    po_numbers = [o["po_number"] for o in rows]
    assert len(po_numbers) == len(set(po_numbers)), f"duplicate PO numbers: {po_numbers}"
    assert "P00020" in po_numbers, po_numbers


def test_work_order_with_uploaded_file_downloads_pdf(vendor_client):
    rows = vendor_client.get("/work-orders").json()
    wo = next(o for o in rows if o["po_number"] == "P00020")
    assert wo["has_po_file"] is True, wo

    r = vendor_client.get(f"/work-orders/{wo['id']}/po-file")
    assert r.status_code == 200, r.text
    assert "pdf" in r.headers.get("content-type", "").lower()
    assert len(r.content) > 0


def test_work_order_without_uploaded_file_reports_no_file(vendor_client, admin_client):
    rows = admin_client.get("/work-orders").json()
    wo = next((o for o in rows if not o.get("has_po_file")), None)
    assert wo is not None, "expected at least one work order without an uploaded PO file"

    r = admin_client.get(f"/work-orders/{wo['id']}/po-file")
    assert r.status_code == 404, r.text
    assert "no purchase order file" in r.json()["detail"].lower()
