export type SendPaymentReceiptInput = {
  to?: string;
  companyName?: string;
  amount?: number;
  description?: string;
  paymentDate?: string;
  qrPayload?: string;
};

export const buildPaymentQrUrl = (payload: string) =>
  `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(payload)}`;

export async function sendPaymentReceiptEmail(payload: SendPaymentReceiptInput) {
  const response = await fetch("/api/payments/send-receipt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const body = await response.json();

  if (!response.ok) {
    throw new Error(body?.error || "Impossible d'envoyer l'email de paiement.");
  }

  return body;
}
