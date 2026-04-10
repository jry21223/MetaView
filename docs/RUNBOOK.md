# Runbook

## Deployment procedures

<!-- AUTO-GENERATED: deployment -->
### Local production-like stack

```bash
make start
```

This uses Docker Compose to build and launch the `api` and `web` services locally.

### Remote deployment script

Use `./deploy.sh` for managed remote deployment workflows:

- `./deploy.sh` — full deploy: sync code, build, start, and run health checks
- `./deploy.sh quick` — sync and restart without rebuild
- `./deploy.sh build` — remote image build only
- `./deploy.sh restart` — restart remote containers only
- `./deploy.sh logs` — show remote container logs
- `./deploy.sh status` — show remote container status
- `./deploy.sh stop` — stop remote containers
- `./deploy.sh clean` — prune remote Docker cache
- `./deploy.sh backup` — back up remote data
- `./deploy.sh rollback` — roll back to the previous deployed version
- `./deploy.sh ssh` — open an SSH session on the remote server
- `./deploy.sh init` — install Docker / Compose and prepare the remote host

The deployment script syncs the repo to `/opt/demoo`, excludes local artifacts such as `.venv`, `node_modules`, `.env`, `data/media`, and `data/html_previews`, then runs Docker Compose remotely.
<!-- END AUTO-GENERATED: deployment -->

## Health checks and monitoring

<!-- AUTO-GENERATED: health -->
| Endpoint / Check | Purpose |
|---|---|
| `GET /health` | API liveness and version check. |
| `POST /api/v1/pipeline` | Synchronous pipeline execution. Useful for smoke tests. |
| `POST /api/v1/pipeline/submit` | Background pipeline submission. |
| `GET /api/v1/runtime` | Runtime provider catalog and capabilities. |
| `GET /api/v1/runtime/settings` | Current runtime settings visible to the UI. |
| `PUT /api/v1/runtime/settings` | Runtime settings update endpoint. |
| `POST /api/v1/manim/prepare` | Validate and normalize a manim script before rendering. |
| `POST /api/v1/manim/render` | Render a preview MP4 for a prepared manim script. |
| `GET /api/v1/runs` | Recent pipeline runs. |
| `GET /api/v1/runs/{request_id}` | Detailed history for a pipeline run. |
| `GET /media/...` | Static access to generated preview videos. |
| `GET /api/v1/html_preview/...` | Static access to generated HTML previews. |
<!-- END AUTO-GENERATED: health -->

## Common issues

<!-- AUTO-GENERATED: common-issues -->
| Symptom | Likely cause | Suggested action |
|---|---|---|
| HTML 预览已加载但一直没有进入 ready 状态 | scaffold 运行时启动失败，或 fallback 后的 payload 没有正确完成首帧初始化 | 检查浏览器控制台、`/api/v1/html_preview/...` 产物内容，以及 API 返回 diagnostics / 服务日志里的 html_coder 或 sandbox 提示；确认产物包含 `data-metaview-runtime="scaffold"`、`window.parent.postMessage`、`window.addEventListener("message")`。 |
| HTML 结果直接进入 fallback | provider 返回了完整 HTML、非 JSON 文本，或 JSON 被截断，导致 `payload-parse:*` 诊断 | 查看 runs 详情中的 `html_coder` trace；确认 provider 输出是单个 JSON object，而不是 `<!DOCTYPE html>`/`<html>` shell 或解释性文本。 |
| HTML 结果进入 fallback 且 diagnostics 出现 `payload-validate:*` | provider 返回的 payload JSON 缺少必填字段，常见是没有 `steps` 或字段类型不匹配 | 对照 `HtmlAnimationPayload` 检查 `title`、`summary`、`steps[]`、`params[]`；至少提供一个 step，并确保 `visual_kind` 与 token 结构合法。 |
| HTML 能打开但只有静态内容、没有流程演示感 | provider 虽然成功返回 payload，但没有使用 `logic_flow`，或 `flow_steps` 过少，只能渲染成普通卡片切换 | 检查 html_coder trace 与最终 HTML，确认 payload 含 `kind="logic_flow"`、`flow_nodes[]`、`flow_steps[]`；优先用于算法流程、判断、循环、分支类题目。 |
| logic_flow 页面能显示但节点/连线动画不明显 | `flow_steps` 没有正确引用 `highlight_node` / `pulse_link_ids` / `activate_node_ids`，或步骤时长过短 | 对照 payload 校验节点和连线 id；确保 `flow_steps` 至少覆盖“初始化 → 判断/执行 → 结束/回跳”，并给出 700ms 左右的 step duration。 |
| `make test` fails because `.venv/bin/pytest` is missing | Backend virtualenv has not been bootstrapped | Run `make bootstrap` first. |
| Real preview rendering is unavailable | `.venv-manim` or manim system dependencies are missing | Run `make bootstrap-manim` and verify fonts / manim runtime dependencies. |
| `make start` fails with a Docker Compose error | Docker Compose v2 or `docker-compose` is not installed | Install Docker Desktop / Compose, then rerun `make start`. |
| Remote deploy fails during SSH preflight | SSH key, host reachability, or server access is not configured | Test SSH access manually, then rerun `./deploy.sh`. |
| Frontend cannot reach the API in production-like mode | `VITE_API_BASE_URL` is missing or incorrect | Set `VITE_API_BASE_URL` to the public API prefix and rebuild the web image. |
| Preview narration fails | TTS backend URL, model, or key is unset or invalid | Check `ALGO_VIS_PREVIEW_TTS_*` settings and server logs. |
| Provider-backed generation fails with 502 responses | Upstream OpenAI-compatible provider is unreachable or rejected the request | Verify `ALGO_VIS_OPENAI_*` settings and inspect API logs with the returned `error_id`. |
<!-- END AUTO-GENERATED: common-issues -->

## Rollback procedures

<!-- AUTO-GENERATED: rollback -->
- For a managed remote deployment, use:
  ```bash
  ./deploy.sh rollback
  ```
- For a local Docker rollback, stop the stack with `make stop`, restore the previous image or code revision, then run `make start` again.
- If Nginx proxy changes were applied during remote deployment, the script keeps a temporary backup while validating the new config and restores it automatically if `nginx -t` fails.
<!-- END AUTO-GENERATED: rollback -->

## Escalation / logs

<!-- AUTO-GENERATED: logs -->
- Local API logs: run `make dev-api` in the foreground or inspect the Docker container logs.
- Remote app logs: `./deploy.sh logs`
- Server-side error details: use the `error_id` returned by the API and inspect service logs.
<!-- END AUTO-GENERATED: logs -->
