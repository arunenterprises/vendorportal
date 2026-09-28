"""Criterion: admin logs in with email + password and lands on the admin role."""


def test_admin_login_succeeds(client):
    r = client.post(
        "/auth/login",
        json={"identifier": "arunenterprises2023@gmail.com", "password": "Arun2023@12"},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["role"] == "admin"
    assert body["email"] == "arunenterprises2023@gmail.com"


def test_admin_wrong_password_rejected(client):
    r = client.post(
        "/auth/login",
        json={"identifier": "arunenterprises2023@gmail.com", "password": "wrongpass"},
    )
    assert r.status_code == 401, r.text
