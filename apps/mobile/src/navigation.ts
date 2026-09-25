import type { Stack } from "expo-router";
import type { ComponentProps } from "react";

type StackOptions = Extract<NonNullable<ComponentProps<typeof Stack>["screenOptions"]>, object>;

export const stackOptions: StackOptions = {
  headerShown: false,
  animation: "ios_from_right",
  gestureEnabled: true,
  fullScreenGestureEnabled: true,
  contentStyle: { backgroundColor: "transparent" },
};
