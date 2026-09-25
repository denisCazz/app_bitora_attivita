import type { ImageSource } from "expo-image";

const LOCAL: Record<string, number> = {
  "asset:stove": require("../assets/images/login-stove.jpg"),
  "asset:bar": require("../assets/images/login-bar.jpg"),
};

export function categoryImage(image: string | null | undefined): ImageSource | number | null {
  if (!image) return null;
  if (LOCAL[image]) return LOCAL[image];
  return /^https?:\/\//.test(image) ? { uri: image } : null;
}
