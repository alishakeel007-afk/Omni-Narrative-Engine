type SendPasswordResetEmailParams = {
  email: string;
  resetUrl: string;
};

const resendApiKey = process.env.RESEND_API_KEY;
const emailFrom = process.env.EMAIL_FROM || "Omni Narrative <onboarding@resend.dev>";

export async function sendPasswordResetEmail({ email, resetUrl }: SendPasswordResetEmailParams) {
  if (!resendApiKey) {
    console.log(`\n\n=== PASSWORD RESET LINK ===\n${resetUrl}\n===========================\n\n`);
    return;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: emailFrom,
      to: [email],
      subject: "Reset your Omni-Narrative password",
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111827;">
          <h2>Password reset request</h2>
          <p>Click the button below to reset your password. This link expires in 15 minutes.</p>
          <p>
            <a href="${resetUrl}" style="display:inline-block;background:#0ea5e9;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:999px;font-weight:700;">
              Reset password
            </a>
          </p>
          <p>If the button does not work, copy and paste this link into your browser:</p>
          <p style="word-break:break-all;color:#0369a1;">${resetUrl}</p>
          <p>If you did not request this, you can ignore this email.</p>
        </div>
      `,
      text: `Reset your Omni-Narrative password: ${resetUrl}\n\nThis link expires in 15 minutes.`,
    }),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Password reset email failed: ${message}`);
  }
}
