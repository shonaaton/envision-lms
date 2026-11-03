import type { BlogPost } from "@/lib/blog/types";
import { screenshotsFor } from "@/lib/blog/screenshots";

const SLUG = "how-to-join-an-online-chess-class";
const { computer, phone } = screenshotsFor(SLUG);

const post: BlogPost = {
  slug: SLUG,
  title: "How to Join Your Online Chess Class: Step by Step | Envision",
  h1: "How to Join Your Online Chess Class, Check Attendance and Ask Your Coach",
  description:
    "How to join an online chess class at Envision: the dashboard, My Classes, when the room opens, the calendar, attendance records and messaging your coach.",
  keyword: "how to join an online chess class",
  keywords: [
    "how to join an online chess class",
    "online chess class login",
    "chess class schedule",
    "chess class attendance",
    "message chess coach",
  ],
  category: "for-parents",
  excerpt:
    "Where to find the next class, when the room opens, how the calendar and attendance pages work, and how to message the coach - every screen on a computer and on a phone.",
  publishedAt: "2026-11-04",
  updatedAt: "2026-11-04",
  relatedCourses: ["beginner-chess-course", "intermediate-chess-course"],
  relatedPosts: ["how-online-chess-classes-work", "how-to-do-chess-homework-online", "online-chess-classes-abroad-time-zones"],
  priority: 39,
  body: [
    {
      type: "p",
      text: "Envision classes are live, and you join them from the student portal. Log in, find the class on your **dashboard** or under **Class Tools → Classrooms**, and press **Join Classroom**. The room opens **5 minutes before the start time**, and you get a reminder 10 minutes before. The same portal has your **calendar**, your **attendance record** and **Ask Coach** for messages. This guide shows each screen on a computer and on a phone.",
    },
    {
      type: "p",
      text: "If you are new to live online lessons, our guide to [how online chess classes work](/blog/how-online-chess-classes-work) explains what happens inside a class. This one is about finding and joining it, and keeping track afterwards.",
    },
    { type: "h2", id: "dashboard", text: "Step 1: Log in and check your dashboard" },
    {
      type: "p",
      text: "Log in at envisionchessacademy.com with your user ID (for example Aarav@ENV) or email and your password. Your **dashboard** opens first. The top row shows your classes, pending homework, rewards and PTM credits. The **Next Class** card shows the topic, date, time and length of your next class, with a **Join Classroom** button. Below it you will see homework that is due soon and your progress snapshot.",
    },
    {
      type: "screenshots",
      images: [
        computer("cl-d-dashboard", "The dashboard: next class, homework due and progress.", "Student dashboard welcoming Aarav Sen with class, homework, rewards and PTM credit tiles, a Due soon homework banner and the Next Class card for 6 November at 17:00"),
        phone("cl-m-dashboard", "The dashboard on a phone.", "Student dashboard on a phone with the classes, pending homework, rewards and PTM credits tiles stacked"),
      ],
    },
    { type: "h2", id: "my-classes", text: "Step 2: Find the class in My Classes" },
    {
      type: "p",
      text: "Open **Class Tools → Classrooms** to see **My Classes**. The counters show upcoming, completed and closed classes. Each upcoming class card shows the **topic** for that day, the **coach**, the **date and time** and the **duration**, with **Join Classroom** and **View Details** buttons. Times are shown in India time; families abroad should see our guide to [classes across time zones](/blog/online-chess-classes-abroad-time-zones).",
    },
    {
      type: "screenshots",
      images: [
        computer("cl-d-classrooms", "My Classes: every upcoming class with its topic and time.", "My Classes page listing upcoming B1-101 Beginner Group classes with topics such as Back-rank mate and Queen and king mate, coach, date and duration"),
        phone("cl-m-classrooms", "My Classes on a phone.", "My Classes on a phone showing the upcoming class card with its topic, coach, time and Join Classroom button"),
      ],
    },
    { type: "h2", id: "join", text: "Step 3: Join when the room opens" },
    {
      type: "p",
      text: "Until the class is about to start, **Join Classroom** is greyed out and the card says when it opens (for example \"Opens 6 Nov, 5:00 pm\"). The room opens **5 minutes before the start time**; press **Join Classroom** then. Inside, you see the coach's board, the class chat and the questions the coach sets during the lesson.",
    },
    {
      type: "ul",
      items: [
        "**Join a few minutes early** on a computer or tablet with a steady connection.",
        "**Stay in the portal room** for the whole class. Attendance is recorded from the class itself, and a student the room never sees can be marked absent.",
        "**Keep notebook and pencil ready** for the moves the coach shows.",
      ],
    },
    {
      type: "screenshots",
      images: [
        computer("cl-d-class-card", "Before the room opens, Join Classroom is greyed out and shows the opening time.", "Upcoming class card for Back-rank mate showing Opens 6 Nov, 5:00 pm, the coach, date and duration, with a disabled Join Classroom button"),
        phone("cl-m-class-card", "The same class card on a phone.", "Phone class card with the topic Back-rank mate, opening time and Join Classroom button"),
      ],
    },
    { type: "h3", id: "ready-for-class", text: "What to have ready before each class" },
    {
      type: "ul",
      items: [
        "**A laptop, computer or tablet**, charged or plugged in. A phone works, but the board is small.",
        "**A steady internet connection.** If the video stutters, close other apps and move closer to the Wi-Fi router.",
        "**Headphones**, so the coach is clear and the class is not distracted by background noise.",
        "**The homework from last class**, finished, so any questions can be asked at the start.",
        "**A quiet corner**, with younger children supervised by a parent nearby for the first few classes.",
      ],
    },
    {
      type: "p",
      text: "If your child cannot attend, tell the coach on Ask Coach before the class rather than afterwards. Missed topics are covered in the homework and the coach can suggest what to revise.",
    },
    { type: "h2", id: "calendar", text: "Step 4: Plan the week with the calendar" },
    {
      type: "p",
      text: "**Class Tools → Calendar** puts classes, homework due dates and tournaments in one view. Switch between **Week** and **Month**, step through weeks with the arrows, or jump to **Today**. The **Upcoming** list on the right shows what is next. It is the quickest way for a family to plan around school and other activities.",
    },
    {
      type: "screenshots",
      images: [
        computer("cl-d-calendar", "The calendar: classes, homework and tournaments together.", "Week calendar from 2 to 8 November with classes, a tournament and a homework due date, plus an Upcoming list"),
        phone("cl-m-calendar", "The calendar on a phone.", "Calendar on a phone with class, homework and tournament counters and the week view"),
      ],
    },
    { type: "h2", id: "attendance", text: "Step 5: Check attendance" },
    {
      type: "p",
      text: "**Class Tools → Attendance** shows your attendance percentage, classes attended, missed and late, and total hours. Below that, every class is listed with its date, topic and status - Present, Late or Absent. On a credit plan, each class marked Present or Late uses one class credit, so this page also explains your credit balance. If a class you attended shows as absent, tell your coach or the academy so it can be corrected.",
    },
    {
      type: "screenshots",
      images: [
        computer("cl-d-attendance", "Attendance: totals and every class with its status.", "Attendance page with 88 percent attendance, 6 classes attended, 1 missed, 1 late entry and 7 hours, and session details for each class"),
        phone("cl-m-attendance", "Attendance on a phone.", "Attendance on a phone with the percentage, classes attended, missed and late counters"),
      ],
    },
    { type: "h2", id: "ask-coach", text: "Step 6: Message your coach with Ask Coach" },
    {
      type: "p",
      text: "**Class Tools → Ask Coach** is the academy's safe messaging. There is a **batch chat** for your group and a **direct conversation** with your coach. Choose a conversation, type your message and press **Send** (or press Enter). Coaches reply in the portal and you see a badge when there is something new.",
    },
    {
      type: "p",
      text: "Ask Coach is for chess questions: a homework position you did not understand, a game you want looked at, or a missed class. Messages with phone numbers, email addresses or other apps are flagged automatically, so keep everything in the portal. For a longer conversation, book a [parent-teacher meeting](/blog/how-to-book-a-parent-teacher-meeting).",
    },
    {
      type: "screenshots",
      images: [
        computer("cl-d-askcoach-typing", "Ask Coach: choose the conversation, type and send.", "Ask Coach with the direct conversation to the coach open and a question about a homework checkmate typed in the message box"),
        computer("cl-d-askcoach-sent", "Your message in the conversation.", "Ask Coach conversation showing the sent question to the coach"),
        phone("cl-m-askcoach", "Ask Coach on a phone.", "Ask Coach on a phone with the Chats, Open and Ask tabs and the batch chat"),
      ],
    },
    {
      type: "p",
      text: "After class, the homework appears on the Homework page; our [homework guide](/blog/how-to-do-chess-homework-online) walks through it. Classes follow a set syllabus, from the [beginner chess course](/beginner-chess-course) upwards.",
    },
    {
      type: "cta",
      heading: "Try a live class first",
      text: "Book a free demo class. You get the same portal, a real coach and a live lesson on the interactive board.",
      href: "/register",
      label: "Book a free demo class",
    },
  ],
  faqs: [
    { q: "When can we join the class?", a: "The class room opens 5 minutes before the start time. Until then Join Classroom is greyed out and shows when it opens. You also get a reminder 10 minutes before." },
    { q: "Why does a class show as absent when my child attended?", a: "Attendance comes from the live class room. A student who joined only the video call and never opened the portal room can appear absent. Tell the coach or the academy and it can be corrected." },
    { q: "What times are classes shown in?", a: "All class times in the portal are in India time (IST). Families abroad should convert to their local time." },
    { q: "Can I message the coach outside class?", a: "Yes, use Ask Coach in the portal. Keep messages to chess questions; phone numbers and outside apps are flagged." },
  ],
};

export default post;
