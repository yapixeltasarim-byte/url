# Proje Durumu (Son Güncelleme: 2026-09-11)

Bu dosya, başka bir bilgisayardan devam ederken "nerede kalmıştık" sorusuna
cevap vermek için tutuluyor. Repo: https://github.com/yapixeltasarim-byte/url

## Ne yapıldı

- Spesifikasyona uygun, RBAC'li, KVKK uyumlu (IP hash) URL kısaltma platformu
  sıfırdan yazıldı (domain/infra/http katmanlı mimari, Prisma+SQLite, EJS,
  CSRF, session tabanlı auth).
- UI, TinyURL'den ilham alan modern bir tasarıma çevrildi (lacivert/sarı
  palet, Montserrat font, Tabler outline ikonlar, sidebar dashboard).
- GitHub'a özel repo olarak atıldı: `yapixeltasarim-byte/url` (main branch).
- Hostinger paylaşımlı hosting'e (Node.js Git Deploy) canlıya alındı.
  Canlı adres: `fb.bizfenerbahceliyiz.com`.
- Fenerbahçe Spor Kulübü için Word/PDF rapor ve ayrı bir kapak yazısı
  hazırlandı (ücretsiz kullanım, kulübün sunucusuna taşınabilir, TinyURL
  karşılaştırması vurgulanarak).

## Çözülen büyük prod sorunları

- `PORT` env değişkeni Passenger tarafından enjekte ediliyor, zorunlu env
  listesinden çıkarıldı (503 sebebiydi).
- Migration'lar shell erişimi olmadan, token korumalı bir `/setup` HTTP
  ucu üzerinden doğrudan SQL ile uygulanıyor (child_process/npx hosting'de
  çalışmıyordu, `EAGAIN` veriyordu).
- `argon2` native modülü bu hostingde "Threading failure" hatası veriyordu
  ve hesabın ~120 process/thread limitine yaklaşmasına katkı olabileceği
  düşünüldü → **tamamen kaldırıldı**, her yerde `bcryptjs`'e geçildi
  (son commit: `prisma/seed.js` de düzeltildi, `ad63831`).
- Cache-busting bug: `assetVersion` statik `package.json` sürümünden değil,
  her process başlangıcında `Date.now()`'dan geliyor artık.
- Genel Analitik ekranının veri göstermemesi: `click_events` → `click_daily`
  rollup'u için harici cron yoktu; artık process içinde 15 dakikada bir
  otomatik çalışıyor (`src/index.js` içindeki `rollupInterval`).
- `geoip-lite` ile ülke tespiti denendi, 111MB veri dosyası ~105MB RAM
  yükü getirip 504'e sebep oldu → **geri alındı**, şu an ülke bilgisi
  sadece Cloudflare `cf-ipcountry` header'ı varsa geliyor (yoksa `unknown`).

## Şu an açık / takip edilmesi gereken

- **argon2 kaldırma sonrası Hostinger process sayısı takip edilmeli.**
  Sorun: hesap genelinde ~120 process/thread limitine yakın seyrediyordu
  (~140 rapor edilmişti). Diğer 5 site temiz bulundu (multi-process/cluster
  yok, güncelleme yok), şüphe bu app'teki argon2'ye yöneldi ve kaldırıldı.
  **Yapılacak: Hostinger'da yeniden deploy edip birkaç saat/gün sonra
  process sayısının 120 limitinin altına düşüp düşmediğini kontrol et.**
  Düşmezse başka bir kaynak aranmalı.
- Ülke tespiti hâlâ eksik/`unknown` gösteriyor olabilir (Cloudflare
  kullanılmıyorsa). Daha hafif bir çözüm (küçük ülke-seviyeli IP veritabanı
  veya Cloudflare'e geçiş) ileride değerlendirilebilir — şu an ertelendi.
- Kulüp raporundaki "Faz 3/4" maddeleri (2FA, PostgreSQL/Redis'e geçiş,
  Cloudflare, otomatik yedekleme) bilinçli olarak ertelendi — kulüp
  kullanmaya karar verirse yapılacaklar listesinde.

## Önemli tercihler / kısıtlar (unutma)

- Rapor ve yazışmalarda kulüp için "şirket/firma" değil her zaman "kulüp"
  dili kullanılıyor.
- Renk paleti (lacivert/sarı) TinyURL'e benzese de bilinçli olarak
  korunuyor; tasarım TinyURL'den ilham alıyor ama birebir kopya değil.
- Hosting ortamı çok kısıtlı (paylaşımlı, ~120 process/thread limiti,
  shell erişimi yok, cron yok, child_process/native modüller güvenilmez)
  — yeni bağımlılık eklerken bu kısıtlar mutlaka göz önünde bulundurulmalı.
