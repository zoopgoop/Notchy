import { PropsWithChildren } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { theme } from "../../theme";

/**
 * The one page-title style every screen should use — built as a single shared
 * component specifically so titles can't drift out of sync with each other again
 * (each screen previously hand-rolled its own title style at slightly different
 * sizes/weights).
 */
export function PageTitle({ children, subtitle }: PropsWithChildren<{ subtitle?: string }>) {
  return (
    <View style={styles.pageHeader}>
      <Text style={styles.pageTitle}>{children}</Text>
      {subtitle && <Text style={styles.pageSubtitle}>{subtitle}</Text>}
    </View>
  );
}

export function Screen({ children, scroll = true }: PropsWithChildren<{ scroll?: boolean }>) {
  const insets = useSafeAreaInsets();

  if (scroll) {
    return (
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 16 }]}
      >
        {children}
      </ScrollView>
    );
  }
  // Non-scroll screens render their own FlatList with its own 16px content padding,
  // so only the safe-area inset is added here — adding +16 too would double it up.
  return <View style={[styles.container, { paddingTop: insets.top }]}>{children}</View>;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.background,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 48,
  },
  pageHeader: {
    marginBottom: 20,
  },
  pageTitle: {
    color: theme.text,
    fontSize: 24,
    fontWeight: "700",
  },
  pageSubtitle: {
    color: theme.textMuted,
    fontSize: 15,
    marginTop: 4,
  },
});
