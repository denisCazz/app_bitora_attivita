import type { ImageSource } from "expo-image";

const FILES = {
  stove: require("../assets/images/login-stove.jpg"),
  boiler: require("../assets/images/login-boiler.jpg"),
  hvac: require("../assets/images/login-hvac.jpg"),
  bar: require("../assets/images/login-bar.jpg"),
  restaurant: require("../assets/images/login-restaurant.jpg"),
  gelato: require("../assets/images/login-gelato.jpg"),
  bakery: require("../assets/images/login-bakery.jpg"),
  nails: require("../assets/images/login-nails.jpg"),
  hair: require("../assets/images/login-hair.jpg"),
  spa: require("../assets/images/login-spa.jpg"),
  barber: require("../assets/images/login-barber.jpg"),
  gym: require("../assets/images/login-gym.jpg"),
  laundry: require("../assets/images/login-laundry.jpg"),
  florist: require("../assets/images/login-florist.jpg"),
  plumber: require("../assets/images/login-plumber.jpg"),
  electrician: require("../assets/images/login-electrician.jpg"),
  solar: require("../assets/images/login-solar.jpg"),
  carpenter: require("../assets/images/login-carpenter.jpg"),
  mechanic: require("../assets/images/login-mechanic.jpg"),
  garden: require("../assets/images/login-garden.jpg"),
} as const;

const LOCAL: Record<string, number> = {
  "asset:stove": FILES.stove,
  "asset:boiler": FILES.boiler,
  "asset:hvac": FILES.hvac,
  "asset:bar": FILES.bar,
  "asset:restaurant": FILES.restaurant,
  "asset:gelato": FILES.gelato,
  "asset:bakery": FILES.bakery,
  "asset:nails": FILES.nails,
  "asset:hair": FILES.hair,
  "asset:spa": FILES.spa,
  "asset:barber": FILES.barber,
  "asset:gym": FILES.gym,
  "asset:laundry": FILES.laundry,
  "asset:florist": FILES.florist,
  "asset:plumber": FILES.plumber,
  "asset:electrician": FILES.electrician,
  "asset:solar": FILES.solar,
  "asset:carpenter": FILES.carpenter,
  "asset:mechanic": FILES.mechanic,
  "asset:garden": FILES.garden,
};

const BY_KEY: Record<string, string> = {
  stoves: "asset:stove",
  boilers: "asset:boiler",
  hvac: "asset:hvac",
  field_service: "asset:stove",
  bar: "asset:bar",
  restaurant: "asset:restaurant",
  gelato: "asset:gelato",
  bakery: "asset:bakery",
  hospitality: "asset:bar",
  nails: "asset:nails",
  hair: "asset:hair",
  spa: "asset:spa",
  barber: "asset:barber",
  gym: "asset:gym",
  laundry: "asset:laundry",
  florist: "asset:florist",
  wellness: "asset:spa",
  plumbing: "asset:plumber",
  electrical: "asset:electrician",
  solar: "asset:solar",
  carpentry: "asset:carpenter",
  mechanic: "asset:mechanic",
  garden: "asset:garden",
};

export function categoryImage(image: string | null | undefined): ImageSource | number | null {
  if (!image) return null;
  if (LOCAL[image]) return LOCAL[image];
  return /^https?:\/\//.test(image) ? { uri: image } : null;
}

export function categoryImageFor(key: string | undefined, image: string | null | undefined): ImageSource | number | null {
  return categoryImage(image) ?? (key ? categoryImage(BY_KEY[key]) : null);
}
