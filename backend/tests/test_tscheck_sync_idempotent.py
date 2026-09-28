"""Criterion: admin can re-sync from the workflow portal and it is idempotent; vendor forbidden."""


def test_vendor_cannot_trigger_sync(vendor_client):
    r = vendor_client.post("/sync/arun")
    assert r.status_code == 403, r.text


def test_sync_status_reports_linked_counts(admin_client):
    r = admin_client.get("/sync/status")
    assert r.status_code == 200, r.text
    s = r.json()
    assert s["linked_vendors"] == 1, s
    assert s["linked_work_orders"] == 1, s
    assert s["linked_bills"] == 1, s


def test_resync_does_not_duplicate(admin_client):
    r = admin_client.post("/sync/arun")
    assert r.status_code == 200, r.text

    status = admin_client.get("/sync/status").json()
    assert status["linked_vendors"] == 1, status
    assert status["linked_work_orders"] == 1, status
    assert status["linked_bills"] == 1, status

    vendors = admin_client.get("/vendors").json()
    orders = admin_client.get("/work-orders").json()
    bills = admin_client.get("/bills").json()
    assert len(vendors) == 1, vendors
    assert len(orders) == 1, orders
    assert len(bills) == 1, bills
