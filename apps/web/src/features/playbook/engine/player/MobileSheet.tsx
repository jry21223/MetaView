import React, { useEffect } from "react";

const CloseSVG = () => (
  <svg
    width="15"
    height="15"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </svg>
);

interface MobileSheetProps {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}

export function MobileSheet({ title, children, onClose }: MobileSheetProps) {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="playbook-player__mobile-sheet" role="dialog" aria-modal="true" aria-label={title}>
      <button
        type="button"
        className="playbook-player__mobile-sheet-backdrop"
        aria-label="关闭面板"
        onClick={onClose}
      />
      <div className="playbook-player__mobile-sheet-panel">
        <div className="playbook-player__mobile-sheet-head">
          <strong>{title}</strong>
          <button type="button" className="playbook-player__mobile-icon-btn" onClick={onClose} aria-label="关闭面板">
            <CloseSVG />
          </button>
        </div>
        <div className="playbook-player__mobile-sheet-body">{children}</div>
      </div>
    </div>
  );
}
