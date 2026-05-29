# Full App Product Architecture

Bu proje tek bir randevu panelinden, berberlerin telefonla bölünmeden müşteri talebi yakaladığı tam paket bir ürüne evriliyor.

## Ürün Bileşenleri

### Mobil App
- Berberin çalışma durumunu yönetir: `available`, `working`, `break`, `closed`.
- Kaçan aramaları yakalayıp backend'e gönderir.
- Rehberden kişi import eder.
- Kişileri müşteri, aile, VIP, tedarikçi veya engelli olarak etiketler.
- Bildirim ve izin onboarding akışını taşır.

### Web Panel
- Günlük randevu programını gösterir.
- Kaçan aramaları ve otomatik cevap kararlarını listeler.
- Kişi etiketlerini yönetir.
- İşletme profili ve asistan ayarlarını düzenler.

### Backend API
- Auth ve berber hesabı yönetimi.
- Randevu CRUD ve uygun saat kontrolü.
- Kişi sınıflandırma.
- Kaçan arama karar motoru.
- WhatsApp mesaj gönderimi.

### WhatsApp Asistan
- Müşteri mesajlarını doğal dille karşılar.
- Tarih, saat, hizmet ve isim bilgisini toplar.
- Çakışma kontrolünden sonra randevuyu oluşturur.
- Berber çalışırken müşteriyi bekletmez.

## İlk Pilot Akışı

1. Berber hesap açar.
2. İşletme bilgilerini ve çalışma saatlerini girer.
3. Mobil app rehber ve çağrı izinlerini ister.
4. Berber aile/VIP kişilerini işaretler.
5. Kaçan arama olduğunda app backend'e olay gönderir.
6. Backend kişiyi sınıflandırır ve mesaj kararını üretir.
7. Bilinen müşteri WhatsApp randevu akışına yönlenir.
8. Randevu panelde görünür.

## Güvenlik Notları

- Aile/VIP kişilere randevu mesajı otomatik gönderilmez; ayar açılırsa kişisel mesaj gönderilir.
- Bilinmeyen kişilere varsayılan olarak otomatik mesaj gönderilmez, sadece öneri üretilir.
- Gerçek otomatik gönderim için berberin açık izni gerekir.
- Production ortamında `JWT_SECRET` zorunludur.
