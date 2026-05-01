import React, { useMemo } from "react";
import { View, Text, ScrollView, StyleSheet } from "react-native";
import IngredientSearch from "@/components/product/IngredientSearch";
import { useProduct } from "@/components/providers/ProductProvider";

export default function IngredientsTab() {
  const { currentProduct } = useProduct();

  // Raw ingredients text
  const ingredientsText = useMemo(() => {
    return (
      currentProduct?.ingredientsText || "No ingredient information available."
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
      allergenInfo: allergenPart ? "Allergen " + allergenPart.trim() : null,
    };
  }, [ingredientsText]);

  return (
    <ScrollView style={styles.container}>
      {/* Page Title */}
      <Text style={styles.title}>Ingredients</Text>

      {/* Search Bar */}
      <View style={styles.searchWrapper}>
        {/* <IngredientSearch /> */}
      </View>

      {/* Ingredients Card */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Ingredient List</Text>

        <View style={styles.ingredientsContainer}>
          {ingredientsList.map((item, index) => (
            <View key={index} style={styles.ingredientChip}>
              <Text style={styles.ingredientText}>{item}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Allergen Section */}
      {allergenInfo && (
        <View style={[styles.card, styles.allergenCard]}>
          <Text style={styles.cardTitle}>Allergen Advice</Text>
          <Text style={styles.allergenText}>{allergenInfo}</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: "#f8f8f8",
  },

  title: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 16,
  },

  searchWrapper: {
    marginBottom: 16,
  },

  card: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,

    // Shadow (iOS)
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 6,

    // Shadow (Android)
    elevation: 2,
  },

  cardTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 12,
  },

  ingredientsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
  },

  ingredientChip: {
    backgroundColor: "#f1f1f1",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginRight: 8,
    marginBottom: 8,
  },

  ingredientText: {
    fontSize: 13,
    color: "#333",
  },

  allergenCard: {
    borderLeftWidth: 4,
    borderLeftColor: "#ff4d4f",
  },

  allergenText: {
    fontSize: 14,
    color: "#333",
  },
});
