import { zoned } from "../lib/time";

/** Glassy analog clock; hands move every second. */
export function AnalogClock({ date, tz, size = "md", label }: { date: Date; tz: string; size?: "sm" | "md" | "lg"; label: string }) {
  const z = zoned(date, tz);
  const sec = z.s;
  const min = z.mi + sec / 60;
  const hour = (z.h % 12) + min / 60;
  return (
    <svg className={`aclock aclock--${size}`} viewBox="0 0 100 100" role="img" aria-label={label}>
      <circle className="aclock__face" cx="50" cy="50" r="47" />
      {Array.from({ length: 12 }, (_, i) => (
        <line key={i} className={i % 3 === 0 ? "aclock__tick aclock__tick--major" : "aclock__tick"} x1="50" y1={i % 3 === 0 ? 8 : 9.5} x2="50" y2={i % 3 === 0 ? 15 : 13} transform={`rotate(${i * 30} 50 50)`} />
      ))}
      <line className="aclock__hand aclock__hand--hour" x1="50" y1="54" x2="50" y2="28" transform={`rotate(${hour * 30} 50 50)`} />
      <line className="aclock__hand aclock__hand--min" x1="50" y1="56" x2="50" y2="17" transform={`rotate(${min * 6} 50 50)`} />
      {size !== "sm" && <line className="aclock__hand aclock__hand--sec" x1="50" y1="60" x2="50" y2="13" transform={`rotate(${sec * 6} 50 50)`} />}
      <circle className="aclock__pin" cx="50" cy="50" r={size === "sm" ? 3 : 2.6} />
    </svg>
  );
}
