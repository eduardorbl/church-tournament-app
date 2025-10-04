// src/components/MatchCard.jsx
import { useEffect, useRef, useState } from 'react';
import { supabase } from '../supabaseClient';
import Timer from './Timer';

/**
 * Displays a single match with its current score. It fetches the home and
 * away team names, gets the score from the server-side view (match_scores),
 * and subscribes to real-time updates via Supabase Realtime. A timer is
 * displayed when the match status is "live".
 */
export default function MatchCard({ match }) {
  const [homeTeam, setHomeTeam] = useState(null);
  const [awayTeam, setAwayTeam] = useState(null);
  const [score, setScore] = useState({ home: 0, away: 0 });
  const [status, setStatus] = useState(match.status);
  const channelRef = useRef(null);

  const loadTeams = async () => {
    const ids = [match.home_team_id, match.away_team_id].filter(Boolean);
    if (!ids.length) return;

    // Query teams but restrict to the match.sport_id when present to avoid pulling teams from other sports
    try {
      let query = supabase
        .from('teams')
        .select('id, name, sport_id')
        .in('id', ids);

      if (match.sport_id) query = query.eq('sport_id', match.sport_id);

      const { data, error } = await query;

      if (!error && data) {
        const home = data.find(t => t.id === match.home_team_id);
        const away = data.find(t => t.id === match.away_team_id);
        if (home) setHomeTeam(home);
        if (away) setAwayTeam(away);
      }
    } catch (e) {
      console.error('loadTeams error:', e);
    }
  };

  const loadScore = async () => {
    const { data, error } = await supabase
      .from('match_scores')
      .select('home_goals, away_goals')
      .eq('match_id', match.id);

    const row = (!error && data && data[0]) ? data[0] : { home_goals: 0, away_goals: 0 };
    setScore({
      home: row.home_goals ?? 0,
      away: row.away_goals ?? 0,
    });
  };

  useEffect(() => {
    // primeira carga
    loadTeams();
    loadScore();
    setStatus(match.status);

    // evita múltiplos listeners (StrictMode/dev)
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    // canal único por partida
    const channel = supabase
      .channel(`match-card-${match.id}`)
      // qualquer mudança nos eventos desta partida -> recarrega placar
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'match_events', filter: `match_id=eq.${match.id}` },
        () => loadScore()
      )
      // se status do jogo mudar, atualiza localmente
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'matches', filter: `id=eq.${match.id}` },
        (payload) => setStatus(payload.new.status)
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match.id]);

  return (
    <div className="p-4 border rounded-lg shadow-sm flex flex-col">
      <div className="flex justify-between items-center mb-1">
        <span className="font-medium">
          {homeTeam ? homeTeam.name : 'Time A'}
        </span>
        <span className="text-lg font-bold">{score.home}</span>
      </div>

      <div className="flex justify-between items-center mb-1">
        <span className="font-medium">
          {awayTeam ? awayTeam.name : 'Time B'}
        </span>
        <span className="text-lg font-bold">{score.away}</span>
      </div>

      {/* Timer só quando a partida estiver ao vivo */}
      {status === 'live' && (
        <div className="mt-1">
          <Timer matchId={match.id} />
        </div>
      )}
    </div>
  );
}
