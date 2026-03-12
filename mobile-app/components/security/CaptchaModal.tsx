import React, { useEffect, useMemo } from 'react';
import { Modal, View, Pressable } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import Tt from '@/components/ui/UIText';

export type CaptchaModalProps = {
  visible: boolean;
  siteKey: string;
  onVerified: (token: string) => void;
  onCancel: () => void;
  // future: provider?: 'hcaptcha' | 'recaptcha'
};

const CaptchaModal: React.FC<CaptchaModalProps> = ({ visible, siteKey, onVerified, onCancel }) => {
  const html = useMemo(() => `
    <!doctype html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        <style>
          body { margin:0; padding:0; background:#f9fafb; font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif; }
          .container { display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:100vh; padding:16px; }
          .btn { margin-top: 16px; padding: 10px 16px; border: 1px solid #111; background: white; border-radius: 8px; }
        </style>
        <script src="https://js.hcaptcha.com/1/api.js?render=explicit" async defer></script>
        <script>
          function onLoad() {
            const widgetId = hcaptcha.render('captcha', {
              sitekey: '${siteKey}',
              size: 'normal',
              callback: function(token) {
                window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'success', token }));
              },
              'error-callback': function(){
                window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'error' }));
              },
              'expired-callback': function(){
                window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'expired' }));
              }
            });
            window._widgetId = widgetId;
          }
          window.onhashchange = function(){};
          window.addEventListener('load', function(){
            if (typeof hcaptcha !== 'undefined') {
              onLoad();
            } else {
              // wait for script
              var iv = setInterval(function(){
                if (typeof hcaptcha !== 'undefined') { clearInterval(iv); onLoad(); }
              }, 100);
            }
          });
          function resetCaptcha(){ if (window._widgetId !== undefined) { hcaptcha.reset(window._widgetId); } }
        </script>
      </head>
      <body>
        <div class="container">
          <div id="captcha"></div>
          <noscript>Please enable JavaScript to complete captcha.</noscript>
          <button class="btn" onclick="resetCaptcha()">Reload Captcha</button>
        </div>
      </body>
    </html>
  `, [siteKey]);

  const onMessage = (event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      console.log('[CaptchaModal] message:', data);
      if (data.type === 'success' && data.token) {
        onVerified(data.token);
      } else if (data.type === 'error' || data.type === 'expired') {
        onCancel();
      }
    } catch {}
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <View className="flex-1 bg-black/40 justify-end">
        <View className="bg-white dark:bg-hsl15 rounded-t-2xl overflow-hidden" style={{ maxHeight: '85%' }}>
          <View className="py-3 items-center border-b border-neutral-200">
            <Tt className="text-base font-interSemiBold">Security Check</Tt>
          </View>
          <View style={{ height: 400 }}>
            <WebView
              originWhitelist={["*"]}
              onMessage={onMessage}
              source={{ html, baseUrl: 'https://hcaptcha.com' }}
              javaScriptEnabled
              incognito
              mixedContentMode="always"
              domStorageEnabled
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
