# UX Audit — Logo redraw (commit 98c1821)

Target render: `js/auth.js:14` embeds `/img/logo.svg` at 120×120px. The SVG viewBox is 240×240, so every dimension halves on screen.

## Critical (looks amateur / unprofessional)

1. **Bottom arc text is sub-pixel noise** — `img/logo.svg:89-94` sets `font-size="9"` with `letter-spacing="2.5"` on a 240 viewBox. At 120px render that's ~4.5px glyphs with 1.25px tracking. "YUU XIANG DAM · 郁香潭" becomes a fuzzy dotted arc, not text. Worse, the arc text drops into the red field with no contrast guard — Chinese glyphs at 4.5px on radial-gradient red are unreadable on any display. This is the single strongest "homemade" tell.

2. **Font stack fails outside Apple** — `Brush Script MT` (ribbon, `logo.svg:53`) and `STKaiti` (every Chinese glyph, `logo.svg:18,21,79,84`) are Apple-system fonts. On Windows/Android the browser falls to generic `cursive` (Comic-Sans-adjacent) and `SimSun` (boxy print, not calligraphic). The same logo will look like a different brand on a staff Android tablet vs. Ernest's Mac. For a brand mark this is a correctness bug, not polish.

## Important polish

1. **Lotus motif reads as a smudge at 120px** — `logo.svg:24-36` packs 5 petals + 3 dots into a ~20px-viewBox cluster = ~10px rendered. The 1.2px side dots and 1.8px gold center disappear into anti-aliasing. Either grow it 1.5x or replace with a single stylized bloom.

2. **甜品 subtitle is unreadable** — `logo.svg:84-86` at `font-size="9"` with `letter-spacing="2.5"` renders ~4.5px. Inside the white circle under 香 it's visible as two grey blobs. Bump to 14 and drop letter-spacing to 1.

3. **Decorative leaves add noise, not value** — `logo.svg:59-71` at `opacity="0.18"` produces faint asymmetric smudges on the red field. At 120px they read as dust/JPEG artifacts. Remove them, or make them deliberate at 0.35 opacity and mirror-symmetric.

4. **Ribbon banner has no shadow/lift** — `logo.svg:38-56` the white ribbon sits flat on red with only a 0.6px stroke. Real ribbons curl. A 0.5px drop shadow under the notch ends would sell it; otherwise it reads as a sticker.

## Nice-to-have

1. **甜品 letter-spacing of 2.5 inside a 50px circle is too wide** — characters touch the inner red ring (`logo.svg:76`).
2. **Gold accent (`#fbbf24`) appears once** on the lotus center dot at 1.8px radius — invisible at 120px. Either commit to gold as a real accent (香 ring? bottom arc?) or drop it.
3. **香 is vertically off-center in its circle** — `logo.svg:74` cy=124, `logo.svg:79` y=145. Baseline-anchored text at 56px puts the optical center high. Try y=148.

## Verdict

Acceptable as a placeholder for internal login only — 香 reads strong as the focal point, brand red is right — but the arc text and cross-platform font fallbacks make it unfit for any customer-facing surface until Ernest provides the source file.
