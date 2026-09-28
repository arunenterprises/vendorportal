"""Criterion: real data fetched from the Arun workflow portal is visible and correctly mapped."""


def test_work_order_p00020_mapped(vendor_client):
    r = vendor_client.get("/work-orders")
    assert r.status_code == 200, r.text
    rows = r.json()
    assert len(rows) == 1, rows
    wo = rows[0]
    assert wo["po_number"] == "P00020"
    assert wo["title"] == "SUPPLY OF JSPL MS ANGLE 40x40x6"
    assert round(wo["value"], 2) == 138036.40
    assert len(wo["milestones"]) == 3
    assert len(wo["items"]) == 3


def test_bill_bill00042627_mapped(vendor_client):
    r = vendor_client.get("/bills")
    assert r.status_code == 200, r.text
    rows = r.json()
    assert len(rows) == 1, rows
    b = rows[0]
    assert b["invoice_no"] == "BILL00042627"
    assert b["ref_no"] == "AE00042627"
    assert round(b["taxable_amount"], 2) == 116980.00
    assert round(b["gst_amount"], 2) == 21056.40
    assert round(b["total_amount"], 2) == 138036.40
    assert b["status"] == "under_review"


def test_vendor_profile_mapped(vendor_client):
    r = vendor_client.get("/vendors/me")
    assert r.status_code == 200, r.text
    v = r.json()
    assert v["company_name"] == "Annapurna Steels"
    assert v["code"] == "AE0001JV2627"
    assert v["gstin"] == "09BUHPS9363N1ZJ"
    assert v["pan"] == "BUHPS9363N"
    assert v["ifsc"] == "HDFC0000298"
