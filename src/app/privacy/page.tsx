import type { Metadata } from "next";
import LegalPage, { InShort, TableOfContents } from "@/components/marketing/LegalPage";
import { ACADEMY_DEFAULTS } from "@/lib/branding";
import { MARKETING_BASE_URL } from "@/lib/publicLinks";

export const metadata: Metadata = {
  title: "Privacy Policy | Envision Chess Academy",
  description:
    "How Envisions Chess Academy LLP collects, uses, shares and protects personal information, including children's data, WhatsApp messages and class recordings.",
  alternates: { canonical: `${MARKETING_BASE_URL}/privacy` },
};

/** Termly-hosted request form, kept as an alternative to emailing us. */
const DSAR_URL = "https://app.termly.io/dsar/270b1c13-cb44-4143-ac67-11e4135d17e4";

/**
 * Retention windows. They are stated here because nothing in the code enforces
 * them yet - when a deletion job is written, it should read these numbers rather
 * than invent its own, so the policy and the behaviour cannot drift apart.
 */
const RETENTION = {
  inactiveAccountYears: 3,
  financialRecordYears: 8,
  recordingMonths: 6,
  analyticsMonths: 26,
  whatsappMonths: 24,
  grievanceResponseDays: 15,
};

const SECTIONS: [id: string, label: string][] = [
  ["scope", "WHO WE ARE AND WHAT THIS COVERS"],
  ["collect", "WHAT INFORMATION WE COLLECT"],
  ["children", "CHILDREN'S INFORMATION"],
  ["use", "HOW WE USE YOUR INFORMATION"],
  ["legal-bases", "OUR LEGAL BASIS FOR USING IT"],
  ["messaging", "WHATSAPP, SMS AND EMAIL"],
  ["recordings", "CLASS RECORDINGS"],
  ["photos", "PHOTOGRAPHS AND PUBLICITY"],
  ["cookies", "COOKIES AND YOUR CHOICES"],
  ["analytics", "HOW WE MEASURE OUR WEBSITE"],
  ["advertising", "ADVERTISING AND THE META PIXEL"],
  ["share", "WHO WE SHARE INFORMATION WITH"],
  ["transfers", "WHERE YOUR INFORMATION IS PROCESSED"],
  ["retention", "HOW LONG WE KEEP IT"],
  ["security", "HOW WE PROTECT IT"],
  ["rights", "YOUR RIGHTS"],
  ["exercise", "HOW TO EXERCISE YOUR RIGHTS"],
  ["grievance", "GRIEVANCE OFFICER"],
  ["links", "OTHER SITES AND SERVICES"],
  ["updates", "CHANGES TO THIS POLICY"],
  ["contact", "HOW TO CONTACT US"],
];

const MAIL = `mailto:${ACADEMY_DEFAULTS.email}`;
const TEL = `tel:${ACADEMY_DEFAULTS.phone}`;
const ADDRESS = "20, Dr Jagabandhu Lane, Kolkata 700 012, West Bengal, India";

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" lastUpdated="16 September 2026">
      <p>
        This policy explains what <strong>{ACADEMY_DEFAULTS.legalName}</strong>, trading as{" "}
        {ACADEMY_DEFAULTS.academyName} (<strong>&ldquo;we&rdquo;</strong>,{" "}
        <strong>&ldquo;us&rdquo;</strong>, <strong>&ldquo;our&rdquo;</strong>), does with personal
        information when you use our website, book a demo class, enrol a student, or sign in to our
        learning platform.
      </p>
      <p>
        Most of our students are children, so this policy says plainly what we collect about them,
        what we do not, and what a parent can ask us to change or delete. It should be read with our{" "}
        <a href="/terms">Terms and Conditions</a> and <a href="/refund-policy">Refund Policy</a>.
      </p>

      <h2>Table of contents</h2>
      <TableOfContents items={SECTIONS} />

      <h2 id="scope">1. WHO WE ARE AND WHAT THIS COVERS</h2>
      <p>
        We are a limited liability partnership registered in India at {ADDRESS}, GSTIN{" "}
        {ACADEMY_DEFAULTS.gstNumber}. We are the data fiduciary for the information described here,
        which means we decide why and how it is used and we are answerable for it.
      </p>
      <p>
        This policy covers <a href={MARKETING_BASE_URL}>{ACADEMY_DEFAULTS.website}</a>, the student,
        parent and coach dashboards, our chess training tools, our WhatsApp messaging, and information
        we hold about students who attend classes at our Kolkata centres.
      </p>

      <h2 id="collect">2. WHAT INFORMATION WE COLLECT</h2>
      <InShort>
        Contact details, coaching records, and anonymous website measurement. We do not collect
        payment card details, home addresses, dates of birth or school names.
      </InShort>

      <h3>Information you give us</h3>
      <ul>
        <li>
          <strong>Account details:</strong> the student&rsquo;s name and username, email address and
          mobile number, the parent or guardian&rsquo;s name and email address, city and country, and
          gender where you choose to give it.
        </li>
        <li>
          <strong>Chess details:</strong> the student&rsquo;s playing level, FIDE ID and rating where
          you give them, and a Lichess or Chess.com username if you choose to link one.
        </li>
        <li>
          <strong>Sign-in credentials:</strong> a password, which we store only as a one-way hash and
          never in a readable form.
        </li>
        <li>
          <strong>Enquiries and bookings:</strong> what you tell us when you book a demo class, ask a
          question, or write to our team.
        </li>
      </ul>

      <h3>Information created as the coaching runs</h3>
      <ul>
        <li>attendance records, batch and coach assignments, and pause or withdrawal history;</li>
        <li>homework submissions, games played on the platform, and analysis of them;</li>
        <li>assessment reports, internal levels and ratings, and coach notes about progress;</li>
        <li>tournament entries and results;</li>
        <li>
          invoices, fee plans, credit balances and payment status — but <strong>not</strong> your
          card, UPI or bank details, which go directly to Razorpay and never reach us.
        </li>
      </ul>

      <h3>Information collected automatically</h3>
      <ul>
        <li>
          <strong>Security records:</strong> failed sign-in attempts and account lockouts, and
          password-reset requests, so that accounts can be protected.
        </li>
        <li>
          <strong>Website measurement:</strong> anonymous usage data described in section{" "}
          <a href="#analytics">10</a>.
        </li>
      </ul>

      <h3>What we do not collect</h3>
      <p>
        We do not ask for a student&rsquo;s date of birth, home address, school name, identity
        document or biometric information, and our systems have no field to store them. We do not
        collect payment card or bank account numbers. Please do not send us any of these.
      </p>

      <h2 id="children">3. CHILDREN&rsquo;S INFORMATION</h2>
      <InShort>
        A parent or guardian opens the account and gives consent. A parent can see, correct or delete
        everything we hold about their child.
      </InShort>
      <p>
        Our service is aimed at children learning chess, and we collect their information knowingly
        and with their parent&rsquo;s involvement. An account for a student under 18 must be created
        and operated by a parent or legal guardian, who gives consent on the child&rsquo;s behalf. We
        treat the registration of an account by a parent, with their own name and email address
        recorded alongside the student&rsquo;s, as that consent.
      </p>
      <p>We keep children&rsquo;s information to what coaching actually needs:</p>
      <ul>
        <li>we do not ask children for information directly outside the lesson context;</li>
        <li>
          we do not publish a student&rsquo;s full name, school, address or contact details anywhere;
        </li>
        <li>
          we do not use children&rsquo;s images or details in paid advertising targeted at children;
          and
        </li>
        <li>
          we do not sell children&rsquo;s information, and we do not share it with anyone except the
          service providers listed in section <a href="#share">12</a>.
        </li>
      </ul>
      <p>
        A parent or guardian may at any time ask to see everything we hold about their child, have it
        corrected, withdraw a consent, or have the account and its data deleted, by writing to{" "}
        <a href={MAIL}>{ACADEMY_DEFAULTS.email}</a>. We act on such requests as described in section{" "}
        <a href="#exercise">17</a>.
      </p>
      <p>
        If you believe a child&rsquo;s information has reached us without a parent&rsquo;s consent,
        tell us and we will delete it.
      </p>

      <h2 id="use">4. HOW WE USE YOUR INFORMATION</h2>
      <p>We use personal information to:</p>
      <ul>
        <li>create and run accounts, and place a student in the right batch;</li>
        <li>deliver classes, issue joining links, and record attendance;</li>
        <li>set homework, review games and write assessment and progress reports;</li>
        <li>run internal tournaments and enter students for external ones;</li>
        <li>raise invoices, take payments through Razorpay, and chase overdue fees;</li>
        <li>send the service messages described in section <a href="#messaging">6</a>;</li>
        <li>answer questions, handle complaints and resolve disputes;</li>
        <li>
          keep accounts secure — detecting unusual sign-ins, investigating account sharing, and
          looking into fair-play concerns;
        </li>
        <li>understand how our website is used, so that it can be improved; and</li>
        <li>meet our legal, tax and accounting obligations.</li>
      </ul>
      <p>
        <strong>We do not sell personal information</strong>, and we do not share it with anyone for
        their own marketing.
      </p>
      <p>
        We do not make decisions about a student purely by automated means. Assessments, level
        placement and fair-play rulings are made by coaches and staff, with the platform only
        assembling the information they look at.
      </p>

      <h2 id="legal-bases">5. OUR LEGAL BASIS FOR USING IT</h2>
      <p>Under the Digital Personal Data Protection Act, 2023 we rely on:</p>
      <ul>
        <li>
          <strong>Your consent</strong>, given when a parent or adult student registers an account,
          for processing the student&rsquo;s information in order to provide coaching. Separate
          consent is asked for publicity use of photographs and for marketing cookies, and each can be
          withdrawn on its own.
        </li>
        <li>
          <strong>Performance of our agreement with you</strong>, for delivering the classes you have
          paid for, issuing invoices and taking payment.
        </li>
        <li>
          <strong>Compliance with law</strong>, for tax and accounting records, and for responding to
          lawful requests.
        </li>
      </ul>
      <p>
        Where you withdraw a consent, we stop the processing that relied on it. That does not undo
        processing already carried out, and it may mean we can no longer deliver the coaching — see
        section <a href="#rights">16</a>.
      </p>

      <h2 id="messaging">6. WHATSAPP, SMS AND EMAIL</h2>
      <InShort>
        We message you on WhatsApp about classes, fees and your account. Those messages are part of
        the service. Marketing messages are separate and you can stop them.
      </InShort>
      <p>
        We send messages to the mobile number and email address on your account, through
        Meta&rsquo;s WhatsApp Business Platform, SMS, email and notifications inside the platform.
        Service messages include class reminders and joining links, attendance updates, schedule and
        coach changes, fee and invoice reminders, payment confirmations, demo and booking
        confirmations, assessment reports, and password-reset and account-security messages.
      </p>
      <p>
        <strong>What Meta sees.</strong> To deliver a WhatsApp message we pass your mobile number and
        the content of that message to Meta, which handles it under its own terms. We do not give
        Meta your other account details for messaging purposes.
      </p>
      <p>
        <strong>What we keep.</strong> Messages you exchange with us on WhatsApp — in both directions,
        including images or files you send — are stored against your record so that our team can see
        the history of a conversation and answer you properly. They are kept for{" "}
        {RETENTION.whatsappMonths} months.
      </p>
      <p>
        <strong>Your choices.</strong> You cannot switch off service messages while an enrolment is
        active, because they are how the coaching is delivered. You can stop promotional messages at
        any time by replying STOP on WhatsApp or writing to{" "}
        <a href={MAIL}>{ACADEMY_DEFAULTS.email}</a>, without affecting your classes.
      </p>
      <p>
        Tell us straight away if your mobile number changes or is reassigned. Until you do, messages
        including class links and security codes will keep going to that number.
      </p>

      <h2 id="recordings">7. CLASS RECORDINGS</h2>
      <p>
        Online classes are held over Google Meet or a similar service. We may record a session for
        coaching quality, coach training, safeguarding and resolving disputes. A recording may capture
        a student&rsquo;s image, voice, name and whatever is visible behind them.
      </p>
      <p>
        Recordings are accessible only to the coaches and staff who need them for those purposes. They
        are not published, not shared with other parents, and not used for marketing. We keep them for{" "}
        {RETENTION.recordingMonths} months and then delete them, unless one is needed for an ongoing
        complaint or investigation.
      </p>
      <p>
        If you would prefer a particular session not to be recorded, tell us before it starts. You can
        also ask a student to keep their camera off, though coaches usually find it easier to teach
        when they can see the board and the student.
      </p>

      <h2 id="photos">8. PHOTOGRAPHS AND PUBLICITY</h2>
      <p>
        We use a student&rsquo;s photograph, first name, tournament result or rating achievement in
        our website content, social media and marketing <strong>only with your consent</strong>, which
        we ask for separately from the account registration itself. Refusing has no effect on the
        coaching.
      </p>
      <p>
        You can withdraw that consent at any time by writing to{" "}
        <a href={MAIL}>{ACADEMY_DEFAULTS.email}</a>. We will stop using the material and remove it
        from the channels we control within a reasonable period. Material already printed, or already
        shared onward by other people, may not be fully recoverable.
      </p>

      <h2 id="cookies">9. COOKIES AND YOUR CHOICES</h2>
      <p>
        When you first visit our site we ask which cookies you are willing to accept. Your choice is
        stored for a year, and you can change it at any time from the cookie settings link in the site
        footer. There are three groups:
      </p>
      <table>
        <thead>
          <tr>
            <th>Group</th>
            <th>What it does</th>
            <th>Can you refuse?</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <strong>Strictly necessary</strong>
            </td>
            <td>
              Keeps you signed in to the portal, keeps the session secure, and remembers this cookie
              choice.
            </td>
            <td>No — the site cannot work without them.</td>
          </tr>
          <tr>
            <td>
              <strong>Analytics</strong>
            </td>
            <td>
              Counts page and feature usage so we can see which pages work and where people get stuck.
              Measurement only, never used to target advertising.
            </td>
            <td>Yes.</td>
          </tr>
          <tr>
            <td>
              <strong>Marketing</strong>
            </td>
            <td>
              Measures which adverts lead to demo bookings, and lets us show our courses to people who
              have visited before.
            </td>
            <td>Yes.</td>
          </tr>
        </tbody>
      </table>
      <p>
        Refusing analytics or marketing cookies does not reduce anything you can do on the site or in
        the portal. Until you accept marketing cookies, no advertising script loads at all.
      </p>

      <h2 id="analytics">10. HOW WE MEASURE OUR WEBSITE</h2>
      <InShort>
        Our own measurement, on our own servers. No Google Analytics, no IP addresses, nothing tied to
        your account.
      </InShort>
      <p>
        We do not use Google Analytics or any third-party analytics service. Measurement is done by
        our own code and stored in our own database, and it is deliberately limited. When analytics
        cookies are accepted, we record:
      </p>
      <ul>
        <li>
          the page path — <strong>never the query string</strong>, because query strings can carry
          personal data;
        </li>
        <li>the first page of the visit, and the referring website&rsquo;s domain only;</li>
        <li>campaign tags in the link you arrived through;</li>
        <li>
          a random session identifier and a random returning-visitor identifier, neither of which is
          linked to any account;
        </li>
        <li>whether the device is a phone, tablet or desktop;</li>
        <li>the country, derived at our edge, with no city and no IP address stored;</li>
        <li>how long a page was open, and clicks on contact and call-to-action links.</li>
      </ul>
      <p>
        We do not store your IP address in these records, and we cannot connect them back to a named
        student or parent. We keep them for {RETENTION.analyticsMonths} months.
      </p>

      <h2 id="advertising">11. ADVERTISING AND THE META PIXEL</h2>
      <p>
        We advertise our courses on Facebook and Instagram. When you accept marketing cookies, we load
        the Meta Pixel, which tells Meta that a browser visited a page of our site or completed an
        action such as booking a demo. Until you accept, the pixel does not load.
      </p>
      <p>
        <strong>Conversions API.</strong> We also send Meta a server-side record of the same
        conversions, so that our advertising can be measured when a browser blocks scripts. Where that
        record includes an email address or mobile number, it is{" "}
        <strong>irreversibly hashed before it leaves our servers</strong> — Meta receives a
        one-way SHA-256 value that it can match against its own hashed records, not a readable address
        or number.
      </p>
      <p>
        <strong>Enquiry progress.</strong> When an enquiry moves forward — a demo is booked, attended,
        or turns into an enrolment — we send Meta an event saying that a conversion of that stage
        happened, so that we can tell which adverts bring families who actually enrol. These events
        carry the hashed identifiers described above and the stage reached, not coaching records,
        assessments or fee details.
      </p>
      <p>
        Meta acts as an independent controller of the data it receives and uses it under its own
        policies. You can limit how Meta uses information about you in your Facebook or Instagram ad
        settings, and you can stop us sending it by refusing marketing cookies.
      </p>

      <h2 id="share">12. WHO WE SHARE INFORMATION WITH</h2>
      <p>
        We do not sell personal information. We share it only with the providers we need in order to
        run the academy, each of which acts on our instructions:
      </p>
      <table>
        <thead>
          <tr>
            <th>Provider</th>
            <th>What it is used for</th>
            <th>What it receives</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>MongoDB Atlas</td>
            <td>Our database</td>
            <td>All platform records</td>
          </tr>
          <tr>
            <td>Razorpay</td>
            <td>Collecting fees and issuing refunds</td>
            <td>Name, contact details, invoice amount; card and bank details go to it, not to us</td>
          </tr>
          <tr>
            <td>Meta (WhatsApp Business Platform)</td>
            <td>Service and support messages</td>
            <td>Mobile number and message content</td>
          </tr>
          <tr>
            <td>Meta (advertising)</td>
            <td>Measuring and targeting our adverts</td>
            <td>Browser events, and hashed email or mobile number</td>
          </tr>
          <tr>
            <td>Google</td>
            <td>Running live classes over Meet</td>
            <td>Name shown in the meeting, and audio and video during the class</td>
          </tr>
          <tr>
            <td>Cloudinary</td>
            <td>Storing and serving images</td>
            <td>Images uploaded to the platform</td>
          </tr>
          <tr>
            <td>Email delivery provider</td>
            <td>Sending invoices, reports and account emails</td>
            <td>Email address and message content</td>
          </tr>
          <tr>
            <td>Hosting and network providers</td>
            <td>Running and protecting the site</td>
            <td>Traffic needed to serve pages</td>
          </tr>
        </tbody>
      </table>
      <p>
        We may also share information with our accountants and professional advisers, and where we are
        required to by law, by a court, or to protect the safety of a student. Lichess and Chess.com
        receive nothing from us; linking an account only lets us read what is already public there.
      </p>

      <h2 id="transfers">13. WHERE YOUR INFORMATION IS PROCESSED</h2>
      <p>
        We are based in India and our records are held with providers we choose for that purpose.
        Several of the services listed above — including Meta, Google, Cloudinary and our email
        provider — operate globally, so your information may be stored or processed outside India.
      </p>
      <p>
        Where that happens we rely on the contractual terms those providers offer, and we do not
        transfer personal data to any country that the Government of India has restricted for this
        purpose.
      </p>

      <h2 id="retention">14. HOW LONG WE KEEP IT</h2>
      <table>
        <thead>
          <tr>
            <th>Information</th>
            <th>Kept for</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Account and coaching records of an active student</td>
            <td>As long as the enrolment lasts</td>
          </tr>
          <tr>
            <td>Account and coaching records after withdrawal</td>
            <td>{RETENTION.inactiveAccountYears} years, then deleted or anonymised</td>
          </tr>
          <tr>
            <td>Invoices, payments and tax records</td>
            <td>{RETENTION.financialRecordYears} years, as Indian tax law requires</td>
          </tr>
          <tr>
            <td>Class recordings</td>
            <td>{RETENTION.recordingMonths} months</td>
          </tr>
          <tr>
            <td>WhatsApp conversation history</td>
            <td>{RETENTION.whatsappMonths} months</td>
          </tr>
          <tr>
            <td>Website measurement records</td>
            <td>{RETENTION.analyticsMonths} months</td>
          </tr>
        </tbody>
      </table>
      <p>
        We may keep information for longer where it is needed for an unresolved complaint, a fair-play
        investigation or a legal claim, and only for as long as that lasts.
      </p>
      <p>
        Assessment reports written about a student are kept as part of their coaching history even
        after a demo account or booking is removed, so that a returning student&rsquo;s progress is
        not lost. You can ask us to delete them under section <a href="#rights">16</a>.
      </p>

      <h2 id="security">15. HOW WE PROTECT IT</h2>
      <p>
        Passwords are stored only as one-way hashes. The site is served over encrypted connections.
        Sign-in attempts are rate-limited and accounts lock after repeated failures. Access to student
        records inside the platform is limited by role, so a coach sees the students they teach rather
        than the whole academy, and administrative actions are logged.
      </p>
      <p>
        No system is completely secure, and we cannot guarantee that information will never be
        compromised. If a breach occurs that affects your personal data, we will notify you and the
        Data Protection Board of India as the law requires. Please tell us at once if you think your
        account has been accessed by someone else.
      </p>

      <h2 id="rights">16. YOUR RIGHTS</h2>
      <InShort>
        You can see what we hold, correct it, delete it, withdraw a consent, or complain — and a
        parent can do all of this for their child.
      </InShort>
      <p>Under the Digital Personal Data Protection Act, 2023 you have the right to:</p>
      <ul>
        <li>
          <strong>Access</strong> — a summary of the personal data we hold about you or your child and
          what we do with it;
        </li>
        <li>
          <strong>Correction and completion</strong> — have inaccurate or incomplete information put
          right;
        </li>
        <li>
          <strong>Erasure</strong> — have information deleted where we no longer need it for the
          purpose it was given for, and where no law requires us to keep it;
        </li>
        <li>
          <strong>Withdraw consent</strong> — as easily as you gave it;
        </li>
        <li>
          <strong>Grievance redressal</strong> — a first response from us before you go elsewhere; and
        </li>
        <li>
          <strong>Nominate</strong> — name another person to exercise these rights if you are unable
          to.
        </li>
      </ul>
      <p>
        You can also update most account details yourself from your dashboard, which is usually faster
        than writing to us.
      </p>
      <p>
        Withdrawing consent for the processing needed to deliver coaching means we can no longer
        provide the classes, and the enrolment will end. Withdrawing consent for photographs or
        marketing has no effect on the coaching at all.
      </p>
      <p>
        If you are in a country with additional rights — for example the UK or the European Economic
        Area — we will honour a request made under your local law where it applies to us.
      </p>

      <h2 id="exercise">17. HOW TO EXERCISE YOUR RIGHTS</h2>
      <p>
        Write to <a href={MAIL}>{ACADEMY_DEFAULTS.email}</a> from the email address on the account, or
        use our <a href={DSAR_URL}>online request form</a>. Tell us the student&rsquo;s name and what
        you want us to do.
      </p>
      <p>
        We will acknowledge within 24 hours and respond within {RETENTION.grievanceResponseDays} days.
        We may need to verify who you are before acting, particularly for a deletion request or where
        a request concerns a child, and we may ask you to confirm which student a request relates to
        when one phone number or email address covers several accounts. There is no charge.
      </p>

      <h2 id="grievance">18. GRIEVANCE OFFICER</h2>
      <p>
        If you are unhappy with how we have handled your information or your request, contact our
        Grievance Officer, who is also our contact point for data protection questions:
      </p>
      <ul>
        <li>
          <strong>{ACADEMY_DEFAULTS.authorizedSignatory}</strong>, {ACADEMY_DEFAULTS.legalName}
        </li>
        <li>{ADDRESS}</li>
        <li>
          <strong>Email:</strong> <a href={MAIL}>{ACADEMY_DEFAULTS.email}</a>
        </li>
        <li>
          <strong>Phone:</strong> <a href={TEL}>{ACADEMY_DEFAULTS.phone}</a>
        </li>
      </ul>
      <p>
        We aim to resolve complaints within {RETENTION.grievanceResponseDays} days. If you remain
        dissatisfied, you may complain to the Data Protection Board of India.
      </p>

      <h2 id="links">19. OTHER SITES AND SERVICES</h2>
      <p>
        Our site and platform link to services we do not control, including Lichess, Chess.com, Google
        Meet, Razorpay and our social media pages. This policy does not apply to them. Please read
        their own privacy policies before giving them information, and note that a child using an
        external chess site does so under that site&rsquo;s rules and your supervision.
      </p>

      <h2 id="updates">20. CHANGES TO THIS POLICY</h2>
      <p>
        We may update this policy. The version on this page, with the &ldquo;last updated&rdquo; date
        above, is the one that applies. Where a change materially affects how we use your information,
        we will tell you by email, WhatsApp or a notice in the platform before it takes effect, and
        ask for fresh consent where the law requires it.
      </p>

      <h2 id="contact">21. HOW TO CONTACT US</h2>
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
