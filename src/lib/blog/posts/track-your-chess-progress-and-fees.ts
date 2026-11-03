import type { BlogPost } from "@/lib/blog/types";
import { screenshotsFor } from "@/lib/blog/screenshots";

const SLUG = "track-your-chess-progress-and-fees";
const { computer, phone } = screenshotsFor(SLUG);

const post: BlogPost = {
  slug: SLUG,
  title: "Progress Reports, Credits and Invoices: A Guide | Envision",
  h1: "Chess Progress Reports and Fees: Reports, Credits, Invoices and Your Account",
  description:
    "Where Envision families find chess progress reports and fees: monthly reports, chess profile, class credits, invoices and payments, and account settings.",
  keyword: "chess progress reports and fees",
  keywords: [
    "chess progress reports and fees",
    "monthly chess progress report",
    "chess class credits",
    "chess class invoices",
    "student portal account settings",
  ],
  category: "for-parents",
  excerpt:
    "Monthly progress reports, the chess profile, class credits, invoices and account settings all live in the student portal. Here is where to find each one, on a computer and on a phone.",
  publishedAt: "2026-11-04",
  updatedAt: "2026-11-04",
  relatedCourses: ["beginner-chess-course", "intermediate-chess-course"],
  relatedPosts: ["how-to-book-a-parent-teacher-meeting", "how-to-join-an-online-chess-class", "how-to-balance-chess-and-studies"],
  priority: 34,
  body: [
    {
      type: "p",
      text: "Everything a family needs to follow a child's chess - and the fees - is in the Envision student portal. **Monthly progress reports** are under **Academy → Monthly Feedback**. Class credits and payments are under **Billing → Credits & Payments**, and every invoice, with a PDF and a Pay button, is under **Billing → My Invoices**. Your profile and password are in **Settings → Account Settings**. This guide shows each one on a computer and on a phone.",
    },
    { type: "h2", id: "monthly-reports", text: "Monthly progress reports" },
    {
      type: "p",
      text: "Every month, your child's coach writes a **progress report**. After the academy checks it, it appears on the **Monthly Feedback** page and is emailed to the family. Each report shows:",
    },
    {
      type: "ul",
      items: [
        "**Classes attended** out of those scheduled, and the **topics covered**.",
        "**Skills this month**: each skill for the level (piece moves and rules, basic checkmates, board vision, opening principles, effort and focus) rated on one five-step scale: Needs support, Getting there, Good, Very good, Excellent.",
        "**Highlights**: what went well.",
        "**Next month**: the two or three things to work on.",
        "**A note from the coach**, written for parents.",
      ],
    },
    {
      type: "p",
      text: "Use **All months** to look back at earlier reports. The \"Next month\" points make a good home-practice plan, and a good list of questions if you book a [parent-teacher meeting](/blog/how-to-book-a-parent-teacher-meeting).",
    },
    {
      type: "screenshots",
      images: [
        computer("pg-d-report", "A monthly progress report: attendance, skills, highlights and next steps.", "October 2026 monthly progress report for Aarav Sen with 7 of 8 classes attended, five skill ratings from Good to Excellent, topics covered, highlights and next-month goals"),
        phone("pg-m-report", "The report on a phone.", "Monthly progress report on a phone with classes attended, topics covered and the skill bars"),
      ],
    },
    { type: "h2", id: "chess-profile", text: "Chess profile: link Lichess and Chess.com" },
    {
      type: "p",
      text: "Many students also play online at home. Under **Chess Tools → My Chess Profile** you can connect a **Lichess** username or a **Chess.com** account. The portal then collects the public games from that account and builds a performance dashboard, so you and the coach can follow progress outside class too.",
    },
    {
      type: "screenshots",
      images: [
        computer("pg-d-chess-profile", "My Chess Profile: connect Lichess or Chess.com.", "Track Your Chess Progress page with boxes to enter a Lichess username and a Chess.com username and Connect buttons"),
      ],
    },
    { type: "h2", id: "credits", text: "Class credits and payments" },
    {
      type: "p",
      text: "On a credit plan, each payment adds a number of **class credits**, and each class marked Present or Late uses one. **Billing → Credits & Payments** shows:",
    },
    {
      type: "ul",
      items: [
        "**Credit balance**: classes left, and how many have been used.",
        "**Unpaid invoices** and the next payment amount; **paid invoices** for your records.",
        "**Credit usage history**: every class deduction and every credit added, with the balance after each one.",
        "**Invoices and payment history** with a PDF for each.",
      ],
    },
    {
      type: "p",
      text: "When credits run low, the portal and the academy remind you to recharge before the next class. If a class you attended is missing from the history, or one you missed has been deducted, check the [attendance page](/blog/how-to-join-an-online-chess-class#attendance) and contact the academy.",
    },
    {
      type: "screenshots",
      images: [
        computer("pg-d-credits", "Credits & Payments: balance, unpaid and paid invoices, and recent credit use.", "Credits and Payments page with a credit balance of 10, one unpaid invoice of 4,000 rupees, two paid invoices, recent class credits used and the invoice history"),
        computer("pg-d-credit-history", "The full credit history: every credit added and used.", "Credit Usage History with current balance 10, 16 credits added, 6 deducted, and a table of dated class deductions and recharges with the balance after each"),
        phone("pg-m-credits", "Credits & Payments on a phone.", "Credits and Payments on a phone with credit balance, monthly plan, unpaid and paid invoice tiles"),
      ],
    },
    { type: "h2", id: "invoices", text: "Invoices: download, print and pay" },
    {
      type: "p",
      text: "**Billing → My Invoices** lists every invoice with its number, status (unpaid, paid or overdue), whether it is a **GST invoice**, the issue and due dates and the total. Use the icons to **view**, **download** or **print** the PDF. An unpaid invoice has a **Pay** button for paying online; a payment shows in the portal as soon as it is confirmed. The filters at the top show only due, upcoming, paid or cancelled invoices.",
    },
    {
      type: "screenshots",
      images: [
        computer("pg-d-invoices", "My Invoices: status, GST, due date, PDF and Pay.", "Fee Invoices list with one unpaid and two paid GST invoices of 4,000 rupees each, view, download and print icons and a Pay button on the unpaid one"),
        phone("pg-m-invoices", "Invoices on a phone.", "Invoices on a phone with total value, due and paid counts and the status filter"),
      ],
    },
    { type: "h3", id: "paying", text: "Paying an invoice online" },
    {
      type: "ol",
      items: [
        "Open **Billing → My Invoices** and find the invoice marked **unpaid**.",
        "Check the plan, the amount and the due date. GST invoices show the tax included.",
        "Press **Pay** and complete the payment in the secure payment window.",
        "When the payment is confirmed, the invoice changes to **paid** and, on a credit plan, the new credits are added to your balance.",
        "Download the PDF for your records using the download icon.",
      ],
    },
    {
      type: "p",
      text: "If you paid another way, such as a bank transfer, the academy records the payment against the invoice and it shows as paid once it has been matched.",
    },
    { type: "h2", id: "account", text: "Account settings and notifications" },
    {
      type: "p",
      text: "**Settings → Account Settings** shows your account details - name, user ID, email, phone, level and parent's name. These are **locked** and kept up to date by the academy; ask the academy if anything is wrong. You can **upload a profile photo** (JPG, PNG or WEBP, up to 500 KB), fill in a personal profile, **change your password** or have a reset link emailed to you.",
    },
    {
      type: "p",
      text: "The **bell** at the bottom of the menu collects notifications: new homework, reports, tournaments, PTM updates and payment reminders. Click one to go straight to the right page.",
    },
    {
      type: "screenshots",
      images: [
        computer("pg-d-profile", "Account Settings: locked details, photo and personal profile.", "Profile and security page with the student's locked account details, an Upload photo button and the personal profile section"),
        phone("pg-m-profile", "Account Settings on a phone.", "Profile and security on a phone with the profile photo, Upload photo and Account details"),
      ],
    },
    { type: "h2", id: "routine", text: "A five-minute monthly check for parents" },
    {
      type: "ol",
      items: [
        "Read the **monthly report** and agree one goal with your child.",
        "Check **attendance** and **credits** match the classes attended.",
        "Pay any **unpaid invoice** before its due date.",
        "Look at the **leaderboard** and **homework** results together.",
        "If something needs a longer talk, book a **PTM**.",
      ],
    },
    {
      type: "p",
      text: "Chess progress is steady rather than sudden, especially around school exams; our guide to [balancing chess and studies](/blog/how-to-balance-chess-and-studies) has a practical plan. Each course level, from the [beginner chess course](/beginner-chess-course) onwards, ends with a level exam and certificate.",
    },
    {
      type: "cta",
      heading: "See the portal for yourself",
      text: "Book a free demo class. You get a live lesson with a coach and a look at the student portal.",
      href: "/register",
      label: "Book a free demo class",
    },
  ],
  faqs: [
    { q: "When do monthly progress reports arrive?", a: "Coaches write reports at the end of each month. After the academy checks them, they appear on the Monthly Feedback page and are emailed to the family early in the next month." },
    { q: "How are class credits used?", a: "Each class marked Present or Late uses one credit. An absent class does not. The Credits & Payments page shows every deduction with the balance after it." },
    { q: "Where can I download an invoice?", a: "Open Billing → My Invoices and use the download or print icon on the invoice. GST invoices are labelled as such." },
    { q: "What happens when class credits run out?", a: "The portal and the academy remind you when the balance is low. Paying the recharge invoice adds the new credits so classes carry on without a gap." },
    { q: "Can I change my child's name or phone number in the portal?", a: "No, account details are locked and kept by the academy. Contact the academy to correct them. You can change the photo, personal profile and password yourself." },
  ],
};

export default post;
