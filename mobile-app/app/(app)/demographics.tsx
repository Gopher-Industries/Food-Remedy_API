import { View, Pressable, ScrollView } from "react-native";
import { useState } from "react";
import { useRouter } from "expo-router";
import Screen from "@/components/layout/Screen";
import Header from "@/components/layout/Header";
import Tt from "@/components/ui/UIText";
import IconGeneral from "@/components/icons/IconGeneral";

export default function DemographicsScreen() {
  const router = useRouter();

  const [ageBand, setAgeBand] = useState("18-25");
  const [sex, setSex] = useState("female");
  const [level, setLevel] = useState("moderate");

  const OptionRow = ({
    label,
    selected,
    onPress,
  }: {
    label: string;
    selected: boolean;
    onPress: () => void;
  }) => (
    <Pressable
      onPress={onPress}
      className={`flex-row justify-between items-center px-4 py-4 border-b border-hsl85 ${
        selected ? "bg-hsl98" : ""
      }`}
    >
      <Tt className="text-base">{label}</Tt>
      {selected && (
        <IconGeneral type="check" size={20} fill="#FF3F3F" />
      )}
    </Pressable>
  );

  return (
    <Screen className="p-safe">
      <Header />

      {/* Back + Title */}
      <View className="flex-row items-center justify-between px-4 my-4">
        <Pressable onPress={() => router.back()}>
          <IconGeneral type="arrow-backward-ios" size={24} fill="gray" />
        </Pressable>

        <Tt className="text-xl font-interBold">Demographics</Tt>

        <View style={{ width: 24 }} />
      </View>

      <ScrollView>
        {/* AGE BAND */}
        <View className="px-4 py-2 bg-hsl90">
          <Tt className="font-interMedium">Age Band</Tt>
        </View>

        <OptionRow
          label="18 - 25 years"
          selected={ageBand === "18-25"}
          onPress={() => setAgeBand("18-25")}
        />
        <OptionRow
          label="26 - 35 years"
          selected={ageBand === "26-35"}
          onPress={() => setAgeBand("26-35")}
        />
        <OptionRow
          label="36 - 50 years"
          selected={ageBand === "36-50"}
          onPress={() => setAgeBand("36-50")}
        />

        {/* SEX */}
        <View className="px-4 py-2 bg-hsl90 mt-4">
          <Tt className="font-interMedium">Sex</Tt>
        </View>

        <OptionRow
          label="Female"
          selected={sex === "female"}
          onPress={() => setSex("female")}
        />
        <OptionRow
          label="Male"
          selected={sex === "male"}
          onPress={() => setSex("male")}
        />
        <OptionRow
          label="Other / Prefer not to say"
          selected={sex === "other"}
          onPress={() => setSex("other")}
        />

        {/* GUARDRAIL */}
        <View className="px-4 py-2 bg-hsl90 mt-4">
          <Tt className="font-interMedium">Nutrition Level</Tt>
        </View>

        <OptionRow
          label="Relaxed"
          selected={level === "relaxed"}
          onPress={() => setLevel("relaxed")}
        />
        <OptionRow
          label="Moderate"
          selected={level === "moderate"}
          onPress={() => setLevel("moderate")}
        />
        <OptionRow
          label="Strict"
          selected={level === "strict"}
          onPress={() => setLevel("strict")}
        />

        {/* SAVE BUTTON */}
        <View className="px-4 mt-6">
          <Pressable
            onPress={() => {
              alert("Demographics saved!");
              router.back();
            }}
            className="bg-primary py-3 rounded-lg"
          >
            <Tt className="text-center text-white font-interSemiBold">
              Save
            </Tt>
          </Pressable>
        </View>
      </ScrollView>
    </Screen>
  );
}