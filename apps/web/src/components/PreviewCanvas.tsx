import { useEffect, useRef } from "react";

import type { CirDocument } from "../types";

interface PreviewCanvasProps {
  cir: CirDocument | null;
}

function tokenColor(emphasis: string) {
  if (emphasis === "primary") {
    return "#0f766e";
  }
  if (emphasis === "accent") {
    return "#c2410c";
  }
  return "#334155";
}

export function PreviewCanvas({ cir }: PreviewCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);

    const background = context.createLinearGradient(0, 0, width, height);
    background.addColorStop(0, "#fffdf6");
    background.addColorStop(1, "#eef6ff");
    context.fillStyle = background;
    context.fillRect(0, 0, width, height);

    if (!cir) {
      context.fillStyle = "#0f172a";
      context.font = "600 28px 'IBM Plex Sans', 'PingFang SC', sans-serif";
      context.fillText("等待生成 CIR 草案", 32, 56);
      context.fillStyle = "#475569";
      context.font = "18px 'IBM Plex Sans', 'PingFang SC', sans-serif";
      context.fillText("提交题目后，这里会渲染每一步的实体与叙事结构。", 32, 92);
      return;
    }

    context.fillStyle = "#0f172a";
    context.font = "700 26px 'IBM Plex Sans', 'PingFang SC', sans-serif";
    context.fillText(cir.title, 32, 52);
    context.fillStyle = "#475569";
    context.font = "16px 'IBM Plex Sans', 'PingFang SC', sans-serif";
    context.fillText(cir.summary, 32, 80);

    cir.steps.forEach((step, index) => {
      const top = 120 + index * 138;
      context.fillStyle = "#ffffff";
      context.strokeStyle = "#d7e3f4";
      context.lineWidth = 1.5;
      context.beginPath();
      context.roundRect(28, top, width - 56, 110, 18);
      context.fill();
      context.stroke();

      context.fillStyle = "#0f172a";
      context.font = "600 18px 'IBM Plex Sans', 'PingFang SC', sans-serif";
      context.fillText(`${index + 1}. ${step.title}`, 48, top + 30);

      context.fillStyle = "#475569";
      context.font = "15px 'IBM Plex Sans', 'PingFang SC', sans-serif";
      context.fillText(step.narration, 48, top + 56);

      let tokenLeft = 48;
      step.tokens.forEach((token) => {
        const fill = tokenColor(token.emphasis);
        context.fillStyle = `${fill}18`;
        context.strokeStyle = `${fill}55`;
        context.beginPath();
        context.roundRect(tokenLeft, top + 70, 122, 26, 13);
        context.fill();
        context.stroke();

        context.fillStyle = fill;
        context.font = "600 13px 'IBM Plex Mono', monospace";
        context.fillText(`${token.label}: ${token.value ?? token.label}`, tokenLeft + 10, top + 87);
        tokenLeft += 132;
      });
    });
  }, [cir]);

  return <canvas className="preview-canvas" ref={canvasRef} />;
}

