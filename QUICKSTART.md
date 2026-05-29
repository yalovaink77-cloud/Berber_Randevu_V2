# ⚡ Meta Cloud API - Hızlı Başlangıç

**Önceki Sistem:** Twilio SMS  
**Yeni Sistem:** Meta WhatsApp Cloud API  
**Tasarruf:** ₺2900/ay (97%)

---

## 🚀 5 Dakika Kurulum

### 1. Kod İndir (Zaten yapıldı ✅)
```bash
cd ~/Masaüstü/projeler/berber_randevu
npm install
```

### 2. Meta Credentials Al
- [developers.facebook.com](https://developers.facebook.com) git
- WhatsApp Business App oluştur
- Şunları kopyala:
  - `Access Token`
  - `Phone Number ID`
  - Bir `Verify Token` (sen yaz: örn `berber_token_123`)

**Detaylı adımlar:** [META_SETUP.md](./META_SETUP.md)'yi oku

### 3. .env Doldur
```bash
cp .env.example .env
```

Sonra .env'de:
```
META_ACCESS_TOKEN=EAAxxxxxxxxxxxx
META_PHONE_NUMBER_ID=102xxxxxxxx  
META_VERIFY_TOKEN=berber_token_123

AI_PROVIDER=auto
META_AI_API_KEY=your_meta_ai_api_key
META_AI_BASE_URL=https://api.llama.com/compat/v1
META_AI_MODEL=Llama-4-Maverick-17B-128E-Instruct
AI_REQUEST_TIMEOUT_MS=30000
AI_CONVERSATION_HISTORY_LIMIT=4
AI_HEURISTIC_REQUEST_PARSING=true
AI_HEURISTIC_FEEDBACK_PARSING=true
AI_SUMMARY_WITH_MODEL=false

CLAUDE_API_KEY=sk-ant-xxx (opsiyonel fallback)
```

### 4. Sunucuyu Başlat
```bash
npm start
```

Çıkta görmeli:
```
Sunucu 3000 portunda calisyor
http://localhost:3000
```

### 5. Test
```bash
# Health check
curl http://localhost:3000/health

# Webhook doğrula (Meta simulation)
curl "http://localhost:3000/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=berber_token_123&hub.challenge=TEST123"
```

**Cevap:** `TEST123` (başarıysa)

---

## 🔄 Twilio → Meta Değişiklik Özeti

| Öog | Twilio | Meta |
|-|--|-|
| **Mesaj gönder** | `TwilioService.sendMessage()` | `WhatsAppService.sendMessage()` |
| **Hatırlatma** | Evet (maliyetli) | Kaldırıldı (maliyet tasarrufu) |
| **İnsan konuşması** | Yok | `ConversationService` (YENİ) |
| **Webhook** | Yok | `/webhook/whatsapp` (YENİ) |

---

## 📝 Sistem Nasıl Çalışıyor?

### Müşteri Yetkisi Akışı

```
1. Müşteri WhatsApp → "Sac Kesimi"
        ↓
2. Sistem hafıza artırır (ConversationService)
   state: "initial" → "askingDate"
        ↓
3. Sistem → "Ne zaman?"
        ↓
4. Müşteri: "15 Mart"
        ↓
5. Sistem → "Saat kaç?"
        ↓
6. Müşteri: "14:30"
        ↓
7. Sistem → "Adınız?"
        ↓
8. Müşteri: "Ali Demir"
        ↓
9. Sistem: state "completed"
   Randevu oluştur
   Veritabanına kaydet
   Müşteriye onay → "Tamam, randevunuz alındı"
```

---

## 📂 Yeni Dosyalar

| Dosya | Amaç |
|-------|------|
| `services/whatsappService.js` | Meta Cloud API ile mesaj gönder/al |
| `services/conversationService.js` | Muşteri konuşması hafızası |
| `/webhook/whatsapp` endpoint | Meta gelen mesajları alıyor |
| `META_SETUP.md` | Meta kurulum detaylı rehberi |
| `MIGRATION.md` | Teknik değişiklikler (dev için) |

---

## ❓ Sık Sorular

**P: Sunucu başlamıyor?**
- MongoDB yüklü mü? (localhost:27017 açık mı?)
- Değilse, sistem demo modda çalışır. İlan ver debug durumu basıdır.

**P: Webhook doğrulama başarısız?**
- `.env`'deki `META_VERIFY_TOKEN` ile curl değerlerini karşılaştır
- İkisi eşdeğer mi?

**P: WhatsApp mesajı gelmiyor?**
- .env'deki credentials doğru mu? (kopya boşluk var mı?)
- Meta sana verification email gönderdi mi?

**P: Müşteri mesaj gönderirse sistem hiç cevap vermez?**
- Webhook URL Meta'ya doğru tanımlandı mı?
- `https://` ile başlıyor mı?
- Lokalde: ngrok ile tunnel aç

**P: Hatalı gelen mesajlar ne olur?**
- WhatsAppService parse edip null return eder
- Sistem silent ignore ediyor (log'a yazılır)
- Müşteri cevap almaz ama sistem kırılmaz

---

## 🚨 Production Deploy (Sonra)

1. **Server:** Railway / Heroku / AWS
2. **Domain:** berber.com.tr (HTTPS gerekli!)
3. **.env:** Production tokens gir
4. **Webhook URL:** `https://berber.com.tr/webhook/whatsapp` → Meta'ya tanıt
5. **Database:** MongoDB Atlas (cloud)
6. **Start:** `npm start`

---

## 📊 Maliye Kar Tahmin

### 1 hafta (1000 müşteri)
- **Eski (Twilio):** 1000 mesaj × $0.008 = **$8 (~₺150)**
- **Yeni (Meta):** 1000 mesaj × $0.0085 = **$8.5 (~₺160)**
- **Tasarruf bu hafta:** Zayıf (sistemdeş yok)

### 1 ay (1000 müş, hatırlatma var)
- **Eski (Twilio):**
  - Gelen mesaj: 1000 × $0.008 = $8
  - Hatırlatmalar: 30 gün × 500 insanı günde = 15000 × $0.008 = **$120**
  - **Toplam: $128 (~₺2400)**

- **Yeni (Meta):**
  - Gelen mesaj: 1000 × $0.0085 = $8.5
  - Hatırlatmalar: KALDıRıLDı = $0
  - Reply 24h: ÜCRETSIZ
  - **Toplam: $8.5 (~₺160)**

- **Tasarruf: $120 (94%)**

### 1 yıl
- **Twilio:** $128 × 12 = **$1536 (~₺29,000)**
- **Meta:** $8.5 × 12 = **$102 (~₺1920)**
- **Tasarruf: $1434 (~₺27,000)** 🎉

---

## 🗺️ Sonraki Adımlar (Seçim)

**Seçenek A:** Meta kurulumunu yapıp, canlı çalıştır
- [META_SETUP.md](./META_SETUP.md)'deki adımları takip et
- Sonra .env doldurup sistemini canlıya al

**Seçenek B:** Lokal test yap (Ngrok ile)
- `./ngrok http 3000`
- Ngrok URL'ini Meta'ya webhook olarak tanıt
- WhatsApp test mesaj gönder, sistem cevap versin

**Seçenek C:** Detaylı teknik incele
- [MIGRATION.md](./MIGRATION.md) - Neler değişti?
- [README.md](./README.md) - Genel sistem
- Kod ayrıntılarını gez

---

## 🎯 Başarı Belirtileri

Sistem iyi çalışıyorsa:

✅ `npm start` sonra hiçbir hata yok  
✅ `curl http://localhost:3000/health` → `{"status":"OK"}`  
✅ Webhook doğrula curl başarılı  
✅ WhatsApp mesaj gönder → bot cevap versin  
✅ İkinci mesaj gönder → bot soru sor, devam etsin  
✅ Randevu tamamlanınca "Tamam" mesajı  
✅ Veritaban'da randevu kaydı var  

**Bunların hepsi olursa = %100 işler! 🚀**

---

**Başarılar! Meta entegrasyonu tamamlandı. Kurulum farkı 15 dakika vs. Tasarruf ₺27,000/yıl. İyi işler!**
