"""In-memory Supabase client for API integration tests."""
from __future__ import annotations

import copy
import uuid
from datetime import datetime, timezone
from typing import Any


def _new_id() -> str:
    return str(uuid.uuid4())


class _Response:
    def __init__(self, data: list[dict] | dict | None):
        if isinstance(data, dict):
            self.data = [data]
        elif data is None:
            self.data = []
        else:
            self.data = data


class _Query:
    def __init__(self, store: dict[str, list[dict]], table: str, op: str, payload: Any = None):
        self._store = store
        self._table = table
        self._op = op
        self._payload = payload
        self._filters: list[tuple[str, str, Any]] = []
        self._order: tuple[str, bool] | None = None
        self._limit: int | None = None
        self._lt: tuple[str, Any] | None = None
        self._single = False

    def select(self, *_cols, **_kw) -> _Query:
        return self

    def eq(self, col: str, val: Any) -> _Query:
        self._filters.append(("eq", col, val))
        return self

    def in_(self, col: str, vals: list[Any]) -> _Query:
        self._filters.append(("in", col, vals))
        return self

    def gte(self, col: str, val: Any) -> _Query:
        self._filters.append(("gte", col, val))
        return self

    def lt(self, col: str, val: Any) -> _Query:
        self._lt = (col, val)
        return self

    def order(self, col: str, desc: bool = False) -> _Query:
        self._order = (col, desc)
        return self

    def limit(self, n: int) -> _Query:
        self._limit = n
        return self

    def insert(self, row: dict | list[dict]) -> _Query:
        return _Query(self._store, self._table, "insert", row)

    def update(self, row: dict) -> _Query:
        return _Query(self._store, self._table, "update", row)

    def delete(self) -> _Query:
        return _Query(self._store, self._table, "delete", None)

    def execute(self) -> _Response:
        rows = self._store.setdefault(self._table, [])

        if self._op == "insert":
            items = self._payload if isinstance(self._payload, list) else [self._payload]
            out = []
            for item in items:
                row = copy.deepcopy(item)
                if "id" not in row:
                    row["id"] = _new_id()
                if "created_at" not in row and self._table in (
                    "rooms", "flash_bets", "room_messages", "pc_transactions",
                    "sabotages", "draft_picks", "analytics_events",
                ):
                    row["created_at"] = datetime.now(timezone.utc).isoformat()
                if "purchased_at" not in row and self._table == "sabotages":
                    row["purchased_at"] = datetime.now(timezone.utc).isoformat()
                rows.append(row)
                out.append(row)
            return _Response(out)

        matched = [r for r in rows if self._matches(r)]

        if self._op == "update":
            out = []
            for r in matched:
                r.update(copy.deepcopy(self._payload))
                out.append(r)
            return _Response(out)

        if self._op == "delete":
            for r in matched:
                rows.remove(r)
            return _Response([])

        result = list(matched)
        if self._lt:
            col, val = self._lt
            result = [r for r in result if r.get(col) is not None and r.get(col) < val]
        if self._order:
            col, desc = self._order
            result.sort(key=lambda r: r.get(col) or "", reverse=desc)
        if self._limit is not None:
            result = result[: self._limit]
        return _Response(result)

    def _matches(self, row: dict) -> bool:
        for kind, col, val in self._filters:
            if kind == "eq" and row.get(col) != val:
                return False
            if kind == "in" and row.get(col) not in val:
                return False
            if kind == "gte":
                rv = row.get(col)
                if rv is None or rv < val:
                    return False
        return True


class FakeSupabase:
    def __init__(self):
        self.tables: dict[str, list[dict]] = {}

    def table(self, name: str) -> _Query:
        return _Query(self.tables, name, "select")

    def seed(self, table: str, rows: list[dict]) -> None:
        self.tables[table] = copy.deepcopy(rows)


class FakeAuth:
    def __init__(self, user_id: str = "test-user-id"):
        self._user_id = user_id

    class _User:
        def __init__(self, uid: str):
            self.id = uid

    class _Result:
        def __init__(self, user):
            self.user = user

    def get_user(self, _token: str):
        return self._Result(self._User(self._user_id))

    def admin(self):
        return self

    def create_user(self, _payload: dict):
        class _Created:
            class _U:
                id = "bot-user-id"
            user = _U()
        return _Created()
