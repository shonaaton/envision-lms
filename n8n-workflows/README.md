# n8n Email Automation Setup

This folder contains the n8n workflow used by the LMS for:

- Ask Coach email alerts
- Password reset emails
- Future general LMS email automation

## Files

- `lms-email-automation.json` - the main workflow that receives LMS webhook requests and sends branded emails through Gmail

## Payload format

The LMS sends JSON like this:

```json
{
  "to": "student@example.com",
  "subject": "Message from your coach",
  "message": "Hello from Envision Chess Academy",
  "metadata": {
    "kind": "ask_coach"
  }
}
```

Password reset emails also include:

```json
{
  "metadata": {
    "kind": "password_reset",
    "resetUrl": "https://your-lms/reset-password?token=..."
  }
}
```

## Import into n8n

1. Open your n8n workspace.
2. Use **Import from File**.
3. Import `lms-email-automation.json`.
4. Open the `Send Email` node.
5. Create or select your Gmail OAuth credential.
6. Save the workflow.
7. Activate the workflow.

After activation, the production webhook URL should be:

```text
https://n8n.envisionchessacademy.com/webhook/lms-email-automation
```

## LMS environment values

Put both webhook variables in your LMS `.env` file:

```env
ASK_COACH_EMAIL_WEBHOOK_URL="https://n8n.envisionchessacademy.com/webhook/lms-email-automation"
EMAIL_AUTOMATION_WEBHOOK_URL="https://n8n.envisionchessacademy.com/webhook/lms-email-automation"
```

Both can point to the same workflow. The payload already tells n8n what kind of email it is sending.

## Unread Ask Coach reminders

Ask Coach messages now notify the recipient inside the LMS first. If the recipient reads the
message within the grace period, no email is sent. The default grace period is five minutes and
can be changed with `ASK_COACH_UNREAD_EMAIL_DELAY_MINUTES`.

The deployed LMS checks overdue reminders automatically every minute. As an optional second
safeguard, you can also create an n8n Schedule Trigger that runs every minute and makes a GET
request to:

```text
https://classroom.envisionchessacademy.com/api/ask-coach/email-reminders
```

Send this header, using the same secret configured in the LMS `.env` file:

```text
x-cron-secret: YOUR_ASK_COACH_REMINDER_SECRET
```

The LMS schedules each reminder immediately, runs a background check every minute, and checks
overdue reminders during normal Ask Coach activity. The n8n trigger is therefore optional.

## VPS update steps

On the VPS:

1. Open the LMS `.env` file.
2. Add the two webhook values above.
3. Save the file.
4. Redeploy the LMS:

```bash
cd /opt/envision-lms
git pull origin main
bash scripts/deploy.sh
```

## Quick test

After the workflow is active, send a test request:

```bash
curl -X POST "https://n8n.envisionchessacademy.com/webhook/lms-email-automation" \
  -H "Content-Type: application/json" \
  -d '{
    "to":"you@example.com",
    "subject":"Test from Envision LMS",
    "message":"Hello from the LMS email webhook.",
    "metadata":{"kind":"manual_test"}
  }'
```

Expected response:

```json
{"ok":true,"delivered":true}
```

## Notes

- The workflow must be active before the production webhook URL works.
- If you want different sender details, edit the reply-to default in the `Prepare Email` code node.
- The Gmail node should not include an empty attachment field. If n8n shows an attachment mapping with no binary property, remove it before activating the workflow.
