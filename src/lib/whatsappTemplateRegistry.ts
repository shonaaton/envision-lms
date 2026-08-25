export type WhatsAppTemplateVariable = {
  position: number;
  key: string;
  sample: string;
};

export type WhatsAppTemplateDefinition = {
  name: string;
  language: string;
  sourceAutomation: string;
  variables: WhatsAppTemplateVariable[];
};

export const WHATSAPP_TEMPLATE_DEFINITIONS = [
  {
    "name": "hello_world_2",
    "language": "en_US",
    "sourceAutomation": "Manual test template",
    "variables": []
  },
  {
    "name": "account_welcome",
    "language": "en_US",
    "sourceAutomation": "Welcome Email",
    "variables": [
      {
        "position": 1,
        "key": "name",
        "sample": "Aarav"
      },
      {
        "position": 2,
        "key": "role",
        "sample": "Student"
      },
      {
        "position": 3,
        "key": "username",
        "sample": "aarav@example.com"
      }
    ]
  },
  {
    "name": "password_reset_link",
    "language": "en_US",
    "sourceAutomation": "Password Reset",
    "variables": [
      {
        "position": 1,
        "key": "name",
        "sample": "Aarav"
      },
      {
        "position": 2,
        "key": "validity_minutes",
        "sample": "30"
      }
    ]
  },
  {
    "name": "homework_assigned",
    "language": "en_US",
    "sourceAutomation": "New Homework Assignment",
    "variables": [
      {
        "position": 1,
        "key": "student_name",
        "sample": "Aarav"
      },
      {
        "position": 2,
        "key": "homework_title",
        "sample": "Knight Fork Practice"
      },
      {
        "position": 3,
        "key": "classroom_title",
        "sample": "I2-100"
      },
      {
        "position": 4,
        "key": "deadline",
        "sample": "28 Aug 2026, 8:00 PM IST"
      }
    ]
  },
  {
    "name": "homework_due_reminder",
    "language": "en_US",
    "sourceAutomation": "Homework Reminder",
    "variables": [
      {
        "position": 1,
        "key": "student_name",
        "sample": "Aarav"
      },
      {
        "position": 2,
        "key": "homework_title",
        "sample": "Knight Fork Practice"
      },
      {
        "position": 3,
        "key": "deadline",
        "sample": "28 Aug 2026, 8:00 PM IST"
      }
    ]
  },
  {
    "name": "homework_overdue_reminder",
    "language": "en_US",
    "sourceAutomation": "Homework Reminder",
    "variables": [
      {
        "position": 1,
        "key": "student_name",
        "sample": "Aarav"
      },
      {
        "position": 2,
        "key": "homework_title",
        "sample": "Knight Fork Practice"
      },
      {
        "position": 3,
        "key": "deadline",
        "sample": "28 Aug 2026, 8:00 PM IST"
      }
    ]
  },
  {
    "name": "ask_coach_unread",
    "language": "en_US",
    "sourceAutomation": "Unread Ask Coach Message",
    "variables": [
      {
        "position": 1,
        "key": "recipient_name",
        "sample": "Aarav"
      },
      {
        "position": 2,
        "key": "sender_name",
        "sample": "Coach Sanjib"
      }
    ]
  },
  {
    "name": "ask_coach_action_required",
    "language": "en_US",
    "sourceAutomation": "Ask Coach Notification",
    "variables": [
      {
        "position": 1,
        "key": "recipient_name",
        "sample": "Admin"
      },
      {
        "position": 2,
        "key": "conversation_reference",
        "sample": "AC-1042"
      }
    ]
  },
  {
    "name": "demo_class_approved_student",
    "language": "en_US",
    "sourceAutomation": "Demo Class Approved - Student",
    "variables": [
      {
        "position": 1,
        "key": "student_name",
        "sample": "Aarav"
      },
      {
        "position": 2,
        "key": "class_datetime",
        "sample": "27 Aug 2026, 6:00 PM IST"
      }
    ]
  },
  {
    "name": "demo_class_assigned_coach",
    "language": "en_US",
    "sourceAutomation": "Demo Class Assigned - Coach",
    "variables": [
      {
        "position": 1,
        "key": "coach_name",
        "sample": "Coach Sanjib"
      },
      {
        "position": 2,
        "key": "student_name",
        "sample": "Aarav"
      },
      {
        "position": 3,
        "key": "class_datetime",
        "sample": "27 Aug 2026, 6:00 PM IST"
      }
    ]
  },
  {
    "name": "demo_booking_received_student",
    "language": "en_US",
    "sourceAutomation": "Booking Created - Student",
    "variables": [
      {
        "position": 1,
        "key": "student_name",
        "sample": "Aarav"
      },
      {
        "position": 2,
        "key": "booking_datetime",
        "sample": "27 Aug 2026, 6:00 PM IST"
      }
    ]
  },
  {
    "name": "class_booking_confirmed_student",
    "language": "en_US",
    "sourceAutomation": "Booking Created - Student",
    "variables": [
      {
        "position": 1,
        "key": "student_name",
        "sample": "Aarav"
      },
      {
        "position": 2,
        "key": "booking_datetime",
        "sample": "27 Aug 2026, 6:00 PM IST"
      }
    ]
  },
  {
    "name": "class_booking_pending_coach_student",
    "language": "en_US",
    "sourceAutomation": "Booking Created - Student",
    "variables": [
      {
        "position": 1,
        "key": "student_name",
        "sample": "Aarav"
      },
      {
        "position": 2,
        "key": "booking_datetime",
        "sample": "27 Aug 2026, 6:00 PM IST"
      }
    ]
  },
  {
    "name": "demo_booking_pending_approval_coach",
    "language": "en_US",
    "sourceAutomation": "Booking Created - Coach",
    "variables": [
      {
        "position": 1,
        "key": "coach_name",
        "sample": "Coach Sanjib"
      },
      {
        "position": 2,
        "key": "student_name",
        "sample": "Aarav"
      },
      {
        "position": 3,
        "key": "booking_datetime",
        "sample": "27 Aug 2026, 6:00 PM IST"
      }
    ]
  },
  {
    "name": "class_booking_confirmed_coach",
    "language": "en_US",
    "sourceAutomation": "Booking Created - Coach",
    "variables": [
      {
        "position": 1,
        "key": "coach_name",
        "sample": "Coach Sanjib"
      },
      {
        "position": 2,
        "key": "student_name",
        "sample": "Aarav"
      },
      {
        "position": 3,
        "key": "booking_datetime",
        "sample": "27 Aug 2026, 6:00 PM IST"
      }
    ]
  },
  {
    "name": "class_booking_response_required_coach",
    "language": "en_US",
    "sourceAutomation": "Booking Created - Coach",
    "variables": [
      {
        "position": 1,
        "key": "coach_name",
        "sample": "Coach Sanjib"
      },
      {
        "position": 2,
        "key": "student_name",
        "sample": "Aarav"
      },
      {
        "position": 3,
        "key": "booking_datetime",
        "sample": "27 Aug 2026, 6:00 PM IST"
      }
    ]
  },
  {
    "name": "demo_booking_approval_required_admin",
    "language": "en_US",
    "sourceAutomation": "Booking Created - Admin",
    "variables": [
      {
        "position": 1,
        "key": "admin_name",
        "sample": "Admin"
      },
      {
        "position": 2,
        "key": "student_name",
        "sample": "Aarav"
      },
      {
        "position": 3,
        "key": "coach_name",
        "sample": "Coach Sanjib"
      },
      {
        "position": 4,
        "key": "booking_datetime",
        "sample": "27 Aug 2026, 6:00 PM IST"
      }
    ]
  },
  {
    "name": "class_booking_created_admin",
    "language": "en_US",
    "sourceAutomation": "Booking Created - Admin",
    "variables": [
      {
        "position": 1,
        "key": "admin_name",
        "sample": "Admin"
      },
      {
        "position": 2,
        "key": "student_name",
        "sample": "Aarav"
      },
      {
        "position": 3,
        "key": "coach_name",
        "sample": "Coach Sanjib"
      },
      {
        "position": 4,
        "key": "booking_datetime",
        "sample": "27 Aug 2026, 6:00 PM IST"
      }
    ]
  },
  {
    "name": "booking_approved",
    "language": "en_US",
    "sourceAutomation": "Booking Updated",
    "variables": [
      {
        "position": 1,
        "key": "recipient_name",
        "sample": "Aarav"
      },
      {
        "position": 2,
        "key": "booking_type",
        "sample": "class"
      },
      {
        "position": 3,
        "key": "student_name",
        "sample": "Aarav"
      },
      {
        "position": 4,
        "key": "booking_datetime",
        "sample": "27 Aug 2026, 6:00 PM IST"
      }
    ]
  },
  {
    "name": "booking_cancelled",
    "language": "en_US",
    "sourceAutomation": "Booking Updated",
    "variables": [
      {
        "position": 1,
        "key": "recipient_name",
        "sample": "Aarav"
      },
      {
        "position": 2,
        "key": "booking_type",
        "sample": "class"
      },
      {
        "position": 3,
        "key": "student_name",
        "sample": "Aarav"
      },
      {
        "position": 4,
        "key": "booking_datetime",
        "sample": "27 Aug 2026, 6:00 PM IST"
      }
    ]
  },
  {
    "name": "booking_new_time_suggested",
    "language": "en_US",
    "sourceAutomation": "Booking Updated",
    "variables": [
      {
        "position": 1,
        "key": "recipient_name",
        "sample": "Aarav"
      },
      {
        "position": 2,
        "key": "student_name",
        "sample": "Aarav"
      },
      {
        "position": 3,
        "key": "booking_type",
        "sample": "class"
      },
      {
        "position": 4,
        "key": "new_datetime",
        "sample": "28 Aug 2026, 7:00 PM IST"
      }
    ]
  },
  {
    "name": "class_series_cancelled",
    "language": "en_US",
    "sourceAutomation": "Classroom Schedule Change",
    "variables": [
      {
        "position": 1,
        "key": "recipient_name",
        "sample": "Aarav"
      },
      {
        "position": 2,
        "key": "class_title",
        "sample": "I2-100"
      }
    ]
  },
  {
    "name": "class_session_cancelled",
    "language": "en_US",
    "sourceAutomation": "Classroom Schedule Change",
    "variables": [
      {
        "position": 1,
        "key": "recipient_name",
        "sample": "Aarav"
      },
      {
        "position": 2,
        "key": "class_title",
        "sample": "I2-100"
      },
      {
        "position": 3,
        "key": "old_datetime",
        "sample": "29 Aug 2026, 12:30 PM IST"
      }
    ]
  },
  {
    "name": "class_rescheduled",
    "language": "en_US",
    "sourceAutomation": "Classroom Schedule Change",
    "variables": [
      {
        "position": 1,
        "key": "recipient_name",
        "sample": "Aarav"
      },
      {
        "position": 2,
        "key": "class_title",
        "sample": "I2-100"
      },
      {
        "position": 3,
        "key": "old_datetime",
        "sample": "29 Aug 2026, 12:30 PM IST"
      },
      {
        "position": 4,
        "key": "new_datetime",
        "sample": "29 Aug 2026, 1:30 PM IST"
      }
    ]
  },
  {
    "name": "class_schedule_updated",
    "language": "en_US",
    "sourceAutomation": "Classroom Schedule Change",
    "variables": [
      {
        "position": 1,
        "key": "recipient_name",
        "sample": "Aarav"
      },
      {
        "position": 2,
        "key": "class_title",
        "sample": "I2-100"
      },
      {
        "position": 3,
        "key": "next_datetime",
        "sample": "30 Aug 2026, 12:30 PM IST"
      }
    ]
  },
  {
    "name": "class_permanent_timing_updated",
    "language": "en_US",
    "sourceAutomation": "Classroom Schedule Change",
    "variables": [
      {
        "position": 1,
        "key": "recipient_name",
        "sample": "Aarav"
      },
      {
        "position": 2,
        "key": "class_title",
        "sample": "I2-100"
      },
      {
        "position": 3,
        "key": "new_regular_time",
        "sample": "Saturdays 12:30 PM IST"
      },
      {
        "position": 4,
        "key": "effective_date",
        "sample": "29 Aug 2026"
      }
    ]
  },
  {
    "name": "attendance_pending_coach",
    "language": "en_US",
    "sourceAutomation": "Attendance Reminder",
    "variables": [
      {
        "position": 1,
        "key": "coach_name",
        "sample": "Coach Sanjib"
      },
      {
        "position": 2,
        "key": "class_title",
        "sample": "I2-100"
      },
      {
        "position": 3,
        "key": "session_datetime",
        "sample": "25 Aug 2026, 12:30 PM IST"
      }
    ]
  },
  {
    "name": "invoice_available_student",
    "language": "en_US",
    "sourceAutomation": "Invoice Sent - Student",
    "variables": [
      {
        "position": 1,
        "key": "student_name",
        "sample": "Aarav"
      },
      {
        "position": 2,
        "key": "invoice_number",
        "sample": "ECA-2026-1042"
      },
      {
        "position": 3,
        "key": "invoice_title",
        "sample": "August Group Classes"
      },
      {
        "position": 4,
        "key": "amount",
        "sample": "\u20b92,500"
      },
      {
        "position": 5,
        "key": "due_date",
        "sample": "31 Aug 2026"
      }
    ]
  },
  {
    "name": "invoice_available_parent",
    "language": "en_US",
    "sourceAutomation": "Invoice Sent - Parent",
    "variables": [
      {
        "position": 1,
        "key": "parent_name",
        "sample": "Mr. Sharma"
      },
      {
        "position": 2,
        "key": "invoice_number",
        "sample": "ECA-2026-1042"
      },
      {
        "position": 3,
        "key": "student_name",
        "sample": "Aarav"
      },
      {
        "position": 4,
        "key": "amount",
        "sample": "\u20b92,500"
      },
      {
        "position": 5,
        "key": "due_date",
        "sample": "31 Aug 2026"
      }
    ]
  },
  {
    "name": "payment_recorded_student",
    "language": "en_US",
    "sourceAutomation": "Payment Recorded",
    "variables": [
      {
        "position": 1,
        "key": "student_name",
        "sample": "Aarav"
      },
      {
        "position": 2,
        "key": "amount",
        "sample": "\u20b92,500"
      },
      {
        "position": 3,
        "key": "invoice_number",
        "sample": "ECA-2026-1042"
      },
      {
        "position": 4,
        "key": "payment_reference",
        "sample": "UPI-82374"
      }
    ]
  },
  {
    "name": "payment_recorded_parent",
    "language": "en_US",
    "sourceAutomation": "Payment Recorded",
    "variables": [
      {
        "position": 1,
        "key": "parent_name",
        "sample": "Mr. Sharma"
      },
      {
        "position": 2,
        "key": "amount",
        "sample": "\u20b92,500"
      },
      {
        "position": 3,
        "key": "student_name",
        "sample": "Aarav"
      },
      {
        "position": 4,
        "key": "invoice_number",
        "sample": "ECA-2026-1042"
      },
      {
        "position": 5,
        "key": "payment_reference",
        "sample": "UPI-82374"
      }
    ]
  },
  {
    "name": "invoice_pending_reminder",
    "language": "en_US",
    "sourceAutomation": "Invoice Reminder",
    "variables": [
      {
        "position": 1,
        "key": "student_name",
        "sample": "Aarav"
      },
      {
        "position": 2,
        "key": "invoice_number",
        "sample": "ECA-2026-1042"
      },
      {
        "position": 3,
        "key": "invoice_title",
        "sample": "August Group Classes"
      },
      {
        "position": 4,
        "key": "amount",
        "sample": "\u20b92,500"
      },
      {
        "position": 5,
        "key": "due_date",
        "sample": "31 Aug 2026"
      }
    ]
  },
  {
    "name": "invoice_due_soon",
    "language": "en_US",
    "sourceAutomation": "Monthly Invoice Reminder",
    "variables": [
      {
        "position": 1,
        "key": "recipient_name",
        "sample": "Aarav"
      },
      {
        "position": 2,
        "key": "invoice_number",
        "sample": "ECA-2026-1042"
      },
      {
        "position": 3,
        "key": "student_or_invoice_title",
        "sample": "August Group Classes"
      },
      {
        "position": 4,
        "key": "due_date",
        "sample": "31 Aug 2026"
      },
      {
        "position": 5,
        "key": "amount",
        "sample": "\u20b92,500"
      }
    ]
  },
  {
    "name": "invoice_due_today",
    "language": "en_US",
    "sourceAutomation": "Monthly Invoice Reminder",
    "variables": [
      {
        "position": 1,
        "key": "recipient_name",
        "sample": "Aarav"
      },
      {
        "position": 2,
        "key": "invoice_number",
        "sample": "ECA-2026-1042"
      },
      {
        "position": 3,
        "key": "student_or_invoice_title",
        "sample": "August Group Classes"
      },
      {
        "position": 4,
        "key": "due_date",
        "sample": "31 Aug 2026"
      },
      {
        "position": 5,
        "key": "amount",
        "sample": "\u20b92,500"
      }
    ]
  },
  {
    "name": "invoice_overdue_reminder",
    "language": "en_US",
    "sourceAutomation": "Monthly Invoice Reminder",
    "variables": [
      {
        "position": 1,
        "key": "recipient_name",
        "sample": "Aarav"
      },
      {
        "position": 2,
        "key": "invoice_number",
        "sample": "ECA-2026-1042"
      },
      {
        "position": 3,
        "key": "student_or_invoice_title",
        "sample": "August Group Classes"
      },
      {
        "position": 4,
        "key": "amount",
        "sample": "\u20b92,500"
      },
      {
        "position": 5,
        "key": "due_date",
        "sample": "31 Aug 2026"
      }
    ]
  },
  {
    "name": "invoice_due_admin_alert",
    "language": "en_US",
    "sourceAutomation": "Monthly Invoice Reminder",
    "variables": [
      {
        "position": 1,
        "key": "admin_name",
        "sample": "Admin"
      },
      {
        "position": 2,
        "key": "invoice_number",
        "sample": "ECA-2026-1042"
      },
      {
        "position": 3,
        "key": "student_name",
        "sample": "Aarav"
      },
      {
        "position": 4,
        "key": "timing_status",
        "sample": "due today"
      },
      {
        "position": 5,
        "key": "amount",
        "sample": "\u20b92,500"
      }
    ]
  },
  {
    "name": "class_credit_low",
    "language": "en_US",
    "sourceAutomation": "Credit Balance Reminder",
    "variables": [
      {
        "position": 1,
        "key": "student_name",
        "sample": "Aarav"
      },
      {
        "position": 2,
        "key": "credit_balance",
        "sample": "1"
      }
    ]
  },
  {
    "name": "class_credit_empty",
    "language": "en_US",
    "sourceAutomation": "Credit Balance Reminder",
    "variables": [
      {
        "position": 1,
        "key": "student_name",
        "sample": "Aarav"
      }
    ]
  },
  {
    "name": "tournament_registration_confirmed",
    "language": "en_US",
    "sourceAutomation": "Tournament External Registration",
    "variables": [
      {
        "position": 1,
        "key": "participant_name",
        "sample": "Aarav"
      },
      {
        "position": 2,
        "key": "tournament_name",
        "sample": "ECA Rapid Arena"
      },
      {
        "position": 3,
        "key": "tournament_datetime",
        "sample": "30 Aug 2026, 5:00 PM IST"
      }
    ]
  },
  {
    "name": "tournament_starting_soon",
    "language": "en_US",
    "sourceAutomation": "Tournament Lifecycle",
    "variables": [
      {
        "position": 1,
        "key": "participant_name",
        "sample": "Aarav"
      },
      {
        "position": 2,
        "key": "tournament_name",
        "sample": "ECA Rapid Arena"
      },
      {
        "position": 3,
        "key": "start_time",
        "sample": "5:00 PM IST"
      }
    ]
  },
  {
    "name": "tournament_started",
    "language": "en_US",
    "sourceAutomation": "Tournament Lifecycle",
    "variables": [
      {
        "position": 1,
        "key": "participant_name",
        "sample": "Aarav"
      },
      {
        "position": 2,
        "key": "tournament_name",
        "sample": "ECA Rapid Arena"
      }
    ]
  },
  {
    "name": "tournament_completed",
    "language": "en_US",
    "sourceAutomation": "Tournament Lifecycle",
    "variables": [
      {
        "position": 1,
        "key": "participant_name",
        "sample": "Aarav"
      },
      {
        "position": 2,
        "key": "tournament_name",
        "sample": "ECA Rapid Arena"
      }
    ]
  },
  {
    "name": "tournament_final_result",
    "language": "en_US",
    "sourceAutomation": "Tournament Lifecycle",
    "variables": [
      {
        "position": 1,
        "key": "participant_name",
        "sample": "Aarav"
      },
      {
        "position": 2,
        "key": "tournament_name",
        "sample": "ECA Rapid Arena"
      },
      {
        "position": 3,
        "key": "rank",
        "sample": "8"
      }
    ]
  },
  {
    "name": "course_assigned_student",
    "language": "en_US",
    "sourceAutomation": "New Course / Level Assigned",
    "variables": [
      {
        "position": 1,
        "key": "student_name",
        "sample": "Aarav"
      },
      {
        "position": 2,
        "key": "course_name",
        "sample": "Intermediate Chess"
      },
      {
        "position": 3,
        "key": "level_name",
        "sample": "I2"
      },
      {
        "position": 4,
        "key": "first_class_datetime",
        "sample": "29 Aug 2026, 12:30 PM IST"
      }
    ]
  },
  {
    "name": "course_assigned_parent",
    "language": "en_US",
    "sourceAutomation": "New Course / Level Assigned",
    "variables": [
      {
        "position": 1,
        "key": "parent_name",
        "sample": "Mr. Sharma"
      },
      {
        "position": 2,
        "key": "student_name",
        "sample": "Aarav"
      },
      {
        "position": 3,
        "key": "course_name",
        "sample": "Intermediate Chess"
      },
      {
        "position": 4,
        "key": "level_name",
        "sample": "I2"
      },
      {
        "position": 5,
        "key": "first_class_datetime",
        "sample": "29 Aug 2026, 12:30 PM IST"
      }
    ]
  },
  {
    "name": "achievement_earned_student",
    "language": "en_US",
    "sourceAutomation": "Achievement / Badge Earned",
    "variables": [
      {
        "position": 1,
        "key": "student_name",
        "sample": "Aarav"
      },
      {
        "position": 2,
        "key": "achievement_title",
        "sample": "Tournament Champion"
      }
    ]
  },
  {
    "name": "achievement_earned_parent",
    "language": "en_US",
    "sourceAutomation": "Achievement / Badge Earned",
    "variables": [
      {
        "position": 1,
        "key": "parent_name",
        "sample": "Mr. Sharma"
      },
      {
        "position": 2,
        "key": "student_name",
        "sample": "Aarav"
      },
      {
        "position": 3,
        "key": "achievement_title",
        "sample": "Tournament Champion"
      }
    ]
  },
  {
    "name": "student_no_show_notice",
    "language": "en_US",
    "sourceAutomation": "Student No-Show Warning",
    "variables": [
      {
        "position": 1,
        "key": "recipient_name",
        "sample": "Mr. Sharma"
      },
      {
        "position": 2,
        "key": "student_name",
        "sample": "Aarav"
      },
      {
        "position": 3,
        "key": "class_title",
        "sample": "I2-100"
      },
      {
        "position": 4,
        "key": "session_datetime",
        "sample": "25 Aug 2026, 12:30 PM IST"
      },
      {
        "position": 5,
        "key": "credit_status",
        "sample": "1 credit deducted"
      }
    ]
  },
  {
    "name": "invoice_overdue_action_required",
    "language": "en_US",
    "sourceAutomation": "Invoice Overdue Escalation",
    "variables": [
      {
        "position": 1,
        "key": "recipient_name",
        "sample": "Aarav"
      },
      {
        "position": 2,
        "key": "invoice_number",
        "sample": "ECA-2026-1042"
      },
      {
        "position": 3,
        "key": "student_or_invoice_title",
        "sample": "August Group Classes"
      },
      {
        "position": 4,
        "key": "days_overdue",
        "sample": "3"
      },
      {
        "position": 5,
        "key": "amount",
        "sample": "\u20b92,500"
      }
    ]
  },
  {
    "name": "class_credits_added",
    "language": "en_US",
    "sourceAutomation": "Credit Added / Credit Removed",
    "variables": [
      {
        "position": 1,
        "key": "recipient_name",
        "sample": "Mr. Sharma"
      },
      {
        "position": 2,
        "key": "credits_added",
        "sample": "4"
      },
      {
        "position": 3,
        "key": "student_name",
        "sample": "Aarav"
      },
      {
        "position": 4,
        "key": "new_balance",
        "sample": "6"
      }
    ]
  },
  {
    "name": "class_credits_removed",
    "language": "en_US",
    "sourceAutomation": "Credit Added / Credit Removed",
    "variables": [
      {
        "position": 1,
        "key": "recipient_name",
        "sample": "Mr. Sharma"
      },
      {
        "position": 2,
        "key": "credits_removed",
        "sample": "1"
      },
      {
        "position": 3,
        "key": "student_name",
        "sample": "Aarav"
      },
      {
        "position": 4,
        "key": "new_balance",
        "sample": "5"
      }
    ]
  },
  {
    "name": "class_completed_summary",
    "language": "en_US",
    "sourceAutomation": "Class Completed Summary",
    "variables": [
      {
        "position": 1,
        "key": "recipient_name",
        "sample": "Aarav"
      },
      {
        "position": 2,
        "key": "class_title",
        "sample": "I2-100"
      },
      {
        "position": 3,
        "key": "topic_name",
        "sample": "Knight Outposts"
      },
      {
        "position": 4,
        "key": "homework_or_status",
        "sample": "Homework assigned"
      }
    ]
  },
  {
    "name": "homework_submitted",
    "language": "en_US",
    "sourceAutomation": "Homework Submitted Confirmation",
    "variables": [
      {
        "position": 1,
        "key": "recipient_name",
        "sample": "Mr. Sharma"
      },
      {
        "position": 2,
        "key": "homework_title",
        "sample": "Knight Fork Practice"
      },
      {
        "position": 3,
        "key": "student_name",
        "sample": "Aarav"
      },
      {
        "position": 4,
        "key": "submission_datetime",
        "sample": "25 Aug 2026, 7:45 PM IST"
      }
    ]
  },
  {
    "name": "lms_failure_alert_admin",
    "language": "en_US",
    "sourceAutomation": "System Failure Alert",
    "variables": [
      {
        "position": 1,
        "key": "admin_name",
        "sample": "Sayantan"
      },
      {
        "position": 2,
        "key": "failure_title",
        "sample": "Homework reminder retry failed"
      },
      {
        "position": 3,
        "key": "environment",
        "sample": "production"
      },
      {
        "position": 4,
        "key": "timestamp",
        "sample": "25 Aug 2026, 12:05 AM IST"
      }
    ]
  }
] as const satisfies readonly WhatsAppTemplateDefinition[];

export function getWhatsAppTemplateDefinition(name?: string) {
  const cleanName = String(name || "").trim();
  return WHATSAPP_TEMPLATE_DEFINITIONS.find((template) => template.name === cleanName) || null;
}

export function templateSampleValues(name?: string) {
  return (getWhatsAppTemplateDefinition(name)?.variables || [])
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((variable) => variable.sample)
    .filter(Boolean);
}
