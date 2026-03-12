import * as brevo from '@getbrevo/brevo';

// Initialize Brevo API client
const apiInstance = new brevo.TransactionalEmailsApi();

export const sendEmail = async (to, sub, msg) => {
  // We set the API key INSIDE the function to ensure the .env is loaded first
  apiInstance.setApiKey(
    brevo.TransactionalEmailsApiApiKeys.apiKey,
    process.env.BREVO_API_KEY
  );

  try {
    const sendSmtpEmail = new brevo.SendSmtpEmail();
    
    sendSmtpEmail.subject = sub;
    sendSmtpEmail.htmlContent = msg;
    sendSmtpEmail.sender = { 
      name: "Renzo AI", 
      email: process.env.SMTP_EMAIL 
    };
    sendSmtpEmail.to = [{ email: to }];

    // This uses HTTP, not SMTP, so Render will NEVER block it!
    const data = await apiInstance.sendTransacEmail(sendSmtpEmail);
    
    console.log("Brevo API Email sent successfully to:", to);
    return { success: true, data };
    
  } catch (err) {
    // Advanced error logging
    const errorMessage = err.response ? err.response.text : err.message;
    console.error("Brevo API Error Details:", errorMessage);
    return { success: false, error: errorMessage };
  }
};