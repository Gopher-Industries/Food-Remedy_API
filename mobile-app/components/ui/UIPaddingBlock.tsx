// Padding Block tsx

import { View } from 'react-native';

interface PdBlkProps {
  pad: number;
}

const PdBlk = ({ pad }: PdBlkProps) => {
  return (
    <View style={{ marginVertical: pad }}></View>
  );
};

export default PdBlk;
