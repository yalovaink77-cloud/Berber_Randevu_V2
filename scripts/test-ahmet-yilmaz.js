#!/usr/bin/env node
/**
 * Ahmet Yılmaz senaryosu — hikaye uyumlu uçtan uca test
 * Kullanım: node scripts/test-ahmet-yilmaz.js
 */
require('dotenv').config();
const readline = require('readline');

const BASE = process.env.TEST_BASE_URL || 'http://localhost:3000';
const AHMET = {
  name: 'Ahmet Yılmaz',
  phone: '+905051234567',
  password: 'AhmetTest123!',
  customerId: 'demo-+905051234567',
};
const BARBER = {
  phone: process.env.DEMO_BARBER_PHONE || '+905551112233',
  password: process.env.DEMO_BARBER_PASSWORD || 'DemoPass123!',
};

const c = {
  reset: '\x1b[0m', dim: '\x1b[2m', bold: '\x1b[1m',
  green: '\x1b[32m', yellow: '\x1b[33m', cyan: '\x1b[36m', magenta: '\x1b[35m',
};

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function api(method, path, { token, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

function tomorrowYmd() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0];
}

function say(who, text) {
  const icon = who === 'Ahmet' ? '👤' : who === 'Asistan' ? '🤖' : '📋';
  const color = who === 'Ahmet' ? c.cyan : who === 'Asistan' ? c.magenta : c.yellow;
  console.log(`${color}${icon} ${who}:${c.reset} ${text}`);
}

function pause(text) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(`${c.dim}${text}${c.reset}`, () => { rl.close(); resolve(); }));
}

async function main() {
  console.log(`\n${c.bold}══════════════════════════════════════════════${c.reset}`);
  console.log(`${c.bold}   AHmet YILMAZ — HİKÂYE SENARYOSU TESTİ${c.reset}`);
  console.log(`${c.bold}══════════════════════════════════════════════${c.reset}\n`);

  // ── Sahne 1: Ahmet telefonu eline alır ──
  say('Anlatıcı', 'Yalova’da bir akşam. Ahmet Yılmaz telefonu eline alıyor…');
  await pause('\nDevam etmek için Enter…\n');

  say('Ahmet', 'Selam, yarın saç kesimi randevusu alabilir miyim?');
  await sleep(600);

  // Berber token (simülatör paneli gibi)
  const barberLogin = await api('POST', '/api/auth/login', {
    body: { phone: BARBER.phone, password: BARBER.password },
  });
  if (!barberLogin.data.token) {
    console.error('❌ Berber girişi başarısız:', barberLogin.data);
    process.exit(1);
  }
  const barberToken = barberLogin.data.token;
  const barberId = barberLogin.data.user.id;

  // WhatsApp simülasyonu
  const sim = await api('POST', '/api/assistant/simulate-message', {
    token: barberToken,
    body: { phone: AHMET.phone, message: 'Selam, yarın saç kesimi randevusu alabilir miyim?' },
  });

  const history = sim.data.history || [];
  const lastAssistant = [...history].reverse().find(m => m.role === 'assistant');
  if (lastAssistant && !lastAssistant.content.includes('yoğunuz')) {
    say('Asistan', lastAssistant.content);
  } else {
    say('Asistan', '(AI anahtarı yok — yerel kural modu devreye giriyor)');
    // Müsait slotları hesapla
    const slotsRes = await api('GET',
      `/api/appointments/barber/${barberId}/available-slots?date=${tomorrowYmd()}&duration=30`,
      { token: barberToken }
    );
    const slots = slotsRes.data.slots || [];
    const pick = slots.find(s => {
      const h = new Date(s.start).getHours();
      return h === 14 || h === 16;
    }) || slots[0];
    if (pick) {
      const t = new Date(pick.start).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
      const t2 = slots.find(s => new Date(s.start).getHours() === 16)?.start;
      const alt = t2 ? new Date(t2).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '16:30';
      say('Asistan', `Merhaba Ahmet Bey! Yarın için müsait saatlerimiz var. ${t} veya ${alt} size uygun mu?`);
    } else {
      say('Asistan', 'Yarın için maalesef boş slot kalmamış.');
    }
  }

  await pause('\nAhmet cevap yazıyor… Enter…\n');
  say('Ahmet', '14:00 uyar, olur.');
  await sleep(400);

  // ── Sahne 2: Randevu oluştur ──
  const apptDate = `${tomorrowYmd()}T14:00:00`;
  const create = await api('POST', '/api/appointments', {
    token: barberToken,
    body: {
      customerId: AHMET.customerId,
      customerName: AHMET.name,
      customerPhone: AHMET.phone,
      barberId,
      barberName: barberLogin.data.user.name,
      serviceType: 'haircut',
      appointmentDate: apptDate,
      duration: 30,
      price: 250,
      notes: 'Kısa model kesim — hikaye testi',
    },
  });

  if (create.status === 201) {
    say('Asistan', `Randevunuz alındı! Yarın saat 14:00 — Gökhan Berber. Teşekkürler Ahmet Bey.`);
    say('Sistem', `Randevu ID: ${create.data.appointment?.id || '—'}`);
  } else if (create.data.error?.includes('mesgul')) {
    say('Asistan', 'Saat 14:00 dolu görünüyor. Alternatif saat deneniyor…');
    const alt = `${tomorrowYmd()}T16:30:00`;
    const retry = await api('POST', '/api/appointments', {
      token: barberToken,
      body: {
        customerId: AHMET.customerId,
        customerName: AHMET.name,
        customerPhone: AHMET.phone,
        barberId,
        barberName: barberLogin.data.user.name,
        serviceType: 'haircut',
        appointmentDate: alt,
        duration: 30,
        price: 250,
      },
    });
    if (retry.status === 201) {
      say('Asistan', '16:30 için randevunuz oluşturuldu.');
    } else {
      console.log('❌ Randevu oluşturulamadı:', retry.data);
    }
  } else {
    console.log('❌ Randevu hatası:', create.data);
  }

  await pause('\nGökhan paneli açılıyor… Enter…\n');

  // ── Sahne 3: Berber takviminde görünür mü? ──
  const barberAppts = await api('GET', `/api/appointments/barber/${barberId}`, { token: barberToken });
  const ahmetAppts = (barberAppts.data || []).filter(a =>
    a.customerPhone === AHMET.phone || a.customerName?.includes('Ahmet')
  );
  say('Gökhan (panel)', `${ahmetAppts.length} Ahmet Yılmaz randevusu takvimde:`);
  ahmetAppts.slice(-3).forEach(a => {
    const d = new Date(a.appointmentDate);
    console.log(`   • ${d.toLocaleDateString('tr-TR')} ${d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })} — ${a.status} — ${a.notes || a.serviceType}`);
  });

  // ── Sahne 4: Ahmet kendi randevularını görebilir mi? ──
  await pause('\nAhmet kendi hesabına bakıyor… Enter…\n');

  // Ahmet için kullanıcı oluştur/giriş
  let ahmetToken;
  const reg = await api('POST', '/api/auth/register', {
    body: { name: AHMET.name, phone: AHMET.phone, password: AHMET.password, role: 'customer' },
  });
  if (reg.data.token) {
    ahmetToken = reg.data.token;
    say('Sistem', 'Ahmet müşteri hesabı oluşturuldu.');
  } else {
    const login = await api('POST', '/api/auth/login', {
      body: { phone: AHMET.phone, password: AHMET.password },
    });
    ahmetToken = login.data.token;
  }

  if (ahmetToken) {
    const myAppts = await api('GET', `/api/appointments/customer/${AHMET.customerId}`, { token: ahmetToken });
    if (myAppts.status === 200) {
      say('Ahmet', `Kendi randevularım: ${myAppts.data.length} kayıt`);
      myAppts.data.slice(-2).forEach(a => {
        const d = new Date(a.appointmentDate);
        console.log(`   • ${d.toLocaleDateString('tr-TR')} ${d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })} — ${a.status}`);
      });
    } else {
      say('Ahmet', `Randevularımı göremedim (${myAppts.status}): ${myAppts.data.error || ''}`);
    }

    // Güvenlik: başka berberin takvimine erişemez
    const hack = await api('GET', `/api/appointments/barber/${barberId}`, { token: ahmetToken });
    say('Güvenlik', hack.status === 403
      ? '✓ Ahmet başka berberin takvimine erişemedi (403)'
      : `⚠ Beklenmeyen durum: HTTP ${hack.status}`);
  }

  console.log(`\n${c.green}${c.bold}✓ Hikâye testi tamamlandı.${c.reset}`);
  console.log(`${c.dim}Panelden denemek için: ${BASE} → WhatsApp Simülatörü → ${AHMET.phone}${c.reset}\n`);
}

main().catch(err => {
  console.error('❌ Test hatası:', err.message);
  process.exit(1);
});
