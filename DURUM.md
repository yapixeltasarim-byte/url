# Proje Durumu (Son Güncelleme: 2026-09-11)

Bu dosya, başka bir bilgisayardan devam ederken "nerede kalmıştık" sorusuna
cevap vermek için tutuluyor. Repo: https://github.com/yapixeltasarim-byte/url

**NOT:** Bu notu yazarken repoyu push etmeden önce `git fetch` yapıldığında,
`Kadir Esen <kadir@kadiresen.com>` imzalı, bu oturumda hiç bahsi geçmemiş 5
commit'in zaten `main`'e gitmiş olduğu görüldü (aşağıdaki "Prisma kaldırıldı"
maddesi bunlardan biri). Yani birisi (muhtemelen kulüpteki bir geliştirici
veya bu projede sizinle birlikte çalışan biri) bağımsız olarak repoya erişip
önemli bir mimari değişiklik yapmış. Bu değişiklikler pull/rebase edilip
mevcut çalışma kopyasına alındı, hiçbir şey ezilmedi/kaybolmadı. Başka bir
PC'den devam ederken bunun farkında olun ve muhtemelen Kadir Esen ile
koordinasyon gerekebilir.

## Ne yapıldı

- Spesifikasyona uygun, RBAC'li, KVKK uyumlu (IP hash) URL kısaltma platformu
  sıfırdan yazıldı (domain/infra/http katmanlı mimari, EJS, CSRF, session
  tabanlı auth). **Veritabanı katmanı artık Prisma değil, doğrudan
  `better-sqlite3` (bkz. aşağıdaki "Prisma kaldırıldı" maddesi).**
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
  (`prisma/seed.js` de düzeltildi, commit `ad63831`).
- **Prisma tamamen kaldırıldı, `better-sqlite3`'e geçildi** (Kadir Esen,
  commit `908d5b6` ve devamı — bu benim oturumumda yapılmadı, repo push
  edilirken keşfedildi). Gerekçe commit mesajında birebir şöyle yazıyor:
  *"Paylaşımlı hostingde Prisma query engine nproc limitini dolduruyordu."*
  Yani argon2'den bağımsız olarak, asıl büyük NPROC/thread tüketicisinin
  Prisma'nın kendi query engine süreci olduğu tespit edilmiş. Bununla
  birlikte gelen diğer düzeltmeler:
  - `scripts/migrate.js` + `src/infra/db/migrate.js`: migration'lar artık
    process içi, tek SQLite bağlantısı üzerinden uygulanıyor.
  - "Başlangıç hatasında 503 yerine tanılayıcı yanıt dön" (commit
    `4189b86`): Git deploy `.env` taşımıyor, `process.exit` `listen`
    öncesi çağrılınca Passenger 503 veriyordu.
  - "İlk açılışta SEED_ADMIN ile admin hesabı oluştur" (`b1722df`,
    `src/domain/users/ensureFirstAdmin.js`): Git deploy seed script'i
    otomatik çalıştırmıyor, boş `users` tablosunda giriş imkansız kalıyordu
    — artık uygulama ilk açılışta `SEED_ADMIN_*` env'lerinden admin'i
    kendisi oluşturuyor.
  - "Parolada 12 karakter alt sınırını kaldır" (`2474d9f`).
- Cache-busting bug: `assetVersion` statik `package.json` sürümünden değil,
  her process başlangıcında `Date.now()`'dan geliyor artık.
- Genel Analitik ekranının veri göstermemesi: `click_events` → `click_daily`
  rollup'u için harici cron yoktu; artık process içinde 15 dakikada bir
  otomatik çalışıyor (`src/index.js` içindeki `rollupInterval`).
- `geoip-lite` ile ülke tespiti denendi, 111MB veri dosyası ~105MB RAM
  yükü getirip 504'e sebep oldu → **geri alındı**, şu an ülke bilgisi
  sadece Cloudflare `cf-ipcountry` header'ı varsa geliyor (yoksa `unknown`).

## Şu an açık / takip edilmesi gereken

- **argon2 + Prisma kaldırma sonrası Hostinger process sayısı takip
  edilmeli.** Sorun: hesap genelinde ~120 process/thread limitine yakın
  seyrediyordu (~140 rapor edilmişti). Diğer 5 site temiz bulundu
  (multi-process/cluster yok, güncelleme yok), şüphe bu app'e yöneldi.
  İki ayrı kaynak bulunup kaldırıldı: argon2 (bu oturumda) ve Prisma'nın
  query engine süreci (Kadir Esen tarafından, aynı gün/dönemde, bağımsız
  olarak). **Yapılacak: en güncel kodla (Prisma'sız, argon2'siz) Hostinger'a
  yeniden deploy edip birkaç saat/gün sonra process sayısının 120 limitinin
  altına düşüp düşmediğini kontrol et.** Düşmezse başka bir kaynak aranmalı.
- `prisma/` klasörü ve `prisma/seed.js` artık kullanılmıyor, yerine
  `scripts/seed.js` ve `scripts/migrate.js` geçti — eski Prisma dosyalarına
  bakıp kafa karışmasın.
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
