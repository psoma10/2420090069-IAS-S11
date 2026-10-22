"""Pydantic v2 request models (responses are plain dicts shaped per docs/API_CONTRACT.md)."""
from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field, field_validator, model_validator

from . import firewall as fw

Protocol = Literal["TCP", "UDP", "ICMP", "ANY"]
Action = Literal["allow", "deny"]
Severity = Literal["low", "medium", "high", "critical"]
HostRole = Literal["bastion", "web", "database", "ssh", "workstation", "external"]
TrafficType = Literal[
    "http", "https", "ssh_login", "telnet", "port_scan", "ping", "dns", "data_transfer", "syn_flood"
]
Port = Optional[int]


def _upper(v: Any) -> Any:
    return v.strip().upper() if isinstance(v, str) else v


class FirewallRuleIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    action: Action
    protocol: Protocol = "ANY"
    src_ip: str = "ANY"
    dst_ip: str = "ANY"
    src_port: str = "ANY"
    dst_port: str = "ANY"
    priority: int = Field(100, ge=0, le=65535)
    enabled: bool = True
    description: str = Field("", max_length=500)

    _proto = field_validator("protocol", mode="before")(_upper)

    @field_validator("src_ip", "dst_ip", mode="before")
    @classmethod
    def _ip(cls, v: Any) -> str:
        return fw.validate_ip_spec(v)

    @field_validator("src_port", "dst_port", mode="before")
    @classmethod
    def _port(cls, v: Any) -> str:
        return fw.validate_port_spec(v)

    @field_validator("name")
    @classmethod
    def _name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("name must not be blank")
        return v


class PolicyBody(BaseModel):
    default_action: Action
    bastion_mode: bool = False


class FirewallTestBody(BaseModel):
    src_ip: str
    dst_ip: str
    src_port: Optional[int] = Field(None, ge=1, le=65535)
    dst_port: Optional[int] = Field(None, ge=0, le=65535)  # 0 / omitted = no port (ICMP)
    protocol: Protocol = "TCP"

    _proto = field_validator("protocol", mode="before")(_upper)

    @field_validator("dst_port")
    @classmethod
    def _zero_port(cls, v: Optional[int]) -> Optional[int]:
        return None if v == 0 else v

    @field_validator("src_ip", "dst_ip")
    @classmethod
    def _ip(cls, v: str) -> str:
        return fw.validate_ip(v)


class HostIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    ip: str
    role: HostRole = "workstation"
    is_bastion: bool = False
    description: str = Field("", max_length=500)

    @field_validator("ip")
    @classmethod
    def _ip(cls, v: str) -> str:
        return fw.validate_ip(v)

    @model_validator(mode="after")
    def _bastion(self) -> "HostIn":
        if self.is_bastion or self.role == "bastion":
            self.is_bastion, self.role = True, "bastion"
        return self


class ResetBody(BaseModel):
    keep_rules: bool = True


class TrafficSend(BaseModel):
    type: TrafficType
    src_ip: str
    dst_ip: str
    dst_port: Optional[int] = Field(None, ge=1, le=65535)
    protocol: Optional[Protocol] = None
    count: int = Field(1, ge=1, le=500)
    success: Optional[bool] = None
    bytes: Optional[int] = Field(None, ge=0, le=10_000_000_000)

    _proto = field_validator("protocol", mode="before")(_upper)

    @field_validator("src_ip", "dst_ip")
    @classmethod
    def _ip(cls, v: str) -> str:
        return fw.validate_ip(v)


class IdsRuleUpdate(BaseModel):
    enabled: bool
    threshold: Optional[int] = Field(None, ge=1, le=1_000_000)
    window_seconds: Optional[int] = Field(None, ge=1, le=3600)
    severity: Optional[Severity] = None


class AnomalyConfigBody(BaseModel):
    sigma: float = Field(3.0, ge=1, le=6)
    bucket_seconds: int = Field(5, ge=1, le=60)
    min_samples: int = Field(10, ge=2, le=100)


class SettingsBody(BaseModel):
    """Both fields optional on PUT: omitted fields keep their current value."""
    packet_retention: Optional[int] = Field(None, ge=100, le=100_000)
    alert_retention: Optional[int] = Field(None, ge=50, le=50_000)


class BaselineBody(BaseModel):
    minutes: int = Field(5, ge=1, le=60)
