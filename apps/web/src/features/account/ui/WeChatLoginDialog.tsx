import { useState } from "react";
import { fetchWeChatLoginUrl } from "../api/accountApi";

interface WeChatLoginDialogProps {
  onClose: () => void;
}

/** A small guest-only dialog. Unlike RechargeModal it never reads protected account data. */
export function WeChatLoginDialog({ onClose }: WeChatLoginDialogProps) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const login = async () => {
    setLoading(true);
    setError(null);
    try {
      window.location.assign(await fetchWeChatLoginUrl());
    } catch (err) {
      setError(err instanceof Error ? err.message : "微信登录暂不可用");
      setLoading(false);
    }
  };

  return (
    <div className="mv-account-modal-backdrop" onMouseDown={onClose}>
      <section
        className="mv-account-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mv-wechat-login-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="mv-account-modal__head">
          <div>
            <div className="mv-account-modal__title" id="mv-wechat-login-title">微信登录后继续</div>
            <div className="mv-account-modal__sub">登录后即可发起生成、查看任务历史和使用平台服务。</div>
          </div>
          <button className="mv-icon-btn" type="button" aria-label="关闭登录" onClick={onClose}>×</button>
        </div>
        <div className="mv-account-actions">
          <button className="mv-chip mv-chip-primary" type="button" disabled={loading} onClick={() => void login()}>
            {loading ? "正在跳转…" : "微信登录"}
          </button>
        </div>
        {error && <div className="mv-account-error" role="alert">{error}</div>}
      </section>
    </div>
  );
}
