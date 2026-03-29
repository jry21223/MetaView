import { useEffect } from 'react';
import './styles.css';

/**
 * 魔法光标组件 - 演示版本
 * 创建一个跟随鼠标的光标效果，包含一个点和一个光环
 * 不影响原有布局和配色
 */
export const MagicCursor = () => {
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