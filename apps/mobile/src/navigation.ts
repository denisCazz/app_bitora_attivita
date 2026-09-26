import { router, type Stack } from "expo-router";
import type { ComponentProps } from "react";

/** Torna indietro se c'è una schermata precedente, altrimenti apre la home. Evita il warning GO_BACK sul web. */
export function goBack(fallback = "/(app)") {
  if (router.canGoBack()) router.back();
  else router.navigate(fallback as never);
}

type StackOptions = Extract<NonNullable<ComponentProps<typeof Stack>["screenOptions"]>, object>;

export const stackOptions: StackOptions = {
  headerShown: false,
  animation: "ios_from_right",
  gestureEnabled: true,
  fullScreenGestureEnabled: true,
  contentStyle: { backgroundColor: "transparent" },
};
