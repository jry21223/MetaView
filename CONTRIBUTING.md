# 协作与 Git 规范

## 分支策略

- 主分支固定为 `main`。
- 功能开发使用 `feat/<topic>`。
- 修复问题使用 `fix/<topic>`。
- 文档与脚手架调整使用 `docs/<topic>` 或 `chore/<topic>`。

## 提交规范

提交信息采用 Conventional Commits：

- `feat: ...`
- `fix: ...`
- `docs: ...`
- `chore: ...`
- `refactor: ...`
- `test: ...`

示例：

```text
feat: scaffold web and api mvp
docs: add architecture and git workflow
```

## 提交流程

1. 拉取 `main` 最新代码。
2. 新建语义化分支。
3. 完成开发后执行 `make check`。
4. 每次准备 push 前都必须先合并目标分支最新代码：执行 `git fetch origin`，再执行 `git merge origin/main`（或当前 PR 的目标分支）。如发生合并或冲突修复，必须重新执行 `make check`。
5. 确认 `git status` 干净且提交粒度清晰。
6. 使用规范提交信息提交，然后 push。

## Hook

首次克隆后执行：

```bash
npm install
npm run setup:git-hooks
```

本仓库会在本地执行：

- `pre-commit`: 前端 lint，若存在 `.venv` 则额外执行后端 `ruff` 与 `pytest`
- `commit-msg`: 校验 Conventional Commits
