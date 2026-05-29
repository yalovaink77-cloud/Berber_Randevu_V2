# Berber Randevu Sistemi 📅✂️

Meta WhatsApp Cloud API, Meta AI (Llama) ve MongoDB kullanarak geliştirilmiş tam işlevli berber randevu yönetim sistemi.

## 🎯 Özellikler

### Temel Fonksiyonlar
✅ **Randevu Yönetimi**
- Yeni randevu oluştur
- Randevu düzenle ve iptal et
- Çakışma kontrolü (iki randevu aynı anda olamaz)
- Berber takvimi ve günlük program

✅ **WhatsApp Bildirimleri (Meta Cloud API)**
- Randevu onayı mesajı
- İnteraktif konuşma ile randevu alma
- Randevu iptal bildirisi
- Berber'e müşteri bildirimi

✅ **Yapay Zeka Entegrasyonu (Meta AI + Claude fallback)**
- Müşteri talebini otomatik analiz et
- Randevu kayıtlarından özet oluştur
- Planlama önerileri
- Geri bildirim analizi

✅ **Veri Yönetimi (MongoDB)**
- Kullanıcı profilleri (berber ve müşteri)
- Randevu kayıtları
- Hizmet geçmişi
- İş analitikleri

## 📁 Proje Yapısı

```
berber_randevu/
├── index.js                    # Ana sunucu dosyası
├── package.json                # Bağımlılıklar
├── .env                        # Çevre değişkenleri
├── .env.example                # Örnek .env
│
├── models/                     # Veri modelleri
│   ├── User.js                # Kullanıcı (Berber/Müşteri)
│   └── Appointment.js         # Randevu
│
├── services/                   # Harici servisleri
│   ├── databaseService.js     # MongoDB işlemleri
│   ├── whatsappService.js     # WhatsApp mesajlaşma (Meta Cloud API)
│   ├── conversationService.js # Konuşma yönetimi
│   └── aiService.js           # Claude AI entegrasyonu
│
├── logic/                      # İş mantığı
│   └── appointmentLogic.js    # Randevu işlemleri
│
└── dashboard/                  # API Routes
    └── routes.js              # REST API endpoints
```

## 🚀 Başlangıç

### 1. Bağımlılıkları Yükle
```bash
npm install
```

### 2. Ortam Değişkenlerini Ayarla
`.env` dosyasını `.env.example` dan kopyala ve API anahtarlarını gir:

```bash
# Meta WhatsApp Cloud API
META_ACCESS_TOKEN=your_meta_access_token
META_PHONE_NUMBER_ID=your_phone_number_id
META_VERIFY_TOKEN=your_verify_token_123

# AI Provider
AI_PROVIDER=auto

# Meta AI
META_AI_API_KEY=your_meta_ai_api_key
META_AI_BASE_URL=https://api.llama.com/compat/v1
META_AI_MODEL=Llama-4-Maverick-17B-128E-Instruct
AI_REQUEST_TIMEOUT_MS=30000

# Maliyet optimizasyonu
AI_CONVERSATION_HISTORY_LIMIT=4
AI_HEURISTIC_REQUEST_PARSING=true
AI_HEURISTIC_FEEDBACK_PARSING=true
AI_SUMMARY_WITH_MODEL=false

# Claude AI (opsiyonel fallback)
CLAUDE_API_KEY=sk-ant-xxxxx

# MongoDB
MONGODB_URI=mongodb://localhost:27017/berber_randevu

# Server
PORT=3000
NODE_ENV=development

# İş Saatleri
BUSINESS_HOURS_START=10
BUSINESS_HOURS_END=20
```

**Meta Cloud API Kurulumu için:** [META_SETUP.md](./META_SETUP.md) dosyasına bakın.

### 3. Sunucuyu Başlat
```bash
npm start
```

Sunucu `http://localhost:3000` de çalışmaya başlar.

## 📡 API Endpoints

### Randevu İşlemleri

`POST /api/appointments` - Yeni randevu oluştur
```json
{
  "customerId": "uuid",
  "customerName": "Ahmet Yilmaz",
  "customerPhone": "+905551234567",
  "barberId": "uuid",
  "barberName": "Mehmet",
  "serviceType": "haircut",
  "appointmentDate": "2024-03-15T14:30:00Z",
  "duration": 30,
  "notes": "Kısa kesim istiyorum",
  "price": 150
}
```

`GET /api/appointments/:id` - Randevu detayları al

`GET /api/appointments/customer/:customerId` - Müşterinin randevuları

`GET /api/appointments/barber/:barberId` - Berber'in randevuları

`PUT /api/appointments/:id` - Randevuyu güncelle

`DELETE /api/appointments/:id` - Randevuyu iptal et

### Kullanılabilir Saatler

`GET /api/appointments/barber/:barberId/available-slots?date=2024-03-15&duration=30`
- Belirli bir gün için boş saatleri listele

`GET /api/appointments/barber/:barberId/upcoming?days=7`
- Sonraki 7 gün için yaklaşan randevuları al

### Diğer

`POST /api/appointments/send-reminders` - Yarın randevuları olanları hatırlat

`GET /health` - Sunucu sağlık kontrolü

## 🛠️ Teknik Stack

| Teknoloji | Amaç |
|-----------|------|
| **Node.js + Express** | Web sunucusu |
| **MongoDB + Mongoose** | Veri tabanı |
| **Meta WhatsApp Cloud API** | WhatsApp mesajlaşma |
| **Meta AI (Llama)** | AI konuşma ve analiz |
| **Anthropic AI (opsiyonel)** | Fallback AI sağlayıcısı |
| **Axios** | HTTP istekleri |
| **dotenv** | Ortam değişkenleri |
| **UUID** | Benzersiz ID üretimi |

## 🔑 Temel Dosya Açıklamaları

### `services/databaseService.js`
Tüm MongoDB işlemlerini merkezi olarak yönetir:
- Kullanıcı oluştur/getir/güncelle
- Randevu CRUD işlemleri
- Boş saatler sorgulama
- Tarih bazlı randevu listesi

### `services/whatsappService.js`
Meta WhatsApp Cloud API ile mesajlaşma:
- WhatsApp mesajı gönderme
- Webhook doğrulama
- Gelen mesajları parse etme
- Şablon mesajları gönderme

### `services/conversationService.js`
Stateful konuşma yönetimi:
- Çok adımlı diyalog yönetimi
- Konuşma durumları (initial → completed)
- Kullanıcı cevaplarını saklama
- Randevu verilerini toplama

### `services/aiService.js`
Meta AI ile entegrasyon (Claude fallback destekli):
- Müşteri talebini anlama ve hizmet türü tahmin etme
- Randevu özetleri oluşturma
- Haftalık planlama önerileri
- Geri bildirim analizi

Not: Düşük maliyet için basit talep/geri bildirimlerde yerel kural analizi devrededir. `AI_SUMMARY_WITH_MODEL=false` ise randevu özeti AI'a gitmez.

### `logic/appointmentLogic.js`
Karmaşık iş kurallarıyla çakışma kontrol:
- Samat çakışmaları engelleme
- Müşteri talebinden otomatik randevu oluşturma
- Hatırlatma gönderme
- Kullanılabilir saatleri hesaplama

## 💡 Kullanım Örnekleri

### Yeni Randevu Oluştur (cURL)
```bash
curl -X POST http://localhost:3000/api/appointments \
  -H "Content-Type: application/json" \
  -d '{
    "customerId": "cust-123",
    "customerName": "Ali Demir",
    "customerPhone": "+905551234567",
    "barberId": "barber-456",
    "barberName": "Merhmet Kaya",
    "serviceType": "haircut",
    "appointmentDate": "2024-03-15T14:00:00Z",
    "duration": 30,
    "price": 150
  }'
```

### Boş Saatleri Getir
```bash
curl http://localhost:3000/api/appointments/barber/barber-456/available-slots?date=2024-03-15&duration=30
```

### WhatsApp Webhook Testi
```bash
# Webhook doğrulama
curl "http://localhost:3000/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=your_verify_token_123&hub.challenge=TEST123"
# Çıktı: TEST123
```

## 🧪 Test Etme

### 1. Sunucunun Çalışıp Çalışmadığını Kontrol Et
```bash
curl http://localhost:3000/health
# Çıktı: {"status":"OK","message":"Berber Randevu Sistemi çalışıyor"}
```

### 2. MongoDB Bağlantısını Kontrol Et
Sunucu başlarken MongoDB bağlantı mesajını gözlemle:
```
✅ MongoDB bağlantısı başarılı
🚀 Sunucu 3000 portında çalışıyor
```

## 🔒 Güvenlik Notları

- `.env` dosyasını asla commit etme (`.gitignore` ye ekli)
- API anahtarlarını güvenli bir yerde sakla
- Production'da environment değişkenlerini kullan
- Rate limiting ve authentication eklemek önerilir

## 🚧 Gelecek Geliştirmeler

- [ ] Kimlik doğrulama (JWT)
- [ ] Web ve mobil dashboard (React/Vue)
- [ ] Google Calendar entegrasyonu
- [ ] Ödeme sistemi (Stripe/PayPal)
- [ ] Müşteri puanlama ve yorumları
- [ ] WebSocket ile gerçek zamanlı bildirimler
- [ ] Email notifications
- [ ] Multi-language desteği

## 📞 Destek

Sorularınız için proje sahibine ulaşın.

---

**Geliştirme Tarihi:** 7 Mart 2026  
**Sürüm:** 2.0.0 (Meta Cloud API)

---

## 📚 Ek Belgeler

- [META_SETUP.md](./META_SETUP.md) - Meta WhatsApp Cloud API kurulum rehberi
- [MIGRATION.md](./MIGRATION.md) - Twilio'dan Meta'ya geçiş detayları
- [QUICKSTART.md](./QUICKSTART.md) - Hızlı başlangıç kılavuzu
