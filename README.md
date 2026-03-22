# MetaView

数智化学科可视化平台。

基于特调大模型、学科技能路由、CIR 中间表示和 Web 原生渲染的多学科可视化平台可交付版。

## 当前阶段

- `apps/api`: FastAPI 后端，提供 CIR 规划、多智能体编排、验证修复、历史持久化和运行时目录。
- `apps/web`: React + Vite 前端，提供多学科题目输入、物理题图上传、历史回看、视频预览、自定义代码转换测试和模型提供商管理。
- `skills`: 仅保留运行时实际使用的 prompt 参考资料与生成脚本，供多学科 staged prompt 组装使用。
- `docs`: 架构说明、研发路线和 Git 协作规范。
- `docker-compose.yml`: API + Web 联调与部署入口。

当前版本已经打通完整的可交付链路：

1. 用户输入题目。
2. 选择路由模型、规划/编码模型、dry-run 沙盒模式，并可附带题目图片。
3. 后端先由路由模型自动判断题目所属学科，再把已启用的 subject skill 注入规划/编码模型，生成结构化 CIR，执行验证与自动修复。
4. 后端执行脚本级 dry-run 校验，并持久化任务到 SQLite。
5. 后端输出 Python Manim 脚本并生成 MP4 预览，前端负责播放视频、查看调试信息和回看历史结果。
6. 若已配置 `mimotts-v2`，后端会在视频渲染完成后自动合成中文旁白并嵌入 MP4。

当前默认启用全部七个学科模块：

- `algorithm`
- `math`
- `code`
- `physics`
- `chemistry`
- `biology`
- `geography`

## 简化启动

### 方式 A：直接启动成品环境

这是最简单的启动方式，适合先把整套页面和 API 跑起来：

```bash
cp .env.example .env
make start
```

启动后：

- Web: `http://127.0.0.1:5173`
- API: `http://127.0.0.1:8000`

停止：

```bash
make stop
```

说明：

- 这条路径默认使用 Docker 内的 fallback 预览渲染
- 如果你已经配置 OpenAI 兼容模型，运行时会默认优先选用已配置 API
- 若还没配真实模型，也可以保留 `mock` provider 先跑通界面；现在也支持在运行时面板里直接禁用
- 如果只想先验证前后端联通，这是推荐方式

### 方式 B：本地开发启动

适合需要改前端、后端或调试测试的场景。

#### 1. 初始化环境

```bash
make bootstrap
npm run setup:git-hooks
cp .env.example .env
```

如果你需要真实 `manim-cli` 渲染，再额外执行：

```bash
make bootstrap-manim
```

#### 2. 一键启动本地开发

```bash
make dev
```

这条命令会同时拉起：

- API: `http://127.0.0.1:8000`
- Web: `http://127.0.0.1:5173`

如果你想拆成两个终端单独调试，也可以继续使用：

终端 1：

```bash
make dev-api
```

终端 2：

```bash
make dev-web
```

可用接口：

- `GET /health`
- `GET /api/v1/runtime`
- `GET /api/v1/runtime/settings`
- `PUT /api/v1/runtime/settings`
- `POST /api/v1/pipeline`
- `POST /api/v1/prompts/reference`
- `POST /api/v1/prompts/custom-subject`
- `GET /api/v1/runs`
- `GET /api/v1/runs/{request_id}`
- `POST /api/v1/providers/custom`
- `POST /api/v1/providers/custom/test`
- `DELETE /api/v1/providers/custom/{name}`
- `POST /api/v1/manim/prepare`
- `POST /api/v1/manim/render`

## 快速命令

### 最短可用命令

```bash
cp .env.example .env && make start
```

### 本地开发一键启动

```bash
make bootstrap && cp .env.example .env && make dev
```

### 本地开发双终端

终端 1：

```bash
make dev-api
```

终端 2：

```bash
make dev-web
```

## 常用命令

```bash
make lint
make test
make build
make check
```

## Docker

也可以继续使用 Make 包装命令：

```bash
cp .env.example .env
make start
```

## 环境变量

- `ALGO_VIS_ENABLED_DOMAINS`: 当前启用的学科模块，逗号分隔，默认 `algorithm,math,code,physics,chemistry,biology,geography`
- `ALGO_VIS_HISTORY_DB_PATH`: SQLite 历史库路径
- `ALGO_VIS_CORS_ORIGIN_REGEX`: 本地联调默认允许的浏览器来源规则
- `ALGO_VIS_DEFAULT_PROVIDER`: 显式指定统一默认 provider；留空时自动挑选已配置 API
- `ALGO_VIS_DEFAULT_ROUTER_PROVIDER`: 显式指定默认路由模型；留空时自动挑选已配置 API
- `ALGO_VIS_DEFAULT_GENERATION_PROVIDER`: 显式指定默认规划/编码模型；留空时自动挑选已配置 API
- `ALGO_VIS_MOCK_PROVIDER_ENABLED`: 是否暴露内置 `mock` provider，默认 `true`
- `ALGO_VIS_PREVIEW_RENDER_BACKEND`: `auto`、`manim` 或 `fallback`
- `ALGO_VIS_MANIM_PYTHON_PATH`: 真实渲染时使用的 Python 环境，默认 `.venv-manim/bin/python`
- `ALGO_VIS_MANIM_RENDER_TIMEOUT_S`: 单次 `manim` 渲染超时，默认 180 秒
- `ALGO_VIS_PREVIEW_TTS_ENABLED`: 是否启用预览视频自动配音，默认 `true`
- `ALGO_VIS_PREVIEW_TTS_BACKEND`: TTS 后端，当前默认 `openai_compatible`
- `ALGO_VIS_PREVIEW_TTS_MODEL`: 旁白模型名，默认 `mimotts-v2`
- `ALGO_VIS_PREVIEW_TTS_BASE_URL`: `mimotts-v2` 所在的 OpenAI 兼容 `/v1` 根地址；留空时会优先复用 generation provider 的地址
- `ALGO_VIS_PREVIEW_TTS_API_KEY`: `mimotts-v2` API Key；留空时会优先复用 generation provider 或内置 `openai` provider 的 key
- `ALGO_VIS_PREVIEW_TTS_VOICE`: 远程 TTS 的 voice 参数，默认 `default`
- `ALGO_VIS_PREVIEW_TTS_RATE_WPM`: 目标语速，默认 `150`
- `ALGO_VIS_PREVIEW_TTS_SPEED`: 远程 TTS 的基础 speed，默认 `0.88`
- `ALGO_VIS_PREVIEW_TTS_MAX_CHARS`: 单次旁白允许的最大字符数，默认 `1500`
- `ALGO_VIS_PREVIEW_TTS_TIMEOUT_S`: 单次远程配音超时，默认 `120`
- `ALGO_VIS_OPENAI_API_KEY`: 启用内置 OpenAI 兼容 Provider
- `ALGO_VIS_OPENAI_BASE_URL`: OpenAI 兼容 API 地址
- `ALGO_VIS_OPENAI_MODEL`: 使用的模型名
- `ALGO_VIS_OPENAI_SUPPORTS_VISION`: 内置 OpenAI 兼容 Provider 是否支持图片输入
- `VITE_API_BASE_URL`: 前端构建时 API 基地址，默认同源

## 自定义 Provider

当前版本支持通过前端面板或 HTTP API 注册自定义 OpenAI 兼容模型提供商，例如本地 `Ollama`、`vLLM` 网关或第三方代理服务。自定义 Provider 会持久化到 SQLite，并自动出现在运行时目录中。

内置 `openai` Provider 继续走环境变量配置；自定义 Provider 则通过 `POST /api/v1/providers/custom` 动态注册。当前 Provider 配置还允许显式声明是否支持视觉输入，这会影响题图是否发送给路由模型和规划模型。

如果你不希望开发阶段继续暴露 `mock`，可以：

- 在 `.env` 里把 `ALGO_VIS_MOCK_PROVIDER_ENABLED=false`
- 或直接在前端底部的 `TTS 与默认行为` 面板里关闭 `mock provider`

## 学科技能层

运行时真正生效的学科描述符定义在 [skill_catalog.py](/Users/jerry/Desktop/demoo/apps/api/app/services/skill_catalog.py)，用于：

- 控制智能模式 / 专家模式下的学科路由信息
- 向 Planner / Coder / Critic 注入学科聚焦说明
- 告知前端当前学科是否支持题图输入

运行时真正读取的学科参考提示词位于 [skills/generate-subject-manim-prompts/references](/Users/jerry/Desktop/demoo/skills/generate-subject-manim-prompts/references)，按 `Common / Planner / Coder / Critic / Repair` 分段装配。仓库里原先那些顶层 legacy skill 目录已经移除，不再参与运行时。

其中物理链路已支持“静态题目图片 -> 物理建模 -> 动图草案”：前端可上传题图，后端会先提取对象、约束、已知量和目标量，再生成符合物理定律的预览流程。

## Manim 特化模型接入

你在开发文档里提到的 Manim 特化模型，目前没有作为内置模型直接打包进项目；当前项目真正用到的是：

- `mock` Provider
- 内置 `openai` 兼容 Provider
- 你自行注册的自定义 OpenAI 兼容 Provider

如果你要接入类似 `prithivMLmods/Pyxidis-Manim-CodeGen-1.7B` 这类 Manim 特化模型，当前正确用法是：

1. 先把该模型部署成 OpenAI 兼容接口，常见方式是 `vLLM`、`LocalAI`、`LM Studio` 或其他带 `/v1/chat/completions` 的服务。
2. 在前端“自定义模型提供商”面板里填写：
   - `Base URL`
   - `Model`
   - `API Key`
   - 是否支持图片
3. 保存后把它选为“规划/编码模型”；路由模型则可以继续使用更便宜的通用模型或 `mock`。

当前系统已经支持双模型编排：

- `router_provider`: 负责学科自动路由
- `generation_provider`: 负责 Planner / Coder / Critic

这意味着你现在就可以把便宜模型留给路由，把 Manim 特化模型专门留给生成链路。

## Runtime Prompt 模块

运行时真正发给 provider 的提示词已拆到独立模块：

- [router.py](/Users/jerry/Desktop/demoo/apps/api/app/services/prompts/router.py)
- [planner.py](/Users/jerry/Desktop/demoo/apps/api/app/services/prompts/planner.py)
- [coder.py](/Users/jerry/Desktop/demoo/apps/api/app/services/prompts/coder.py)
- [critic.py](/Users/jerry/Desktop/demoo/apps/api/app/services/prompts/critic.py)
- [domain_guidance.py](/Users/jerry/Desktop/demoo/apps/api/app/services/prompts/domain_guidance.py)

新增学科或模块时，优先扩展这里，而不是回到 `openai.py` 里写硬编码字符串。

如果你要让模型直接帮你重写某个学科的 reference 文件，可用：

```bash
python skills/generate-subject-manim-prompts/scripts/generate_reference_with_llm.py \
  --subject algorithm \
  --notes "强调二分、滑窗、图搜索的状态同步与终止条件" \
  --write
```

默认会复用 `.env` 中的 `ALGO_VIS_OPENAI_BASE_URL`、`ALGO_VIS_OPENAI_API_KEY`、`ALGO_VIS_OPENAI_MODEL`
或 `ALGO_VIS_OPENAI_PLANNING_MODEL`。先检查请求内容可加 `--dry-run`。

上面这条脚本仍然是给仓库维护者使用的，用来微调内置学科 reference。

如果你要为用户生成一个“全新的学科工具 Prompt 包”，不要改内置 reference，而是使用：

```bash
python skills/generate-subject-manim-prompts/scripts/generate_custom_subject_prompt_with_llm.py \
  --subject-name "Transport Phenomena" \
  --summary "面向传热、传质、动量传递的教学动画提示词" \
  --notes "强调守恒量、边界条件、通量方向与常见误解" \
  --write
```

默认会写到 `skills/generated-subject-prompts/<slug>.md`。这套脚本和网页底部工具都只生成新的独立 Prompt 包，不会覆盖现有 `algorithm / math / code / physics / chemistry / biology / geography` 的运行时 reference。

## 自定义 Provider

前端 Provider 面板现已支持：

- 新增
- 编辑
- 删除
- 连通性测试

编辑已有 provider 时，如果 API Key 留空，后端会保留旧 key，不会被空值覆盖。

## 渲染层说明

当前主链路统一产出 Python Manim 脚本，并由后端生成 MP4 预览视频。前端不再承担 `py2ts` 或 `manim-web` 的实时转换职责，而是提供视频播放、原始返回查看和脚本转换测试入口。

### TTS 配音

当前默认按 `mimotts-v2` 作为预览视频的旁白模型。只要后端能拿到一组可用的 OpenAI 兼容音频接口配置，渲染完成后就会自动把中文旁白嵌进 MP4。

前端现在有两层控制：

- “高级设置”里的请求级开关：决定本次任务是否嵌入旁白
- 底部 `TTS 与默认行为` 面板：管理 `mimotts-v2` 的 Base URL、API Key、voice、rate、speed，以及是否允许 `mock` provider

配置优先级：

1. `ALGO_VIS_PREVIEW_TTS_BASE_URL` + `ALGO_VIS_PREVIEW_TTS_API_KEY`
2. 当前 generation provider 的 `base_url` + `api_key`
3. 内置 `openai` provider 的 `ALGO_VIS_OPENAI_BASE_URL` + `ALGO_VIS_OPENAI_API_KEY`

如果这三层都没有可用配置，后端会跳过配音，并在 diagnostics 里明确提示 `mimotts-v2` 或 `ffmpeg` 不可用。

真实渲染默认走 `auto` 模式：

- 若 `.venv-manim` 中可用 `manim`，优先使用 `manim-cli` 真渲染。
- 若 `manim` 不可用，则自动降级到 fallback 预览视频。
- 自定义代码测试面板可直接触发“转换并真实渲染”接口。

## 已完成范围

- monorepo、Git hooks、CI、Conventional Commits
- FastAPI 编排层、双模型编排、学科技能注册表、内置与自定义 OpenAI 兼容 Provider 适配
- CIR 校验器、自动修复链路、脚本级 dry-run 沙盒
- SQLite 历史持久化、回放接口与自定义 Provider 存储
- React 工作台、自动学科判断、题图上传、视频预览、运行时视图、历史记录、JSON 导出与代码转换测试
- 算法 / 数学 / 物理 / 化学 / 生物 / 地理 skill 模块
- Docker 化启动入口
