import pytest
from fastapi.testclient import TestClient

from app.clock import ManualClock
from app.context import AppContext
from app.main import create_app


@pytest.fixture()
def clock():
    return ManualClock(1_700_000_000.0)


@pytest.fixture()
def ctx(clock):
    """Seeded context (hosts, rules, baseline) on an in-memory DB with a controllable clock."""
    return AppContext(":memory:", clock, seed=7, auto_seed=True)


@pytest.fixture()
def bare(clock):
    """Context with no seed data."""
    return AppContext(":memory:", clock, seed=7, auto_seed=False)


@pytest.fixture()
def client(clock):
    app = create_app(":memory:", clock, seed=7)
    with TestClient(app) as c:
        c.app_ctx = app.state.ctx
        yield c


def pkt(src="203.0.113.50", dst="10.0.1.10", dport=80, proto="TCP", type_="http", nbytes=500, success=True,
        sport=40000):
    return dict(src_ip=src, dst_ip=dst, src_port=sport, dst_port=dport, protocol=proto, type=type_,
                bytes=nbytes, success=success)
