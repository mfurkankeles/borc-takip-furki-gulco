// Canlı altın fiyatları — önce Harem Altın, olmazsa Truncgil (yedek).
//
// Harem Altın fiyatları bir socket.io (websocket) akışıyla yayınlar. Bağlanır bağlanmaz
// tüm kodların anlık görüntüsünü tek mesajda ("price_changed") gönderir, biz de gereken
// kodları alıp bağlantıyı kapatırız. Tarayıcı CORS/websocket kısıtları yüzünden bunu
// doğrudan yapamaz; bu yüzden sunucu tarafında (burada) yapıyoruz.
//
// Çıktı biçimi:
//   Harem:    { _source: "haremaltin", tarih: "YYYY-MM-DD HH:MM:SS", prices: { gram22:{alis,satis}, ... }, fallback: { resat: "Ata Altın" } }
//   Truncgil: kaynağın ham JSON'u + _source: "truncgil"   (istemci eski biçimi okumaya devam eder)

const { io } = require("socket.io-client");

const HAREM_URL = "wss://hrmsocketonly.haremaltin.com:443";
// Bizim anahtarımız -> Harem Altın kodu. Çeyrek/yarım/tam için "ESKİ" baz alınıyor.
// Reşat Harem'de yok: Ata (Cumhuriyet) eski altın fiyatı kullanılır ve istemciye bildirilir.
const CODES = {
  gram22: "AYAR22",
  gram24: "KULCEALTIN",
  ceyrek: "CEYREK_ESKI",
  yarim: "YARIM_ESKI",
  tam: "TEK_ESKI",
  resat: "ATA_ESKI",
};

function num(v) {
  if (typeof v === "number") return v;
  const n = parseFloat(String(v));
  return isNaN(n) ? NaN : n;
}

function fetchHarem(timeoutMs) {
  return new Promise((resolve, reject) => {
    const socket = io(HAREM_URL, { transports: ["websocket"], reconnection: false, timeout: timeoutMs });
    const got = {};
    let latestTarih = null;
    let done = false;
    const finish = (err, val) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { socket.disconnect(); } catch (e) {}
      err ? reject(err) : resolve(val);
    };
    const timer = setTimeout(() => finish(new Error("Harem Altın zaman aşımı")), timeoutMs);
    socket.on("connect_error", (e) => finish(new Error("Harem Altın bağlantı hatası: " + (e && e.message))));
    socket.on("price_changed", (msg) => {
      const data = (msg && msg.data) || {};
      for (const ourKey of Object.keys(CODES)) {
        const rec = data[CODES[ourKey]];
        if (rec) {
          const satis = num(rec.satis), alis = num(rec.alis);
          if (!isNaN(satis) && satis > 0) {
            got[ourKey] = { alis, satis };
            if (rec.tarih) latestTarih = rec.tarih; // "15-10-2026 12:58:05"
          }
        }
      }
      if (Object.keys(CODES).every((k) => got[k])) finish(null, { got, latestTarih });
    });
  });
}

function haremDateToIso(s) {
  // "15-10-2026 12:58:05" -> "2026-10-15 12:58:05"
  const m = /^(\d{2})-(\d{2})-(\d{4})\s+(\d{2}:\d{2}:\d{2})$/.exec(s || "");
  return m ? `${m[3]}-${m[2]}-${m[1]} ${m[4]}` : null;
}

exports.handler = async () => {
  const headers = { "Content-Type": "application/json", "Cache-Control": "no-store" };

  // 1) Harem Altın
  try {
    const { got, latestTarih } = await fetchHarem(5000);
    const tarih = haremDateToIso(latestTarih);
    // Türkiye saati (UTC+3) — sunucu UTC'de çalışır, bu yüzden elle çeviriyoruz
    const trNow = new Date(Date.now() + 3 * 3600 * 1000).toISOString().slice(0, 19).replace("T", " ");
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        _source: "haremaltin",
        tarih: tarih || trNow,
        prices: got,
        fallback: { resat: "Ata Altın" },
      }),
    };
  } catch (haremErr) {
    // 2) Yedek: Truncgil
    try {
      const resp = await fetch("https://finans.truncgil.com/today.json");
      if (!resp.ok) {
        return { statusCode: 502, headers, body: JSON.stringify({ error: "Harem Altın: " + haremErr.message + " | Truncgil HTTP " + resp.status }) };
      }
      const data = await resp.json();
      return { statusCode: 200, headers, body: JSON.stringify({ ...data, _source: "truncgil", _haremError: haremErr.message }) };
    } catch (e) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: "Harem Altın: " + haremErr.message + " | Truncgil: " + String((e && e.message) || e) }) };
    }
  }
};
