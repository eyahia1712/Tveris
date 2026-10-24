"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export const REPLAY_SPEEDS = [1, 2, 4, 8] as const;
export type ReplaySpeed = (typeof REPLAY_SPEEDS)[number];

/** At 1x the whole run replays in this long, however long it really took. */
const BASE_REPLAY_MS = 14_000;

export interface Replay {
  active: boolean;
  playing: boolean;
  t: number;
  endMs: number;
  speed: ReplaySpeed;
  toggle(): void;
  seek(t: number): void;
  setSpeed(speed: ReplaySpeed): void;
  stop(): void;
}

/**
 * Replays a run: the map grows email by email in the order they were
 * processed. `t` is run time in ms; null-active means "show everything".
 */
export function useReplay(endMs: number): Replay {
  const [active, setActive] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0);
  const [speed, setSpeed] = useState<ReplaySpeed>(1);
  const last = useRef<number | null>(null);
  const span = Math.max(endMs, 1);

  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    const step = (now: number) => {
      const previous = last.current ?? now;
      last.current = now;
      const advance = ((now - previous) * speed * span) / BASE_REPLAY_MS;
      setT((current) => {
        const next = current + advance;
        if (next >= span) {
          setPlaying(false);
          return span;
        }
        return next;
      });
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(frame);
      last.current = null;
    };
  }, [playing, speed, span]);

  const toggle = useCallback(() => {
    if (playing) {
      setPlaying(false);
      return;
    }
    setActive(true);
    setT((current) => (current >= span ? 0 : current));
    setPlaying(true);
  }, [playing, span]);

  const seek = useCallback((next: number) => {
    setActive(true);
    setT(Math.min(Math.max(next, 0), span));
  }, [span]);

  const stop = useCallback(() => {
    setPlaying(false);
    setActive(false);
    setT(0);
  }, []);

  return { active, playing, t, endMs: span, speed, toggle, seek, setSpeed, stop };
}
