import { useState } from "react";

interface ShowcasePosterProps {
  src: string;
  alt: string;
  className?: string;
}

export function ShowcasePoster({ src, alt, className = "" }: ShowcasePosterProps) {
  const [failed, setFailed] = useState(false);
  return (
    <div className={`mv-showcase-poster ${className}`.trim()}>
      {failed ? (
        <div className="mv-showcase-poster__fallback" role="img" aria-label={`${alt}预览暂不可用`}>
          <span aria-hidden="true">画布预览</span>
          <small>静态案例仍可打开</small>
        </div>
      ) : (
        <img src={src} alt={alt} onError={() => setFailed(true)} />
      )}
    </div>
  );
}
