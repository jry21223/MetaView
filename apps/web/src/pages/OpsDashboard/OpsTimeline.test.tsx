import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { OpsTimeline } from "./OpsTimeline";

function points(total: number, cents = 100) {
  return [
    {
      date: "2026-06-08",
      run: {
        date: "2026-06-08",
        total,
        succeeded: total,
        failed: 0,
        in_flight: 0,
      },
      revenue: {
        date: "2026-06-08",
        paid_orders: 1,
        revenue_cents: cents,
        revenue_yuan: (cents / 100).toFixed(2),
      },
    },
  ];
}

function axisLabels(container: HTMLElement) {
  return [...container.querySelectorAll(".mv-ops-timeline__axis span")].map(
    (node) => node.textContent,
  );
}

afterEach(cleanup);

describe("Ops timeline axis units", () => {
  it("shows only 0 and 1 for a one-task daily maximum", () => {
    const { container } = render(
      <OpsTimeline points={points(1)} kind="runs" />,
    );
    expect(axisLabels(container)).toEqual(["1", "0"]);
    expect(container.querySelectorAll(".mv-ops-timeline__grid")).toHaveLength(
      2,
    );
    expect(
      container
        .querySelector(".mv-ops-timeline__succeeded")
        ?.getAttribute("height"),
    ).toBe("100");
  });

  it("uses integer ticks and an honest padded scale for odd task maxima", () => {
    const { container } = render(
      <OpsTimeline points={points(3)} kind="runs" />,
    );
    expect(axisLabels(container)).toEqual(["4", "2", "0"]);
    expect(
      container
        .querySelector(".mv-ops-timeline__succeeded")
        ?.getAttribute("height"),
    ).toBe("75");
    expect(
      container.querySelector(".mv-ops-timeline__succeeded title")?.textContent,
    ).toContain("完成 3");
  });

  it("retains fractional currency ticks", () => {
    const { container } = render(
      <OpsTimeline points={points(1, 100)} kind="revenue" />,
    );
    expect(axisLabels(container)).toEqual(["1", "0.5", "0"]);
    expect(container.querySelectorAll(".mv-ops-timeline__grid")).toHaveLength(
      3,
    );
  });
});
