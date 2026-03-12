// Notification tsx
import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import Tt from './ui/UIText';
import IconNotification from './icons/IconNotification';

const NotificationManager: React.FC<{
  notifications: { id: number; message: string; type: 'e' | 's' | 'n' }[];
  removeNotification: (id: number) => void;
}> = ({ notifications, removeNotification }) => {
  if (notifications.length === 0) return null;

  return (
    <>
      {notifications.map((notification) => (
        <Notification
          key={notification.id}
          notification={notification}
          removeNotification={removeNotification}
        />
      ))}
    </>
  );
};

export default NotificationManager;


const Notification: React.FC<{
  notification: { id: number; message: string; type: 'e' | 's' | 'n' };
  removeNotification: (id: number) => void;
}> = ({ notification, removeNotification }) => {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Fade in on mount
    Animated.timing(opacity, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();

    // Fade out after 5 seconds
    const timer = setTimeout(() => {
      Animated.timing(opacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start(() => removeNotification(notification.id));
    }, 5000);

    return () => clearTimeout(timer);
  }, [opacity, removeNotification, notification.id]);

  return (
    <Animated.View style={[styles.notificationContainer, { opacity }]}>
      <Pressable
        onPress={() => removeNotification(notification.id)}
        className="flex-row rounded bg-white dark:bg-hsl15"
      >
        <View style={[styles.iconContainer, styles[notification.type]]}>
          {notification.type === 'e' ? (
            <IconNotification type="error" fill="white" />
          ) : notification.type === 's' ? (
            <IconNotification type="success" fill="white" />
          ) : (
            <IconNotification type="neutral" fill="white" />
          )}
        </View>
        <View style={styles.messageContainer}>
          <Tt className="text-sm">{notification.message}</Tt>
        </View>
      </Pressable>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  notificationContainer: {
    position: 'absolute',
    top: 50,
    width: '90%',
    alignSelf: 'center',
  },
  iconContainer: {
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderTopLeftRadius: 5,
    borderBottomLeftRadius: 5,
  },
  messageContainer: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 5,
  },
  e: { backgroundColor: '#FF4C4C' },
  s: { backgroundColor: 'rgb(30, 160, 80)' },
  n: { backgroundColor: 'hsl(0 0% 30%)' },
});


