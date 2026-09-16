import type { Metadata } from "next";
import LegalPage, { InShort, TableOfContents } from "@/components/marketing/LegalPage";
import { ACADEMY_DEFAULTS } from "@/lib/branding";
import { MARKETING_BASE_URL } from "@/lib/publicLinks";

export const metadata: Metadata = {
  title: "Terms and Conditions | Envision Chess Academy",
  description:
    "The terms on which Envisions Chess Academy LLP provides chess coaching, classes, and the Envision Chess Academy learning platform.",
  alternates: { canonical: `${MARKETING_BASE_URL}/terms` },
};

/**
 * Commercial terms that are the academy's call rather than the platform's.
 *
 * They live here because they are the only numbers in this document that are not
 * already enforced somewhere in the code, so this is the one place to change them
 * when the academy changes the policy. The late fee and its grace period mirror
 * the FeePlan defaults in `src/models/Fee.ts`.
 */
const POLICY = {
  rescheduleNoticeHours: 12,
  lateJoinGraceMinutes: 15,
  makeUpsPerMonth: 2,
  withdrawalNoticeDays: 15,
  maxPauseDaysPerYear: 60,
  lateFeeRupees: 500,
  lateFeeAfterDays: 10,
  creditValidityMonths: 6,
  grievanceResponseDays: 15,
};

const SECTIONS: [id: string, label: string][] = [
  ["agreement", "AGREEMENT TO THESE TERMS"],
  ["definitions", "DEFINITIONS"],
  ["eligibility", "ELIGIBILITY, PARENTS AND MINORS"],
  ["accounts", "YOUR ACCOUNT"],
  ["enrolment", "DEMO CLASSES, ENROLMENT AND BATCH PLACEMENT"],
  ["classes", "CLASSES, SCHEDULE AND ATTENDANCE"],
  ["changes-to-enrolment", "MAKE-UP CLASSES, PAUSES AND BATCH CHANGES"],
  ["fees", "FEES, BILLING AND TAXES"],
  ["payments", "PAYMENTS"],
  ["refunds", "REFUNDS AND CANCELLATION"],
  ["communications", "COMMUNICATIONS AND WHATSAPP NOTIFICATIONS"],
  ["live-classes", "LIVE CLASSES, LINKS AND RECORDINGS"],
  ["acceptable-use", "ACCEPTABLE USE OF THE PLATFORM"],
  ["fair-play", "FAIR PLAY AND ANTI-CHEATING"],
  ["third-party", "THIRD-PARTY SERVICES"],
  ["ip", "COURSE MATERIAL AND INTELLECTUAL PROPERTY"],
  ["student-work", "STUDENT WORK, GAMES AND FEEDBACK"],
  ["tournaments", "TOURNAMENTS, ASSESSMENTS AND CERTIFICATES"],
  ["publicity", "PHOTOGRAPHS, RESULTS AND PUBLICITY"],
  ["offline", "CLASSES AT OUR CENTRES"],
  ["service-changes", "COACH SUBSTITUTION AND CHANGES TO THE SERVICE"],
  ["termination", "SUSPENSION AND TERMINATION"],
  ["disclaimers", "DISCLAIMERS AND NO GUARANTEE OF RESULTS"],
  ["liability", "LIMITATION OF LIABILITY"],
  ["indemnity", "INDEMNITY"],
  ["law", "GOVERNING LAW AND DISPUTE RESOLUTION"],
  ["grievance", "GRIEVANCE REDRESSAL"],
  ["updates", "CHANGES TO THESE TERMS"],
  ["general", "GENERAL"],
  ["contact", "HOW TO CONTACT US"],
];

const MAIL = `mailto:${ACADEMY_DEFAULTS.email}`;
const TEL = `tel:${ACADEMY_DEFAULTS.phone}`;
const ADDRESS = "20, Dr Jagabandhu Lane, Kolkata 700 012, West Bengal, India";

export default function TermsPage() {
  return (
    <LegalPage title="Terms and Conditions" lastUpdated="16 September 2026">
      <p>
        These Terms and Conditions (<strong>&ldquo;Terms&rdquo;</strong>) govern the chess coaching
        services, classes, events and online learning platform offered by{" "}
        <strong>{ACADEMY_DEFAULTS.legalName}</strong>, trading as {ACADEMY_DEFAULTS.academyName}, a
        limited liability partnership registered in India at {ADDRESS}, GSTIN{" "}
        {ACADEMY_DEFAULTS.gstNumber} (<strong>&ldquo;we&rdquo;</strong>,{" "}
        <strong>&ldquo;us&rdquo;</strong>, <strong>&ldquo;our&rdquo;</strong> or the{" "}
        <strong>&ldquo;Academy&rdquo;</strong>).
      </p>
      <p>
        They apply to our website at <a href={MARKETING_BASE_URL}>{ACADEMY_DEFAULTS.website}</a>, to
        the learning platform you sign in to, to online classes, and to classes held at our centres in
        Kolkata. Please read them together with our <a href="/privacy">Privacy Policy</a> and our{" "}
        <a href="/refund-policy">Refund Policy</a>, both of which form part of these Terms.
      </p>

      <h2>Table of contents</h2>
      <TableOfContents items={SECTIONS} />

      <h2 id="agreement">1. AGREEMENT TO THESE TERMS</h2>
      <InShort>
        Creating an account, booking a demo class, or enrolling a student means you accept these
        Terms. If you are enrolling a child, you accept them on the child&rsquo;s behalf.
      </InShort>
      <p>
        By creating an account, booking a demo class, enrolling a student, paying a fee, or attending
        a class, you agree to these Terms and enter into a binding agreement with us. If you do not
        agree, please do not use the Platform and do not enrol.
      </p>
      <p>
        Where a student is under 18, the parent or legal guardian who creates the account is the
        person contracting with us, is bound by these Terms, and accepts them on behalf of the
        student.
      </p>

      <h2 id="definitions">2. DEFINITIONS</h2>
      <ul>
        <li>
          <strong>Platform</strong> means our website, the student, parent and coach dashboards, the
          class and analysis tools, and any related application we make available.
        </li>
        <li>
          <strong>Student</strong> means the person enrolled to receive coaching.
        </li>
        <li>
          <strong>You</strong> means the account holder: the adult student, or the parent or guardian
          who enrols a minor.
        </li>
        <li>
          <strong>Batch</strong> means the group and recurring timetable a student is placed in.
        </li>
        <li>
          <strong>Session</strong> or <strong>Class</strong> means one scheduled coaching session,
          online or at a centre.
        </li>
        <li>
          <strong>Credits</strong> means pre-purchased class entitlements under a credit-based fee
          plan, where one credit is consumed for each session attended.
        </li>
      </ul>

      <h2 id="eligibility">3. ELIGIBILITY, PARENTS AND MINORS</h2>
      <InShort>
        Most of our students are children. A parent or guardian must hold the account and is
        responsible for what happens on it.
      </InShort>
      <p>
        An account for a student under 18 must be created and operated by a parent or legal guardian.
        If you are under 18, you may use the Platform only through such an account and under adult
        supervision. We may ask for proof of a student&rsquo;s age or of your authority to act for
        them.
      </p>
      <p>As the account holder you are responsible for:</p>
      <ul>
        <li>all activity carried out through the account, including by the student;</li>
        <li>payment of all fees due for the enrolment;</li>
        <li>
          supervising a minor&rsquo;s participation in online classes and their use of any chess
          platform or communication feature we link to; and
        </li>
        <li>
          the consents recorded in our <a href="/privacy">Privacy Policy</a>, which you give on the
          student&rsquo;s behalf.
        </li>
      </ul>
      <p>
        We may refuse, suspend or end an enrolment where we reasonably believe an account has been
        created for a minor without a parent or guardian, or that the information given to us is
        false.
      </p>

      <h2 id="accounts">4. YOUR ACCOUNT</h2>
      <p>
        You must give accurate registration details and keep them current, in particular the mobile
        number and email address we send class links, invoices and security messages to. Accounts are
        personal. Keep your password confidential, do not share your login, and tell us at once if you
        believe someone else has used it.
      </p>
      <p>
        <strong>One account is for one enrolled student.</strong> Allowing a sibling, a friend or any
        other person to attend classes on a single enrolment is a material breach of these Terms and
        may lead to immediate suspension without refund. Siblings must be enrolled separately.
      </p>
      <p>
        Because families often share a mobile number or an email address, more than one account may
        legitimately carry the same contact details. We may ask you to confirm which student a request
        relates to before we act on it.
      </p>

      <h2 id="enrolment">5. DEMO CLASSES, ENROLMENT AND BATCH PLACEMENT</h2>
      <InShort>
        A demo class is a free assessment, not a promise of a place. We decide the level and batch a
        student joins.
      </InShort>
      <p>
        We may offer a free or discounted demo class. A demo is an assessment session: it lets a coach
        judge the student&rsquo;s level and lets you judge us. Booking a demo does not create an
        enrolment and does not reserve a place in any batch. We may limit each student to one demo
        class.
      </p>
      <p>
        After a demo, or on enrolment, we place the student in a batch based on their assessed
        strength, their age and the timetable available. Placement is our decision. Where we have
        assessed a student we make the assessment available to you through the Platform; an assessment
        is our professional opinion at a point in time and is not a grading, certification or rating
        recognised by any chess federation.
      </p>
      <p>
        An enrolment begins when we confirm a student&rsquo;s place in a batch and the first fee is
        paid, and continues until it ends under section <a href="#refunds">10</a> or section{" "}
        <a href="#termination">22</a>.
      </p>

      <h2 id="classes">6. CLASSES, SCHEDULE AND ATTENDANCE</h2>
      <p>
        Classes run to the published schedule for the student&rsquo;s batch, in Indian Standard Time.
        We will tell you in advance, where practicable, about holidays, timetable changes and sessions
        we need to move.
      </p>
      <p>
        <strong>Attendance.</strong> A student who has not joined within{" "}
        {POLICY.lateJoinGraceMinutes} minutes of the scheduled start time may be marked absent, and
        the session is treated as delivered and, on a credit plan, as consumed. Fees are not reduced
        for sessions a student does not attend.
      </p>
      <p>
        <strong>Notice of absence.</strong> To cancel or reschedule a session you must give at least{" "}
        {POLICY.rescheduleNoticeHours} hours&rsquo; notice through the Platform, or to the contact
        details in section <a href="#contact">30</a>. Sessions cancelled with less notice are treated
        as delivered.
      </p>
      <p>
        <strong>Classes we cancel.</strong> If we cancel a session — for a coach&rsquo;s illness, a
        technical failure at our end, or any other reason attributable to us — we will reschedule it,
        credit it back, or hold it as a make-up class. That is your remedy for a cancelled session.
      </p>
      <p>
        <strong>Your equipment.</strong> For online classes you are responsible for a device, a
        working camera and microphone, and an internet connection good enough to take part. A session
        missed or cut short because of your device, power supply or connection is treated as
        delivered.
      </p>

      <h2 id="changes-to-enrolment">7. MAKE-UP CLASSES, PAUSES AND BATCH CHANGES</h2>
      <InShort>
        Make-ups are limited and discretionary. You can pause an enrolment for a fixed period. We may
        move a student to a batch that fits them better.
      </InShort>
      <p>
        <strong>Make-up classes.</strong> Where a student misses a session with proper notice we may
        offer a make-up class, subject to coach and batch availability, up to{" "}
        {POLICY.makeUpsPerMonth} in any calendar month. Make-ups are a goodwill arrangement, are not
        guaranteed, cannot be accumulated, and lapse if not taken within the following month.
      </p>
      <p>
        <strong>Pauses.</strong> You may ask us to pause an enrolment — for examinations, illness or
        travel — for a defined period of up to {POLICY.maxPauseDaysPerYear} days in any twelve months,
        by giving notice before the pause begins. While an enrolment is paused, billing is suspended
        on a monthly plan and credits do not expire on a credit plan. A pause does not reserve the
        student&rsquo;s place: on resumption we will place them in a suitable batch, which may not be
        the batch they left.
      </p>
      <p>
        <strong>Batch changes.</strong> We may move a student to another batch where their level, age
        group or the timetable makes it appropriate, or where a batch is discontinued, and will tell
        you before we do. Once a student moves, their access to the batch they left ends for future
        sessions; their attendance, fee and assessment history is kept and stays visible to you.
      </p>

      <h2 id="fees">8. FEES, BILLING AND TAXES</h2>
      <p>
        Fees are quoted in Indian Rupees and are payable in advance. We offer two kinds of fee plan,
        and your invoice and dashboard show which one applies to a student:
      </p>
      <ul>
        <li>
          <strong>Monthly plans</strong>, billed on a fixed day of each month for that month&rsquo;s
          classes; and
        </li>
        <li>
          <strong>Credit plans</strong>, where you buy a pack of classes in advance and one credit is
          consumed for each session attended. Unless your invoice says otherwise, credits expire{" "}
          {POLICY.creditValidityMonths} months after purchase, and expired credits are not refundable
          or transferable.
        </li>
      </ul>
      <p>
        <strong>Taxes.</strong> Where GST applies it is charged at the prevailing rate and shown
        separately on your invoice. Whether a fee is quoted inclusive or exclusive of GST is stated at
        the point of sale and on the invoice.
      </p>
      <p>
        <strong>Late payment.</strong> If a fee is not paid by its due date we may charge a late fee
        of ₹{POLICY.lateFeeRupees} after {POLICY.lateFeeAfterDays} days, and may suspend access to
        classes and to the Platform until the account is cleared. Suspension for non-payment does not
        reduce fees that have already accrued.
      </p>
      <p>
        <strong>Changes to fees.</strong> We may revise our fees. For a monthly plan we will give you
        at least one full billing cycle&rsquo;s notice before a revised fee applies, and you may
        withdraw under section <a href="#refunds">10</a> if you do not accept it. A revision never
        changes the price of credits you have already bought.
      </p>

      <h2 id="payments">9. PAYMENTS</h2>
      <p>
        Payments are collected through Razorpay, an independent payment processor. Your card, UPI or
        banking details are handled by Razorpay under its own terms and privacy policy; we do not
        receive or store them. A payment is complete only when Razorpay confirms it to us — a
        deduction shown by your bank without that confirmation may take a normal settlement cycle to
        appear against your account.
      </p>
      <p>
        You are responsible for any bank charges, currency conversion costs or transaction fees your
        provider applies. Where a payment is reversed, charged back or fails after a class has been
        delivered, the fee remains due.
      </p>

      <h2 id="refunds">10. REFUNDS AND CANCELLATION</h2>
      <InShort>
        Refunds are governed by our Refund Policy. You may withdraw at any time by giving notice.
      </InShort>
      <p>
        Refunds, cancellations and withdrawals are governed by our{" "}
        <a href="/refund-policy">Refund Policy</a>, which forms part of these Terms and sets out what
        is refundable and how to ask for it.
      </p>
      <p>
        You may withdraw a student at any time by giving at least {POLICY.withdrawalNoticeDays}{" "}
        days&rsquo; written notice to <a href={MAIL}>{ACADEMY_DEFAULTS.email}</a>. Fees for classes
        already delivered, and for the notice period, remain payable.
      </p>

      <h2 id="communications">11. COMMUNICATIONS AND WHATSAPP NOTIFICATIONS</h2>
      <InShort>
        We send class, fee and account messages on WhatsApp, SMS and email. Those are part of the
        service. Marketing messages are separate and you can stop them at any time.
      </InShort>
      <p>
        By creating an account or enrolling a student, you consent to receive messages from us at the
        mobile number and email address on your account, including through WhatsApp, SMS, email and
        notifications inside the Platform.
      </p>
      <p>
        <strong>Service messages.</strong> These include class and session reminders, joining links,
        attendance updates, coach and schedule changes, fee and invoice reminders, payment
        confirmations, demo and booking confirmations, assessment and progress reports, and account
        security and password-reset messages. They are necessary to deliver the coaching you have paid
        for, and you cannot opt out of them while an enrolment is active. If you do not wish to
        receive them, you will need to withdraw the enrolment.
      </p>
      <p>
        <strong>Marketing messages.</strong> Offers, new-course announcements and similar promotional
        messages are separate. You can stop them at any time by replying STOP on WhatsApp or writing
        to <a href={MAIL}>{ACADEMY_DEFAULTS.email}</a>, and doing so will not affect your classes or
        your service messages.
      </p>
      <p>
        <strong>How WhatsApp messages reach you.</strong> WhatsApp messages are delivered through
        Meta&rsquo;s WhatsApp Business Platform and are subject to WhatsApp&rsquo;s own terms. We do
        not control delivery. We are not responsible for a message that is delayed, not delivered,
        blocked, or read by another person who has access to your device or your number.
      </p>
      <p>
        <strong>Keeping your number current.</strong> You must tell us immediately if your registered
        mobile number changes, is disconnected or is reassigned. Until you do, class links, invoices
        and security messages will continue to be sent to that number, and we are not responsible for
        messages sent to a number you no longer hold.
      </p>
      <p>
        Messages you exchange with us on WhatsApp are stored against your record so that our team can
        answer you, and are handled as described in our <a href="/privacy">Privacy Policy</a>.
      </p>

      <h2 id="live-classes">12. LIVE CLASSES, LINKS AND RECORDINGS</h2>
      <p>
        Online classes are held over Google Meet or a comparable third-party meeting service. The
        joining link for a session is issued for the enrolled student alone. You must not forward,
        publish, post or otherwise share a joining link, and we may change or revoke a link at any
        time.
      </p>
      <p>
        <strong>You must not record.</strong> You may not record, screen-capture, photograph, stream
        or redistribute any part of a class, a coach&rsquo;s explanation, or any material shown in it,
        without our prior written consent.
      </p>
      <p>
        <strong>We may record.</strong> We may record sessions for coaching quality, coach training,
        safeguarding and dispute resolution. A recording is ours, is kept only as long as it is needed
        for those purposes, and is handled under our <a href="/privacy">Privacy Policy</a>. If you
        object to a particular session being recorded, tell us before it starts.
      </p>
      <p>
        <strong>Conduct in class.</strong> Students, and anyone else present, must behave respectfully
        towards coaches and other students. A parent or guardian may be present but should not
        interrupt coaching. We may remove a participant from a session, and suspend an account, for
        abusive, disruptive or unsafe behaviour.
      </p>

      <h2 id="acceptable-use">13. ACCEPTABLE USE OF THE PLATFORM</h2>
      <p>You agree not to:</p>
      <ul>
        <li>share your login, sell access, or let anyone other than the enrolled student use it;</li>
        <li>
          copy, download in bulk, scrape, republish or resell any part of the Platform or its
          material;
        </li>
        <li>attempt to access another user&rsquo;s account, records, assessments, invoices or class;</li>
        <li>
          probe, scan, overload or interfere with the Platform, or attempt to bypass any access
          control, rate limit or payment requirement;
        </li>
        <li>upload anything unlawful, abusive, obscene or infringing, or any malware or harmful code;</li>
        <li>use the Platform or its material to run or assist a competing coaching service; or</li>
        <li>
          use any automated system to interact with the Platform, other than a standard web browser or
          an application we provide.
        </li>
      </ul>
      <p>
        We may investigate a suspected breach, retain logs and records for that purpose, and suspend
        access while we do.
      </p>

      <h2 id="fair-play">14. FAIR PLAY AND ANTI-CHEATING</h2>
      <InShort>
        No engines and no outside help in anything we assess. We investigate, and our ruling stands
        for our own events and certificates.
      </InShort>
      <p>
        Students must not use a chess engine, an opening book, a database, another person&rsquo;s
        advice, or any other external aid during an assessment, a rated or internal game, a tournament
        we run, or homework, unless we expressly allow it for that exercise. Analysis tools we provide
        on the Platform are for study and review outside those situations.
      </p>
      <p>
        Where a fair-play concern arises we may review game records, move times, session and device
        data and platform logs, ask the student to play a supervised game, and consider the records of
        any linked chess platform. We may void a result, withdraw a certificate, rating or prize,
        remove a student from an event, or suspend or terminate an enrolment. For our own programmes,
        events and awards, our determination is final.
      </p>
      <p>
        Fair play cuts both ways: if you believe a student has been wrongly accused, write to us under
        section <a href="#grievance">27</a> and a person who was not involved in the original decision
        will review it.
      </p>

      <h2 id="third-party">15. THIRD-PARTY SERVICES</h2>
      <p>
        The Platform works alongside services we do not control, including Google Meet for classes,
        Razorpay for payments, Meta&rsquo;s WhatsApp Business Platform for messaging, and Lichess and
        Chess.com where you choose to link an account so that games and ratings can be shown.
      </p>
      <p>
        Those services are governed by their own terms and privacy policies. We are not responsible
        for their availability, their content, their rating calculations, fees they charge you, or any
        action they take against an account, including a fair-play sanction. You are responsible for
        complying with their rules. Linking an external chess account is optional, and you can unlink
        it at any time from your dashboard.
      </p>

      <h2 id="ip">16. COURSE MATERIAL AND INTELLECTUAL PROPERTY</h2>
      <p>
        The Platform and everything we provide through it — the curriculum, worksheets, puzzle sets,
        annotated games and PGN files, recorded lessons, assessment formats and reports, and our name,
        logo and branding — belong to us or to our licensors and are protected by copyright and other
        laws.
      </p>
      <p>
        While an enrolment is active we grant you a limited, personal, non-exclusive,
        non-transferable, revocable licence to use that material for the enrolled student&rsquo;s own
        learning, including printing or saving a copy for that purpose. You may not copy it more
        widely, publish it, sell it, upload it to any other service, or use it to teach anyone else,
        whether or not you charge for doing so. The licence ends when the enrolment ends.
      </p>
      <p>
        Chess positions, openings and games are not themselves owned by anyone. Our selection,
        arrangement, annotation and presentation of them is.
      </p>

      <h2 id="student-work">17. STUDENT WORK, GAMES AND FEEDBACK</h2>
      <p>
        A student keeps ownership of the games they play and the work they submit. By submitting them
        through the Platform you grant us a licence to store them, analyse them, show them to the
        student&rsquo;s coaches and to you, and use them to give feedback and to run and improve our
        coaching.
      </p>
      <p>
        We may use anonymised games and positions as teaching examples with other students. We will
        not identify a student by name in such material without your consent under section{" "}
        <a href="#publicity">19</a>.
      </p>
      <p>
        If you send us a suggestion about the Platform or our courses, we may use it without
        restriction and without owing you anything for it.
      </p>

      <h2 id="tournaments">18. TOURNAMENTS, ASSESSMENTS AND CERTIFICATES</h2>
      <p>
        We may run internal tournaments, assessments and events, and may enter students for external
        tournaments. Internal ratings, levels and certificates we award are our own: they record
        progress within our programme, are not ratings or titles of FIDE, the All India Chess
        Federation or any other federation, and carry no standing outside the Academy.
      </p>
      <p>
        Entry fees for external tournaments, travel, and any federation registration are payable by
        you unless we agree otherwise in writing. Selection for a team, a squad or a representative
        event is at our discretion and on chess merit.
      </p>
      <p>
        We may withdraw a certificate, rating or prize awarded on the basis of a result later found to
        have been obtained in breach of section <a href="#fair-play">14</a>.
      </p>

      <h2 id="publicity">19. PHOTOGRAPHS, RESULTS AND PUBLICITY</h2>
      <InShort>
        We ask for your consent before using a student&rsquo;s photograph or name publicly, and you
        can withdraw it at any time.
      </InShort>
      <p>
        We would like to celebrate our students&rsquo; achievements. We will use a student&rsquo;s
        photograph, first name, tournament result or rating achievement in our website content, social
        media and marketing <strong>only with your prior consent</strong>, which we ask for at
        enrolment and which you may give or refuse without it affecting the coaching in any way.
      </p>
      <p>
        You may withdraw that consent at any time by writing to{" "}
        <a href={MAIL}>{ACADEMY_DEFAULTS.email}</a>. We will stop using the material and remove it
        from the channels we control within a reasonable period. Material already printed, or already
        shared onward by others, may not be fully recoverable.
      </p>
      <p>
        We do not publish a student&rsquo;s full name, school, address or contact details, and we do
        not use images of students in paid advertising targeted at children.
      </p>

      <h2 id="offline">20. CLASSES AT OUR CENTRES</h2>
      <p>
        Where a student attends in person at one of our Kolkata centres, you are responsible for
        bringing them to the centre and collecting them on time. We supervise a student during the
        session only, and not before or after it. Please tell us in writing about any medical
        condition, allergy or specific need relevant to the student&rsquo;s safety, and keep an
        emergency contact number current on the account.
      </p>
      <p>
        You must follow the centre&rsquo;s rules and any safety instruction given by our staff. If we
        cannot reach you in an emergency we may seek medical assistance for a student, and you agree
        to meet the reasonable cost of doing so. Personal belongings are brought to a centre at your
        own risk.
      </p>

      <h2 id="service-changes">21. COACH SUBSTITUTION AND CHANGES TO THE SERVICE</h2>
      <p>
        Coaching is provided by the Academy, not by any individual coach. We may change the coach
        assigned to a batch, or send a substitute for a session, and will tell you where practicable.
        No enrolment is a contract for the services of a particular coach, and a change of coach is
        not a ground for a refund.
      </p>
      <p>
        We may change, add to or discontinue features of the Platform, and may change a batch&rsquo;s
        timetable, format or level structure. Where a change materially reduces what you have paid
        for, we will tell you in advance and you may withdraw under section <a href="#refunds">10</a>.
      </p>
      <p>
        We do not promise that the Platform will be available without interruption. We may suspend it
        for maintenance, and will try to do so outside class hours.
      </p>

      <h2 id="termination">22. SUSPENSION AND TERMINATION</h2>
      <p>We may suspend or terminate an account or an enrolment, with notice where practicable, if:</p>
      <ul>
        <li>fees remain unpaid after the grace period in section <a href="#fees">8</a>;</li>
        <li>
          these Terms are materially breached, including the account-sharing, acceptable-use and
          fair-play provisions;
        </li>
        <li>
          a student, parent or guardian behaves abusively towards our coaches, staff or other
          students, whether in class, on WhatsApp or elsewhere; or
        </li>
        <li>we are required to do so by law.</li>
      </ul>
      <p>
        Where we terminate for a breach you have caused, fees paid are not refundable and credits are
        forfeited. Where we terminate for any other reason, we will refund fees for classes not yet
        delivered and for unexpired credits, under the <a href="/refund-policy">Refund Policy</a>.
      </p>
      <p>
        On termination your licence to our material ends and access to the Platform stops. We keep
        your records for the periods set out in our <a href="/privacy">Privacy Policy</a> — including
        attendance, invoices and assessments, which remain part of the student&rsquo;s history.
      </p>

      <h2 id="disclaimers">23. DISCLAIMERS AND NO GUARANTEE OF RESULTS</h2>
      <InShort>
        We teach well and we work hard at it. We cannot promise a particular rating, result or
        selection.
      </InShort>
      <p>
        Chess improvement depends on the student&rsquo;s practice, attendance, effort and aptitude.{" "}
        <strong>
          We do not guarantee any particular rating gain, tournament result, selection, certification
          or level of improvement
        </strong>
        , and nothing said by a coach, in a demo class, in an assessment report, in a testimonial or
        in our marketing is a guarantee of a result. Other students&rsquo; achievements are
        illustrations, not forecasts.
      </p>
      <p>
        Except as these Terms expressly state, and to the extent the law allows, the Platform and our
        services are provided on an &ldquo;as is&rdquo; and &ldquo;as available&rdquo; basis, and we
        exclude implied warranties of merchantability, fitness for a particular purpose and
        non-infringement. Nothing in this section affects rights you have as a consumer under the
        Consumer Protection Act, 2019 that cannot be excluded.
      </p>

      <h2 id="liability">24. LIMITATION OF LIABILITY</h2>
      <p>
        To the extent permitted by law, we are not liable for indirect, incidental, special or
        consequential loss, or for loss of opportunity, a missed tournament entry, or loss of data,
        arising out of or relating to your use of the Platform or our services.
      </p>
      <p>
        Our total aggregate liability for all claims arising in any twelve-month period is limited to
        the total fees you actually paid us for the affected student in the twelve months immediately
        before the event giving rise to the claim.
      </p>
      <p>
        <strong>Nothing in these Terms limits or excludes our liability</strong> for death or personal
        injury caused by our negligence, for fraud or fraudulent misrepresentation, for our obligation
        to make a refund due under the <a href="/refund-policy">Refund Policy</a>, or for any other
        liability that cannot lawfully be limited.
      </p>

      <h2 id="indemnity">25. INDEMNITY</h2>
      <p>
        You agree to indemnify us against claims, losses and reasonable costs arising from your breach
        of these Terms, from your or the student&rsquo;s unlawful use of the Platform, or from
        material you upload that infringes a third party&rsquo;s rights. This does not apply to the
        extent a claim arises from our own breach or negligence.
      </p>

      <h2 id="law">26. GOVERNING LAW AND DISPUTE RESOLUTION</h2>
      <p>
        These Terms are governed by the laws of India. Subject to the paragraphs below, the courts at
        Kolkata, West Bengal have exclusive jurisdiction over any dispute arising out of or in
        connection with them.
      </p>
      <p>
        Before starting proceedings, please write to us at{" "}
        <a href={MAIL}>{ACADEMY_DEFAULTS.email}</a> setting out the problem, and give us{" "}
        {POLICY.grievanceResponseDays} days to resolve it. Most disputes are settled this way. This
        step is a request, not a bar to bringing a claim.
      </p>
      <p>
        Nothing in this section takes away your right, as a consumer, to approach the appropriate
        Consumer Disputes Redressal Commission under the Consumer Protection Act, 2019. If you are
        outside India, nothing here removes a right you have under your local consumer law to bring
        proceedings where you live.
      </p>

      <h2 id="grievance">27. GRIEVANCE REDRESSAL</h2>
      <p>
        In accordance with the Information Technology Act, 2000 and the rules made under it,
        complaints about the Platform or about content on it may be sent to our Grievance Officer:
      </p>
      <ul>
        <li>
          <strong>Grievance Officer:</strong> {ACADEMY_DEFAULTS.authorizedSignatory}
        </li>
        <li>
          <strong>{ACADEMY_DEFAULTS.legalName}</strong>, {ADDRESS}
        </li>
        <li>
          <strong>Email:</strong> <a href={MAIL}>{ACADEMY_DEFAULTS.email}</a>
        </li>
        <li>
          <strong>Phone:</strong> <a href={TEL}>{ACADEMY_DEFAULTS.phone}</a>
        </li>
      </ul>
      <p>
        We will acknowledge a complaint within 24 hours and aim to resolve it within{" "}
        {POLICY.grievanceResponseDays} days of receipt.
      </p>

      <h2 id="updates">28. CHANGES TO THESE TERMS</h2>
      <p>
        We may update these Terms. The version published on this page, with the &ldquo;last
        updated&rdquo; date above, is the one that applies. Where a change materially affects your
        rights or the fees you pay, we will tell you by email, WhatsApp or a notice in the Platform
        before it takes effect. Continuing to use the Platform, or keeping an enrolment active, after
        that means you accept the updated Terms.
      </p>

      <h2 id="general">29. GENERAL</h2>
      <ul>
        <li>
          <strong>Entire agreement.</strong> These Terms, the Privacy Policy, the Refund Policy and
          your enrolment confirmation are the whole agreement between us about the services.
        </li>
        <li>
          <strong>Severability.</strong> If any provision is held unenforceable, the rest continues in
          force.
        </li>
        <li>
          <strong>No waiver.</strong> If we do not enforce a provision on one occasion, we do not give
          up the right to enforce it later.
        </li>
        <li>
          <strong>Assignment.</strong> You may not transfer an enrolment to another person without our
          written consent. We may assign these Terms as part of a reorganisation or a transfer of our
          business.
        </li>
        <li>
          <strong>Force majeure.</strong> We are not liable for a failure to deliver classes caused by
          events beyond our reasonable control, including internet or power failure, the failure of a
          third-party meeting or payment service, epidemic, natural disaster, civil disturbance or
          government action. We will reschedule affected sessions where we reasonably can.
        </li>
        <li>
          <strong>Language.</strong> These Terms are written in English, and the English text
          prevails.
        </li>
      </ul>

      <h2 id="contact">30. HOW TO CONTACT US</h2>
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
