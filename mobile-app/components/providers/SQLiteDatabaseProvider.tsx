// SQLite Database Provider tsx

import React, { createContext, useContext, useEffect, useState } from "react";
import { SQLiteDatabase } from "expo-sqlite";
import { initialiseSQLiteDatabase } from "@/config/sqlConfig";


interface SQLiteDatabaseContextProps {
  db: SQLiteDatabase | null;
  isDbReady: boolean;

  resetStateSQLiteDatabaseProvider: () => void;
}

const SQLiteDatabaseContext = createContext<SQLiteDatabaseContextProps | undefined>(undefined);

export const SQLiteDatabaseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [db, setDb] = useState<SQLiteDatabase | null>(null);
  const [isDbReady, setIsDbReady] = useState<boolean>(false);


  /**
   * Initialise SQL & Async Storage Database
   */
  useEffect(() => {

    let isMounted = true; // Prevent memory leaks

    const setUpDatabase = async () => {
      try {
        console.log(`Initializing SQLite Database`);

        const database = await initialiseSQLiteDatabase();

        if (isMounted) {
          setDb(database);
          setIsDbReady(true);
        }
      } catch (error) {
        console.error("Database initialization error:", error);
      }
    };

    setUpDatabase();

    return () => { isMounted = false; };
  }, []);


  /**
   * Reset State (Database Provider).
   * For logging out
   */
  const resetStateSQLiteDatabaseProvider = () => {
    setDb(null);
    setIsDbReady(false);
  };


  return (
    <SQLiteDatabaseContext.Provider value={{
      db, isDbReady,

      resetStateSQLiteDatabaseProvider
    }}>
      {children}
    </SQLiteDatabaseContext.Provider>
  );
};

export function useSQLiteDatabase(): SQLiteDatabaseContextProps {
  const context = useContext(SQLiteDatabaseContext);
  if (!context) {
    throw new Error("useSQLiteDatabase must be used within a SQLiteDatabaseProvider");
  }
  return context;
}
