# Customs valuation interface

## Direction

Institutional authority with a modern trade identity: navy, customs blue,
restrained yellow detail, trade imagery, and clear, light working surfaces.
Photography belongs on authentication screens; evidence screens prioritize
readable data and the officer's next task.

## Foundations

| Token | Value | Use |
| --- | --- | --- |
| Navy | `#102A56` | Navigation, headings, institutional identity |
| Action blue | `#0D5EAE` | Primary actions and links |
| Pale blue | `#EAF2FB` | Guidance and supporting surfaces |
| Near-white | `#FAFBFE` | Page backgrounds |
| Slate | `#64748B` | Secondary text |
| Border | `#DCE2EA` | Field and panel boundaries |
| Yellow | `#F5CF27` | Small identity details only |

The CSS variables and Mantine theme share this palette. Use Segoe UI with
Noto Sans Ethiopic and system sans-serif fallbacks. Panels use 14–20px radii;
authentication inputs are 50px tall. Operational forms use Mantine medium inputs
to balance readability with information density.

## Application-specific extensions

- Group navigation into workspace, price evidence, review, and management.
- Keep international, local, and historical evidence distinct. Never imply
  that a displayed representative price is an officer's final customs value.
- Use product details, comparison criteria, results, and review as the sequence
  in local analysis. Preserve source, currency, condition, and quality context.
- Prefer neutral blue for reference information, green for successful actions,
  amber for pending or uncertain states, and red for failures or exclusions.
  Always pair status colors with text.
- Use tabular numerals for price and record tables; allow horizontal scrolling
  when columns exceed the screen width.
- Keep loading, empty results, errors, and planned modules distinct. Do not
  fabricate statistics or service availability.

## Authentication and accessibility

Native form validation, explicit labels, required markers, password visibility,
submission feedback, and administrator-approval guidance are provided. Unwired
IAM, remember-me, policy and password-reset controls have been removed; an
expandable help section explains the available administrator-assisted path.

Keyboard focus is visible. Navigation has a skip link, current-page state and
an expandable mobile menu. Layouts adapt at 1200, 950, 760 and 450px, and respect
reduced-motion preferences. New authentication, navigation and overview copy
is available in English and Amharic; existing analysis workflows still contain
English-only copy. Amharic wording should receive institutional editorial review.

## Assets

`portal/public/images/trade-terminal.webp` is an optimized AI-generated
illustration in a photographic style. It does not depict an identified real
customs facility. The PNG source is stored beside it. The outlined shield is a
generic application mark, not a reproduction of the Commission's official seal.
Replace it with an approved brand asset when available.

`node scripts/prepare-ui-assets.cjs` regenerates the WebP and collects English
component fallbacks into the translation catalogue.
