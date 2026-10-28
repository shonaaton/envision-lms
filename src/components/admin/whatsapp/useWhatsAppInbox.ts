"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { mergeMessages, type Conversation, type ThreadPage } from "./types";

const EMPTY_THREAD: ThreadPage = { messages: [], nextCursor: null, hasMore: false, loaded: false };
export function threadKey(phone: string, query: string) { return `${phone}:${query}`; }

export function useWhatsAppInbox(initialPhoneNumber: string, refreshKey: number) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedPhone, setSelectedPhone] = useState(initialPhoneNumber);
  const [threads, setThreads] = useState<Record<string, ThreadPage>>({});
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const requests = useRef(new Map<string, AbortController>());
  const requestVersions = useRef(new Map<string, number>());
  const active = useRef({ phone: selectedPhone, query });
  active.current = { phone: selectedPhone, query };

  const request = useCallback(async (key: string, url: string, apply: (payload: any) => void) => {
    const errorKey = key.replace(/^older:/, "thread:");
    const version = (requestVersions.current.get(key) || 0) + 1;
    requestVersions.current.set(key, version);
    requests.current.get(key)?.abort();
    const controller = new AbortController();
    requests.current.set(key, controller);
    const timeout = window.setTimeout(() => controller.abort("timeout"), 20_000);
    try {
      const response = await fetch(url, { cache: "no-store", signal: controller.signal });
      const payload = await response.json();
      if (!response.ok || payload.error) throw new Error(payload.error || "Could not load WhatsApp.");
      if (requestVersions.current.get(key) === version && !controller.signal.aborted) {
        apply(payload);
        setErrors((current) => { if (!current[errorKey]) return current; const next = { ...current }; delete next[errorKey]; return next; });
      }
    } catch (error) {
      if (!controller.signal.aborted || controller.signal.reason === "timeout") setErrors((current) => ({ ...current, [errorKey]: error instanceof Error ? error.message : "Connection interrupted. Refresh to reconnect." }));
    } finally {
      window.clearTimeout(timeout);
      if (requests.current.get(key) === controller) requests.current.delete(key);
    }
  }, []);

  const loadList = useCallback(async () => {
    await request("list", "/api/admin/whatsapp", (payload) => {
      // The server also exposes a countdown for API consumers. The inbox uses
      // the expiry timestamp locally, so a ticking countdown need not repaint
      // every conversation on an otherwise unchanged poll.
      const next = (payload.conversations || []).map(({ whatsapp: _window, ...conversation }: any) => conversation);
      setConversations((current) => JSON.stringify(current) === JSON.stringify(next) ? current : next);
      setSelectedPhone((current) => current || payload.conversations?.[0]?.phoneNumber || "");
    });
    setLoading(false);
  }, [request]);

  const loadThread = useCallback(async (phone: string, search = "", before?: string) => {
    if (!phone) return;
    const key = threadKey(phone, search);
    const params = new URLSearchParams({ view: "thread", phone, ...(search ? { q: search } : {}), ...(before ? { before } : {}) });
    await request(`${before ? "older" : "thread"}:${key}`, `/api/admin/whatsapp?${params}`, (payload) => {
      setThreads((current) => {
        const previous = current[key] || EMPTY_THREAD;
        return { ...current, [key]: {
          loaded: true,
          messages: mergeMessages(previous.messages, payload.messages || []),
          nextCursor: before || !previous.olderLoaded ? payload.nextCursor : previous.nextCursor,
          hasMore: before || !previous.olderLoaded ? payload.hasMore : previous.hasMore,
          olderLoaded: Boolean(before || previous.olderLoaded),
        } };
      });
    });
  }, [request]);

  useEffect(() => { void loadList(); }, [loadList, refreshKey]);
  useEffect(() => { void loadThread(selectedPhone, query); }, [selectedPhone, query, loadThread, refreshKey]);
  useEffect(() => {
    const pendingRequests = requests.current;
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      if (!pendingRequests.has("list")) void loadList();
      const { phone, query: search } = active.current;
      if (!pendingRequests.has(`thread:${threadKey(phone, search)}`)) void loadThread(phone, search);
    };
    const interval = window.setInterval(refresh, 5000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
      pendingRequests.forEach((controller) => controller.abort());
      pendingRequests.clear();
    };
  }, [loadList, loadThread]);

  return { conversations, setConversations, selectedPhone, setSelectedPhone, query, setQuery, thread: threads[threadKey(selectedPhone, query)] || EMPTY_THREAD, loadList, loadThread, loading, connectionError: errors.list || errors[`thread:${threadKey(selectedPhone, query)}`] || "" };
}
