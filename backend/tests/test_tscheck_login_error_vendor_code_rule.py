"""Criterion: BUG FIX - login failure message names the vendor-code rule.

Wrong password for the vendor code must return 401 with a detail mentioning
both 'vendor code' and the BOTH-id-and-password guidance. Correct password
must then succeed with 200.
"""
import httpx

BASE_URL = "http://localhost:8001/api"


def test_wrong_password_error_names_vendor_code_rule():
    # Backend 401 detail mentions the vendor-code rule; the frontend's full
    # "vendors: use your vendor code as BOTH the ID and the password" copy is
    # a static i18n toast string (verified by the browser check
    # login-error-mentions-vendor-code-rule), not derived from this detail.
    with httpx.Client(base_url=BASE_URL) as client:
        resp = client.post(
            "/auth/login",
            json={"identifier": "AE0001JV2627", "password": "WrongPassword123"},
        )
        assert resp.status_code == 401, resp.text
        detail = resp.json().get("detail", "")
        assert "vendor code" in detail.lower(), detail
        assert "password" in detail.lower(), detail


def test_correct_password_then_logs_in_successfully():
    with httpx.Client(base_url=BASE_URL) as client:
        resp = client.post(
            "/auth/login",
            json={"identifier": "AE0001JV2627", "password": "AE0001JV2627"},
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body.get("role") == "vendor", body
