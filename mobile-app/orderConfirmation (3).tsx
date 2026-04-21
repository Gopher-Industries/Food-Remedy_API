import { View, Text, ScrollView, Pressable } from "react-native";
import { useRouter } from "expo-router";
import IconGeneral from "@/components/icons/IconGeneral";

// ── Dummy data ────────────────────────────────────────────────
const DUMMY_ADDRESS = {
  name: "John Doe",
  phone: "+61 412 345 678",
  street: "123 Green Avenue, Apt 4B",
  suburb: "Melbourne",
  state: "VIC",
  postcode: "3000",
  country: "Australia",
  label: "Home",
};

const DUMMY_NOTE = "Please leave the package at the door if no one is available.";
// ─────────────────────────────────────────────────────────────

export default function OrderConfirmationPage() {
  const router = useRouter();

  const handleConfirmOrder = () => {
    // TODO: Save order to Firestore and navigate to success screen
    console.log("Order confirmed!");
  };

  const handleEdit = () => {
    // TODO: Navigate to edit address screen
    console.log("Edit address");
  };

  return (
    <View className="flex-1 bg-[#F5F5F0]">

      {/* Header */}
      <View className="flex-row items-center px-4 pt-14 pb-4 bg-white border-b border-gray-100">
        <Pressable onPress={() => router.back()} className="mr-3">
          <IconGeneral type="arrow-backward-ios" fill="#000" size={24} />
        </Pressable>
        <Text className="text-lg font-semibold">Order Summary</Text>
      </View>

      <ScrollView
        className="flex-1 px-4 pt-4"
        contentContainerStyle={{ paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >

        {/* Payment Mode Card */}
        <View className="bg-white rounded-2xl p-4 mb-4 shadow-sm">
          <View className="flex-row items-center mb-2">
            <View className="bg-green-100 p-2 rounded-full mr-3">
              <IconGeneral type="cart-active" fill="#16a34a" size={20} />
            </View>
            <View>
              <Text className="text-xs text-gray-400 uppercase tracking-widest">Payment Mode</Text>
              <Text className="text-base font-semibold text-gray-800">Cash on Delivery</Text>
            </View>
          </View>
          <View className="bg-gray-50 rounded-lg px-3 py-2 mt-1">
            <Text className="text-sm text-gray-500">
              Pay with cash when your order is delivered to your doorstep.
            </Text>
          </View>
        </View>

        {/* Delivery Address Card */}
        <View className="bg-white rounded-2xl p-4 mb-4 shadow-sm">
          <View className="flex-row items-center justify-between mb-3">
            <View className="flex-row items-center">
              <IconGeneral type="info" fill="#16a34a" size={18} />
              <Text className="text-xs font-bold text-gray-500 uppercase tracking-widest ml-2">
                Delivery Address
              </Text>
            </View>
            <Pressable onPress={handleEdit} className="flex-row items-center">
              <IconGeneral type="edit" fill="#16a34a" size={16} />
              <Text className="text-sm text-green-600 ml-1 font-medium">Edit</Text>
            </Pressable>
          </View>

          {/* Name */}
          <Text className="text-base font-semibold text-gray-800 mb-1">
            {DUMMY_ADDRESS.name}
          </Text>

          {/* Phone */}
          <View className="bg-gray-100 self-start rounded px-2 py-0.5 mb-2">
            <Text className="text-sm text-gray-600">{DUMMY_ADDRESS.phone}</Text>
          </View>

          {/* Address Lines */}
          <View className="bg-gray-100 rounded-lg px-3 py-2 mb-3">
            <Text className="text-sm text-gray-700">{DUMMY_ADDRESS.street}</Text>
            <Text className="text-sm text-gray-700">
              {DUMMY_ADDRESS.suburb}, {DUMMY_ADDRESS.state} — {DUMMY_ADDRESS.postcode}
            </Text>
            <Text className="text-sm text-gray-700">{DUMMY_ADDRESS.country}</Text>
          </View>

          {/* Address Label */}
          <View className="flex-row items-center self-start bg-green-50 border border-green-200 rounded-full px-3 py-1">
            <IconGeneral type="person" fill="#16a34a" size={12} />
            <Text className="text-xs text-green-700 ml-1 font-medium">{DUMMY_ADDRESS.label}</Text>
          </View>
        </View>

        {/* Delivery Note Card */}
        <View className="bg-white rounded-2xl p-4 shadow-sm">
          <Text className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">
            Delivery Note
          </Text>
          <Text className="text-sm text-gray-500 italic">{DUMMY_NOTE}</Text>
        </View>

      </ScrollView>

      {/* Confirm Order Button */}
      <View className="absolute bottom-0 left-0 right-0 px-4 pb-8 pt-4 bg-white border-t border-gray-100">
        <Pressable
          onPress={handleConfirmOrder}
          className="bg-green-600 rounded-xl py-4 active:bg-green-700"
        >
          {({ pressed }) => (
            <Text className={`text-center text-white font-semibold text-base ${pressed ? "opacity-80" : ""}`}>
              Confirm Order
            </Text>
          )}
        </Pressable>
      </View>

    </View>
  );
}
