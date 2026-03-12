// Prouct Banner tsx

import { Product } from "@/types/Product";
import { useMemo } from "react";
import { Pressable, View } from "react-native";
import { useProduct } from "../providers/ProductProvider";
import { router } from "expo-router";
import IconGeneral from "../icons/IconGeneral";
import Tt from "../ui/UIText";
import { color, spacing } from "../../app/design/token";
import { ProductTag } from "@/components/shared/ProductTag";
import { getProductTags } from "@/services/utils/productTags";
import { useTheme } from "@/theme";

interface ProductBannerProps {
  product: Product;
  isSearchResult?: boolean;
}

const ProductBanner: React.FC<ProductBannerProps> = ({
  product,
  isSearchResult = false,
}) => {
  const { setBarcode, setCurrentProduct } = useProduct();
  const theme = useTheme();
  const productTags = useMemo(
    () => getProductTags(product).slice(0, 3),
    [product]
  );

  /**
   * Select Product
   */
  const selectProduct = (productBarcode: string) => {
    if (isSearchResult && product) {
      if (product.barcode) {
        // We have the product and its barcode. Set it directly
        setCurrentProduct(product);
      } else {
        // Search result has no barcode. fallback to barcode-based fetch
        setBarcode(productBarcode);
      }
    } else {
      // Normal flow (history/scan)
      setBarcode(productBarcode);
    }

    router.push("/product");
  };

  return (
    <Pressable
      key={product.barcode}
      onPress={() => selectProduct(product.barcode)}
      hitSlop={{ top: 5, bottom: 5, left: 5, right: 5 }}
      className="w-full flex-row gap-x-2 items-center py-3 px-4 my-2 rounded-lg border active:border-primary overflow-hidden"
      style={{ borderColor: theme.colors.border, backgroundColor: theme.colors.surface }}
    >
      {({ pressed }) => (
        <>
          <IconGeneral
            type="product"
            fill={color.iconDefault}
            size={spacing.xl}
          />
          <View className="flex-1 min-w-0">
            <Tt className="text-hsl30 dark:text-hsl90 font-interSemiBold">
              {product.productName}
            </Tt>
            <Tt className="text-hsl30 dark:text-hsl90 text-sm">{product.brand}</Tt>
            {productTags.length > 0 && (
              <View className="flex-row flex-wrap mt-2">
                {productTags.map((tag) => (
                  <View key={tag.id} className="mr-2 mb-2">
                    <ProductTag label={tag.label} tone={tag.tone} />
                  </View>
                ))}
              </View>
            )}
          </View>
          <IconGeneral
            type="arrow-forward-ios"
            fill={pressed ? color.primary : color.iconDefault}
            size={spacing.xl}
          />
        </>
      )}
    </Pressable>
  );
};

export default ProductBanner;
