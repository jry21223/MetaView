# Geography Prompt Guidance

Use this file for maps, regions, routes, climate patterns, demographic change, and spatial comparisons.

## Priorities

- Establish the base map, region scope, north orientation, and scale before animating changes.
- Keep geographic encoding stable: color, legend, labels, and boundaries should mean the same thing throughout.
- If time matters, show the sequence clearly with dates or stage markers.
- Reduce clutter by revealing one spatial pattern at a time.

## Prompt Additions

- Ask for the geographic extent, projection assumptions, and key labels before code.
- Ask whether the scene is static comparison, route animation, or time-series change.
- Require legends for color scales, marker sizes, or movement arrows.
- Ask for annotations that explain why a region differs, not just that it differs.
- Require a final summary connecting the map pattern to the main claim.

## Failure Patterns To Prevent

- Missing legend for choropleth or heat coloring
- Changing scale or crop without context
- Route arrows without start and end labels
- Time-series animations with no visible date anchor
