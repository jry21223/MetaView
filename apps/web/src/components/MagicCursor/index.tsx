import { useEffect, useState } from 'react';
import './styles.css';

export const MagicCursor = () => {
  // 虽然这个变量不直接显示，但它迫使 React 在鼠标移动时重新渲染，确保变量更新
  const [, setPosition] = useState({ x: 0, y: 0 });

// 优化后的逻辑片段
  useEffect(() => {
    let rafId: number;
    const update = (e: MouseEvent) => {
      rafId = requestAnimationFrame(() => {
        document.documentElement.style.setProperty('--mx', e.clientX + 'px');
        document.documentElement.style.setProperty('--my', e.clientY + 'px');
      });
    };
    window.addEventListener('mousemove', update);
    return () => {
      window.removeEventListener('mousemove', update);
      cancelAnimationFrame(rafId);
    };
  }, []);

  return (
    <div className="magic-cursor-wrapper">
      <div className="magic-cursor-dot" />
      <div className="magic-cursor-ring" />
    </div>
  );
};
