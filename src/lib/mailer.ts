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

export async function sendWelcomeEmail(to: string, name: string) {
  return transporter.sendMail({
    from: '"Green Foods, Pro Balace Life" <info@probalancelife.pl>',
    to,
    subject: "Dziękujemy za rejestrację 🌿",
    html: `
      <h2>Cześć ${name},</h2>
      <p>Dziękujemy za zainteresowanie projektem.</p>
      <p>Wkrótce otrzymasz więcej informacji.</p>
      <br/>
      <p>Zespół Green Foods, Pro Balace Life</p>
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

export async function sendDecisionEmail(to: string, name: string) {
  return transporter.sendMail({
    from: '"Green Foods" <biuro@multitraffic.pl>',
    to,
    subject: "Czy to coś dla Ciebie?",
    html: `
      <h2>Cześć ${name},</h2>
      <p>Jeśli czujesz, że to może być dla Ciebie — odpowiedz na tego maila.</p>
      <p>Wyślę Ci szczegóły współpracy.</p>
    `,
  });
}
