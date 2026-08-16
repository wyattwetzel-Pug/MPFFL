import "server-only";
import { smsEnabled } from "@/lib/sms/send";
import { reachReport } from "@/lib/sms/reach";

/*
 * Can the league actually be reached right now?
 *
 * Both channels fail the same quiet way. `EMAIL_FROM` unset falls back to
 * Resend's shared sandbox sender, which delivers only to the account owner —
 * every other magic link is accepted, sent, and dropped. `SMS_KILL_SWITCH`
 * does the same for texts, and test mode redirects all of them to one number.
 *
 * Each of those failures has already happened here, and each time the app
 * looked like it was working. So the commissioner page states the delivery
 * position out loud rather than waiting for someone to notice the silence.
 */

export type DeliveryStatus = {
  email: {
    from: string;
    /** True when we're on Resend's shared sender — only the account owner gets mail. */
    sandbox: boolean;
  };
  sms: {
    /** "live" | "test mode" | "switched off" */
    mode: "live" | "test" | "off";
    testNumber: string | null;
    reachable: number;
    total: number;
    silentTeams: number;
  };
};

const SANDBOX_SENDER = "onboarding@resend.dev";

export async function deliveryStatus(): Promise<DeliveryStatus> {
  const from = process.env.EMAIL_FROM ?? `MPFFL <${SANDBOX_SENDER}>`;
  const reach = await reachReport();

  return {
    email: {
      from,
      sandbox: from.includes(SANDBOX_SENDER),
    },
    sms: {
      mode: !smsEnabled() ? "off" : process.env.SMS_TEST_MODE === "true" ? "test" : "live",
      testNumber: process.env.SMS_TEST_PHONE_NUMBER ?? null,
      reachable: reach.reachable,
      total: reach.total,
      silentTeams: reach.silentTeams.length,
    },
  };
}
