export const demoStudentExperience = {
  steps: [
    {
      title: "Book your first class",
      description: "Open Demo Booking to request a trial session with an academy coach.",
    },
    {
      title: "Preview the enrolled journey",
      description: "See how classes, homework, progress, and support look after enrollment.",
    },
    {
      title: "Try live practice tools",
      description: "Use the available training tools to experience the learning environment today.",
    },
  ],
  stats: {
    upcomingClasses: 3,
    homework: 4,
    attendance: "96%",
    credits: 12,
  },
  upcomingClasses: [
    {
      title: "Opening Principles Lab",
      coach: "Coach Arjun",
      dateLabel: "Fri, 11 Jul",
      timeLabel: "5:30 PM",
      format: "Live classroom with puzzles",
      status: "Demo Preview",
    },
    {
      title: "Tactics Builder",
      coach: "Coach Meera",
      dateLabel: "Sun, 13 Jul",
      timeLabel: "10:00 AM",
      format: "Interactive lesson + quiz",
      status: "Demo Preview",
    },
    {
      title: "Endgame Essentials",
      coach: "Coach Rahul",
      dateLabel: "Tue, 15 Jul",
      timeLabel: "6:15 PM",
      format: "Classroom with recap worksheet",
      status: "Demo Preview",
    },
  ],
  homework: [
    {
      title: "Pin and Fork Puzzle Sheet",
      dueLabel: "Due after Sunday class",
      items: 12,
      status: "Assigned",
      score: "8/10 sample score",
    },
    {
      title: "Mini Opening Review",
      dueLabel: "Due in 2 days",
      items: 6,
      status: "Submitted",
      score: "Teacher feedback ready",
    },
    {
      title: "Mate in Two Challenge",
      dueLabel: "Due this week",
      items: 10,
      status: "Assigned",
      score: "XP reward on completion",
    },
  ],
  attendance: [
    { label: "Classes attended", value: "24 / 25" },
    { label: "On-time rate", value: "92%" },
    { label: "Average class rating", value: "4.8 / 5" },
  ],
  progress: [
    { label: "Homework completion", value: "88%" },
    { label: "Tactics accuracy", value: "81%" },
    { label: "Current streak", value: "9 days" },
    { label: "Coach note", value: "Ready for intermediate puzzles" },
  ],
  leaderboard: [
    { rank: "#3", name: "You", detail: "1,280 XP this month" },
    { rank: "#1", name: "Aanya S.", detail: "1,540 XP" },
    { rank: "#2", name: "Rohan K.", detail: "1,410 XP" },
  ],
  tournaments: [
    {
      title: "Sunday Rapid Arena",
      detail: "Starts 13 Jul, 4:00 PM",
      status: "Registration open",
    },
    {
      title: "Beginner Swiss Cup",
      detail: "4 rounds • 15+10",
      status: "Starts next week",
    },
  ],
  credits: [
    { label: "Plan", value: "12-class starter pack" },
    { label: "Credits left", value: "12" },
    { label: "Next invoice", value: "20 Jul 2026" },
  ],
  askCoach: [
    {
      title: "How do I stop hanging pieces?",
      reply: "Coach Meera shared a 3-step blunder check routine.",
    },
    {
      title: "Which opening should I focus on next?",
      reply: "Coach Arjun recommended one white opening and one black setup.",
    },
  ],
  calendar: [
    { day: "Fri 11", title: "Opening Principles Lab" },
    { day: "Sun 13", title: "Homework review" },
    { day: "Tue 15", title: "Endgame Essentials" },
    { day: "Thu 17", title: "Rapid Arena reminder" },
  ],
  classHistory: [
    {
      title: "Knight Forks Workshop",
      detail: "Completed • Attendance marked • Summary available",
    },
    {
      title: "Checkmate Patterns Session",
      detail: "Completed • Quiz score 7/8 • Coach feedback posted",
    },
  ],
  certificates: [
    {
      title: "Beginner Tactics Sprint",
      detail: "Unlocked after 4 straight weekly submissions",
    },
    {
      title: "Attendance Champion",
      detail: "Awarded for 100% presence in a monthly cycle",
    },
  ],
} as const;
