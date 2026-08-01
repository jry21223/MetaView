"""Process-level verification for the pipeline observability baseline.

This starts the real FastAPI application and, for agent mode, the real Node
sidecar. A tiny local OpenAI-compatible server supplies deterministic JSON and
SSE responses, so the check consumes no external API quota and stores no real
credentials.

Run from the repository root with the API virtualenv::

    .venv/bin/python apps/api/scripts/verify_observability_e2e.py

The default report is written below ``eval/reports/`` (an ignored directory).
"""

from __future__ import annotations

import argparse
import json
import os
import socket
import sqlite3
import subprocess
import sys
import tempfile
import threading
import time
from contextlib import contextmanager
from dataclasses import dataclass
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Iterator
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_REPORT = REPO_ROOT / "eval/reports/observability-process-e2e.json"
PROMPT = "用动画解释导数的几何意义：曲线 y=x² 在点 (1,1) 处切线的斜率为什么是 2。"

SINGLE_CIR: dict[str, Any] = {
    "version": "0.1.0",
    "title": "导数与切线",
    "domain": "math",
    "summary": "曲线 y=x² 在点 (1,1) 的导数等于 2，因此切线斜率也等于 2。",
    "steps": [
        {
            "id": "s1",
            "title": "割线逼近切线",
            "narration": (
                "先观察 curve y=x² 和 target point (1,1)，再让 secant 割线逼近 "
                "tangent 切线。导数 derivative 表示切线 slope 斜率；f'(1)=2，"
                "所以点 (1,1) 处切线斜率等于 2。"
            ),
            "visual_kind": "function",
            "tokens": [],
            "plot": {
                "curves": [
                    {
                        "expression": "x^2",
                        "label": "curve f(x)=x²",
                        "emphasis": "primary",
                    },
                    {
                        "expression": "3*x-2",
                        "label": "secant slope",
                        "emphasis": "secondary",
                    },
                    {
                        "expression": "2*x-1",
                        "label": "tangent slope = 2",
                        "emphasis": "accent",
                    },
                ],
                "x_min": -1,
                "x_max": 3,
                "marker_x": 1,
                "formula_latex": "f'(1)=2",
            },
            "annotations": ["target_point (1,1)", "secant", "tangent", "slope"],
        }
    ],
}

SCENE_BLUEPRINT: dict[str, Any] = {
    "id": "math-derivative-tangent",
    "subject": "math",
    "sceneType": "derivative_tangent",
    "title": "导数与切线",
    "curves": [
        {
            "expression": "x^2",
            "label": "curve f(x)=x^2",
            "emphasis": "primary",
            "semanticRole": "curve",
        },
        {
            "expression": "3*x-2",
            "label": "secant slope",
            "emphasis": "secondary",
            "semanticRole": "secant",
        },
        {
            "expression": "2*x-1",
            "label": "tangent slope = 2",
            "emphasis": "accent",
            "semanticRole": "tangent",
        },
    ],
    "visualIntent": ["curve", "target_point", "secant", "tangent", "slope"],
    "caption": "曲线 y=x² 在点 (1,1) 的导数等于 2，因此切线斜率也等于 2。",
}


class FakeModelState:
    """Only request counters are retained; request bodies are never logged."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self.nonstream_requests = 0
        self.stream_requests = 0

    def next_nonstream(self) -> int:
        with self._lock:
            index = self.nonstream_requests
            self.nonstream_requests += 1
            return index

    def next_stream(self) -> int:
        with self._lock:
            index = self.stream_requests
            self.stream_requests += 1
            return index

    def snapshot(self) -> dict[str, int]:
        with self._lock:
            return {
                "nonstream_requests": self.nonstream_requests,
                "stream_requests": self.stream_requests,
            }


class FakeModelServer(ThreadingHTTPServer):
    state: FakeModelState


class FakeModelHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def do_POST(self) -> None:  # noqa: N802 - BaseHTTPRequestHandler contract
        if self.path.rstrip("/") != "/v1/chat/completions":
            self._json_response(404, {"error": "not found"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length) or b"{}")
        except (ValueError, json.JSONDecodeError):
            self._json_response(400, {"error": "invalid JSON"})
            return
        if payload.get("stream") is True:
            request_index = self.server.state.next_stream()  # type: ignore[attr-defined]
            self._stream_tool_call(request_index)
            return
        self.server.state.next_nonstream()  # type: ignore[attr-defined]
        self._json_response(
            200,
            {
                "id": "chatcmpl-single-e2e",
                "object": "chat.completion",
                "created": int(time.time()),
                "model": "fake-single",
                "choices": [
                    {
                        "index": 0,
                        "message": {
                            "role": "assistant",
                            "content": json.dumps(SINGLE_CIR, ensure_ascii=False),
                        },
                        "finish_reason": "stop",
                    }
                ],
                "usage": {
                    "prompt_tokens": 120,
                    "completion_tokens": 30,
                    "cache_creation_input_tokens": 10,
                    "prompt_tokens_details": {
                        "cached_tokens": 80,
                        "cache_write_tokens": 10,
                    },
                },
            },
        )

    def _stream_tool_call(self, request_index: int) -> None:
        calls = _stream_calls(request_index)
        completion_id = f"chatcmpl-agent-e2e-{request_index}"
        created = int(time.time())
        chunks = [
            {
                "id": completion_id,
                "object": "chat.completion.chunk",
                "created": created,
                "model": "fake-agent",
                "choices": [
                    {
                        "index": 0,
                        "delta": {
                            "role": "assistant",
                            "tool_calls": [
                                {
                                    "index": index,
                                    "id": f"call_{request_index}_{index}",
                                    "type": "function",
                                    "function": {
                                        "name": name,
                                        "arguments": json.dumps(args, ensure_ascii=False),
                                    },
                                }
                                for index, (name, args) in enumerate(calls)
                            ],
                        },
                        "finish_reason": None,
                    }
                ],
            },
            {
                "id": completion_id,
                "object": "chat.completion.chunk",
                "created": created,
                "model": "fake-agent",
                "choices": [
                    {
                        "index": 0,
                        "delta": {},
                        "finish_reason": "tool_calls",
                    }
                ],
            },
            {
                "id": completion_id,
                "object": "chat.completion.chunk",
                "created": created,
                "model": "fake-agent",
                "choices": [],
                "usage": {
                    "prompt_tokens": 200,
                    "completion_tokens": 30,
                    "prompt_tokens_details": {
                        "cached_tokens": 80,
                        "cache_write_tokens": 10,
                    },
                },
            },
        ]
        body = (
            "".join(f"data: {json.dumps(chunk, ensure_ascii=False)}\n\n" for chunk in chunks)
            + "data: [DONE]\n\n"
        )
        encoded = body.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Content-Length", str(len(encoded)))
        self.send_header("Connection", "close")
        self.end_headers()
        self.wfile.write(encoded)
        self.wfile.flush()
        self.close_connection = True

    def _json_response(self, status: int, payload: dict[str, Any]) -> None:
        encoded = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(encoded)))
        self.send_header("Connection", "close")
        self.end_headers()
        self.wfile.write(encoded)
        self.close_connection = True

    def log_message(self, _format: str, *_args: object) -> None:
        return


def _stream_calls(request_index: int) -> list[tuple[str, dict[str, Any]]]:
    if request_index == 0:
        return [
            (
                "plan_outline",
                {
                    "domain": "math",
                    "step_titles": [f"导数与切线 {index}" for index in range(1, 9)],
                    "title": "导数与切线",
                    "summary": "割线逼近切线并读出导数。",
                },
            )
        ]
    if request_index == 1:
        return [("finalize_playbook", {})]
    if request_index == 2:
        # Two tools in one model turn prove that tool calls are not a proxy for
        # model requests. These synchronous emitter mutations execute in order.
        return [
            ("begin_step", {"index": 1, "title": "记录首个可提交步骤"}),
            ("commit_step", {}),
        ]
    return [
        (
            "runtime_tool_execute",
            {
                "tool": "scene_blueprint.compile",
                "args": {"blueprint": SCENE_BLUEPRINT},
            },
        )
    ]


@dataclass
class ManagedProcess:
    name: str
    process: subprocess.Popen[str]
    log_path: Path
    log_handle: Any

    def stop(self) -> None:
        if self.process.poll() is None:
            self.process.terminate()
            try:
                self.process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.process.kill()
                self.process.wait(timeout=5)
        self.log_handle.flush()
        self.log_handle.close()

    def tail(self, line_count: int = 40) -> str:
        self.log_handle.flush()
        if not self.log_path.exists():
            return ""
        return "\n".join(
            self.log_path.read_text(encoding="utf-8", errors="replace").splitlines()[-line_count:]
        )


def _start_process(
    name: str,
    command: list[str],
    env: dict[str, str],
    log_dir: Path,
) -> ManagedProcess:
    log_path = log_dir / f"{name}.log"
    log_handle = log_path.open("w", encoding="utf-8")
    process = subprocess.Popen(
        command,
        cwd=REPO_ROOT,
        env=env,
        stdout=log_handle,
        stderr=subprocess.STDOUT,
        text=True,
    )
    return ManagedProcess(name, process, log_path, log_handle)


@contextmanager
def _fake_model_server() -> Iterator[tuple[str, FakeModelState]]:
    state = FakeModelState()
    server = FakeModelServer(("127.0.0.1", 0), FakeModelHandler)
    server.state = state
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        host, port = server.server_address
        yield f"http://{host}:{port}/v1", state
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def _wait_for_health(
    url: str,
    process: ManagedProcess,
    *,
    timeout_s: float = 20,
) -> None:
    deadline = time.monotonic() + timeout_s
    last_error = "no response"
    while time.monotonic() < deadline:
        if process.process.poll() is not None:
            raise RuntimeError(
                f"{process.name} exited with {process.process.returncode}\n{process.tail()}"
            )
        try:
            payload = _request_json("GET", url)
            if payload.get("status") == "ok":
                return
            last_error = f"unexpected health payload: {payload!r}"
        except (HTTPError, URLError, TimeoutError, RuntimeError) as exc:
            last_error = str(exc)
        time.sleep(0.1)
    raise RuntimeError(
        f"{process.name} did not become healthy at {url}: {last_error}\n{process.tail()}"
    )


def _request_json(
    method: str,
    url: str,
    payload: dict[str, Any] | None = None,
    *,
    timeout_s: float = 10,
) -> dict[str, Any]:
    body = None if payload is None else json.dumps(payload, ensure_ascii=False).encode()
    request = Request(
        url,
        data=body,
        method=method,
        headers={"Content-Type": "application/json"} if body is not None else {},
    )
    try:
        with urlopen(request, timeout=timeout_s) as response:  # noqa: S310 - localhost only
            decoded = json.loads(response.read())
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"{method} {url} returned HTTP {exc.code}: {detail}") from exc
    if not isinstance(decoded, dict):
        raise RuntimeError(f"{method} {url} returned a non-object JSON payload")
    return decoded


def _submit_and_poll(api_base: str, *, timeout_s: float = 60) -> dict[str, Any]:
    submitted = _request_json(
        "POST",
        f"{api_base}/api/v1/pipeline",
        {
            "prompt": PROMPT,
            "domain": "math",
            "skill_mode_override": "generic",
            "router_mode": "off",
        },
    )
    run_id = submitted.get("run_id")
    if not isinstance(run_id, str):
        raise AssertionError(f"pipeline response has no run_id: {submitted!r}")
    deadline = time.monotonic() + timeout_s
    while time.monotonic() < deadline:
        result = _request_json("GET", f"{api_base}/api/v1/runs/{run_id}")
        if result.get("status") == "succeeded":
            return result
        if result.get("status") == "failed":
            raise AssertionError(
                f"run {run_id} failed: {result.get('error')}\n"
                f"quality={json.dumps(result.get('quality_report'), ensure_ascii=False)}"
            )
        time.sleep(0.1)
    raise TimeoutError(f"run {run_id} did not finish within {timeout_s:.0f}s")


def _read_spans(db_path: Path, run_id: str) -> list[dict[str, Any]]:
    with sqlite3.connect(db_path) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            "SELECT * FROM pipeline_run_spans WHERE run_id=? ORDER BY started_at ASC, rowid ASC",
            (run_id,),
        ).fetchall()
    spans: list[dict[str, Any]] = []
    for row in rows:
        span = dict(row)
        raw_metadata = span.pop("metadata_json", None)
        span["metadata"] = json.loads(raw_metadata) if raw_metadata else {}
        spans.append(span)
    return spans


def _tree(spans: list[dict[str, Any]]) -> list[dict[str, Any]]:
    nodes = {
        span["span_id"]: {
            key: value
            for key, value in span.items()
            if key not in {"span_id", "run_id", "parent_span_id"} and value is not None
        }
        | {"span_id": span["span_id"], "children": []}
        for span in spans
    }
    roots: list[dict[str, Any]] = []
    for span in spans:
        node = nodes[span["span_id"]]
        parent = nodes.get(span["parent_span_id"])
        if parent is None:
            roots.append(node)
        else:
            parent["children"].append(node)
    return roots


def _assert_privacy(spans: list[dict[str, Any]]) -> None:
    serialized = json.dumps(
        [span.get("metadata", {}) for span in spans],
        ensure_ascii=False,
        sort_keys=True,
    )
    forbidden = [PROMPT, "fake-e2e-key", SCENE_BLUEPRINT["caption"]]
    leaked = [value for value in forbidden if value in serialized]
    if leaked:
        raise AssertionError("span metadata leaked prompt, credentials, or tool arguments")


def _one(spans: list[dict[str, Any]], stage: str) -> dict[str, Any]:
    matches = [span for span in spans if span["stage"] == stage]
    if len(matches) != 1:
        raise AssertionError(f"expected one {stage!r} span, found {len(matches)}")
    return matches[0]


def _assert_common(result: dict[str, Any], spans: list[dict[str, Any]]) -> None:
    root = _one(spans, "pipeline.total")
    if root["parent_span_id"] is not None or root["status"] != "ok":
        raise AssertionError("pipeline.total must be a successful root span")
    required = {
        "router",
        "coverage_resolution",
        "lesson_plan",
        "skill_pack",
        "quality_gate",
        "finalize",
    }
    missing = required.difference(span["stage"] for span in spans)
    if missing:
        raise AssertionError(f"missing required stages: {sorted(missing)}")
    if result.get("telemetry") is None:
        raise AssertionError("detail GET omitted telemetry")
    if result.get("telemetry", {}).get("time_to_final_result_ms") is None:
        raise AssertionError("final-result latency is missing")
    if "total_model_requests" in result.get("telemetry", {}):
        raise AssertionError("summary must not expose a partial total_model_requests")
    _assert_privacy(spans)


def _assert_single(result: dict[str, Any], spans: list[dict[str, Any]]) -> None:
    _assert_common(result, spans)
    generation = _one(spans, "generation.single")
    if generation["status"] != "ok" or generation["model_turns"] != 1:
        raise AssertionError("single generation span did not capture its model request")
    expected_usage = {
        "input_tokens": 120,
        "output_tokens": 30,
        "cache_read_tokens": 80,
        "cache_write_tokens": 10,
    }
    for key, expected in expected_usage.items():
        if generation[key] != expected:
            raise AssertionError(f"single {key}: expected {expected}, got {generation[key]}")
    summary = result["telemetry"]
    expected_summary = {
        **expected_usage,
        "generator_path": "generic_cir",
        "generation_model_turns": 1,
        "single_model_requests": 1,
        "agent_provider_calls": 0,
        "agent_attempts": 0,
    }
    _assert_summary(summary, expected_summary, "single")


def _assert_agent(result: dict[str, Any], spans: list[dict[str, Any]]) -> None:
    _assert_common(result, spans)
    provider = _one(spans, "generation.agent_provider")
    sidecar = _one(spans, "agent.sidecar")
    if sidecar["parent_span_id"] != provider["span_id"]:
        raise AssertionError("agent.sidecar must be a generation.agent_provider child")
    attempts = sorted(
        (span for span in spans if span["stage"] == "agent.attempt"),
        key=lambda span: span["attempt_index"],
    )
    if len(attempts) != 2 or [span["attempt_index"] for span in attempts] != [0, 1]:
        raise AssertionError(f"expected sidecar attempt siblings [0, 1], got {attempts!r}")
    if any(span["parent_span_id"] != sidecar["span_id"] for span in attempts):
        raise AssertionError("agent attempts must be children of the same sidecar span")
    if [span["status"] for span in attempts] != ["error", "ok"]:
        raise AssertionError("agent attempts must preserve blocked then successful outcomes")
    if attempts[0]["metadata"].get("self_check_status") != "blocked":
        raise AssertionError("first sidecar self-check outcome was not preserved")
    if [span["model_turns"] for span in attempts] != [2, 2]:
        raise AssertionError("agent model-turn counts do not match the four SSE requests")
    if [span["tool_calls"] for span in attempts] != [2, 3]:
        raise AssertionError("multi-tool batch was not separated from model-turn count")
    if attempts[1]["metadata"].get("first_committed_step_at") is None:
        raise AssertionError("second-attempt first committed step timestamp is missing")
    summary = result["telemetry"]
    _assert_summary(
        summary,
        {
            "generator_path": "agent",
            "input_tokens": 440,
            "output_tokens": 120,
            "cache_read_tokens": 320,
            "cache_write_tokens": 40,
            "generation_model_turns": 4,
            "tool_batches": 4,
            "tool_calls": 5,
            "single_model_requests": 0,
            "agent_provider_calls": 1,
            "agent_attempts": 2,
        },
        "agent",
    )
    if summary.get("time_to_first_committed_step_ms") is None:
        raise AssertionError("run summary omitted time to first committed step")


def _assert_summary(
    summary: dict[str, Any],
    expected: dict[str, Any],
    label: str,
) -> None:
    for key, value in expected.items():
        if summary.get(key) != value:
            raise AssertionError(
                f"{label} telemetry.{key}: expected {value!r}, got {summary.get(key)!r}"
            )


def _base_api_env(db_path: Path) -> dict[str, str]:
    env = os.environ.copy()
    env.update(
        {
            "METAVIEW_APP_EDITION": "self",
            "METAVIEW_HISTORY_DB_PATH": str(db_path),
            "METAVIEW_RATE_LIMIT_ENABLED": "false",
            "METAVIEW_ROUTER_MODE": "off",
            "METAVIEW_REVIEWER_MODE": "off",
            "METAVIEW_PIPELINE_TIMEOUT_S": "60",
            "METAVIEW_OPENAI_CRITIC_MODEL": "",
        }
    )
    return env


def _api_command(port: int) -> list[str]:
    return [
        sys.executable,
        "-m",
        "uvicorn",
        "app.main:app",
        "--app-dir",
        str(REPO_ROOT / "apps/api"),
        "--host",
        "127.0.0.1",
        "--port",
        str(port),
        "--log-level",
        "warning",
    ]


def _run_single(fake_base_url: str, work_dir: Path) -> dict[str, Any]:
    db_path = work_dir / "single.db"
    port = _free_port()
    env = _base_api_env(db_path)
    env.update(
        {
            "METAVIEW_GENERATION_MODE": "single",
            "METAVIEW_OPENAI_API_KEY": "fake-e2e-key",
            "METAVIEW_OPENAI_BASE_URL": fake_base_url,
            "METAVIEW_OPENAI_MODEL": "fake-single",
        }
    )
    process = _start_process("single-api", _api_command(port), env, work_dir)
    try:
        api_base = f"http://127.0.0.1:{port}"
        _wait_for_health(f"{api_base}/health", process)
        result = _submit_and_poll(api_base)
        spans = _read_spans(db_path, result["run_id"])
        _assert_single(result, spans)
        return {
            "status": "passed",
            "run_id": result["run_id"],
            "telemetry": result["telemetry"],
            "span_tree": _tree(spans),
        }
    except Exception as exc:
        raise RuntimeError(f"single process E2E failed: {exc}\n{process.tail()}") from exc
    finally:
        process.stop()


def _run_agent(fake_base_url: str, work_dir: Path) -> dict[str, Any]:
    db_path = work_dir / "agent.db"
    api_port = _free_port()
    sidecar_port = _free_port()
    token = "e2e-shared-token"
    api_env = _base_api_env(db_path)
    api_env.update(
        {
            "METAVIEW_GENERATION_MODE": "agent",
            "METAVIEW_OPENAI_API_KEY": "",
            "METAVIEW_AGENT_BASE_URL": f"http://127.0.0.1:{sidecar_port}",
            "METAVIEW_AGENT_SHARED_TOKEN": token,
            "METAVIEW_AGENT_TIMEOUT_S": "30",
        }
    )
    sidecar_env = os.environ.copy()
    sidecar_env.update(
        {
            "PORT": str(sidecar_port),
            "API_BASE_URL": f"http://127.0.0.1:{api_port}",
            "AGENT_DEFAULT_PROVIDER": "openai",
            "AGENT_DEFAULT_MODEL": "fake-agent",
            "AGENT_DEFAULT_API_KEY": "fake-e2e-key",
            "AGENT_DEFAULT_BASE_URL": fake_base_url,
            "AGENT_SHARED_TOKEN": token,
            "AGENT_TIMEOUT_MS": "30000",
            "LOG_LEVEL": "warn",
        }
    )
    sidecar = _start_process(
        "agent-sidecar",
        ["node", str(REPO_ROOT / "apps/agent/dist/server.js")],
        sidecar_env,
        work_dir,
    )
    api = _start_process("agent-api", _api_command(api_port), api_env, work_dir)
    try:
        _wait_for_health(f"http://127.0.0.1:{sidecar_port}/healthz", sidecar)
        api_base = f"http://127.0.0.1:{api_port}"
        _wait_for_health(f"{api_base}/health", api)
        result = _submit_and_poll(api_base)
        spans = _read_spans(db_path, result["run_id"])
        _assert_agent(result, spans)
        return {
            "status": "passed",
            "run_id": result["run_id"],
            "telemetry": result["telemetry"],
            "span_tree": _tree(spans),
        }
    except Exception as exc:
        raise RuntimeError(
            "agent process E2E failed: "
            f"{exc}\n--- agent-api ---\n{api.tail()}\n"
            f"--- agent-sidecar ---\n{sidecar.tail()}"
        ) from exc
    finally:
        api.stop()
        sidecar.stop()


def _build_agent() -> None:
    completed = subprocess.run(
        ["npm", "--workspace", "apps/agent", "run", "build"],
        cwd=REPO_ROOT,
        check=False,
        capture_output=True,
        text=True,
    )
    if completed.returncode != 0:
        raise RuntimeError(
            f"agent build failed before process E2E:\n{completed.stdout}\n{completed.stderr}"
        )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    parser.add_argument(
        "--skip-agent-build",
        action="store_true",
        help="Use the existing apps/agent/dist output.",
    )
    args = parser.parse_args()

    if not args.skip_agent_build:
        _build_agent()

    with tempfile.TemporaryDirectory(prefix="metaview-observability-e2e-") as raw_dir:
        work_dir = Path(raw_dir)
        with _fake_model_server() as (fake_base_url, state):
            print("[observability-e2e] running single path", flush=True)
            single = _run_single(fake_base_url, work_dir)
            print("[observability-e2e] single path passed", flush=True)
            print("[observability-e2e] running agent path", flush=True)
            agent = _run_agent(fake_base_url, work_dir)
            print("[observability-e2e] agent path passed", flush=True)
            requests = state.snapshot()
            if requests != {"nonstream_requests": 1, "stream_requests": 4}:
                raise AssertionError(f"unexpected fake-model request counts: {requests}")

    report = {
        "status": "passed",
        "transport": {
            "api": "real uvicorn process",
            "agent": "real Node sidecar process",
            "model": "local OpenAI-compatible JSON/SSE fixture",
        },
        "fake_model_requests": requests,
        "single": single,
        "agent": agent,
    }
    report_path = args.report.resolve()
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"[observability-e2e] report: {report_path}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
