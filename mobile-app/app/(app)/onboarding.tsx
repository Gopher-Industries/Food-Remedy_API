// Onboarding tsx

import { View } from "react-native";
import ProfileCreateForm from "@/components/ProfileCreateForm";
import Screen from "@/components/layout/Screen";

export default function Onboarding() {
  return (
    <Screen className="p-safe">
      <ProfileCreateForm />
    </Screen>
  );
}
