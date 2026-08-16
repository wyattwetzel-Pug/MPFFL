import type { Metadata } from "next";
import { LegalDocument, B, L, type LegalSection } from "@/components/legal-document";

export const metadata: Metadata = { title: "Privacy Policy" };

const SECTIONS: LegalSection[] = [
  {
    heading: "Who We Are",
    blocks: [{ kind: "p", text: <>Palo Alto Fantasy Football League (also <B>&ldquo;MPFFL&rdquo;</B> or <B>&ldquo;MPFFL,&rdquo;</B> and collectively <B>&ldquo;we,&rdquo;</B> <B>&ldquo;us,&rdquo;</B> or <B>&ldquo;our&rdquo;</B>) operates <B>*.REPLACE-WITH-YOUR-DOMAIN.example and mpffl.vercel.app</B> (the <B>&ldquo;Site&rdquo;</B>) and related mobile, email, and SMS services (together, the <B>&ldquo;Services&rdquo;</B>).</> }],
  },
  {
    heading: "Scope — When This Policy Applies",
    blocks: [
      { kind: "p", text: "This Policy explains how we collect, use, disclose, and protect your information when you:" },
      { kind: "ul", items: [
        <>visit or use the Site;</>,
        <>register for an account or league;</>,
        <><B>post or comment on the Site;</B></>,
        <><B>upload photos or documents on the Site;</B></>,
        <><B>complete transactions on the Site;</B></>,
        <><B>engage with the Site&apos;s AI systems and content;</B></>,
        <>receive SMS, email, or push notifications; or</>,
        <>otherwise interact with us.</>,
      ] },
    ],
  },
  {
    heading: "Information We Collect",
    blocks: [
      { kind: "table", head: ["Category", "Examples", "Source"], rows: [
        [<B key="c">Identifiers</B>, "Name, username, postal address, email, phone number, IP address, device ID", "From you; cookies & similar tech"],
        [<B key="c">League Data</B>, "Team name, roster moves, scoring settings, league chat posts", "From you & league mates"],
        [<B key="c">Usage Data</B>, "Pages viewed, clicks, referral URLs, time-in-app", "Automatically"],
        [<B key="c">Payment Data</B>, "Card type, last 4 digits, transaction ID (League Dues & management fees)", "Payment processor"],
        [<B key="c">Location Data</B>, "Approximate city/state (derived from IP)", "Automatically"],
        [<B key="c">Communications</B>, "Email/SMS content, support tickets, survey responses", "From you"],
        [<B key="c">Inferred Insights</B>, "Interests or preferences derived from activity", "Ours & analytics partners"],
      ] },
      { kind: "p", text: <>We do <B>not</B> knowingly collect personal information from children under 13 (see § 11).</> },
    ],
  },
  {
    heading: "How We Use Your Information",
    blocks: [
      { kind: "table", head: ["Purpose", "Lawful Basis*"], rows: [
        ["Account creation & league management", "Contract"],
        ["SMS/email notifications about drafts, scores, or chat activity", "Contract / Consent"],
        ["Marketing newsletters & product updates", "Consent"],
        ["Fraud prevention & security monitoring", "Legitimate interest"],
        ["Analytics & product improvement", "Legitimate interest"],
        ["Compliance with law (e.g., TCPA opt-out logs)", "Legal obligation"],
      ] },
      { kind: "note", text: "* GDPR terminology; comparable concepts apply under U.S. state privacy laws." },
    ],
  },
  {
    heading: "SMS and Email Communications",
    blocks: [
      { kind: "p", text: <>We comply with the <B>Telephone Consumer Protection Act (TCPA)</B> and <B>CAN-SPAM Act</B>.</> },
      { kind: "ul", items: [
        <><B>Opt-In</B> — Supplying your mobile number or email during registration authorizes us to send <B>transactional</B> messages (e.g., draft reminders). You may separately opt-in to promotional messages.</>,
        <><B>Frequency</B> — Typically 5–10 texts per week during the season, but volume varies with league activity.</>,
        <><B>Opt-Out</B> — Text <B>STOP</B> or <B>uncheck the relevant boxes in your account settings</B> to stop further messages.</>,
        <><B>Help</B> — Contact the league commissioner if you have questions about this.</>,
        <><B>Carrier Notice</B> — Message & data rates may apply; carriers are not liable for delayed or undelivered messages.</>,
      ] },
    ],
  },
  {
    heading: "Cookies & Tracking",
    blocks: [{ kind: "p", text: <>We and our analytics/advertising partners use cookies, pixels, and local storage for authentication, preferences, and measurement (e.g., Google Analytics). <B>Assume that anything you do on the internet — and especially on this Site — is publicly visible. Please conduct yourself accordingly.</B></> }],
  },
  {
    heading: "Sharing & Disclosure",
    blocks: [
      { kind: "p", text: <>We share data <B>with partners and providers to enhance your experience on this Site. Examples include, but are not limited to:</B></> },
      { kind: "ul", items: [
        <><B>Service Providers</B> — cloud hosting, SMS gateway, payment processor, analytics tools;</>,
        <><B>League Participants</B> — your display name, roster, and chat posts;</>,
        <><B>Advertising & Social Media Partners</B> — hashed identifiers for ad measurement and reach;</>,
        <><B>Legal or Regulatory Authorities</B> — when required by law;</>,
        <><B>Successors</B> — if we merge, sell, or transfer assets, with notice to you.</>,
      ] },
      { kind: "p", text: <>We do <B>not</B> sell personal information for money, though some sharing for targeted advertising may be considered a &ldquo;sale&rdquo; under certain state laws.</> },
    ],
  },
  {
    heading: "Data Retention",
    blocks: [{ kind: "p", text: <>We retain account data <B>forever</B> and reserve the right to use it however we&apos;d like. SMS opt-out logs are kept for <B>4 years</B> in accordance with TCPA requirements.</> }],
  },
  {
    heading: "Security",
    blocks: [{ kind: "p", text: <><B>No system is 100% secure;</B> please choose a strong password (&gt; 10 characters, including at least one special character and one number) <B>and change it monthly.</B> Report any suspected security incident to the commissioner immediately.</> }],
  },
  {
    heading: "Your Privacy Rights",
    blocks: [{ kind: "p", text: <>Depending on your jurisdiction, you may have rights to access, correct, delete, restrict, or port your data, and to opt-out of sale/sharing for advertising purposes. <B>Exercise these rights by emailing the Commissioner.</B></> }],
  },
  {
    heading: "Children's Privacy (COPPA)",
    blocks: [{ kind: "p", text: <>We do not knowingly collect or solicit personal information from children under 13. If you believe a child has provided personal data, contact the Commissioner and we will delete it.</> }],
  },
  {
    heading: "International Transfers",
    blocks: [{ kind: "p", text: <>If you access the Services from outside the United States, you understand and agree that your information may be processed and stored in the U.S., which may have different privacy protections than your home jurisdiction.</> }],
  },
  {
    heading: "Changes to This Policy",
    blocks: [{ kind: "p", text: <>We will post any changes on this page and update the &ldquo;Last Updated&rdquo; date. <B>Please review this section quarterly to stay up to speed.</B> See also our <L href="/tou">Terms of Use</L>.</> }],
  },
];

export default function PrivacyPage() {
  return (
    <LegalDocument
      title="Privacy Policy"
      effective="June 22, 2025"
      updated="June 22, 2025"
      sections={SECTIONS}
    />
  );
}
