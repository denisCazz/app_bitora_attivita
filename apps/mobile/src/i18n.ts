const dictionaries = {
  it: {
    appName: "Bitora",
    tagline: "Ogni mestiere, la sua app.",
    developedBy: "Sviluppata da Bitora",
    login: "Entra",
    register: "Crea account",
    email: "Email",
    password: "Password",
    name: "Nome",
    continue: "Continua",
    skip: "Salta per ora",
    save: "Salva",
    retry: "Riprova",
    logout: "Esci",
    offline: "Sei offline. Le modifiche partono appena torna la rete.",
    emptyTitle: "Ancora niente qui",
    errorTitle: "Qualcosa non ha funzionato",
    onboardingTitle: "Che lavoro fai?",
    shopTitle: "Il tuo negozio",
    teamTitle: "Chi lavora con te?",
    loginTitle: "Bentornato.",
    tryDemo: "Prova subito",
    demoStove: "Demo stufe",
    demoBar: "Demo bar",
    noAccount: "Non hai un account?",
    haveAccount: "Hai già un account?",
    registerTitle: "Inizia gratis.",
    registerSubtitle: "Il piano base è gratuito. Sblocchi i moduli quando servono.",
  },
  en: {
    appName: "Bitora",
    tagline: "The app that fits the trade.",
    developedBy: "Developed by Bitora",
    login: "Sign in",
    register: "Create account",
    email: "Email",
    password: "Password",
    name: "Name",
    continue: "Continue",
    skip: "Skip for now",
    save: "Save",
    retry: "Retry",
    logout: "Log out",
    offline: "You are offline. Changes will sync when you are back online.",
    emptyTitle: "Nothing here yet",
    errorTitle: "Something went wrong",
    onboardingTitle: "What do you do?",
    shopTitle: "Your shop",
    teamTitle: "Who works with you?",
    loginTitle: "Welcome back.",
    tryDemo: "Try it now",
    demoStove: "Stove demo",
    demoBar: "Bar demo",
    noAccount: "No account yet?",
    haveAccount: "Already have an account?",
    registerTitle: "Start for free.",
    registerSubtitle: "The base plan is free. Unlock modules when you need them.",
  },
} as const;

type Locale = keyof typeof dictionaries;
export type CopyKey = keyof typeof dictionaries.it;

let locale: Locale = "it";

export function setLocale(next: Locale) {
  locale = next;
}

export function t(key: CopyKey): string {
  return dictionaries[locale][key];
}
