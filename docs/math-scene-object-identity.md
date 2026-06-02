# Math Scene Object Identity

Math scene render planning needs stable object keys so objects can persist across steps without reanimating the whole scene.

## Key Precedence

Object keys use this precedence:

1. Explicit object `id`, when present on the object value.
2. Content-derived fallback key when no usable `id` is present.

The current PlaybookScript types do not declare object-level IDs. The planner checks for `id` structurally so future producers can start sending IDs without a frontend schema change. A usable explicit ID is a non-empty string or a finite number.

Explicit ID keys are namespaced by object kind:

```text
point:id:p-1
segment:id:s-1
region:id:r-1
curve:id:c-1
annotation:id:a-1
vector_field:id:vf-1
```

## Content Fallback

When no explicit ID is available, keys are derived from stable content fields:

- `point`: label and coordinates.
- `segment`: label, endpoints, and arrow/line mode.
- `region`: label and vertices in order.
- `curve`: label, expressions, and parameter domain.
- `annotation`: text, position, and alignment.
- `vector_field`: vector expressions, sampling step, and label.

Styling-only fields such as `emphasis` are intentionally ignored so style changes do not make an existing object reanimate.

Numeric values are normalized to three decimal places. Non-finite or missing numeric values fall back to an empty numeric slot.

## Duplicate Warnings

Duplicate keys are diagnostics, not fatal errors. The render plan returns warnings with code `duplicate_identity_key`, including the object kind, duplicated key, and count. The renderer remains tolerant and continues rendering.

Duplicate explicit IDs are reported the same way as duplicate content-derived keys.

## Future Explicit IDs

Once the backend or PlaybookScript schema grows declared object IDs, this frontend planner should keep the same precedence:

1. Prefer the explicit object ID.
2. Keep content fallback for older scripts and partial producer rollouts.
3. Keep duplicate warnings non-throwing so one bad object does not break playback.
