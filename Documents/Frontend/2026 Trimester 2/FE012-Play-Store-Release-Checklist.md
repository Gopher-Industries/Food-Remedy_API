# FE012 — Frontend Play Store Release Checklist

**Ticket:** FE012 — Frontend Play Store QA Checklist  
**Trimester:** 2026 Trimester 2  
**Repository:** `Food-Remedy_API`  
**Application path:** `mobile-app/` (Expo / React Native)  
**Package name:** `com.bryce_pillwein.foodremedy`  
**Release:**  
**Last updated:** August 2026  
**Audience:** Frontend developers and release testers  

---

## 1. Purpose

Use this checklist to verify that the Food Remedy Android app is ready to publish on Google Play. It covers the release artefact, the Play Console configuration, and the frontend flows that must work before a release candidate is promoted.

Create a copy for each release and record the result of every check. Do not complete the template itself.

## 2. Release criteria

- Test the release candidate on at least one physical Android device, using the same build that will be uploaded.
- Tick a check only when it has been verified on that build. Leave it unticked if it fails, is blocked, or does not apply.
- Record every unticked check in the sign-off table, with evidence and a tracking ticket.

## 3. Test environment

| Field | Details |
|---|---|
| App version and build number | |
| Build type | Release candidate / Production |
| Device model | |
| Android version | |
| Tester | |
| Test date | |
| Network conditions | Wi-Fi / Mobile / Offline where applicable |
| Backend environment | |

## 4. Build and signing

- [ ] The version code is incremented and higher than any build already published on the track.
- [ ] The artefact is a signed release Android App Bundle accepted by Play App Signing.
- [ ] The application ID is `com.bryce_pillwein.foodremedy` and the target API level meets the current Play requirement.
- [ ] The manifest requests only the permissions the app uses, currently camera and media access.
- [ ] Development-only configuration, debug menus, and verbose logging are disabled.
- [ ] The build installs over the previously published version without data loss.

## 5. Policy, privacy, and data safety

The app creates user accounts and stores dietary and allergen information, so the declarations below must match what the build actually does.

- [ ] The Data safety form matches what the build collects, including account email and dietary or allergen data.
- [ ] A working privacy policy URL is linked in the Play Console and covers the health-related data the app stores.
- [ ] Users can delete their account from within the app, and the required web deletion route is published.
- [ ] Camera and media permissions are explained to the user before the system prompt appears.
- [ ] Nutrition, allergen, and suitability information is not presented as medical advice.
- [ ] The content rating questionnaire and target audience declarations are complete and accurate.

## 6. Authentication

- [ ] A new account can be created, and a duplicate email address is rejected with a clear message.
- [ ] Invalid email and password input is rejected with clear validation.
- [ ] Valid credentials sign the user in, and an incorrect password shows an error without leaving the screen.
- [ ] Error states clear when the user edits the relevant field, and the password visibility control works (FE002, FE011).
- [ ] The signed-in session behaves as expected after the app is closed and reopened.
- [ ] A password reset can be requested, the email opens the reset flow, and the new password works.
- [ ] The reset response does not reveal whether an account exists for the submitted address.
- [ ] A signed-in user can change their password with the correct current password, and an incorrect one is rejected.
- [ ] Repeated taps on submit controls do not create duplicate accounts, screens, or requests (FE013).
- [ ] Guest users reach guest features, account-only routes show a login prompt, and signing in returns them to the intended destination.

## 7. Scan flows

### Camera permission granted

- [ ] The camera permission prompt appears at an appropriate time, and granting it opens a working preview.
- [ ] Scanning a supported barcode returns the correct product once, with details matching the scanned item.
- [ ] Poor focus, low light, and unsupported barcodes are handled without a crash or frozen screen.

### Camera permission denied

- [ ] Denying permission shows a clear explanation rather than a black or broken camera view.
- [ ] A non-camera option remains available, and permanent denial offers a working route to Android app settings.
- [ ] Granting permission in settings restores the camera flow without requiring a reinstall.

### Manual entry fallback

- [ ] Manual entry is reachable when scanning is unavailable or unsuccessful.
- [ ] A valid barcode returns the matching product, and invalid input is rejected with clear validation.
- [ ] An unknown barcode shows a useful "product not found" state with a way to retry or return to the scanner.

### Image upload fallback

Complete barcode-decoding checks only if the relevant implementation (FE014) is included in the build.

- [ ] Media access is requested only when required, and denial or cancellation is handled without a crash.
- [ ] An image containing a readable barcode returns the correct product.
- [ ] An unreadable, large, or unsupported image shows clear feedback and offers a retry path.

## 8. Accessibility

Test with Android TalkBack enabled and the system font size increased.

- [ ] TalkBack focus follows a logical order and moves appropriately after navigation or an error.
- [ ] Interactive controls have meaningful accessible names and roles, and decorative images are ignored (FE016).
- [ ] Validation errors and scan results are announced when they appear (FE019).
- [ ] Interactive touch targets are at least `48 × 48 dp` or provide an equivalent tappable area.
- [ ] Text remains readable and usable at the largest supported system font size.
- [ ] Colour is not the only way status, errors, or allergen information is communicated, and contrast is sufficient in both themes.

## 9. Display and theming

- [ ] All in-scope screens are readable and usable in both light and dark themes, including after the theme is changed while the app is open.
- [ ] Inputs, disabled states, errors, and selection states remain distinguishable in both themes.
- [ ] Core flows work on the smallest supported Android screen without clipping or overlap.
- [ ] Long product names, ingredients, and validation messages wrap or scroll correctly.
- [ ] The keyboard, camera overlay, dialogs, and bottom sheets do not hide essential controls.

## 10. Navigation and back behaviour

- [ ] The Android Back gesture and button return to the expected previous screen.
- [ ] Back closes an open keyboard, dialog, or bottom sheet before leaving the current screen.
- [ ] Repeated scans or failures do not add duplicate screens to the navigation stack.
- [ ] Leaving search or an error state does not return the user to stale content.
- [ ] Authentication redirects do not create a navigation loop.
- [ ] No screen traps the user without a working back, close, or recovery action.

## 11. Crash, error, and privacy

- [ ] No crash, freeze, or React Native error screen occurs during any check in this document.
- [ ] Network failures, timeouts, and offline states show a useful message and a recovery action.
- [ ] Logs contain no passwords, authentication or CAPTCHA tokens, email addresses, personal details, or health information.
- [ ] User-facing failures are surfaced to the user rather than only written to the console.
- [ ] Crash reporting, if enabled, uses the production configuration and excludes sensitive data.

> Verify logging against the release commit rather than relying on any previously recorded count or line number.

## 12. Release sign-off

| Field | Details |
|---|---|
| Checklist completed by | |
| Completion date | |
| Failed or blocked checks | |
| Related ticket links | |
| Accepted non-blocking risks | |
| Release decision | Go / No-go |
| Approved by | |
