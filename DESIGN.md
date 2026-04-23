---
version: alpha
name: RIL
description: Read It Later — personal triage dashboard. Keyboard-first. Chrome extension new-tab + local web app.
colors:
  primary: "#1C1916"
  neutral: "#F6F3EE"
  tertiary: "#C86142"
  secondary: "#9A9189"
  surface: "#FDFBF8"
  surface-2: "#F0ECE5"
  green: "#4F7A57"
  red: "#9B4444"
typography:
  wordmark:
    fontFamily: Instrument Serif
    fontSize: 1.25rem
    fontWeight: 400
    fontStyle: italic
    letterSpacing: -0.03em
  body-md:
    fontFamily: Instrument Sans
    fontSize: 0.875rem
    fontWeight: 400
    lineHeight: 1.5
  body-sm:
    fontFamily: Instrument Sans
    fontSize: 0.8125rem
    fontWeight: 400
    lineHeight: 1.5
  label-sm:
    fontFamily: Instrument Sans
    fontSize: 0.6875rem
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: 0.02em
  item-title:
    fontFamily: Instrument Sans
    fontSize: 0.875rem
    fontWeight: 400
    lineHeight: 1.4
  group-header:
    fontFamily: Instrument Sans
    fontSize: 0.75rem
    fontWeight: 600
    letterSpacing: 0.013em
  time-group:
    fontFamily: Instrument Serif
    fontSize: 0.9375rem
    fontWeight: 400
    fontStyle: italic
    letterSpacing: -0.02em
rounded:
  sm: 4px
  md: 6px
  lg: 10px
  full: 9999px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  2xl: 48px
components:
  tab-active:
    backgroundColor: "{colors.tertiary}"
    textColor: "white"
    rounded: "{rounded.sm}"
  tab-active-tint:
    backgroundColor: "rgba(200,97,66,0.09)"
    textColor: "{colors.tertiary}"
    rounded: "{rounded.sm}"
  domain-pill-active:
    backgroundColor: "rgba(200,97,66,0.09)"
    textColor: "#A34E34"
    rounded: "{rounded.full}"
  item-focus-bar:
    backgroundColor: "{colors.tertiary}"
    width: 2.5px
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "white"
    rounded: "{rounded.sm}"
  toast:
    backgroundColor: "{colors.primary}"
    textColor: "white"
    rounded: "{rounded.md}"
---

## Overview

Restrained warmth — Claude-adjacent. The UI should feel like a considered personal tool, not a generic SaaS dashboard. Warm paper background, generous air, one accent color used sparingly. Typography does the heavy lifting; color only appears when it earns its place.

The core aesthetic tension: this is a triage tool (efficiency, speed, keyboard-first) dressed in the clothes of a reading space (warm, calm, unhurried). It should feel fast to operate but pleasant to sit in.

## Colors

The palette is rooted in warm off-whites and a single coral accent, drawn from Claude's visual identity.

- **Primary (#1C1916):** Warm near-black. Used for all body text, the active tab background, and the wordmark. Slightly warmer than pure black — this keeps the page from feeling cold.
- **Neutral (#F6F3EE):** The canvas. Warmer than current — a step closer to aged paper than clean white. Background of the whole page.
- **Tertiary (#C86142):** The sole interactive accent. Warm coral/terracotta. Appears on: focused item bar, active domain pill border, active tab highlight. Nowhere else. When you see this color, something is active or focused.
- **Secondary (#9A9189):** Muted warm gray for metadata — timestamps, domain names, read times. Supporting, never competing.
- **Surface (#FDFBF8):** Almost invisible card surface. Used to lift content groups slightly above the background. The difference is subtle — separation comes from whitespace, not heavy borders.
- **Green (#4F7A57) / Red (#9B4444):** Semantic only. Green = save action. Red = trash/archive-all hover. Never decorative.

**Border colors** (used in CSS custom properties, not in DESIGN.md token schema which requires hex): `rgba(28,25,22,0.08)` for row separators and group internal dividers; `rgba(28,25,22,0.14)` for header borders and pill outlines. These are the ink color at 8% and 14% opacity — always warm, never blue-gray.

**Key decision: no sage, no rose, no amber as decorative accents.** The previous system had three competing accent colors. This system has one. Every color touch is now meaningful.

## Typography

Two-family system with shared design DNA (both from the Instrument family):

- **Instrument Serif italic** — for the wordmark and time-group labels. Provides editorial warmth and signals "reading" without being precious. Used sparingly — only in places where the tool steps back and invites browsing rather than triaging.
- **Instrument Sans** — for everything else. Higher x-height than DM Sans, cleaner tabular numerics (critical for timestamps and counts), slightly more distinctive at small sizes. The item titles, metadata, tabs, labels — all Instrument Sans.

Font loading: `https://fonts.googleapis.com/css2?family=Instrument+Sans:ital,wght@0,400;0,500;0,600;1,400&family=Instrument+Serif:ital,wght@1,400&display=swap`

**Previous font (DM Sans):** still a good font, but Instrument Sans reads with slightly more personality at 11–14px, which is where this UI lives.

## Layout

Max content width: 1300px, centered, 32px horizontal padding.

Header is sticky at 52px. Content area pads 40px top, 80px bottom (room for the undo toast).

**Groups:** No card borders. Groups are separated by whitespace (24px gap between groups). Within a group, items are separated by a 1px border at `rgba(28,25,22,0.08)` — almost invisible, just enough to visually parse rows quickly.

The previous design used full `1px solid var(--warm-gray)` card outlines. Removing these creates a cleaner reading surface — the eye doesn't have to negotiate borders.

## Elevation & Depth

Near-flat. Two surface levels:

1. **Background (#F6F3EE)** — page canvas
2. **Surface (#FDFBF8)** — group card background, slightly lighter than canvas

Shadow used only for the toast notification (`0 4px 16px rgba(0,0,0,0.15)`) and help overlay (`0 16px 48px rgba(0,0,0,0.12)`). No card shadows.

## Shapes

Functional, not decorative. `6px` for buttons and toggles. `10px` for the overlay card. `9999px` (full) for domain pills — the pill shape is a clear affordance for filterable tags. Item focus bar: `2.5px` — thin enough to read as a deliberate accent, not a border.

## Components

**Item row:** 12px vertical padding, 16px horizontal padding. Title at 14px/400 weight. Timestamp at 11px muted below title. On hover/focus: actions appear. On focus: coral left bar + amber-tint background fill.

**Domain pills:** border changes from neutral to `{colors.tertiary}` on active; background fills with `accent-tint`. Pill has favicon (14×14) + label + count. Full-radius (pill shape).

**Group header:** 12px/600 label + count + optional "Archive all" button. Separated from items by a `1px` border in `border` color.

**Tabs:** Active tab uses `accent-tint` background + `tertiary` text (not full ink fill). This is a departure from the previous black active tab — softer, more in keeping with the warm palette.

**Toggle (Domain/Tag/Time):** Segmented control with `surface` active background and subtle shadow. `4px` inner radius.

## Do's and Don'ts

**Do:**
- Use `{colors.tertiary}` only for interactive/active states — never as a decorative color
- Use Instrument Serif italic only for the wordmark and time-group bucket headers
- Keep item rows tight but not cramped — 12px vertical padding is the minimum
- Use the `border` token (8% opacity) for row separators; never `border-2` (14% opacity) inside groups

**Don't:**
- Add a third font family — the two-family system is intentional
- Use full card outlines for groups — whitespace does that job
- Use green or red outside of semantic action states (save / trash hover)
- Add gradient buttons, rounded card shadows, or decorative background patterns
