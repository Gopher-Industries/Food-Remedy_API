// Barcode Overlay Mask tsx

import React from "react"
import { StyleSheet, View } from "react-native"
import Svg, { Defs, Mask, Rect } from "react-native-svg"

const BarcodeOverlayMask = () => {
  return (
    <View className="absolute inset-0" pointerEvents="none">
      <Svg width="100%" height="100%">
        <Defs>
          <Mask id="cutout">
            {/* white = show overlay, black = keep camera visible */}
            <Rect x="0" y="0" width="100%" height="100%" fill="white" />
            <Rect x="5%" y="30%" width="90%" height="30%" rx={8} fill="black" />
          </Mask>
        </Defs>

        {/* the dark overlay, masked so the “black” part above is clear */}
        <Rect x="0" y="0" width="100%" height="100%" fill="rgba(0,0,0,0.5)"
          mask="url(#cutout)"
        />
      </Svg>

      {/* crisp white outline around the cut-out */}
      <View style={styles.border} />
    </View>
  )
}

export default BarcodeOverlayMask;

const styles = StyleSheet.create({
  border: {
    position: 'absolute',
    top: '30%',
    left: '5%',
    width: '90%',
    height: '30%',
    borderWidth: 4,
    borderColor: 'hsl(0, 0%, 85%)',
    borderRadius: 8,
  },
})
