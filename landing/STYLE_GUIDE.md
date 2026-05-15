# AttenRider Design System & Style Guide

This document outlines the visual identity, typography, and design principles used for the AttenRider landing page.

## 1. Design Aesthetic
AttenRider uses a **Premium Professional** aesthetic. It blends the warmth of traditional "high-trust" corporate design (cream and ivory bases) with the sharp, technical look of modern AI systems (deep charcoal and amber accents).

- **Core Theme**: High-trust workforce monitoring.
- **Visual Style**: Clean, expansive, with rich typography and smooth micro-interactions.

## 2. Color Palette

The system uses an **OKLCH-based color system** for maximum perceptual consistency across displays.

| Category | Value (OKLCH / Description) | Usage |
| :--- | :--- | :--- |
| **Background** | `oklch(0.97 0.005 80)` | Ivory base for the overall page. |
| **Foreground** | `oklch(0.18 0.01 60)` | Deep Charcoal for primary body text. |
| **Primary** | `oklch(0.18 0.01 60)` | Used for dark backgrounds and high-contrast sections. |
| **Accent** | `oklch(0.65 0.17 55)` | **Rich Amber**. Used for highlights, buttons, and call-to-actions. |
| **Secondary** | `oklch(0.94 0.008 80)` | Muted cream for section backgrounds and separation. |
| **Border** | `oklch(0.88 0.01 80)` | Soft lines for subtle structure. |

## 3. Typography

AttenRider uses a dual-font system to balance authority with readability.

### **Primary Serif: Playfair Display**
- **Usage**: Headlines, Section Titles, Large Quotes.
- **Vibe**: Authoritative, established, and premium.
- **Variables**: `--font-playfair`

### **Primary Sans: DM Sans**
- **Usage**: Body Copy, Labels, Navigation, Buttons.
- **Vibe**: Clean, modern, and highly legible.
- **Variables**: `--font-dm-sans`

## 4. Animation & Interaction

The interface is designed to feel alive and responsive through the following technologies:

- **GSAP (GreenSock)**: Orchestrates complex scroll-triggered animations, revealing elements as the user moves down the page.
- **Lenis**: Provides a high-fidelity "smooth scroll" experience across all browsers.
- **ScrollTrigger**: Used for parallax image effects and "reveal-on-scroll" text blocks.
- **Hover Effects**: Buttons and cards use subtle scale increases (1.05x) and color shifts to provide instant feedback.

## 5. Iconography

- **Library**: [Lucide React](https://lucide.dev/)
- **Weight**: Default (2px stroke width).
- **Color**: Typically uses the `Accent` (Amber) color to guide the eye toward interactive elements.

## 6. Layout Principles

- **Grid System**: 12-column responsive grid (Tailwind CSS).
- **Spacing**: Generous vertical padding (`py-20` to `py-28`) to give content room to "breathe."
- **Max Width**: Standardized at `max-w-7xl` (1280px) for consistent content alignment across ultra-wide monitors.
