// Guess the mobile-money network from a Tanzanian number (255XXXXXXXXX). Pure, no imports.
// A guess only: ported numbers can differ, so the UI must let the customer confirm/change it.

export type Network = "Mpesa" | "Tigo" | "Airtel" | "Halopesa";

/** Prefix (the two digits after 255) → network. Provider names follow AzamPay's SDK docs; confirm against the official spec. */
const PREFIX: Record<string, Network> = {
  "74": "Mpesa", "75": "Mpesa", "76": "Mpesa", // Vodacom
  "65": "Tigo", "67": "Tigo", "71": "Tigo",     // Tigo / Yas
  "68": "Airtel", "69": "Airtel", "78": "Airtel",
  "61": "Halopesa", "62": "Halopesa",           // Halotel
};

export function detectNetwork(phone: string): Network | null {
  const m = /^255(\d{2})\d{7}$/.exec(phone);
  return m ? PREFIX[m[1]] ?? null : null;
}

/** Display names for the network picker. */
export const NETWORK_LABEL: Record<Network, string> = {
  Mpesa: "M-Pesa",
  Tigo: "Mixx by Yas",
  Airtel: "Airtel Money",
  Halopesa: "HaloPesa",
};
