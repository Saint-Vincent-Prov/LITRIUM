import { useEffect, useRef, useState } from "react";
import { getUser, markAlarmRang, markReminderNotified, peekAlarms, peekReminders } from "../data/api";
import type { Alarm } from "../data/types";
import { Icon } from "../ui/Icon";
import { Modal } from "../ui/Overlay";
import { Button } from "../ui/primitives";
import { useToast } from "../ui/Toast";
import { notify as appNotify } from "../lib/notifications";

const minuteKey = (d: Date) => d.toISOString().slice(0, 16);
const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

/** A gentle two-tone chime, repeated until stopped. */
export function startChime(): () => void {
  let ctx: AudioContext | null = null;
  let timer: number | undefined;
  try {
    ctx = new AudioContext();
    const ring = () => {
      if (!ctx) return;
      [0, 0.25].forEach((offset, i) => {
        const o = ctx!.createOscillator();
        const g = ctx!.createGain();
        o.type = "sine";
        o.frequency.value = i ? 880 : 660;
        const t = ctx!.currentTime + offset;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.25, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
        o.connect(g).connect(ctx!.destination);
        o.start(t);
        o.stop(t + 0.65);
      });
    };
    ring();
    timer = window.setInterval(ring, 1400);
  } catch {
    /* no audio available */
  }
  return () => {
    window.clearInterval(timer);
    ctx?.close().catch(() => {});
  };
}

function notify(title: string, body: string) {
  getUser().then((u) => {
    if (u.notifications && "Notification" in window && Notification.permission === "granted") {
      try {
        new Notification(title, { body });
      } catch {
        /* some browsers need a service worker */
      }
    }
  });
}

export function shouldRing(a: Alarm, now: Date) {
  if (!a.enabled) return false;
  if (a.snoozedUntil) return now >= new Date(a.snoozedUntil) && a.lastRang !== `snz-${a.snoozedUntil}`;
  if (a.time !== hhmm(now)) return false;
  if (a.days.length && !a.days.includes(now.getDay())) return false;
  return a.lastRang !== minuteKey(now);
}

/** Watches alarms and reminders while the app is open. */
export function Ringer() {
  const [ringing, setRinging] = useState<Alarm | null>(null);
  const stopSound = useRef<(() => void) | null>(null);
  const toast = useToast();

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      if (!ringing) {
        const a = peekAlarms().find((x) => shouldRing(x, now));
        if (a) {
          markAlarmRang(a.id, a.snoozedUntil ? `snz-${a.snoozedUntil}` : minuteKey(now));
          setRinging({ ...a });
          stopSound.current = startChime();
          notify(`⏰ ${a.label}`, `Il est ${a.time.replace(":", "h")}`);
          appNotify({ kind: "alarm", title: `Alarme : ${a.label}`, body: `Il est ${a.time.replace(":", "h")}`, link: "/alarmes" }, undefined, { browser: false });
        }
      }
      for (const r of peekReminders()) {
        if (!r.done && !r.notified && r.due && new Date(r.due) <= now) {
          markReminderNotified(r.id);
          toast(`Rappel : ${r.text}`);
          notify("Rappel", r.text);
          appNotify({ kind: "reminder", title: "Rappel", body: r.text, link: "/notes?vue=rappels" }, `reminder:${r.id}`, { browser: false });
        }
      }
    };
    tick();
    const t = window.setInterval(tick, 1000);
    return () => window.clearInterval(t);
  }, [ringing, toast]);

  useEffect(() => () => stopSound.current?.(), []);

  if (!ringing) return null;

  const finish = (snooze: boolean) => {
    stopSound.current?.();
    stopSound.current = null;
    markAlarmRang(ringing.id, minuteKey(new Date()), snooze ? { snoozeMinutes: 9 } : { stop: true });
    setRinging(null);
    if (snooze) toast("Alarme repoussée de 9 minutes.");
  };

  return (
    <Modal
      title={ringing.label}
      onClose={() => finish(false)}
      footer={
        <>
          <Button onClick={() => finish(true)}>Répéter dans 9 min</Button>
          <Button variant="ink" onClick={() => finish(false)} autoFocus>
            Arrêter
          </Button>
        </>
      }
    >
      <div className="ringing" role="alert">
        <span className="ringing__icon">
          <Icon name="alarm" />
        </span>
        <p className="ringing__time">{hhmm(new Date())}</p>
      </div>
    </Modal>
  );
}
