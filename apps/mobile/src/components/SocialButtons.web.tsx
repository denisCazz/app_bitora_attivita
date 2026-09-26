export type SignInSession = {
  accessToken: string;
  refreshToken: string;
  needsOnboarding: boolean;
  activeTenantId: string | null;
  user: { platformAdmin: boolean };
};

export function SocialButtons(_props: {
  mode: "signin" | "signup";
  consents?: { acceptTerms: boolean; approveClauses: boolean };
  onSession: (session: SignInSession) => Promise<void>;
  onError: (message: string | null) => void;
}) {
  return null;
}
