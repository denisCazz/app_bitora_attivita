import { planModules, type CatalogModule, type NeedView } from "@rapportini/shared";
import { Ionicons } from "@expo/vector-icons";
import { Switch, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { Badge, Card, Pressy, Text, useTheme, withAlpha } from "@rapportini/ui";
import { monthly } from "../billing";

export type PlanModule = Pick<CatalogModule, "key" | "label" | "description" | "pitch" | "icon" | "priceCents" | "trialDays" | "requires" | "free" | "recommended" | "sortOrder">;

export interface PublicPlan {
  id: string;
  label: string;
  needs: NeedView[];
  modules: PlanModule[];
}

const MAX_TRIALS = 3;

export function defaultTrials(plan: PublicPlan, chosen: readonly string[]): string[] {
  return planModules(plan.modules, plan.needs, chosen)
    .suggested.filter((module) => module.score >= 3 && module.trialDays > 0)
    .slice(0, MAX_TRIALS)
    .map((module) => module.key);
}

export function NeedPicker({ needs, chosen, onToggle }: { needs: NeedView[]; chosen: readonly string[]; onToggle: (key: string) => void }) {
  const theme = useTheme();
  return (
    <View style={{ gap: 10 }}>
      {needs.map((need) => {
        const active = chosen.includes(need.key);
        return (
          <Pressy
            key={need.key}
            scaleTo={0.98}
            onPress={() => onToggle(need.key)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: active }}
            style={{ borderRadius: theme.radius.lg }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                padding: 14,
                borderRadius: theme.radius.lg,
                borderWidth: 1.5,
                borderColor: active ? theme.colors.accent : theme.colors.glassBorder,
                backgroundColor: active ? withAlpha(theme.colors.accent, theme.dark ? 0.2 : 0.08) : theme.colors.field,
              }}
            >
              <Ionicons name={need.icon as keyof typeof Ionicons.glyphMap} size={22} color={active ? theme.colors.accent : theme.colors.inkSoft} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="heading">{need.label}</Text>
                {need.description ? (
                  <Text variant="caption" muted>
                    {need.description}
                  </Text>
                ) : null}
              </View>
              <Ionicons name={active ? "checkmark-circle" : "ellipse-outline"} size={24} color={active ? theme.colors.accent : theme.colors.line} />
            </View>
          </Pressy>
        );
      })}
    </View>
  );
}

export function PlanPreview({
  plan,
  chosen,
  trials,
  onToggleTrial,
}: {
  plan: PublicPlan;
  chosen: readonly string[];
  trials: readonly string[];
  onToggleTrial: (key: string) => void;
}) {
  const theme = useTheme();
  const { included, suggested, others } = planModules(plan.modules, plan.needs, chosen);
  return (
    <View style={{ gap: 12 }}>
      <Card style={{ gap: 10 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Ionicons name="sparkles" size={18} color={theme.colors.accent} />
          <Text variant="heading">Incluso gratis, per sempre</Text>
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {included.map((module) => (
            <View key={module.key} style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 99, backgroundColor: theme.colors.field, borderWidth: 1, borderColor: theme.colors.glassBorder }}>
              <Ionicons name={module.icon as keyof typeof Ionicons.glyphMap} size={14} color={theme.colors.accent} />
              <Text variant="caption" style={{ fontWeight: "700" }}>
                {module.label}
              </Text>
            </View>
          ))}
        </View>
      </Card>

      {suggested.length ? (
        <Text variant="title">Consigliati per te</Text>
      ) : null}
      {suggested.map((module) => {
        const active = trials.includes(module.key);
        return (
          <Animated.View key={module.key} entering={FadeIn.duration(200)}>
            <Card style={{ gap: 8, borderColor: active ? theme.colors.accent : theme.colors.glassBorder, borderWidth: active ? 1.5 : 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <Ionicons name={module.icon as keyof typeof Ionicons.glyphMap} size={22} color={theme.colors.accent} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="heading">{module.label}</Text>
                  <Text variant="caption" muted>
                    {module.pitch || module.description}
                  </Text>
                </View>
                {module.trialDays > 0 ? (
                  <Switch
                    value={active}
                    onValueChange={() => onToggleTrial(module.key)}
                    trackColor={{ true: theme.colors.accent, false: theme.colors.line }}
                    thumbColor="#fff"
                    accessibilityLabel={`Prova ${module.label}`}
                  />
                ) : null}
              </View>
              <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                <Badge label={monthly(module.priceCents)} />
                {module.score >= 3 ? <Badge tone="accent" label="Per quello che hai scelto" /> : null}
                {active ? <Badge tone="success" label={`Gratis ${module.trialDays} giorni`} /> : null}
              </View>
            </Card>
          </Animated.View>
        );
      })}

      {others.length ? (
        <Text variant="caption" muted>
          Altri {others.length} moduli ({others.map((module) => module.label).join(", ")}) li trovi nello Store quando servono.
        </Text>
      ) : null}
    </View>
  );
}
