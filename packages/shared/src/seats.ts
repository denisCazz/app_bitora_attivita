/** Users included in the free plan. Further users are billed monthly. */
export const INCLUDED_SEATS = 3;

/** Price of one user beyond the included seats, in euro cents per month. */
export const EXTRA_SEAT_CENTS = 500;

export function seatCapacity(extraSeats: number): number {
  return INCLUDED_SEATS + Math.max(0, extraSeats);
}

export function seatMonthlyCents(extraSeats: number): number {
  return Math.max(0, extraSeats) * EXTRA_SEAT_CENTS;
}

export function seatLimitMessage(): string {
  return `Hai ${INCLUDED_SEATS} utenti inclusi. Ogni utente in più costa ${EXTRA_SEAT_CENTS / 100}€ al mese.`;
}
