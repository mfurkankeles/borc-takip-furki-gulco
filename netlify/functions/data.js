const blobs = require("@netlify/blobs");
const { getStore } = blobs;

const STORE_NAME = "ev-hesabi";
const KEY = "shared";

exports.handler = async (event) => {
  const headers = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  };

  try {
    // Klasik (exports.handler) fonksiyonlarda Blobs bağlantısı event üzerinden kurulmalı.
    // Bu çağrı olmadan getStore "ortam Blobs için yapılandırılmamış" hatası verir ve
    // site sessizce sadece-tarayıcı (yerel) moduna düşer — kayıtlar cihazlar arası paylaşılmaz.
    if (event && event.blobs && typeof blobs.connectLambda === "function") blobs.connectLambda(event);
    const store = getStore(STORE_NAME);

    if (event.httpMethod === "GET") {
      const data = await store.get(KEY, { type: "json" });
      return { statusCode: 200, headers, body: JSON.stringify(data || null) };
    }

    if (event.httpMethod === "POST") {
      let body;
      try {
        body = JSON.parse(event.body || "{}");
      } catch (e) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: "Geçersiz JSON" }) };
      }
      await store.setJSON(KEY, body);
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: "Desteklenmeyen yöntem" }) };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: String(e && e.message || e) }) };
  }
};
