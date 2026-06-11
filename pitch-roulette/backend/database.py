import os
from functools import lru_cache

import certifi
from supabase import Client, create_client

from config import get_settings

# Windows Python often lacks system CA certs; certifi fixes Supabase HTTPS calls.
os.environ.setdefault("SSL_CERT_FILE", certifi.where())
os.environ.setdefault("REQUESTS_CA_BUNDLE", certifi.where())


@lru_cache
def get_supabase() -> Client:
    settings = get_settings()
    if not settings.SUPABASE_URL or not settings.SUPABASE_SERVICE_KEY:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set")
    if settings.SUPABASE_SERVICE_KEY == "your_supabase_service_key":
        raise RuntimeError("SUPABASE_SERVICE_KEY is still the placeholder — paste your service_role key in backend/.env")
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)
