from conftest import *


def mk(client, **o):
    body = {"name": "qa-host", "ip": "10.9.9.9", "role": "workstation", "is_bastion": False, "description": "qa"}
    body.update(o)
    return client.post("/hosts", json=body)


def test_list_shape(client):
    hs = client.get("/hosts").json()
    assert hs
    for h in hs:
        check_host(h)
    assert sum(1 for h in hs if h["is_bastion"]) == 1


def test_crud(client):
    r = mk(client)
    assert r.status_code == 201, r.text
    h = r.json()
    check_host(h)
    hid = h["id"]
    r = client.put(f"/hosts/{hid}", json=dict(name="qa-host2", ip="10.9.9.10", role="web", is_bastion=False, description="x"))
    assert r.status_code == 200, r.text
    assert r.json()["name"] == "qa-host2" and r.json()["role"] == "web"
    r = client.delete(f"/hosts/{hid}")
    assert r.status_code == 200 and r.json() == {"ok": True}
    assert not any(x["id"] == hid for x in client.get("/hosts").json())
    assert client.delete(f"/hosts/{hid}").status_code == 404


def test_validation(client):
    assert mk(client, ip="999.9.9.9").status_code == 422
    assert mk(client, role="wizard").status_code == 422
    assert client.put("/hosts/999999", json=dict(name="a", ip="10.1.1.1", role="web", is_bastion=False, description="")).status_code == 404


def test_set_and_clear_bastion(client):
    r = mk(client)
    hid = r.json()["id"]
    try:
        r = client.post(f"/hosts/{hid}/bastion")
        assert r.status_code == 200, r.text
        h = r.json()
        check_host(h)
        assert h["is_bastion"] is True and h["role"] == "bastion"
        hs = client.get("/hosts").json()
        assert [x["id"] for x in hs if x["is_bastion"]] == [hid]
        assert client.get("/stats/summary").json()["bastion"]["id"] == hid
        r = client.delete("/hosts/bastion")
        assert r.status_code == 200 and r.json() == {"ok": True}
        assert not any(x["is_bastion"] for x in client.get("/hosts").json())
        assert client.get("/stats/summary").json()["bastion"] is None
    finally:
        client.delete(f"/hosts/{hid}")
        for h in client.get("/hosts").json():
            if h["ip"] == BASTION:
                client.post(f"/hosts/{h['id']}/bastion")


def test_bastion_404(client):
    assert client.post("/hosts/999999/bastion").status_code == 404
