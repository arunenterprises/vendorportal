"""Criterion: admin can re-sync from the workflow portal and it is idempotent; vendor forbidden."""


def test_vendor_cannot_trigger_sync(vendor_client):
    r = vendor_client.post("/sync/arun")
    assert r.status_code == 403, r.text


def test_sync_status_reports_linked_counts(admin_client):
    r = admin_client.get("/sync/status")
    assert r.status_code == 200, r.text
    s = r.json()
    # Seed facts: 12 vendors, 3 work orders, 3 bills synced from the workflow portal.
    assert s["linked_vendors"] == 12, s
    assert s["linked_work_orders"] == 3, s
    assert s["linked_bills"] == 3, s


def test_resync_does_not_duplicate(admin_client):
    before = admin_client.get("/sync/status").json()

    r = admin_client.post("/sync/arun")
    assert r.status_code == 200, r.text

    status = admin_client.get("/sync/status").json()
    # Re-syncing must not create duplicate rows - counts stay exactly the same.
    assert status["linked_vendors"] == before["linked_vendors"], status
    assert status["linked_work_orders"] == before["linked_work_orders"], status
    assert status["linked_bills"] == before["linked_bills"], status

    vendors = admin_client.get("/vendors").json()
    orders = admin_client.get("/work-orders").json()
    bills = admin_client.get("/bills").json()
    assert len(vendors) == status["linked_vendors"], vendors
    assert len(orders) == status["linked_work_orders"], orders
    assert len(bills) == status["linked_bills"], bills
