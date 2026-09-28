"""Criterion: vendor/work-order/bill data is READ ONLY -- no create/edit routes."""


def test_post_vendors_not_allowed(admin_client):
    r = admin_client.post("/vendors", json={"code": "X", "company_name": "X"})
    assert r.status_code == 405, r.text


def test_post_work_orders_not_allowed(admin_client):
    r = admin_client.post("/work-orders", json={"po_number": "X"})
    assert r.status_code == 405, r.text


def test_post_bills_not_allowed(admin_client):
    r = admin_client.post("/bills", json={"invoice_no": "X"})
    assert r.status_code == 405, r.text


def test_patch_bill_status_route_removed(admin_client):
    r = admin_client.get("/bills")
    bill_id = r.json()[0]["id"]
    r2 = admin_client.patch(f"/bills/{bill_id}/status", json={"status": "paid"})
    assert r2.status_code == 404, r2.text
