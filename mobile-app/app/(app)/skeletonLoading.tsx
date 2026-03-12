import { Dimensions, StyleSheet, Text, View, Animated } from "react-native";
import React, { useRef, useEffect } from "react";
import { useTheme } from "@/theme";

const SkeletonLoading = () => {
  const { width } = Dimensions.get("screen");
  const translateX = useRef(new Animated.Value(-width)).current;
  const theme = useTheme();

  useEffect(() => {
    Animated.loop(
      Animated.timing(translateX, {
        toValue: width,
        duration: 1500,
        useNativeDriver: true,
      })
    ).start();
  });

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={styles.card}>
        <View style={styles.box} />
        <View style={[styles.box, styles.box2]} />
        <View style={[styles.box, styles.box3]} />
        <View style={styles.box} />
        <View style={[styles.box, styles.box2]} />
        <View style={[styles.box, styles.box3]} />
        <View style={styles.box} />
        <View style={[styles.box, styles.box2]} />
        <View style={[styles.box, styles.box3]} />
        <View style={styles.box} />
        <View style={[styles.box, styles.box2]} />
        <View style={[styles.box, styles.box3]} />
        <View style={styles.box} />
        <View style={[styles.box, styles.box2]} />
        <View style={[styles.box, styles.box3]} />

        <Animated.View
          style={[styles.shimmer, { transform: [{ translateX }] }]}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 15,
    margin: 10,
  },
  box: {
    height: 80,
    backgroundColor: "#e0e0e0",
    borderRadius: 4,
    marginTop: 8,
  },
  box2: {
    width: "60%",
    height: 20,
    marginTop: 6,
  },
  box3: {
    width: "80%",
    height: 40,
    marginBottom: 0,
    marginTop: 6,
  },
  shimmer: {
    backgroundColor: "rgba(255, 255, 255, 0.4)",
    height: "100%",
    width: "100%",
    position: "absolute",
    top: 15,
    left: 10,
  },
});
export default SkeletonLoading;
