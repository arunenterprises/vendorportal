"""Criterion: PATCH /api/work-orders/{id}/status authorisation + validation.

Expected: 200 for admin, 403 for vendor, 400 for invalid status value, 404 for
unknown work order id. P00020 is always restored to 'active' afterwards.
"""

import pytest


def _get_p00020_id(client):
    rows = client.get("/work-orders").json()
    wo = next(o for o in rows if o["po_number"] == "P00020")
    return wo["id"]


def test_admin_can_set_status_200(admin_client):
    wo_id = _get_p00020_id(admin_client)
    try:
        r = admin_client.patch(f"/work-orders/{wo_id}/status", json={"status": "on_hold"})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["status"] == "on_hold", body
    finally:
        # restore seed state
        admin_client.patch(f"/work-orders/{wo_id}/status", json={"status": "active"})


def test_vendor_cannot_set_status_403(vendor_client, admin_client):
    wo_id = _get_p00020_id(admin_client)
    r = vendor_client.patch(f"/work-orders/{wo_id}/status", json={"status": "completed"})
    assert r.status_code == 403, r.text
    # confirm no state change happened
    fresh = admin_client.get("/work-orders").json()
    wo = next(o for o in fresh if o["po_number"] == "P00020")
    assert wo["status"] != "completed", wo


def test_admin_invalid_status_value_400(admin_client):
    wo_id = _get_p00020_id(admin_client)
    r = admin_client.patch(f"/work-orders/{wo_id}/status", json={"status": "bogus_status"})
    assert r.status_code == 400, r.text


def test_admin_unknown_work_order_404(admin_client):
    r = admin_client.patch("/work-orders/does-not-exist-id/status", json={"status": "active"})
    assert r.status_code == 404, r.text
