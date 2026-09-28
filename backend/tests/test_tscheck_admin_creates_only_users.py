"""Criterion: this portal creates ONLY logins.

- Creating a vendor login for an already-synced vendor code is rejected (login exists).
- Creating an admin-role user with explicit email+password succeeds; can be reset & deleted.
- Creating a vendor user with a never-synced vendor code errors, mentioning sync.
"""
import uuid


def test_create_vendor_user_for_existing_vendor_rejected(admin_client):
    r = admin_client.post(
        "/users",
        json={"email": "tscheck-dup@example.com", "name": "Dup", "role": "vendor",
              "vendor_code": "AE0001JV2627", "password": None},
    )
    assert r.status_code == 400, r.text
    assert "already exists" in r.json()["detail"].lower()


def test_create_vendor_user_unsynced_code_mentions_sync(admin_client):
    r = admin_client.post(
        "/users",
        json={"email": "tscheck-unsynced@example.com", "name": "Unsynced", "role": "vendor",
              "vendor_code": "ZZ9999NOTREAL", "password": None},
    )
    assert r.status_code == 404, r.text
    assert "sync" in r.json()["detail"].lower()


def test_create_reset_delete_admin_user(admin_client):
    suffix = uuid.uuid4().hex[:8]
    email = f"tscheck-admin-{suffix}@example.com"
    r = admin_client.post(
        "/users",
        json={"email": email, "name": "TSCheck Admin", "role": "admin",
              "vendor_code": None, "password": "TscheckPass123!"},
    )
    assert r.status_code == 200, r.text
    user = r.json()
    assert user["email"] == email
    assert user["role"] == "admin"

    # appears in the users list
    listed = admin_client.get("/users")
    assert listed.status_code == 200
    assert any(u["id"] == user["id"] for u in listed.json())

    # reset password
    r2 = admin_client.patch(f"/users/{user['id']}/password", json={"password": "NewTscheckPass456!"})
    assert r2.status_code == 200, r2.text

    # new login works with reset password
    import httpx
    with httpx.Client(base_url=admin_client.base_url, timeout=30.0) as c:
        r3 = c.post("/auth/login", json={"identifier": email, "password": "NewTscheckPass456!"})
        assert r3.status_code == 200, r3.text

    # delete
    r4 = admin_client.delete(f"/users/{user['id']}")
    assert r4.status_code == 200, r4.text
    listed2 = admin_client.get("/users")
    assert not any(u["id"] == user["id"] for u in listed2.json())


def test_vendor_cannot_create_user(vendor_client):
    r = vendor_client.post(
        "/users",
        json={"email": "tscheck-forbidden@example.com", "name": "X", "role": "admin",
              "vendor_code": None, "password": "whatever123"},
    )
    assert r.status_code == 403, r.text
