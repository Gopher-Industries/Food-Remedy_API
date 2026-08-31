# 📱 Food Remedy Mobile App

This is the React Native frontend for the FoodRemedy platform.  
It uses **Expo** for fast development and cross-platform compatibility.  

## ⚙️ Prerequisites
Make sure you have:

- [Node.js](https://nodejs.org/) installed
- [Expo CLI](https://docs.expo.dev/get-started/installation/):  
   ```bash
   npm install -g expo-cli
   ```
- Install the Expo Go app on your iOS or Android device to preview the app via QR code.


<br/>


## 🚀 Getting Started
1. Navigate to the mobile-app folder
    ```bash
    cd mobile-app
    ```
2. Install Dependencies (First Time Only)
    ```bash
    npm install
    ```
3. Start the App
    ```bash
    npm start 
    ```


<br/>


### Run the App on Your Device or Simulator
It is reccomended to use your phone for best compatability. This works for both android and iOS.

> ⚠️ Make sure your phone is on the same Wi-Fi network if scanning QR  

Choose one of the following:
- 📱 Physical Device:
  - Scan the QR code with the Expo Go app (Android)
  - Or use your iPhone Camera app (iOS)
- 💻 Simulators:
    - Press `i` to open in iOS Simulator (Mac only)
    - Press `a` to open in Android Emulator (if available)

<br />

### Example Terminal Output
```bash
▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
█ ▄▄▄▄▄ █▄▄▄▀▀▀█▀ ▀ ▄▄▄▄▄ █
█ █   █ ██▄▀▀█▀▀▄▄█ █   █ █
█ █▄▄▄█ ██▀▄ ▄▄██▀█ █▄▄▄█ █
█▄▄▄▄▄▄▄█ ▀▄█ ▀▄▀ █▄▄▄▄▄▄▄█
█▄ █▄▄█▄██▄▀█▄▀█▀ █▄█▀█▀▀▄█
██ █▀██▄▄▄▄██▄▄▄▄▀▀███▄▀▀ █
█▀▄▄ █▄▄▄▄▄ █▀█▄ █ ▄▀▀█▀ ██
█ ▄█▀ █▄ █▀▄█▀▄▀▀▀▀▀██▄▀▀ █
█▄██▄▄█▄█ ▄  ▄▄ █ ▄▄▄  ▄▀▄█
█ ▄▄▄▄▄ █▀▀▀▀▄  █ █▄█ ███ █
█ █   █ █ ▀█▄ ▀█▄ ▄  ▄ █▀▀█
█ █▄▄▄█ █▀▄▀▀▀▀▄ ▄█▀▀▄█   █
█▄▄▄▄▄▄▄█▄██▄██▄▄▄▄█▄▄███▄█

› Metro waiting on exp://192.165.0.146:8081
› Scan the QR code above with Expo Go (Android) or the Camera app (iOS)

› Using Expo Go
› Press s │ switch to development build

› Press a │ open Android
› Press w │ open web

Logs for your project will appear below. Press Ctrl+C to exit.
```

<br />

## Credentials
You can create a new account for the app using your own email and password.  
This is handled securly by Google Firebase Authentication, and as such, no one in the project has access to your password. Only your email. Regardless, you need to manage your own security.  

### Guest access

Guest sessions are explicitly stored and are limited to scanning barcodes, searching and browsing products, and viewing basic product and nutrition information. History, shopping lists, checkout, saved items, profiles, settings, and all other account features require registration or login. Protected routes are denied by default and return a newly authenticated user to the requested route.


<br />

## Environment

Expo reads public environment variables from `.env`:

- `EXPO_PUBLIC_API_BASE_URL` — Backend base URL (e.g. `http://127.0.0.1:8000`)
- `EXPO_PUBLIC_API_SOURCE` — `auto` (default), `api`, or `firestore`. For recommendations,
  `auto` prefers the HTTP API when a base URL is configured and falls back to Firestore
  when it is missing or the request fails. `api` is strict and requires a base URL.

Example `.env`:

```env
EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:8000
EXPO_PUBLIC_API_SOURCE=auto
```

### Firestore Recommendation Mode

When `EXPO_PUBLIC_API_SOURCE=firestore`:

- The app computes suitability and recommendations locally via `services/recommendations.ts`.
- Candidate products are fetched from Firestore `PRODUCTS` using category-based queries (see `services/database/products/getCandidatesForRecommendations.ts`).
- Ensure `PRODUCTS` documents have `categories: string[]` and create indexes when Firestore prompts for `array-contains-any` queries.

Backend mode remains available by default. The app will use server-provided alternatives from `POST /scan/alternatives` and only fall back to Firestore when needed.

## Finished
Begin contributing to the project.  
Now read:
 - [🧑‍💻 How To Contribute Here](../Documents/Guides/General/how-to-contribute.md)
