import React from 'react';
import { Modal, View, Pressable } from 'react-native';
import HCaptcha from '@hcaptcha/react-hcaptcha';
import Tt from '@/components/ui/UIText';

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
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <View className="flex-1 bg-black/40 justify-end">
        <View
          className="bg-white dark:bg-hsl15 rounded-t-2xl overflow-hidden"
          style={{ maxHeight: '85%' }}
        >
          <View className="py-3 items-center border-b border-neutral-200">
            <Tt className="text-base font-interSemiBold">Security Check</Tt>
          </View>

          {/* Web captcha (NO WebView) */}
          <View
            style={{
              height: 400,
              alignItems: 'center',
              justifyContent: 'center',
              paddingHorizontal: 16,
            }}
          >
            <HCaptcha
              sitekey={siteKey}
              onVerify={(token) => onVerified(token)}
              onError={() => onCancel()}
              onExpire={() => onCancel()}
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

