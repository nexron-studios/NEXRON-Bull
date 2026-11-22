# Design generator

`build.mjs` renders the Bull design (Figma file "Bull") as self-contained HTML: every
`section.frame` is one Figma frame. Icons come from the installed `@lucide/vue`, the bull from
`public/favicon.svg`, the wordmark font and Clawd from `src/assets/`.

```bash
node docs/design/build.mjs   # writes docs/design/out/bull-desktop.html and bull-mobile.html
```

Import with the Figma MCP tool `html_to_figma` (`cssSelector: "section.frame"`, at most 20 frames
per call), then name and sort the frames into the pages and sections described in the vault note
`Projects/NEXRON Chat.md` ("Aufbau der Datei"). SVG masks get lost in the import, so cut-outs are
even-odd holes.
