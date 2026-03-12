# 🔐 Firebase & Firestore Access Guide

This document explains how to securely manage access to the **Firebase project** and **Firestore service account** used by the Food Remedy App.  
These credentials allow authorised scripts to upload or modify data in the database.  
Only approved team members should have this access.  


<br />


## ⚠️ Important Security Rules

- Never upload any credentials (JSON keys, passwords) to GitHub.  
- Never share Firebase or Google account logins through email or chat.  
- Only **team leaders** and **database members** should have access.  
- Remove all old keys and accounts when new members take over.  
- All sensitive files must be stored in secure university folders, not in the public repository.


<br />


## 🧭 Firebase Project Access (Google Account)

The Firebase project is linked to a protected Google account.  
Only authorised users can access the project dashboard and Firestore data.

### Access Control
- **Owner / Editor:** Team Leaders only  
- **Viewer / Firestore User:** Database members  
- **No Access:** Other project members

Leaders can manage permissions under:  
**Firebase Console → Project Settings → Users and Permissions**

### Login Credentials

The Google account login details and 2FA recovery codes are stored securely in one of the following files:  
- `Documents\Guides\Leadership\Credentials\FirebaseCredentials.zip`  
- `Documents\Guides\Leadership\Credentials\FirebaseCredentials.xlsx`  
  *(Restricted access – only team leaders and the academic supervisor)*  

Both files are **password protected**.  
Do **not** upload or share these files publicly, and never commit them to GitHub.

### 📂 How to Open the Credentials File

> Password to open credentials:  
> `foodremedy`

#### If you are using the ZIP file:
1. Ensure **7-Zip** is installed (download from [7-zip.org](https://www.7-zip.org/)).  
2. Right-click the file → select **7-Zip → Extract Here** or **Open archive**.  
3. Enter the password when prompted.  
4. Once extracted, you will see the credentials text file inside.  
   Open it with a simple text editor like Notepad.

> ⚠️ Note: Do not double-click the ZIP to open it using Windows Explorer,  
> as Windows may show an “Unspecified Error” for encrypted ZIPs.  
> Always use 7-Zip.

<br />

#### If you are using the Excel file:
1. Double-click `FirebaseCredentials.xlsx`.  
2. Enter the password when Excel asks for it.  
3. Review or update details inside the workbook as needed.  
4. Save and close the file securely after use.

> 🔐 Excel files use strong encryption (AES-256).  
> Always keep the password private and store it separately.


<br />


## 🧰 Firestore Service Account Key

The Firestore service account key allows scripts to connect to Firebase securely.  
It is stored as a private JSON file named:  
`serviceAccountKey.json`


### File Location
Store the file **locally** (not in GitHub) within:  
`database/seeding/serviceAccountKey.json`


### Generating a New Key
Only team leaders can generate a new service account key:  
1. In Firebase Console, go to  
   **Project Settings → Service Accounts → Generate New Private Key**  
2. Rename the file to `serviceAccountKey.json`  
3. Replace the old key and delete previous copies  
4. Share securely with authorised members only