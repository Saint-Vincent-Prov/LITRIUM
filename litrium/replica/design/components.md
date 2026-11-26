# Design system (Atrium)

Tokens live in `src/styles/tokens.css` (the single source). Direction: warm,
dark photographic-feeling backdrop (pure CSS gradients, no images), with a
large frosted "shell" panel and white frosted tiles on it; mint accent for
positive money and primary actions, ink black for secondary emphasis.
Font: system stack with Inter if installed (no licensed fonts bundled).

## Primitives (`src/ui/`)
- **Button**: variants `primary` (mint), `ink` (dark), `ghost`, `danger`; sizes `md`, `sm`; states hover, focus ring, disabled, loading.
- **IconButton**: round, aria-label required.
- **Tile**: frosted surface, radius lg, padding s-5; optional `tone="accent"`.
- **Badge**: `positive | negative | warning | neutral`.
- **Input / Select / Field**: label always visible, hint, error text linked with aria-describedby.
- **Toggle**: real checkbox with role="switch".
- **Modal / Drawer**: focus trapped, Esc closes, returns focus.
- **Skeleton**: shimmer block.
- **EmptyState / ErrorState**: icon, title, body, action.
- **Toast**: polite live region.
- **BarChart**: SVG, paired bars (income / expense), accessible table fallback.
- **CardVisual**: payment card drawn in CSS, tone from tokens.
- **Progress**: native `<progress>`-like with aria.
- **Icons**: our own inline SVG line icons (`src/ui/Icon.tsx`).

## Liquid glass layer (`src/styles/glass.css`)
- Wallpaper: four slow-drifting colour blobs (`.backdrop`) on a light gradient.
- Glass recipe: translucent gradient fill, `backdrop-filter: blur(--glass-blur) saturate(--glass-saturate)`,
  inner top highlight, masked gradient rim (`::before`), specular sheen (`::after`).
- The page shell is clear so panels blur the wallpaper directly (nested backdrop filters only see their parent).
- Dark "lens" for the active nav item / segmented option; modals and menus use a stronger fill for legibility.
- Fallbacks: solid fills when `backdrop-filter` is unsupported or `prefers-reduced-transparency`; drift stops with reduced motion.
- Write only the standard `backdrop-filter` property: the minifier adds the `-webkit-` prefix; writing both made it drop the standard one.
