/*
 * Phone numbers, normalised for Twilio.
 *
 * Stored in E.164 — a leading `+`, country code, then the number, no spaces or
 * punctuation. That is what Twilio's API wants, so nothing downstream has to
 * guess.
 *
 * The league was entirely North American until it wasn't. A bare ten digits
 * still means +1, because that is what sixteen of sixteen owners type and
 * asking them for a country code would be worse than useless. But an owner
 * living abroad has to be able to enter their own number, and the old rule
 * ("that doesn't look like a US phone number") made that impossible — which is
 * the sort of thing that quietly stops one person getting draft texts.
 *
 * A number that already carries a `+` is taken at its word and only checked for
 * shape. We do not keep a table of country codes: it would go stale, and
 * refusing a real number is a worse failure than accepting a typo, which the
 * owner can see and correct on their own settings page.
 */

/** E.164 allows at most 15 digits, and no real number is shorter than 7. */
const MIN_DIGITS = 7;
const MAX_DIGITS = 15;

export type PhoneResult =
  | { ok: true; phone: string | null }
  | { ok: false; error: string };

/**
 * Normalise what someone typed into E.164, or say why it can't be.
 *
 * Empty input is a valid answer — it clears the number — so `phone` is null
 * rather than an error.
 */
export function normalisePhone(input: string): PhoneResult {
  const trimmed = input.trim();
  if (!trimmed) return { ok: true, phone: null };

  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 0) return { ok: false, error: "That doesn't look like a phone number." };

  // Explicit country code — including "00" dialled from abroad, which people
  // paste out of their own contacts more often than you'd expect.
  const international = trimmed.startsWith("+") || trimmed.startsWith("00");
  if (international) {
    const body = trimmed.startsWith("00") ? digits.slice(2) : digits;
    if (body.length < MIN_DIGITS || body.length > MAX_DIGITS) {
      return {
        ok: false,
        error: `An international number needs ${MIN_DIGITS}–${MAX_DIGITS} digits after the country code sign.`,
      };
    }
    return { ok: true, phone: `+${body}` };
  }

  // No country code given: North America, which is what almost everyone types.
  if (digits.length === 10) return { ok: true, phone: `+1${digits}` };
  if (digits.length === 11 && digits.startsWith("1")) return { ok: true, phone: `+${digits}` };

  return {
    ok: false,
    error:
      "That doesn't look like a phone number. Ten digits for a US number, " +
      "or start with + and the country code.",
  };
}

/**
 * E.164 back into something readable.
 *
 * North American numbers get the shape everyone here expects; everything else
 * is left alone, because grouping digits correctly differs by country and
 * guessing wrong reads as an error to the person whose number it is.
 */
export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return "";
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(phone);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : phone;
}
