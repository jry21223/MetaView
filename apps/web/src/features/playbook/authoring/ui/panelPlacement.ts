interface Size { width: number; height: number }
interface Anchor { left: number; right: number; centerY: number }

interface HorizontalExtent { left: number; right: number }
interface NodeBounds extends HorizontalExtent { top: number; bottom: number }

// A segment can end at the near rim of a node. The note must clear its far rim.
export function includeEndNodes(edge: HorizontalExtent, ends: { x: number; y: number }[], nodes: NodeBounds[]) {
  let { left, right } = edge;
  for (const node of nodes) {
    if (ends.some((p) => p.x >= node.left && p.x <= node.right && p.y >= node.top && p.y <= node.bottom)) {
      left = Math.min(left, node.left);
      right = Math.max(right, node.right);
    }
  }
  return { left, right };
}

export function placePanel(paper: Size, note: Size, anchor: Anchor) {
  const margin = 16;
  const gap = 28;
  const clamp = (value: number, available: number) => Math.max(margin, Math.min(value, available - margin));
  const right = anchor.right + gap;
  const left = anchor.left - gap - note.width;
  const x = right + note.width <= paper.width - margin || left < margin ? right : left;
  return { x: clamp(x, paper.width - note.width), y: clamp(anchor.centerY - note.height / 2, paper.height - note.height) };
}
