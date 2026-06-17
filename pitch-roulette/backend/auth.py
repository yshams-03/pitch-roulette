from typing import Annotated

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from database import get_supabase

security = HTTPBearer(auto_error=False)


async def get_current_user_id(
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(security)],
) -> str:
    if not creds or not creds.credentials:
        raise HTTPException(status_code=401, detail={"error": "unauthorized"})
    db = get_supabase()
    try:
        result = db.auth.get_user(creds.credentials)
        if not result or not result.user:
            raise HTTPException(status_code=401, detail={"error": "invalid_token"})
        return str(result.user.id)
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail={"error": "invalid_token"})


async def get_optional_user_id(
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(security)],
) -> str | None:
    if not creds or not creds.credentials:
        return None
    try:
        return await get_current_user_id(creds)
    except HTTPException:
        return None
