export type NativeEventPayload = Record<string, unknown> | undefined;

export function emitNativeEvent(
  eventName: string,
  payload?: NativeEventPayload,
): void {
  void eventName;
  void payload;
  // Reserved for a future native shell. Web remains the source of truth.
}
