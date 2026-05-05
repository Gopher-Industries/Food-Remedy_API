import React, { useEffect, useState } from "react";
import { Modal, View, Pressable } from "react-native";
import HCaptcha from "@hcaptcha/react-hcaptcha";
import Tt from "@/components/ui/UIText";

export type CaptchaModalProps = {
  visible: boolean;
  siteKey: string;
  onVerified: (token: string) => void;
  onCancel: () => void;
};

const CaptchaModal: React.FC<CaptchaModalProps> = ({
  visible,
  siteKey,
  onVerified,
  onCancel,
}) => {
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setLoadError(null);
    }
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <View className="flex-1 bg-black/40 justify-end">
        <View
          className="bg-white dark:bg-hsl15 rounded-t-2xl overflow-hidden"
          style={{ maxHeight: "85%" }}
        >
          <View className="py-3 items-center border-b border-neutral-200">
            <Tt className="text-base font-interSemiBold">Security Check</Tt>
          </View>

          {loadError ? (
            <View style={{ padding: 16 }}>
              <Tt className="text-sm text-red-700 text-center">{loadError}</Tt>
            </View>
          ) : null}

          <View
            style={{
              minHeight: 400,
              alignItems: "center",
              justifyContent: "center",
              paddingHorizontal: 16,
            }}
          >
            <HCaptcha
              sitekey={siteKey}
              onVerify={(token) => onVerified(token)}
              onError={(e) => {
                console.warn("[CaptchaModal] hCaptcha error:", e);
                setLoadError(
                  "Captcha could not load. On localhost, add this host in the hCaptcha dashboard for your site key, or run with EXPO_PUBLIC_CAPTCHA_ENABLED=false. In dev, captcha is off by default unless EXPO_PUBLIC_CAPTCHA_ENABLED=true."
                );
              }}
              onExpire={() => {
                console.warn("[CaptchaModal] hCaptcha token expired");
                setLoadError("Captcha expired. Close and try Login again.");
              }}
            />
          </View>

          <View className="p-4">
            <Pressable onPress={onCancel} className="border border-neutral-900 rounded-lg py-3">
              <Tt className="text-center font-interSemiBold">Cancel</Tt>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
};

export default CaptchaModal;
