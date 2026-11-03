import type { BlogPost } from "@/lib/blog/types";
import { screenshotsFor } from "@/lib/blog/screenshots";

const SLUG = "how-to-book-a-parent-teacher-meeting";
const { computer, phone } = screenshotsFor(SLUG);

const post: BlogPost = {
  slug: SLUG,
  title: "How to Book a Parent-Teacher Meeting (PTM) | Envision",
  h1: "How to Book a Parent-Teacher Meeting with Your Child's Chess Coach",
  description:
    "How to book a parent teacher meeting (PTM) with your child's Envision chess coach: yearly credits, the request form, scheduling, joining on time and feedback.",
  keyword: "how to book a parent teacher meeting",
  keywords: [
    "how to book a parent teacher meeting",
    "chess coach parent teacher meeting",
    "PTM with chess coach",
    "talk to my child's chess coach",
    "PTM credits",
  ],
  category: "for-parents",
  excerpt:
    "Families can request a one-to-one meeting with their child's coach straight from the portal. Here is how PTM credits work, how to request one, and how to join on the day, on a computer and on a phone.",
  publishedAt: "2026-11-04",
  updatedAt: "2026-11-04",
  relatedCourses: ["beginner-chess-course", "intermediate-chess-course"],
  relatedPosts: ["track-your-chess-progress-and-fees", "how-to-choose-a-chess-coach", "how-online-chess-classes-work"],
  priority: 36,
  body: [
    {
      type: "p",
      text: "Every Envision family can book a **parent-teacher meeting (PTM)** with their child's coach from the **PTM** page of the student portal. Each student has **12 PTM credits a year**. You choose the coach, a preferred date and time and what you want to discuss; the academy confirms the final time and sends a Google Meet link. You join from the PTM page, from **10 minutes before** the meeting. This guide shows each step on a computer and on a phone.",
    },
    {
      type: "p",
      text: "A PTM is the right place for questions a monthly report cannot answer: why progress has slowed, whether your child is ready for tournaments, how to balance chess with exams, or which level comes next. For a quick question about one homework, a message on Ask Coach is faster.",
    },
    { type: "h2", id: "credits", text: "How PTM credits work" },
    {
      type: "table",
      caption: "PTM rules",
      head: ["Rule", "Detail"],
      rows: [
        ["Credits", "12 per student each year, from 1 October to 30 September (India time)"],
        ["Requesting", "A request holds one credit while it waits"],
        ["Scheduling", "A scheduled meeting uses the credit, including if nobody joins"],
        ["Returned", "A rejected or cancelled request gives the credit back"],
        ["Gap", "At least 30 days between meetings; the page shows the next date you can book"],
        ["Pending", "Only one request can be waiting at a time"],
      ],
    },
    {
      type: "p",
      text: "Your remaining credits also show on the dashboard as **PTM credits**, so you always know how many are left.",
    },
    {
      type: "screenshots",
      images: [
        computer("ptm-d-empty", "The PTM page: credits for the year and your meetings.", "Parent-teacher meetings page showing PTM credits for 2026-27 with 12 remaining, the rules, empty meeting tabs and a Request a PTM button"),
        phone("ptm-m-empty", "The PTM page on a phone.", "PTM page on a phone with the Request a PTM button, 12 credits remaining and No PTMs here yet"),
      ],
    },
    { type: "h2", id: "request", text: "Step 1: Request a PTM" },
    {
      type: "ol",
      items: [
        "Open **Academy → PTM** in the menu and press **Request a PTM**.",
        "Choose the **coach**. If your child learns with more than one coach, each appears in the list.",
        "Pick a **preferred date and time** (India time). The academy confirms the final slot.",
        "Optionally add **alternative slots**, such as \"weekday evenings after 5 pm\".",
        "Write **what you would like to discuss** (at least 10 characters). A clear topic helps the coach prepare examples from your child's games and homework.",
        "Press **Send request**.",
      ],
    },
    {
      type: "screenshots",
      images: [
        computer("ptm-d-form", "The request form: coach, preferred time, alternatives and topic.", "Request a PTM form with the coach selected, a preferred date and time, alternative slots text and the discussion topic, with Send request and Back buttons"),
      ],
    },
    { type: "h2", id: "after-requesting", text: "Step 2: Wait for confirmation" },
    {
      type: "p",
      text: "The request now shows as **Requested** under the **Requests** tab, with your preferred time and topic, and one credit is held. The page also shows when your next PTM can be after this one. While it is still a request you can **Cancel** it and get the credit back. Next, the coach approves it and the academy schedules it; if the coach cannot take it, it is rejected with a reason and the credit returns.",
    },
    {
      type: "screenshots",
      images: [
        computer("ptm-d-requested", "A request waiting for the coach and the academy.", "PTM page with one request to the coach marked Requested, the preferred time, the topic, 11 credits remaining and a Cancel button"),
        phone("ptm-m-requested", "The request on a phone.", "Phone PTM page showing the requested meeting card with its preferred time and Cancel button"),
      ],
    },
    { type: "h2", id: "scheduled", text: "Step 3: Your meeting is scheduled" },
    {
      type: "p",
      text: "Once it is scheduled, the meeting moves to the **Upcoming** tab with the confirmed date and time (India time), and you receive a notification and an email. If it is moved later, the page and the email show the new time. Add it to your calendar straight away.",
    },
    {
      type: "screenshots",
      images: [
        computer("ptm-d-scheduled", "Scheduled: the confirmed date and time.", "PTM page with the meeting now scheduled, showing the confirmed date and time in India time"),
        phone("ptm-m-scheduled", "The scheduled meeting on a phone.", "Phone PTM page showing the scheduled meeting card with its confirmed date and time"),
      ],
    },
    { type: "h2", id: "join", text: "Step 4: Join the meeting" },
    {
      type: "p",
      text: "On the day, open the PTM page. The **Join** button appears **10 minutes before** the start time and stays available until an hour after the meeting ends. It opens the Google Meet room the academy set up, so you never need to hunt for a link in your inbox. Join from a quiet room, and have your child nearby if you want the coach to speak to them too.",
    },
    {
      type: "p",
      text: "Bring two or three specific questions. Good ones: \"What should we practise at home?\", \"Which mistakes keep repeating in games?\" and \"Is our child ready for the next level or a rated tournament?\". The latest monthly report (see our guide to [progress reports, credits and invoices](/blog/track-your-chess-progress-and-fees)) is a useful starting point.",
    },
    { type: "h3", id: "prepare", text: "How to prepare for the meeting" },
    {
      type: "p",
      text: "The coach prepares using your child's attendance, homework results, exam scores and recent games. You can help the meeting go further by doing three things beforehand: read the latest monthly report, look at the homework results together with your child, and write down the questions that matter most to you. Thirty minutes passes quickly, so start with the most important question.",
    },
    {
      type: "p",
      text: "Afterwards, write down the two or three things the coach suggested and agree them with your child. Most coaches will follow up in class, and the next monthly report usually shows whether the plan is working.",
    },
    { type: "h2", id: "feedback", text: "Step 5: Share your feedback" },
    {
      type: "p",
      text: "After the meeting, the PTM page asks for short feedback: how useful the meeting was, how prepared the coach was and how clear the advice was, plus any comments. It takes a minute and helps the academy keep every coach's meetings useful.",
    },
    { type: "h2", id: "good-ptm", text: "When to book a PTM" },
    {
      type: "ul",
      items: [
        "**After the first month**, to agree goals with the coach.",
        "**Before the end of a level**, to plan for the [level exam](/blog/how-to-take-the-online-chess-level-exam) and the next course.",
        "**Before school exams**, to agree a lighter practice plan.",
        "**When something has changed**: motivation has dipped, results have stalled, or your child wants to start tournaments.",
      ],
    },
    {
      type: "p",
      text: "Choosing the right coach matters as much as meeting them; our guide on [how to choose a chess coach](/blog/how-to-choose-a-chess-coach) covers what to look for.",
    },
    {
      type: "cta",
      heading: "New to Envision?",
      text: "Book a free demo class and meet a coach before you join. Every enrolled family gets 12 PTMs a year.",
      href: "/register",
      label: "Book a free demo class",
    },
  ],
  faqs: [
    { q: "How many PTMs can we book in a year?", a: "Each student has 12 PTM credits per year, from 1 October to 30 September. There must be at least 30 days between meetings." },
    { q: "Do we lose a credit if we cancel?", a: "No. Cancelling a request, or the coach rejecting it, returns the credit. A scheduled meeting uses the credit even if nobody joins." },
    { q: "How do we join the meeting?", a: "Open the PTM page on the day. The Join button appears 10 minutes before the start and opens the Google Meet room." },
    { q: "How long is a PTM?", a: "Most meetings are booked for 30 minutes. The confirmed length is shown on the PTM page with the date and time." },
    { q: "Can we request a time outside class hours?", a: "Yes. Choose your preferred time and add alternatives. The academy confirms a time that works for both the family and the coach." },
  ],
};

export default post;
