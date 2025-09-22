// src/components/Timer.jsx
import { useEffect, useRef, useState } from 'react';
import { supabase } from '../supabaseClient';

function fmt(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

// Converte a lista de eventos em estado de timer
function reduceEvents(events) {
  let baseElapsedMs = 0;       // soma dos períodos já “fechados”
  let running = false;
  let lastStartMs = null;

  for (const e of events) {
    const t = new Date(e.ts).getTime();
    if (e.event_type === 'timer_start' || e.event_type === 'timer_resume') {
      running = true;
      lastStartMs = t;
    } else if (
      e.event_type === 'timer_pause' ||
      e.event_type === 'timer_stop' ||
      e.event_type === 'finish'
    ) {
      if (running && lastStartMs != null) {
        baseElapsedMs += t - lastStartMs;
      }
      running = false;
      lastStartMs = null;
    }
  }
  return { baseElapsedMs, running, lastStartMs };
}

export default function Timer({ matchId }) {
  const [displayMs, setDisplayMs] = useState(0);
  const [running, setRunning] = useState(false);
  const [baseElapsedMs, setBaseElapsedMs] = useState(0);
  const [lastStartMs, setLastStartMs] = useState(null);
  const tickRef = useRef(null);
  const channelRef = useRef(null);

  const computeNow = (base, run, last) =>
    base + (run && last != null ? Date.now() - last : 0);

  const load = async () => {
    const { data, error } = await supabase
      .from('match_events')
      .select('ts, event_type')
      .eq('match_id', matchId)
      .in('event_type', ['timer_start', 'timer_pause', 'timer_resume', 'timer_stop', 'finish'])
      .order('ts', { ascending: true });

    if (error) {
      console.error('Timer load error:', error);
      return;
    }

    const { baseElapsedMs, running, lastStartMs } = reduceEvents(data || []);
    setBaseElapsedMs(baseElapsedMs);
    setRunning(running);
    setLastStartMs(lastStartMs);
    setDisplayMs(computeNow(baseElapsedMs, running, lastStartMs));
  };

  // Carrega e assina Realtime
  useEffect(() => {
    load();

    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    const channel = supabase
      .channel(`timer-${matchId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'match_events', filter: `match_id=eq.${matchId}` },
        () => load()
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    };
  }, [matchId]);

  // Tick de 1s enquanto estiver rodando (recalcula com base no “agora”)
  useEffect(() => {
    if (running) {
      tickRef.current = setInterval(() => {
        setDisplayMs(computeNow(baseElapsedMs, running, lastStartMs));
      }, 1000);
    } else if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
      tickRef.current = null;
    };
  }, [running, baseElapsedMs, lastStartMs]);

  // Corrige rapidamente ao voltar a aba para frente
  useEffect(() => {
    const onVis = () => {
      setDisplayMs(computeNow(baseElapsedMs, running, lastStartMs));
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [baseElapsedMs, running, lastStartMs]);

  return <span className="text-sm text-gray-500 tabular-nums">{fmt(displayMs)}</span>;
}
