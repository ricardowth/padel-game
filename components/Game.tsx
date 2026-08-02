"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { loadTourData } from "../lib/data/load";
import type { Pace, Tour } from "../lib/data/types";
import { CareerEngine, type CreatePlayerInput } from "../lib/sim/career";
import type { DecisionCard, DecisionResolution, TournamentOutcome } from "../lib/sim/types";
import { CareerBoard } from "./CareerBoard";
import { PlayerCreator } from "./PlayerCreator";
import { ResultCard } from "./ResultCard";

type Phase = "creator" | "board" | "result";

/** Milliseconds between two results appearing in the feed. */
const REVEAL_MS = 90;
/** A season is worth watching; a whole career of them is not. Cap the wait. */
const MAX_SEASON_REVEAL_MS = 2600;

/**
 * Owns the career for its whole lifetime.
 *
 * The engine is a mutable object held in a ref, and React is told to re-render
 * with a tick counter rather than by cloning state — a CareerState carries the
 * whole 19-season history plus every tournament result, and copying it on each
 * of the ~40 interactions in a career would be pure waste. Nothing outside this
 * file mutates it.
 *
 * Creator, board and result are phases of one route on purpose: the career is
 * deliberately in-memory only (§13), so routing between them would throw it away.
 */
export function Game({ tour, pace }: { tour: Tour; pace: Pace }) {
  const t = useTranslations("board");

  const engineRef = useRef<CareerEngine | null>(null);
  const [, tick] = useReducer((n: number) => n + 1, 0);

  const [phase, setPhase] = useState<Phase>("creator");
  const [pending, setPending] = useState<DecisionCard | null>(null);
  const [resolution, setResolution] = useState<DecisionResolution | null>(null);
  const [busy, setBusy] = useState(false);

  /** Results still waiting to appear, and the ones already shown. */
  const queueRef = useRef<TournamentOutcome[]>([]);
  const [revealed, setRevealed] = useState<TournamentOutcome[]>([]);
  const [streaming, setStreaming] = useState(false);
  /** Held back until the feed finishes, so the decision does not pre-empt it. */
  const heldRef = useRef<{ card: DecisionCard | null; done: boolean } | null>(null);

  /** Shows everything at once and hands over whatever the engine was holding. */
  const flush = useCallback(() => {
    const all = queueRef.current;
    queueRef.current = [];
    setRevealed((shown) => (shown.length === all.length ? shown : all));
    setStreaming(false);

    const held = heldRef.current;
    heldRef.current = null;
    if (held) {
      setPending(held.card);
      if (held.done) setPhase("result");
    }
    tick();
  }, []);

  // Drip the season's results in. Cheap enough that a timer per result is fine,
  // and it stops the moment the player skips.
  useEffect(() => {
    if (!streaming) return;

    if (revealed.length >= queueRef.current.length) {
      flush();
      return;
    }

    const step = Math.max(
      16,
      Math.min(REVEAL_MS, MAX_SEASON_REVEAL_MS / Math.max(1, queueRef.current.length)),
    );
    const timer = setTimeout(() => {
      setRevealed(queueRef.current.slice(0, revealed.length + 1));
    }, step);

    return () => clearTimeout(timer);
  }, [flush, revealed.length, streaming]);

  /** Runs the sim forward, then plays back whatever it simulated. */
  const runForward = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;

    const { log, pending: next, done } = engine.advance();

    const played = log.flatMap((entry) =>
      entry.kind === "tournament" ? [entry.outcome] : [],
    );

    if (played.length === 0) {
      setRevealed([]);
      setPending(next);
      if (done) setPhase("result");
      tick();
      return;
    }

    queueRef.current = played;
    heldRef.current = { card: next, done };
    setRevealed([]);
    setPending(null);
    setStreaming(true);
    tick();
  }, []);

  const start = useCallback(
    async (input: CreatePlayerInput, seed: string) => {
      setBusy(true);
      try {
        const data = await loadTourData(tour);
        engineRef.current = new CareerEngine({ data, seed, pace, input });
        setPhase("board");
        runForward();
      } finally {
        setBusy(false);
      }
    },
    [pace, runForward, tour],
  );

  const choose = useCallback(
    (optionId: string) => {
      const engine = engineRef.current;
      if (!engine || !pending) return;

      engine.choose(optionId);

      // The engine records what actually happened; surface it before moving on.
      setResolution(engine.lastResolution);
      setPending(null);
      tick();
    },
    [pending],
  );

  const acknowledge = useCallback(() => {
    setResolution(null);
    runForward();
  }, [runForward]);

  if (phase === "creator" || !engineRef.current) {
    return <PlayerCreator tour={tour} busy={busy} onConfirm={start} />;
  }

  const engine = engineRef.current;

  if (phase === "result") {
    return <ResultCard engine={engine} />;
  }

  return (
    <CareerBoard
      engine={engine}
      pending={pending}
      resolution={resolution}
      feed={streaming ? revealed : null}
      onSkip={flush}
      onChoose={choose}
      onAcknowledge={acknowledge}
      simulatingLabel={t("simulating")}
    />
  );
}
