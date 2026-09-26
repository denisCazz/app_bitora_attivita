import { View } from "react-native";
import { Text } from "@rapportini/ui";
import { openLegal } from "../legal";
import { Checkbox } from "./Checkbox";

export function LegalConsents({
  acceptTerms,
  approveClauses,
  onChange,
  errors,
  color,
}: {
  acceptTerms: boolean;
  approveClauses: boolean;
  onChange: (key: "acceptTerms" | "approveClauses", value: boolean) => void;
  errors?: { acceptTerms?: string; approveClauses?: string };
  color?: string;
}) {
  const link = { fontWeight: "700" as const, textDecorationLine: "underline" as const, color };
  return (
    <View style={{ gap: 12 }}>
      <Checkbox checked={acceptTerms} onChange={(value) => onChange("acceptTerms", value)} error={errors?.acceptTerms} color={color}>
        Ho letto e accetto i{" "}
        <Text variant="caption" style={link} onPress={() => void openLegal("terms")}>
          Termini di servizio
        </Text>{" "}
        e l'
        <Text variant="caption" style={link} onPress={() => void openLegal("privacy")}>
          Informativa privacy
        </Text>
        . Dichiaro di avere almeno 18 anni e di usare Bitora per la mia attività professionale.
      </Checkbox>
      <Checkbox checked={approveClauses} onChange={(value) => onChange("approveClauses", value)} error={errors?.approveClauses} color={color}>
        Ai sensi degli artt. 1341 e 1342 c.c. approvo specificamente gli artt. 3 (rinnovo e rimborsi), 7 (modifica del servizio), 8 (limitazione di
        responsabilità), 9 (sospensione e recesso) e 12 (foro competente) dei Termini.
      </Checkbox>
    </View>
  );
}
