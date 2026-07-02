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

const UNSUPPORTED_FILE_WARNING =
  "当前只支持上传代码文件。图片、PDF、课件暂未接入生成管线。";

/** One-line example prompts under the composer; the full gallery lives on the 模板 page. */
const EXAMPLE_PROMPTS: Array<{
  id: string;
  domain: IntakeDomain;
  label: string;
  prompt: string;
}> = [
  {
    id: "binary-search",
    domain: "algorithm",
    label: "二分查找",
    prompt: "生成一个算法讲解：演示二分查找的指针移动和区间收缩过程。",
  },
  {
    id: "projectile-motion",
    domain: "physics",
    label: "抛体运动",
    prompt: "生成一个物理题讲解：演示抛体运动的受力分析、速度分解和轨迹。",
  },
  {
    id: "balance-equation",
    domain: "chemistry",
    label: "配平方程",
    prompt: "生成一个化学讲解：演示化学方程式配平和物质的量换算。",
  },
  {
    id: "mendel-genetics",
    domain: "biology",
    label: "孟德尔遗传",
    prompt: "生成一个生物讲解：演示孟德尔豌豆杂交实验的显隐性遗传规律。",
  },
];

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

  const pickExample = (example: (typeof EXAMPLE_PROMPTS)[number]) => {
    if (pending) return;
    void Promise.resolve(onSubmit({
      domain: example.domain,
      template: example.id,
      title: example.label,
      raw: example.prompt,
      files: [],
    })).catch(() => undefined);
  };

  return (
    <main className="mv-intake-body">
      <section className="mv-intake-hero" aria-label="MetaView intake">
        <div className="mv-intake-hero-visual">
          <MetaParticleField variant="canvas" className="mv-motion-decorative" />
        </div>
        <h1 className="mv-intake-title">输入题目或代码，生成可播放的分步讲解</h1>
        <p className="mv-intake-sub">
          覆盖数学、物理、化学、生物、地理与算法代码；生成后可继续追问，也可导出视频。
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
          style={{ resize: "none", overflow: "hidden", minHeight: 132 }}
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

      <section className="mv-intake-examples" aria-label="示例题目">
        <span className="mv-intake-examples__label">试试：</span>
        {EXAMPLE_PROMPTS.map((example) => (
          <button
            key={example.id}
            className="mv-chip mv-intake-example"
            type="button"
            disabled={pending}
            onClick={() => pickExample(example)}
          >
            {example.label}
          </button>
        ))}
      </section>
    </main>
  );
}
