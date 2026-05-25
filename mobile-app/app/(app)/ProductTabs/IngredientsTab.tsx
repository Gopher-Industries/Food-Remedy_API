import React, { useMemo } from "react";
import { View, Text, ScrollView, StyleSheet } from "react-native";
import IngredientSearch from "@/components/product/IngredientSearch";
import { useProduct } from "@/components/providers/ProductProvider";
import { usePreferences } from "@/components/providers/PreferencesProvider";

export default function IngredientsTab() {
  const { currentProduct } = useProduct();

  // Get dark mode value from preferences provider
  const { darkMode } = usePreferences();

  // Raw ingredients text
  const ingredientsText = useMemo(() => {
    return (
      currentProduct?.ingredientsText ||
      "No ingredient information available."
    );
  }, [currentProduct]);

  // Split ingredients + allergen info
  const { ingredientsList, allergenInfo } = useMemo(() => {
    const parts = ingredientsText.split("Allergen");

    const ingredientsPart = parts[0];
    const allergenPart = parts[1];

    const list = ingredientsPart
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

    return {
      ingredientsList: list,
      allergenInfo: allergenPart
        ? "Allergen " + allergenPart.trim()
        : null,
    };
  }, [ingredientsText]);

  return (
    <ScrollView
      style={[
        styles.container,
        darkMode && styles.containerDark,
      ]}
    >
      {/* Page Title */}
      <Text
        style={[
          styles.title,
          darkMode && styles.darkText,
        ]}
      >
        Ingredients
      </Text>

      {/* Search Bar */}
      <View style={styles.searchWrapper}>
        {/* <IngredientSearch /> */}
      </View>

      {/* Ingredients Card */}
      <View
        style={[
          styles.card,
          darkMode && styles.cardDark,
        ]}
      >
        <Text
          style={[
            styles.cardTitle,
            darkMode && styles.darkText,
          ]}
        >
          Ingredient List
        </Text>

        <View style={styles.ingredientsContainer}>
          {ingredientsList.map((item, index) => (
            <View
              key={index}
              style={[
                styles.ingredientChip,
                darkMode && styles.ingredientChipDark,
              ]}
            >
              <Text
                style={[
                  styles.ingredientText,
                  darkMode && styles.ingredientTextDark,
                ]}
              >
                {item}
              </Text>
            </View>
          ))}
        </View>
      </View>

      {/* Allergen Section */}
      {allergenInfo && (
        <View
          style={[
            styles.card,
            styles.allergenCard,
            darkMode && styles.cardDark,
          ]}
        >
          <Text
            style={[
              styles.cardTitle,
              darkMode && styles.darkText,
            ]}
          >
            Allergen Advice
          </Text>

          <Text
            style={[
              styles.allergenText,
              darkMode && styles.ingredientTextDark,
            ]}
          >
            {allergenInfo}
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  // Main container
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: "#f8f8f8",
  },

  // Dark mode container
  containerDark: {
    backgroundColor: "#121212",
  },

  // Screen title
  title: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 16,
    color: "#000000",
  },

  // Force white text in dark mode
  darkText: {
    color: "#FFFFFF",
  },

  // Search wrapper
  searchWrapper: {
    marginBottom: 16,
  },

  // Card styling
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,

    // Shadow for iOS
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 6,

    // Shadow for Android
    elevation: 2,
  },

  // Dark card
  cardDark: {
    backgroundColor: "#1E1E1E",
  },

  // Card title
  cardTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 12,
    color: "#000000",
  },

  // Ingredients wrapper
  ingredientsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
  },

  // Ingredient chip
  ingredientChip: {
    backgroundColor: "#f1f1f1",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginRight: 8,
    marginBottom: 8,
  },

  // Dark chip
  ingredientChipDark: {
    backgroundColor: "#2A2A2A",
  },

  // Ingredient text
  ingredientText: {
    fontSize: 13,
    color: "#333333",
  },

  // White text for dark mode
  ingredientTextDark: {
    color: "#FFFFFF",
  },

  // Allergen card
  allergenCard: {
    borderLeftWidth: 4,
    borderLeftColor: "#ff4d4f",
  },

  // Allergen text
  allergenText: {
    fontSize: 14,
    color: "#333333",
  },
});