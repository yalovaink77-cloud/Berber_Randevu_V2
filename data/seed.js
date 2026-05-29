require('dotenv').config();
const mongoose = require('mongoose');
const Service = require('../models/Service');
const SERVICES = require('./services');

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/berber_randevu');
  console.log('✅ MongoDB bağlandı');

  await Service.deleteMany({});
  await Service.insertMany(SERVICES);

  console.log(`✅ ${SERVICES.length} hizmet eklendi`);
  process.exit(0);
}

seed().catch(err => { console.error(err); process.exit(1); });
