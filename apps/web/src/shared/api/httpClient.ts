import { API_BASE_URL } from "../config/constants";

export { API_BASE_URL };

export async function readErrorMessage(response: Response, fallback: string): Promise<string> {
  if (response.status === 413) {
    return "提交内容过大，已被网关拒绝。请缩小图片体积，或联系管理员提高请求体限制。";
  }

  let body = "";
  try {
    body = (await response.text()).trim();
  } catch {
    // ignore
  }

  if (body.length > 0) {
    try {
      const payload = JSON.parse(body) as {
        detail?: string;
        error_id?: string;
        error_type?: string;
        log_hint?: string;
        message?: string;
      };
      const parts: string[] = [];
      if (typeof payload.detail === "string" && payload.detail.length > 0) {
        parts.push(payload.detail);
      } else if (typeof payload.message === "string" && payload.message.length > 0) {
        parts.push(payload.message);
      }
      if (typeof payload.error_type === "string" && payload.error_type.length > 0) {
        parts.push(`错误类型: ${payload.error_type}`);
      }
      if (typeof payload.error_id === "string" && payload.error_id.length > 0) {
        parts.push(`错误 ID: ${payload.error_id}`);
      }
      if (typeof payload.log_hint === "string" && payload.log_hint.length > 0) {
        parts.push(payload.log_hint);
      }
      if (parts.length > 0) return parts.join("\n");
    } catch {
      return `${fallback} (${response.status})\n${body.slice(0, 1200)}`;
    }
  }

  return `${fallback} with status ${response.status}`;
}
