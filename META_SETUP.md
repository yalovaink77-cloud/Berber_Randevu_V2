# Meta Cloud API Kurulum Rehberi

## 📋 Gerekli İşlemler Sırasıyla

### 1. Meta Business & Developer Hesapları

#### a) Business Account Oluştur
- [business.facebook.com](https://business.facebook.com) git
- Sign up ile yeni business hesabı oluştur
- Şirket ismini (berber/salon adı) gir

#### b) Developer Account Oluştur
- [developers.facebook.com](https://developers.facebook.com) git
- Sign up yap (Facebook hesabını kullan)
- Business account ile bağla

---

### 2. WhatsApp Business App Oluşturma

#### Meta App Dashboard'da:
1. **App Oluştur**
   - Dashboard'a git → "My Apps" → "Create App"
   - App Type: **Business**
   - App Name: `Berber Randevu Sistemi`
   - Continue

2. **WhatsApp Ürünü Ekle**
   - Oluşturulan app'e git
   - Products sayfasında **WhatsApp** ara
   - "Set Up" tıkla

3. **API Credentials Al**
   - WhatsApp'ın "API Setup" kısmına git
   - Şunları kopyala ve tut:
     - **Access Token** (aylık token değişebilir)
     - **Phone Number ID**
     - **Business Account ID**
     - **Verify Token** (sen oluşturursun - herhangi bir string)

---

### 3. Türkiye'de Telefon Numarası Kayıt

#### WhatsApp Business Dashboard'da:
1. "Phone Numbers" → "Add Number"
2. Türkiye telefon numarası gir
   - Format: `+90xxxxxxxxxx` (0 olmadan)
   - Bu berber müşterilerine görünecek numara
   
3. Number Verification
   - Email veya SMS ile doğrula
   - Bitti!

---

### 4. .env Dosyasını Ayarla

```bash
# Meta WhatsApp API
META_ACCESS_TOKEN=EAAxxxxxxxxxxxx (token buraya)
META_PHONE_NUMBER_ID=102xxxxxxxx
META_VERIFY_TOKEN=berber_webhook_token_123 (istediğin string)

# Diğer ayarlar (aynı)
CLAUDE_API_KEY=sk-ant-xxx
MONGODB_URI=mongodb://localhost:27017/berber_randevu
PORT=3000
```

---

### 5. Webhook URL'ini Meta'ya Tanıt

Meta Dashboard'da:
1. WhatsApp → Configuration
2. **Webhook** → "Edit Callback URL"

**Callback URL:** `https://yourdomain.com/webhook/whatsapp`
- Production: www.berber.com:/webhook/whatsapp
- Test (local): Buradan ngrok kullan (altta anlatılıyor)

**Verify Token:** .env'deki META_VERIFY_TOKEN ile aynı (örn: `berber_webhook_token_123`)

---

### 6. Webhook Doğrulaması (Meta Testi)

Meta otomatik olarak şuna POST atar:
```
GET /webhook/whatsapp?hub.mode=subscribe&hub.verify_token=XXX&hub.challenge=CHALLENGE
```

Sistem **CHALLENGE** string'ini return edersa, doğrulama başarılı!

Sistemimiz bunu otomatik yapıyor ✅

---

## 🧪 Lokal Test (Ngrok ile)

Evdeysen, Meta lokal server'a erişemiyor. Ngrok kullan:

### Adım 1: Ngrok Kur
```bash
# Ubuntu/Linux
curl https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-linux-amd64.tgz | tar xz
./ngrok http 3000
```

### Adım 2: Başlat
```bash
./ngrok http 3000
```

Çıkış:
```
Forwarding	https://abc123def.ngrok.io -> http://localhost:3000
```

### Adım 3: Meta'ya URL olarak gir
```
https://abc123def.ngrok.io/webhook/whatsapp
```

---

## 📝 Test: WhatsApp'tan Mesaj Gönder

Sistem canlıysa:

1. Phone Number'i 0500 test numarası (Meta sağlıyor) yap
2. WhatsApp'tan mesaj gönder: `Sac Kesimi`
3. System response: 
   ```
   Merhaba! Hangi hizmeti gormek istersiniz?
   1. Sac Kesimi
   2. Tiras
   3. Sakal Kesimi
   4. Tam Paket
   ```
4. Yanıt: `1`
5. System: Tarih sor → vb devam ediyor

Test başarı = kuruluş tamamlandı!

---

## 🔑 Token Yönetimi

### Access Token Güncellemesi
- Meta erişim tokenları ~60 gün geçerli
- Her ~45 gün'de yenile (Settings → Tokens)
- Eski token'ı silebilirsin sonra

### Security Best Practice
- .env dosyasını asla commit etme
- .env.example sadece template
- Production'da environment variable kullan (Heroku, Railway, Docker vb)

---

## 🚀 Production Deploy

### Requirements
- Domain adı (berberadi.com.tr vb)
- HTTPS sertifikası (Let's Encrypt free)
- Server (Heroku, Railway, AWS, DigitalOcean, vb)

### Adımlar
1. Projeyi server'a upload et
2. .env production credentials'lar ile doldur
3. npm install && npm start
4. Meta Dashboard'da Callback URL'ini update et (gerçek domain)

---

## ❓ Sık Sorulan Sorular

**P: Token expired oldu neee?**
- A: Access Token'ı refresh et (Meta Dashboard)

**P: Webhook doğrulama başarısız?**
- A: META_VERIFY_TOKEN .env'de yanlış
- A: Callback URL https:// ile başlıyor mı?

**P: Mesaj gönderimiyor?**
- A: Telefon numarası "Green Checkmark" alırsa doğrulanmış
- A: Mesaj +905551234567 formatında mı?

**P: Kullanıcı bloke mesajları?**
- A: Meta 24h window kuralı var — müşteri önce mesaj gönderirse, sen 24h içinde mesaj gönderebilirsin. Sonra template message kullan (önceden onaylanmış şablonlar)

---

## 📞 Meta Muhasebe (Maliyetler)

- **İlk mesaj**: $0.0085
- **Reply (24h içinde)**: Ücretsiz
- **Template Message**: $0.003
- **Türkiye**: Pahalı değil (~₺0.03-0.1 per message)

Twilio'nun $0.005 + markup yerine Meta'da doğrudan $0.0085 = **%40 tasarruf**

---

## ✅ Kurulum Kontrol Listesi

- [ ] Meta Business Account oluşturuldu
- [ ] Meta Developer App oluşturuldu  
- [ ] WhatsApp Ürünü eklendi
- [ ] Access Token ve Phone ID kopyalandı
- [ ] Türkiye numarası verified
- [ ] .env dosyası credentials'lar ile doldu
- [ ] Webhook teste geçti (curl/Postman)
- [ ] WhatsApp'tan test mesajı gönderildi
- [ ] Sistem cevap verdi
- [ ] Production deploy hazırlandı

---

**Sonraki Adım:** Yukarıdaki adımları yap, credentials'ları .env'ye gir, sistem otomatik çalışmaya başlar!

Soruların varsa: System > Logs kısmında debug mesajlarından sorun bul!
