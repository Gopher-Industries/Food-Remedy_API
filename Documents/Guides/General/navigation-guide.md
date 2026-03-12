# Food Remedy Mobile App - Navigation Guide

This document provides a comprehensive overview of the navigation architecture in the Food Remedy mobile application. It is intended to help new developers quickly understand the screen flow, routing structure, and navigation patterns used throughout the app.

---

## Table of Contents

1. [Technology Stack](#technology-stack)
2. [Navigation Architecture Overview](#navigation-architecture-overview)
3. [File-Based Routing Structure](#file-based-routing-structure)
4. [Route Hierarchy Diagram](#route-hierarchy-diagram)
5. [Authentication Flow](#authentication-flow)
6. [Main Application Flow](#main-application-flow)
7. [Screen-to-Screen Navigation Documentation](#screen-to-screen-navigation-documentation)
8. [Route Parameters and Data Passing](#route-parameters-and-data-passing)
9. [Navigation Guards and Redirects](#navigation-guards-and-redirects)
10. [Context Providers and State Management](#context-providers-and-state-management)
11. [Navigation Patterns and Best Practices](#navigation-patterns-and-best-practices)
12. [Placeholder and Incomplete Routes](#placeholder-and-incomplete-routes)
13. [Common Navigation Commands](#common-navigation-commands)

---

## Technology Stack

The Food Remedy mobile app uses the following navigation-related technologies:

| Technology | Purpose |
|------------|---------|
| Expo Router | File-based routing system built on React Navigation |
| React Navigation | Underlying navigation framework |
| expo-router | Provides `router.push()`, `router.replace()`, `Link`, `Redirect` |
| @gorhom/bottom-sheet | Bottom sheet modal navigation component |
| react-native-gesture-handler | Gesture handling for navigation interactions |

---

## Navigation Architecture Overview

The app follows a **file-system based routing** pattern using Expo Router. The navigation structure consists of:

1. **Root Layout** (`app/_layout.tsx`) - Global providers and font loading
2. **Authentication Screens** - Login, Register, Forgot Password (public routes)
3. **Protected App Routes** (`app/(app)/`) - Requires authentication
4. **Tab Navigation** (`app/(app)/(tabs)/`) - Main bottom tab navigator
5. **Settings Sub-Routes** (`app/(app)/settings/`) - Nested settings screens

### Key Concepts

- **Route Groups**: Directories wrapped in parentheses `(groupName)` do not affect the URL path but help organize related routes
- **Layout Files**: `_layout.tsx` files define the navigation container for their directory
- **Protected Routes**: Routes inside `(app)/` require user authentication

---

## File-Based Routing Structure

```
mobile-app/
└── app/
    ├── _layout.tsx                 # Root layout (Providers, fonts, SafeArea)
    ├── login.tsx                   # /login - Login screen
    ├── register.tsx                # /register - Registration screen
    ├── forgotPassword.tsx          # /forgotPassword - Password reset screen
    │
    ├── (misc)/                     # Utility route group
    │   └── loading.tsx             # Loading screen component (not a route)
    │
    └── (app)/                      # Protected routes (requires auth)
        ├── _layout.tsx             # Auth guard + Profile gate + Stack navigator
        ├── onboarding.tsx          # /onboarding - New user onboarding
        ├── product.tsx             # /product - Product details screen
        ├── search.tsx              # /search - Product search screen
        ├── membersEdit.tsx         # /membersEdit - Profile edit screen
        │
        ├── settings/               # Settings sub-routes
        │   ├── feedback.tsx        # /settings/feedback - Feedback form
        │   └── privacy.tsx         # /settings/privacy - Privacy policy
        │
        └── (tabs)/                 # Bottom tab navigator
            ├── _layout.tsx         # Tab bar configuration
            ├── scan.tsx            # Tab 1: Barcode scanner
            ├── index.tsx           # Tab 2: History (default tab)
            ├── cart.tsx            # Tab 3: Shopping list
            ├── profiles.tsx        # Tab 4: Nutritional profiles
            └── settings.tsx        # Tab 5: Settings menu
```

---

## Route Hierarchy Diagram

```
                                    +------------------+
                                    |   Root Layout    |
                                    | (app/_layout.tsx)|
                                    +--------+---------+
                                             |
                +----------------------------+----------------------------+
                |                            |                            |
        +-------v-------+           +--------v--------+          +--------v--------+
        |    /login     |           |   /register     |          | /forgotPassword |
        | (Public Auth) |           | (Public Auth)   |          | (Public Auth)   |
        +---------------+           +-----------------+          +-----------------+
                                             
                                    +------------------+
                                    |  (app)/_layout   |
                                    |   [Auth Guard]   |
                                    |  [Profile Gate]  |
                                    +--------+---------+
                                             |
                +----------------------------+----------------------------+
                |                            |                            |
        +-------v-------+           +--------v--------+          +--------v--------+
        |  /onboarding  |           |    /product     |          |    /search      |
        | (First-time)  |           | (Product View)  |          | (Search Page)   |
        +---------------+           +-----------------+          +-----------------+
                                             |
                                    +--------v--------+
                                    |  /membersEdit   |
                                    | (Profile Edit)  |
                                    +-----------------+
                                             
                                    +------------------+
                                    | (tabs)/_layout   |
                                    | [Tab Navigator]  |
                                    +--------+---------+
                                             |
        +------------+----------+------------+------------+------------+
        |            |          |            |            |            |
   +----v----+ +-----v----+ +---v-----+ +----v----+ +-----v-----+
   |  /scan  | | / (index)| |  /cart  | |/profiles| | /settings |
   |  Tab 1  | |  Tab 2   | |  Tab 3  | |  Tab 4  | |   Tab 5   |
   +---------+ +----------+ +---------+ +---------+ +-----------+
                                                          |
                                              +-----------+-----------+
                                              |                       |
                                    +---------v---------+   +---------v---------+
                                    | /settings/feedback|   | /settings/privacy |
                                    +-------------------+   +-------------------+
```

---

## Authentication Flow

The authentication flow is managed by `AuthProvider` and enforced in `(app)/_layout.tsx`.

### Flow Diagram

```
+-------------+     No User      +------------+
|   App Start | ----------------> |   /login   |
+------+------+                   +-----+------+
       |                                |
       | User Exists                    | Successful Login
       v                                v
+------+------+                   +-----+------+
| Profile Gate|                   | AuthProvider|
+------+------+                   | handleSignIn|
       |                          +-----+------+
       |                                |
  +----+----+                           |
  |         |                           v
  v         v                     +-----+------+
No Profile  Has Profile           |  Redirect  |
  |         |                     | /(app)/(tabs)|
  v         v                     +------------+
/onboarding  /(app)/(tabs)
```

### Authentication States

| State | Behavior |
|-------|----------|
| `authLoading = true` | Show loading screen |
| `user = null` | Redirect to `/login` |
| `user exists, no profile` | Redirect to `/onboarding` |
| `user exists, has profile` | Allow access to protected routes |

### Code Reference

File: `app/(app)/_layout.tsx`

```typescript
// 1) Auth gate
if (authLoading) return <LoadingPage />;
if (!user) return <Redirect href="/login" />;

// 2) Profile gate
if (gate === 'loading') return <LoadingPage />;
if (gate === 'needs-onboarding' && pathname !== '/onboarding') {
  return <Redirect href="/onboarding" />;
}
if (gate === 'ready' && pathname === '/onboarding') {
  return <Redirect href="/(app)/(tabs)" />;
}
```

---

## Main Application Flow

### User Journey Overview

```
1. Launch App
       |
       v
2. Authentication Check
       |
   +---+---+
   |       |
   v       v
Not Logged In    Logged In
   |                 |
   v                 v
3. Login Page    4. Profile Check
   |                 |
   v             +---+---+
Register         |       |
   |             v       v
   v          No Profile  Has Profile
Login Success     |           |
   |              v           v
   +--------> Onboarding   Tab Navigator
                  |           |
                  v           v
            Create Profile   Use App
                  |
                  v
            Tab Navigator
```

### Tab Navigator Screens

| Tab Index | Route | Screen Name | Description |
|-----------|-------|-------------|-------------|
| 1 | `/scan` | Scan | Barcode scanner with camera |
| 2 | `/` (index) | History | Previously scanned products |
| 3 | `/cart` | Shopping | Shopping list (favorites) |
| 4 | `/profiles` | Profiles | Nutritional profile management |
| 5 | `/settings` | Settings | App settings and account |

---

## Screen-to-Screen Navigation Documentation

### Public Routes (No Authentication Required)

#### Login Screen (`/login`)

| Navigation Target | Method | Trigger |
|-------------------|--------|---------|
| `/register` | `<Link href="/register">` | "Create Account" link |
| `/(app)/(tabs)` | `router.replace()` | Successful login |
| Password Reset Modal | `openModal('resetEmail')` | "Reset" button |

#### Register Screen (`/register`)

| Navigation Target | Method | Trigger |
|-------------------|--------|---------|
| `/login` | `router.replace('/login')` | Successful registration |
| `/login` | `<Link href='/login'>` | "Already have an account" link |

#### Forgot Password Screen (`/forgotPassword`)

| Navigation Target | Method | Trigger |
|-------------------|--------|---------|
| `/login` | `<Link href='/login'>` | "Go Back to Login" link |

---

### Protected Routes (Authentication Required)

#### Onboarding Screen (`/onboarding`)

| Navigation Target | Method | Trigger |
|-------------------|--------|---------|
| `/(app)/(tabs)` | `router.replace()` | Profile creation complete |

#### Scan Screen (`/(app)/(tabs)/scan`)

| Navigation Target | Method | Trigger |
|-------------------|--------|---------|
| `/(app)/product` | `router.push()` | Barcode scanned successfully |
| `/search` | `router.push("/search")` | "View all results" in bottom sheet |

#### History Screen (`/(app)/(tabs)/index`)

| Navigation Target | Method | Trigger |
|-------------------|--------|---------|
| `/(app)/(tabs)/scan` | `router.push()` | "Scan New Product" button |
| `/product` | via `ProductBanner` | Tap on history item |

#### Shopping Cart Screen (`/(app)/(tabs)/cart`)

| Navigation Target | Method | Trigger |
|-------------------|--------|---------|
| `/product` | `router.push("/product")` | Tap on shopping list item |
| `/(app)/(tabs)/scan` | `router.push()` | "Scan New Product" button |

#### Profiles Screen (`/(app)/(tabs)/profiles`)

| Navigation Target | Method | Trigger |
|-------------------|--------|---------|
| `/(app)/membersEdit` | `router.push()` | Tap on existing profile |
| `/(app)/membersEdit` | `router.push()` | "Add New Profile" button |

#### Settings Screen (`/(app)/(tabs)/settings`)

| Navigation Target | Method | Trigger |
|-------------------|--------|---------|
| `/(app)/(tabs)/profiles` | `router.push()` | "Nutritional Profiles" option |
| `/settings/feedback` | `router.push()` | "Report Issue / Feedback" option |
| `/settings/privacy` | `router.push()` | "Privacy Policy" option |
| `/login` | `signOut()` via AuthProvider | "Sign Out" button |

#### Product Screen (`/(app)/product`)

| Navigation Target | Method | Trigger |
|-------------------|--------|---------|
| `router.back()` | `router.back()` | Back arrow button |
| `/(app)/(tabs)` | `router.replace()` | "Go Back" on error state |
| `/(app)/membersEdit` | `router.push()` | Profile warning tap |

#### Search Screen (`/(app)/search`)

| Navigation Target | Method | Trigger |
|-------------------|--------|---------|
| `router.back()` | `router.back()` | Back arrow button |
| `/product` | via `ProductBanner` | Tap on search result |

#### Members Edit Screen (`/(app)/membersEdit`)

| Navigation Target | Method | Trigger |
|-------------------|--------|---------|
| `router.back()` | `router.back()` | Save profile / Delete profile |

#### Feedback Screen (`/settings/feedback`)

| Navigation Target | Method | Trigger |
|-------------------|--------|---------|
| `router.back()` | `router.back()` | Back arrow / Submit success |

#### Privacy Screen (`/settings/privacy`)

| Navigation Target | Method | Trigger |
|-------------------|--------|---------|
| `router.back()` | `router.back()` | Back arrow button |

---

## Route Parameters and Data Passing

The Food Remedy app primarily uses **React Context** for passing data between screens rather than URL parameters. This approach provides better type safety and allows for complex data structures.

### Context Providers

| Provider | Purpose | Key Data |
|----------|---------|----------|
| `AuthProvider` | Authentication state | `user`, `loading`, `emailVerified` |
| `ProfileProvider` | User nutritional profiles | `profiles`, `editableProfile` |
| `ProductProvider` | Current product data | `barcode`, `currentProduct`, `loading` |
| `SearchProductProvider` | Search state and results | `query`, `productResults`, `loading` |
| `SQLiteDatabaseProvider` | Local database access | `db`, `isDbReady` |
| `ModalManagerProvider` | Modal visibility state | `openModal()`, `closeModal()` |
| `NotificationProvider` | Toast notifications | `addNotification()` |

### Data Flow Examples

#### Scanning a Product

```
1. User scans barcode on Scan screen
2. handleBarCodeScanned() extracts barcode data
3. setBarcode(data) updates ProductProvider context
4. router.push("/(app)/product") navigates to product screen
5. Product screen reads currentProduct from ProductProvider
6. ProductProvider fetches product data using the barcode
```

```typescript
// In scan.tsx
const handleBarCodeScanned = ({ type, data }: { type: string, data: string }) => {
  setScanned(true);
  setBarcode(data);  // Set barcode in ProductProvider
  router.push("/(app)/product");
};

// In product.tsx
const { currentProduct, loading, error } = useProduct();
```

#### Editing a Profile

```
1. User taps profile on Profiles screen
2. startEdit(profile) copies profile to editableProfile
3. router.push("/(app)/membersEdit") navigates to edit screen
4. Edit screen reads/updates editableProfile
5. saveEdit() persists changes and navigates back
```

```typescript
// In profiles.tsx
const handleEditMember = (id: string) => {
  const existing = profiles.find(p => p.profileId === id);
  if (!existing) return;
  startEdit(existing);  // Set editableProfile in ProfileProvider
  router.push("/(app)/membersEdit");
};

// In membersEdit.tsx
const { editableProfile, updateEdit, saveEdit } = useProfile();
```

#### Searching Products

```
1. User types query in search input
2. setQuery(text) updates SearchProductProvider
3. handleSearchProducts() fetches results
4. User taps product result
5. setBarcode() updates ProductProvider
6. router.push("/product") navigates to product screen
```

---

## Navigation Guards and Redirects

### Authentication Guard

Location: `app/(app)/_layout.tsx`

The authentication guard prevents unauthenticated users from accessing protected routes.

```typescript
const { loading: authLoading, user } = useAuth();

if (authLoading) return <LoadingPage />;
if (!user) return <Redirect href="/login" />;
```

### Profile Gate

Location: `app/(app)/_layout.tsx` using `useProfileGate` hook

The profile gate ensures users complete onboarding before accessing the main app.

```typescript
const { gate } = useProfileGate();

if (gate === 'loading') return <LoadingPage />;
if (gate === 'needs-onboarding' && pathname !== '/onboarding') {
  return <Redirect href="/onboarding" />;
}
if (gate === 'ready' && pathname === '/onboarding') {
  return <Redirect href="/(app)/(tabs)" />;
}
```

### Gate States

| Gate State | Condition | Behavior |
|------------|-----------|----------|
| `loading` | Checking profile status | Show loading screen |
| `needs-onboarding` | No profiles exist for user | Redirect to `/onboarding` |
| `ready` | At least one profile exists | Allow access to app |

---

## Context Providers and State Management

### Provider Hierarchy

The providers are nested in a specific order in `components/providers/Providers.tsx`:

```typescript
<NotificationProvider>
  <AuthProvider>
    <SQLiteDatabaseProvider>
      <ModalManagerProvider>
        <ProfileProvider>
          <ProductProvider>
            <SearchProductProvider>
              {children}
              <ModalLoader />
            </SearchProductProvider>
          </ProductProvider>
        </ProfileProvider>
      </ModalManagerProvider>
    </SQLiteDatabaseProvider>
  </AuthProvider>
</NotificationProvider>
```

### Provider Dependencies

| Provider | Depends On |
|----------|------------|
| `AuthProvider` | `NotificationProvider` |
| `SQLiteDatabaseProvider` | None |
| `ProfileProvider` | `SQLiteDatabaseProvider`, `AuthProvider` |
| `ProductProvider` | `NotificationProvider`, `SQLiteDatabaseProvider` |
| `SearchProductProvider` | `NotificationProvider` |

---

## Navigation Patterns and Best Practices

### Use `router.push()` for Forward Navigation

Use `router.push()` when navigating to a new screen that should be added to the navigation stack:

```typescript
router.push("/(app)/product");
router.push("/(app)/membersEdit");
router.push("/settings/feedback");
```

### Use `router.replace()` for Authentication Flows

Use `router.replace()` when the user should not be able to go back (e.g., after login):

```typescript
// After successful login
router.replace("/(app)/(tabs)");

// After registration
router.replace('/login');

// After profile creation
router.replace("/(app)/(tabs)");
```

### Use `router.back()` for Back Navigation

Use `router.back()` to return to the previous screen:

```typescript
<Pressable onPress={() => router.back()}>
  <IconGeneral type="arrow-backward-ios" />
</Pressable>
```

### Use `<Link>` for Declarative Navigation

Use the `Link` component for static navigation links:

```typescript
<Link href="/register" className="text-primary">
  Create Account
</Link>
```

### Use `<Redirect>` for Conditional Redirects in Layouts

Use the `Redirect` component in layout files for authentication guards:

```typescript
if (!user) return <Redirect href="/login" />;
```

---

## Placeholder and Incomplete Routes

The following navigation items in the Settings screen currently redirect to the home tab and need implementation:

| Settings Item | Current Route | Status | Notes |
|---------------|---------------|--------|-------|
| Account & Profile | `/(app)/(tabs)` | Placeholder | No dedicated screen yet |
| Notification Settings | `/(app)/(tabs)` | Placeholder | No dedicated screen yet |
| Dark Mode Toggle | `/(app)/(tabs)` | Placeholder | No settings provider yet |
| Terms of Service | `/(app)/(tabs)` | Placeholder | No dedicated screen yet |
| About | `/(app)/(tabs)` | Placeholder | No dedicated screen yet |

### Unused Route

| File | Status | Notes |
|------|--------|-------|
| `app/forgotPassword.tsx` | Partially Used | Screen exists but reset functionality uses modal on login screen instead |

---

## Common Navigation Commands

### Import Statement

```typescript
import { router, Link, Redirect, usePathname } from "expo-router";
```

### Navigation Methods

```typescript
// Push a new screen onto the stack
router.push("/path");

// Replace current screen (no back navigation)
router.replace("/path");

// Go back to previous screen
router.back();

// Get current pathname
const pathname = usePathname();
```

### Link Component

```typescript
<Link href="/path">Navigate</Link>

<Link href="/path" className="custom-styles">
  Styled Link
</Link>
```

### Redirect Component

```typescript
// In layout or screen component
if (condition) {
  return <Redirect href="/path" />;
}
```

---

## Summary

The Food Remedy mobile app uses Expo Router for file-based navigation with:

- **Public routes** for authentication (login, register, forgot password)
- **Protected routes** guarded by authentication and profile gates
- **Tab navigation** for main app screens (scan, history, cart, profiles, settings)
- **Stack navigation** for detail screens (product, search, profile edit)
- **Context providers** for state management and data passing between screens

New developers should familiarize themselves with:

1. The file-based routing structure in `app/` directory
2. The authentication flow in `AuthProvider` and `(app)/_layout.tsx`
3. The profile gate logic in `useProfileGate` hook
4. The context providers for understanding data flow
5. The navigation patterns (push, replace, back) for different scenarios

---

## Document Information

| Field | Value |
|-------|-------|
| Created | December 2025 |
| Last Updated | December 2025 |
| Author | Development Team |
| Version | 1.0 |
