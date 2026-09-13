# BE024 - Repository Credential Containment and Rotation Verification

## Repository Finding

Credential-related artifacts were identified as tracked files under:

`Documents/Guides/Leadership/Credentials/`

The affected repository artifacts included a credential ZIP archive and credential spreadsheet. Repository documentation also contained credential-handling information that was not appropriate for source control.

No secret values are reproduced in this record.

## Containment Actions

The following repository containment actions were completed:

- Removed the tracked credential ZIP artifact from the current repository tree.
- Removed the tracked credential spreadsheet from the current repository tree.
- Removed repository documentation containing credential values.
- Updated Firebase access documentation with safe credential storage and recovery guidance.
- Added explicit `.gitignore` rules preventing the removed credential artifacts from being recommitted.
- Existing ignore protection for `serviceAccountKey.json` was retained.

## Credential Status and Rotation

The repository artifacts may contain or previously have contained authentication or recovery information.

Whether the contained credentials remain active must be verified privately by an authorised Firebase/Google account owner.

If any credential is active, or its status cannot be safely established, it must be revoked or rotated by an authorised owner.

Rotation/revocation is **not recorded as complete until confirmed by an authorised account owner**.

No production credential changes were performed as part of repository containment without owner approval.

## Access Verification

After any required rotation:

- Replacement access must be verified by an authorised user.
- Previous credentials must be confirmed unusable where technically possible.
- Critical administrative access should be recoverable by at least two approved Leads where organisationally possible.

No credential values should be included as evidence.

## Repository Controls

Credential artifacts must remain outside Git, including:

- Credential archives and spreadsheets.
- Service account private keys.
- Environment files containing secrets.
- Private keys and credential certificates.

Repository history must not be rewritten without Lead approval.

## Validation

Final validation should include:

- Confirming the removed credential artifacts are absent from the current repository tree.
- Confirming ignore rules prevent the identified artifacts from being recommitted.
- Running a secret scan against the final repository tree.
- Recording rotation/revocation confirmation from the authorised account owner where required.

## Current Status

Repository containment: **Completed locally, pending PR review/merge.**

Credential rotation/revocation: **Pending authorised owner verification.**

Replacement access verification: **Pending if rotation is required.**

Secret scan: **Pending.**
