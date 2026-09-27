# BE025 - Registration State Contract

## Purpose

This document defines the expected registration and recovery behaviour for email/password accounts.

## Registration Flow

Registration follows this order:

1. Create the Firebase Authentication user.
2. Check whether the user's `USERS/{uid}` Firestore document exists.
3. Create the Firestore user document if it is missing.
4. Send a verification email if the user's email is not already verified.
5. Return registration success when provisioning completes successfully.

## Recovery Behaviour

### Auth Created, Firestore Provisioning Failed

If Firebase Authentication succeeds but Firestore provisioning fails:

- The existing Auth account is preserved.
- A safe error message is returned to the user.
- The internal Firestore error is logged but is not exposed to the UI.
- The user can retry registration using the same email and password.
- On retry, the existing Auth account is authenticated and the missing Firestore document is created.

### Verification Email Failed

If Auth and Firestore provisioning succeed but sending the verification email fails:

- The Auth account and Firestore document are preserved.
- A safe error message is returned.
- The internal provider error is logged but is not exposed to the UI.
- Verification can be retried without recreating the Firestore document.

### Existing Fully Provisioned Account

If the Auth account and `USERS/{uid}` document already exist:

- The Firestore document is not created again.
- Registration returns the existing "This email is already in use." response.

## Idempotency

Recovery checks for the existing `USERS/{uid}` document before provisioning. A missing document is created during recovery, while an existing document is not duplicated.

## Error Handling

Known validation errors continue to return user-actionable messages.

Unexpected Firebase, Firestore, and verification-provider errors are logged internally and replaced with safe public messages so implementation details are not exposed to the UI.

## Validation

The registration regression tests cover:

- Successful registration.
- Firestore provisioning failure.
- Recovery of an existing Auth user with a missing Firestore document.
- Prevention of duplicate Firestore provisioning.
- Verification-email failure.
- Sanitization of unexpected registration errors.

Test result:

- **16 tests passed**
- **1 test suite passed**