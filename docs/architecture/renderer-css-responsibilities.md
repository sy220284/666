# Renderer CSS responsibility domains

The renderer stylesheet cascade is explicit and fixed:

1. `styles/base.css` — design tokens, reset rules, typography, focus and accessibility foundations.
2. `styles/layout.css` — application shell geometry, workspace placement, navigation and responsive layout.
3. `styles/components.css` — reusable controls and feature-owned component presentation.
4. `styles/themes.css` — Theme A/B variants, dark/eye-care/high-contrast modes, reduced motion and final experience overrides.

All four files use named cascade layers in the order `base, layout, components, themes`. Theme overrides therefore do not depend on accidental link order or selector duplication. The retired `styles.css`, `m3.css`, `m8-07.css` files and `#legacy-root` selectors must not be reintroduced.
