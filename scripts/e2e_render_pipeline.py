"""Multi-discipline end-to-end check of the rendering pipeline.

Drives a running MetaView API through the full contract chain for one prompt
per capability -- ``POST /api/v1/pipeline`` -> CoverageDecision -> LessonPlan ->
PlaybookScript -> canonical QualityReport -> DirectorScript -- and writes each
run plus a machine-readable summary under ``eval/reports/`` (git-ignored).

The prompts are the capability examples declared by the deterministic
SkillPack manifests, so a failure here means a shipped capability cannot
produce a lesson for its own documented example.

Usage:
    .venv/bin/python scripts/e2e_render_pipeline.py [--api http://127.0.0.1:8000]

Rendering the resulting Playbooks is a separate step; feed the files written to
``eval/reports/e2e/playbooks/`` to ``apps/web/scripts/render-shots.mjs``.
"""

from __future__ import annotations

import argparse
import json
import pathlib
import sys
import time

import httpx

REPO_ROOT = pathlib.Path(__file__).resolve().parents[1]
DEFAULT_OUT = REPO_ROOT / "eval" / "reports" / "e2e"

# (case_id, discipline, prompt) -- prompts are SkillPack manifest examples.
CASES: list[tuple[str, str, str]] = [
    ("math-calculus-derivative", "math", "求 d/dx (x^2 sin x)"),
    ("math-calculus-integral", "math", "解释 int_0^1 x^2 dx 的面积"),
    ("math-calculus-limit", "math", "求 lim x->0 sin(x)/x"),
    ("math-elementary-algebra", "math", "解方程 2x+3=11"),
    ("math-quadratic-factor", "math", "因式分解 x^2-5x+6"),
    ("math-linear-eigen", "math", "求 A=[[1,2],[3,4]] 的特征值"),
    ("math-linear-gauss", "math", "对 [[1,2,3],[3,4,7]] 做高斯消元"),
    ("math-stats-descriptive", "math", "总体数据 [2,4,4,4,5,5,7,9]，求均值、中位数、众数和极差"),
    ("math-stats-binomial", "math", "二项分布 n=5, p=0.2, k=2，求概率"),
    ("algorithm-bfs", "algorithm", "用 BFS 遍历图 A-B, A-C, B-D，从 A 开始"),
    ("algorithm-dfs", "algorithm", "用 DFS 遍历图 A-B, A-C, B-D，从 A 开始"),
    ("algorithm-dijkstra", "algorithm", "解释 Dijkstra：A->B=2, B->C=1，求 A 到 C 最短路"),
    ("algorithm-toposort", "algorithm", "对有向图 A->B, A->C, B->D 做拓扑排序"),
    ("physics-newton-second", "physics", "质量 2kg 的物体受到 10N 水平拉力，忽略摩擦，求加速度"),
    ("physics-incline", "physics", "斜面倾角 30°，物体质量 1kg，忽略摩擦，求沿斜面下滑的加速度"),
    ("chemistry-balance", "chemistry", "配平 Fe + O2 -> Fe2O3"),
    ("chemistry-molar-mass", "chemistry", "求 H2O 的摩尔质量"),
    ("chemistry-limiting", "chemistry", "10g H2 与 80g O2 反应生成水，判断限量反应物并求理论产量"),
    ("chemistry-concentration", "chemistry", "0.5mol NaOH 溶于 1L 水，求物质的量浓度"),
    ("biology-monohybrid", "biology", "A 对 a 显性，亲本 Aa x Aa，求基因型比例和表现型比例"),
    ("biology-testcross", "biology", "A 对 a 显性，亲本 Aa x aa，做 test cross 并画 Punnett 表"),
    ("biology-dihybrid", "biology", "A 对 a 显性，B 对 b 显性，亲本 AaBb x AaBb，求表现型比例"),
    ("geography-climate-normals", "geography", "离线教学站点 EDU_TEMPERATE 的气候常年值摘要"),
    ("geography-climate-compare", "geography", "比较 EDU_TEMPERATE 和 EDU_ARID 的年均温和年降水"),
    ("geography-climate-anomaly", "geography", "EDU_TEMPERATE 7月观测气温 28C，求距平"),
]


def submit(client: httpx.Client, api: str, prompt: str) -> str:
    """Submit one run, backing off on the API's production write rate limit."""
    for _ in range(12):
        response = client.post(f"{api}/api/v1/pipeline", json={"prompt": prompt}, timeout=60)
        if response.status_code == 429:
            time.sleep(15.0)
            continue
        response.raise_for_status()
        return response.json()["run_id"]
    raise RuntimeError("still rate-limited after 12 submit attempts")


def poll(client: httpx.Client, api: str, run_id: str, timeout: float = 300.0) -> dict:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        response = client.get(f"{api}/api/v1/runs/{run_id}", timeout=60)
        response.raise_for_status()
        data = response.json()
        if data["status"] in {"succeeded", "failed"}:
            return data
        time.sleep(1.5)
    raise TimeoutError(f"run {run_id} did not settle within {timeout}s")


def summarize(case_id: str, discipline: str, prompt: str, run_id: str, data: dict) -> dict:
    coverage = data.get("coverage_decision") or {}
    report = data.get("quality_report") or {}
    playbook = data.get("playbook") or {}
    director = data.get("director") or {}
    steps = playbook.get("steps") or []
    issues = report.get("issues") or []
    return {
        "case_id": case_id,
        "discipline": discipline,
        "prompt": prompt,
        "run_id": run_id,
        "status": data["status"],
        "coverage_mode": coverage.get("mode"),
        "matched_skill_ids": coverage.get("matched_skill_ids"),
        "generator_path": report.get("generator_path"),
        "quality_status": report.get("status"),
        "issue_codes": [issue.get("code") for issue in issues],
        "step_count": len(steps),
        "snapshot_kinds": sorted(
            {(step.get("snapshot") or {}).get("kind") for step in steps} - {None}
        ),
        # DirectorScript carries "beats", not "shots".
        "director_beat_count": len(director.get("beats") or []),
        "error": data.get("error"),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--api", default="http://127.0.0.1:8000")
    parser.add_argument("--out", type=pathlib.Path, default=DEFAULT_OUT)
    args = parser.parse_args()

    runs_dir = args.out / "runs"
    playbooks_dir = args.out / "playbooks"
    directors_dir = args.out / "directors"
    for directory in (runs_dir, playbooks_dir, directors_dir):
        directory.mkdir(parents=True, exist_ok=True)

    rows: list[dict] = []
    with httpx.Client() as client:
        for case_id, discipline, prompt in CASES:
            try:
                run_id = submit(client, args.api, prompt)
                data = poll(client, args.api, run_id)
            except Exception as exc:  # noqa: BLE001
                rows.append(
                    {
                        "case_id": case_id,
                        "discipline": discipline,
                        "prompt": prompt,
                        "status": "driver_error",
                        "error": repr(exc),
                    }
                )
                print(f"[{case_id:28}] DRIVER ERROR {exc}", flush=True)
                continue

            (runs_dir / f"{case_id}.json").write_text(
                json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8"
            )
            if data.get("playbook"):
                (playbooks_dir / f"{case_id}.json").write_text(
                    json.dumps(data["playbook"], ensure_ascii=False), encoding="utf-8"
                )
            if data.get("director"):
                (directors_dir / f"{case_id}.json").write_text(
                    json.dumps(data["director"], ensure_ascii=False), encoding="utf-8"
                )

            row = summarize(case_id, discipline, prompt, run_id, data)
            rows.append(row)
            print(
                f"[{case_id:28}] {row['status']:9} gate={row['quality_status']} "
                f"path={row['generator_path']} coverage={row['coverage_mode']} "
                f"steps={row['step_count']} beats={row['director_beat_count']}",
                flush=True,
            )

    (args.out / "summary.json").write_text(
        json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    succeeded = sum(1 for row in rows if row.get("status") == "succeeded")
    print(f"\n{succeeded}/{len(rows)} succeeded -- report: {args.out / 'summary.json'}")
    return 0 if succeeded == len(rows) else 1


if __name__ == "__main__":
    sys.exit(main())
