const connections = new Map();

export function createSseHandlers() {
  function handleMessageStream(req, res, session) {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      res.writeHead(405, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, message: "Method not allowed" }));
      return;
    }

    const userId = String(session.user.id);

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no"
    });

    res.write(":ok\n\n");

    if (!connections.has(userId)) {
      connections.set(userId, new Set());
    }
    connections.get(userId).add(res);

    const heartbeat = setInterval(() => {
      try { res.write(":heartbeat\n\n"); } catch { /* connection lost */ }
    }, 30_000);

    req.on("close", () => {
      clearInterval(heartbeat);
      const userConns = connections.get(userId);
      if (userConns) {
        userConns.delete(res);
        if (userConns.size === 0) connections.delete(userId);
      }
    });
  }

  function notifyUser(userId, event, data) {
    const userConns = connections.get(String(userId));
    if (!userConns || userConns.size === 0) return;

    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const conn of userConns) {
      try { conn.write(payload); } catch { /* stale connection, cleaned up on close */ }
    }
  }

  return { handleMessageStream, notifyUser };
}
