# 🔐 Firebase & Firestore Access Guide

This document explains how to securely manage access to the **Firebase project** and **Firestore service account** used by the Food Remedy App.

These credentials allow authorised users and scripts to access or modify project resources.

Only approved team members should have this access.

<br />

## ⚠️ Important Security Rules

- Never upload credentials, passwords, recovery codes, private keys, or service account files to GitHub.
- Never store credential values directly in repository documentation.
- Never share Firebase or Google account credentials through tickets, pull requests, email, or public chat.
- Only authorised team members should have access.
- Revoke access and rotate credentials when they are exposed or no longer required.
- Sensitive credentials must be stored in an approved secure credential store outside the repository.

<br />

## 🧭 Firebase Project Access

Access to the Firebase project should be provided through individual authorised accounts rather than shared credentials where possible.

### Access Control

- **Owner / Editor:** Approved Team Leads
- **Viewer / Firestore User:** Approved project members requiring database access
- **No Access:** Users who do not require Firebase access

Leads can manage permissions through:

**Firebase Console → Project Settings → Users and Permissions**

### Credential Storage

Google account credentials, recovery codes, service account keys, and other secret material must not be stored in this repository.

The previously tracked credential archives and spreadsheets have been removed from the current repository tree.

Approved Leads are responsible for maintaining access through an authorised secure credential-management location outside GitHub.

No passwords, recovery codes, private keys, or other secret values should be recorded in this document.

<br />

## 🧰 Firestore Service Account Key

A Firestore service account key may be required by authorised scripts that connect to Firebase.

The private JSON key must never be committed to GitHub.

### Local File Location

Where a local service account key is required, store it locally as:

`database/seeding/serviceAccountKey.json`

This path is excluded from Git tracking.

### Generating or Rotating a Key

Only an authorised Firebase administrator should generate or rotate a service account key.

1. Open the Firebase/Google Cloud project using an authorised account.
2. Locate the relevant service account.
3. Revoke or disable an exposed or obsolete key.
4. Generate a replacement key only when required.
5. Store the replacement securely outside the repository.
6. Verify that authorised integrations work with the replacement credential.
7. Where rotation occurred, verify that the previous credential can no longer be used.

Never include the generated key or its contents in a ticket, pull request, screenshot, documentation file, or Git commit.

<br />

## 🔄 Access Recovery

Critical Firebase access should not depend on a credential stored in the repository.

Where organisationally possible:

- At least two approved Leads should have appropriate administrative access.
- Leads should use their individually authorised accounts.
- Recovery information should be stored in an approved secure location outside GitHub.
- Changes to Firebase ownership or administrative access should be documented without recording secret values.
- When project leadership changes, access should be reviewed and obsolete access removed.

If access is lost, an approved Lead or project owner should use the organisation's authorised account-recovery process rather than retrieving credentials from the repository.

<br />

## 🛡️ Repository Credential Controls

The repository must exclude known credential artifacts, including:

- `FirebaseCredentials.zip`
- `FirebaseCredentials.xlsx`
- `serviceAccountKey.json`
- Environment files containing secrets
- Private keys and certificate credential files

Credential files must remain outside Git even when they are encrypted or password protected.

Before release, the current repository tree should be checked for credential-named or secret-containing files.

<br />

## 📋 Credential Rotation Responsibility

If a credential is discovered in the repository:

1. Do not publish or copy the credential into a ticket, PR, or chat.
2. Notify an approved Lead or account owner.
3. Determine whether the credential is still active.
4. Revoke or rotate it if it is active or its status cannot be safely established.
5. Verify replacement access.
6. Record the outcome without recording secret values.
7. Confirm the repository no longer contains the credential material.

Repository history must not be rewritten without Lead approval.