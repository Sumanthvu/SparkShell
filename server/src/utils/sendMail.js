import { BrevoClient } from "@getbrevo/brevo";

/**
 * Send a transactional HTML email via Brevo API.
 * @param {string} to       - Recipient email address
 * @param {string} sub      - Email subject line
 * @param {string} msg      - HTML body string
 * @returns {{ success: boolean, data?: object, error?: string }}
 */
export const sendEmail = async (to, sub, msg) => {
  const client = new BrevoClient({ apiKey: process.env.BREVO_API_KEY });

  try {
    const data = await client.transactionalEmails.sendTransacEmail({
      subject: sub,
      htmlContent: msg,
      sender: {
        name: "Renzo AI",
        email: process.env.SMTP_EMAIL,
      },
      to: [{ email: to }],
    });

    console.log("✅ Brevo email sent successfully to:", to);
    return { success: true, data };
  } catch (err) {
    const errorMessage = err.response ? err.response.text : err.message;
    console.error("❌ Brevo API Error:", errorMessage);
    return { success: false, error: errorMessage };
  }
};