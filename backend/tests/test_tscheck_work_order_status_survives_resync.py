"""Criterion: a sync does not undo an admin's status override and keeps the
work order copy.

Expected: after the admin sets P00020 to 'completed' and POST /sync/arun runs,
the work order still has status 'completed', status_overridden True, and
has_po_file True. P00020 is restored to 'active' afterwards (seed baseline).
"""


def _get_p00020(client):
    rows = client.get("/work-orders").json()
    return next(o for o in rows if o["po_number"] == "P00020")


def test_status_override_survives_resync(admin_client):
    wo = _get_p00020(admin_client)
    wo_id = wo["id"]
    try:
        r = admin_client.patch(f"/work-orders/{wo_id}/status", json={"status": "completed"})
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "completed", r.json()

        sync = admin_client.post("/sync/arun")
        assert sync.status_code == 200, sync.text

        fresh = _get_p00020(admin_client)
        assert fresh["status"] == "completed", fresh
        assert fresh["status_overridden"] is True, fresh
        assert fresh["has_po_file"] is True, fresh
    finally:
        admin_client.patch(f"/work-orders/{wo_id}/status", json={"status": "active"})
