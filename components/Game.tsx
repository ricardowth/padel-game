"use client";

import { useCallback, useReducer, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { loadTourData } from "../lib/data/load";
import type { Pace, Tour } from "../lib/data/types";
import { CareerEngine, type CreatePlayerInput } from "../lib/sim/career";
import type { DecisionCard, DecisionResolution } from "../lib/sim/types";
import { CareerBoard } from "./CareerBoard";
import { PlayerCreator } from "./PlayerCreator";
import { ResultCard } from "./ResultCard";

type Phase = "creator" | "board" | "result";

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

  /** Runs the sim forward until it needs a human, or the career ends. */
  const runForward = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;

    const { pending: next, done } = engine.advance();
    setPending(next);
    if (done) setPhase("result");
    tick();
  }, []);

  const start = useCallback(
    async (input: CreatePlayerInput, seed: string) => {
      setBusy(true);
      try {
        const data = await loadTourData(tour);
        engineRef.current = new CareerEngine({ data, seed, pace, input });
        setPhase("board");
        // First advance runs the opening season and surfaces the first card.
        const { pending: next, done } = engineRef.current.advance();
        setPending(next);
        if (done) setPhase("result");
        tick();
      } finally {
        setBusy(false);
      }
    },
    [pace, tour],
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
      onChoose={choose}
      onAcknowledge={acknowledge}
      simulatingLabel={t("simulating")}
    />
  );
}
