import { describe } from "../data/weather";
import { Icon, type IconName } from "./Icon";

const MAP: Record<string, IconName> = {
  sun: "sun",
  partly: "partly",
  cloud: "cloud",
  fog: "fog",
  rain: "rain",
  snow: "snowflake",
  storm: "storm",
};

export function WeatherGlyph({ code, isDay = true, size }: { code: number; isDay?: boolean; size?: string }) {
  const d = describe(code);
  const name: IconName = !isDay && (d.icon === "sun" || d.icon === "partly") ? "moon" : MAP[d.icon];
  return (
    <span className={`wglyph wglyph--${d.icon}`} title={d.label}>
      <Icon name={name} size={size} />
    </span>
  );
}
