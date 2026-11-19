import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiRequest } from '../api/client.js';
import { useAuth } from './AuthContext.jsx';
import { useSocket } from './SocketContext.jsx';
import { useToast } from './ToastContext.jsx';

const MatchSessionContext = createContext(null);

function loadLocalHistory() {
  try {
    const raw = localStorage.getItem('cf_local_history');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function MatchSessionProvider({ children }) {
  const navigate = useNavigate();
  const { user, setUser, token } = useAuth();
  const { subscribe, sendSocket } = useSocket();
  const { showToast } = useToast();

  // Social state kept separate from active match HUD
  const [friends, setFriends] = useState([]);
  const [incomingRequests, setIncomingRequests] = useState([]);
  const [outgoingRequests, setOutgoingRequests] = useState([]);
  const [challenges, setChallenges] = useState([]);
  const [searchResults, setSearchResults] = useState([]);
  const [history, setHistory] = useState(loadLocalHistory);

  // Lobby & Match states (completely cleared when returning to menu)
  const [lobby, setLobby] = useState(null);
  const [activeMatch, setActiveMatch] = useState(null);
  const [matchResult, setMatchResult] = useState(null);

  // Sync initial social + history data when logged in
  useEffect(() => {
    if (!user) {
      setFriends([]);
      setIncomingRequests([]);
      setOutgoingRequests([]);
      setChallenges([]);
      setSearchResults([]);
      setHistory(loadLocalHistory());
      return;
    }
    apiRequest('/api/me')
      .then((data) => {
        if (data.friends) setFriends(data.friends);
        if (data.requests) setIncomingRequests(data.requests);
        if (data.sentRequests) setOutgoingRequests(data.sentRequests);
        if (data.games) setHistory(data.games);
      })
      .catch(() => {});
  }, [user?.id]);

  // Listen to WebSocket events across app
  useEffect(() => {
    return subscribe((msg) => {
      switch (msg.type) {
        case 'auth:ok':
          if (msg.friends) setFriends(msg.friends);
          if (msg.requests) setIncomingRequests(msg.requests);
          if (msg.sentRequests) setOutgoingRequests(msg.sentRequests);
          if (msg.games) setHistory(msg.games);
          break;
        case 'social:update':
          if (msg.friends) setFriends(msg.friends);
          if (msg.requests) setIncomingRequests(msg.requests);
          if (msg.sentRequests) setOutgoingRequests(msg.sentRequests);
          break;
        case 'presence:update':
          setFriends((prev) =>
            prev.map((f) =>
              f.id === msg.userId
                ? { ...f, online: Boolean(msg.online), inGame: Boolean(msg.inGame), status: msg.status, statusLabel: msg.statusLabel }
                : f
            )
          );
          break;
        case 'profile:results':
          setSearchResults(msg.users || []);
          break;
        case 'profile:stats':
        case 'games:history':
          if (msg.games) setHistory(msg.games);
          break;
        case 'challenge:incoming':
          setChallenges((prev) => [...prev.filter((c) => c.id !== msg.id), msg]);
          showToast(`⚔️ @${msg.from?.username || 'Amigo'} desafiou você (${msg.summary || '1v1'})!`);
          break;
        case 'challenge:declined':
          showToast(`@${msg.by?.username || 'Seu amigo'} recusou o desafio.`);
          break;
        case 'challenge:expired':
          if (msg.id) setChallenges((prev) => prev.filter((c) => c.id !== msg.id));
          break;
        case 'challenge:accepted':
          showToast(`@${msg.by?.username || 'Seu amigo'} aceitou o desafio!`);
          break;
        case 'match:waiting': {
          const lobbyId = `queue-${msg.mode || 'duel'}`;
          setLobby({
            id: lobbyId,
            kind: 'queue',
            mode: msg.mode || 'realtime',
            timeControl: msg.timeControl || null,
            position: msg.position || 1,
            statusText: 'Procurando adversário conectado na fila pública...',
          });
          navigate(`/lobby/${lobbyId}`);
          break;
        }
        case 'match:cancelled':
          setLobby(null);
          break;
        case 'room:created': {
          const lobbyId = msg.code || msg.roomId || 'sala';
          setLobby({
            id: lobbyId,
            kind: 'private',
            code: msg.code,
            roomId: msg.roomId,
            options: msg.options || {},
            summary: msg.summary || 'Sala privada 1v1',
            statusText: 'Sala criada! Compartilhe o código e aguarde seu oponente entrar.',
          });
          navigate(`/lobby/${lobbyId}`);
          break;
        }
        case 'game:started': {
          const st = msg.state;
          if (!st) break;
          setLobby(null);
          setMatchResult(null);
          const matchId = st.gameId || `online-${Date.now()}`;
          const isTactical = st.mode === 'tactical_draft';
          const isClassic = Boolean(st.classic || st.options?.mode === 'classic');
          setActiveMatch({
            matchId,
            kind: isTactical ? 'tactical' : isClassic ? 'online_classic' : 'online_duel',
            onlineState: isTactical ? null : st,
            tacticalState: isTactical ? st : null,
            connectionMsg: null,
            rematchStatus: 'idle',
            rematchRequestFrom: null,
          });
          navigate(`/game/${matchId}`);
          break;
        }
        case 'game:state':
        case 'game:ended': {
          const st = msg.state;
          if (!st) break;
          if (st.mode === 'tactical_draft') {
            setActiveMatch((prev) =>
              prev ? { ...prev, tacticalState: st } : { matchId: st.gameId, kind: 'tactical', tacticalState: st }
            );
            break;
          }
          setActiveMatch((prev) =>
            prev
              ? { ...prev, onlineState: st }
              : {
                  matchId: st.gameId,
                  kind: st.classic ? 'online_classic' : 'online_duel',
                  onlineState: st,
                }
          );
          if (msg.type === 'game:ended' || st.over) {
            const side = Number(st.side) || 0;
            const won = st.winner === side;
            const draw = st.winner === null || st.winner === undefined;
            const mine = st.teams?.[side] || {};
            const theirs = st.teams?.[1 - side] || {};
            const oppName = st.opponent?.displayName || st.opponent?.username || 'Adversário';
            setMatchResult({
              matchId: st.gameId,
              isOnline: true,
              isTactical: false,
              isClassic: Boolean(st.classic),
              mode: st.classic ? 'classic' : 'online',
              won,
              draw,
              title: won ? 'VITÓRIA!' : draw ? 'EMPATE' : 'DERROTA',
              subtitle: won ? 'Você superou seu adversário!' : draw ? 'Partida empatada.' : `${oppName} venceu a partida.`,
              reason: st.reason || 'Partida encerrada.',
              winCondition: st.winCondition || '',
              duration: Math.floor(st.T || 0),
              myScore: mine.score || 0,
              oppScore: theirs.score || 0,
              myCrown: Math.round(mine.crownProgress || 0),
              oppCrown: Math.round(theirs.crownProgress || 0),
              opponentName: oppName,
              ratingChange: st.ratingChanges?.[side],
              rated: Boolean(st.rated),
              optionsLabel: st.options?.label || '',
              rematchStatus: 'idle',
            });
            // For Classic checkmate, user can view the final mate banner cleanly or go to results
            if (!st.classic) {
              navigate(`/results/${st.gameId}`);
            }
          }
          break;
        }
        case 'tactical:state':
        case 'tactical:startDraft':
        case 'tactical:cardEffect': {
          const st = msg.state;
          if (!st) break;
          setActiveMatch((prev) =>
            prev ? { ...prev, tacticalState: st } : { matchId: st.gameId, kind: 'tactical', tacticalState: st }
          );
          break;
        }
        case 'tactical:left': {
          setActiveMatch(null);
          setLobby(null);
          const outcomeMsg = {
            discarded: 'Partida encerrada sem registro no histórico.',
            abandon: 'Você saiu da partida. O resultado foi registrado como abandono.',
          }[msg.outcome];
          if (outcomeMsg) showToast(outcomeMsg);
          navigate('/modes/tactical');
          break;
        }
        case 'game:connection':
          setActiveMatch((prev) =>
            prev
              ? {
                  ...prev,
                  connectionMsg: msg.connected
                    ? 'Seu adversário reconectou à partida.'
                    : `Seu adversário perdeu a conexão (${msg.graceSeconds || 45}s para reconectar)...`,
                }
              : prev
          );
          break;
        case 'game:rematch-request':
          setActiveMatch((prev) => (prev ? { ...prev, rematchRequestFrom: msg.from?.username || 'Adversário' } : prev));
          setMatchResult((prev) => (prev ? { ...prev, rematchRequestFrom: msg.from?.username || 'Adversário' } : prev));
          showToast(`⚔️ @${msg.from?.username || 'Seu adversário'} pediu uma revanche!`);
          break;
        case 'game:rematch-waiting':
          setActiveMatch((prev) => (prev ? { ...prev, rematchStatus: 'waiting' } : prev));
          setMatchResult((prev) => (prev ? { ...prev, rematchStatus: 'waiting' } : prev));
          break;
        case 'game:rematch-started':
          setActiveMatch((prev) => (prev ? { ...prev, rematchStatus: 'idle', rematchRequestFrom: null } : prev));
          setMatchResult(null);
          break;
        default:
          break;
      }
    });
  }, [subscribe, navigate, showToast]);

  const startOfflineMatch = useCallback((kind, config = {}) => {
    const matchId = `local-${kind}-${Date.now()}`;
    setLobby(null);
    setMatchResult(null);
    setActiveMatch({
      matchId,
      kind, // 'offline_duel' | 'offline_arena' | 'offline_tutorial' | 'offline_classic'
      config,
    });
    navigate(`/game/${matchId}`);
    return matchId;
  }, [navigate]);

  const recordAndFinishOfflineMatch = useCallback(async ({
    matchId,
    mode,
    difficulty = null,
    winner,
    reason,
    winCondition = '',
    duration = 0,
    myScore = 0,
    oppScore = 0,
    myCrown = 0,
    oppCrown = 0,
    opponentName = 'Adversário',
    skillsUsed = 0,
    oppMaxCrown = 0,
    replayConfig = {},
    skipRedirect = false,
  }) => {
    const entry = {
      id: matchId || `local-${Date.now()}`,
      mode,
      difficulty,
      opponent: opponentName,
      result: winner === null ? 'Empate' : winner === 0 ? 'Vitória' : 'Derrota',
      reason,
      winCondition,
      duration: Math.max(1, Math.floor(duration)),
      createdAt: new Date().toISOString(),
      scores: [myScore, oppScore],
    };

    const nextHist = [entry, ...loadLocalHistory()].slice(0, 30);
    setHistory(nextHist);
    try {
      localStorage.setItem('cf_local_history', JSON.stringify(nextHist.slice(0, 20)));
    } catch {
      // ignore
    }

    if (mode === 'tutorial' && winner === 0) {
      try {
        localStorage.setItem('cf_tutorial_completed', '1');
        localStorage.setItem('cf_tutorial_prompt', 'completed');
      } catch {
        // ignore
      }
    }

    let newlyUnlocked = [];
    if (token && user) {
      try {
        const res = await apiRequest('/api/matches/record', {
          mode,
          difficulty,
          result: winner === null ? 'draw' : winner === 0 ? 'win' : 'loss',
          score: myScore,
          opponentScore: oppScore,
          duration: Math.max(1, Math.floor(duration)),
          reason,
          winCondition,
          skillsUsed,
          opponentMaxCrownProgress: Math.round(oppMaxCrown),
        });
        if (res.user) setUser(res.user);
        if (res.games) setHistory(res.games);
        if (Array.isArray(res.newlyUnlocked)) newlyUnlocked = res.newlyUnlocked;
      } catch {
        // ignore offline errors
      }
    }

    setMatchResult({
      matchId,
      isOnline: false,
      isTactical: false,
      isClassic: mode === 'classic_cpu' || mode === 'classic_local',
      mode,
      won: winner === 0,
      draw: winner === null,
      title: mode === 'tutorial' && winner === 0 ? 'TUTORIAL CONCLUÍDO!' : winner === 0 ? 'VITÓRIA!' : winner === null ? 'EMPATE' : 'DERROTA',
      subtitle: winner === 0 ? 'Você venceu a partida!' : winner === null ? 'Partida empatada.' : `${opponentName} venceu.`,
      reason,
      winCondition,
      duration: Math.max(1, Math.floor(duration)),
      myScore,
      oppScore,
      myCrown: Math.round(myCrown),
      oppCrown: Math.round(oppCrown),
      opponentName,
      newlyUnlocked,
      replayConfig,
    });

    if (!skipRedirect) {
      setActiveMatch(null);
      navigate(`/results/${matchId}`);
    }
  }, [token, user, setUser, navigate]);

  const finishTacticalToResults = useCallback((st) => {
    if (!st) return;
    const won = st.winner === st.side;
    const draw = st.winner === null || st.winner === undefined;
    const myName = st.self?.displayName || 'Você';
    const oppName = st.opponent?.displayName || 'Adversário';
    setMatchResult({
      matchId: st.gameId,
      isOnline: !st.opponentIsBot,
      isTactical: true,
      mode: st.opponentIsBot ? 'tactical_cpu' : 'tactical',
      won,
      draw,
      title: won ? 'VITÓRIA!' : draw ? 'EMPATE' : 'DERROTA',
      subtitle: won ? `${myName} dominou o Cerco Tático!` : draw ? 'Partida encerrada.' : `${oppName} venceu o Cerco Tático.`,
      reason: st.reason || 'Partida encerrada.',
      duration: Math.floor((st.durationMs || 0) / 1000),
      myScore: st.myTeam?.vp || 0,
      oppScore: st.enemyTeam?.vp || 0,
      opponentName: oppName,
      tacticalState: st,
      rematchStatus: 'idle',
    });
    setActiveMatch(null);
    navigate(`/results/${st.gameId}`);
  }, [navigate]);

  const clearMatchSession = useCallback(() => {
    setLobby(null);
    setActiveMatch(null);
    setMatchResult(null);
  }, []);

  const dismissChallenge = useCallback((id) => {
    setChallenges((prev) => prev.filter((c) => c.id !== id));
  }, []);

  return (
    <MatchSessionContext.Provider
      value={{
        friends,
        incomingRequests,
        outgoingRequests,
        challenges,
        dismissChallenge,
        searchResults,
        history,
        setHistory,
        lobby,
        setLobby,
        activeMatch,
        setActiveMatch,
        matchResult,
        setMatchResult,
        startOfflineMatch,
        recordAndFinishOfflineMatch,
        finishTacticalToResults,
        clearMatchSession,
        sendSocket,
      }}
    >
      {children}
    </MatchSessionContext.Provider>
  );
}

export function useMatchSession() {
  return useContext(MatchSessionContext);
}
