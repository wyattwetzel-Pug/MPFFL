import type { Metadata } from "next";
import { LegalDocument, B, L, type LegalSection } from "@/components/legal-document";

export const metadata: Metadata = { title: "Terms of Use" };

const SECTIONS: LegalSection[] = [
  {
    heading: "Acceptance",
    blocks: [{ kind: "p", text: <>By creating an account, or otherwise using this Site, you agree to be bound by these Terms and our <L href="/privacy">Privacy Policy</L>. If you disagree, do not use the Services.</> }],
  },
  {
    heading: "Eligibility",
    blocks: [{ kind: "p", text: <>You must be <B>at least 13 years old</B> (or the age of digital consent in your jurisdiction) and capable of forming a binding contract. Users under 18 may participate only with parental consent.</> }],
  },
  {
    heading: "Account Registration & Security",
    blocks: [{ kind: "ul", items: [
      <><B>You agree to provide accurate information and keep it updated.</B></>,
      <>You are responsible for safeguarding your password and any activity on your account.</>,
      <>We may suspend or terminate accounts for violations (see § 13).</>,
    ] }],
  },
  {
    heading: "League Rules & Scoring",
    blocks: [{ kind: "p", text: <>By using this Site, you agree to all of the rules, codes of conduct, mores, norms, customs, and courtesies spelled out in the <B><L href="/manual">league manual</L></B>. We are not liable for Commissioner decisions.</> }],
  },
  {
    heading: "Fees & Payments",
    blocks: [{ kind: "p", text: <>Entry fees, league dues, or other management fees are disclosed by the Commissioner. Payments are processed by a third-party provider; we never store full card data.</> }],
  },
  {
    heading: "User Content",
    blocks: [
      { kind: "p", text: <>&ldquo;User Content&rdquo; includes team names, chat posts, avatar images, uploads, and any other material you submit.</> },
      { kind: "ul", items: [
        <><B>License:</B> You grant us <B>full ownership</B> to host, display, use, and distribute any content, contribution, data, and actions you contribute on this Site.</>,
        <><B>Prohibited Content:</B> You must not create, or share, any content that is defamatory, hateful, harassing, infringing, or otherwise unlawful on this Site. <B>We will remove or moderate at our discretion. We reserve the right to delete your account, close your access, kick you out of the league, give your team to another owner, and publicly rebuke you if you violate these terms. The Commissioner is the sole adjudicator of violations. You agree to accept the Commissioner&apos;s decision without argument or ill will, and you will not disparage the Commissioner, the league, or this Site.</B></>,
      ] },
    ],
  },
  {
    heading: "Prohibited Conduct",
    blocks: [
      { kind: "p", text: "You agree not to:" },
      { kind: "ul", items: [
        <>Use bots, scrapers, or data-mining tools without written permission;</>,
        <>Attempt to gain unauthorized access to other accounts or systems;</>,
        <>Interfere with or disrupt the Services or servers;</>,
        <>Harvest phone numbers or send unsolicited SMS not expressly permitted by these Terms.</>,
      ] },
    ],
  },
  {
    heading: "Intellectual Property",
    blocks: [{ kind: "p", text: <>All Site content, software, and trademarks (excluding User Content) are our property or licensed to us and protected by U.S. and international IP laws.</> }],
  },
  {
    heading: "SMS Consent",
    blocks: [
      { kind: "p", text: "By providing a phone number you:" },
      { kind: "ul", items: [
        <><B>Agree</B> to receive transactional SMS related to leagues (draft reminders, score updates).</>,
        <><B>Agree</B> to receive promotional SMS.</>,
        <><B>Can opt-out</B> at any time by texting <B>STOP</B> or unchecking the relevant boxes in your account settings (see <L href="/privacy">Privacy Policy</L>).</>,
      ] },
    ],
  },
  {
    heading: "Disclaimers",
    blocks: [{ kind: "p", text: <>THE SERVICES ARE PROVIDED &ldquo;AS IS&rdquo; AND &ldquo;AS AVAILABLE.&rdquo; WE DISCLAIM ALL WARRANTIES, EXPRESS OR IMPLIED, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. WE DO NOT WARRANT THAT SCORES OR STATISTICS ARE ERROR-FREE OR THAT MESSAGES WILL BE DELIVERED WITHOUT DELAY.</> }],
  },
  {
    heading: "Limitation of Liability",
    blocks: [{ kind: "p", text: <>To the fullest extent permitted by law, our total liability for any claim arising out of or relating to the Services will not exceed <B>US $100</B> or the total amount you paid us in the 12 months preceding the claim, whichever is greater. We are not liable for indirect, incidental, special, or consequential damages.</> }],
  },
  {
    heading: "Indemnification",
    blocks: [{ kind: "p", text: <>You agree to indemnify and hold harmless MPFFL, its officers, directors, employees, and agents from any claim or demand arising out of your breach of these Terms or misuse of the Services.</> }],
  },
  {
    heading: "Termination & Suspension",
    blocks: [{ kind: "p", text: <>We may suspend or terminate your account at any time for violation of these Terms or applicable law. <B>You may terminate your account at any time via written request to the Commissioner.</B> Sections 8 through 16 survive termination.</> }],
  },
  {
    heading: "Governing Law & Dispute Resolution",
    blocks: [{ kind: "ul", items: [
      <><B>Governing Law:</B> State of <B>California</B>, without regard to conflict-of-law principles.</>,
      <><B>Arbitration:</B> Any dispute (except small-claims or IP infringement) will be resolved by binding arbitration under the <B>AAA Consumer Arbitration Rules</B>. You waive class-action rights.</>,
    ] }],
  },
  {
    heading: "Changes to These Terms",
    blocks: [{ kind: "p", text: <>We reserve the right to modify these Terms. We will notify you via email or in-app notice at least <B>30 days</B> before changes take effect. Continued use after the effective date constitutes acceptance.</> }],
  },
  {
    heading: "Miscellaneous",
    blocks: [{ kind: "ul", items: [
      <><B>Severability:</B> If any provision is unenforceable, the remainder stays in force.</>,
      <><B>Entire Agreement:</B> These Terms and the Privacy Policy constitute the entire agreement between you and us.</>,
      <><B>No Waiver:</B> Failure to enforce a provision is not a waiver of future enforcement.</>,
    ] }],
  },
];

export default function TermsOfUsePage() {
  return <LegalDocument title="Terms of Use" effective="June 22, 2025" sections={SECTIONS} />;
}
