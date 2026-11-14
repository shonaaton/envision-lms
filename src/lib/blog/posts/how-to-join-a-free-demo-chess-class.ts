import type { BlogPost } from "@/lib/blog/types";
import { screenshotsFor } from "@/lib/blog/screenshots";

const SLUG = "how-to-join-a-free-demo-chess-class";
const { computer, phone } = screenshotsFor(SLUG);

const post: BlogPost = {
  slug: SLUG,
  title: "How to Join Your Free Demo Chess Class | Envision",
  h1: "How to Join Your Free Demo Chess Class After Your Account Is Created",
  description:
    "Your demo account is ready - now what? Log in, pick a demo time, wait for the coach to be confirmed and join the live class. Every screen, on a computer and a phone.",
  keyword: "how to join a free demo chess class",
  keywords: [
    "how to join a free demo chess class",
    "demo chess class login",
    "book demo chess class time",
    "join demo class online",
    "free trial chess class online",
  ],
  category: "for-parents",
  excerpt:
    "From the first login to the live classroom: completing your details, choosing a demo time, what happens while the academy assigns a coach, and how to join when the room opens.",
  publishedAt: "2026-11-14",
  updatedAt: "2026-11-14",
  relatedCourses: ["beginner-chess-course", "intermediate-chess-course"],
  relatedPosts: ["how-to-join-an-online-chess-class", "how-online-chess-classes-work", "online-chess-practice-tools-for-kids"],
  priority: 40,
  body: [
    {
      type: "p",
      text: "Once your Envision demo account is created, joining the free demo class takes four moves: **log in**, **pick a demo time**, **wait for the academy to confirm a coach**, and **press Join Demo Class** when the room opens, 5 minutes before the start. Everything happens in the same student portal an enrolled student uses, and the demo class is a real live lesson with a real coach, not a recording. This guide shows each screen on a computer and on a phone.",
    },
    {
      type: "p",
      text: "If you have not made an account yet, start on the [free demo class page](/book-free-demo-class). If you would like to know what a live lesson feels like before you book, our guide to [how online chess classes work](/blog/how-online-chess-classes-work) walks through a typical class.",
    },
    { type: "h2", id: "log-in", text: "Step 1: Log in to the student portal" },
    {
      type: "p",
      text: "When the academy team creates your demo account, you receive a **welcome email** with your **username** (it looks like Aarav@ENV) and a **temporary password**. Open envisionchessacademy.com, press **Login**, and enter the username (or your email) and the password. Afterwards, change the temporary password to one of your own from **Account Settings**. If you have lost it, use **Forgot password?** under the password box.",
    },
    {
      type: "p",
      text: "If you created the account yourself on the sign-up page, you are already logged in and taken to the booking page, so skip to Step 4. And if the academy already agreed a time with you on the phone, the class may be booked before you first log in: you will see **Demo class scheduled** or **Demo class confirmed** on the dashboard and can go straight to Step 6.",
    },
    {
      type: "screenshots",
      images: [
        computer("dm-d-login", "The login page. Use the username from your welcome email, or your email.", "Envision login page with the login ID Aarav@ENV and a hidden password entered, and the Sign in securely button"),
        phone("dm-m-login", "Logging in on a phone.", "Envision login page on a phone with the email, username or login ID field and the password field"),
      ],
    },
    { type: "h2", id: "details", text: "Step 2: Complete your details" },
    {
      type: "p",
      text: "On the first login a **Complete your details** box opens over the dashboard. It asks for the student's first and last name, **age**, the parent or guardian's name, an optional parent email, and the **country and city**. Most of it is already filled in from the sign-up form; usually only the age is missing. Fill in what is empty and press **Save details**.",
    },
    {
      type: "p",
      text: "These details are not paperwork for its own sake. The coach uses the age and level to plan the demo, and the academy uses the parent's name and city to reach the right person afterwards. You can press **Later** if you are in a hurry, but the box comes back the next time you open the portal until it is complete.",
    },
    {
      type: "screenshots",
      images: [
        computer("dm-d-details", "Complete your details: usually only the age is left to fill.", "Complete your details pop-up with the student's first and last name, age 8, parent Mrs Sen, country India and city Kolkata, and Later and Save details buttons"),
        phone("dm-m-details", "The same form on a phone.", "Complete your details form on a phone with name, age, parent, parent email, country and city fields"),
      ],
    },
    { type: "h2", id: "dashboard", text: "Step 3: Find the demo booking on your dashboard" },
    {
      type: "p",
      text: "Your **Demo Dashboard** opens next. It is the same dashboard an enrolled student uses. The parts marked **Demo Preview** are sample data that show what you get after enrolling; your demo class, your homework and your chess analytics are real. The purple band says **Book your free demo class**. Press **Choose Demo Timing** (or **Book Demo Class** in the box at the top). You can also open it any time from **Class Tools → Demo Booking** in the menu.",
    },
    {
      type: "screenshots",
      images: [
        computer("dm-d-dashboard-new", "A new demo dashboard: the purple band is your next step.", "Demo dashboard welcoming Aarav Sen with Demo Class not booked, the Book your demo timing box and a purple band saying Book your free demo class with a Choose Demo Timing button"),
        phone("dm-m-book-band", "On a phone, scroll down to the purple band.", "Phone dashboard showing the Book Demo Class box and the purple Book your free demo class band with the Choose Demo Timing button"),
      ],
    },
    { type: "h2", id: "pick-time", text: "Step 4: Pick a day and time for the demo" },
    {
      type: "p",
      text: "The **Demo Booking** page asks for your preferred time in two taps. First **pick a day**: the next two weeks are shown, starting with Today and Tomorrow. Then **pick a time**: half-hour slots grouped into Morning, Afternoon, Evening and Night. Only times at least 30 minutes away are shown, so anything you can tap is a time the academy can still arrange. Early-morning times are hidden behind a link, for families in other time zones.",
    },
    {
      type: "ul",
      items: [
        "**Check the time zone.** The portal reads it from your device, so most families never touch it. Change it only if you are booking for someone in another place.",
        "**Read the green line.** It repeats the day and time you chose in words, for example \"Sunday 15 November at 5:00 pm\", so there is no confusion about AM and PM.",
        "**Leave a message for the academy.** A line about the child helps the coach plan: whether they know how the pieces move, whether they play at school, or what they want to learn.",
      ],
    },
    {
      type: "p",
      text: "Press **Request Demo Booking**. A message at the bottom of the screen confirms the time you asked for.",
    },
    {
      type: "screenshots",
      images: [
        computer("dm-d-booking-picked", "Pick a day, then a time.", "Demo Booking page with Tomorrow 15 Nov selected and the 5:00 PM evening slot highlighted among the half-hour time buttons"),
        computer("dm-d-booking-send", "Check the green line, add a message and press Request Demo Booking.", "Time zone set to India IST, the green confirmation Sunday 15 November at 5:00 pm, a message for the academy and the Request Demo Booking button"),
        phone("dm-m-booking-picked", "Choosing a time on a phone.", "Phone booking screen with Tomorrow selected and the 5:00 PM slot highlighted under Evening"),
      ],
    },
    { type: "h2", id: "waiting", text: "Step 5: Wait while the academy assigns a coach" },
    {
      type: "p",
      text: "Your request now goes to the academy team, who choose a coach for the student's age and level and fix the class. Until then the booking page shows **Demo Requested - Waiting for confirmation from Envision Chess Academy**, and the dashboard band changes to **Your demo time is with the academy**.",
    },
    {
      type: "p",
      text: "You can still change your mind at this stage. Pick a new day and time on the same page and press **Change Requested Time**, or use **Change Demo Timing** on the dashboard. There is nothing else to do while you wait. Meanwhile, the **Practice & Improve** tools on the dashboard are open to demo accounts with a few tries each; our guide to [practice tools for kids](/blog/online-chess-practice-tools-for-kids) explains what each one trains.",
    },
    {
      type: "screenshots",
      images: [
        computer("dm-d-booking-requested", "Demo Requested: the academy now confirms a coach and the time.", "Demo Booking page showing a yellow Demo Requested box for 15 Nov 2026 at 17:00 waiting for confirmation, with the picker to change the requested time"),
        phone("dm-m-waiting", "On the dashboard: your demo time is with the academy.", "Phone dashboard band saying Waiting for the academy, Your demo time is with the academy, with a Change Demo Timing button"),
      ],
    },
    { type: "h2", id: "confirmed", text: "Step 6: Your demo class is confirmed" },
    {
      type: "p",
      text: "When the academy confirms the class you hear about it three ways: a **WhatsApp message** and an **email** saying your demo class is confirmed, with the date and time, and a notification on the **bell** in the portal. The confirmed time is usually the one you asked for. If no coach was free then, the academy agrees a nearby time with you, and the confirmation shows the time that was actually booked.",
    },
    {
      type: "p",
      text: "The dashboard band now says **Demo class confirmed**, with the coach's name, the date and the time. The class also appears under **Class Tools → Classrooms**, and the booking page shows **Demo Class Confirmed** with a **Go to my classroom** button. Until the room opens, the join button is greyed out and reads **Join opens 5 minutes before class**. If the time no longer suits you, press **Need a different time?** and send a new one; the academy confirms it again.",
    },
    {
      type: "screenshots",
      images: [
        computer("dm-d-band-confirmed", "Confirmed: the coach, date and time, with Join greyed out until the room opens.", "Purple band saying Demo class confirmed, Demo assessment class with Coach Sanjib Das, the class date and time and a greyed-out Join opens 5 minutes before class button"),
        phone("dm-m-band-confirmed", "The confirmed class on a phone.", "Phone band showing Demo class confirmed with Coach Sanjib Das, 15 Nov at 17:00 and Join opens 5 minutes before class"),
      ],
    },
    { type: "h3", id: "warm-up", text: "A short warm-up homework" },
    {
      type: "p",
      text: "Once the class is booked, a short **Demo Class Warm-Up** appears in the Homework box on the dashboard, with a due date a couple of days later. It is real homework: a few questions and board tasks. Doing it before the class gives the coach a feel for the child's level and saves time in the lesson. Our [homework guide](/blog/how-to-do-chess-homework-online) shows how to open, answer and submit it.",
    },
    {
      type: "screenshots",
      images: [
        computer("dm-d-warmup", "The warm-up is real homework your coach can see.", "Homework box on the demo dashboard with a real Demo Class Warm-Up assignment, Pending, due 17 Nov 2026, with 3 activities"),
      ],
    },
    { type: "h2", id: "join", text: "Step 7: Join the demo class when the room opens" },
    {
      type: "p",
      text: "Reminders arrive on WhatsApp before the class: the day before, an hour before and 15 minutes before. **5 minutes before the start**, the button on the dashboard turns yellow and reads **Join Demo Class**, and the band says **Join available**. The same class on the **Classrooms** page now has an active **Join Classroom** button. Use either one.",
    },
    {
      type: "p",
      text: "Pressing Join does two things. The class's **Google Meet** video call opens in a new tab, and this tab becomes the **classroom board**. Keep **both** open for the whole class: you see and hear the coach in Meet, and you play the moves on the portal board. If the Meet tab did not open (some browsers block it), press **Open Google Meet** at the top of the classroom. When Meet asks, allow the camera and microphone.",
    },
    {
      type: "screenshots",
      images: [
        computer("dm-d-band-open", "5 minutes before the start, Join Demo Class lights up.", "Demo class confirmed band with Join available and a yellow Join Demo Class button"),
        phone("dm-m-band-open", "Join Demo Class on a phone.", "Phone band with Join available and the yellow Join Demo Class button below the class date and time"),
        computer("dm-d-classrooms-open", "The same class in Classrooms, ready to join.", "My Classes page with one upcoming class, Aarav Sen - Demo Class, topic Demo assessment class, coach Sanjib Das, 30 minutes, Join available and an active Join Classroom button"),
      ],
    },
    { type: "h2", id: "classroom", text: "Step 8: Inside the live classroom" },
    {
      type: "p",
      text: "The classroom shows the **board** in the middle and the **class chat** on the right (below the board on a phone), with the coach's name and the topic across the top. If you arrive before the coach starts, you are in the **waiting room**: the board shows the starting position and a **Leave waiting room** button sits at the top. Stay where you are; the class begins when the coach starts it, and the board follows the coach from then on.",
    },
    {
      type: "p",
      text: "A demo class usually lasts about 30 minutes. The coach gets to know the student, plays through a few positions and checks what they already know, so they can recommend the right level. Let the child answer by themselves, even when they are unsure; the coach learns more from an honest guess than from a prompted answer.",
    },
    {
      type: "screenshots",
      images: [
        computer("dm-d-live", "The live classroom: board, chat and Open Google Meet.", "Live classroom for Aarav Sen - Demo Class with coach Sanjib Das, a chessboard in the starting position, the class chat panel and Leave waiting room and Open Google Meet buttons"),
        phone("dm-m-live", "The classroom on a phone, with the chat below the board.", "Live classroom on a phone with Leave and Open Google Meet buttons, the chessboard and the classroom chat below it"),
      ],
    },
    { type: "h3", id: "ready", text: "What to have ready for the demo" },
    {
      type: "ul",
      items: [
        "**A laptop, computer or tablet**, charged or plugged in. A phone works, but the board is small and switching between Meet and the board is easier on a bigger screen.",
        "**A steady internet connection.** Close other apps and videos, and sit near the Wi-Fi router if you can.",
        "**Headphones with a microphone**, so the coach is clear and the child can answer easily.",
        "**A quiet corner and a parent nearby**, especially for younger children. Parents are welcome to listen in, and the last few minutes are a good time to ask the coach questions.",
        "**Log in 10 minutes early.** If the password needs resetting or the device needs an update, there is still time before the room opens.",
      ],
    },
    {
      type: "callout",
      title: "If something goes wrong",
      text: "If the Join button stays grey after the start time, refresh the page; it checks the time every few seconds. If you can no longer make the class, press Need a different time? before the class and send a new time. A demo that was missed can be rescheduled, so reply to the academy's WhatsApp message rather than booking a new account.",
    },
    { type: "h2", id: "after", text: "After the demo class" },
    {
      type: "p",
      text: "After the class the coach writes an assessment of the student's level, and the academy contacts you to talk through it: which course and level fit, which batch times are free, and what happens next. There is no obligation to enrol. If you do, the same login keeps working; the Demo Preview sections fill with your own classes, homework and progress, and our guide to [joining your regular online classes](/blog/how-to-join-an-online-chess-class) covers the portal from there. Most new students start in the [beginner chess course](/beginner-chess-course).",
    },
    {
      type: "cta",
      heading: "Not booked yet?",
      text: "Book a free demo class with a real coach on the live interactive board. No card needed.",
      href: "/book-free-demo-class",
      label: "Book a free demo class",
    },
  ],
  faqs: [
    { q: "When can we join the demo class?", a: "The room opens 5 minutes before the start time. Until then the button reads Join opens 5 minutes before class. At the start, press Join Demo Class on the dashboard or Join Classroom on the Classrooms page." },
    { q: "How do we know the demo is confirmed?", a: "You get a WhatsApp message and an email with the date and time, and a notification in the portal. The dashboard band changes to Demo class confirmed and shows the coach's name." },
    { q: "Can we change the demo time?", a: "Yes. Before the class is confirmed, pick a new time on the Demo Booking page and press Change Requested Time. After it is confirmed, use Need a different time? on the dashboard and the academy confirms the new time." },
    { q: "Do we need Google Meet as well as the portal?", a: "Yes. Join opens the Google Meet video call in a new tab and the classroom board in the portal. Keep both open; if Meet does not open, press Open Google Meet at the top of the classroom." },
    { q: "Is the demo class free?", a: "Yes. The demo class is free and needs no card. Enrol only if you like it." },
  ],
};

export default post;
