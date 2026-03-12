// Favourite Cart Btn tsx

import { useFavourites } from "@/hooks/useFavourites";
import { useProduct } from "../providers/ProductProvider";
import { useEffect, useState } from "react";
import { Pressable } from "react-native";
import IconGeneral from "../icons/IconGeneral";
import { color, spacing } from "../../app/design/token";

const FavouriteCartBtn = () => {
  const { currentProduct } = useProduct();
  const { toggle, check } = useFavourites();
  const [isFav, setIsFav] = useState(false);

  useEffect(() => {
    (async () => {
      if (currentProduct?.barcode) {
        const fav = await check(currentProduct.barcode);
        setIsFav(fav);
      }
    })();
  }, [currentProduct, check]);

  const handleToggleFavourite = async () => {
    if (!currentProduct) return;
    const newState = await toggle(currentProduct);
    setIsFav(newState);
  };

  return (
    <Pressable
      onPress={handleToggleFavourite}
      className="flex-row justify-center items-center self-end px-2 py-1"
    >
      {({ pressed }) => (
        <IconGeneral
          type={isFav ? "cart-active" : "cart-add"}
          fill={
            isFav ? color.primary : pressed ? color.primary : color.iconDefault
          }
          size={spacing.lg}
        />
      )}
    </Pressable>
  );
};
export default FavouriteCartBtn;
