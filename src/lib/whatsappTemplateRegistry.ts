export type WhatsAppTemplateVariable = {
  position: number;
  key: string;
  sample: string;
};

export type WhatsAppTemplateDefinition = {
  name: string;
  language: string;
  sourceAutomation: string;
  body: string;
  variables: WhatsAppTemplateVariable[];
};

export const WHATSAPP_TEMPLATE_DEFINITIONS = [
  {
    "name": "hello_world_2",
    "language": "en",
    "sourceAutomation": "Manual test template",
    "body": "Hello! This is a test WhatsApp message from Envision Chess Academy.",
    "variables": []
  },
  {
    "name": "account_welcome",
    "language": "en",
    "sourceAutomation": "Welcome Email",
    "body": "Hello {{1}}, your Envision Chess Academy {{2}} account is ready. Your username is {{3}}. Use the button below to sign in and set your password. If you were not expecting this account, please contact academy support.",
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
    "language": "en",
    "sourceAutomation": "Password Reset",
    "body": "Hello {{1}}, a password reset was requested for your Envision Chess Academy account. Use the secure button below within {{2}} minutes. If you did not request this, you can ignore this message.",
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
    "language": "en",
    "sourceAutomation": "New Homework Assignment",
    "body": "Hello {{1}}, a new homework assignment, \u201c{{2}}\u201d, has been added to {{3}}. The submission deadline is {{4}}. Open the academy portal to view and complete it.",
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
    "language": "en",
    "sourceAutomation": "Homework Reminder",
    "body": "Hello {{1}}, your homework \u201c{{2}}\u201d is still pending. The submission deadline is {{3}}. Please complete it from the Envision Chess Academy portal.",
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
    "language": "en",
    "sourceAutomation": "Homework Reminder",
    "body": "Hello {{1}}, your homework \u201c{{2}}\u201d is overdue. The deadline was {{3}}. Please open the academy portal to complete the pending assignment.",
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
    "language": "en",
    "sourceAutomation": "Unread Ask Coach Message",
    "body": "Hello {{1}}, you have an unread Ask Coach message from {{2}}. Open the academy portal to read the conversation and reply.",
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
    "language": "en",
    "sourceAutomation": "Ask Coach Notification",
    "body": "Hello {{1}}, {{2}} sent an Ask Coach message that needs your attention. Open the academy portal to review and reply.",
    "variables": [
      {
        "position": 1,
        "key": "recipient_name",
        "sample": "Admin"
      },
      {
        "position": 2,
        "key": "sender_name",
        "sample": "Aarav"
      }
    ]
  },
  {
    "name": "demo_class_approved_student",
    "language": "en",
    "sourceAutomation": "Demo Class Approved - Student",
    "body": "Hello {{1}}, your Envision Chess Academy demo class is confirmed for {{2}}. Please join from your academy dashboard at the scheduled time.",
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
    "name": "demo_class_approved_staff_alert",
    "language": "en",
    "sourceAutomation": "Demo Class Approved - Staff",
    "body": "Hello {{1}}, demo class for {{2}} has been approved and scheduled for {{3}}. Coach: {{4}}. Please review the demo workflow in the academy portal.",
    "variables": [
      {
        "position": 1,
        "key": "staff_name",
        "sample": "Sayandeb"
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
      },
      {
        "position": 4,
        "key": "coach_name",
        "sample": "Coach Sanjib"
      }
    ]
  },
  {
    "name": "demo_class_reminder_student",
    "language": "en",
    "sourceAutomation": "Demo Class Reminder - Student",
    "body": "Hello {{1}}, reminder: your Envision Chess Academy demo class is {{2}}, scheduled for {{3}}. Please join from your academy dashboard at the scheduled time.",
    "variables": [
      {
        "position": 1,
        "key": "student_name",
        "sample": "Aarav"
      },
      {
        "position": 2,
        "key": "reminder_window",
        "sample": "in 1 hour"
      },
      {
        "position": 3,
        "key": "class_datetime",
        "sample": "27 Aug 2026, 6:00 PM IST"
      }
    ]
  },
  {
    "name": "demo_class_reminder_coach",
    "language": "en",
    "sourceAutomation": "Demo Class Reminder - Coach",
    "body": "Hello {{1}}, reminder: your demo class with {{2}} is {{3}}, scheduled for {{4}}. Please open the academy portal and be ready for the session.",
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
        "key": "reminder_window",
        "sample": "in 30 minutes"
      },
      {
        "position": 4,
        "key": "class_datetime",
        "sample": "27 Aug 2026, 6:00 PM IST"
      }
    ]
  },
  {
    "name": "demo_no_show_reschedule_admin",
    "language": "en",
    "sourceAutomation": "Demo No-Show - Admin",
    "body": "Hello {{1}}, {{2}} missed the assigned demo class scheduled for {{3}}. If this is the first missed demo, please reschedule it from the Demo Center.",
    "variables": [
      {
        "position": 1,
        "key": "admin_name",
        "sample": "Saptarshi"
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
    "name": "demo_no_show_sales_alert",
    "language": "en",
    "sourceAutomation": "Demo No-Show - Sales",
    "body": "Hello {{1}}, {{2}} missed the demo class scheduled for {{3}}. Please coordinate with Saptarshi to set a new timing and restart follow-up.",
    "variables": [
      {
        "position": 1,
        "key": "sales_name",
        "sample": "Sayandeb"
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
    "name": "demo_converted_staff_alert",
    "language": "en",
    "sourceAutomation": "Demo Converted - Staff",
    "body": "Hello {{1}}, {{2}} has been converted from demo to enrolled student. Course: {{3}}. Batch: {{4}}. Please review the student setup in the academy portal.",
    "variables": [
      {
        "position": 1,
        "key": "staff_name",
        "sample": "Sayantan"
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
        "key": "batch_name",
        "sample": "I2-100"
      }
    ]
  },
  {
    "name": "demo_class_assigned_coach",
    "language": "en",
    "sourceAutomation": "Demo Class Assigned - Coach",
    "body": "Hello {{1}}, a demo class with {{2}} has been assigned to you for {{3}}. Please open the academy portal to review the class details.",
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
    "language": "en",
    "sourceAutomation": "Booking Created - Student",
    "body": "Hello {{1}}, we received your demo class booking request for {{2}}. It is awaiting academy approval. We will update you once the booking is confirmed.",
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
    "name": "demo_booking_received_sales_alert",
    "language": "en",
    "sourceAutomation": "Booking Created - Sales",
    "body": "Hello {{1}}, {{2}} submitted a demo class booking request for {{3}}. Please review and follow up from the academy portal.",
    "variables": [
      {
        "position": 1,
        "key": "sales_name",
        "sample": "Sayandeb"
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
    "name": "class_booking_confirmed_student",
    "language": "en",
    "sourceAutomation": "Booking Created - Student",
    "body": "Hello {{1}}, your class booking is confirmed for {{2}}. Open the academy portal to view the class details.",
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
    "language": "en",
    "sourceAutomation": "Booking Created - Student",
    "body": "Hello {{1}}, your class booking request for {{2}} has been sent to the coach for approval. We will update you when the coach responds.",
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
    "language": "en",
    "sourceAutomation": "Booking Created - Coach",
    "body": "Hello {{1}}, a demo booking for {{2}} is awaiting academy approval for {{3}}. Open the portal to review the booking.",
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
    "language": "en",
    "sourceAutomation": "Booking Created - Coach",
    "body": "Hello {{1}}, a class with {{2}} is confirmed for {{3}}. Open the academy portal to view the booking details.",
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
    "language": "en",
    "sourceAutomation": "Booking Created - Coach",
    "body": "Hello {{1}}, {{2}} requested a class for {{3}}. Your response is required. Open the academy portal to approve the request or suggest another time.",
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
    "language": "en",
    "sourceAutomation": "Booking Created - Admin",
    "body": "Hello {{1}}, a demo booking for {{2}} with {{3}} requires academy approval. The requested time is {{4}}. Open the admin portal to review it.",
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
    "language": "en",
    "sourceAutomation": "Booking Created - Admin",
    "body": "Hello {{1}}, a class booking for {{2}} with {{3}} has been created for {{4}}. Open the admin portal to review the booking details.",
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
    "language": "en",
    "sourceAutomation": "Booking Updated",
    "body": "Hello {{1}}, the {{2}} booking for {{3}} at {{4}} has been approved. The classroom is now scheduled on the academy platform.",
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
    "language": "en",
    "sourceAutomation": "Booking Updated",
    "body": "Hello {{1}}, the {{2}} booking for {{3}} at {{4}} has been cancelled. Open the academy portal if you need to review the booking details.",
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
    "language": "en",
    "sourceAutomation": "Booking Updated",
    "body": "Hello {{1}}, a new time has been suggested for {{2}}\u2019s {{3}} booking: {{4}}. Open the academy portal to review the proposed time.",
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
    "language": "en",
    "sourceAutomation": "Classroom Schedule Change",
    "body": "Hello {{1}}, the class series \u201c{{2}}\u201d has been cancelled. All unfinished sessions in this series are cancelled on the academy platform.",
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
    "language": "en",
    "sourceAutomation": "Classroom Schedule Change",
    "body": "Hello {{1}}, the session for \u201c{{2}}\u201d scheduled on {{3}} has been cancelled. Open the academy portal to view the updated classroom schedule.",
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
    "language": "en",
    "sourceAutomation": "Classroom Schedule Change",
    "body": "Hello {{1}}, the session for \u201c{{2}}\u201d has been rescheduled from {{3}} to {{4}}. The updated timing is now available on the academy portal.",
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
    "language": "en",
    "sourceAutomation": "Classroom Schedule Change",
    "body": "Hello {{1}}, the schedule for \u201c{{2}}\u201d has been updated. Your next scheduled class is {{3}}. Please check the academy portal for the latest schedule.",
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
    "language": "en",
    "sourceAutomation": "Classroom Schedule Change",
    "body": "Hello {{1}}, the regular timing for \u201c{{2}}\u201d has been changed to {{3}} from {{4}} onward. The updated schedule is available on the academy portal.",
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
    "name": "substitute_coach_parent_notice",
    "language": "en",
    "sourceAutomation": "Substitute Coach Assigned - Parent",
    "body": "Dear Parents,\n\nWe would like to inform you that for {{1}} class on {{2}}, substitute coach {{3}} will be stepping in for Coach {{4}}, who is unavailable. Rest assured, the curriculum remains well-coordinated, ensuring a smooth learning experience for your child.\n\nThe class will be conducted through our user-friendly portal, providing a seamless and interactive session.\n\nRegards,\nTeam Envision Chess Academy",
    "variables": [
      {
        "position": 1,
        "key": "class_title",
        "sample": "I2-100"
      },
      {
        "position": 2,
        "key": "class_datetime",
        "sample": "today at 6:00 PM"
      },
      {
        "position": 3,
        "key": "substitute_coach_name",
        "sample": "Sanjib"
      },
      {
        "position": 4,
        "key": "original_coach_name",
        "sample": "Anirban"
      }
    ]
  },
  {
    "name": "substitute_class_assigned_coach",
    "language": "en",
    "sourceAutomation": "Substitute Coach Assigned - Coach",
    "body": "Hello Coach, you have been assigned to conduct a substitute class for {{1}}.\n\nPlease review the class details below before joining the session through the academy portal.\n\nBatch No: {{2}}\nTime: {{3}}\nDay: {{4}}\nDate: {{5}}\nTopic: {{6}}\nLevel: {{7}}\n\nKindly keep the session aligned with the ongoing curriculum so the student experience remains smooth.\n\nRegards,\nTeam Envision",
    "variables": [
      {
        "position": 1,
        "key": "date_label",
        "sample": "Today"
      },
      {
        "position": 2,
        "key": "batch_no",
        "sample": "I2-100"
      },
      {
        "position": 3,
        "key": "time",
        "sample": "6:00 PM"
      },
      {
        "position": 4,
        "key": "day",
        "sample": "Saturday"
      },
      {
        "position": 5,
        "key": "date",
        "sample": "5 Sep 2026"
      },
      {
        "position": 6,
        "key": "topic",
        "sample": "Knight Forks"
      },
      {
        "position": 7,
        "key": "level",
        "sample": "Intermediate"
      }
    ]
  },
  {
    "name": "batch_permanent_coach_changed_student",
    "language": "en",
    "sourceAutomation": "Batch Permanent Coach Change - Student/Parent",
    "body": "Hello {{1}}, Coach {{3}} will now be the permanent coach for {{2}}.\n\nCourse: {{4}}\nCourse Level: {{5}}\nTimings:\n{{6}}\n\nThe curriculum remains well-coordinated and classes will continue through the academy portal.\n\nRegards,\nTeam Envision Chess Academy",
    "variables": [
      {
        "position": 1,
        "key": "recipient_name",
        "sample": "Mr. Sharma"
      },
      {
        "position": 2,
        "key": "batch_code",
        "sample": "I2-100"
      },
      {
        "position": 3,
        "key": "coach_name",
        "sample": "Coach Sanjib"
      },
      {
        "position": 4,
        "key": "course_name",
        "sample": "Intermediate Chess"
      },
      {
        "position": 5,
        "key": "course_level",
        "sample": "I2"
      },
      {
        "position": 6,
        "key": "timings",
        "sample": "Saturday at 18:00 (60 min)"
      }
    ]
  },
  {
    "name": "batch_permanent_coach_assigned_coach",
    "language": "en",
    "sourceAutomation": "Batch Permanent Coach Change - Coach",
    "body": "Hello {{1}}, an ongoing batch has been permanently assigned to you.\n\nBatch Code: {{2}}\nCourse: {{3}}\nCourse Level: {{4}}\nTimings:\n{{5}}\nFirst Class Date: {{6}}\n\nPlease review the batch and classroom details in the academy portal.",
    "variables": [
      {
        "position": 1,
        "key": "coach_name",
        "sample": "Coach Sanjib"
      },
      {
        "position": 2,
        "key": "batch_code",
        "sample": "I2-100"
      },
      {
        "position": 3,
        "key": "course_name",
        "sample": "Intermediate Chess"
      },
      {
        "position": 4,
        "key": "course_level",
        "sample": "I2"
      },
      {
        "position": 5,
        "key": "timings",
        "sample": "Saturday at 18:00 (60 min)"
      },
      {
        "position": 6,
        "key": "first_class_date",
        "sample": "5 Sep 2026, 6:00 PM IST"
      }
    ]
  },
  {
    "name": "batch_new_assigned_coach",
    "language": "en",
    "sourceAutomation": "New Batch Assigned - Coach",
    "body": "Hello {{1}}, a new batch has been assigned to you.\n\nBatch Code: {{2}}\nCourse: {{3}}\nCourse Level: {{4}}\nTimings:\n{{5}}\nFirst Class Date: {{6}}\n\nPlease review the batch and classroom details in the academy portal.",
    "variables": [
      {
        "position": 1,
        "key": "coach_name",
        "sample": "Coach Sanjib"
      },
      {
        "position": 2,
        "key": "batch_code",
        "sample": "I2-100"
      },
      {
        "position": 3,
        "key": "course_name",
        "sample": "Intermediate Chess"
      },
      {
        "position": 4,
        "key": "course_level",
        "sample": "I2"
      },
      {
        "position": 5,
        "key": "timings",
        "sample": "Saturday at 18:00 (60 min)"
      },
      {
        "position": 6,
        "key": "first_class_date",
        "sample": "5 Sep 2026, 6:00 PM IST"
      }
    ]
  },
  {
    "name": "attendance_pending_coach",
    "language": "en",
    "sourceAutomation": "Attendance Reminder",
    "body": "Hello {{1}}, attendance is still pending for \u201c{{2}}\u201d, held on {{3}}. Please open the academy portal and complete the attendance record.",
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
    "language": "en",
    "sourceAutomation": "Invoice Sent - Student",
    "body": "Hello {{1}}, invoice {{2}} for {{3}} is now available. The amount due is {{4}}, with a due date of {{5}}. Use the button below to view the invoice.",
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
    "language": "en",
    "sourceAutomation": "Invoice Sent - Parent",
    "body": "Hello {{1}}, invoice {{2}} for {{3}} is now available. The amount due is {{4}}, with a due date of {{5}}. Use the button below to view the invoice.",
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
    "language": "en",
    "sourceAutomation": "Payment Recorded",
    "body": "Hello {{1}}, we have recorded your payment of {{2}} for invoice {{3}}. The payment reference is {{4}}. Thank you for completing the payment.",
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
    "language": "en",
    "sourceAutomation": "Payment Recorded",
    "body": "Hello {{1}}, we have recorded a payment of {{2}} for {{3}} against invoice {{4}}. The payment reference is {{5}}. Thank you.",
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
    "language": "en",
    "sourceAutomation": "Invoice Reminder",
    "body": "Hello {{1}}, this is a reminder that invoice {{2}} for {{3}} remains unpaid. The amount due is {{4}} and the due date is {{5}}. Please use the button below to review the invoice.",
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
    "language": "en",
    "sourceAutomation": "Monthly Invoice Reminder",
    "body": "Hello {{1}}, invoice {{2}} for {{3}} is due on {{4}}. The amount due is {{5}}. This is a reminder before the due date.",
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
    "language": "en",
    "sourceAutomation": "Monthly Invoice Reminder",
    "body": "Hello {{1}}, invoice {{2}} for {{3}} is due today, {{4}}. The amount due is {{5}}. Please review the invoice from the academy portal.",
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
    "language": "en",
    "sourceAutomation": "Monthly Invoice Reminder",
    "body": "Hello {{1}}, invoice {{2}} for {{3}} is overdue. The amount due is {{4}} and the original due date was {{5}}. Please review the pending invoice.",
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
    "language": "en",
    "sourceAutomation": "Monthly Invoice Reminder",
    "body": "Hello {{1}},\n\nInvoice of {{2}} for {{3}} is {{4}}.\nThe amount due is {{5}}. Please open the admin portal to review the invoice and follow up with the student.\n\n*Team Envision Chess Academy*",
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
    "name": "fee_credit_low_reminder",
    "language": "en",
    "sourceAutomation": "Fee Reminders",
    "body": "Hello {{1}}, {{2}} has {{3}} Envision Chess Academy class credit(s) remaining. Recharge is recommended before the balance is exhausted.",
    "variables": [
      { "position": 1, "key": "recipient_name", "sample": "Mr. Sharma" },
      { "position": 2, "key": "student_name", "sample": "Aarav" },
      { "position": 3, "key": "credit_balance", "sample": "2" }
    ]
  },
  {
    "name": "fee_credit_zero_final_class",
    "language": "en",
    "sourceAutomation": "Fee Reminders",
    "body": "Hello {{1}}, {{2}} has 0 normal class credits remaining. One final grace class is still available. Please recharge immediately to avoid interruption after that class.",
    "variables": [
      { "position": 1, "key": "recipient_name", "sample": "Mr. Sharma" },
      { "position": 2, "key": "student_name", "sample": "Aarav" }
    ]
  },
  {
    "name": "fee_credit_blocked",
    "language": "en",
    "sourceAutomation": "Fee Reminders",
    "body": "Hello {{1}}, {{2}} has used the final class allowance. Classroom access is paused until the class credit plan is recharged.",
    "variables": [
      { "position": 1, "key": "recipient_name", "sample": "Mr. Sharma" },
      { "position": 2, "key": "student_name", "sample": "Aarav" }
    ]
  },
  {
    "name": "fee_invoice_upcoming_reminder",
    "language": "en",
    "sourceAutomation": "Fee Reminders",
    "body": "Hello {{1}}, invoice {{3}} for {{2}} has an outstanding amount of {{4}} and is due on {{5}}. View invoice and payment details: {{6}}. Please complete payment by the due date.",
    "variables": [
      { "position": 1, "key": "recipient_name", "sample": "Mr. Sharma" },
      { "position": 2, "key": "student_name", "sample": "Aarav" },
      { "position": 3, "key": "invoice_number", "sample": "ENV-1042" },
      { "position": 4, "key": "amount", "sample": "₹2,500" },
      { "position": 5, "key": "due_date", "sample": "12 Sep 2026" },
      { "position": 6, "key": "invoice_url", "sample": "https://envisionchessacademy.com/invoice" }
    ]
  },
  {
    "name": "fee_invoice_overdue_reminder",
    "language": "en",
    "sourceAutomation": "Fee Reminders",
    "body": "Hello {{1}}, invoice {{3}} for {{2}} is overdue. The outstanding amount is {{4}} and the due date was {{5}}. View invoice and payment details: {{6}}. Please complete the outstanding payment promptly.",
    "variables": [
      { "position": 1, "key": "recipient_name", "sample": "Mr. Sharma" },
      { "position": 2, "key": "student_name", "sample": "Aarav" },
      { "position": 3, "key": "invoice_number", "sample": "ENV-1042" },
      { "position": 4, "key": "amount", "sample": "₹2,500" },
      { "position": 5, "key": "due_date", "sample": "31 Aug 2026" },
      { "position": 6, "key": "invoice_url", "sample": "https://envisionchessacademy.com/invoice" }
    ]
  },
  {
    "name": "class_credit_low",
    "language": "en",
    "sourceAutomation": "Credit Balance Reminder",
    "body": "Hello {{1}}, your Envision Chess Academy class credit balance is {{2}}. Please review your account before booking or attending additional credit-based classes.",
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
    "language": "en",
    "sourceAutomation": "Credit Balance Reminder",
    "body": "Hello {{1}}, your Envision Chess Academy class credit balance is now 0. Please update your credits before booking or attending additional credit-based classes.",
    "variables": [
      {
        "position": 1,
        "key": "student_name",
        "sample": "Aarav"
      }
    ]
  },
  {
    "name": "class_credit_empty_staff_alert",
    "language": "en",
    "sourceAutomation": "Credit Balance Reminder - Staff",
    "body": "Hello {{1}}, {{2}}'s class credit balance has reached zero. Please review the account and follow up for recharge before the next class.",
    "variables": [
      {
        "position": 1,
        "key": "staff_name",
        "sample": "Saptarshi"
      },
      {
        "position": 2,
        "key": "student_name",
        "sample": "Aarav"
      }
    ]
  },
  {
    "name": "tournament_registration_confirmed",
    "language": "en",
    "sourceAutomation": "Tournament External Registration",
    "body": "Hello {{1}}, your registration for \u201c{{2}}\u201d is confirmed. The tournament is scheduled for {{3}}. Use the button below to view the tournament details.",
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
    "language": "en",
    "sourceAutomation": "Tournament Lifecycle",
    "body": "Hello {{1}}, \u201c{{2}}\u201d starts soon at {{3}}. Please open the tournament page and be ready before the start time.",
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
    "language": "en",
    "sourceAutomation": "Tournament Lifecycle",
    "body": "Hello {{1}}, \u201c{{2}}\u201d has started. Open the tournament page to join or follow the event.",
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
    "language": "en",
    "sourceAutomation": "Tournament Lifecycle",
    "body": "Hello {{1}}, \u201c{{2}}\u201d has been completed. Results are now available on the tournament page.",
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
    "language": "en",
    "sourceAutomation": "Tournament Lifecycle",
    "body": "Hello {{1}}, the final result for \u201c{{2}}\u201d is available. Your final rank is {{3}}. Open the tournament page to view the standings.",
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
    "name": "course_assigned",
    "language": "en",
    "sourceAutomation": "New Course / Level Assigned",
    "body": "Hello {{1}}, a new course has been assigned to your Envision Chess Academy account: {{2}}, level {{3}}. Your first scheduled class is {{4}}.",
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
    "name": "achievement_earned_student",
    "language": "en",
    "sourceAutomation": "Achievement / Badge Earned",
    "body": "Hello {{1}}, a new achievement has been added to your Envision Chess Academy profile: \u201c{{2}}\u201d. Open your profile to view the achievement details.",
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
    "language": "en",
    "sourceAutomation": "Achievement / Badge Earned",
    "body": "Hello {{1}}, a new achievement has been added to {{2}}\u2019s Envision Chess Academy profile: \u201c{{3}}\u201d. Open the portal to view the achievement details.",
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
    "language": "en",
    "sourceAutomation": "Student No-Show Warning",
    "body": "Hello {{1}}, our records show that {{2}} did not join \u201c{{3}}\u201d on {{4}}. Credit status: {{5}}. Please review the class record on the academy portal.",
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
    "language": "en",
    "sourceAutomation": "Invoice Overdue Escalation",
    "body": "Hello {{1}}, action is required for invoice {{2}} for {{3}}. It is {{4}} days overdue and the outstanding amount is {{5}}. Please review the invoice from the academy portal.",
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
    "language": "en",
    "sourceAutomation": "Credit Added / Credit Removed",
    "body": "Hello {{1}}, {{2}} class credit(s) have been added to {{3}}\u2019s Envision Chess Academy account. The updated balance is {{4}} credits.",
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
    "language": "en",
    "sourceAutomation": "Credit Added / Credit Removed",
    "body": "Hello {{1}}, {{2}} class credit(s) have been removed from {{3}}\u2019s Envision Chess Academy account. The updated balance is {{4}} credits.",
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
    "language": "en",
    "sourceAutomation": "Class Completed Summary",
    "body": "Hello {{1}}, the class \u201c{{2}}\u201d has been completed. Topic covered: {{3}}. Homework/status: {{4}}. Open the academy portal to view the full class summary.",
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
    "language": "en",
    "sourceAutomation": "Homework Submitted Confirmation",
    "body": "Hello {{1}}, the homework submission for \u201c{{2}}\u201d has been received. Student: {{3}}. Submission time: {{4}}. Open the academy portal to view the submission details.",
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
    "language": "en",
    "sourceAutomation": "System Failure Alert",
    "body": "Hello {{1}}, an LMS automation failure requires attention.\n\nFailure: {{2}}\nReference: {{3}}\nError log: {{4}}\nEnvironment: {{5}}\nTime: {{6}}\n\nPlease review the system logs or admin alert details.",
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
        "key": "reference",
        "sample": "homework_email_reminders"
      },
      {
        "position": 4,
        "key": "error_log",
        "sample": "Webhook responded with status 500"
      },
      {
        "position": 5,
        "key": "environment",
        "sample": "production"
      },
      {
        "position": 6,
        "key": "timestamp",
        "sample": "25 Aug 2026, 12:05 AM IST"
      }
    ]
  }
] as const satisfies readonly WhatsAppTemplateDefinition[];

export const WHATSAPP_TEMPLATE_META_ALIASES: Record<string, string> = {
  class_credit_empty: "class_credit_balance_reaches_zero",
  invoice_due_admin_alert: "invoice_followup_alert",
};

export function resolveWhatsAppMetaTemplateName(name?: string) {
  const cleanName = String(name || "").trim();
  return WHATSAPP_TEMPLATE_META_ALIASES[cleanName] || cleanName;
}

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

export function renderWhatsAppTemplatePreview(name?: string, values: unknown[] = []) {
  const template = getWhatsAppTemplateDefinition(name);
  const body = template?.body || String(name || "WhatsApp template").replace(/_/g, " ");
  return body.replace(/\{\{\s*(\d+)\s*\}\}/g, (_match, index) => {
    const value = values[Number(index) - 1];
    return value === undefined || value === null || value === "" ? `{{${index}}}` : String(value);
  });
}

