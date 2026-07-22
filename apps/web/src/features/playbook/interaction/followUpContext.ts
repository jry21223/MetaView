import type {
  InteractionEvent,
  InteractionFollowUpContext,
} from "./types";

const MAX_FOLLOW_UP_EVENTS = 20;

export function buildInteractionFollowUpContext(
  events: InteractionEvent[],
): InteractionFollowUpContext | null {
  if (events.length === 0) return null;
  return {
    manifest_version: "1",
    events: events.slice(-MAX_FOLLOW_UP_EVENTS).map((event) => ({ ...event })),
  };
}

export function describeInteractionEvent(event: InteractionEvent): string {
  if (event.adapter_id === "math.derivative-tangent") {
    return `把切点 x 调到 ${Number(event.value.toPrecision(12))}`;
  }
  if (event.adapter_id === "algorithm.bfs") {
    return `把 BFS 起点选为 ${event.value}`;
  }
  if (event.action === "slow-current-segment") {
    return `把步骤 ${event.step_id} 放慢到 ${event.factor} 倍时长`;
  }
  if (event.action === "change-explanation") {
    return `替换步骤 ${event.step_id} 的讲解`;
  }
  if (event.action === "emphasize-conclusion") {
    return `强调步骤 ${event.step_id} 的结论依据`;
  }
  if (event.action === "set-parameter") {
    return `把参数 ${event.parameter_id} 调到 ${event.value}`;
  }
  return `只补充步骤 ${event.step_id}`;
}
