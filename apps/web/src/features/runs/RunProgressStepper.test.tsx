import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { RunProgressStepper } from "./RunProgressStepper";

describe("RunProgressStepper", () => {
  it("marks drafting active when status=running", () => {
    const html = renderToStaticMarkup(
      <RunProgressStepper status="running" attempts={0} maxAttempts={2} />,
    );
    expect(html).toContain('data-state="active"');
    expect(html).toContain("起草");
  });

  it("marks review active and shows attempt counter when reviewing", () => {
    const html = renderToStaticMarkup(
      <RunProgressStepper status="reviewing" attempts={1} maxAttempts={2} />,
    );
    expect(html).toContain("尝试 1/2");
    expect(html).toMatch(/data-state="active"/);
  });

  it("marks all phases done when succeeded", () => {
    const html = renderToStaticMarkup(
      <RunProgressStepper status="succeeded" attempts={0} maxAttempts={2} />,
    );
    // Each step renders its data-state on both the wrapper <div> and the icon
    // <span>, so 3 done steps → 6 matches.
    expect((html.match(/data-state="done"/g) ?? []).length).toBe(6);
  });

  it("marks review failed when status=failed after review attempts", () => {
    const html = renderToStaticMarkup(
      <RunProgressStepper status="failed" attempts={2} maxAttempts={2} />,
    );
    expect(html).toContain('data-state="failed"');
  });

  it("treats failed with zero attempts as drafting failure", () => {
    const html = renderToStaticMarkup(
      <RunProgressStepper status="failed" attempts={0} maxAttempts={2} />,
    );
    // The first __step block (the 起草 step) carries the failed marker.
    const firstStep = html.match(
      /mv-run-stepper__step"[\s\S]*?<\/div>/,
    )?.[0] ?? "";
    expect(firstStep).toContain('data-state="failed"');
    expect(firstStep).toContain("起草");
  });
});
