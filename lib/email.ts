import "server-only";
import { Resend } from "resend";

const FROM = process.env.EMAIL_FROM ?? "MPFFL <onboarding@resend.dev>";

/*
 * Absolute, because an email has no origin to be relative to — and taken from
 * the same variable the links use, so the crest doesn't 404 the day the domain
 * moves to REPLACE-WITH-YOUR-DOMAIN.example.
 */
const siteUrl = () =>
  process.env.APP_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "https://your-project.vercel.app";

/*
 * Email markup deliberately differs from the app's: clients strip <style>
 * blocks and modern CSS, so this uses tables and inline styles. Colors mirror
 * the site's dark theme tokens (globals.css) by hand.
 */
const C = {
  bg: "#0a0a0a",
  card: "#141414",
  border: "#262626",
  text: "#fafafa",
  muted: "#a3a3a3",
  button: "#fafafa",
  buttonText: "#171717",
};

function magicLinkHtml(url: string) {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:${C.bg};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg};padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:${C.card};border:1px solid ${C.border};border-radius:12px;">
            <tr>
              <td style="padding:28px 32px 8px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Helvetica,Arial,sans-serif;">
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="padding-right:10px;" valign="middle">
                      <!-- alt text carries the brand when images are blocked,
                           which is the default in plenty of mail clients. -->
                      <img src="${siteUrl()}/mpffl-logo-white.png" alt="MPFFL"
                           width="25" height="36"
                           style="display:block;border:0;outline:none;text-decoration:none;" />
                    </td>
                    <td valign="middle">
                      <div style="font-size:20px;font-weight:800;letter-spacing:-0.02em;color:${C.text};">
                        MPFFL
                      </div>
                      <div style="font-size:12px;color:${C.muted};padding-top:2px;">Est. 1987</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Helvetica,Arial,sans-serif;">
                <h1 style="margin:0 0 8px;font-size:18px;font-weight:700;color:${C.text};">Your sign-in link</h1>
                <p style="margin:0;font-size:14px;line-height:22px;color:${C.muted};">
                  Click below to sign in. No password needed.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 32px;" align="center">
                <a href="${url}"
                   style="display:inline-block;background:${C.button};color:${C.buttonText};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Helvetica,Arial,sans-serif;font-size:14px;font-weight:600;text-decoration:none;padding:11px 28px;border-radius:6px;">
                  Sign in to MPFFL
                </a>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Helvetica,Arial,sans-serif;">
                <p style="margin:0 0 12px;font-size:12px;line-height:18px;color:${C.muted};">
                  This link expires in 15 minutes and can only be used once. If you didn't request it, you can ignore this email.
                </p>
                <p style="margin:0;font-size:11px;line-height:17px;color:#6b6b6b;word-break:break-all;">
                  Button not working? Use this link instead — tap it, or press and hold to copy:<br />
                  <a href="${url}" style="color:${C.muted};text-decoration:underline;word-break:break-all;">${url}</a>
                </p>
              </td>
            </tr>
          </table>
          <div style="max-width:480px;padding:16px 8px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Helvetica,Arial,sans-serif;font-size:11px;color:#6b6b6b;">
            MPFFL Fantasy Football League
          </div>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function magicLinkText(url: string) {
  return [
    "MPFFL — Your sign-in link",
    "",
    "Click to sign in (no password needed):",
    url,
    "",
    "This link expires in 15 minutes and can only be used once.",
    "If you didn't request it, ignore this email.",
  ].join("\n");
}

// Without RESEND_API_KEY (local dev), magic links are logged to the server console.
export async function sendMagicLink(to: string, url: string) {
  if (!process.env.RESEND_API_KEY) {
    console.log(`\n[dev] Magic link for ${to}:\n${url}\n`);
    return;
  }
  const resend = new Resend(process.env.RESEND_API_KEY);
  const { error } = await resend.emails.send({
    from: FROM,
    to,
    subject: "Your MPFFL sign-in link",
    html: magicLinkHtml(url),
    text: magicLinkText(url),
  });
  if (error) throw new Error(`Resend error: ${error.message}`);
}
