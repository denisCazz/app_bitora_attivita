import { permissionRows } from "@rapportini/shared";
import { Switch, View } from "react-native";
import { Text, useTheme } from "@rapportini/ui";

export function PermissionToggles({
  selected,
  onToggle,
  catalog,
  locked = [],
  disabled = false,
}: {
  selected: readonly string[];
  onToggle: (permission: string) => void;
  catalog?: ReadonlyArray<{ key: string; label: string }> | null;
  locked?: readonly string[];
  disabled?: boolean;
}) {
  const theme = useTheme();
  const rows = permissionRows(catalog);
  let previous = "";

  return (
    <View>
      {rows.map((row) => {
        const showSection = row.section !== previous;
        previous = row.section;
        const on = selected.includes(row.permission);
        const isLocked = locked.includes(row.permission);
        return (
          <View key={row.permission}>
            {showSection ? (
              <Text variant="label" muted style={{ marginTop: 14 }}>
                {row.section}
              </Text>
            ) : null}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, opacity: isLocked ? 0.55 : 1 }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="heading">{row.label}</Text>
                <Text variant="caption" muted>
                  {row.description}
                  {isLocked ? " · sempre attivo per il titolare" : ""}
                </Text>
              </View>
              <Switch
                value={on}
                disabled={disabled || isLocked}
                onValueChange={() => onToggle(row.permission)}
                accessibilityLabel={`${row.section}. ${row.label}. ${row.description}`}
                trackColor={{ true: theme.colors.accent, false: theme.colors.line }}
                thumbColor="#fff"
              />
            </View>
          </View>
        );
      })}
    </View>
  );
}
