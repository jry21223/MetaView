# Design System Specification: The Digital Laboratory (Light)

## 1. Overview & Creative North Star: "The Clinical Curator"
This design system moves away from the "dark mode terminal" cliché and instead adopts the persona of **The Clinical Curator**. Imagine a high-end, futuristic laboratory: pristine, hyper-organized, and flooded with soft, diffused natural light. 

The goal is to convey technical precision through an editorial lens. We achieve this by rejecting the "standard web grid" in favor of **Intentional Asymmetry**. Large blocks of negative space should be used to isolate complex data, making the interface feel like a premium printed scientific journal rather than a cluttered dashboard. Layering and tonal shifts replace heavy-handed shadows, creating a "stacked glass" effect that feels tactile yet weightless.

---

## 2. Colors & Surface Philosophy

### The "No-Line" Rule
To maintain a high-end feel, **do not use 1px solid borders for primary layout sectioning.** Boundaries must be defined through background color shifts. For example, a sidebar should be `surface_container_low` sitting against a `surface` background. This creates a "molded" look rather than a "pasted" look.

### Surface Hierarchy & Nesting
Treat the UI as a series of physical layers. Use these tiers to define importance:
*   **Base:** `surface` (#f7f9fb) — The primary canvas.
*   **Sub-Section:** `surface_container_low` (#f2f4f6) — Used for background "wells" or secondary content areas.
*   **Interactive Cards:** `surface_container_lowest` (#ffffff) — Reserved for the highest-priority floating elements.

### The "Glass & Gradient" Rule
For hero elements and primary CTAs, use a subtle gradient transition from `primary` (#006b56) to `primary_container` (#50b498). For floating panels (modals, dropdowns), apply a `backdrop-blur-xl` with a 70% opacity `surface_container_highest` background to create "frosted glass."

---

## 3. Typography: Technical Editorial
We use **Space Grotesk** across all scales. Its monolinear strokes and geometric apertures provide the "technical" feel, while our scale provides the "editorial" weight.

*   **Display (lg/md/sm):** Used for "Hero Data" or section headers. Use `on_surface` with -0.02em letter spacing to make it feel tight and authoritative.
*   **Headline (lg/md/sm):** Reserved for primary navigation or card titles. 
*   **Body (lg/md):** Primary reading. Maintain a generous line height (1.6) to ensure the technical font remains legible and premium.
*   **Label (md/sm):** All-caps for metadata or "Micro-copy." Use `on_surface_variant` with 0.05em letter spacing to mimic laboratory equipment labeling.

---

## 4. Elevation & Depth: Tonal Layering

### The Layering Principle
Depth is achieved by stacking surface-container tiers. Placing a `surface_container_lowest` card on a `surface_container_low` section creates a natural "lift" without the need for visual noise.

### Ambient Shadows
Shadows must mimic natural ambient occlusion. 
*   **Formula:** `0px 12px 32px -4px rgba(25, 28, 30, 0.06)`
*   **Shadow Tint:** Use the `on_surface` color as the shadow base at very low opacity (4–8%) to avoid "muddy" greys.

### The "Ghost Border" Fallback
If containment is required for accessibility, use a **Ghost Border**: `outline_variant` at 20% opacity. Never use 100% opaque borders for decorative purposes.

---

## 5. Components

### Buttons
*   **Primary:** A gradient from `primary` to `primary_container`. Use `rounded-md` (0.375rem). The text should be `on_primary`.
*   **Secondary:** Ghost-style. No background. `outline` border at 20% opacity. Text in `primary`.
*   **Tertiary:** Text-only in `primary`. On hover, add a `surface_container_low` background with `rounded-md`.

### Input Fields
Avoid the "boxed-in" feel. Use `surface_container_low` as the background with a 1px `outline_variant` border. Upon focus, the border transitions to `primary` and the background shifts to `surface_container_lowest`.

### Cards & Lists
**Forbid the use of divider lines.** 
*   Separate list items using `spacing-4` (1rem) of vertical white space.
*   For complex lists, alternate background colors between `surface` and `surface_container_low`.

### Technical Data Chips
Selection chips should use `secondary_container` with `on_secondary_container` text. Use `rounded-full` (9999px) to contrast against the sharp, technical typography.

---

## 6. Do’s and Don’ts

### Do:
*   **Embrace Asymmetry:** Offset your data columns. Use large `spacing-16` gutters for a premium feel.
*   **Use Mono-Spacing for Numbers:** If a number is critical (e.g., a data readout), ensure it uses the tabular-nums feature of Space Grotesk.
*   **Layer Containers:** Put a high-elevation card inside a low-elevation well to create focus.

### Don't:
*   **Don't use pure white (#FFFFFF) for backgrounds:** It breaks the "Digital Laboratory" aesthetic. Only use it for the highest-level interactive cards.
*   **Don't use dark shadows:** This design system relies on tonal shifts. If a shadow is visible at first glance, it is too heavy.
*   **Don't use 1px dividers:** If you need to separate content, use white space (Scale 6 or 8) or a subtle shift in surface container tier.