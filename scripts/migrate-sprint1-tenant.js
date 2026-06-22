#!/usr/bin/env node
/**
 * Sprint 1 tenant migration — idempotent.
 *
 * Kullanım:
 *   node scripts/migrate-sprint1-tenant.js --dry-run
 *   node scripts/migrate-sprint1-tenant.js
 *
 * Önce: mongodump ile yedek alın.
 */
require('dotenv').config();
const mongoose = require('mongoose');

const DRY_RUN = process.argv.includes('--dry-run');

const DEMO_BARBER_ID = process.env.DEMO_BARBER_ID || 'test-barber-id';
const DEMO_BUSINESS_ID = process.env.DEMO_BUSINESS_ID || 'demo-business-id';
const DEMO_BUSINESS_SLUG = process.env.DEMO_BUSINESS_SLUG || 'demo-gokhan-berber';
const DEMO_PHONE = process.env.DEMO_BARBER_PHONE || '+905551112233';

function log(msg) {
  console.log(DRY_RUN ? `[dry-run] ${msg}` : msg);
}

async function runStep(name, fn) {
  log(`\n── ${name} ──`);
  await fn();
}

async function main() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/berber_randevu';
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: Number(process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS || 8000),
  });

  const Business = require('../models/Business');
  const User = require('../models/User');
  const Appointment = require('../models/Appointment');
  const Service = require('../models/Service');

  const db = mongoose.connection.db;
  const servicesCol = db.collection('services');

  // M1 — Business oluştur
  await runStep('M1: Demo Business', async () => {
    let business = await Business.findOne({ id: DEMO_BUSINESS_ID });
    if (business) {
      log(`Business zaten var: ${business.id} (${business.name})`);
      return;
    }

    const barber = await User.findOne({ id: DEMO_BARBER_ID })
      || await User.findOne({ phone: DEMO_PHONE, role: 'barber' });

    if (!barber) {
      throw new Error(`Demo berber bulunamadı (id=${DEMO_BARBER_ID}, phone=${DEMO_PHONE})`);
    }

    const payload = {
      id: DEMO_BUSINESS_ID,
      name: barber.businessName || barber.name || 'Demo İşletme',
      slug: DEMO_BUSINESS_SLUG,
      businessType: 'berber',
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    log(`Business oluşturulacak: ${JSON.stringify(payload)}`);
    if (!DRY_RUN) {
      business = await Business.create(payload);
      log(`Business oluşturuldu: ${business.id}`);
    }
  });

  // M2 — User.businessId bağla
  await runStep('M2: User → businessId', async () => {
    const filter = {
      $or: [{ id: DEMO_BARBER_ID }, { phone: DEMO_PHONE, role: 'barber' }],
      $or: [{ businessId: { $exists: false } }, { businessId: null }, { businessId: '' }],
    };
    // Fix duplicate $or - use single query
    const barber = await User.findOne({
      $and: [
        { $or: [{ id: DEMO_BARBER_ID }, { phone: DEMO_PHONE }] },
        { role: 'barber' },
      ],
    });

    if (!barber) {
      throw new Error('Demo berber bulunamadı (M2)');
    }

    if (barber.businessId === DEMO_BUSINESS_ID) {
      log(`User zaten bağlı: ${barber.id} → ${barber.businessId}`);
      return;
    }

    log(`User ${barber.id} businessId=${DEMO_BUSINESS_ID} olarak güncellenecek`);
    if (!DRY_RUN) {
      await User.updateOne(
        { id: barber.id },
        { $set: { businessId: DEMO_BUSINESS_ID, updatedAt: new Date() } }
      );
      log('User güncellendi');
    }
  });

  // M3 — Appointment backfill
  await runStep('M3: Appointment businessId backfill', async () => {
    const filter = {
      barberId: DEMO_BARBER_ID,
      $or: [{ businessId: { $exists: false } }, { businessId: null }, { businessId: '' }],
    };
    const count = await Appointment.countDocuments(filter);
    log(`${count} randevu güncellenecek (barberId=${DEMO_BARBER_ID})`);
    if (!DRY_RUN && count > 0) {
      const result = await Appointment.updateMany(filter, {
        $set: { businessId: DEMO_BUSINESS_ID, updatedAt: new Date() },
      });
      log(`Güncellenen randevu: ${result.modifiedCount}`);
    }
  });

  // M4 — Service backfill
  await runStep('M4: Service businessId backfill', async () => {
    const filter = {
      $or: [{ businessId: { $exists: false } }, { businessId: null }, { businessId: '' }],
    };
    const count = await Service.countDocuments(filter);
    log(`${count} hizmet demo business'e atanacak`);
    if (!DRY_RUN && count > 0) {
      const result = await Service.updateMany(filter, {
        $set: { businessId: DEMO_BUSINESS_ID },
      });
      log(`Güncellenen hizmet: ${result.modifiedCount}`);
    }
  });

  // M5 — Index: eski global code unique kaldır, compound ekle
  await runStep('M5: Service index migration', async () => {
    const indexes = await servicesCol.indexes();
    const hasCodeUnique = indexes.some((i) => i.name === 'code_1' && i.unique);
    const hasCompound = indexes.some(
      (i) => i.key && i.key.businessId === 1 && i.key.code === 1 && i.unique
    );

    log(`Mevcut indexes: ${indexes.map((i) => i.name).join(', ')}`);
    if (hasCodeUnique) {
      log('code_1 unique index kaldırılacak');
      if (!DRY_RUN) {
        await servicesCol.dropIndex('code_1');
        log('code_1 kaldırıldı');
      }
    } else {
      log('code_1 unique index yok — atlanıyor');
    }

    if (!hasCompound) {
      log('businessId_1_code_1 compound unique index oluşturulacak');
      if (!DRY_RUN) {
        await servicesCol.createIndex(
          { businessId: 1, code: 1 },
          { unique: true, name: 'businessId_1_code_1' }
        );
        log('businessId_1_code_1 oluşturuldu');
      }
    } else {
      log('businessId_1_code_1 zaten var — atlanıyor');
    }
  });

  // M6 — Doğrulama
  await runStep('M6: Doğrulama', async () => {
    const barber = await User.findOne({ id: DEMO_BARBER_ID });
    const apptNull = await Appointment.countDocuments({
      $or: [{ businessId: { $exists: false } }, { businessId: null }, { businessId: '' }],
    });
    const svcNull = await Service.countDocuments({
      $or: [{ businessId: { $exists: false } }, { businessId: null }, { businessId: '' }],
    });
    const business = await Business.findOne({ id: DEMO_BUSINESS_ID });
    const indexes = await servicesCol.indexes();

    log(`Business: ${business ? business.id : 'YOK'}`);
    log(`User.businessId: ${barber?.businessId || 'YOK'}`);
    log(`Appointment businessId boş: ${apptNull}`);
    log(`Service businessId boş: ${svcNull}`);
    log(`Service indexes: ${indexes.map((i) => i.name).join(', ')}`);

    if (!DRY_RUN) {
      if (!business) throw new Error('Business oluşturulmamış');
      if (barber?.businessId !== DEMO_BUSINESS_ID) throw new Error('User businessId eşleşmiyor');
      if (apptNull > 0) console.warn(`⚠️ ${apptNull} randevuda hâlâ businessId yok`);
      if (svcNull > 0) console.warn(`⚠️ ${svcNull} hizmette hâlâ businessId yok`);
      if (indexes.some((i) => i.name === 'code_1' && i.unique)) {
        throw new Error('Eski code_1 unique index hâlâ mevcut');
      }
    }
  });

  log('\n✅ Sprint 1 migration tamamlandı' + (DRY_RUN ? ' (dry-run)' : ''));
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('\n❌ Migration hatası:', err.message);
  mongoose.disconnect().finally(() => process.exit(1));
});
