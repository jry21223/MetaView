# MetaView Mobile Web

This document records the current mobile direction for MetaView.

## Scope

The current target is a usable portrait Web learning player:

- Intake works on mobile Web for text prompts, pasted code, and uploaded code files.
- The player keeps PlaybookScript as the only rendering contract.
- The stage remains the existing 16:9 renderer.
- Phone portrait uses a dedicated player shell with narration, controls, and bottom tabs.
- Export and more actions stay visible on mobile.
- Follow-up input opens in a bottom sheet that uses the visual viewport height.

## Not In Scope Yet

Do not add native iOS implementation work in this phase:

- WKWebView bridge
- SwiftUI shell
- iOS file import
- iOS share sheets
- iOS TTS
- Native player
- PlaybookScript mobile schema
- Portrait renderer

The Web code may keep no-op seams such as `emitNativeEvent()` and `layoutMode="portrait"` so a future native wrapper can reuse the same player shell.

## QA Viewports

Mobile Web smoke coverage should include:

- 375 x 667
- 390 x 844
- 430 x 932
- 768 x 1024

Core checks:

- No global horizontal overflow.
- Intake input and generate action are visible and usable.
- Player stage, controls, export, more, and bottom tabs are visible.
- Code panels scroll horizontally inside the panel instead of widening the page.
- Follow-up bottom sheet remains usable when the visual viewport changes.
- Light, dark, and reduced-motion modes keep the same information architecture.
