# Color Changes Summary

## Overview
Your color updates follow a consistent brand palette: **primary red (`#FF3D3D` / `#FF3F3F`)** for active/pressed states, **neutral grays** for inactive, and **functional reds** for warnings/errors.

---

## Files Changed by Color Updates

### 1. **app/(app)/product.tsx** — Product Screen (Primary Changes)
**Line 69** — Back arrow button (pressed state)
```tsx
fill={pressed ? "#FF3D3D" : "hsl(0, 0%, 30%)"}
```
➜ Active red on press; neutral gray when idle

**Line 119** — Incomplete data warning icon
```tsx
<IconGeneral type="warning" fill="#FF3D3D" size={24} />
```
➜ Always red to signal warning/alert

**Lines 121, 124** — Incomplete data text (warning)
```tsx
<Tt className="font-interBold text-[#FF3D3D] text-sm">Information Incomplete</Tt>
<Tt className="text-xs text-[#FF3D3D] text-justify mt-1">Check the packaging for your safety</Tt>
```
➜ Consistent red for warning messaging

**Lines 155, 177, 200** — Ingredients/Traces/Nutrients inspect buttons (pressed)
```tsx
fill={pressed ? "#FF3D3D" : "hsl(0, 0%, 30%)"}
```
➜ Standardized press state across all section inspect icons

---

### 2. **app/(app)/(tabs)/_layout.tsx** — Tab Bar (Navigation)
**Line 12** — Tab bar active tint (when tab is active)
```ts
tabBarActiveTintColor: '#FF3F3F',
```
➜ Brand red for selected tab icon

**Line 13** — Tab bar inactive tint
```ts
tabBarInactiveTintColor: 'hsl(0 0% 30%)',
```
➜ Neutral gray for unselected tabs

**Line 19** — Tab bar background
```ts
backgroundColor: 'hsl(0 0% 95%)',
```
➜ Light neutral background

---

### 3. **components/modals/ModalChooseMemberRelationship.tsx** — Member Selection Modal
**Line 55** — Arrow forward button (pressed)
```tsx
<IconGeneral type="arrow-forward-ios" fill={pressed ? "#FF3F3F" : "hsl(0, 0%, 30%)"} />
```
➜ Consistent red-on-press pattern

---

### 4. **app/_layout.tsx** — System Colors (Root Layout)
**Line 33** — System background color
```ts
await SystemUI.setBackgroundColorAsync("hsl(0 0% 95%)");
```
➜ Light neutral for status bar / system UI

---

### 5. **components/NotificationManager.tsx** — Toast Notifications
**Lines 98–100** — Notification background colors
```ts
e: { backgroundColor: '#FF4C4C' },      // Error (red)
s: { backgroundColor: 'rgb(30, 160, 80)' }, // Success (green)
n: { backgroundColor: 'hsl(0 0% 30%)' },   // Neutral (dark gray)
```
➜ Functional colors for notification toast states

---

### 6. **app/login.tsx** & **app/register.tsx** — Auth Screens
**Pressed Border Color** — Sign-in / Sign-up buttons
```tsx
{ borderColor: pressed ? "#FF3EB5" : "hsl(0 0% 13%)" }
```
➜ Magenta-ish red on press (secondary variant)

**Activity Indicator** — Loading spinner color
```tsx
<ActivityIndicator size="large" color="#FF3F3F" />
```
➜ Brand red for loading states

---

## Color Palette Reference

| Semantic Meaning | Color Values | Used For |
|------------------|--------------|----------|
| **Primary Red (Active/Brand)** | `#FF3D3D`, `#FF3F3F` | Pressed buttons, icons, active tabs, alerts |
| **Primary Red (Loading)** | `#FF3F3F` | Activity indicators, spinners |
| **Warning / Error** | `#FF3D3D`, `#FF4C4C` | Warning icons, error notifications, alert text |
| **Secondary Red (Pressed)** | `#FF3EB5` | Alternative press state (Auth screens) |
| **Neutral Gray (Default)** | `hsl(0, 0%, 30%)` | Inactive icons, default state |
| **Neutral Gray (Light)** | `hsl(0, 0%, 70%)` | Secondary text, disabled state |
| **Neutral Gray (Background)** | `hsl(0, 0%, 95%)` | App background, tab bar background |
| **Neutral Gray (Dark)** | `hsl(0, 0%, 13%)` | Border color for inputs |
| **Success** | `rgb(30, 160, 80)` | Success notification toast |

---

## Key Patterns

### Pattern 1: Pressed State (Interactive Elements)
Most buttons/icons follow this pattern:
```tsx
fill={pressed ? "#FF3D3D" : "hsl(0, 0%, 30%)"}
```
**When to use:** Back buttons, inspect icons, forward arrows

### Pattern 2: Always-Red (Warnings/Alerts)
High-priority information always shows brand red:
```tsx
fill="#FF3D3D"  // No press state variation
```
**When to use:** Warning icons, error text, incomplete data alerts

### Pattern 3: Tab Navigation
Tab bars use specific semantics:
- Active: `#FF3F3F` (brand red)
- Inactive: `hsl(0, 0%, 30%)` (neutral gray)

### Pattern 4: System/Background
Always light for contrast:
```ts
backgroundColor: 'hsl(0, 0% 95%)'
```

---

## How to Present This to Reviewers

### Quick Summary in PR Description
"Standardised color palette across Product screen and navigation: brand red (`#FF3D3D`) for active/pressed states, neutral gray for inactive, and consistent warning colors. Tab bar now uses semantic colors for active (`#FF3F3F`) and inactive tabs."

### Code Snippets for PR Comments
**Before (inconsistent):**
- Different icons had different red shades
- No consistent pressed state colors
- Tab bar colors may have varied

**After (consistent):**
```tsx
// Product screen buttons: press → red
fill={pressed ? "#FF3D3D" : "hsl(0, 0%, 30%)"}

// Tab bar: active → brand red
tabBarActiveTintColor: '#FF3F3F'

// Warnings: always red
fill="#FF3D3D"
```

### Testing Checklist for Reviewers
- [ ] Press back arrow on Product screen — turns red
- [ ] Press inspect icons (Ingredients/Traces/Nutrients) — all turn red
- [ ] Tap each tab on tab bar — active tab icon is red
- [ ] View incomplete product — warning icon and text are red
- [ ] Trigger error/success notification — correct colors appear

---

## File Count Summary
- **Files modified:** 8
- **Color update locations:** 30+
- **Hex colors introduced:** `#FF3D3D`, `#FF3F3F`, `#FF3EB5`, `#FF4C4C`
- **HSL colors standardized:** `hsl(0, 0%, 30%)`, `hsl(0, 0%, 70%)`, `hsl(0, 0%, 95%)`, `hsl(0, 0%, 13%)`
