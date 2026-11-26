# Build log

Target: finance dashboard SaaS (working name Atrium), from the user's "SaaS à 4 000 €" mockup.
No live product existed to recon, so `recon.md` is a product spec written from the mockup.
Data layer is fake (localStorage, `src/data/api.ts`); swap via /replica-backend.

| ID  | Date       | Status  | Missing | Harder than expected |
|-----|------------|---------|---------|----------------------|
| Shell | 2026-11-26 | done | — | Background-location modal routes (send/receive open over the current page, and also work as direct links) |
| S02 Overview | 2026-11-26 | done | — | SVG chart took a square intrinsic height inside flex and blew up the grid rows; pinned to token height |
| S05 Send money | 2026-11-26 | done | real transfers (needs a banking partner API) | Focus landed on the close button because fields mount after accounts load |
| S03 Activity | 2026-11-26 | done | date-range filter | sr-only text inside truncated rows escaped its clip and caused 24px overflow at 390px |
| S04 Transaction detail | 2026-11-26 | done | attachments / receipts | — |
| S06 Receive | 2026-11-26 | done | QR code, payment links | — |
| S07 Cards | 2026-11-26 | done | physical card ordering, PIN | Freeze toggle snapped back until refetch; made optimistic |
| S08 Savings | 2026-11-26 | done | withdraw from a goal, edit/delete goal | — |
| S09 Reports | 2026-11-26 | done | PDF export, accountant sharing | — |
| S10 Settings | 2026-11-26 | partial | display currency is saved but amounts still render in EUR | — |
| S01 Sign in | 2026-11-26 | done | sign-up, password reset, 2FA (backend) | — |
| S11 404 | 2026-11-26 | done | — | — |

Checks: `npm run build` clean (strict TS); Playwright click-through of F1–F7 passes;
no console errors; no horizontal overflow at 390px; screenshots in `replica/clone-screens/`.
| Glass restyle | 2026-11-26 | done | — | CSS minifier merged prefixed/standard backdrop-filter and kept only -webkit-, so Chrome showed no blur; glass recipe also overrode fixed/absolute positioning of nav and menu |

## Pivot to personal hub (2026-11-26)
Finance screens removed. New screens, all done: S02 home, S03 weather, S04 agenda, S05 alarms, S06 assistant, S07/S08 friends & messages, S09 notes & reminders, S10 settings.

| Item | Status | Missing | Harder than expected |
|------|--------|---------|----------------------|
| Weather | done | — | Can't reach the APIs from the build sandbox; tests mock Open-Meteo |
| Assistant | done | free chat needs an API key | JS `\b` fails next to accented letters ("à Lyon" was ignored) |
| Alarms | done | ringing when the app is closed (needs a native app or push server) | Snooze/stop state machine; verified with a fake clock |
| Friends & messages | partial | real delivery between people (backend + realtime) | — |
| Mobile | done | — | Nav-label CSS hid the icons once they were wrapped in a span |

## Accounts + open-ended AI (2026-11-26)
| Item | Status | Missing | Harder than expected |
|------|--------|---------|----------------------|
| S00 welcome / signup, S01 sign-in tab | done | password reset (needs e-mail sending = backend) | Sign-out raced the auth guard and landed on signup instead of login |
| Google / Apple | partial | client IDs from the owner; Apple needs paid developer account + https; server-side token verification | — |
| AI relay `/api/ai/chat` | done (tested on mock) | a real ANTHROPIC_API_KEY | Command detection had to be tightened so general questions mentioning "réveil", "programme"… reach Claude |
