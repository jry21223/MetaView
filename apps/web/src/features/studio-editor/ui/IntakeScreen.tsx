import { useLayoutEffect, useRef, useState } from "react";
import {
  CODE_FILE_ACCEPT,
  languageFromCodeFilename,
} from "../lib/codeFileLanguage";

const MAX_CODE_FILE_BYTES = 256 * 1024;
const TEXTAREA_MIN_HEIGHT = 168;
const TEXTAREA_MAX_HEIGHT = 320;

const EXAMPLE_PROMPTS = [
  {
    label: "导数与切线",
    prompt:
      "用动画解释导数的几何意义：曲线 y=x² 在点 (1,1) 处切线的斜率为什么是 2。",
  },
  {
    label: "二分查找",
    prompt:
      "演示在有序数组 [1,3,5,7,9,11] 里二分查找 7 的过程，标出 low/mid/high。",
  },
  {
    label: "抛体运动",
    prompt:
      "演示平抛运动：水平速度不变、竖直加速，画出抛物线轨迹和分速度矢量。",
  },
] as const;

export interface IntakeContext {
  prompt: string;
  sourceCode?: string;
  language?: string | null;
  sourceFilename?: string;
  sourceSizeBytes?: number;
}

interface IntakeScreenProps {
  onSubmit: (ctx: IntakeContext) => void | Promise<void>;
  isSubmitting?: boolean;
  submitError?: string | null;
  /** Seeds the composer once on mount (e.g. editing a failed run's prompt). */
  initialPrompt?: string;
}

type LocalSubmitStatus = "idle" | "reading-file" | "submitting";

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(reader.error ?? new Error("file read failed"));
    reader.onabort = () => reject(new Error("file read aborted"));
    reader.readAsText(file);
  });
}

function resizeTextarea(element: HTMLTextAreaElement) {
  element.style.height = `${TEXTAREA_MIN_HEIGHT}px`;
  const contentHeight = element.scrollHeight;
  const nextHeight = Math.min(
    Math.max(contentHeight, TEXTAREA_MIN_HEIGHT),
    TEXTAREA_MAX_HEIGHT,
  );
  element.style.height = `${nextHeight}px`;
  element.style.overflowY =
    contentHeight > TEXTAREA_MAX_HEIGHT ? "auto" : "hidden";
}

function fileSizeLabel(size: number): string {
  if (size < 1024) return `${size} B`;
  return `${Math.ceil(size / 1024)} KB`;
}

export function IntakeScreen({
  onSubmit,
  isSubmitting = false,
  submitError = null,
  initialPrompt = "",
}: IntakeScreenProps) {
  const [input, setInput] = useState(initialPrompt);
  const [attachment, setAttachment] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [submitStatus, setSubmitStatus] =
    useState<LocalSubmitStatus>("idle");
  const [dragActive, setDragActive] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const busyRef = useRef(false);
  const pending = isSubmitting || submitStatus !== "idle";

  useLayoutEffect(() => {
    if (textareaRef.current) resizeTextarea(textareaRef.current);
  }, []);

  const handleFiles = (list: FileList | File[] | null) => {
    if (!list || list.length === 0 || pending) return;
    const candidates = Array.from(list);

    if (candidates.length !== 1) {
      setFileError("一次只能上传一个代码文件。");
      return;
    }

    const nextFile = candidates[0];
    if (!languageFromCodeFilename(nextFile.name)) {
      setFileError("不支持该文件类型，请选择代码文件。");
      return;
    }
    if (nextFile.size > MAX_CODE_FILE_BYTES) {
      setFileError("代码文件不能超过 256 KB。");
      return;
    }

    setAttachment(nextFile);
    setFileError(null);
  };

  const removeFile = () => {
    if (pending) return;
    setAttachment(null);
    setFileError(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const submit = async () => {
    const prompt = input.trim();
    if ((!prompt && !attachment) || pending || busyRef.current) return;

    busyRef.current = true;
    setFileError(null);

    try {
      if (!attachment) {
        setSubmitStatus("submitting");
        await onSubmit({ prompt });
        return;
      }

      setSubmitStatus("reading-file");
      let sourceCode: string;
      try {
        sourceCode = await readFileAsText(attachment);
      } catch {
        setFileError("文件读取失败，请重新选择代码文件。");
        return;
      }

      setSubmitStatus("submitting");
      await onSubmit({
        prompt: prompt || `讲解 ${attachment.name} 中的代码。`,
        sourceCode,
        language: languageFromCodeFilename(attachment.name),
        sourceFilename: attachment.name,
        sourceSizeBytes: attachment.size,
      });
    } catch {
      // The shell exposes request failures through submitError; stay on intake.
    } finally {
      busyRef.current = false;
      setSubmitStatus("idle");
    }
  };

  const pickExample = (prompt: string) => {
    if (pending) return;
    setInput(prompt);
    setFileError(null);
    queueMicrotask(() => {
      if (textareaRef.current) resizeTextarea(textareaRef.current);
    });
  };

  const statusText = isSubmitting
    ? "正在提交…"
    : submitStatus === "reading-file"
      ? "正在读取代码文件…"
      : submitStatus === "submitting"
        ? "正在提交…"
        : null;

  return (
    <main className="mv-intake-body">
      <div className="mv-intake-shell">
        <header className="mv-intake-hero" aria-label="MetaView 创建讲解">
          <h1 className="mv-intake-title">新建可视化讲解</h1>
          <p className="mv-intake-sub">输入一道题、一个知识点，或粘贴代码。</p>
        </header>

        <div className="mv-intake-layout">
          <section
            className={`mv-intake-composer${dragActive ? " is-dragging" : ""}`}
            aria-label="生成输入"
            onDragEnter={(event) => {
              event.preventDefault();
              if (!pending) setDragActive(true);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              if (!pending) setDragActive(true);
            }}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node)) {
                setDragActive(false);
              }
            }}
            onDrop={(event) => {
              event.preventDefault();
              setDragActive(false);
              handleFiles(event.dataTransfer.files);
            }}
          >
            <textarea
              ref={textareaRef}
              className="mv-intake-input"
              rows={6}
              placeholder="例如：用动画解释导数的几何意义，并演示切线如何随割线逼近……"
              value={input}
              disabled={pending}
              onChange={(event) => {
                setInput(event.target.value);
                resizeTextarea(event.target);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  void submit();
                }
              }}
            />

            {attachment && (
              <div
                className="mv-intake-file"
                title={`${attachment.name} · ${fileSizeLabel(attachment.size)}`}
              >
                <span className="mv-file-name">{attachment.name}</span>
                <small>{fileSizeLabel(attachment.size)}</small>
                <button
                  className="mv-intake-file__remove"
                  type="button"
                  aria-label={`删除 ${attachment.name}`}
                  title="删除代码文件"
                  disabled={pending}
                  onClick={removeFile}
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    aria-hidden="true"
                  >
                    <path d="m7 7 10 10M17 7 7 17" />
                  </svg>
                </button>
              </div>
            )}

            {(fileError || submitError) && (
              <div className="mv-intake-warning" role="alert">
                {fileError ?? submitError}
              </div>
            )}

            <div className="mv-intake-actions">
              <div className="mv-intake-toolrow">
                <button
                  className="mv-intake-action mv-intake-attach"
                  type="button"
                  aria-label="上传代码文件"
                  title="上传一个代码文件，最大 256 KB"
                  disabled={pending}
                  onClick={() => fileRef.current?.click()}
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    aria-hidden="true"
                  >
                    <path d="M6 4h9l3 3v13H6z" />
                    <path d="M15 4v4h4M9 13h6M9 17h4" />
                  </svg>
                  <span>{attachment ? "替换代码文件" : "添加代码文件"}</span>
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept={CODE_FILE_ACCEPT}
                  disabled={pending}
                  hidden
                  onChange={(event) => {
                    handleFiles(event.target.files);
                    event.target.value = "";
                  }}
                />
              </div>

              <div className="mv-intake-submitrow">
                {statusText ? (
                  <span
                    className="mv-intake-thinking"
                    role="status"
                    aria-live="polite"
                  >
                    {statusText}
                  </span>
                ) : (
                  <span className="mv-intake-shortcut">⌘ / Ctrl + Enter</span>
                )}
                <button
                  className="mv-send mv-intake-send"
                  type="button"
                  onClick={() => void submit()}
                  disabled={pending || (!input.trim() && !attachment)}
                >
                  生成讲解
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    aria-hidden="true"
                  >
                    <path d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                </button>
              </div>
            </div>
          </section>

          <section className="mv-intake-examples" aria-labelledby="mv-intake-examples-title">
            <div className="mv-intake-example-head">
              <h2 id="mv-intake-examples-title">试试：</h2>
            </div>
            <div className="mv-intake-example-list">
              {EXAMPLE_PROMPTS.map((example) => (
                <button
                  key={example.label}
                  className="mv-intake-example"
                  type="button"
                  disabled={pending}
                  onClick={() => pickExample(example.prompt)}
                >
                  {example.label}
                </button>
              ))}
            </div>
            <a className="mv-intake-cases-link" href="/cases">
              查看精选案例
              <span aria-hidden="true">→</span>
            </a>
          </section>
        </div>
      </div>
    </main>
  );
}
