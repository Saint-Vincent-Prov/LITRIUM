/** Our own line icon set: 24px grid, 1.75 stroke. */
const paths: Record<string, string> = {
  home: "M4 11.5 12 5l8 6.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z",
  activity: "M3 12h4l2.5-6 5 12 2.5-6h4",
  card: "M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 10h18M7 15h4",
  piggy: "M5 11a7 6 0 0 1 12.5-3.5L20 7v4l1.5 1-1.5 2.5h-2L16 18h-2.5l-.5-1.5h-3L9.5 18H7l-.5-3A6 6 0 0 1 5 11zM15 10h.01",
  chart: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12a7 7 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2-1.2L14 3h-4l-.5 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7 7 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2 1.2L10 21h4l.5-2.6a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.07-.4.1-.8.1-1.2z",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-5-5",
  bell: "M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15zM10 21h4",
  send: "M12 19V5M6 11l6-6 6 6",
  receive: "M12 5v14M6 13l6 6 6-6",
  plus: "M12 5v14M5 12h14",
  close: "M6 6l12 12M18 6 6 18",
  chevronLeft: "M15 6l-6 6 6 6",
  chevronRight: "M9 6l6 6-6 6",
  chevronDown: "M6 9l6 6 6-6",
  download: "M12 4v11M7 10l5 5 5-5M5 20h14",
  copy: "M9 9h10v11H9zM5 15H4V4h11v1",
  check: "M5 12.5 10 17l9-10",
  snow: "M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M9.5 4.5 12 6l2.5-1.5M9.5 19.5 12 18l2.5 1.5",
  alert: "M12 4 2.5 20h19zM12 10v4M12 17h.01",
  inbox: "M3 13h5l1.5 3h5L16 13h5M5 5h14l2 8v6H3v-6z",
  logout: "M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10",
  arrowUpRight: "M7 17 17 7M8 7h9v9",
  arrowDownRight: "M7 7l10 10M17 8v9H8",
  filter: "M4 5h16l-6 8v5l-4 2v-7z",
  target: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 12h.01",
  sun: "M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
  partly: "M8 3v1.5M3.5 8H2M4.8 4.8l1 1M10.5 9.2A3.5 3.5 0 0 0 4.6 10M8 19h9a4 4 0 0 0 .5-7.97A5.5 5.5 0 0 0 7 12.5 3.3 3.3 0 0 0 8 19z",
  cloud: "M7 19h10a4.5 4.5 0 0 0 .6-8.96A6 6 0 0 0 6 11a4 4 0 0 0 1 8z",
  fog: "M4 10h16M3 14h18M5 18h14M7 6h10",
  rain: "M7 15h10a4 4 0 0 0 .5-7.97A5.5 5.5 0 0 0 6 8.5 3.3 3.3 0 0 0 7 15zM8 18l-1 3M12 18l-1 3M16 18l-1 3",
  snowflake: "M12 2v20M3.3 7l17.4 10M3.3 17 20.7 7M9 4l3 2 3-2M9 20l3-2 3 2",
  storm: "M7 14h10a4 4 0 0 0 .5-7.97A5.5 5.5 0 0 0 6 7.5 3.3 3.3 0 0 0 7 14zM12 14l-2 4h4l-2 4",
  moon: "M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z",
  calendar: "M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM4 10h16M8 2v4M16 2v4",
  alarm: "M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM12 9v4l2.5 2M3 5l3-2.5M21 5l-3-2.5",
  sparkle: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z",
  chat: "M4 5h16v11H9l-5 4z",
  note: "M6 3h9l5 5v13H6zM14 3v6h6M9 13h7M9 17h5",
  users: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21a7 7 0 0 1 14 0M16 3.5a4 4 0 0 1 0 7.5M18 14a6 6 0 0 1 4 7",
  userPlus: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21a7 7 0 0 1 14 0M19 8v6M16 11h6",
  pin: "M9 3h6l-1 6 4 4H6l4-4zM12 13v8",
  trash: "M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6M14 11v6",
  edit: "M4 20h4L19 9l-4-4L4 16zM14 6l4 4",
  location: "M12 21s-7-6.2-7-11a7 7 0 1 1 14 0c0 4.8-7 11-7 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  paperPlane: "M21 3 10 14M21 3l-7 18-4-7-7-4z",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2",
  wind: "M3 8h11a3 3 0 1 0-3-3M3 12h16a3 3 0 1 1-3 3M3 16h8",
  drop: "M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z",
  bellOff: "M6 16V11a6 6 0 0 1 9.5-4.9M18 11v5l1.5 2H8M10 21h4M3 3l18 18",
  arrowLeft: "M19 12H5M11 6l-6 6 6 6",
};

export type IconName = keyof typeof paths;

export function Icon({ name, size }: { name: IconName; size?: string }) {
  return (
    <svg
      className="icon"
      viewBox="0 0 24 24"
      style={size ? { width: size, height: size } : undefined}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={paths[name]} />
    </svg>
  );
}
