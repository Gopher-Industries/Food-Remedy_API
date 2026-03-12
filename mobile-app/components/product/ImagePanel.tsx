// ImagePanel.tsx

import React, { useMemo, useState } from "react";
import { ScrollView, Image, View, Text, Pressable } from "react-native";
import ImageViewerModal from "../modals/productAccessibility/ImageViewerModal";
import ModalWrapper from "../modals/ModalAWrapper";
import { useModalManager } from "../providers/ModalManagerProvider";

type ProductImages = {
  root: string;
  variants: Record<string, number>;
  primary: string;
};

function buildImageUrl(images: ProductImages, variant?: string): string | null {
  const key = variant || images.primary || Object.keys(images.variants)[0]; // fallback
  if (!key) return null;

  const size = images.variants[key];
  if (!size) return null;

  return `${images.root}/${key}.${size}.full.jpg`;
}

function urlsFromImages(images: ProductImages): { key: string; url: string }[] {
  if (!images?.variants || Object.keys(images.variants).length === 0) return [];

  // put primary first if available
  const keys = Object.keys(images.variants).sort((a, b) => {
    if (a === images.primary) return -1;
    if (b === images.primary) return 1;
    return a.localeCompare(b);
  });

  return keys
    .map(key => {
      const url = buildImageUrl(images, key);
      return url ? { key, url } : null;
    })
    .filter((x): x is { key: string; url: string } => x !== null);
}


export default function ImagePanel({ images }: { images: ProductImages }) {
  const { openModal } = useModalManager();
  const items = useMemo(() => urlsFromImages(images), [images]);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);

  if (!items.length) {
    return (
      <View className="bg-white dark:bg-hsl15 rounded-xl px-4 py-6 items-center">
        <Text className="text-hsl40 dark:text-hsl80">No images</Text>
      </View>
    );
  }

  return (
    <>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 12, gap: 12 }}
        className="py-2"
      >
        {items.map(({ key, url }, idx) => (
          <Pressable key={idx}
            onPress={() => { setViewerUrl(url); openModal("imageViewer") }}
            className="rounded-xl overflow-hidden"
          >
            <Image
              source={{ uri: url }}
              className="w-40 h-40 bg-hsl95 dark:bg-hsl10"
              resizeMode="cover"
            />
          </Pressable>
        ))}
      </ScrollView>

      <ModalWrapper modalKey="imageViewer">
        <ImageViewerModal url={viewerUrl} />
      </ModalWrapper>
    </>
  );
}
