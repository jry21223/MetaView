from __future__ import annotations

import json

from starlette.types import ASGIApp, Message, Receive, Scope, Send

_BODY_METHODS = {"POST", "PUT", "PATCH"}


class BodySizeLimitMiddleware:
    """ASGI middleware enforcing a hard cap on request body length.

    Implementation note: this used to extend BaseHTTPMiddleware and rely on
    ``Content-Length``. That left an obvious bypass — a client setting
    ``Transfer-Encoding: chunked`` omits Content-Length entirely and slipped
    past the cap (issue #60). Reimplement at the ASGI layer so chunked
    uploads are accounted byte-by-byte and rejected as soon as they exceed
    ``max_bytes``.

    Trade-off: when there's no Content-Length we buffer the body chunks (up
    to the cap) so the inner application still sees a normal ``receive``
    stream. At a 5 MB default that's a bounded allocation, far better than a
    silent bypass.
    """

    def __init__(self, app: ASGIApp, max_bytes: int) -> None:
        self._app = app
        self._max_bytes = max_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self._app(scope, receive, send)
            return

        method = scope.get("method", "")
        if method not in _BODY_METHODS:
            await self._app(scope, receive, send)
            return

        headers = {
            k.decode("latin-1").lower(): v.decode("latin-1")
            for k, v in scope.get("headers", [])
        }

        # Fast path: client advertised Content-Length → reject before we even
        # touch the body. Catches the well-behaved case in O(1).
        cl_header = headers.get("content-length")
        if cl_header is not None:
            try:
                content_length = int(cl_header)
            except ValueError:
                await self._send_error(send, 400, "invalid Content-Length header")
                return
            if content_length > self._max_bytes:
                await self._send_error(
                    send, 413, f"request body exceeds {self._max_bytes} bytes"
                )
                return
            await self._app(scope, receive, send)
            return

        # No Content-Length: either chunked or empty. Buffer chunks ourselves
        # while watching the size; abort with 413 the moment the running total
        # crosses the cap. Issue #60.
        buffered: list[bytes] = []
        bytes_read = 0
        more_body = True
        while more_body:
            message = await receive()
            if message["type"] != "http.request":
                # Non-body event (http.disconnect etc.) — let it flow through.
                buffered.append(b"")
                break
            chunk: bytes = message.get("body", b"") or b""
            bytes_read += len(chunk)
            if bytes_read > self._max_bytes:
                await self._send_error(
                    send, 413, f"request body exceeds {self._max_bytes} bytes"
                )
                return
            buffered.append(chunk)
            more_body = bool(message.get("more_body", False))

        # Replay the buffered body to the downstream app exactly once. After
        # that, mimic an empty stream so framework code doesn't hang waiting
        # for additional messages.
        replay = iter([(chunk, idx == len(buffered) - 1) for idx, chunk in enumerate(buffered)])

        async def replay_receive() -> Message:
            try:
                chunk, last = next(replay)
                return {"type": "http.request", "body": chunk, "more_body": not last}
            except StopIteration:
                return {"type": "http.request", "body": b"", "more_body": False}

        await self._app(scope, replay_receive, send)

    async def _send_error(self, send: Send, status: int, detail: str) -> None:
        body = json.dumps({"detail": detail}).encode("utf-8")
        await send(
            {
                "type": "http.response.start",
                "status": status,
                "headers": [
                    (b"content-type", b"application/json"),
                    (b"content-length", str(len(body)).encode("ascii")),
                ],
            }
        )
        await send({"type": "http.response.body", "body": body, "more_body": False})
