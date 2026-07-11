import { useRef, useState } from "react";

type IntakeDomain =
  | "algorithm"
  | "math"
  | "code"
  | "physics"
  | "chemistry"
  | "biology"
  | "geography";

const UNSUPPORTED_FILE_WARNING =
  "当前只支持上传代码文件。图片、PDF、课件暂未接入生成管线。";

/** One-line example prompts under the composer; the full gallery lives on the 模板 page. */
const EXAMPLE_PROMPTS: Array<{
  id: string;
  domain: IntakeDomain;
  label: string;
  meta: string;
  prompt: string;
}> = [
  {
    id: "binary-search",
    domain: "algorithm",
    label: "二分查找",
    meta: "指针 · 区间 · 代码行",
    prompt: "生成一个算法讲解：演示二分查找的指针移动和区间收缩过程。",
  },
  {
    id: "projectile-motion",
    domain: "physics",
    label: "抛体运动",
    meta: "受力 · 速度 · 轨迹",
    prompt: "生成一个物理题讲解：演示抛体运动的受力分析、速度分解和轨迹。",
  },
  {
    id: "balance-equation",
    domain: "chemistry",
    label: "配平方程",
    meta: "方程式 · 物质的量",
    prompt: "生成一个化学讲解：演示化学方程式配平和物质的量换算。",
  },
  {
    id: "mendel-genetics",
    domain: "biology",
    label: "孟德尔遗传",
    meta: "性状 · 概率 · 遗传图",
    prompt: "生成一个生物讲解：演示孟德尔豌豆杂交实验的显隐性遗传规律。",
  },
];

const DOMAIN_LABELS: Record<IntakeDomain, string> = {
  algorithm: "算法",
  math: "数学",
  code: "代码",
  physics: "物理",
  chemistry: "化学",
  biology: "生物",
  geography: "地理",
};

const GENERATION_PATH = [
  { index: "01", label: "理解题意", contract: "COVERAGE" },
  { index: "02", label: "规划讲解", contract: "LESSON PLAN" },
  { index: "03", label: "构建画面", contract: "PLAYBOOK" },
  { index: "04", label: "编排播放", contract: "DIRECTOR" },
] as const;

export interface IntakeContext {
  domain: IntakeDomain | null;
  template: string;
  title: string;
  raw: string;
  files: Array<{ name: string; size: number }>;
  sourceCode?: string;
  language?: string;
}

interface IntakeScreenProps {
  onSubmit: (ctx: IntakeContext) => void | Promise<void>;
  isSubmitting?: boolean;
  submitError?: string | null;
  /** Seeds the composer once on mount (e.g. editing a failed run's prompt). */
  initialPrompt?: string;
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

const EXT_TO_LANGUAGE: Record<string, string> = {
  ".py": "python",
  ".js": "javascript",
  ".ts": "typescript",
  ".tsx": "typescript",
  ".jsx": "javascript",
  ".java": "java",
  ".cpp": "cpp",
  ".cc": "cpp",
  ".cxx": "cpp",
  ".c": "c",
  ".h": "c",
  ".hpp": "cpp",
  ".cs": "csharp",
  ".go": "go",
  ".rs": "rust",
  ".rb": "ruby",
  ".swift": "swift",
  ".kt": "kotlin",
  ".kts": "kotlin",
  ".php": "php",
  ".r": "r",
  ".m": "objc",
  ".sh": "bash",
  ".bash": "bash",
  ".zsh": "bash",
  ".sql": "sql",
  ".html": "html",
  ".css": "css",
  ".json": "json",
  ".yaml": "yaml",
  ".yml": "yaml",
};

const CODE_ACCEPT = Object.keys(EXT_TO_LANGUAGE).join(",");

function languageFromName(name: string): string | undefined {
  const dotIndex = name.lastIndexOf(".");
  if (dotIndex < 0) return undefined;
  const ext = name.slice(dotIndex).toLowerCase();
  return EXT_TO_LANGUAGE[ext];
}

function inferDomain(raw: string, codeFile?: File): IntakeDomain | null {
  // Hint-only heuristic: a null result never blocks submission — the
  // backend topic router owns the final domain decision.
  if (codeFile) return "code";

  const text = raw.toLowerCase();
  if (
    text.includes("排序") ||
    text.includes("算法") ||
    text.includes("二分") ||
    text.includes("递归") ||
    text.includes("search") ||
    text.includes("pointer") ||
    text.includes("array") ||
    text.includes("function ") ||
    text.includes("def ") ||
    text.includes("class ")
  ) {
    return "algorithm";
  }
  if (
    raw.includes("微分") ||
    raw.includes("积分") ||
    raw.includes("极限") ||
    raw.includes("函数") ||
    raw.includes("导数") ||
    raw.includes("方程") ||
    raw.includes("傅里叶")
  ) {
    return "math";
  }
  if (
    raw.includes("斜面") ||
    raw.includes("物理") ||
    raw.includes("受力") ||
    raw.includes("速度") ||
    raw.includes("加速度") ||
    raw.includes("能量") ||
    raw.includes("力")
  ) {
    return "physics";
  }
  if (
    raw.includes("化学") ||
    raw.includes("配平") ||
    raw.includes("物质的量") ||
    raw.includes("摩尔") ||
    raw.includes("反应") ||
    text.includes("stoichiometry") ||
    text.includes("mole")
  ) {
    return "chemistry";
  }
  return null;
}

export function IntakeScreen({
  onSubmit,
  isSubmitting = false,
  submitError = null,
  initialPrompt = "",
}: IntakeScreenProps) {
  const [input, setInput] = useState(initialPrompt);
  const [files, setFiles] = useState<Array<{ name: string; size: number }>>([]);
  const [fileObjects, setFileObjects] = useState<File[]>([]);
  const [fileWarning, setFileWarning] = useState<string | null>(null);
  const [thinking, setThinking] = useState("");
  const [selectedExample, setSelectedExample] = useState<
    (typeof EXAMPLE_PROMPTS)[number] | null
  >(null);
  const [dragActive, setDragActive] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const pending = isSubmitting || Boolean(thinking);
  const attachedCodeFile = fileObjects.find((file) => languageFromName(file.name));
  const inferredDomain = attachedCodeFile
    ? "code"
    : selectedExample?.domain ?? inferDomain(input);

  const handleFiles = (list: FileList | null) => {
    if (!list) return;
    const arr = Array.from(list);
    const supported = arr.filter((file) => languageFromName(file.name));
    const unsupportedCount = arr.length - supported.length;

    setFileWarning(unsupportedCount > 0 ? UNSUPPORTED_FILE_WARNING : null);
    if (supported.length === 0) return;

    setSelectedExample(null);
    setFileObjects((prev) => [...prev, ...supported]);
    setFiles((prev) => [
      ...prev,
      ...supported.map((f) => ({ name: f.name, size: f.size })),
    ]);
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
    setFileObjects((prev) => prev.filter((_, i) => i !== index));
  };

  const submit = async () => {
    if (!input.trim() && files.length === 0) return;

    setThinking("正在理解题目…");
    const codeFile = fileObjects.find((f) => languageFromName(f.name));
    let sourceCode: string | undefined;
    let language: string | undefined;

    if (codeFile) {
      try {
        sourceCode = await readFileAsText(codeFile);
        language = languageFromName(codeFile.name);
      } catch {
        sourceCode = undefined;
        language = undefined;
      }
    }

    const domain = codeFile
      ? "code"
      : selectedExample?.domain ?? inferDomain(input);
    setThinking("提交中…");

    try {
      await onSubmit({
        domain,
        template: selectedExample?.id ?? "freeform",
        title:
          selectedExample?.label ||
          input.trim().slice(0, 40) ||
          codeFile?.name ||
          "未命名",
        raw: input,
        files,
        sourceCode,
        language,
      });
    } catch {
      // The shell exposes the submission error through submitError; stay on intake.
    } finally {
      setThinking("");
    }
  };

  const pickExample = (example: (typeof EXAMPLE_PROMPTS)[number]) => {
    if (pending) return;
    setInput(example.prompt);
    setSelectedExample(example);
    setFileWarning(null);
  };

  return (
    <main className="mv-intake-body">
      <div className="mv-intake-shell">
        <header className="mv-intake-hero" aria-label="MetaView intake">
          <div>
            <p className="mv-intake-kicker">
              <span aria-hidden="true" /> NEW VISUAL LESSON / 01
            </p>
            <h1 className="mv-intake-title">新建可视化讲解</h1>
            <p className="mv-intake-sub">
              输入一道题或一段代码，MetaView 会把它组织成可播放的分步画面。
            </p>
          </div>
          <div className="mv-intake-outcomes" aria-label="讲解输出能力">
            <span>可播放</span>
            <span>可追问</span>
            <span>可导出</span>
          </div>
        </header>

        <div className="mv-intake-layout">
          <section
            className={`mv-intake-composer${dragActive ? " is-dragging" : ""}`}
            aria-label="生成输入"
            onDragEnter={(event) => {
              event.preventDefault();
              setDragActive(true);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragActive(false);
              handleFiles(event.dataTransfer.files);
            }}
          >
            <div className="mv-intake-composer__head">
              <div>
                <span>INPUT / 题目与代码</span>
                <strong>从一道题或一段代码开始</strong>
              </div>
              <div
                className={`mv-intake-domain-hint${inferredDomain ? " is-ready" : ""}`}
                title="仅作输入提示，最终学科由生成管线判断"
              >
                <span>领域提示</span>
                <strong>{inferredDomain ? DOMAIN_LABELS[inferredDomain] : "等待输入"}</strong>
              </div>
            </div>

            {files.length > 0 && (
              <div className="mv-intake-files">
                {files.map((file, index) => (
                  <div key={`${file.name}-${index}`} className="mv-intake-file">
                    <span className="mv-file-name">{file.name}</span>
                    <button type="button" onClick={() => removeFile(index)}>
                      删除
                    </button>
                  </div>
                ))}
              </div>
            )}

            {(fileWarning || submitError) && (
              <div
                className={`mv-intake-warning${submitError ? " mv-intake-error" : ""}`}
                role="alert"
              >
                {submitError ?? fileWarning}
              </div>
            )}

            <textarea
              className="mv-intake-input"
              rows={7}
              placeholder="例如：解释导数的几何意义，并演示切线如何随割线逼近……"
              value={input}
              aria-describedby="mv-intake-file-help"
              onChange={(event) => {
                setInput(event.target.value);
                setSelectedExample(null);
                const element = event.target;
                element.style.height = "auto";
                element.style.height = `${element.scrollHeight}px`;
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  void submit();
                }
              }}
              style={{ resize: "none", overflow: "hidden", minHeight: 228 }}
            />

            <div className="mv-intake-actions">
              <div className="mv-intake-toolrow">
                <button
                  className="mv-intake-action mv-intake-attach"
                  type="button"
                  aria-label="上传代码文件"
                  title="上传代码文件"
                  onClick={() => fileRef.current?.click()}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                    <path d="M6 4h9l3 3v13H6z" />
                    <path d="M15 4v4h4" />
                    <path d="M9 13h6" />
                    <path d="M9 17h4" />
                  </svg>
                  <span>添加代码文件</span>
                </button>
                <span className="mv-intake-file-help" id="mv-intake-file-help">
                  或拖入 .py / .js / .java 等代码文件
                </span>
                <input
                  ref={fileRef}
                  type="file"
                  multiple
                  accept={CODE_ACCEPT}
                  style={{ display: "none" }}
                  onChange={(event) => {
                    handleFiles(event.target.files);
                    event.target.value = "";
                  }}
                />
              </div>

              <div className="mv-intake-submitrow">
                {thinking ? (
                  <span className="mv-intake-thinking" role="status" aria-live="polite">
                    {thinking}
                  </span>
                ) : (
                  <span className="mv-intake-count">{input.length} 字符 · ⌘ / Ctrl + Enter</span>
                )}
                <button
                  className="mv-send mv-intake-send"
                  type="button"
                  onClick={() => void submit()}
                  disabled={pending || (!input.trim() && files.length === 0)}
                >
                  生成讲解
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                    <path d="M5 12h14" />
                    <path d="m13 6 6 6-6 6" />
                  </svg>
                </button>
              </div>
            </div>
          </section>

          <aside className="mv-intake-guide" aria-label="生成路径与示例">
            <section className="mv-intake-path" aria-labelledby="mv-intake-path-title">
              <div className="mv-intake-guide__head">
                <span>GENERATION PATH</span>
                <h2 id="mv-intake-path-title">从题意到可播放画面</h2>
              </div>
              <ol>
                {GENERATION_PATH.map((step) => (
                  <li key={step.contract}>
                    <span>{step.index}</span>
                    <div>
                      <strong>{step.label}</strong>
                      <small>{step.contract}</small>
                    </div>
                  </li>
                ))}
              </ol>
            </section>

            <section className="mv-intake-examples" aria-label="示例题目">
              <div className="mv-intake-guide__head">
                <span>EXAMPLE STARTS</span>
                <h2>从一个可靠样例开始</h2>
                <p>点击填入，可继续修改。</p>
              </div>
              <div className="mv-intake-example-list">
                {EXAMPLE_PROMPTS.map((example, index) => (
                  <button
                    key={example.id}
                    className={`mv-intake-example${selectedExample?.id === example.id ? " is-selected" : ""}`}
                    type="button"
                    disabled={pending}
                    aria-pressed={selectedExample?.id === example.id}
                    onClick={() => pickExample(example)}
                  >
                    <span>{String(index + 1).padStart(2, "0")} / {DOMAIN_LABELS[example.domain]}</span>
                    <strong>{example.label}</strong>
                    <small>{example.meta}</small>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                      <path d="M5 12h14" />
                      <path d="m13 6 6 6-6 6" />
                    </svg>
                  </button>
                ))}
              </div>
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}
