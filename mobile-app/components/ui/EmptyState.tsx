import React from "react";
import { ScrollView, Pressable, type RefreshControlProps } from "react-native";
import Tt from "@/components/ui/UIText";
import IconGeneral from "@/components/icons/IconGeneral";
import { color } from "@/app/design/token";

/**
 * EmptyState Component
 *
 * Reusable full-height centred placeholder for screens with no content.
 * Wraps content in a ScrollView so buttons remain reachable at large system font sizes.
 * Supports an optional icon, description, primary CTA, and a separate retry action
 * for offline / error states.
 *
 * How to use:
 *
 * 1. Basic — title only:
 *    <EmptyState title="No history yet." />
 *
 * 2. With icon and description:
 *    <EmptyState
 *      iconType="nutrition"
 *      title="No results found."
 *      description="Try adjusting your search or scan a new product."
 *      accessibilityLabel="No search results"
 *    />
 *
 * 3. With a CTA button (navigates away):
 *    <EmptyState
 *      title="No history yet."
 *      ctaLabel="Scan New Product"
 *      ctaIcon="barcode-scan"
 *      onCta={() => router.push("/(app)/(tabs)/scan")}
 *      accessibilityLabel="No history"
 *    />
 *
 * 4. With a retry action (offline / error state):
 *    <EmptyState
 *      iconType="warning"
 *      title="You're offline."
 *      description="Check your connection and try again."
 *      retryLabel="Try Again"
 *      onRetry={onRefresh}
 *      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
 *      accessibilityLabel="Offline — content unavailable"
 *    />
 */
interface EmptyStateProps {
  title: string;                        // Main heading shown to the user
  description?: string;                 // Supporting text below the title
  iconType?: string;                    // Icon name passed to IconGeneral (optional)
  iconFill?: string;                    // Icon colour 
  iconSize?: number;                    // Icon size in px — defaults to 32
  ctaLabel?: string;                    // Primary action button label
  ctaIcon?: string;                     // Optional icon shown beside the CTA label
  onCta?: () => void;                   // CTA handler — button only renders when provided with ctaLabel
  retryLabel?: string;                  // Retry button label for error/offline states
  onRetry?: () => void;                 // Retry handler — button only renders when provided with retryLabel
  accessibilityLabel?: string;          // Screen-reader label for the container
  refreshControl?: React.ReactElement<RefreshControlProps>;  // Pull-to-refresh control passed to the ScrollView
}

export default function EmptyState({
  title,
  description,
  iconType,
  iconFill = "hsl(0, 0%, 40%)",
  iconSize = 32,
  ctaLabel,
  ctaIcon,
  onCta,
  retryLabel,
  onRetry,
  accessibilityLabel,
  refreshControl,
}: EmptyStateProps) {
  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{
        flexGrow: 1,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: "5%",
        paddingVertical: 32,
      }}
      refreshControl={refreshControl}
      accessibilityLabel={accessibilityLabel}
    >
      {iconType && (
        <IconGeneral type={iconType} fill={iconFill} size={iconSize} />
      )}

      <Tt
        className={`text-hsl40 dark:text-hsl80 text-center${iconType ? " mt-4" : ""}`}
      >
        {title}
      </Tt>

      {description && (
        <Tt className="text-hsl40 dark:text-hsl80 text-xs mt-1 text-center">
          {description}
        </Tt>
      )}

      {onRetry && retryLabel && (
        <Pressable
          onPress={onRetry}
          hitSlop={{ top: 5, bottom: 5, left: 5, right: 5 }}
          className="mt-8 py-3 px-6 rounded-lg border border-hsl90 dark:border-hsl20 active:border-primary bg-white dark:bg-hsl15"
        >
          {({ pressed }) => (
            <Tt
              className={`text-lg font-interSemiBold ${
                pressed ? "text-primary" : "text-hsl30 dark:text-hsl90"
              }`}
            >
              {retryLabel}
            </Tt>
          )}
        </Pressable>
      )}

      {onCta && ctaLabel && (
        <Pressable
          onPress={onCta}
          hitSlop={{ top: 5, bottom: 5, left: 5, right: 5 }}
          className="mt-8 flex-row items-center gap-x-3 py-3 px-4 rounded-lg border border-hsl90 dark:border-hsl20 active:border-primary bg-white dark:bg-hsl15 self-center"
        >
          {({ pressed }) => (
            <>
              <Tt
                className={`text-lg font-interSemiBold ${
                  pressed ? "text-primary" : "text-hsl30 dark:text-hsl90"
                }`}
              >
                {ctaLabel}
              </Tt>
              {ctaIcon && (
                <IconGeneral
                  type={ctaIcon}
                  fill={pressed ? color.primary : color.iconDefault}
                  size={30}
                />
              )}
            </>
          )}
        </Pressable>
      )}
    </ScrollView>
  );
}
