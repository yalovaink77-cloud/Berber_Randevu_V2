const mongoose = require('mongoose');

// Shared in-memory databases for fallback
const store = {
  User: new Map(),
  Appointment: new Map(),
  Contact: new Map(),
  MissedCall: new Map(),
  Service: new Map(),
};

// Seed with default services
try {
  const SERVICES = require('../data/services');
  SERVICES.forEach(s => store.Service.set(s.id || s.code, s));
} catch (e) {
  console.warn('Could not seed services:', e.message);
}

class MockModel {
  constructor(modelName) {
    this.modelName = modelName;
    this.memory = store[modelName] || new Map();
  }

  async findOne(query) {
    for (const item of this.memory.values()) {
      if (this._matches(item, query)) {
        return this._wrap(item);
      }
    }
    return null;
  }

  async find(query = {}) {
    const results = [];
    for (const item of this.memory.values()) {
      if (this._matches(item, query)) {
        results.push(this._wrap(item));
      }
    }

    const queryChain = {
      _results: results,
      sort: function(sortObj) {
        if (!sortObj) return this;
        this._results.sort((a, b) => {
          for (const [key, direction] of Object.entries(sortObj)) {
            const valA = String(a[key] || '');
            const valB = String(b[key] || '');
            const cmp = valA.localeCompare(valB, 'tr', { sensitivity: 'base', numeric: true });
            if (cmp !== 0) {
              return direction === -1 ? -cmp : cmp;
            }
          }
          return 0;
        });
        return this;
      },
      limit: function(n) {
        this._results.splice(n);
        return this;
      },
      select: function() { return this; },
      then: function(resolve, reject) {
        if (resolve) {
          resolve(this._results);
        }
      },
      catch: function(reject) {}
    };

    return queryChain;
  }

  async create(doc) {
    const { v4: uuidv4 } = require('uuid');
    const id = doc.id || doc._id || uuidv4();
    const newDoc = { 
      ...doc, 
      id, 
      _id: id,
      createdAt: new Date(), 
      updatedAt: new Date() 
    };
    this.memory.set(id, newDoc);
    return this._wrap(newDoc);
  }

  async updateMany(query, update) {
    return { modifiedCount: 0 };
  }

  async findByIdAndDelete(id) {
    const deleted = this.memory.get(id);
    this.memory.delete(id);
    return this._wrap(deleted);
  }

  async deleteOne(query) {
    for (const [key, item] of this.memory.entries()) {
      if (this._matches(item, query)) {
        const deleted = { ...item };
        this.memory.delete(key);
        return { deletedCount: 1, deleted };
      }
    }
    return { deletedCount: 0 };
  }

  async deleteMany(query) {
    if (Object.keys(query).length === 0) {
      this.memory.clear();
      return { deletedCount: this.memory.size };
    }
    let count = 0;
    for (const [key, item] of this.memory.entries()) {
      if (this._matches(item, query)) {
        this.memory.delete(key);
        count++;
      }
    }
    return { deletedCount: count };
  }

  async insertMany(arr) {
    arr.forEach(item => {
      const { v4: uuidv4 } = require('uuid');
      const id = item.id || item._id || uuidv4();
      this.memory.set(id, { ...item, id, _id: id });
    });
    return arr;
  }

  async findOneAndUpdate(query, update, options = {}) {
    let match = null;
    let matchKey = null;
    for (const [key, item] of this.memory.entries()) {
      if (this._matches(item, query)) {
        match = item;
        matchKey = key;
        break;
      }
    }

    if (!match) {
      if (options.upsert) {
        let inserted = {};
        if (update.$setOnInsert) inserted = { ...inserted, ...update.$setOnInsert };
        if (update.$set) inserted = { ...inserted, ...update.$set };
        const { v4: uuidv4 } = require('uuid');
        const id = inserted.id || uuidv4();
        inserted.id = id;
        inserted._id = id;
        this.memory.set(id, inserted);
        return this._wrap(inserted);
      }
      return null;
    }

    let updated = { ...match };
    if (update.$set) updated = { ...updated, ...update.$set };
    else if (update.$setOnInsert) { /* no-op */ }
    else { updated = { ...updated, ...update }; }

    updated.updatedAt = new Date();
    this.memory.set(matchKey, updated);
    return this._wrap(updated);
  }

  async countDocuments(query) {
    let count = 0;
    for (const item of this.memory.values()) {
      if (this._matches(item, query)) {
        count++;
      }
    }
    return count;
  }

  _matches(item, query) {
    if (!query || Object.keys(query).length === 0) return true;
    for (const [key, val] of Object.entries(query)) {
      if (key === 'isActive' && item.businessType) continue; // Skip isActive to match all our seeded services
      if (val && typeof val === 'object' && val.$ne !== undefined) {
        if (item[key] === val.$ne) return false;
        continue;
      }
      if (val && typeof val === 'object' && (val.$gte !== undefined || val.$lte !== undefined)) {
        const itemVal = new Date(item[key]);
        if (val.$gte && itemVal < new Date(val.$gte)) return false;
        if (val.$lte && itemVal > new Date(val.$lte)) return false;
        continue;
      }
      if (item[key] !== val) return false;
    }
    return true;
  }

  _wrap(item) {
    if (!item) return null;
    return {
      ...item,
      toObject: () => item,
      toJSON: () => item,
      select: function() { return this; }
    };
  }
}

function createModelProxy(modelName, originalModel) {
  const mock = new MockModel(modelName);
  
  const collectionMock = {
    findOne: async (query) => mock.findOne(query)
  };

  return new Proxy(originalModel, {
    get(target, prop) {
      const isConnected = mongoose.connection.readyState === 1;
      
      if (isConnected) {
        if (prop === 'collection') {
          return target.collection;
        }
        return target[prop];
      }

      // Fallback details
      if (prop === 'collection') {
        return collectionMock;
      }
      
      if (typeof mock[prop] === 'function') {
        return mock[prop].bind(mock);
      }
      
      return mock[prop];
    }
  });
}

// Pre-seed a default barber user for instant demo and testing
try {
  const bcrypt = require('bcryptjs');
  const barberId = "test-barber-id";
  const demoPassword = process.env.DEMO_BARBER_PASSWORD || process.env.JWT_SECRET?.slice(0, 16) || 'DemoPass_degistir!';
  const passwordHash = bcrypt.hashSync(demoPassword, 10);

  store.User.set(barberId, {
    id: barberId,
    _id: barberId,
    name: "Gökhan Berber",
    phone: process.env.DEMO_BARBER_PHONE || "+905551112233",
    email: "gokhan@berber.com",
    role: "barber",
    passwordHash: passwordHash,
    businessName: "Gökhan Erkek Kuaförü",
    businessAddress: "Atatürk Cad. No:77, Merkez, Yalova",
    assistantStatus: "working",
    specialties: ["haircut", "shaver", "beard_trim"],
    workDays: { monday: true, tuesday: true, wednesday: true, thursday: true, friday: true, saturday: true, sunday: false },
    workHours: { start: 9, end: 20 },
    createdAt: new Date(),
    updatedAt: new Date()
  });

  // Hydrate initial mock appointments for "today"
  const today = new Date().toISOString().split('T')[0];

  store.Appointment.set("appt-1", {
    id: "appt-1",
    _id: "appt-1",
    customerId: "customer-1",
    customerName: "Ahmet Yılmaz",
    customerPhone: "+905051234567",
    barberId: barberId,
    barberName: "Gökhan Berber",
    serviceType: "haircut",
    appointmentDate: new Date(today + "T09:30:00.000Z"),
    duration: 30,
    status: "confirmed",
    price: 250,
    notes: "Kısa model kesim istiyor.",
    createdAt: new Date(),
    updatedAt: new Date()
  });

  store.Appointment.set("appt-2", {
    id: "appt-2",
    _id: "appt-2",
    customerId: "customer-2",
    customerName: "Mehmet Demir",
    customerPhone: "+905069876543",
    barberId: barberId,
    barberName: "Gökhan Berber",
    serviceType: "beard_trim",
    appointmentDate: new Date(today + "T14:30:00.000Z"),
    duration: 20,
    status: "pending",
    price: 150,
    notes: "Sakal düzeltme ve fön.",
    createdAt: new Date(),
    updatedAt: new Date()
  });

  store.Appointment.set("appt-3", {
    id: "appt-3",
    _id: "appt-3",
    customerId: "customer-3",
    customerName: "Caner Kaya",
    customerPhone: "+905072345678",
    barberId: barberId,
    barberName: "Gökhan Berber",
    serviceType: "hair_coloring",
    appointmentDate: new Date(today + "T17:00:00.000Z"),
    duration: 60,
    status: "confirmed",
    price: 600,
    notes: "Göz altı bakım ve renklendirme.",
    createdAt: new Date(),
    updatedAt: new Date()
  });
} catch (e) {
  console.warn('Mock seeding error:', e.message);
}

module.exports = { createModelProxy, store };
