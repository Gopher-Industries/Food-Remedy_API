// mobile-app/components/providers/Providers.tsx

import { ReactNode } from "react";
import { ProductProvider } from "@/components/providers/ProductProvider";
import ModalLoader from "@/components/modals/ModalALoader";
import { ModalManagerProvider } from "@/components/providers/ModalManagerProvider";
import { ProfileProvider } from "@/components/providers/ProfileProvider";
import { AuthProvider } from "@/components/providers/AuthProvider";
import { NotificationProvider } from "@/components/providers/NotificationProvider";
import { SQLiteDatabaseProvider } from "@/components/providers/SQLiteDatabaseProvider";
import { SearchProductProvider } from "@/components/providers/SearchProductProvider";
import { PreferencesProvider } from "@/components/providers/PreferencesProvider";
import { SessionPreferencesProvider } from "@/components/providers/SessionPreferencesProvider";
import ThemeBridge from "@/components/providers/ThemeBridge";
import { RecommendationAddToListProvider } from "@/components/providers/RecommendationAddToListProvider";

interface ProvidersProps {
  children: ReactNode;
}

const Providers = ({ children }: ProvidersProps) => {
  return (
    <PreferencesProvider>
      <SessionPreferencesProvider>
        <NotificationProvider>
          <AuthProvider>
            <SQLiteDatabaseProvider>
              <ModalManagerProvider>
                <ProfileProvider>
                  <ProductProvider>
                    <SearchProductProvider>
                      <RecommendationAddToListProvider>
                        {children}
                        <ModalLoader />
                        <ThemeBridge />
                      </RecommendationAddToListProvider>
                    </SearchProductProvider>
                  </ProductProvider>
                </ProfileProvider>
              </ModalManagerProvider>
            </SQLiteDatabaseProvider>
          </AuthProvider>
        </NotificationProvider>
      </SessionPreferencesProvider>
    </PreferencesProvider>
  );
};

export default Providers;
