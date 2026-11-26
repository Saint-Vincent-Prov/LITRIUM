# Product spec: personal hub ("Atrium", working name)

Pivot (2026-11-26): the finance dashboard was replaced at the user's request by a
personal hub in the same liquid glass style. No existing app is being cloned;
this is our own spec.

## Screen inventory

| ID  | Route                | Purpose | States |
|-----|----------------------|---------|--------|
| S01 | /connexion           | Sign in (demo auth) | default, error, loading |
| S02 | /                    | Home: weather now, today's agenda, next alarm, reminders due, unread messages, ask the assistant | loading, filled, empty sections, weather denied/offline |
| S03 | /meteo               | Weather: my location + saved cities, hourly 24 h, 7 days; search & add/remove cities | locating, denied, offline/error, empty cities, search no results |
| S04 | /agenda              | Calendar: month grid, day agenda, create/edit/delete events | empty day, filled, long titles |
| S05 | /alarmes             | Alarms: create/edit/delete, on/off, repeat days, ring + snooze/stop | empty, filled, ringing |
| S06 | /assistant           | Personal assistant chat: creates reminders, alarms, events, notes, messages; answers weather & agenda; optional Claude API key for free chat | empty (suggestions), thinking, error |
| S07 | /messages            | Friends + conversations: add friend by email, accept/decline requests, list of chats | empty, pending requests, no match |
| S08 | /messages/:friendId  | Conversation thread | empty thread, sending, long messages |
| S09 | /notes               | Notes (pinned, search, editor) + reminders (due date, done) | empty, filled, overdue |
| S10 | /parametres          | Profile, temperature unit, AI key, notifications, demo reset | saved, error |
| S11 | *                    | Not found | – |

## Flows
- F1 assistant loop: type "rappelle-moi d'appeler Léa demain à 9h" → reminder created → visible on S09 and S02.
- F2 alarm: create 07:30 weekdays → toggle → ringing modal at time → snooze 9 min / stop.
- F3 calendar: pick a day → new event → shows on S04 and S02 (if today).
- F4 weather: allow location → current conditions; search "Lyon" → add → appears in list.
- F5 friends: add by email → if the address belongs to a demo account it becomes a friend (or a pending invitation otherwise) → open chat → send message → simulated reply.
- F6 notes: create, pin, edit, delete; reminders: add, tick done.

## Data model
- `User { id, name, email, unit: "C"|"F", aiKey?, notifications }`
- `Friend { id, name, email, status: "friend"|"pending_out"|"pending_in", since }`
- `Message { id, friendId, from: "me"|"them", text, at, read }`
- `CalEvent { id, title, start, end, allDay, color, location?, note? }`
- `Alarm { id, time "HH:MM", days: number[] (0=Sun), label, enabled, snoozedUntil? }`
- `Note { id, title, body, pinned, updatedAt }`
- `Reminder { id, text, due?, done, notified }`
- `City { id, name, admin?, country, lat, lon }`

## Limits of the demo (needs /replica-backend)
- Friends and messages live in this browser only; real delivery between two people needs a server (accounts, realtime).
- Alarms and reminders ring only while the app is open in a tab.
- Free-form assistant chat needs an Anthropic API key (stored in this browser only).
