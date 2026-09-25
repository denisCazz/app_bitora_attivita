import { useMemo } from "react";
import { View } from "react-native";
import { Button, Input, Text } from "@rapportini/ui";
import { Chip } from "./Chip";

export function RecordPicker({
  label,
  query,
  onQuery,
  options,
  value,
  onChange,
  emptyLabel = "Nessuno",
  onCreate,
  createLabel = "Nuovo",
}: {
  label: string;
  query: string;
  onQuery: (value: string) => void;
  options: Array<{ id: string; title: string; subtitle?: string }>;
  value: string | null;
  onChange: (id: string | null) => void;
  emptyLabel?: string;
  onCreate?: () => void;
  createLabel?: string;
}) {
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const rows = needle ? options.filter((option) => `${option.title} ${option.subtitle ?? ""}`.toLowerCase().includes(needle)) : options;
    return rows.slice(0, 40);
  }, [options, query]);

  return (
    <View style={{ gap: 8 }}>
      <Input label={label} value={query} onChangeText={onQuery} />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        <Chip label={emptyLabel} active={!value} onPress={() => onChange(null)} />
        {filtered.map((option) => (
          <Chip
            key={option.id}
            label={option.subtitle ? `${option.title} · ${option.subtitle}` : option.title}
            active={value === option.id}
            onPress={() => onChange(value === option.id ? null : option.id)}
          />
        ))}
      </View>
      {options.length === 0 ? <Text muted>Niente in elenco. Puoi crearne uno nuovo.</Text> : null}
      {query.trim() && filtered.length === 0 ? <Text muted>Nessun risultato.</Text> : null}
      {onCreate ? <Button label={createLabel} tone="secondary" onPress={onCreate} /> : null}
    </View>
  );
}
