import { MetaParticleField } from "../../shared/ui/MetaParticleField";

interface LandingPageProps {
  appEdition: "self" | "ops";
  isDark: boolean;
  onToggleTheme: () => void;
  onStart: () => void;
  onOpenTemplates: () => void;
}

const SUBJECTS = ["数学", "物理", "化学", "生物", "地理", "算法与代码"];

const PROCESS_STEPS = [
  {
    index: "01",
    label: "UNDERSTAND",
    title: "先理解题目",
    description: "识别学科、学习目标、关键量与能力边界，不把所有输入都粗暴地交给同一条生成链。",
  },
  {
    index: "02",
    label: "PLAN",
    title: "规划讲解顺序",
    description: "形成 LessonPlan，明确教学弧线、结论、误区与每一个场景要完成的任务。",
  },
  {
    index: "03",
    label: "DIRECT",
    title: "编排焦点与节奏",
    description: "DirectorScript 决定镜头意图、强调对象、观看节奏与场景之间的连续关系。",
  },
  {
    index: "04",
    label: "RENDER",
    title: "生成可交互画布",
    description: "将结构化讲解转化为可播放、可追问、可调整并可导出的视频与学习内容。",
  },
];

const PRINCIPLES = [
  {
    marker: "A",
    title: "教学计划先于画面",
    description: "先确定为什么讲、按什么顺序讲，再决定画面中出现什么。",
  },
  {
    marker: "B",
    title: "焦点贯穿所有视图",
    description: "动画、代码、时间线与数据状态围绕同一个当前步骤同步变化。",
  },
  {
    marker: "C",
    title: "生成之后仍可继续",
    description: "用户可以继续追问、要求调整讲解，并保留可恢复的版本记录。",
  },
];

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
      <path d="M20.5 14.5A7.5 7.5 0 0 1 9.5 3.5 8 8 0 1 0 20.5 14.5Z" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="m4.9 4.9 1.4 1.4" />
      <path d="m17.7 17.7 1.4 1.4" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="m4.9 19.1 1.4-1.4" />
      <path d="m17.7 6.3 1.4-1.4" />
    </svg>
  );
}

function HeroCanvas() {
  return (
    <article className="mv-landing-canvas" aria-label="MetaView 讲解画布概念预览">
      <header className="mv-landing-canvas__head">
        <div>
          <span>THEORETICAL CANVAS</span>
          <strong>抛体运动 · 速度分解</strong>
        </div>
        <div className="mv-landing-canvas__status">
          <span className="mv-landing-canvas__status-dot" />
          SCENE 03 / 05
        </div>
      </header>

      <div className="mv-landing-canvas__stage">
        <div className="mv-landing-canvas__grid" aria-hidden="true" />
        <svg
          className="mv-landing-canvas__plot"
          viewBox="0 0 640 350"
          role="img"
          aria-label="抛体运动轨迹、速度分解和重力方向示意"
        >
          <defs>
            <marker
              id="mv-landing-arrow"
              markerWidth="8"
              markerHeight="8"
              refX="6"
              refY="4"
              orient="auto"
            >
              <path d="M0 0 8 4 0 8Z" fill="currentColor" />
            </marker>
          </defs>
          <path className="mv-landing-canvas__axis" d="M92 286H574M92 286V60" />
          <path
            className="mv-landing-canvas__trajectory"
            d="M116 270C214 92 378 76 528 244"
          />
          <circle className="mv-landing-canvas__object" cx="334" cy="112" r="8" />
          <path
            className="mv-landing-canvas__vector mv-landing-canvas__vector--velocity"
            d="M334 112 420 132"
            markerEnd="url(#mv-landing-arrow)"
          />
          <path
            className="mv-landing-canvas__vector mv-landing-canvas__vector--x"
            d="M334 112 420 112"
            markerEnd="url(#mv-landing-arrow)"
          />
          <path
            className="mv-landing-canvas__vector mv-landing-canvas__vector--y"
            d="M334 112 334 166"
            markerEnd="url(#mv-landing-arrow)"
          />
          <path
            className="mv-landing-canvas__vector mv-landing-canvas__vector--gravity"
            d="M526 112 526 196"
            markerEnd="url(#mv-landing-arrow)"
          />
          <text className="mv-landing-canvas__label" x="425" y="139">
            v
          </text>
          <text className="mv-landing-canvas__label" x="423" y="104">
            vₓ
          </text>
          <text className="mv-landing-canvas__label" x="344" y="166">
            vᵧ
          </text>
          <text className="mv-landing-canvas__label" x="538" y="176">
            g
          </text>
        </svg>

        <div className="mv-landing-canvas__note mv-landing-canvas__note--goal">
          <span>LEARNING GOAL</span>
          <strong>把速度拆成两个独立方向</strong>
        </div>
        <div className="mv-landing-canvas__note mv-landing-canvas__note--director">
          <span>DIRECTOR</span>
          <strong>聚焦速度矢量 · 慢速推进</strong>
        </div>
      </div>

      <footer className="mv-landing-canvas__timeline">
        {["建立坐标", "绘制轨迹", "分解速度", "引入重力", "形成结论"].map(
          (label, index) => (
            <div
              key={label}
              className={`mv-landing-canvas__beat${index === 2 ? " is-active" : ""}`}
            >
              <span>{String(index + 1).padStart(2, "0")}</span>
              <strong>{label}</strong>
            </div>
          ),
        )}
      </footer>
    </article>
  );
}

function LinkedExplorer() {
  return (
    <div className="mv-landing-linked" aria-label="联动学习界面示意">
      <header className="mv-landing-linked__head">
        <div>
          <span>LINKED EXPLORER</span>
          <strong>同一个焦点，贯穿四种视图</strong>
        </div>
        <span className="mv-landing-linked__time">00:18.40</span>
      </header>

      <div className="mv-landing-linked__body">
        <section className="mv-landing-linked__panel mv-landing-linked__panel--visual">
          <span className="mv-landing-linked__label">ANIMATION</span>
          <div className="mv-landing-linked__bars" aria-hidden="true">
            {[56, 84, 38, 70, 46, 62].map((height, index) => (
              <i
                key={`${height}-${index}`}
                className={index === 2 ? "is-active" : ""}
                style={{ height: `${height}%` }}
              />
            ))}
          </div>
        </section>

        <section className="mv-landing-linked__panel mv-landing-linked__panel--code">
          <span className="mv-landing-linked__label">CODE</span>
          <code>
            <span>while low &lt;= high:</span>
            <span className="is-active">mid = (low + high) // 2</span>
            <span>compare(target, items[mid])</span>
          </code>
        </section>

        <section className="mv-landing-linked__panel mv-landing-linked__panel--timeline">
          <span className="mv-landing-linked__label">TIMELINE</span>
          <div className="mv-landing-linked__track" aria-hidden="true">
            <i />
            <i />
            <i className="is-active" />
            <i />
            <i />
          </div>
        </section>

        <section className="mv-landing-linked__panel mv-landing-linked__panel--state">
          <span className="mv-landing-linked__label">STATE</span>
          <dl>
            <div>
              <dt>low</dt>
              <dd>0</dd>
            </div>
            <div className="is-active">
              <dt>mid</dt>
              <dd>3</dd>
            </div>
            <div>
              <dt>high</dt>
              <dd>6</dd>
            </div>
          </dl>
        </section>
      </div>
    </div>
  );
}

export function LandingPage({
  appEdition,
  isDark,
  onToggleTheme,
  onStart,
  onOpenTemplates,
}: LandingPageProps) {
  return (
    <div className="mv-landing" id="top">
      <header className="mv-landing-header">
        <div className="mv-landing-container mv-landing-header__inner">
          <a className="mv-landing-brand" href="#top" aria-label="MetaView 首页">
            <span className="mv-brand-strip" />
            <span className="mv-brand-copy">
              <span className="mv-brand-name">MetaView</span>
              <span className="mv-brand-meta">THEORETICAL CANVAS</span>
            </span>
          </a>

          <nav className="mv-landing-nav" aria-label="官网导航">
            <a href="#process">工作原理</a>
            <a href="#capabilities">产品能力</a>
            <a href="#cases">案例</a>
          </nav>

          <div className="mv-landing-header__actions">
            <button
              className="mv-landing-theme"
              type="button"
              onClick={onToggleTheme}
              aria-label="切换主题"
              title="切换主题"
            >
              {isDark ? <SunIcon /> : <MoonIcon />}
            </button>
            <button className="mv-landing-button mv-landing-button--compact" type="button" onClick={onStart}>
              {appEdition === "ops" ? "进入 MetaView" : "打开工作台"}
              <ArrowIcon />
            </button>
          </div>
        </div>
      </header>

      <main>
        <section className="mv-landing-hero">
          <MetaParticleField
            variant="canvas"
            className="mv-landing-hero__field mv-motion-decorative"
          />
          <div className="mv-landing-container mv-landing-hero__grid">
            <div className="mv-landing-hero__copy">
              <div className="mv-landing-eyebrow">
                <span>AI-NATIVE EDUCATIONAL VISUALIZATION</span>
                <i aria-hidden="true" />
                <span>V2</span>
              </div>
              <h1>
                让每一个
                <span>理解过程</span>
                都能被看见
              </h1>
              <p>
                MetaView 把一道题转化为可播放、可追问、可调整并可导出的分步讲解。
                从教学规划到导演编排，再到交互式画布，每一步都有结构。
              </p>
              <div className="mv-landing-hero__actions">
                <button className="mv-landing-button mv-landing-button--primary" type="button" onClick={onStart}>
                  开始生成讲解
                  <ArrowIcon />
                </button>
                <a className="mv-landing-button mv-landing-button--secondary" href="#process">
                  查看生成过程
                </a>
              </div>
              <div className="mv-landing-subjects" aria-label="支持领域">
                <span>覆盖</span>
                {SUBJECTS.map((subject) => (
                  <i key={subject}>{subject}</i>
                ))}
              </div>
            </div>

            <div className="mv-landing-hero__visual">
              <HeroCanvas />
              <div className="mv-landing-hero__caption">
                <span>CONCEPT PREVIEW</span>
                <p>教学目标、画面对象与导演焦点在同一条生成链中保持一致。</p>
              </div>
            </div>
          </div>
        </section>

        <section className="mv-landing-section mv-landing-process" id="process">
          <div className="mv-landing-container">
            <header className="mv-landing-section__head">
              <div className="mv-landing-kicker">FROM ANSWER TO UNDERSTANDING</div>
              <h2>不是把答案搬进视频，而是生成理解发生的过程</h2>
              <p>
                MetaView 先建立教学结构，再决定画面和节奏。每一层都有明确职责，也能被检查、回放和继续修改。
              </p>
            </header>

            <div className="mv-landing-process__rail">
              {PROCESS_STEPS.map((step) => (
                <article key={step.index} className="mv-landing-process__step">
                  <div className="mv-landing-process__index">
                    <span>{step.index}</span>
                    <i aria-hidden="true" />
                  </div>
                  <div className="mv-landing-process__content">
                    <span>{step.label}</span>
                    <h3>{step.title}</h3>
                    <p>{step.description}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="mv-landing-section mv-landing-capabilities" id="capabilities">
          <div className="mv-landing-container mv-landing-capabilities__grid">
            <div className="mv-landing-capabilities__copy">
              <div className="mv-landing-kicker">ONE LEARNING FOCUS</div>
              <h2>动画、代码、时间线与数据状态，不再彼此割裂</h2>
              <p>
                学习者看到的不是四块独立信息，而是同一个推理步骤在不同视图中的同步表达。
              </p>

              <div className="mv-landing-principles">
                {PRINCIPLES.map((item) => (
                  <article key={item.marker}>
                    <span>{item.marker}</span>
                    <div>
                      <h3>{item.title}</h3>
                      <p>{item.description}</p>
                    </div>
                  </article>
                ))}
              </div>
            </div>

            <LinkedExplorer />
          </div>
        </section>

        <section className="mv-landing-section mv-landing-cases" id="cases">
          <div className="mv-landing-container">
            <header className="mv-landing-section__head mv-landing-section__head--split">
              <div>
                <div className="mv-landing-kicker">SELECTED CASES</div>
                <h2>真实案例将在这里出现</h2>
              </div>
              <p>
                该区域只接入已经通过线上播放、移动端和导出验收的案例，不使用仅存在于 Benchmark
                中的结果冒充产品能力。
              </p>
            </header>

            <div className="mv-landing-case-grid" aria-label="案例展示预留区域">
              {[1, 2, 3].map((slot) => (
                <article key={slot} className="mv-landing-case-slot">
                  <div className="mv-landing-case-slot__visual" aria-hidden="true">
                    <span>CASE SLOT {String(slot).padStart(2, "0")}</span>
                    <i />
                    <i />
                    <i />
                  </div>
                  <div className="mv-landing-case-slot__meta">
                    <span>待接入真实案例</span>
                    <p>标题、学科、预览画面与可播放入口将在 Gold Case 完成产品化后补充。</p>
                  </div>
                </article>
              ))}
            </div>

            <div className="mv-landing-cases__foot">
              <span>案例内容暂时留空，但展示结构已经固定。</span>
              <button type="button" onClick={onOpenTemplates}>
                查看现有模板结构
                <ArrowIcon />
              </button>
            </div>
          </div>
        </section>

        <section className="mv-landing-section mv-landing-architecture">
          <div className="mv-landing-container mv-landing-architecture__grid">
            <div>
              <div className="mv-landing-kicker">VISIBLE SYSTEM</div>
              <h2>一条可以解释、验证和持续演进的生成链</h2>
              <p>
                内容、导演和渲染不是混在一个 Prompt 里的黑盒。它们通过独立契约连接，使能力边界、
                质量评测和后续编辑都更清楚。
              </p>
            </div>

            <div className="mv-landing-pipeline" aria-label="MetaView 核心生成链">
              {[
                ["INPUT", "题目 / 代码"],
                ["LESSON PLAN", "目标与教学弧线"],
                ["PLAYBOOK", "内容与场景对象"],
                ["DIRECTOR", "镜头、焦点与节奏"],
                ["RENDER PLAN", "预览与视频导出"],
              ].map(([label, value], index, rows) => (
                <div key={label} className="mv-landing-pipeline__row">
                  <span>{label}</span>
                  <strong>{value}</strong>
                  {index < rows.length - 1 && <i aria-hidden="true">↓</i>}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mv-landing-final">
          <div className="mv-landing-container mv-landing-final__inner">
            <div>
              <span>START WITH A QUESTION</span>
              <h2>把下一道题，变成可见的理解过程</h2>
            </div>
            <button className="mv-landing-button mv-landing-button--primary" type="button" onClick={onStart}>
              进入 MetaView
              <ArrowIcon />
            </button>
          </div>
        </section>
      </main>

      <footer className="mv-landing-footer">
        <div className="mv-landing-container mv-landing-footer__inner">
          <div className="mv-landing-brand">
            <span className="mv-brand-strip" />
            <span>
              <strong>MetaView</strong>
              <small>THEORETICAL CANVAS</small>
            </span>
          </div>
          <p>让知识不只被展示，而是被演绎。</p>
          <div>
            <a href="https://github.com/jry21223/MetaView" target="_blank" rel="noreferrer">
              GitHub
            </a>
            <button type="button" onClick={onStart}>工作台</button>
          </div>
        </div>
      </footer>
    </div>
  );
}
