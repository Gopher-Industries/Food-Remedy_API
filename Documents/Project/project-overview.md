# Food Remedy App – MVP Documentation

## 1. Overview

### 1.1 Product Vision
Food Remedy is a **consumer-focused mobile application** that helps users make smarter, healthier food choices. By scanning product barcodes, users receive instant feedback on nutritional content, allergen risks, dietary suitability, and healthier alternatives.  
The app delivers **personalized recommendations** based on dietary preferences, giving users confidence and clarity during everyday grocery shopping.

### 1.2 Strategic Pivot
The project originally targeted **local food producers via a web platform**.  
In Trimester 2, 2025, the team pivoted to a **mobile-first, consumer-focused solution**.  
The trimester goal: **deliver a functional MVP** with a scalable backend, updated database, and core mobile features (barcode scanning, nutrition insights, and personalized recommendations).


<br/>


## 2. Goals & Deliverables

### 2.1 Trimester Goals
- Migrate and adapt backend systems for mobile.
- Build **functional MVP** with barcode scanning and core screens.
- Conduct **market research and define target personas**.
- Develop **UI/UX prototypes** and implement core user flows.

### 2.2 Must-Have Features
- Functional barcode scanner.  
- User account creation and login.  
- Multiple household profiles.  
- Product scan → personalized nutrition info.

### 2.3 Nice-to-Have Features
- Profile switching on scan screen.  
- Scan history and favorites.  
- Accessibility features (text-to-speech).  
- Offline/cached scan mode.

### 2.4 Success Criteria (Definition of Done)
- App is installable and functional on iOS and Android.  
- Users can scan a product and see accurate, personalized results.  
- Supports **at least 3 user profiles** for testing.  
- Clear differentiation through personalization.  
- Usable in **real-world grocery settings**.


<br/>


## 3. User Personas & Journeys

### 3.1 User Personas

Below are the key personas that represent Food Remedy’s target users. These personas help guide design, features, and prioritization for the MVP.

#### Persona 1: Sarah – The Allergy-Aware Parent
- **Profile**: Busy working mother of two (ages 5 and 9). One child has severe peanut and gluten allergies.  
- **Goals**:  
  - Quickly scan packaged foods for allergens.  
  - Set up alerts for restricted ingredients.  
  - Find child-friendly, safe food suggestions.  
- **Frustrations**:  
  - Confusing ingredient labels.  
  - Inconsistent allergy warnings on packaging.  
- **App Usage**:  
  - Scans grocery items while shopping.  
  - Creates allergy profiles for her children.  
  - Saves safe product lists for school lunches.


#### Persona 2: Priya – The Budget-Conscious Vegetarian
- **Profile**: International university student, vegetarian, avoids dairy due to digestion issues.  
- **Goals**:  
  - Track nutritional content of food.  
  - Shop on a student budget without compromising health.  
  - Avoid hidden animal-based ingredients.  
- **Frustrations**:  
  - Uses multiple apps to verify food details.  
  - Difficulty finding vegetarian-friendly labeling on international products.  
- **App Usage**:  
  - Scans products for vegetarian/dairy-free tags.  
  - Uses app suggestions for meal planning.  
  - Tracks favorite stores and safe items.

#### Persona 3: Mark – The Dietician Consultant
- **Profile**: Clinical dietician who supports patients with allergies and chronic conditions.  
- **Goals**:  
  - Recommend a reliable tool for patient food tracking.  
  - Ensure clients follow accurate nutrition guidelines.  
  - Generate personalized food reports for patients.  
- **Frustrations**:  
  - Clients misread or ignore food labels.  
  - Manual food tracking is time-consuming.  
- **App Usage**:  
  - Sets dietary goals and restrictions for clients.  
  - Shares app links/QR codes for onboarding.  
  - Reviews patient food logs via an admin dashboard.


### 3.2 Key User Journeys
- **Onboarding** (sign up, set dietary preferences, create profiles).  
- **Barcode Scan Flow** (scan → analyze → results).  
- **Profile Management** (add, remove, switch household members).  
- **Scan History & Favorites** (optional for MVP).

**[Diagram Placeholder: User Flow]**


<br/>


## 4. App Flow & UI

### 4.1 Core Screens (Prototype Targets)
1. Login / Register  
2. Onboarding (preferences & profiles)  
3. Scan Interface (camera integration)  
4. Results Screen (nutrition info, allergen flags, recommendations)  
5. Profile & Settings

### 4.2 Navigation Flow
The app uses **tab navigation with nested stack flows** for scan, results, and settings.

**[Diagram Placeholder: App Flow Navigation Diagram]**

### 4.3 Wireframes
Annotated Figma wireframes will be included for all core screens.


<br/>


## 5. Technical Architecture

### 5.1 System Overview
The MVP consists of:
- **Frontend**: React Native (Expo Go) for mobile UI, camera, and scanning.
- **Backend**: Node.js (Express) for APIs and business logic.
- **Database**: PostgreSQL for structured data.
- **Third-Party APIs** (optional): Barcode lookup and nutrition data sources.

**[Diagram Placeholder: System Architecture Diagram]**


<br/>


## 6. Backend & Database Specification

### 6.1 User Accounts
Each user account includes:
- Email (unique)  
- Password (hashed)  
- First/Last Name  
- Account ID (auto-generated)  
- Date Created (timestamp)

**API Endpoints:**
- `POST /users/register` – Create account  
- `POST /users/login` – Authenticate and return token  
- `GET /users/{id}` – Fetch account details  
- `PUT /users/{id}` – Update user details  
- `DELETE /users/{id}` – Deactivate account  

### 6.2 Household Member Profiles
Each account can have multiple profiles with:
- Profile ID  
- Linked Account ID  
- Name, Age (optional)  
- Relationship (e.g., Child, Partner)  
- Allergies (multi-select list)  
- Intolerances/Sensitivities (multi-select or text)

**API Endpoints:**
- `POST /profiles` – Create profile  
- `GET /profiles/{accountId}` – Fetch all profiles for a user  
- `PUT /profiles/{profileId}` – Update profile  
- `DELETE /profiles/{profileId}` – Remove profile  

### 6.3 Food Product Table
Each product entry includes:
- Product ID  
- Barcode (unique)  
- Product Name  
- Brand Name (optional)  
- Ingredient List (text)  
- Nutrition Information (JSON or structured fields)  
- Health Rating (optional)  
- Date Added / Last Updated (timestamps)

### 6.4 Scan History Table
Tracks every scan:
- Scan ID  
- Linked Account ID  
- Barcode (foreign key)  
- Date Scanned (timestamp)

**[Diagram Placeholder: Database ERD]**


<br/>


## 7. Future Considerations
- Accessibility (screen readers, text-to-speech).  
- Recipe and meal planning features.  
- Offline caching for scans.  
- GDPR and data privacy compliance.

