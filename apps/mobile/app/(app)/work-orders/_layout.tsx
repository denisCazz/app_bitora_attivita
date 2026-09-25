import { Stack } from "expo-router";
import { stackOptions } from "../../../src/navigation";

export default function Layout() {
  return <Stack screenOptions={stackOptions} />;
}
