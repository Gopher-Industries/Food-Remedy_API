// Notification Provider tsx

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import NotificationManager from '../NotificationManager';

interface Notification {
  id: number;
  message: string;
  type: 'e' | 's' | 'n'; // Error, Success, Neutral
}

interface NotificationContextType {
  notifications: Notification[];
  addNotification: (message: string, type: 'e' | 's' | 'n') => void;
  removeNotification: (id: number) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  // Add a new notification to the queue
  const addNotification = useCallback((message: string, type: 'e' | 's' | 'n') => {
    setNotifications((prev) => [...prev, { message, type, id: Date.now() }]);
  }, []);

  // Remove notification by ID
  const removeNotification = useCallback((id: number) => {
    setNotifications((prev) => prev.filter((notification) => notification.id !== id));
  }, []);


  return (
    <NotificationContext.Provider value={{ notifications, addNotification, removeNotification }}>
      {children}
      <NotificationManager notifications={notifications} removeNotification={removeNotification} />
    </NotificationContext.Provider>
  );
};

export const useNotification = (): NotificationContextType => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  return context;
};