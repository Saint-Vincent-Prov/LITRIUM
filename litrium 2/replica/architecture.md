# Architecture

- Vite + React 19 + TypeScript + React Router 7; plain CSS with tokens; liquid glass layer.
- `src/data/api.ts`: async functions over a localStorage store (`atrium-hub-v1`), the contract a
  backend will implement. `?fail=1` makes every call fail, `?slow=1` slows them.
- `src/data/weather.ts`: real data from Open-Meteo (forecast + geocoding, free, no key) and
  BigDataCloud client reverse geocoding for the name of "my position". Runs from the user's browser.
- `src/lib/assistant.ts`: French intent parser (reminder, alarm, event, note, message, weather,
  agenda, help) + date/time parser. Falls back to the Claude Messages API when the user saved a key
  (`anthropic-dangerous-direct-browser-access` header; key never leaves their browser except to Anthropic).
- `src/app/Ringer.tsx`: checks alarms and reminders every second while the app is open; WebAudio
  tone, ringing dialog with snooze/stop, browser notification if allowed.
- Simulated friends: a small directory of demo accounts; adding one of those emails makes an
  instant friend, any other email becomes a pending invitation. Friends reply after a short delay.

Build order: data layer → shell/nav → home → assistant (touches every module) → alarms + ringer →
calendar → notes/reminders → weather → friends/messages → settings.
