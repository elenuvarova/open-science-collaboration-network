"""Shared rate limiter.

Defined in its own module (not main.py) so routers can import `limiter` without
a circular import back through main. Keyed on the client IP — uvicorn is started
with --proxy-headers so request.client.host is the real client behind Traefik,
not the reverse proxy.
"""
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
