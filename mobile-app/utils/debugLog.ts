// Debug - Quick test for shopping list addition
// This file helps trace the flow

export const DEBUG_LOG = (section: string, message: string, data?: any) => {
  const timestamp = new Date().toLocaleTimeString();
  console.log(`[${timestamp}] [${section}] ${message}`, data || '');
  
  // Also try to log to a persistent store for app review
  if (typeof window !== 'undefined' && (window as any).__DEBUG_LOGS) {
    (window as any).__DEBUG_LOGS.push({
      timestamp,
      section,
      message,
      data,
    });
  }
};

// Clear logs
export const CLEAR_DEBUG_LOGS = () => {
  if (typeof window !== 'undefined') {
    (window as any).__DEBUG_LOGS = [];
  }
};

// Get logs
export const GET_DEBUG_LOGS = () => {
  if (typeof window !== 'undefined' && (window as any).__DEBUG_LOGS) {
    return (window as any).__DEBUG_LOGS;
  }
  return [];
};
