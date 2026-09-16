import type { Metadata } from "next";
import LegalPage, { InShort, TableOfContents } from "@/components/marketing/LegalPage";
import { ACADEMY_DEFAULTS } from "@/lib/branding";
import { MARKETING_BASE_URL } from "@/lib/publicLinks";

export const metadata: Metadata = {
  title: "Refund Policy | Envision Chess Academy",
  description:
    "When Envisions Chess Academy LLP refunds fees and credits, how to ask for a refund, and how long it takes.",
  alternates: { canonical: `${MARKETING_BASE_URL}/refund-policy` },
};

/**
 * The commercial windows in this policy. They mirror the ones in the Terms
 * (`src/app/terms/page.tsx`) - change both together, or the two documents will
 * contradict each other and the Terms say this one wins.
 */
const POLICY = {
  withdrawalNoticeDays: 15,
  coolingOffClasses: 2,
  rescheduleNoticeHours: 12,
  creditValidityMonths: 6,
  refundProcessingDays: 10,
  claimWindowDays: 30,
};

const SECTIONS: [id: string, label: string][] = [
  ["scope", "WHAT THIS POLICY COVERS"],
  ["demo", "DEMO CLASSES"],
  ["cooling-off", "IF YOU CHANGE YOUR MIND EARLY"],
  ["monthly", "MONTHLY PLANS"],
  ["credits", "CREDIT PACKS"],
  ["missed", "MISSED CLASSES"],
  ["cancelled-by-us", "CLASSES WE CANCEL"],
  ["we-terminate", "IF WE END AN ENROLMENT"],
  ["not-refundable", "WHAT IS NOT REFUNDABLE"],
  ["how", "HOW TO ASK FOR A REFUND"],
  ["timing", "HOW REFUNDS ARE PAID"],
  ["failed", "FAILED PAYMENTS AND DUPLICATE CHARGES"],
  ["disputes", "IF YOU ARE NOT SATISFIED"],
  ["contact", "CONTACT US"],
];

const MAIL = `mailto:${ACADEMY_DEFAULTS.email}`;
const TEL = `tel:${ACADEMY_DEFAULTS.phone}`;
const ADDRESS = "20, Dr Jagabandhu Lane, Kolkata 700 012, West Bengal, India";

export default function RefundPolicyPage() {
  return (
    <LegalPage title="Refund Policy" lastUpdated="16 September 2026">
      <p>
        This Refund Policy explains when <strong>{ACADEMY_DEFAULTS.legalName}</strong>, trading as{" "}
        {ACADEMY_DEFAULTS.academyName}, refunds fees and credits, how to ask for a refund, and how
        long one takes. It forms part of our <a href="/terms">Terms and Conditions</a> and uses the
        same defined terms.
      </p>
      <p>
        We would rather fix a problem than argue about a refund. If something is not working — the
        batch is wrong, the timing does not suit, the coaching is not landing — write to us first at{" "}
        <a href={MAIL}>{ACADEMY_DEFAULTS.email}</a>. We can usually move a student, change a batch, or
        pause an enrolment.
      </p>

      <h2>Table of contents</h2>
      <TableOfContents items={SECTIONS} />

      <h2 id="scope">1. WHAT THIS POLICY COVERS</h2>
      <p>
        This policy covers fees you pay us for coaching: monthly plan fees and credit packs, for
        online classes and for classes at our Kolkata centres. It does not cover money you pay to
        someone else — a tournament organiser, a chess federation, or a third-party platform — which
        is governed by their own rules.
      </p>

      <h2 id="demo">2. DEMO CLASSES</h2>
      <InShort>Demo classes are free. There is nothing to refund.</InShort>
      <p>
        Where we charge for a demo or trial class, that charge is refundable in full if you ask before
        the demo takes place. Once a demo has been delivered it is not refundable, because the
        assessment has been done and given to you.
      </p>

      <h2 id="cooling-off">3. IF YOU CHANGE YOUR MIND EARLY</h2>
      <InShort>
        Within your first {POLICY.coolingOffClasses} classes you can stop and get the rest of your
        money back.
      </InShort>
      <p>
        If you decide within the student&rsquo;s first {POLICY.coolingOffClasses} attended classes
        that the Academy is not right for them, tell us and we will refund what you paid, less the
        pro-rata value of the classes attended and any payment-gateway charge that we cannot recover.
      </p>
      <p>
        This applies once per student, to their first enrolment with us. It does not apply to a
        re-enrolment or to a student returning after a withdrawal.
      </p>

      <h2 id="monthly">4. MONTHLY PLANS</h2>
      <p>
        A monthly fee buys that month&rsquo;s scheduled classes. You may withdraw a student at any
        time by giving at least {POLICY.withdrawalNoticeDays} days&rsquo; written notice to{" "}
        <a href={MAIL}>{ACADEMY_DEFAULTS.email}</a>.
      </p>
      <ul>
        <li>
          <strong>Classes already delivered</strong> in the current month are not refundable.
        </li>
        <li>
          <strong>Classes not yet delivered</strong> in the current month, after the notice period
          ends, are refunded pro rata.
        </li>
        <li>
          <strong>Months paid in advance</strong> and not yet started are refunded in full.
        </li>
        <li>
          <strong>Billing stops</strong> from the start of the first full billing cycle after the
          notice period ends.
        </li>
      </ul>
      <p>
        If we increase the fee for a monthly plan and you do not accept the increase, you may withdraw
        with effect from the date the new fee would start, and we will refund any advance beyond that
        date in full, without requiring the notice period.
      </p>

      <h2 id="credits">5. CREDIT PACKS</h2>
      <p>
        On a credit plan you buy a pack of classes in advance, and one credit is consumed for each
        session attended.
      </p>
      <ul>
        <li>
          <strong>Unused credits</strong> are refundable at the per-class rate of the pack you bought,
          less any discount that was applied for buying in bulk. In practice this means the classes
          you attended are re-priced at our standard single-class rate, and the balance is returned.
        </li>
        <li>
          <strong>Credits already consumed</strong>, including for a session marked absent under the
          attendance rule in our <a href="/terms">Terms</a>, are not refundable.
        </li>
        <li>
          <strong>Expired credits</strong> — unused after {POLICY.creditValidityMonths} months, or the
          period stated on your invoice — are not refundable or transferable. We send a reminder
          before credits expire. If a pack expired while the enrolment was paused, write to us and we
          will restore it.
        </li>
        <li>
          <strong>Credits are not transferable</strong> between students, including between siblings,
          unless we agree in writing.
        </li>
      </ul>

      <h2 id="missed">6. MISSED CLASSES</h2>
      <InShort>
        A class the student misses is not refunded. A class cancelled in time may get a make-up.
      </InShort>
      <p>
        Fees are not reduced, and credits are not returned, for a class the student does not attend.
        Where you cancel with at least {POLICY.rescheduleNoticeHours} hours&rsquo; notice we may offer
        a make-up class instead, within the limits set out in our <a href="/terms">Terms</a>. A
        make-up class is an alternative to a refund, not an addition to one.
      </p>
      <p>
        A class missed because of your device, internet connection or power supply counts as
        delivered.
      </p>

      <h2 id="cancelled-by-us">7. CLASSES WE CANCEL</h2>
      <p>
        If we cancel a class — for a coach&rsquo;s absence, a technical failure at our end, or any
        other reason attributable to us — we will reschedule it, return the credit, or extend your
        billing period by the equivalent. If we cannot do any of those within a reasonable time, we
        will refund the value of the class.
      </p>
      <p>
        Where classes cannot run because of an event outside our reasonable control, we will
        reschedule them. Fees are not refunded for a session that is rescheduled and delivered.
      </p>

      <h2 id="we-terminate">8. IF WE END AN ENROLMENT</h2>
      <p>
        If we discontinue a batch or stop offering a course and cannot offer a suitable alternative,
        we refund in full all fees for classes not yet delivered and all unexpired credits, with no
        deduction.
      </p>
      <p>
        If we end an enrolment because of a breach of our <a href="/terms">Terms</a> — non-payment,
        account sharing, a fair-play violation, or abusive behaviour — fees already paid are not
        refunded and remaining credits are forfeited.
      </p>

      <h2 id="not-refundable">9. WHAT IS NOT REFUNDABLE</h2>
      <ul>
        <li>classes already delivered, and sessions marked absent;</li>
        <li>credits that have expired;</li>
        <li>registration or admission fees, where charged and described as non-refundable;</li>
        <li>
          tournament entry fees, federation registration fees and travel costs, once paid to the
          organiser or federation on your instruction;
        </li>
        <li>
          printed books, boards, clocks or other physical goods, once delivered and not defective;
        </li>
        <li>fees where an enrolment is ended for a breach of the Terms; and</li>
        <li>
          payment-gateway charges on a refunded transaction, where the gateway does not return them to
          us.
        </li>
      </ul>

      <h2 id="how">10. HOW TO ASK FOR A REFUND</h2>
      <p>
        Write to <a href={MAIL}>{ACADEMY_DEFAULTS.email}</a> from the email address on the account, or
        message us on <a href={TEL}>{ACADEMY_DEFAULTS.phone}</a>, with:
      </p>
      <ul>
        <li>the student&rsquo;s name and batch;</li>
        <li>the invoice number or payment reference;</li>
        <li>what you are asking to be refunded, and why.</li>
      </ul>
      <p>
        Please raise a refund request within {POLICY.claimWindowDays} days of the payment or of the
        event you are complaining about. We acknowledge requests within 24 hours and tell you our
        decision, with the calculation, within 7 working days.
      </p>

      <h2 id="timing">11. HOW REFUNDS ARE PAID</h2>
      <p>
        Approved refunds are paid to the original payment method through Razorpay. They are credited
        within {POLICY.refundProcessingDays} working days of approval, though your bank or card issuer
        may take a further cycle to show the amount.
      </p>
      <p>
        Where the original method can no longer receive a payment, we will refund by bank transfer to
        an account in the account holder&rsquo;s name, after verifying it. We do not refund in cash,
        and we do not refund to a third party&rsquo;s account.
      </p>
      <p>
        Refunds are made in Indian Rupees for the amount received. We are not responsible for
        differences caused by exchange rates or by fees your own bank charges.
      </p>

      <h2 id="failed">12. FAILED PAYMENTS AND DUPLICATE CHARGES</h2>
      <p>
        If money left your account but the payment did not complete, it is usually returned
        automatically by your bank within 5 to 7 working days. If it has not, send us the payment
        reference and we will trace it with Razorpay.
      </p>
      <p>
        A duplicate charge for the same invoice is refunded in full as soon as we confirm it, with no
        deduction and without counting against any other limit in this policy.
      </p>

      <h2 id="disputes">13. IF YOU ARE NOT SATISFIED</h2>
      <p>
        If you disagree with a refund decision, write to our Grievance Officer,{" "}
        {ACADEMY_DEFAULTS.authorizedSignatory}, at <a href={MAIL}>{ACADEMY_DEFAULTS.email}</a>. The
        decision will be reviewed by someone who was not involved in making it, and we will respond
        within 15 days.
      </p>
      <p>
        Nothing in this policy affects your rights as a consumer under the Consumer Protection Act,
        2019, including your right to approach the appropriate Consumer Disputes Redressal Commission.
      </p>

      <h2 id="contact">14. CONTACT US</h2>
      <p>
        <strong>{ACADEMY_DEFAULTS.legalName}</strong>
        <br />
        {ADDRESS}
        <br />
        GSTIN {ACADEMY_DEFAULTS.gstNumber}
        <br />
        Email: <a href={MAIL}>{ACADEMY_DEFAULTS.email}</a>
        <br />
        Phone: <a href={TEL}>{ACADEMY_DEFAULTS.phone}</a>
      </p>
    </LegalPage>
  );
}
