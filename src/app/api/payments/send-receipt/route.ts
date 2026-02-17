import { NextResponse } from "next/server";
import {
  PAYMENT_RECEIPT_DEFAULT_TO,
  RESEND_API_KEY,
  RESEND_FROM_EMAIL,
} from "@/env";

type ReceiptPayload = {
  to?: string;
  companyName?: string;
  amount?: number;
  description?: string;
  paymentDate?: string;
  qrPayload?: string;
};

const buildQrCodeUrl = (payload: string) =>
  `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(payload)}`;

export async function POST(request: Request) {
  try {
    if (!RESEND_API_KEY) {
      return NextResponse.json(
        { error: "RESEND_API_KEY manquant côté serveur." },
        { status: 500 }
      );
    }

    const body = (await request.json()) as ReceiptPayload;
    const to = body.to ?? PAYMENT_RECEIPT_DEFAULT_TO;

    if (!to) {
      return NextResponse.json(
        {
          error:
            "Aucun destinataire défini. Ajoutez PAYMENT_RECEIPT_DEFAULT_TO ou transmettez un email.",
        },
        { status: 400 }
      );
    }

    const paymentDate = body.paymentDate
      ? new Date(body.paymentDate)
      : new Date();

    const companyLabel = body.companyName ?? "votre dossier";
    const qrPayload =
      body.qrPayload ??
      `Paiement validé - ${companyLabel} - ${paymentDate.toISOString()}`;
    const qrCodeUrl = buildQrCodeUrl(qrPayload);

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#111827">
        <h2>Paiement validé ✅</h2>
        <p>Le paiement pour <strong>${companyLabel}</strong> a bien été confirmé.</p>
        <ul>
          <li><strong>Montant :</strong> ${body.amount ?? 0} €</li>
          <li><strong>Date :</strong> ${paymentDate.toLocaleDateString("fr-FR")}</li>
          <li><strong>Détail :</strong> ${body.description ?? "-"}</li>
        </ul>
        <p>QR code associé au paiement :</p>
        <img src="${qrCodeUrl}" alt="QR code paiement" width="220" height="220" />
      </div>
    `;

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: RESEND_FROM_EMAIL ?? "onboarding@resend.dev",
        to: [to],
        subject: `Paiement validé - ${companyLabel}`,
        html,
      }),
    });

    if (!resendResponse.ok) {
      const errorBody = await resendResponse.text();
      return NextResponse.json(
        { error: "Échec envoi email", details: errorBody },
        { status: 502 }
      );
    }

    const result = await resendResponse.json();
    return NextResponse.json({ ok: true, result, qrCodeUrl });
  } catch (error) {
    return NextResponse.json(
      { error: "Erreur inattendue", details: String(error) },
      { status: 500 }
    );
  }
}
