# MetaView Logo

MetaView uses an MV viewport mark: a rounded frame with one continuous motion path. The path reads as `M -> V`, while the node at the upper right suggests object identity, property tracks, and camera focus.

## Assets

- `apps/web/public/brand/metaview-mark.svg`: icon mark for favicon, app icon, and avatar use.
- `apps/web/public/brand/metaview-lockup-dark.svg`: dark-background horizontal lockup.
- `apps/web/public/brand/metaview-lockup-light.svg`: light-background horizontal lockup.
- `apps/web/public/brand/metaview-brand-logo.png`: raster lockup for static sharing surfaces.
- `apps/web/public/brand/metaview-og-image.png`: Open Graph preview image referenced by `apps/web/index.html`.
- `apps/web/public/brand/metaview-watermark-28.png`: WeChat website app watermark image, `28x28`, PNG.
- `apps/web/public/brand/metaview-app-hd-108.png`: WeChat website app high-resolution image, `108x108`, PNG.
- `apps/web/public/favicon.ico`, `apps/web/public/favicon-32x32.png`, and
  `apps/web/public/apple-touch-icon.png`: browser and mobile home-screen icons.

## Colors

- Primary accent: `#10b981`.
- Dark lockup: background `#0e1412`, path `#4de8b0`, node `#f7d65c`.
- Light lockup: background `#faf8f3`, path `#00896e`, node `#b07d00`.

## Usage

- Minimum icon size: `24px`.
- Minimum horizontal lockup width: `120px`.
- Clear space: keep at least `20%` of the icon width around the mark.
- Use the icon alone for compact UI such as a 34px topbar slot.
- Use the horizontal lockup for splash screens, docs, export covers, and marketing screenshots.

## Do Not

- Stretch, rotate, or skew the mark.
- Replace the path with a gradient or a multi-color decorative stroke.
- Remove the focus node.
- Place the dark lockup on a light surface or the light lockup on a dark surface.
- Recreate the wordmark with a live font; the lockup SVG uses vector strokes so it does not depend on external fonts.
