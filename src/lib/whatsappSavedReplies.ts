export const WHATSAPP_STARTER_REPLIES = [
  { id: "starter-fees", title: "Fees and payments", category: "Fees", body: "Hello {name}, we can help with your fee or payment query. Please share the invoice number or payment reference so we can check it for you." },
  { id: "starter-class", title: "Class schedule", category: "Classes", body: "Hello {name}, please share the student's name and the class date you are checking. We will confirm the schedule for you." },
  { id: "starter-ptm", title: "Book a PTM", category: "PTM", body: "Hello {name}, you can request a parent-teacher meeting from the PTM section in your LMS account. Let us know if you need help choosing a slot." },
  { id: "starter-homework", title: "Homework help", category: "Homework", body: "Hello {name}, please open Homework in your LMS account to see the assigned work. You can share a screenshot or PGN file here if you need help." },
  { id: "starter-support", title: "Technical support", category: "Support", body: "Hello {name}, please share a screenshot of the issue, the page you are using, and your device or browser. We will help you troubleshoot it." },
];
export function fillSavedReply(body: string, name: string) { return body.replace(/\{name\}/g, name || "there"); }
