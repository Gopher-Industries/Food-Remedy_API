/**
 * Nutritional Profile
 */
export interface NutritionalProfile {
  userId: string;                 // account owner UID
  profileId: string;              // household profile ID
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
  // Demographic fields
  ageBand?: string;
  sex?: string;
  guardrailLevel?: string;
  /** Account-owner consent required before collecting events for a child profile. */
  recommendationEvidenceConsent?: boolean;
  healthGoal?:
  | "weight_loss"
  | "muscle_gain"
  | "maintenance";
}
