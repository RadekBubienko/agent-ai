import nodemailer from "nodemailer";

export const transporter = nodemailer.createTransport({
  host: "h18.seohost.pl",
  port: 465,
  secure: true,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export async function sendWelcomeEmail(
  to: string,
  name: string,
  leadId: number,
) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;

  return transporter.sendMail({
    from: '"Green Foods" <info@probalancelife.pl>',
    to,
    subject: "Dziękujemy za rejestrację 🌿",
    html: `
      <h2>Cześć ${name},</h2>
      <p>Dziękujemy za zainteresowanie projektem.</p>

      <a href="${baseUrl}/api/track/click?lead=${leadId}&url=https://probalancelife.pl/oferta">
        Zobacz więcej
      </a>

      <img src="${baseUrl}/api/track/open?lead=${leadId}" width="1" height="1" />
    `,
  });
}

export async function sendEducationEmail(to: string, name: string) {
  return transporter.sendMail({
    from: '"Green Foods" <biuro@multitraffic.pl>',
    to,
    subject: "Dlaczego to działa?",
    html: `
      <h2>Cześć ${name},</h2>
      <p>Chcę pokazać Ci, dlaczego ten projekt działa.</p>
      <p>To nie jest przypadek — to system.</p>
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
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
  return transporter.sendMail({
    from: '"Green Foods" <biuro@multitraffic.pl>',
    to,
    subject: "Czy to coś dla Ciebie?",
    html: `
      <h2>Cześć ${name},</h2>
      <p>Jeśli czujesz, że to może być dla Ciebie</p>
      <a href="${baseUrl}/api/track/click?lead=${leadId}&type=business&url=https://probalancelife.pl/oferta">
        Zobacz szczegóły współpracy
      </a>
    `,
  });
}
export async function sendBusinessAlert(name: string, email: string) {
  return transporter.sendMail({
    from: '"Green Foods Alert" <info@probalancelife.pl>',
    to: "biuro@multitraffic.pl", // ← Twój mail operacyjny
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
    from: '"Green Foods Alert" <info@probalancelife.pl>',
    to: "biuro@multitraffic.pl",
    subject: "🟢 Nowy lead produktowy",
    html: `
      <h2>Nowy client_intent</h2>
      <p><strong>Imię:</strong> ${name}</p>
      <p><strong>Email:</strong> ${email}</p>
      <p>Lead wykazał zainteresowanie produktem.</p>
    `,
  });
}
