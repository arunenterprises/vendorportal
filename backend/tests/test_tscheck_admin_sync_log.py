"""Criterion: Admin Sync Log lists recent runs; a vendor may not see it."""


def test_admin_sees_sync_runs_with_counts(admin_client):
    r = admin_client.get("/sync/runs")
    assert r.status_code == 200, r.text
    runs = r.json()
    assert len(runs) >= 1, runs
    run = runs[0]
    assert run.get("synced_at")
    assert "vendors" in run and "work_orders" in run and "bills" in run


def test_vendor_cannot_list_sync_runs(vendor_client):
    r = vendor_client.get("/sync/runs")
    assert r.status_code == 403, r.text
