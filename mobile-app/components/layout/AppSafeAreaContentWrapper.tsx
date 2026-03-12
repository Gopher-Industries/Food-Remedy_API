// App Safe Area Content Wrapper tsx

import { ReactNode } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { View, StyleSheet } from 'react-native';

interface AppSafeAreaContentWrapperProps {
  children: ReactNode;
}

const AppSafeAreaContentWrapper: React.FC<AppSafeAreaContentWrapperProps> = ({ children }) => {
  const insets = useSafeAreaInsets();

  return (
    <View style={[ss.appContainerScreen, {
      paddingTop: insets.top,
      paddingBottom: insets.bottom,
      paddingLeft: insets.left,
      paddingRight: insets.right,
    }]}>
      <View style={ss.appContainerContent}>
        {children}
      </View>
    </View>
  );
};

export default AppSafeAreaContentWrapper;

const ss = StyleSheet.create({
  appContainerScreen: {
    flex: 1,
  },
  appContainerContent: {
    flex: 1,
    width: '90%',
    alignSelf: 'center',
  },
});


