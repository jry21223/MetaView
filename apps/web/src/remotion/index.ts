import { registerRoot } from "remotion";
import "mafs/core.css";
import "mafs/font.css";
import "../index.css";
// Load KaTeX CSS at the bundle entry so the @font-face declarations register
// on frame 0 — without this the math glyphs are still invisible (KaTeX ships
// `font-display: block`) when the headless Chrome captures the first frames.
// Companion to the ``delayRender`` font-ready gate in ``RemotionRoot``.
import "katex/dist/katex.min.css";
import { RemotionRoot } from "./Root";

registerRoot(RemotionRoot);
