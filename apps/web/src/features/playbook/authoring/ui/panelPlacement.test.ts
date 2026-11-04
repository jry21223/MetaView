import { expect, it } from "vitest";
import { includeEndNodes, placePanel } from "./panelPlacement";

it("places the note beside the selection and keeps it inside the paper when the selection moves", () => {
  const paper = { width: 1000, height: 480 };
  const note = { width: 300, height: 180 };
  expect(placePanel(paper, note, { left: 210, right: 530, centerY: 250 })).toEqual({ x: 558, y: 160 });
  expect(placePanel(paper, note, { left: 830, right: 870, centerY: 460 })).toEqual({ x: 502, y: 284 });
});

it("leaves the far rim of a connected node visible without counting unrelated nodes", () => {
  const edge = { left: 120, right: 570 };
  const nodes = [
    { left: 70, right: 120, top: 275, bottom: 325 },
    { left: 570, right: 620, top: 275, bottom: 325 },
    { left: 800, right: 850, top: 275, bottom: 325 },
  ];
  expect(includeEndNodes(edge, [{ x: 120, y: 300 }, { x: 570, y: 300 }], nodes)).toEqual({ left: 70, right: 620 });
});
