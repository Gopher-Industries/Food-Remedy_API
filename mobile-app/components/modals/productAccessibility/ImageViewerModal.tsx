// Image Viewer Modal

import { View, Pressable, Image } from "react-native";
import Tt from "@/components/ui/UIText";
import IconGeneral from "@/components/icons/IconGeneral";
import { useModalManager } from "@/components/providers/ModalManagerProvider";

interface Props {
  url: string | null;
};


const ImageViewerModal: React.FC<Props> = ({ url }) => {
  const { closeModal } = useModalManager();

  if (!url) return;

  return (
    <View className="flex-1 bg-black/90">

      {/* Header */}
      <View className="w-full flex-row items-center justify-end px-3 my-4">
        <Pressable onPress={() => closeModal("imageViewer")} className="px-2 py-1 rounded" >
          <IconGeneral type="close" size={30} fill="#ffffff" />
        </Pressable>
      </View>

      <Image
        source={{ uri: url }}
        resizeMode="contain"
        className="w-full h-full"
      />
    </View>
  );
};

export default ImageViewerModal;
