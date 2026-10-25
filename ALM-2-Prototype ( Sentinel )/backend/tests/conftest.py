import pytest
from fastapi.testclient import TestClient

from app.clock import ManualClock
from app.context import AppContext
from app.main import create_app


@pytest.fixture(autouse=True)
def _log_dir_env(tmp_path, monkeypatch):
    """Safety net: nothing a test builds may write audit/security logs into the project's logs/ folder."""
    monkeypatch.setenv("SENTINEL_LOG_DIR", str(tmp_path / "env-logs"))


@pytest.fixture()
def log_dir(tmp_path):
    return tmp_path / "logs"


@pytest.fixture()
def clock():
    return ManualClock(1_700_000_000.0)


@pytest.fixture()
def ctx(clock, log_dir):
    """Seeded context (hosts, rules, baseline) on an in-memory DB with a controllable clock."""
    c = AppContext(":memory:", clock, seed=7, auto_seed=True, log_dir=log_dir)
    yield c
    c.audit.close()


@pytest.fixture()
def bare(clock, log_dir):
    """Context with no seed data."""
    c = AppContext(":memory:", clock, seed=7, auto_seed=False, log_dir=log_dir)
    yield c
    c.audit.close()


@pytest.fixture()
def client(clock, log_dir):
    app = create_app(":memory:", clock, seed=7, log_dir=log_dir)
    with TestClient(app) as c:
        c.app_ctx = app.state.ctx
        yield c


def pkt(src="203.0.113.50", dst="10.0.1.10", dport=80, proto="TCP", type_="http", nbytes=500, success=True,
        sport=40000):
    return dict(src_ip=src, dst_ip=dst, src_port=sport, dst_port=dport, protocol=proto, type=type_,
                bytes=nbytes, success=success)
