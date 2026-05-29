const { v4: uuidv4 } = require('uuid');

const SERVICES = [
  // ===== BERBER =====
  { businessType: 'berber', category: 'Saç', name: 'Saç Kesimi (Kısa)', code: 'berber_sac_kisa', defaultDuration: 20, priceMin: 150, priceMax: 250 },
  { businessType: 'berber', category: 'Saç', name: 'Saç Kesimi (Uzun/Model)', code: 'berber_sac_uzun', defaultDuration: 30, priceMin: 200, priceMax: 350 },
  { businessType: 'berber', category: 'Saç', name: 'Çocuk Saç Kesimi', code: 'berber_sac_cocuk', defaultDuration: 15, priceMin: 100, priceMax: 150 },
  { businessType: 'berber', category: 'Saç', name: 'Saç Yıkama + Fön', code: 'berber_sac_fon', defaultDuration: 20, priceMin: 100, priceMax: 200 },
  { businessType: 'berber', category: 'Saç', name: 'Saç Boyama', code: 'berber_sac_boya', defaultDuration: 60, priceMin: 300, priceMax: 600 },
  { businessType: 'berber', category: 'Sakal', name: 'Sakal Tıraşı (Normal)', code: 'berber_sakal_normal', defaultDuration: 15, priceMin: 100, priceMax: 200 },
  { businessType: 'berber', category: 'Sakal', name: 'Sakal Tıraşı (Şekilli)', code: 'berber_sakal_sekilli', defaultDuration: 25, priceMin: 150, priceMax: 300 },
  { businessType: 'berber', category: 'Sakal', name: 'Sakal Boyama', code: 'berber_sakal_boya', defaultDuration: 30, priceMin: 150, priceMax: 250 },
  { businessType: 'berber', category: 'Komple', name: 'Saç + Sakal Komple', code: 'berber_komple', defaultDuration: 45, priceMin: 250, priceMax: 500 },
  { businessType: 'berber', category: 'Bakım', name: 'Kaş Aldırma / Bıyık Tıraşı', code: 'berber_kas', defaultDuration: 10, priceMin: 50, priceMax: 100 },
  { businessType: 'berber', category: 'Bakım', name: 'Ense / Boyun / Sırt Tıraşı', code: 'berber_ense', defaultDuration: 10, priceMin: 50, priceMax: 100 },
  { businessType: 'berber', category: 'Bakım', name: 'Kulak / Burun Tüyü Alma', code: 'berber_tuy', defaultDuration: 10, priceMin: 50, priceMax: 100 },
  { businessType: 'berber', category: 'Bakım', name: 'Komple Cilt Bakımı / Peeling', code: 'berber_cilt', defaultDuration: 30, priceMin: 200, priceMax: 400 },

  // ===== KUAFÖR =====
  { businessType: 'kuafor', category: 'Saç Kesimi', name: 'Saç Kesimi (Kısa)', code: 'kuafor_sac_kisa', defaultDuration: 30, priceMin: 200, priceMax: 400 },
  { businessType: 'kuafor', category: 'Saç Kesimi', name: 'Saç Kesimi (Uzun/Kat)', code: 'kuafor_sac_uzun', defaultDuration: 45, priceMin: 300, priceMax: 600 },
  { businessType: 'kuafor', category: 'Saç Kesimi', name: 'Çocuk Saç Kesimi', code: 'kuafor_sac_cocuk', defaultDuration: 20, priceMin: 150, priceMax: 250 },
  { businessType: 'kuafor', category: 'Renk', name: 'Saç Boyama (Tek Renk)', code: 'kuafor_boya_tekrenk', defaultDuration: 90, priceMin: 400, priceMax: 800 },
  { businessType: 'kuafor', category: 'Renk', name: 'Röfle / Meche / Perçem', code: 'kuafor_rofle', defaultDuration: 120, priceMin: 500, priceMax: 1200 },
  { businessType: 'kuafor', category: 'Renk', name: 'Ombre / Balayage / Roklama', code: 'kuafor_balayage', defaultDuration: 150, priceMin: 800, priceMax: 2000 },
  { businessType: 'kuafor', category: 'Şekillendirme', name: 'Fön', code: 'kuafor_fon', defaultDuration: 30, priceMin: 200, priceMax: 400 },
  { businessType: 'kuafor', category: 'Şekillendirme', name: 'Maşa / Bukle', code: 'kuafor_masa', defaultDuration: 45, priceMin: 250, priceMax: 500 },
  { businessType: 'kuafor', category: 'Şekillendirme', name: 'Topuz / Örgü', code: 'kuafor_topuz', defaultDuration: 45, priceMin: 300, priceMax: 600 },
  { businessType: 'kuafor', category: 'Şekillendirme', name: 'Gelin Saçı', code: 'kuafor_gelin_sac', defaultDuration: 120, priceMin: 1000, priceMax: 3000 },
  { businessType: 'kuafor', category: 'Bakım', name: 'Keratin Bakımı', code: 'kuafor_keratin', defaultDuration: 120, priceMin: 800, priceMax: 2000 },
  { businessType: 'kuafor', category: 'Bakım', name: 'Protein / Saç Botoksu', code: 'kuafor_protein', defaultDuration: 90, priceMin: 600, priceMax: 1500 },
  { businessType: 'kuafor', category: 'Makyaj', name: 'Gelin Makyajı', code: 'kuafor_gelin_makyaj', defaultDuration: 90, priceMin: 1000, priceMax: 3000 },
  { businessType: 'kuafor', category: 'Diğer', name: 'Kaş Tasarımı / Kirpik Lifting', code: 'kuafor_kas_kirpik', defaultDuration: 30, priceMin: 200, priceMax: 500 },

  // ===== GÜZELLİK MERKEZİ =====
  { businessType: 'guzellik_merkezi', category: 'Cilt Bakımı', name: 'Temel Cilt Bakımı', code: 'gm_cilt_temel', defaultDuration: 60, priceMin: 400, priceMax: 800 },
  { businessType: 'guzellik_merkezi', category: 'Cilt Bakımı', name: 'Derin Temizlik / Peeling', code: 'gm_cilt_peeling', defaultDuration: 60, priceMin: 500, priceMax: 1000 },
  { businessType: 'guzellik_merkezi', category: 'Cilt Bakımı', name: 'Anti-Aging Bakım', code: 'gm_antiaging', defaultDuration: 75, priceMin: 800, priceMax: 2000 },
  { businessType: 'guzellik_merkezi', category: 'Cilt Bakımı', name: 'Akne Bakımı', code: 'gm_akne', defaultDuration: 60, priceMin: 500, priceMax: 1000 },
  { businessType: 'guzellik_merkezi', category: 'Cilt Bakımı', name: 'Hydrafacial', code: 'gm_hydrafacial', defaultDuration: 60, priceMin: 800, priceMax: 1500 },
  { businessType: 'guzellik_merkezi', category: 'Vücut', name: 'Vücut Sıkılaştırma (RF)', code: 'gm_rf', defaultDuration: 60, priceMin: 600, priceMax: 1500 },
  { businessType: 'guzellik_merkezi', category: 'Vücut', name: 'Selülit / Zayıflama (G5/Lipoliz)', code: 'gm_selulit', defaultDuration: 60, priceMin: 500, priceMax: 1200 },
  { businessType: 'guzellik_merkezi', category: 'Vücut', name: 'Lazer Epilasyon (Bölgesel)', code: 'gm_lazer_bolge', defaultDuration: 30, priceMin: 300, priceMax: 800 },
  { businessType: 'guzellik_merkezi', category: 'Vücut', name: 'Lazer Epilasyon (Full Body)', code: 'gm_lazer_full', defaultDuration: 90, priceMin: 1500, priceMax: 4000 },
  { businessType: 'guzellik_merkezi', category: 'Vücut', name: 'Ağda (Bölgesel)', code: 'gm_agda_bolge', defaultDuration: 20, priceMin: 100, priceMax: 300 },
  { businessType: 'guzellik_merkezi', category: 'Tırnak', name: 'Manikür', code: 'gm_manikur', defaultDuration: 30, priceMin: 150, priceMax: 300 },
  { businessType: 'guzellik_merkezi', category: 'Tırnak', name: 'Pedikür', code: 'gm_pedikur', defaultDuration: 45, priceMin: 200, priceMax: 400 },
  { businessType: 'guzellik_merkezi', category: 'Tırnak', name: 'Kalıcı Oje', code: 'gm_kalici_oje', defaultDuration: 45, priceMin: 200, priceMax: 400 },
  { businessType: 'guzellik_merkezi', category: 'Tırnak', name: 'Protez Tırnak (Akrilik/Jel)', code: 'gm_protez_tirnak', defaultDuration: 90, priceMin: 400, priceMax: 1000 },
  { businessType: 'guzellik_merkezi', category: 'Tırnak', name: 'Nail Art / Tırnak Tasarımı', code: 'gm_nail_art', defaultDuration: 60, priceMin: 300, priceMax: 800 },
  { businessType: 'guzellik_merkezi', category: 'Kalıcı Makyaj', name: 'Microblading / Kaş Tasarımı', code: 'gm_microblading', defaultDuration: 120, priceMin: 1500, priceMax: 4000 },
  { businessType: 'guzellik_merkezi', category: 'Kalıcı Makyaj', name: 'Kalıcı Dudak / Eyeliner', code: 'gm_kalici_makyaj', defaultDuration: 90, priceMin: 1000, priceMax: 3000 },
  { businessType: 'guzellik_merkezi', category: 'Makyaj', name: 'Günlük / Özel Makyaj', code: 'gm_makyaj', defaultDuration: 60, priceMin: 400, priceMax: 1000 },
  { businessType: 'guzellik_merkezi', category: 'Makyaj', name: 'Gelin Makyajı', code: 'gm_gelin_makyaj', defaultDuration: 120, priceMin: 1500, priceMax: 5000 },
  { businessType: 'guzellik_merkezi', category: 'Diğer', name: 'Kirpik Lifting / İpek Kirpik', code: 'gm_kirpik', defaultDuration: 60, priceMin: 400, priceMax: 1000 },
  { businessType: 'guzellik_merkezi', category: 'Diğer', name: 'Masaj (Klasik/Aromatik)', code: 'gm_masaj', defaultDuration: 60, priceMin: 400, priceMax: 1000 },
];

module.exports = SERVICES.map(s => ({ ...s, id: uuidv4() }));
