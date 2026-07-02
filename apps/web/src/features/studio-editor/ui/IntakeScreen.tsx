import { useRef, useState } from "react";
import { MetaParticleField } from "../../../shared/ui/MetaParticleField";

type IntakeDomain =
  | "algorithm"
  | "math"
  | "code"
  | "physics"
  | "chemistry"
  | "biology"
  | "geography";

type IntakeTemplate =
  | "math-problem"
  | "algorithm-code"
  | "physics-problem"
  | "chemistry-stoichiometry";

const UNSUPPORTED_FILE_WARNING =
  "当前只支持上传代码文件。图片、PDF、课件暂未接入生成管线。";

const TEMPLATE_GALLERY: Array<{
  id: IntakeTemplate;
  domain: IntakeDomain | null;
  title: string;
  desc: string;
  prompt: string;
  icon: "math" | "code" | "physics" | "chemistry";
}> = [
  {
    id: "math-problem",
    domain: "math",
    title: "数学题",
    desc: "函数、极限、积分、公式推导",
    prompt: "生成一个数学题讲解：用步骤和图像解释函数、极限、积分或公式推导。",
    icon: "math",
  },
  {
    id: "algorithm-code",
    domain: "algorithm",
    title: "算法代码",
    desc: "排序、指针、变量变化、代码同步",
    prompt: "生成一个算法代码讲解：展示代码同步高亮、变量变化和指针移动。",
    icon: "code",
  },
  {
    id: "physics-problem",
    domain: "physics",
    title: "物理题",
    desc: "受力、运动、能量过程",
    prompt: "生成一个物理题讲解：展示受力、运动过程或能量变化。",
    icon: "physics",
  },
  {
    id: "chemistry-stoichiometry",
    domain: "chemistry",
    title: "化学计量",
    desc: "配平、物质的量、反应比例关系",
    prompt: "生成一个化学计量题讲解：展示方程式配平、物质的量换算和反应比例推导。",
    icon: "chemistry",
  },
];

export interface IntakeContext {
  domain: IntakeDomain | null;
  template: IntakeTemplate | "freeform";
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

function Icon({ kind }: { kind: (typeof TEMPLATE_GALLERY)[number]["icon"] }) {
  if (kind === "code") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
        <path d="m8 9-4 3 4 3" />
        <path d="m16 9 4 3-4 3" />
        <path d="m14 5-4 14" />
      </svg>
    );
  }
  if (kind === "physics") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
        <path d="M4 18h16" />
        <path d="M7 18 17 6" />
        <path d="m14 6 3 0 0 3" />
        <circle cx="9" cy="15" r="2" />
      </svg>
    );
  }
  if (kind === "chemistry") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
        <path d="M9 3h6" />
        <path d="M10 3v5l-4.8 8.3A3.2 3.2 0 0 0 8 21h8a3.2 3.2 0 0 0 2.8-4.7L14 8V3" />
        <path d="M7.5 16h9" />
        <circle cx="10" cy="18" r="0.8" />
        <circle cx="14" cy="18" r="0.8" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
      <path d="M4 18c4-10 8-10 12 0" />
      <path d="M4 6h16" />
      <path d="M6 14h12" />
    </svg>
  );
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
  const fileRef = useRef<HTMLInputElement>(null);
  const pending = isSubmitting || Boolean(thinking);

  const handleFiles = (list: FileList | null) => {
    if (!list) return;
    const arr = Array.from(list);
    const supported = arr.filter((file) => languageFromName(file.name));
    const unsupportedCount = arr.length - supported.length;

    setFileWarning(unsupportedCount > 0 ? UNSUPPORTED_FILE_WARNING : null);
    if (supported.length === 0) return;

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

    const domain = inferDomain(input, codeFile);
    setThinking("提交中…");

    try {
      await onSubmit({
        domain,
        template: "freeform",
        title: input.trim().slice(0, 40) || codeFile?.name || "未命名",
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

  const pickTemplate = (tpl: (typeof TEMPLATE_GALLERY)[number]) => {
    if (pending) return;
    void Promise.resolve(onSubmit({
      domain: tpl.domain,
      template: tpl.id,
      title: tpl.title,
      raw: tpl.prompt,
      files: [],
    })).catch(() => undefined);
  };

  return (
    <main className="mv-intake-body">
      <section className="mv-intake-hero" aria-label="MetaView intake">
        <div className="mv-intake-hero-visual">
          <MetaParticleField variant="canvas" className="mv-motion-decorative" />
        </div>
        <div className="mv-eyebrow-mini">THEORETICAL CANVAS / 学习过程可视化</div>
        <h1 className="mv-intake-title">输入题目或代码，生成可播放的分步讲解</h1>
        <p className="mv-intake-sub">
          支持数学、算法、物理和代码追踪；生成后可继续追问修改，也可导出视频。
        </p>
      </section>

      <section className="mv-intake-composer" aria-label="生成输入">
        {files.length > 0 && (
          <div className="mv-intake-files">
            {files.map((f, i) => (
              <div key={`${f.name}-${i}`} className="mv-intake-file">
                <span className="mv-file-name">{f.name}</span>
                <button type="button" onClick={() => removeFile(i)}>
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
          rows={4}
          placeholder="输入一道数学题、物理题，或粘贴一段算法/代码..."
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            const el = e.target;
            el.style.height = "auto";
            el.style.height = `${el.scrollHeight}px`;
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void submit();
            }
          }}
          style={{ resize: "none", overflow: "hidden", minHeight: 108 }}
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
              <span>代码文件</span>
            </button>
            <input
              ref={fileRef}
              type="file"
              multiple
              accept={CODE_ACCEPT}
              style={{ display: "none" }}
              onChange={(e) => {
                handleFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <span className="mv-intake-hint">支持代码片段和代码文件</span>
          </div>

          <div className="mv-intake-submitrow">
            {thinking && <span className="mv-intake-thinking">{thinking}</span>}
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

      <section className="mv-intake-templates" aria-label="常用模板">
        {TEMPLATE_GALLERY.map((tpl) => (
          <button
            key={tpl.id}
            className="mv-tpl-card"
            type="button"
            disabled={pending}
            onClick={() => pickTemplate(tpl)}
          >
            <span className="mv-tpl-head">
              <span className="mv-tpl-title">{tpl.title}</span>
              <Icon kind={tpl.icon} />
            </span>
            <span className="mv-tpl-desc">{tpl.desc}</span>
          </button>
        ))}
      </section>
    </main>
  );
}
