// Proxies https://finans.truncgil.com/today.json server-side.
// The client can't call that URL directly because the API doesn't send CORS headers,
// so the browser silently blocks the response. A server-to-server fetch (here) has no
// such restriction — the browser then just talks to our own domain, which is always allowed.
exports.handler = async () => {
  const headers = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  };

  try {
    const resp = await fetch("https://finans.truncgil.com/today.json");
    if (!resp.ok) {
      return { statusCode: 502, headers, body: JSON.stringify({ error: "Kaynak sunucu hata döndü (" + resp.status + ")" }) };
    }
    const data = await resp.json();
    return { statusCode: 200, headers, body: JSON.stringify(data) };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: String((e && e.message) || e) }) };
  }
};
