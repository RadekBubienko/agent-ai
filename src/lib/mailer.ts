import nodemailer from "nodemailer";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;
const OPERATIONS_EMAIL = "biuro@multitraffic.pl";

const PROBALANCELIFE_FROM = '"Probalancelife" <info@probalancelife.pl>';
const GREEN_FOODS_FROM = '"Green Foods" <biuro@multitraffic.pl>';
const GREEN_FOODS_ALERT_FROM = '"Green Foods Alert" <info@probalancelife.pl>';
const PROBALANCELIFE_ALERT_FROM =
  '"Probalancelife Alert" <info@probalancelife.pl>';

export const transporter = nodemailer.createTransport({
  host: "h18.seohost.pl",
  port: 465,
  secure: true,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

function buildOfferTrackingUrl(
  leadId: number,
  extraParams?: Record<string, string>,
) {
  const params = new URLSearchParams({
    lead: String(leadId),
    url: "https://probalancelife.pl/oferta",
  });

  if (extraParams) {
    for (const [key, value] of Object.entries(extraParams)) {
      params.set(key, value);
    }
  }

  return `${BASE_URL}/api/track/click?${params.toString()}`;
}

function buildOpenTrackingUrl(leadId: number) {
  return `${BASE_URL}/api/track/open?lead=${leadId}`;
}

export async function sendWelcomeEmail(
  to: string,
  name: string,
  leadId: number,
) {
  return transporter.sendMail({
    from: PROBALANCELIFE_FROM,
    to,
    subject: "Dziękujemy za rejestrację 🌿",
    html: `
      <h2>Cześć ${name},</h2>
      <p>Dziękujemy za zainteresowanie projektem.</p>

      <a href="${buildOfferTrackingUrl(leadId)}">
        Zobacz więcej
      </a>

      <img src="${buildOpenTrackingUrl(leadId)}" width="1" height="1" />
    `,
  });
}

export async function sendEducationEmail(to: string, name: string) {
  return transporter.sendMail({
    from: PROBALANCELIFE_FROM,
    to,
    subject: "Dlaczego to działa?",
    html: `
      <h2>Cześć ${name},</h2>
      <p>Chcę pokazać Ci, dlaczego ten projekt działa.</p>
      <p>To nie jest przypadek - to system.</p>
      <br/>
      <p>Wkrótce więcej informacji.</p>
    `,
  });
}

export async function sendDecisionEmail(
  to: string,
  name: string,
  leadId: number,
) {
  return transporter.sendMail({
    from: GREEN_FOODS_FROM,
    to,
    subject: "Czy to coś dla Ciebie?",
    html: `
      <h2>Cześć ${name},</h2>
      <p>Jeśli czujesz, że to może być dla Ciebie</p>
      <a href="${buildOfferTrackingUrl(leadId, { type: "business" })}">
        Zobacz szczegóły współpracy
      </a>
    `,
  });
}

export async function sendBusinessAlert(name: string, email: string) {
  return transporter.sendMail({
    from: GREEN_FOODS_ALERT_FROM,
    to: OPERATIONS_EMAIL,
    subject: "🔥 Nowy lead biznesowy",
    html: `
      <h2>Nowy business_intent</h2>
      <p><strong>Imię:</strong> ${name}</p>
      <p><strong>Email:</strong> ${email}</p>
      <p>Lead wykazał zainteresowanie współpracą.</p>
    `,
  });
}

export async function sendClientAlert(name: string, email: string) {
  return transporter.sendMail({
    from: PROBALANCELIFE_ALERT_FROM,
    to: OPERATIONS_EMAIL,
    subject: "🟢 Nowy lead produktowy",
    html: `
      <h2>Nowy client_intent</h2>
      <p><strong>Imię:</strong> ${name}</p>
      <p><strong>Email:</strong> ${email}</p>
      <p>Lead wykazał zainteresowanie produktem.</p>
    `,
  });
}
