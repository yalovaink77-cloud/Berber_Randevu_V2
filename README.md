# Berber Randevu Sistemi

WhatsApp üzerinden AI destekli randevu alma ve berber yönetim paneli.

## Özellikler

- **WhatsApp Bot** — Müşteriler WhatsApp'tan mesaj atarak randevu alır; AI (Gemini / Meta Llama / Claude) doğal dil isteğini analiz eder
- **Berber Paneli** — Web tabanlı yönetim: randevular, hizmetler, müşteri rehberi, kaçan aramalar
- **JWT Kimlik Doğrulama** — Berber ve müşteri rolleri; güvenli oturum
- **Çakışma Kontrolü** — Aynı saatte çift randevu engellenir
- **Müsait Saat Hesabı** — Berberin çalışma günleri ve saatlerine göre
- **Güvenlik** — Helmet, CORS whitelist, rate limiting, webhook imza doğrulaması

---

## Hızlı Başlangıç

### Gereksinimler

- Node.js 20+
- MongoDB (yerel veya Atlas)
- Meta WhatsApp Business API (opsiyonel; yoksa simülasyon modu çalışır)
- En az bir AI sağlayıcı anahtarı (Gemini önerilir)

### Kurulum

```bash
git clone <repo-url>
cd berber-randevu-sistemi_V2_google_ai
npm install

cp .env.example .env
# .env dosyasını doldurun (aşağıdaki Ortam Değişkenleri bölümüne bakın)

node index.js
```

Panel: `http://localhost:3000`

---

## Ortam Değişkenleri

`.env.example` dosyasını kopyalayın ve tüm alanları doldurun:

| Değişken | Zorunlu | Açıklama |
|---|:---:|---|
| `PORT` | — | Varsayılan: 3000 |
| `NODE_ENV` | — | `development` \| `production` |
| `ALLOWED_ORIGINS` | ✓ | CORS whitelist (virgülle ayrılmış) |
| `MONGODB_URI` | ✓ | MongoDB bağlantı URI |
| `JWT_SECRET` | ✓ | En az 32 karakter rastgele string |
| `JWT_EXPIRES_IN` | — | Varsayılan: `7d` |
| `GEMINI_API_KEY` | * | Google Gemini API anahtarı |
| `META_AI_API_KEY` | * | Meta Llama API anahtarı |
| `CLAUDE_API_KEY` | * | Anthropic Claude API anahtarı |
| `META_ACCESS_TOKEN` | * | WhatsApp Cloud API token |
| `META_PHONE_NUMBER_ID` | * | WhatsApp telefon numarası ID |
| `META_VERIFY_TOKEN` | * | Webhook doğrulama token'ı |
| `META_APP_SECRET` | ✓ (prod) | Webhook imza doğrulaması için — production'da zorunlu |
| `ALLOW_BARBER_REGISTRATION` | — | Varsayılan: `false` |
| `BUSINESS_HOURS_START` | — | Varsayılan: 9 (berber profil ayarı öncelikli) |
| `BUSINESS_HOURS_END` | — | Varsayılan: 20 |
| `DEMO_BARBER_PHONE` | ✓ | Demo berber telefonu |
| `DEMO_BARBER_PASSWORD` | ✓ | Demo berber şifresi (en az 8 karakter) |

> \* En az bir AI anahtarı ve en az bir WhatsApp anahtarı gereklidir. WhatsApp anahtarı yoksa simülasyon modu devreye girer.

JWT_SECRET üretmek için:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## API Uç Noktaları

### Auth — `/api/auth`

| Metod | Yol | Açıklama |
|---|---|---|
| POST | `/register` | Kullanıcı kaydı |
| POST | `/login` | Giriş → JWT döner |
| GET | `/me` | Token sahibinin profili |

### Randevular — `/api/appointments` (JWT zorunlu)

| Metod | Yol | Yetki |
|---|---|---|
| POST | `/` | Herhangi giriş yapmış |
| GET | `/:id` | İlgili taraf veya berber |
| PUT | `/:id` | İlgili taraf veya berber |
| DELETE | `/:id` | İlgili taraf veya berber |
| GET | `/customer/:customerId` | Kendisi veya berber |
| GET | `/barber/:barberId` | Yalnızca o berber |
| GET | `/barber/:barberId/upcoming` | Yalnızca o berber |
| GET | `/barber/:barberId/available-slots?date=YYYY-MM-DD` | Herhangi giriş yapmış |

### Hizmetler — `/api/services` (JWT zorunlu)

| Metod | Yol | Yetki |
|---|---|---|
| GET | `/list` | Herhangi giriş yapmış |
| POST | `/create` | Yalnızca berber |
| PUT | `/update/:id` | Yalnızca berber |
| DELETE | `/delete/:id` | Yalnızca berber |

### Asistan — `/api/assistant` (JWT + berber zorunlu)

| Metod | Yol | Açıklama |
|---|---|---|
| GET | `/profile` | Berber profili |
| PUT | `/profile` | Profil güncelle |
| GET | `/contacts` | Müşteri rehberi |
| GET | `/missed-calls` | Kaçan aramalar |
| POST | `/simulate` | WhatsApp simülasyonu |

### Webhook

| Metod | Yol | Açıklama |
|---|---|---|
| GET | `/webhook/whatsapp` | Meta doğrulama challenge |
| POST | `/webhook/whatsapp` | Gelen mesajlar (imza doğrulamalı) |

### Health

```
GET /health → { status: "OK", timestamp: "..." }
```

---

## Deployment

### Docker (Önerilen)

```bash
# .env dosyasını oluşturun ve doldurun
cp .env.example .env

# Başlat
docker compose up -d

# Loglar
docker compose logs -f app
```

### PM2 (VPS/Bare Metal)

```bash
npm install -g pm2

# Production başlat
pm2 start ecosystem.config.js --env production

# Sistem açılışında otomatik başlat
pm2 startup
pm2 save
```

### Nginx

`nginx/nginx.conf` dosyasını düzenleyip `YOUR_DOMAIN.com` alanını değiştirin:

```bash
sudo cp nginx/nginx.conf /etc/nginx/sites-available/berber-randevu
sudo ln -s /etc/nginx/sites-available/berber-randevu /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# SSL (Certbot)
sudo certbot --nginx -d YOUR_DOMAIN.com
```

---

## WhatsApp Kurulumu

`META_SETUP.md` dosyasına bakın. Webhook URL'si:

```
https://YOUR_DOMAIN.com/webhook/whatsapp
```

---

## Proje Yapısı

```
├── index.js                  # Express sunucu + middleware
├── dashboard/
│   ├── routes.js             # Randevu API
│   ├── serviceRoutes.js      # Hizmet API
│   ├── authRoutes.js         # Auth API
│   ├── assistantRoutes.js    # Asistan API
│   └── public/index.html     # Berber yönetim paneli (vanilla JS)
├── logic/
│   └── appointmentLogic.js   # Randevu iş kuralları
├── models/                   # Mongoose şemaları
├── services/                 # AI, WhatsApp, auth, veritabanı servisleri
├── middleware/auth.js         # JWT + rol middleware
├── data/                     # Seed verileri
├── Dockerfile
├── docker-compose.yml
├── ecosystem.config.js        # PM2
└── nginx/nginx.conf           # Nginx örnek config
```

---

## Güvenlik Notları

- `JWT_SECRET` en az 32 karakter rastgele değer olmalı
- Production'da `META_APP_SECRET` zorunludur — sunucu başlamaz
- `ALLOW_BARBER_REGISTRATION=false` production için önerilir
- Berber şifreleri bcrypt 12 round ile hashlenir
- Rate limiting: auth 20 istek/15dk, genel 120 istek/dk
- Tüm randevu ve hizmet endpoint'leri JWT korumalı
