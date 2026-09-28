// src/hooks/useLiveRefetch.js
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../supabaseClient";

/**
 * Mantém uma página pública sincronizada com o banco via Supabase Realtime,
 * sempre por REFETCH (nunca confiando só no payload do evento).
 *
 * - Canal com nome único por montagem (evita reaproveitar um canal "morrendo").
 * - Rajadas de eventos são agrupadas (debounce) e nunca descartadas: se chegar
 *   evento durante um refetch, roda mais UM refetch quando o atual terminar.
 * - Refetch inicial ao montar/mudar deps, e ressincroniza quando o canal
 *   (re)conecta ('SUBSCRIBED'), quando a aba volta a ficar visível e quando o
 *   navegador volta a ficar online (o realtime não reenvia o que se perdeu).
 * - Refetches são serializados; `ctx.isCurrent()` diz se a resposta ainda vale
 *   (false após desmontar/mudar deps ou se outro refetch começou depois).
 *
 * @param {object}   opts
 * @param {string}   opts.channelKey     prefixo do nome do canal (ex.: `match-${id}`)
 * @param {Array}    opts.subscriptions  [{ table, filter?, event?, schema?, shouldRefetch?(payload, { refetching }) }]
 * @param {Function} opts.refetch        async (ctx: { isCurrent(): boolean }) => void
 * @param {number}   [opts.debounceMs=300]
 * @param {boolean}  [opts.enabled=true]
 * @returns {{ status: 'connecting'|'live'|'offline', reconnecting: boolean, refresh: () => void }}
 */
export default function useLiveRefetch({
  channelKey,
  subscriptions = [],
  refetch,
  debounceMs = 300,
  enabled = true,
}) {
  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;
  const subsRef = useRef(subscriptions);
  subsRef.current = subscriptions;

  const seqRef = useRef(0);
  const controlsRef = useRef(null);
  const everLiveRef = useRef(false);
  const [status, setStatus] = useState("connecting");

  // Só recria o canal quando a "forma" das inscrições muda (não a cada render).
  const subsKey = (subscriptions || [])
    .map((s) => `${s.schema || "public"}.${s.table}|${s.event || "*"}|${s.filter || ""}`)
    .join(",");

  useEffect(() => {
    if (!enabled) return undefined;

    let disposed = false;
    let running = false;
    let dirty = false;
    let timer = null;

    const run = async () => {
      if (disposed) return;
      if (running) {
        dirty = true;
        return;
      }
      running = true;
      try {
        do {
          dirty = false;
          const mySeq = ++seqRef.current;
          const isCurrent = () => !disposed && mySeq === seqRef.current;
          try {
            await refetchRef.current?.({ isCurrent });
          } catch (e) {
            console.error(`[useLiveRefetch:${channelKey}] refetch falhou:`, e);
          }
        } while (dirty && !disposed);
      } finally {
        running = false;
      }
    };

    const schedule = (delay = debounceMs) => {
      if (disposed) return;
      if (running) {
        dirty = true; // não descarta: roda de novo quando o atual terminar
        return;
      }
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        run();
      }, Math.max(0, delay));
    };

    controlsRef.current = {
      refresh: () => {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        run();
      },
    };

    // Carga inicial (serializada com os refetches do realtime).
    run();

    // Canal com nome único por montagem.
    const suffix = Math.random().toString(36).slice(2, 10);
    let channel = supabase.channel(`${channelKey}-${suffix}`);
    (subsRef.current || []).forEach((sub, i) => {
      const cfg = { event: sub.event || "*", schema: sub.schema || "public", table: sub.table };
      if (sub.filter) cfg.filter = sub.filter;
      channel = channel.on("postgres_changes", cfg, (payload) => {
        if (disposed) return;
        const current = subsRef.current?.[i] || sub;
        let should = true;
        if (typeof current.shouldRefetch === "function") {
          try {
            should = current.shouldRefetch(payload, { refetching: running }) !== false;
          } catch (e) {
            console.error(`[useLiveRefetch:${channelKey}] shouldRefetch falhou:`, e);
            should = true;
          }
        }
        if (should) schedule();
      });
    });

    channel.subscribe((st) => {
      if (disposed) return;
      if (st === "SUBSCRIBED") {
        everLiveRef.current = true;
        setStatus("live");
        // Também na 1ª vez: fecha a janela entre a carga inicial e a inscrição.
        // Nas seguintes (rejoin após queda), recupera o que se perdeu.
        schedule(0);
      } else if (st === "CHANNEL_ERROR" || st === "TIMED_OUT" || st === "CLOSED") {
        setStatus(typeof navigator !== "undefined" && navigator.onLine === false ? "offline" : "connecting");
      }
    });

    const onVisibility = () => {
      if (document.visibilityState === "visible") schedule(0);
    };
    const onOnline = () => {
      setStatus(channel.state === "joined" ? "live" : "connecting");
      schedule(0);
    };
    const onOffline = () => setStatus("offline");

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    return () => {
      disposed = true;
      seqRef.current += 1; // invalida qualquer resposta em voo
      if (timer) clearTimeout(timer);
      controlsRef.current = null;
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      try {
        supabase.removeChannel(channel);
      } catch {
        /* noop */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelKey, subsKey, debounceMs, enabled]);

  const refresh = useCallback(() => {
    if (controlsRef.current) controlsRef.current.refresh();
  }, []);

  const reconnecting = status === "offline" || (status === "connecting" && everLiveRef.current);

  return { status, reconnecting, refresh };
}
