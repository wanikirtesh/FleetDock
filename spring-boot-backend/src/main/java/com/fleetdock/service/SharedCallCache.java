package com.fleetdock.service;

import java.util.concurrent.Callable;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Collapses identical read-only calls against the same physical host. When several users registered the
 * same VM, simultaneous syncs share one in-flight call, and results are reused for a short TTL.
 */
final class SharedCallCache {

    private record Entry(CompletableFuture<String> future, long createdAt) {}

    private final ConcurrentHashMap<String, Entry> entries = new ConcurrentHashMap<>();
    private final long ttlMs;

    SharedCallCache(long ttlMs) {
        this.ttlMs = ttlMs;
    }

    /** Key identifying the physical machine, independent of which user registered it. */
    static String hostKey(String ip, int port) {
        return (ip == null ? "" : ip.trim().toLowerCase()) + ":" + (port > 0 ? port : 22);
    }

    String get(String hostKey, String call, Callable<String> loader) throws Exception {
        String key = hostKey + "|" + call;
        AtomicBoolean owner = new AtomicBoolean(false);
        long now = System.currentTimeMillis();

        Entry entry = entries.compute(key, (k, cur) -> {
            if (cur != null && (!cur.future().isDone() || now - cur.createdAt() < ttlMs)) {
                return cur;
            }
            owner.set(true);
            return new Entry(new CompletableFuture<>(), now);
        });

        if (owner.get()) {
            try {
                entry.future().complete(loader.call());
            } catch (Throwable t) {
                entries.remove(key, entry); // never cache failures
                entry.future().completeExceptionally(t);
                if (t instanceof Exception e) throw e;
                throw new RuntimeException(t);
            }
        }

        try {
            return entry.future().get();
        } catch (ExecutionException e) {
            Throwable cause = e.getCause();
            if (cause instanceof Exception ex) throw ex;
            throw new RuntimeException(cause);
        }
    }

    /** Drops everything cached for a host, e.g. after a start/stop/remove changed its state. */
    void invalidateHost(String hostKey) {
        String prefix = hostKey + "|";
        entries.keySet().removeIf(k -> k.startsWith(prefix));
    }
}
