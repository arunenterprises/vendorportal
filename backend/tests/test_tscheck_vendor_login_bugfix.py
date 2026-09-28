"""Criterion: vendor logs in with vendor code as BOTH login id and password.

Codes match case-insensitively; a wrong password is rejected with 401.
"""


def test_vendor_code_login_succeeds(client):
    r = client.post("/auth/login", json={"identifier": "AE0001JV2627", "password": "AE0001JV2627"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["role"] == "vendor"
    assert body["vendor_id"]


def test_vendor_code_login_case_insensitive(client):
    r = client.post("/auth/login", json={"identifier": "ae0001jv2627", "password": "AE0001JV2627"})
    assert r.status_code == 200, r.text
    assert r.json()["role"] == "vendor"


def test_vendor_wrong_password_rejected(client):
    r = client.post("/auth/login", json={"identifier": "AE0001JV2627", "password": "WRONGPASS"})
    assert r.status_code == 401, r.text


def test_vendor_dashboard_summary_has_real_values(vendor_client):
    r = vendor_client.get("/summary")
    assert r.status_code == 200, r.text
    s = r.json()
    assert s["total_billed"] > 0, s
