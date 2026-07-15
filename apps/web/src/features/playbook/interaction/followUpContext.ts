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
  return `把 BFS 起点选为 ${event.value}`;
}
