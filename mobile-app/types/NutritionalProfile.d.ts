/**
 * Nutritional Profile
 */
export interface NutritionalProfile {
  userId: string;                 // profile id (UUID)
  profileId: string;              // owner user id
  firstName: string;
  lastName: string;
  status: boolean;
  relationship: string;           // e.g. "Self" if owner, else "Child", "Sibling" etc
  age: number;
  avatarUrl: string;
  additives: string[];
  allergies: string[];
  intolerances: string[];
  dietaryForm: string[];          // e.g. ['Vegetarian', 'Low FODMAP']
}