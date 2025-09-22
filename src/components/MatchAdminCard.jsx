// src/components/MatchAdminCard.jsx
import { useEffect, useRef, useState } from 'react';
import { supabase } from '../supabaseClient';
import Timer from './Timer';

export default function MatchAdminCard({ match }) {
  const [homeName, setHomeName] = useState('Time A');
  const [awayName, setAwayName] = useState('Time B');
  const [status, setStatus] = useState(match.status);
  const [score, setScore] = useState({ home: 0, away: 0 });
  const [sportName, setSportName] = useState('Futsal');
  const [timerRunning, setTimerRunning] = useState(false);
  const [busy, setBusy] = useState(false);
  const channelRef = useRef(null);

  // ---------- loaders ----------
  const loadNames = async () => {
    const ids = [match.home_team_id, match.away_team_id].filter(Boolean);
    if (!ids.length) return;
    const { data } = await supabase.from('teams').select('id,name').in('id', ids);
    if (data) {
      const home = data.find(t => t.id === match.home_team_id)?.name;
      const away = data.find(t => t.id === match.away_team_id)?.name;
      if (home) setHomeName(home);
      if (away) setAwayName(away);
    }
  };

  const loadSport = async () => {
    const { data } = await supabase
      .from('sports')
      .select('name')
      .eq('id', match.sport_id)
      .maybeSingle();
    if (data?.name) setSportName(data.name);
  };

  const loadScore = async () => {
    const { data } = await supabase
      .from('match_scores')
      .select('home_goals, away_goals')
      .eq('match_id', match.id)
      .maybeSingle();
    const row = data ?? { home_goals: 0, away_goals: 0 };
    setScore({ home: row.home_goals ?? 0, away: row.away_goals ?? 0 });
  };

  const loadTimerState = async () => {
    const { data } = await supabase
      .from('match_events')
      .select('event_type, ts')
      .eq('match_id', match.id)
      .in('event_type', ['timer_start', 'timer_pause', 'timer_resume', 'timer_stop', 'finish'])
      .order('ts', { ascending: false })
      .limit(1);
    const last = data?.[0];
    const running = last
      ? last.event_type === 'timer_start' || last.event_type === 'timer_resume'
      : false;
    setTimerRunning(running && status === 'live');
  };

  // ---------- effects ----------
  useEffect(() => {
    loadNames();
    loadSport();
    loadScore();
    loadTimerState();
    setStatus(match.status);

    // limpa canal antigo (evita duplicidade em dev/StrictMode)
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    const channel = supabase
      .channel(`match-admin-${match.id}`)
      // qualquer evento da partida -> recarrega placar e estado do timer
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'match_events', filter: `match_id=eq.${match.id}` },
        () => { loadScore(); loadTimerState(); }
      )
      // update de status da partida
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'matches', filter: `id=eq.${match.id}` },
        (p) => setStatus(p.new.status)
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match.id]);

  // ---------- actions ----------
  const eventType = sportName === 'Volei' ? 'point' : 'goal';

  const addPoint = async (team, amount = 1) => {
    if (busy || status !== 'live') return;
    setBusy(true);
    const { error } = await supabase.from('match_events').insert({
      match_id: match.id,
      event_type: eventType,
      payload: { team, amount }, // a view soma +1/-1
    });
    setBusy(false);
    if (error) alert('Erro ao registrar ponto: ' + error.message);
  };

  const removePoint = (team) => addPoint(team, -1);

  const startMatch = async () => {
    if (busy || status !== 'scheduled') return;
    setBusy(true);
    const { error: e1 } = await supabase
      .from('match_events')
      .insert({ match_id: match.id, event_type: 'timer_start', payload: {} });
    const { error: e2 } = await supabase
      .from('matches')
      .update({ status: 'live' })
      .eq('id', match.id);
    setBusy(false);
    if (e1 || e2) alert('Erro ao iniciar: ' + (e1?.message || e2?.message));
  };

  const pauseMatch = async () => {
    if (busy || status !== 'live' || !timerRunning) return;
    setBusy(true);
    const { error } = await supabase
      .from('match_events')
      .insert({ match_id: match.id, event_type: 'timer_pause', payload: {} });
    setBusy(false);
    if (error) alert('Erro ao pausar: ' + error.message);
  };

  const resumeMatch = async () => {
    if (busy || status !== 'live' || timerRunning) return;
    setBusy(true);
    const { error } = await supabase
      .from('match_events')
      .insert({ match_id: match.id, event_type: 'timer_resume', payload: {} });
    setBusy(false);
    if (error) alert('Erro ao retomar: ' + error.message);
  };

  const endMatch = async () => {
    if (busy || status === 'finished') return;
    setBusy(true);
    const { error: e1 } = await supabase
      .from('match_events')
      .insert({ match_id: match.id, event_type: 'timer_stop', payload: {} });
    const { error: e2 } = await supabase
      .from('matches')
      .update({ status: 'finished' })
      .eq('id', match.id);
    setBusy(false);
    if (e1 || e2) alert('Erro ao encerrar: ' + (e1?.message || e2?.message));
  };

  // ---------- UI ----------
  return (
    <div className="border p-4 rounded-lg shadow-sm">
      <div className="flex justify-between items-center mb-2">
        <h3 className="font-bold">
          {homeName} vs {awayName}
        </h3>
        <div className="flex items-center gap-3">
          <Timer matchId={match.id} />
          <span className="text-xs text-gray-500">{status}</span>
        </div>
      </div>

      <div className="flex justify-between items-center text-3xl font-bold my-2">
        <span>{score.home}</span>
        <span>{score.away}</span>
      </div>

      {status !== 'finished' && (
        <>
          <div className="grid grid-cols-2 gap-3 my-2">
            <button
              disabled={busy || status !== 'live'}
              onClick={() => addPoint('home', 1)}
              className="bg-blue-600 text-white px-3 py-2 rounded disabled:opacity-50"
            >
              +1 {homeName}
            </button>
            <button
              disabled={busy || status !== 'live'}
              onClick={() => addPoint('away', 1)}
              className="bg-blue-600 text-white px-3 py-2 rounded disabled:opacity-50"
            >
              +1 {awayName}
            </button>
            <button
              disabled={busy || status !== 'live' || score.home === 0}
              onClick={() => removePoint('home')}
              className="bg-gray-200 px-3 py-2 rounded disabled:opacity-50"
            >
              −1 {homeName}
            </button>
            <button
              disabled={busy || status !== 'live' || score.away === 0}
              onClick={() => removePoint('away')}
              className="bg-gray-200 px-3 py-2 rounded disabled:opacity-50"
            >
              −1 {awayName}
            </button>
          </div>

          <div className="flex flex-wrap gap-2 mt-2">
            {status === 'scheduled' && (
              <button
                onClick={startMatch}
                disabled={busy}
                className="bg-green-600 text-white px-3 py-2 rounded disabled:opacity-50"
              >
                Iniciar
              </button>
            )}

            {status === 'live' && (
              <>
                <button
                  onClick={endMatch}
                  disabled={busy}
                  className="bg-red-600 text-white px-3 py-2 rounded disabled:opacity-50"
                >
                  Encerrar
                </button>
                <button
                  onClick={pauseMatch}
                  disabled={busy || !timerRunning}
                  className="bg-yellow-500 text-white px-3 py-2 rounded disabled:opacity-50"
                >
                  Pausar
                </button>
                <button
                  onClick={resumeMatch}
                  disabled={busy || timerRunning}
                  className="bg-emerald-600 text-white px-3 py-2 rounded disabled:opacity-50"
                >
                  Retomar
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
