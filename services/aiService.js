const axios = require('axios');

class AIService {
  constructor() {
    this.aiProvider = (process.env.AI_PROVIDER || 'auto').toLowerCase();

    // Meta AI (Llama API veya OpenAI-uyumlu endpoint) ayarları
    this.metaApiKey = process.env.META_AI_API_KEY;
    this.metaBaseUrl = (process.env.META_AI_BASE_URL || 'https://api.llama.com/compat/v1')
      .replace(/\/+$/, '');
    this.metaModel = process.env.META_AI_MODEL || 'Llama-4-Maverick-17B-128E-Instruct';

    // Claude fallback - META_AI_API_KEY yoksa ya da Meta çağrısı başarısızsa kullanılabilir
    this.anthropicClient = null;
    if (process.env.CLAUDE_API_KEY) {
      try {
        const Anthropic = require('@anthropic-ai/sdk');
        this.anthropicClient = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });
      } catch (err) {
        console.warn('⚠️ Anthropic SDK yüklenemedi:', err.message);
      }
    }
    this.anthropicModel = process.env.CLAUDE_MODEL || 'claude-3-5-sonnet-20241022';

    this.requestTimeoutMs = Number(process.env.AI_REQUEST_TIMEOUT_MS || 30000);
    this.conversationHistoryLimit = Math.max(
      2,
      Number(process.env.AI_CONVERSATION_HISTORY_LIMIT || 4)
    );

    // Maliyet düşürme: basit taleplerde API çağrısı yapmadan yerel kural kullan.
    this.enableHeuristicRequestParsing =
      String(process.env.AI_HEURISTIC_REQUEST_PARSING || 'true').toLowerCase() !== 'false';
    this.enableHeuristicFeedbackParsing =
      String(process.env.AI_HEURISTIC_FEEDBACK_PARSING || 'true').toLowerCase() !== 'false';
    this.summaryWithModel =
      String(process.env.AI_SUMMARY_WITH_MODEL || 'false').toLowerCase() === 'true';
  }

  resolveProvider() {
    if (process.env.GEMINI_API_KEY) {
      return 'gemini';
    }
    if (this.aiProvider === 'meta' || this.aiProvider === 'anthropic') {
      return this.aiProvider;
    }

    // auto: Meta ana tercih, yoksa Claude fallback
    if (this.metaApiKey) return 'meta';
    return 'anthropic';
  }

  normalizeMessages(messages = [], allowSystem = false) {
    return messages
      .filter((item) => item && typeof item.content === 'string' && item.content.trim())
      .map((item) => {
        let role = 'user';

        if (item.role === 'assistant') {
          role = 'assistant';
        } else if (allowSystem && item.role === 'system') {
          role = 'system';
        }

        return {
          role,
          content: item.content,
        };
      });
  }

  extractTextFromAnthropicResponse(message) {
    if (!message || !Array.isArray(message.content)) return '';

    return message.content
      .filter((part) => part.type === 'text')
      .map((part) => part.text)
      .join('\n')
      .trim();
  }

  extractTextFromMetaResponse(responseData) {
    const content = responseData?.choices?.[0]?.message?.content;

    if (typeof content === 'string') {
      return content.trim();
    }

    if (Array.isArray(content)) {
      return content
        .map((part) => {
          if (typeof part === 'string') return part;
          if (part && typeof part.text === 'string') return part.text;
          return '';
        })
        .join('\n')
        .trim();
    }

    return '';
  }

  extractJsonResponse(responseText, fallbackValue) {
  if (!responseText || typeof responseText !== 'string') {
    return fallbackValue;
  }
  // Önce ```json ... ``` bloğunu temizle
  const stripped = responseText.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
  try {
    return JSON.parse(stripped);
  } catch (e1) {
    // Direkt parse olmadıysa JSON objesini bul
    const jsonMatch = stripped.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch (e2) {
        return fallbackValue;
      }
    }
  }
  return fallbackValue;
}

  formatDateAsYmd(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  buildLocalAppointmentSummary(appointmentDetails) {
    const date = new Date(appointmentDetails.appointmentDate);
    const dateStr = date.toLocaleDateString('tr-TR');
    const timeStr = date.toLocaleTimeString('tr-TR', {
      hour: '2-digit',
      minute: '2-digit',
    });
    const duration = appointmentDetails.duration || 30;

    return `${appointmentDetails.customerName} icin ${appointmentDetails.barberName} ile ${dateStr} ${timeStr} saatinde randevu olusturuldu. Hizmet: ${appointmentDetails.serviceType}, sure: ${duration} dakika.`;
  }

  detectServiceType(message) {
    const text = (message || '').toLowerCase();

    if (/renk|boya/.test(text)) return 'hair_coloring';
    if (/sakal/.test(text) && /(kes|duzen|trim|sekil)/.test(text)) return 'beard_trim';
    if (/tras|tıras|tiras|shave/.test(text)) return 'shave';
    if (/yikama|yıkama/.test(text)) return 'hair_wash';
    if (/sac|saç|kesim|haircut/.test(text)) return 'haircut';

    return null;
  }

  extractPreferredTime(message) {
    const text = (message || '').toLowerCase();

    const hhmmMatch = text.match(/\b([01]?\d|2[0-3])[:.]([0-5]\d)\b/);
    if (hhmmMatch) {
      return `${hhmmMatch[1].padStart(2, '0')}:${hhmmMatch[2]}`;
    }

    const hourMatch = text.match(/\b([01]?\d|2[0-3])\s*(gibi|civari|civarı|de|da|te|ta)\b/);
    if (hourMatch) {
      return `${hourMatch[1].padStart(2, '0')}:00`;
    }

    return null;
  }

  extractPreferredDate(message) {
    const text = (message || '').toLowerCase();
    const now = new Date();

    if (/bugun|bugün/.test(text)) {
      return this.formatDateAsYmd(now);
    }

    if (/yarin|yarın/.test(text)) {
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      return this.formatDateAsYmd(tomorrow);
    }

    if (/haftaya/.test(text)) {
      const nextWeek = new Date(now);
      nextWeek.setDate(nextWeek.getDate() + 7);
      return this.formatDateAsYmd(nextWeek);
    }

    const weekdayMap = {
      pazartesi: 1,
      sali: 2,
      salı: 2,
      carsamba: 3,
      carşamba: 3,
      çarsamba: 3,
      çarşamba: 3,
      persembe: 4,
      perşembe: 4,
      cuma: 5,
      cumartesi: 6,
      pazar: 0,
    };

    for (const [name, targetDay] of Object.entries(weekdayMap)) {
      if (text.includes(name)) {
        const date = new Date(now);
        const diff = (targetDay - date.getDay() + 7) % 7;
        date.setDate(date.getDate() + diff);
        return this.formatDateAsYmd(date);
      }
    }

    const isoMatch = text.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
    if (isoMatch) {
      const year = Number(isoMatch[1]);
      const month = Number(isoMatch[2]);
      const day = Number(isoMatch[3]);
      const date = new Date(year, month - 1, day);
      if (!Number.isNaN(date.getTime())) {
        return this.formatDateAsYmd(date);
      }
    }

    const trDateMatch = text.match(/\b(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2,4}))?\b/);
    if (trDateMatch) {
      const day = Number(trDateMatch[1]);
      const month = Number(trDateMatch[2]);
      let year = trDateMatch[3] ? Number(trDateMatch[3]) : now.getFullYear();

      if (year < 100) year += 2000;

      const date = new Date(year, month - 1, day);
      if (!Number.isNaN(date.getTime())) {
        return this.formatDateAsYmd(date);
      }
    }

    return null;
  }

  analyzeCustomerRequestHeuristically(customerMessage) {
    const serviceType = this.detectServiceType(customerMessage);
    const preferredDate = this.extractPreferredDate(customerMessage);
    const preferredTime = this.extractPreferredTime(customerMessage);

    const explicitAppointmentIntent = /randevu|uygun|musait|müsait|alabilir miyim|gelmek istiyorum/.test(
      (customerMessage || '').toLowerCase()
    );

    const signalCount = [serviceType, preferredDate, preferredTime].filter(Boolean).length;
    const isConfident = signalCount >= 2 || (signalCount >= 1 && explicitAppointmentIntent);

    return {
      isConfident,
      data: {
        serviceType: serviceType || 'haircut',
        preferredDate,
        preferredTime,
        additionalNotes: customerMessage,
      },
    };
  }

  formatCustomerPriceList(services) {
    const items = Array.isArray(services) ? services : [];
    const byCategory = {};
    for (const s of items) {
      const cat = s.category || 'diger';
      if (!byCategory[cat]) byCategory[cat] = [];
      byCategory[cat].push(s);
    }
    const catLabels = {
      sac: '✂️ SAÇ',
      sakal: '🧔 SAKAL',
      komple: '💈 KOMPLE',
      bakim: '🌿 BAKIM',
      diger: '💈 HİZMET',
    };
    return Object.entries(byCategory)
      .map(([cat, list]) => {
        const label = catLabels[cat] || catLabels.diger;
        const lines = list
          .map((s) => `• ${s.name} — ${s.priceMin}-${s.priceMax} TL / ${s.defaultDuration} dk`)
          .join('\n');
        return `${label}\n${lines}`;
      })
      .join('\n\n');
  }

  ensureFullPriceList(userText, message, services) {
    const wantsPrice = /fiyat|ücret|ucret|hizmet list|ne kadar|kaç para|fiyatlar|fiyat listesi/i.test(
      (userText || '').toLowerCase()
    );
    if (!wantsPrice) return message;

    const priceCount = (message.match(/TL/g) || []).length;
    if (priceCount >= 3) return message;

    const list = this.formatCustomerPriceList(services);
    const intro = (message || '')
      .replace(/\s*listeledim\.?\s*$/i, '')
      .replace(/\s*yazdım\.?\s*$/i, '')
      .trim();
    const header = intro && intro.length > 10 ? intro : 'Tabii! İşte güncel fiyat listemiz:';
    return `${header}\n\n${list}`;
  }

  normalizeConversationResponse(parsed, fallbackStep, fallbackMessage) {
    if (!parsed || typeof parsed !== 'object') {
      return {
        message: fallbackMessage,
        nextStep: fallbackStep,
        data: {},
        appointment: null,
        cancelAppointmentId: null,
        cancelAppointmentIds: [],
        cancelAll: false,
        newCustomer: null,
      };
    }

    return {
      message: (() => {
        const raw = typeof parsed.message === 'string' ? parsed.message.trim() : fallbackMessage;
        return raw.replace(/```json[\s\S]*?```/g, '').trim() || fallbackMessage;
      })(),
      nextStep:
        typeof parsed.nextStep === 'string' && parsed.nextStep.trim()
          ? parsed.nextStep.trim()
          : fallbackStep,
      data: parsed.data && typeof parsed.data === 'object' ? parsed.data : {},
      appointment: parsed.appointment && typeof parsed.appointment === 'object' ? parsed.appointment : null,
      cancelAppointmentId:
        typeof parsed.cancelAppointmentId === 'string' && parsed.cancelAppointmentId.trim()
          ? parsed.cancelAppointmentId.trim()
          : null,
      cancelAppointmentIds: Array.isArray(parsed.cancelAppointmentIds)
        ? parsed.cancelAppointmentIds.filter((id) => typeof id === 'string' && id.trim()).map((id) => id.trim())
        : [],
      cancelAll: parsed.cancelAll === true,
      newCustomer: parsed.newCustomer && typeof parsed.newCustomer === 'object' ? parsed.newCustomer : null,
    };
  }

  analyzeFeedbackHeuristically(feedbackText) {
    const text = (feedbackText || '').toLowerCase();

    const positiveWords = [
      'memnun',
      'harika',
      'iyi',
      'super',
      'süper',
      'hizli',
      'hızlı',
      'guleryuz',
      'güler yüz',
      'temiz',
      'tesekkur',
      'teşekkür',
    ];

    const negativeWords = [
      'kotu',
      'kötü',
      'berbat',
      'gec',
      'geç',
      'pahali',
      'pahalı',
      'rezalet',
      'memnun degil',
      'bekledim',
      'uzun surdu',
      'uzun sürdü',
    ];

    const topicsMap = {
      waiting: ['bekle', 'sira', 'sıra', 'gec', 'geç'],
      price: ['fiyat', 'ucret', 'ücret', 'pahali', 'pahalı'],
      service_quality: ['kesim', 'sakal', 'hizmet', 'temiz', 'kalite'],
      staff_attitude: ['davranis', 'davranış', 'guleryuz', 'güler yüz', 'personel'],
    };

    const positiveScore = positiveWords.filter((word) => text.includes(word)).length;
    const negativeScore = negativeWords.filter((word) => text.includes(word)).length;

    let sentiment = 'neutral';
    if (positiveScore > negativeScore) sentiment = 'positive';
    if (negativeScore > positiveScore) sentiment = 'negative';

    const mainTopics = Object.entries(topicsMap)
      .filter(([, keywords]) => keywords.some((word) => text.includes(word)))
      .map(([topic]) => topic);

    const confidence = Math.abs(positiveScore - negativeScore) + mainTopics.length;

    return {
      isConfident: confidence >= 2,
      data: {
        sentiment,
        mainTopics,
        suggestions: feedbackText,
      },
    };
  }

  async callMetaApi({ systemPrompt, messages, maxTokens, temperature }) {
    if (!this.metaApiKey) {
      throw new Error('META_AI_API_KEY tanımlı değil');
    }

    const chatMessages = [];

    if (systemPrompt) {
      chatMessages.push({ role: 'system', content: systemPrompt });
    }

    chatMessages.push(...this.normalizeMessages(messages, true));

    const response = await axios.post(
      `${this.metaBaseUrl}/chat/completions`,
      {
        model: this.metaModel,
        messages: chatMessages,
        max_tokens: maxTokens,
        temperature,
      },
      {
        headers: {
          Authorization: `Bearer ${this.metaApiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: this.requestTimeoutMs,
      }
    );

    return this.extractTextFromMetaResponse(response.data);
  }

  async callGeminiApi({ systemPrompt, messages, maxTokens, temperature }) {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY is required but missing');
    }
    const { GoogleGenAI } = require('@google/genai');
    const ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });

    const isJson = systemPrompt && systemPrompt.includes('JSON');

    // Map messages payload to Gemini structures
    const geminiContents = messages.map(m => {
      const role = m.role === 'assistant' ? 'model' : 'user';
      return {
        role: role,
        parts: [{ text: m.content }]
      };
    });

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: geminiContents,
      config: {
        systemInstruction: systemPrompt || undefined,
        temperature: temperature !== undefined ? temperature : 0.2,
        maxOutputTokens: maxTokens || 500,
        responseMimeType: isJson ? 'application/json' : undefined,
      }
    });

    return response.text || '';
  }

  async callAnthropicApi({ systemPrompt, messages, maxTokens }) {
    if (!this.anthropicClient) {
      throw new Error('CLAUDE_API_KEY tanımlı değil');
    }

    const message = await this.anthropicClient.messages.create({
      model: this.anthropicModel,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: this.normalizeMessages(messages, false),
    });

    return this.extractTextFromAnthropicResponse(message);
  }

  async createTextCompletion({ systemPrompt, messages, maxTokens = 300, temperature = 0.2 }) {
    const provider = this.resolveProvider();

    if (provider === 'gemini') {
      try {
        return await this.callGeminiApi({ systemPrompt, messages, maxTokens, temperature });
      } catch (error) {
        console.warn('⚠️ Gemini AI hatası:', error.message);
        // Fallback to meta or anthropic if possible
        if (this.metaApiKey) {
          try {
            return await this.callMetaApi({ systemPrompt, messages, maxTokens, temperature });
          } catch (metaErr) {
            console.warn('⚠️ Fallback Meta AI da hata verdi:', metaErr.message);
          }
        }
        if (this.anthropicClient) {
          return await this.callAnthropicApi({ systemPrompt, messages, maxTokens });
        }
        throw error;
      }
    }

    if (provider === 'meta') {
      try {
        return await this.callMetaApi({ systemPrompt, messages, maxTokens, temperature });
      } catch (error) {
        // Meta çağrısı hata verirse sistem tamamen düşmesin, Claude ile devam etsin
        if (this.anthropicClient) {
          console.warn('⚠️ Meta AI hatası, Claude fallback kullanılacak:', error.message);
          return this.callAnthropicApi({ systemPrompt, messages, maxTokens });
        }
        throw error;
      }
    }

    return this.callAnthropicApi({ systemPrompt, messages, maxTokens });
  }

  /**
   * Randevu detaylarından AI özeti oluştur
   */
  async generateAppointmentSummary(appointmentDetails) {
    try {
      if (!this.summaryWithModel) {
        return this.buildLocalAppointmentSummary(appointmentDetails);
      }

      const prompt = `
Aşağıdaki berber randevu detaylarından kısa ve profesyonel bir özet oluştur:

Müşteri: ${appointmentDetails.customerName}
Berber: ${appointmentDetails.barberName}
Hizmet: ${appointmentDetails.serviceType}
Tarih: ${new Date(appointmentDetails.appointmentDate).toLocaleDateString('tr-TR')}
Saat: ${new Date(appointmentDetails.appointmentDate).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
Süre: ${appointmentDetails.duration} dakika
Notlar: ${appointmentDetails.notes || 'Yok'}

Özet (maksimum 2 cümle):`;

      return await this.createTextCompletion({
        messages: [{ role: 'user', content: prompt }],
        maxTokens: 150,
        temperature: 0.2,
      });
    } catch (error) {
      console.error('❌ AI özet oluşturma hatası:', error.message);
      throw new Error(`AI özeti oluşturulamadı: ${error.message}`);
    }
  }

  /**
   * Müşteri talebini analiz et ve randevu önerisi yap
   */
  async analyzeCustomerRequest(customerMessage) {
    const heuristic = this.enableHeuristicRequestParsing
      ? this.analyzeCustomerRequestHeuristically(customerMessage)
      : null;

    try {
      if (heuristic?.isConfident) {
        return heuristic.data;
      }

      const prompt = `
Bir berber müşterisi tarafından gönderilen aşağıdaki mesajı analiz et ve:
1. İstenen hizmet türünü belirle (saç kesimi, tıraş, sakal kesimi vb.)
2. Tercih edilen tarih/saat varsa çıkar
3. Ek notları belirle

Müşteri mesajı: "${customerMessage}"

JSON formatında cevap ver:
{
  "serviceType": "hizmet türü",
  "preferredDate": "tarih (varsa)",
  "preferredTime": "saat (varsa)",
  "additionalNotes": "ek notlar"
}`;

      const responseText = await this.createTextCompletion({
        messages: [{ role: 'user', content: prompt }],
        maxTokens: 300,
        temperature: 0.1,
      });

      const parsed = this.extractJsonResponse(responseText, null);
      if (parsed) {
        return {
          serviceType:
            typeof parsed.serviceType === 'string' && parsed.serviceType.trim()
              ? parsed.serviceType
              : (heuristic?.data?.serviceType || 'haircut'),
          preferredDate:
            typeof parsed.preferredDate === 'string' && parsed.preferredDate.trim()
              ? parsed.preferredDate
              : (heuristic?.data?.preferredDate || null),
          preferredTime:
            typeof parsed.preferredTime === 'string' && parsed.preferredTime.trim()
              ? parsed.preferredTime
              : (heuristic?.data?.preferredTime || null),
          additionalNotes:
            typeof parsed.additionalNotes === 'string' && parsed.additionalNotes.trim()
              ? parsed.additionalNotes
              : customerMessage,
        };
      }
      
      return {
        serviceType: heuristic?.data?.serviceType || 'haircut',
        preferredDate: heuristic?.data?.preferredDate || null,
        preferredTime: heuristic?.data?.preferredTime || null,
        additionalNotes: customerMessage,
      };
    } catch (error) {
      console.error('❌ Müşteri talebi analizi hatası:', error.message);
      return {
        serviceType: heuristic?.data?.serviceType || 'haircut',
        preferredDate: heuristic?.data?.preferredDate || null,
        preferredTime: heuristic?.data?.preferredTime || null,
        additionalNotes: customerMessage,
      };
    }
  }

  /**
   * Berber için haftalık planlama önerisi oluştur
   */
  async generateWeeklySchedulingSuggestion(barberData) {
    try {
      const prompt = `
Aşağıdaki veriler doğrultusunda bir berber için haftalık planlama önerisi oluştur:

Berber: ${barberData.name}
Uzmanlıkları: ${barberData.specialties.join(', ')}
Çalışma Saatleri: ${barberData.workHours.start}:00 - ${barberData.workHours.end}:00
Toplam Randevu: ${barberData.totalAppointments}
Ortalama Süre: ${barberData.averageDuration} dakika

Profesyonel bir planlama önerisi (3-4 cümle):`;

      return await this.createTextCompletion({
        messages: [{ role: 'user', content: prompt }],
        maxTokens: 300,
        temperature: 0.3,
      });
    } catch (error) {
      console.error('❌ Planlama önerisi oluşturma hatası:', error.message);
      throw new Error(`Planlama önerisi oluşturulamadı: ${error.message}`);
    }
  }

  /**
   * Müşteri memnuniyeti çözümlemesi
   */
  async analyzeFeedback(feedbackText) {
    const heuristic = this.enableHeuristicFeedbackParsing
      ? this.analyzeFeedbackHeuristically(feedbackText)
      : null;

    try {
      if (heuristic?.isConfident) {
        return heuristic.data;
      }

      const prompt = `
Aşağıdaki müşteri geri bildirimini analiz et:

Geri Bildirim: "${feedbackText}"

Şunları belirle:
1. Genel duygu (pozitif/negatif/nötr)
2. Ana konular
3. Öneriler

JSON formatında cevap ver:
{
  "sentiment": "positive/negative/neutral",
  "mainTopics": ["konu1", "konu2"],
  "suggestions": "öneriler"
}`;

      const responseText = await this.createTextCompletion({
        messages: [{ role: 'user', content: prompt }],
        maxTokens: 300,
        temperature: 0.1,
      });

      const parsed = this.extractJsonResponse(responseText, null);
      if (parsed) {
        return {
          sentiment:
            typeof parsed.sentiment === 'string' && parsed.sentiment.trim()
              ? parsed.sentiment
              : (heuristic?.data?.sentiment || 'neutral'),
          mainTopics: Array.isArray(parsed.mainTopics)
            ? parsed.mainTopics
            : (heuristic?.data?.mainTopics || []),
          suggestions:
            typeof parsed.suggestions === 'string' && parsed.suggestions.trim()
              ? parsed.suggestions
              : feedbackText,
        };
      }
      
      return {
        sentiment: heuristic?.data?.sentiment || 'neutral',
        mainTopics: heuristic?.data?.mainTopics || [],
        suggestions: feedbackText,
      };
    } catch (error) {
      console.error('❌ Geri bildirim analizi hatası:', error.message);
      return {
        sentiment: 'neutral',
        mainTopics: [],
        suggestions: feedbackText,
      };
    }
  }

  async generateConversationResponse(text, session, customer, isSavedContact = false, customerPhone = '') {
    try {
      const DatabaseService = require('./databaseService');
      const Service = require('../models/Service');

      // Fetch active barber and services list
      const barbers = await DatabaseService.getAllBarbers();
      const barber = barbers[0] || { id: 'test-barber-id', name: 'Gökhan Berber', businessType: 'berber' };
      const services = await Service.find({ businessType: barber.businessType || 'berber' });
      const servicesStr = services.map(s => `- ${s.name} (${s.category}) — Kod: ${s.code}, Süre: ${s.defaultDuration} dk, Fiyat: ${s.priceMin}-${s.priceMax} TL`).join('\n');

      // Fetch existing bookings to avoid conflicts
      const bookings = await DatabaseService.getActiveAppointmentsByBarber(barber.id);
      const busySlotsStr = bookings.map(b => {
        const d = new Date(b.appointmentDate);
        const startStr = d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
        const end = new Date(d.getTime() + (b.duration || 30) * 60000);
        const endStr = end.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
        const dateStr = d.toLocaleDateString('tr-TR');
        return `- ${dateStr} günü saat ${startStr} - ${endStr} arası DOLU (${b.customerName})`;
      }).join('\n') || 'Hiç dolu randevu yok, tüm çalışma saatleri boş.';

      const phone = customerPhone || customer?.phone || '';
      const customerAppointments = phone
        ? await DatabaseService.getUpcomingAppointmentsByPhone(barber.id, phone)
        : [];
      const customerApptsStr = customerAppointments.length
        ? customerAppointments.map((a) => {
            const d = new Date(a.appointmentDate);
            const dateStr = d.toLocaleDateString('tr-TR');
            const timeStr = d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
            const apptId = a.id || (a._id ? String(a._id) : 'bilinmiyor');
            return `- ID: ${apptId} | ${dateStr} ${timeStr} | ${a.serviceType} | durum: ${a.status}`;
          }).join('\n')
        : 'Aktif randevu yok.';

      const targetDate =
        session.data?.date ||
        this.formatDateAsYmd(new Date(Date.now() + 86400000));
      let freeSlotsStr = 'Hesaplanamadı — dolu saatler listesine bak.';
      let slotDuration = 30;
      if (session.data?.serviceCode) {
        const svc = services.find((s) => s.code === session.data.serviceCode);
        if (svc?.defaultDuration) slotDuration = svc.defaultDuration;
      } else if (session.data?.duration) {
        slotDuration = Number(session.data.duration) || 30;
      }
      try {
        const AppointmentLogic = require('../logic/appointmentLogic');
        const freeSlots = await AppointmentLogic.getAvailableSlots(
          barber.id,
          new Date(`${targetDate}T12:00:00`),
          slotDuration
        );
        freeSlotsStr = freeSlots.length
          ? freeSlots
              .map((s) =>
                s.start.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
              )
              .join(', ')
          : 'Bu gün için boş saat yok.';
      } catch (slotErr) {
        console.warn('Müsait slot hesaplanamadı:', slotErr.message);
      }

      const customerName = customer ? customer.name : (session.data?.name || 'Değerli Müşteri');
      const extractSalutation = (name) => {
        if (!name) return null;
        const lower = name.toLowerCase();
        if (lower.includes(" abi") || lower.endsWith("abi")) return name;
        if (lower.includes(" amca") || lower.endsWith("amca")) return name;
        if (lower.includes(" hanım") || lower.endsWith("hanım")) return name;
        if (lower.includes(" bey") || lower.endsWith("bey")) return name;
        if (lower.includes(" hoca") || lower.endsWith("hoca")) return name;
        const parts = name.trim().split(" ");
        if (parts.length >= 2) {
          const femaleEndings = ["a","e","i","ı"];
          const firstName = parts[0];
          const lastChar = firstName[firstName.length - 1].toLowerCase();
          return femaleEndings.includes(lastChar) ? `${firstName} Hanım` : `${firstName} Bey`;
        }
        return name;
      };
      const customerSalutation = isSavedContact ? extractSalutation(customerName) : null;
      const todayYmd = this.formatDateAsYmd(new Date());

      const systemPrompt = `Sen ${barber.name} salonunun samimi ve cana yakın WhatsApp asistanısın.
Yalnızca Türkçe Latin alfabesi kullan — Kiril veya yabancı alfabe karakteri yazma (ör. randevunu doğru yaz, randevuну yanlış).
Bugünün Tarihi: ${todayYmd}
Mevcut Konuşma Adımı: ${session.step}

MÜŞTERİ BİLGİSİ:
- Müşteri Adı: ${customerName}
- Rehberde Kayıtlı mı?: ${isSavedContact ? 'EVET (Tanıdık/Sürekli Müşteri)' : 'HAYIR (Yeni/Bilinmeyen Müşteri)'}

ÖZEL REHBER & HİTAP KURALLARI:
1. Kayıtlı müşteri (${isSavedContact ? "EVET" : "HAYIR"}):
   - Hitap: "${customerSalutation || customerName}" — bu ismi kullan, değiştirme.
   - "Sen" diye konuş, samimi ve sıcak ol.
   - "Abim", "kardeşim", "abi", "bey", "hanım" gibi kelimeler EKLEME — isim zaten doğru geliyor.
2. Kayıtsız müşteri:
   - Her zaman "Siz" ile hitap et, saygılı ve kibar ol.
   - İsmini öğrenince hatırla.
   - Randevu onaylanınca newCustomer objesini doldur: {"name": "Ad Soyad", "phone": "telefon", "category": "customer"}.
KULLANILABİLİR HİZMETLER:
${servicesStr}

BERBERİN DOLU OLDUĞU SAATLER (ÇAKIŞMA OLMAMALI):
${busySlotsStr}

MÜSAİT SAATLER (${targetDate}):
${freeSlotsStr}
- Randevu teklif ederken SADECE bu listedeki saatleri öner. Listede olmayan saati müsait diye söyleme.

MÜŞTERİNİN AKTİF RANDEVULARI (telefon: ${phone || 'bilinmiyor'}):
${customerApptsStr}

GÖREVLERİN VE KURALLAR:
1. Müşteri fiyat listesi veya hizmetleri sorarsa, KULLANILABİLİR HİZMETLER listesindeki TÜM hizmetleri ve fiyatlarını mesajına MUTLAKA ekle — asla "yukarıda" veya "az önce gönderdim" deme, her seferinde tam listeyi yeniden yaz.
2. Randevu almak isterse, yukarıdaki hizmet listesinden en uygun hizmeti teklif et veya seçtir. Sadece bizim sunduğumuz hizmetleri teklif et!
3. ÇALIŞMA GÜNLERİ:
   - Berber ise: Pazartesi-Cumartesi açık, PAZAR KAPALI.
   - Kuaför ise: Salı-Pazar açık, PAZARTESİ KAPALI.
   - Çalışma saatleri: ${process.env.BUSINESS_HOURS_START || 9}:00 - ${process.env.BUSINESS_HOURS_END || 20}:00
   - Müşteri kapalı güne randevu isterse bunu bildir ve açık güne yönlendir.
4. SAAT ÇAKIŞMASI YÖNETİMİ (Kritik):
   - Müşterinin istediği gün/saati yukarıdaki DOLU SAATLER ile titizlikle karşılaştır.
   - DOLU SAATLER listesindeki saati ASLA müsait diye önerme.
   - MÜSAİT SAATLER listesinde OLMAYAN saati önerme.
   - Eğer müşteri ÇAKIŞAN (dolu) bir saat isterse, o saatin dolu olduğunu belirt ve MÜSAİT SAATLER listesinden en yakın 2 alternatifi öner.
5. Müşterinin adını, istediği hizmeti, tercih ettiği tarih ve saati netleştir.
6. Tüm bilgiler netleştiğinde randevuyu kesinleştirerek "done" adımına geç ve "appointment" objesini doldur.
   - "confirm" adımında appointment objesini BOŞ bırak; yalnızca özet göster ve onay iste.
   - Müşteri onayladıktan sonraki cevapta nextStep="done" kullan.
7. İPTAL İŞLEMİ:
   - Müşteri randevusunu iptal etmek isterse MÜŞTERİNİN AKTİF RANDEVULARI listesine bak.
   - Listede gösterilen ID'leri AYNEN kullan — uydurma ID yazma.
   - Tek randevu + müşteri onayladıysa: "cancelAppointmentId" = o randevunun gerçek ID'si.
   - Birden fazla randevu + müşteri hangisini seçtiyse: seçilenin gerçek ID'sini yaz.
   - Müşteri "hepsini" / "tümünü" iptal der ve onaylarsa: "cancelAll": true (cancelAppointmentId null).
   - Aktif randevu yoksa: iptal edilecek randevu bulunmadığını söyle.
   - İptal onaylandığında "appointment" objesini BOŞ bırak.
   - Asla "sistemden iptal yapamıyorum" deme.

ÖNEMLİ: Randevu oluşturma ve iptal işlemlerini sistem sunucuda yapar. Sen yalnızca doğal dil cevabı yaz; "randevun oluşturuldu" veya "iptal ettim" deme — sunucu müşteriye doğru metni gönderir.
ÖNEMLİ: "appointment" nesnesini sadece YENİ randevu kesinleşirken doldur. İptal için cancelAppointmentId veya cancelAll kullan.
ÖNEMLİ: Aynı mesajda hem "appointment" hem iptal alanları gönderme.
Giriş Tarihi her zaman ISO formatında olmalıdır. Müşterinin söylediği saat TÜRKİYE yerel saatidir (ör. 14:00 = öğleden sonra 2). appointmentDate için UTC+3 kayması yapma; data.date ve data.time alanlarını doğru doldur.

Cevabını her zaman geçerli bir JSON formatında ver:
{
  "message": "müşteriye gönderilecek cana yakın türkçe cevap",
  "nextStep": "greeting/name/date/time/confirm/done/cancel",
  "data": {
    "name": "müşterinin belirlenen adı",
    "serviceCode": "seçilen hizmet kodu (örn: berber_sac_kisa)",
    "date": "seçilen tarih (YYYY-MM-DD)",
    "time": "seçilen saat (HH:MM)"
  },
  "cancelAppointmentId": "iptal edilecek tek randevunun gerçek ID'si veya null",
  "cancelAppointmentIds": [],
  "cancelAll": false,
  "appointment": {
    "customerId": "${customer?.id || ''}",
    "customerName": "${customerName}",
    "customerPhone": "${customer?.phone || ''}",
    "barberId": "${barber.id}",
    "barberName": "${barber.name}",
    "serviceType": "seçilen hizmet kodu",
    "appointmentDate": "tam ISO tarih saati ör: 2026-05-29T14:30:00.000Z",
    "duration": seçilen_hizmetin_varsayılan_süresi_sayı_olarak,
    "price": seçilen_hizmetin_ortalama_veya_min_fiyatı_sayı_olarak,
    "notes": "müşterinin özel istekleri"
  },
  "newCustomer": {
    "name": "öğrenilen yeni müşteri adı"
  }
}`;

      const responseText = await this.createTextCompletion({
        systemPrompt,
        messages: [
          ...session.history.slice(-this.conversationHistoryLimit),
          { role: 'user', content: text },
        ],
        maxTokens: 1200,
        temperature: 0.4,
      });

      const parsed = this.extractJsonResponse(responseText, null);
      if (parsed) {
        const normalized = this.normalizeConversationResponse(parsed, session.step, responseText);
        normalized.message = this.ensureFullPriceList(text, normalized.message, services);
        return normalized;
      }

      return {
        message: this.ensureFullPriceList(text, responseText, services),
        nextStep: session.step,
        data: {},
        appointment: null,
        cancelAppointmentId: null,
        cancelAppointmentIds: [],
        cancelAll: false,
        newCustomer: null,
      };

    } catch (error) {
      console.error('❌ AI cevap hatası:', error.message);
      return {
        message: 'Şu an yoğunuz, birazdan tekrar dener misiniz?',
        nextStep: session.step,
        data: {},
        appointment: null,
        cancelAppointmentId: null,
        cancelAppointmentIds: [],
        cancelAll: false,
        newCustomer: null,
      };
    }
  }

  async generateMissedCallResponse({ contact, fromPhone, barberName, barberStatus }) {
    try {
      const isSaved = !!contact;
      const callerName = contact?.name || 'Değerli Müşterimiz';
      const status = barberStatus || 'working';
      const category = contact?.category || 'unknown';

      const prompt = `Aşağıdaki cevapsız arama bilgisine göre telefona gönderilecek samimi ve sıcak bir otomatik Türkçe geri dönüş SMS/WhatsApp mesajı yaz:

BERBER BİLGİSİ:
- Berber Adı: ${barberName}
- Mevcut Durumu: ${status === 'working' ? 'Müşteri tıraş ediyor / Meşgul' : status === 'break' ? 'Molada' : status === 'closed' ? 'Dükkan kapalı' : 'Meşgul'}

ARAYAN BİLGİSİ:
- Arayan Adı/Rehber İsmi: ${callerName}
- Rehberde Kayıtlı mı?: ${isSaved ? 'EVET' : 'HAYIR'}
- Kişi Sınıfı/Kategorisi: ${category} (Değerler: family = Aile/Yakın, friend = Dost/Arkadaş, customer = Standart Müşteri, unknown = Bilinmeyen)
- Telefon Numarası: ${fromPhone}

MESAJ YAZIM KURALLARI:
1. Kesinlikle robotik, yapay veya soğuk kurumsal bir dil kullanma!
2. Eğer Kişi Sınıfı/Kategorisi "family" (Aile/Yakın) ise veya arayan isminde "Annem", "Aşkım", "Babam", "Eşim", "Kardeşim", "Oğlum", "Kızım" gibi bir yakınlık geçiyorsa:
   - "Canım annem", "canım eşim", "canım ablam", "kardeşim" gibi hitaplarla başla.
   - Randevudan, saç kesiminden veya berberlik hizmetinden ASLA ama ASLA bahsetme! Sadece son derece samimi ve sevgi dolu bir yakınlık dili kullan.
   - Mesajda mutlaka "Şu an tıraştayım ellerim dolu, işim biter bitmez hemen seni arıyorum!" de.
   - Bu mesajın sonuna mutlaka aciliyet ibaresini ekle: "Eğer acil bir durum varsa lütfen tekrar ara, hemen dükkandaki işi bırakıp açarım!" de ki eğer aile üyesinin acil bir ihtiyacı varsa tekrar arayıp sana ulaşabileceğini bilsin. This is extremely critical!
3. Eğer Kişi Sınıfı/Kategorisi "friend" (Dost/Arkadaş) ise (Örn: "Mümtaz Abi" rehber tarayıcıda Dost olarak işaretlenmişse) veya isminde "Abi/Usta" geçiyorsa:
   - Ona doğrudan ismiyle veya "Mümtaz abim selam," şeklinde sıcak, samimi bir mahalle esnafı diliyle hitap et. "Siz" deme, "Sen/Abi/Kardeşim" de.
   - "Mümtaz abim selam, şu an tıraştayım, ellerim dolu. Randevu için aradıysan WhatsApp'tan bana istediğin günü ve saati yaz, burası otomatik rezerve eder. Değilse işim biter bitmez seni arıyorum!" şeklinde samimi ol, kurumsal dilden uzak dur.
4. Diğer durumlarda (Standart Müşteri veya Bilinmeyen):
   - Sıcak ve saygılı bir dille selamla. "Merhabalar, ben ${barberName} dijital asistanıyım. Berberimiz şu an tıraşta olduğu için çağrınızı yanıtlayamadı."
   - "Randevu almak isterseniz WhatsApp üzerinden istediğiniz hizmeti, gün ve saati buraya yazabilirsiniz. Uygun saatleri hemen size ileteyim." şeklinde yönlendir.

Cevap olarak SADECE müşteriye gönderilecek mesajın kendisini yaz. Tırnak işaretleri, konu başlığı, açıklama veya "Cevap:" gibi ifadeler ekleme. Doğrudan mesaj metnini üret.`;

      const responseText = await this.createTextCompletion({
        messages: [{ role: 'user', content: prompt }],
        maxTokens: 150,
        temperature: 0.5,
      });

      return responseText.replace(/^["']|["']$/g, '').trim();
    } catch (error) {
      console.error('❌ AI cevapsız arama yanıt hatası:', error.message);
      // Fallback
      const callerName = contact?.name || '';
      const cat = contact?.category || 'unknown';
      if (cat === 'family' || /anne|baba|kardes|kardeş|esim|eş|askim|aşkım|kizim|kızım|oglum|oğlum/.test(callerName.toLowerCase())) {
        return `Canım annem, şu an tıraştayım ellerim dolu, işim biter bitmez hemen seni arıyorum! Eğer acilse lütfen tekrar ara, hemen dükkandaki işi bırakıp açarım.`;
      }
      if (cat === 'friend' || callerName) {
        return `${callerName || 'Abim'} selam, şu an dükkanda tıraştayım. Randevu için yazdıysan buralara gün/saat bildir hemen rezerve edeyim, değilse işim bitince arıyorum!`;
      }
      return 'Merhaba, şu an çalışıyorum. Randevu almak için WhatsApp üzerinden yazabilirsiniz; müsait olunca dönüş yapacağım.';
    }
  }
}
module.exports = new AIService();
