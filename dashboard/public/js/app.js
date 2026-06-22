const API = '';
const DAYS = ['Pazar','Pazartesi','Salı','Çarşamba','Perşembe','Cuma','Cumartesi'];
const MONTHS = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
const STATUS_TR = {pending:'Bekliyor',confirmed:'Onaylı',completed:'Tamamlandı',cancelled:'İptal'};

let shareConfig = { productName: 'Akıllı Berber', referralUrl: window.location.origin };

async function loadShareConfig() {
  try {
    const res = await fetch(`${API}/api/public/config`);
    if (res.ok) shareConfig = { ...shareConfig, ...(await res.json()) };
  } catch (_) {}
}
loadShareConfig();

function buildShareMessage() {
  const name = currentUser?.name;
  const product = shareConfig.productName || 'Akıllı Berber';
  const url = shareConfig.referralUrl || window.location.origin;
  const intro = name
    ? `Merhaba! Ben ${name}, berberimde ${product} randevu asistanını kullanıyorum.`
    : `Merhaba! Berber randevularını WhatsApp ve yapay zeka ile yöneten ${product} sistemini denedim.`;
  return `${intro} Gerçekten işime yaradı — sen de bir göz at:\n${url}\n\n✂️ Otomatik WhatsApp randevu\n📞 Cevapsız arama yanıtı\n📅 Berber yönetim paneli`;
}

function openShareModal() {
  const preview = document.getElementById('share-preview');
  const message = buildShareMessage();
  if (preview) preview.textContent = message;
  const nativeBtn = document.getElementById('btn-share-native');
  if (nativeBtn) {
    nativeBtn.style.display = navigator.share ? 'block' : 'none';
  }
  document.getElementById('modal-share')?.classList.add('open');
}

async function shareViaWhatsApp() {
  const message = buildShareMessage();
  window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
}

async function copyShareMessage() {
  const message = buildShareMessage();
  try {
    await navigator.clipboard.writeText(message);
    showToast('Paylaşım metni panoya kopyalandı!', 'success');
  } catch {
    showToast('Kopyalama başarısız. Metni elle seçip kopyalayabilirsiniz.', 'error');
  }
}

async function shareNative() {
  if (!navigator.share) return;
  try {
    await navigator.share({
      title: shareConfig.productName || 'Akıllı Berber',
      text: buildShareMessage(),
      url: shareConfig.referralUrl || window.location.origin,
    });
  } catch (e) {
    if (e?.name !== 'AbortError') showToast('Paylaşım iptal edildi veya desteklenmiyor.', 'error');
  }
}

function showToast(message, type = 'success') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = (type === 'success' ? '✅ ' : '❌ ') + message;
  container.appendChild(toast);
  
  setTimeout(() => toast.classList.add('show'), 50);
  
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// Güvenli Depolama Yardımcısı (iFrame içinde çerez/depolama engelleme durumlarında çökmemesi için)
const safeStorage = {
  getItem: function(key) {
    try { return localStorage.getItem(key); } catch(e) { return this._mem[key] || null; }
  },
  setItem: function(key, val) {
    try { localStorage.setItem(key, val); } catch(e) { this._mem[key] = String(val); }
  },
  removeItem: function(key) {
    try { localStorage.removeItem(key); } catch(e) { delete this._mem[key]; }
  },
  _mem: {}
};

let token = safeStorage.getItem('berber_token');
let currentUser = null;
try {
  currentUser = JSON.parse(safeStorage.getItem('berber_user')||'null');
} catch(e) {
  console.error("Kullanıcı verisi ayrıştırılamadı:", e);
}
let services = [];
let editingAppointmentId = null;

if(token && currentUser) {
  showDashboard();
}

function hideAuthScreens() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('onboarding-screen').style.display = 'none';
}

function showLoginScreen() {
  hideAuthScreens();
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('dashboard-screen').style.display = 'none';
  const err = document.getElementById('login-error');
  if (err) err.style.display = 'none';
}

function showOnboardingScreen() {
  hideAuthScreens();
  document.getElementById('onboarding-screen').style.display = 'flex';
  document.getElementById('dashboard-screen').style.display = 'none';
  const err = document.getElementById('register-error');
  if (err) err.style.display = 'none';
}

function persistAuthSession(data) {
  if (!data?.token || !data?.user) {
    throw new Error('Oturum verisi eksik');
  }
  token = data.token;
  currentUser = data.user;
  safeStorage.setItem('berber_token', token);
  safeStorage.setItem('berber_user', JSON.stringify(currentUser));
}

function formatAuthError(data, fallback) {
  if (Array.isArray(data?.details) && data.details.length) {
    return data.details.join(' · ');
  }
  return data?.error || fallback;
}

document.getElementById('login-password')?.addEventListener('keydown',e=>{if(e.key==='Enter')doLogin();});
document.getElementById('reg-password')?.addEventListener('keydown',e=>{if(e.key==='Enter')doRegisterBusiness();});

async function doLogin(){
  const phone=document.getElementById('login-phone').value.trim();
  const password=document.getElementById('login-password').value;
  const btn=document.getElementById('login-btn');
  const err=document.getElementById('login-error');
  err.style.display='none';btn.disabled=true;btn.textContent='Giriş yapılıyor...';
  try{
    const res=await fetch(`${API}/api/auth/login`,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({phone,password})
    });
    const data=await res.json();
    if(!res.ok) throw new Error(formatAuthError(data, 'Giriş başarısız. Lütfen şifrenizi kontrol edin.'));
    persistAuthSession(data);
    showDashboard();
  }catch(e){
    err.textContent=e.message;
    err.style.display='block';
  }finally{
    btn.disabled=false;
    btn.textContent='Giriş Yap';
  }
}

async function doRegisterBusiness() {
  const btn = document.getElementById('register-btn');
  const err = document.getElementById('register-error');
  const payload = {
    ownerName: document.getElementById('reg-owner-name').value.trim(),
    ownerPhone: document.getElementById('reg-owner-phone').value.trim(),
    ownerEmail: document.getElementById('reg-owner-email').value.trim() || undefined,
    password: document.getElementById('reg-password').value,
    businessName: document.getElementById('reg-business-name').value.trim(),
    businessType: document.getElementById('reg-business-type').value,
    city: document.getElementById('reg-city').value.trim(),
  };

  err.style.display = 'none';
  btn.disabled = true;
  btn.textContent = 'Kayıt oluşturuluyor...';

  try {
    const res = await fetch(`${API}/api/auth/register/business`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(formatAuthError(data, 'Kayıt tamamlanamadı. Lütfen bilgileri kontrol edin.'));
    }
    persistAuthSession(data);
    showToast(`Hoş geldiniz! ${data.business?.name || 'İşletmeniz'} hazır.`, 'success');
    showDashboard();
  } catch (e) {
    err.textContent = e.message;
    err.style.display = 'block';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Kaydı Tamamla';
  }
}

function doLogout(){
  safeStorage.removeItem('berber_token');
  safeStorage.removeItem('berber_user');
  token=null;
  currentUser=null;
  showLoginScreen();
}

async function showDashboard(){
  hideAuthScreens();
  document.getElementById('dashboard-screen').style.display='block';
  document.getElementById('barber-name-display').textContent=currentUser?.name||'Berber';
  
  const picker=document.getElementById('date-picker');
  picker.value=todayStr();
  updateDateHeader(new Date());
  
  await loadServices();
  await loadAppointments();
  await loadProfileSettings();
  await loadMissedCalls();
  
  switchTab('calendar');
}

async function updateBarberStatus(status) {
  if (!token || !status) return;
  try {
    const res = await fetch(`${API}/api/assistant/status`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ assistantStatus: status }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Durum güncellenemedi');
    const sel = document.getElementById('topbar-status');
    if (sel) sel.value = data.assistantStatus || status;
    const missedSel = document.getElementById('missed-status');
    if (missedSel && document.getElementById('tab-missed')?.classList.contains('active')) {
      missedSel.value = data.assistantStatus || status;
    }
    showToast('Asistan durumu güncellendi');
  } catch (e) {
    showToast(e.message, 'error');
    loadProfileSettings();
  }
}

function switchTab(tabName) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  
  document.getElementById('tab-' + tabName).classList.add('active');
  const navBtn = document.getElementById('btn-tab-' + tabName);
  if (navBtn) navBtn.classList.add('active');
  
  if (tabName === 'calendar') {
    loadAppointments();
    loadMissedCalls();
  } else if (tabName === 'missed') {
    loadMissedCalls();
    const topStatus = document.getElementById('topbar-status')?.value;
    const missedSel = document.getElementById('missed-status');
    if (topStatus && missedSel) missedSel.value = topStatus;
  } else if (tabName === 'simulator') {
    loadSimulatedHistory();
  } else if (tabName === 'settings') {
    loadProfileSettings();
    loadServicesTable();
  } else if (tabName === 'contacts-scanner') {
    loadScannerContacts();
  }
}

async function loadServices(){
  try{
    const res=await fetch(`${API}/api/services/list`,{
      headers:{'Authorization':`Bearer ${token}`}
    });
    services=await res.json();
    const sel=document.getElementById('new-service');
    sel.innerHTML='<option value="">-- Hizmet Seçin --</option>';
    let lastType='';
    services.filter(s => s.isActive !== false).forEach(s=>{
      if(s.businessType!==lastType){
        const og=document.createElement('optgroup');
        og.label={berber:'💈 Berber',kuafor:'✂️ Kuaför',guzellik_merkezi:'💅 Güzellik Merkezi'}[s.businessType]||s.businessType;
        sel.appendChild(og);
        lastType=s.businessType;
      }
      const op=document.createElement('option');
      op.value=s.code;
      op.textContent=`${s.category} — ${s.name}`;
      op.dataset.duration=s.defaultDuration;
      op.dataset.priceMin=s.priceMin||0;
      sel.appendChild(op);
    });
  }catch(e){
    console.error('Servisler yüklenemedi:', e);
  }
}

function todayStr(){
  return new Date().toISOString().split('T')[0];
}

function goToToday(){
  const picker=document.getElementById('date-picker');
  picker.value=todayStr();
  loadAppointments();
}

function updateDateHeader(date){
  document.getElementById('display-date').textContent=`${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
  document.getElementById('display-day').textContent=DAYS[date.getDay()];
}

function changeDay(delta){
  const picker=document.getElementById('date-picker');
  const d=new Date(picker.value);
  d.setDate(d.getDate()+delta);
  picker.value=d.toISOString().split('T')[0];
  loadAppointments();
}

async function loadAppointments(){
  if (!token) return;
  const picker=document.getElementById('date-picker');
  const date=new Date(picker.value+'T00:00:00');
  updateDateHeader(date);
  const container=document.getElementById('appointments-container');
  container.innerHTML='<div class="loading"><span class="spinner"></span> Randevular yükleniyor...</div>';
  ['stat-total','stat-confirmed','stat-pending','stat-revenue'].forEach(id=> {
    const el = document.getElementById(id);
    if(el) el.textContent='—';
  });

  try{
    const res=await fetch(`${API}/api/appointments/barber/${currentUser.id}`,{
      headers:{'Authorization':`Bearer ${token}`}
    });
    if(res.status===401){doLogout();return;}
    const all=await res.json();
    const dayStart=new Date(picker.value+'T00:00:00');
    const dayEnd=new Date(picker.value+'T23:59:59');
    
    const appts=all.filter(a=>{
      const d=new Date(a.appointmentDate);
      return d>=dayStart&&d<=dayEnd;
    }).sort((a,b)=>new Date(a.appointmentDate)-new Date(b.appointmentDate));

    const total=appts.length;
    const confirmed=appts.filter(a=>a.status==='confirmed').length;
    const pending=appts.filter(a=>a.status==='pending').length;
    const revenue=appts.filter(a=>a.status!=='cancelled').reduce((s,a)=>s+(a.price||0),0);
    
    document.getElementById('stat-total').textContent=total;
    document.getElementById('stat-confirmed').textContent=confirmed;
    document.getElementById('stat-pending').textContent=pending;
    document.getElementById('stat-revenue').textContent=revenue + ' ₺';
    
    if(!appts.length){
      container.innerHTML='<div class="empty-state">Bu tarih için planlanmış randevu bulunmuyor.</div>';
      return;
    }
    
    container.innerHTML='<div class="appointment-list">'+appts.map(a=>{
      const t=new Date(a.appointmentDate);
      const hh=String(t.getHours()).padStart(2,'0');
      const mm=String(t.getMinutes()).padStart(2,'0');
      const svc=services.find(s=>s.code===a.serviceType);
      const svcName=svc?svc.name:a.serviceType;
      
      return `<div class="appointment-row status-${a.status}">
        <div class="appt-time">${hh}:${mm}</div>
        <div>
          <div class="appt-name">${a.customerName}</div>
          <div class="appt-phone">${a.customerPhone}</div>
        </div>
        <div class="appt-service">${svcName}</div>
        <div class="appt-price">${a.price?a.price+' ₺':'—'}</div>
        <div><span class="status-badge badge-${a.status}">${STATUS_TR[a.status]}</span></div>
        <div class="appt-actions">
          ${a.status!=='cancelled'&&a.status!=='completed'?`<button class="btn-sm btn-confirm" onclick="quickStatus('${a.id}','confirmed')">Onayla</button>`:''}
          ${a.status!=='cancelled'&&a.status!=='completed'?`<button class="btn-sm btn-complete" onclick="quickStatus('${a.id}','completed')">Tamamlandı</button>`:''}
          <button class="btn-sm btn-edit" onclick="openStatusModal('${a.id}','${a.status}',${a.price||0},'${(a.notes||'').replace(/'/g,"\\'")}')">Düzenle</button>
          ${a.status!=='cancelled'?`<button class="btn-sm btn-cancel" onclick="cancelAppointment('${a.id}')">İptal Yap</button>`:''}
        </div>
      </div>`;
    }).join('')+'</div>';
  }catch(e){
    container.innerHTML='<div class="empty-state" style="color:var(--danger)">Randevular alınırken hata oluştu.</div>';
  }
}

async function quickStatus(id,status){
  try{
    const res=await fetch(`${API}/api/appointments/${id}`,{
      method:'PUT',
      headers:{'Authorization':`Bearer ${token}`,'Content-Type':'application/json'},
      body:JSON.stringify({status})
    });
    if(res.ok) {
       loadAppointments();
    }
  }catch(e){
    alert('Güncelleme hatası: '+e.message);
  }
}

async function cancelAppointment(id){
  if(!confirm('Bu randevuyu iptal etmek istediğinize emin misiniz?'))return;
  try{
    const res=await fetch(`${API}/api/appointments/${id}`,{
      method:'DELETE',
      headers:{'Authorization':`Bearer ${token}`}
    });
    if(res.ok) {
      loadAppointments();
    }
  }catch(e){
    alert('İptal hatası: '+e.message);
  }
}

function openModal(id){document.getElementById(id).classList.add('open');}
function closeModal(id){document.getElementById(id).classList.remove('open');}

function openNewModal(){
  document.getElementById('new-name').value='';
  document.getElementById('new-phone').value='';
  document.getElementById('new-service').value='';
  document.getElementById('new-duration').value='30';
  document.getElementById('new-price').value='';
  document.getElementById('new-notes').value='';
  document.getElementById('new-error').style.display='none';
  const picker=document.getElementById('date-picker');
  const dt=new Date(picker.value+'T09:00');
  document.getElementById('new-datetime').value=dt.toISOString().slice(0,16);
  openModal('modal-new');
}

document.getElementById('new-service')?.addEventListener('change',function(){
  const opt=this.options[this.selectedIndex];
  if(opt.dataset.duration)document.getElementById('new-duration').value=opt.dataset.duration;
  if(opt.dataset.priceMin)document.getElementById('new-price').value=opt.dataset.priceMin;
});

async function saveNewAppointment(){
  const name=document.getElementById('new-name').value.trim();
  const phone=document.getElementById('new-phone').value.trim();
  const service=document.getElementById('new-service').value;
  const datetime=document.getElementById('new-datetime').value;
  const duration=parseInt(document.getElementById('new-duration').value);
  const price=parseFloat(document.getElementById('new-price').value)||null;
  const notes=document.getElementById('new-notes').value.trim();
  const err=document.getElementById('new-error');
  err.style.display='none';
  if(!name||!phone||!service||!datetime){
    err.textContent='Lütfen ad, telefon, çalışma seçimi ve tarih/saat doldurunuz.';
    err.style.display='block';
    return;
  }
  try{
    const res=await fetch(`${API}/api/appointments`,{
      method:'POST',
      headers:{'Authorization':`Bearer ${token}`,'Content-Type':'application/json'},
      body:JSON.stringify({
        customerId:currentUser.id,
        customerName:name,
        customerPhone:phone,
        barberId:currentUser.id,
        barberName:currentUser.name,
        serviceType:service,
        appointmentDate:new Date(datetime).toISOString(),
        duration,
        price,
        notes
      })
    });
    const data=await res.json();
    if(!res.ok){
      err.textContent=data.error||'Planlama hatası';
      err.style.display='block';
      return;
    }
    closeModal('modal-new');
    loadAppointments();
  }catch(e){
    err.textContent=e.message;err.style.display='block';
  }
}

function openStatusModal(id,status,price,notes){
  editingAppointmentId=id;
  document.getElementById('update-status').value=status;
  document.getElementById('update-price').value=price||'';
  document.getElementById('update-notes').value=notes||'';
  document.getElementById('modal-status-info').innerHTML = `<strong>Randevu ID:</strong> ${id}<br>Durum güncellemeleri otomatik SMS/WhatsApp uyarısı tetikleyebilir.`;
  openModal('modal-status');
}

async function saveStatusUpdate(){
  const status=document.getElementById('update-status').value;
  const price=parseFloat(document.getElementById('update-price').value)||null;
  const notes=document.getElementById('update-notes').value.trim();
  try{
    const res=await fetch(`${API}/api/appointments/${editingAppointmentId}`,{
      method:'PUT',
      headers:{'Authorization':`Bearer ${token}`,'Content-Type':'application/json'},
      body:JSON.stringify({status,price,notes})
    });
    if(res.ok){
      closeModal('modal-status');
      loadAppointments();
    }
  }catch(e){
    alert('Güncelleme hatası: '+e.message);
  }
}

/* --- WHATSAPP SIMULATION ENGINE (TAB CARD 2) --- */
function changeSimulatedCustomer() {
  const phone = document.getElementById('sim-customer-phone').value.trim();
  const name = document.getElementById('sim-customer-name').value.trim();
  document.getElementById('sim-active-contact-name').textContent = name;
  document.getElementById('sim-active-contact-phone').textContent = phone;
  loadSimulatedHistory();
}

async function loadSimulatedHistory() {
  const phone = document.getElementById('sim-customer-phone').value.trim();
  const chatHist = document.getElementById('sim-chat-history');
  try {
    const res = await fetch(`${API}/api/assistant/simulate-message/${encodeURIComponent(phone)}`, {
      headers: {'Authorization': `Bearer ${token}`}
    });
    const data = await res.json();
    
    if (data.history && data.history.length > 0) {
      chatHist.innerHTML = data.history.map(m => {
        const d = new Date(m.timestamp || new Date());
        const tStr = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
        const isUser = m.role === 'user';
        return `<div class="msg-bubble ${isUser ? 'user' : 'assistant'}">
          ${m.content.replace(/\n/g, '<br>')}
          <div class="msg-meta">${isUser ? 'Müşteri' : 'Yapay Zeka Asistanı'} • ${tStr}</div>
        </div>`;
      }).join('');
    } else {
      chatHist.innerHTML = `<div class="msg-bubble assistant">
        Merhaba ben Gökhan Berber yapay zeka randevu yardımcısıyım! 💈<br>
        Nasıl bir işlem almak istersiniz ve hangi saati planlamak istersiniz?
        <div class="msg-meta">Asistan • Sistem</div>
      </div>`;
    }
    chatHist.scrollTop = chatHist.scrollHeight;
  } catch(e) {
    console.error('Simülasyon geçmişi yüklenemedi:', e);
  }
}

async function sendSimulatedMessage() {
  const inputEl = document.getElementById('sim-input-message');
  const text = inputEl.value.trim();
  if(!text) return;
  
  const phone = document.getElementById('sim-customer-phone').value.trim();
  // Temporarily show message in UI
  const chatHist = document.getElementById('sim-chat-history');
  
  const tempUserHtml = `<div class="msg-bubble user">
    ${text}
    <div class="msg-meta">Müşteri • Gönderiliyor...</div>
  </div>`;
  chatHist.innerHTML += tempUserHtml;
  chatHist.scrollTop = chatHist.scrollHeight;
  inputEl.value = '';

  try {
    const res = await fetch(`${API}/api/assistant/simulate-message`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ phone, message: text })
    });
    const data = await res.json();
    if(res.ok) {
      loadSimulatedHistory();
      // Side effect: reloading appointments ensures that if the agent created a booking, it shows up instantly!
      loadAppointments();
    } else {
      throw new Error(data.error || 'Ağ hatası');
    }
  } catch(err) {
    chatHist.innerHTML += `<div class="msg-bubble assistant" style="color:var(--danger)">
      ⚠️ Hata oluştu: Yapay zeka modülü başlatılamadı veya meşgul. Lütfen daha sonra deneyin.
    </div>`;
    chatHist.scrollTop = chatHist.scrollHeight;
  }
}

function quickSendSim(expression) {
  document.getElementById('sim-input-message').value = expression;
  sendSimulatedMessage();
}

function clearSimChat() {
  const phone = document.getElementById('sim-customer-phone').value.trim();
  if(confirm('Simüle edilmiş sohbet temizlensin mi?')) {
    safeStorage.removeItem('sim_chat_' + phone);
    // Refresh
    const chatHist = document.getElementById('sim-chat-history');
    chatHist.innerHTML = `<div class="msg-bubble assistant">
      Yapay zeka asistan sohbeti sıfırlandı. Asistan ilk selamlama akışıyla yeniden başlayacaktır.
      <div class="msg-meta">Asistan</div>
    </div>`;
  }
}

/* --- MISSED CALL LOGIC (TAB CARD 3) --- */
async function triggerSimulatedMissedCall() {
  const phone = document.getElementById('missed-phone').value.trim();
  const name = document.getElementById('missed-name').value.trim();
  const status = document.getElementById('missed-status').value
    || document.getElementById('topbar-status')?.value
    || 'working';
  const autoReply = document.getElementById('missed-autoreply').value === 'true';
  const logEl = document.getElementById('missed-sim-log');
  
  logEl.style.display = 'block';
  logEl.textContent = '📞 Cevapsız arama sisteme gönderiliyor, asistan analiz yapıyor...';

  try {
    const res = await fetch(`${API}/api/assistant/missed-calls`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        fromPhone: phone,
        fromName: name || null,
        barberStatus: status,
        sendAutoReply: autoReply,
        callAt: new Date().toISOString()
      })
    });
    const data = await res.json();
    if (res.ok) {
      const sent = data.decision?.autoReplySent === true;
      const action = data.decision?.action || 'none';
      logEl.innerHTML = `<strong>🟢 Asistan Analizi Tamamlandı:</strong><br>
      • <strong>Karar:</strong> ${sent ? 'Otomatik geri dönüş gönderildi' : action === 'none' ? 'Mesaj gönderilmedi' : 'Kayıt alındı, mesaj gönderilmedi'}<br>
      • <strong>Nedeni:</strong> ${data.decision?.reason || 'Analiz tamamlandı'}<br>
      • <strong>Kişi Durumu:</strong> ${data.contact?.category || 'Bilinmeyen'}<br>
      • <strong>Müşteri Geçmişi:</strong> ${data.hasAppointmentHistory ? 'Randevu geçmişi var' : 'Randevu geçmişi yok'}<br>
      ${data.decision?.message ? `• <strong>Mesaj:</strong> <em>"${data.decision.message}"</em>` : ''}`;
      
      loadMissedCalls();
    } else {
      throw new Error(data.error);
    }
  } catch(e) {
    logEl.textContent = '❌ Hata oluştu: ' + e.message;
  }
}

async function loadMissedCalls() {
  const container = document.getElementById('missed-calls-container');
  const sidebar = document.getElementById('missed-calls-sidebar');
  try {
    const res = await fetch(`${API}/api/assistant/missed-calls?limit=10`, {
      headers: {'Authorization': `Bearer ${token}`}
    });
    const calls = await res.json();
    const renderRow = (c, compact) => {
      const d = new Date(c.callAt);
      const callTime = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')} - ${d.getDate()}/${d.getMonth()+1}`;
      const sent = c.autoReplySent === true;
      if (compact) {
        return `<div class="missed-sidebar-item"><strong>${c.fromPhone}</strong><br>${c.fromName || '—'} · ${callTime}${sent ? ' · ✓ yanıt' : ''}</div>`;
      }
      return `<div class="missed-row">
        <div>⏱️ ${callTime}</div>
        <div style="font-weight:700;">${c.fromPhone}</div>
        <div>${c.fromName || '<span style="color:var(--muted)">Bilinmiyor</span>'}</div>
        <div style="color:var(--gold)">Durum: ${c.barberStatus}</div>
        <div>
          <span class="status-badge" style="border-color:${sent ? 'var(--success)' : 'var(--muted)'}; color:${sent ? 'var(--success)' : 'var(--muted)'}">
            ${sent ? 'Yanıt gönderildi' : 'Sadece kayıt'}
          </span>
        </div>
      </div>`;
    };

    if (!calls || calls.length === 0) {
      const empty = '<div class="empty-state">Henüz cevapsız arama kaydı yok.</div>';
      if (container) container.innerHTML = empty;
      if (sidebar) sidebar.innerHTML = '<div class="missed-sidebar-item" style="color:var(--muted)">Kayıt yok</div>';
      return;
    }

    if (container) {
      container.innerHTML = `<div class="missed-list">` + calls.map(c => renderRow(c, false)).join('') + `</div>`;
    }
    if (sidebar) {
      sidebar.innerHTML = calls.slice(0, 5).map(c => renderRow(c, true)).join('');
    }
  } catch(e) {
    if (container) container.innerHTML = '<div class="empty-state">Cevapsız aramalar listelenemedi.</div>';
    if (sidebar) sidebar.innerHTML = '<div class="missed-sidebar-item" style="color:var(--danger)">Yüklenemedi</div>';
  }
}

/* --- SETTINGS LOGIC (TAB CARD 4) --- */
async function loadProfileSettings() {
  if (!token) return;
  try {
    const res = await fetch(`${API}/api/assistant/profile`, {
      headers: {'Authorization': `Bearer ${token}`}
    });
    const p = await res.json();
    
    document.getElementById('settings-biz-name').value = p.businessName || '';
    document.getElementById('settings-biz-address').value = p.businessAddress || '';
    document.getElementById('settings-specialties').value = p.specialties ? p.specialties.join(', ') : '';
    document.getElementById('workhours-start').value = p.workHours?.start !== undefined ? p.workHours.start : 9;
    document.getElementById('workhours-end').value = p.workHours?.end !== undefined ? p.workHours.end : 20;
    
    // Checkboxes workDays
    const days = p.workDays || {};
    document.getElementById('workday-monday').checked = days.monday !== false;
    document.getElementById('workday-tuesday').checked = days.tuesday !== false;
    document.getElementById('workday-wednesday').checked = days.wednesday !== false;
    document.getElementById('workday-thursday').checked = days.thursday !== false;
    document.getElementById('workday-friday').checked = days.friday !== false;
    document.getElementById('workday-saturday').checked = days.saturday !== false;
    document.getElementById('workday-sunday').checked = !!days.sunday;

    // Auto-Replies
    document.getElementById('settings-missed-reply').value = p.assistantSettings?.missedCallAutoReply !== false ? 'true' : 'false';
    document.getElementById('settings-unknown-reply').value = p.assistantSettings?.unknownCallerAutoReply !== false ? 'true' : 'false';

    const statusSel = document.getElementById('topbar-status');
    if (statusSel && p.assistantStatus) statusSel.value = p.assistantStatus;
  } catch(e) {
    console.error('Ayarlar yüklenirken hata:', e);
  }
}

async function saveProfileSettings() {
  const businessName = document.getElementById('settings-biz-name').value.trim();
  const businessAddress = document.getElementById('settings-biz-address').value.trim();
  const specialties = document.getElementById('settings-specialties').value.split(',').map(s=>s.trim()).filter(Boolean);
  const start = parseInt(document.getElementById('workhours-start').value);
  const end = parseInt(document.getElementById('workhours-end').value);
  
  const workDays = {
    monday: document.getElementById('workday-monday').checked,
    tuesday: document.getElementById('workday-tuesday').checked,
    wednesday: document.getElementById('workday-wednesday').checked,
    thursday: document.getElementById('workday-thursday').checked,
    friday: document.getElementById('workday-friday').checked,
    saturday: document.getElementById('workday-saturday').checked,
    sunday: document.getElementById('workday-sunday').checked,
  };

  const assistantSettings = {
    missedCallAutoReply: document.getElementById('settings-missed-reply').value === 'true',
    unknownCallerAutoReply: document.getElementById('settings-unknown-reply').value === 'true',
    privateContactAutoReply: true,
    defaultReplyChannel: 'whatsapp'
  };

  const msgVal = document.getElementById('settings-msg');
  msgVal.style.display = 'none';

  try {
    const res = await fetch(`${API}/api/assistant/profile`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        businessName,
        businessAddress,
        specialties,
        workHours: { start, end },
        workDays,
        assistantSettings
      })
    });
    if(res.ok) {
      msgVal.textContent = '✅ Ayarlarınız başarıyla kaydedildi!';
      msgVal.style.display = 'block';
      setTimeout(() => msgVal.style.display='none', 4000);
      showToast('Ayarlarınız başarıyla kaydedildi!', 'success');
      loadProfileSettings();
    } else {
      const data = await res.json();
      throw new Error(data.error || 'Kaydetme hatası');
    }
  } catch(e) {
    showToast('Hata: ' + e.message, 'error');
  }
}

/* --- SERVICES MANAGEMENT LOGIC (CRUD) --- */
let allServices = [];

async function loadServicesTable() {
  const tbody = document.getElementById('services-table-body');
  if (!token) return;
  tbody.innerHTML = '<tr><td colspan="8" style="padding:20px; text-align:center; color:var(--muted);"><span class="spinner"></span> Yükleniyor...</td></tr>';
  
  try {
    const res = await fetch(`${API}/api/services/list`, {
      headers: {'Authorization': `Bearer ${token}`}
    });
    allServices = await res.json();
    
    if (allServices.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" style="padding:20px; text-align:center; color:var(--muted);">Henüz eklenmiş özel bir hizmet yok.</td></tr>';
      return;
    }
    
    tbody.innerHTML = allServices.map(s => {
      const maxPriceStr = s.priceMax && s.priceMax > s.priceMin ? `${s.priceMax} ₺` : '—';
      const statusBadge = s.isActive !== false 
        ? '<span class="status-badge" style="color:var(--success); border-color:rgba(92,184,92,0.3); background:rgba(92,184,92,0.05);">Aktif</span>'
        : '<span class="status-badge" style="color:var(--muted); border-color:var(--border); background:rgba(255,255,255,0.02)">Gizli</span>';
        
      const bizBadge = {
        berber: '<span class="status-badge" style="color:var(--gold); border-color:rgba(230,195,110,0.3); background:rgba(230,195,110,0.05); text-transform:none;">💈 Berber</span>',
        kuafor: '<span class="status-badge" style="color:#a855f7; border-color:rgba(168,85,247,0.3); background:rgba(168,85,247,0.05); text-transform:none;">✂️ Kuaför</span>',
        guzellik_merkezi: '<span class="status-badge" style="color:#ec4899; border-color:rgba(236,72,153,0.3); background:rgba(236,72,153,0.05); text-transform:none;">💅 Güzellik</span>'
      }[s.businessType || 'berber'] || `<span class="status-badge">${s.businessType}</span>`;

      // Ensure notes/strings are simple and safe
      const catEsc = (s.category || '').replace(/'/g, "\\'");
      const nameEsc = (s.name || '').replace(/'/g, "\\'");
      
      return `<tr style="border-bottom:1px solid var(--border); height:50px; vertical-align:middle;">
        <td style="padding:10px;">${bizBadge}</td>
        <td style="padding:10px; font-weight:500; color:var(--gold);">${s.category || 'Diğer'}</td>
        <td style="padding:10px; color:var(--text); font-weight:500;">${s.name}</td>
        <td style="padding:10px;">⏱️ ${s.defaultDuration || 30} dk</td>
        <td style="padding:10px; font-weight:500;">${s.priceMin || 0} ₺</td>
        <td style="padding:10px;">${maxPriceStr}</td>
        <td style="padding:10px;">${statusBadge}</td>
        <td style="padding:10px; text-align:right;">
          <button class="btn-sm btn-edit" style="margin-right:4px;" onclick="openEditServiceModal('${s.id}', '${catEsc}', '${nameEsc}', ${s.defaultDuration || 30}, ${s.priceMin || 0}, ${s.priceMax || 0}, ${s.isActive !== false})">Düzenle</button>
          <button class="btn-sm btn-cancel" onclick="deleteServiceSetting('${s.id}')">Sil</button>
        </td>
      </tr>`;
    }).join('');
  } catch(e) {
    tbody.innerHTML = `<tr><td colspan="8" style="padding:20px; text-align:center; color:var(--danger)">Hizmet listesi alınamadı: ${e.message}</td></tr>`;
  }
}

function openNewServiceModal() {
  document.getElementById('service-modal-title').textContent = 'Yeni Hizmet Ekle';
  document.getElementById('service-edit-id').value = '';
  document.getElementById('service-category').value = '';
  document.getElementById('service-name').value = '';
  document.getElementById('service-duration').value = '30';
  document.getElementById('service-active').value = 'true';
  document.getElementById('service-price-min').value = '';
  document.getElementById('service-price-max').value = '';
  document.getElementById('service-modal-error').style.display = 'none';
  openModal('modal-service');
}

function openEditServiceModal(id, category, name, duration, priceMin, priceMax, isActive) {
  document.getElementById('service-modal-title').textContent = 'Hizmeti Düzenle';
  document.getElementById('service-edit-id').value = id;
  document.getElementById('service-category').value = category;
  document.getElementById('service-name').value = name;
  document.getElementById('service-duration').value = duration;
  document.getElementById('service-active').value = String(isActive);
  document.getElementById('service-price-min').value = priceMin || '';
  document.getElementById('service-price-max').value = (priceMax && priceMax > priceMin) ? priceMax : '';
  document.getElementById('service-modal-error').style.display = 'none';
  openModal('modal-service');
}

async function saveServiceSetting() {
  const id = document.getElementById('service-edit-id').value;
  const category = document.getElementById('service-category').value.trim();
  const name = document.getElementById('service-name').value.trim();
  const defaultDuration = parseInt(document.getElementById('service-duration').value) || 30;
  const isActive = document.getElementById('service-active').value === 'true';
  const priceMin = parseFloat(document.getElementById('service-price-min').value) || 0;
  const priceMax = parseFloat(document.getElementById('service-price-max').value) || priceMin;
  
  const err = document.getElementById('service-modal-error');
  err.style.display = 'none';
  
  if (!category || !name) {
    err.textContent = 'Lütfen Kategori ve Hizmet Adı alanlarını doldurunuz.';
    err.style.display = 'block';
    return;
  }
  
  const isEdit = !!id;
  const url = isEdit ? `${API}/api/services/update/${id}` : `${API}/api/services/create`;
  const method = isEdit ? 'PUT' : 'POST';
  
  try {
    const res = await fetch(url, {
      method: method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        category,
        name,
        defaultDuration,
        priceMin,
        priceMax,
        isActive
      })
    });
    
    const data = await res.json();
    if (res.ok) {
      closeModal('modal-service');
      showToast(isEdit ? 'Hizmet başarıyla güncellendi!' : 'Yeni hizmet başarıyla eklendi!', 'success');
      await loadServices(); // Updates the new appointment select boxes
      loadServicesTable();  // Updates the services manage table list
    } else {
      err.textContent = data.error || 'Kaydetme sırasında bir hata oluştu.';
      err.style.display = 'block';
    }
  } catch(e) {
    err.textContent = e.message;
    err.style.display = 'block';
  }
}

async function deleteServiceSetting(id) {
  if (!confirm('Bu hizmeti silmek istediğinizden emin misiniz? (Mevcut randevularınız etkilenmez)')) return;
  
  try {
    const res = await fetch(`${API}/api/services/delete/${id}`, {
      method: 'DELETE',
      headers: {'Authorization': `Bearer ${token}`}
    });
    if (res.ok) {
      showToast('Hizmet başarıyla silindi!', 'success');
      await loadServices(); // Reload dropdown options
      loadServicesTable();  // Reload table
    } else {
      const data = await res.json();
      showToast('Hata: ' + data.error, 'error');
    }
  } catch(e) {
    showToast('Hata: ' + e.message, 'error');
  }
}

// Close modals when clicking out of bounds
document.querySelectorAll('.modal-overlay').forEach(el=>{
  el.addEventListener('click',e=>{if(e.target===el)el.classList.remove('open');});
});

/* --- ACCESSIBLE CRM & PHONE CONTACT SCANNER LOGIC --- */
const MOCK_LOCAL_CONTACTS = [
  { name: "Adalet Şahin", phone: "+905322221100", hint: "Anneniz (Rehberde sadece adıyla kayıtlı)" },
  { name: "Canan Şahin", phone: "+905333332211", hint: "Eşiniz" },
  { name: "Mümtaz Demir", phone: "+905424443322", hint: "Sürekli Gelen Mümtaz Abi / Kanaat Önderi" },
  { name: "Hasan Şahin", phone: "+905556667788", hint: "Erkek Kardeşiniz" },
  { name: "Süleyman Akbaş", phone: "+905329994433", hint: "Geleneksel Dükkan Dostu" },
  { name: "Zeynep Çelik", phone: "+905448889900", hint: "Yakın Akraba" },
  { name: "Ali Vural Usta", phone: "+905559998877", hint: "Yedek Makasçı / Meslektaş Dost" },
  { name: "Ahmet Korkmaz", phone: "+905351112233", hint: "Fırsatçı Sakal Müşterisi" },
  { name: "Zehra Gündüz", phone: "+905461112244", hint: "Haftalık Fön Müşterisi" },
  { name: "Selim Amca", phone: "+905321112255", hint: "Bitişik Çay Ocağı Esnafı / Yakın Dost" },
];

let scannerDatabaseContacts = [];

async function loadScannerContacts() {
  if (!token) return;
  const listContainer = document.getElementById('phone-contacts-list');
  
  const isScanned = safeStorage.getItem('contacts_scanned') === 'true';
  if (!isScanned) {
    listContainer.innerHTML = `
      <div class="empty-state" style="padding: 40px 20px;">
        <span style="font-size:40px; margin-bottom:12px; display:block;">📱</span>
        <h3>Rehber Henüz Taranmadı</h3>
        <p style="color:var(--muted); font-size:12.5px; margin-top:8px; line-height:1.5; max-width:400px; margin-left:auto; margin-right:auto;">
          Henüz simüle edilmiş Android veya iOS rehber taraması başlatmadınız. Telefon rehberindeki kişileri buraya aktarmak için sol taraftaki <strong>"Android / iOS Rehberini Tara"</strong> butonuna basın.
        </p>
      </div>`;
    document.getElementById('contacts-stats-box').style.display = 'none';
    return;
  }
  
  document.getElementById('contacts-stats-box').style.display = 'block';
  listContainer.innerHTML = '<div class="loading"><span class="spinner"></span> Veritabanı senkronize ediliyor...</div>';

  try {
    const res = await fetch(`${API}/api/assistant/contacts`, {
      headers: {'Authorization': `Bearer ${token}`}
    });
    scannerDatabaseContacts = await res.json();
    renderScannerContactsList();
  } catch(e) {
    listContainer.innerHTML = `<div class="empty-state" style="color:var(--danger)">Rehber listelenirken hata oluştu: ${e.message}</div>`;
  }
}

function renderScannerContactsList() {
  const listContainer = document.getElementById('phone-contacts-list');
  const searchVal = document.getElementById('contact-search').value.toLowerCase().trim();
  const filterCat = document.getElementById('contact-filter-category').value;
  
  const contactsToRender = MOCK_LOCAL_CONTACTS.map(local => {
    const dbMatch = scannerDatabaseContacts.find(db => db.phone === local.phone);
    return {
      name: local.name,
      phone: local.phone,
      hint: local.hint,
      category: dbMatch ? dbMatch.category : 'unclassified',
      dbId: dbMatch ? dbMatch.id : null
    };
  });
  
  let filtered = contactsToRender.filter(c => {
    return c.name.toLowerCase().includes(searchVal) || c.phone.includes(searchVal);
  });
  
  if (filterCat !== 'all') {
    if (filterCat === 'unclassified') {
      filtered = filtered.filter(c => c.category === 'unclassified' || c.category === 'unknown');
    } else {
      filtered = filtered.filter(c => c.category === filterCat);
    }
  }
  
  const totalScannedCount = MOCK_LOCAL_CONTACTS.length;
  const classifiedCount = contactsToRender.filter(c => ['family', 'friend'].includes(c.category)).length;
  const unknownCount = totalScannedCount - classifiedCount;
  
  document.getElementById('stat-scanned-total').textContent = totalScannedCount;
  document.getElementById('stat-scanned-classified').textContent = classifiedCount;
  document.getElementById('stat-scanned-unknown').textContent = unknownCount;
  
  if (filtered.length === 0) {
    listContainer.innerHTML = '<div class="empty-state">Aranan kriterlere uygun rehber kaydı bulunamadı.</div>';
    return;
  }
  
  listContainer.innerHTML = filtered.map(c => {
    let categoryBadge = '';
    let cardBorderColor = 'var(--border)';
    
    if (c.category === 'family') {
      categoryBadge = '<span class="status-badge" style="color:#ff6b6b; border-color:rgba(255,107,107,0.3); background:rgba(255,107,107,0.05); font-weight:700;">❤️ Aile / Özel En Samimi Akış (Sürpriz Karşılama)</span>';
      cardBorderColor = 'rgba(255,107,107,0.4)';
    } else if (c.category === 'friend') {
      categoryBadge = '<span class="status-badge" style="color:#d4af37; border-color:rgba(212,175,55,0.3); background:rgba(212,175,55,0.05); font-weight:700;">🤝 Dost / Can Esnaflık Hitabı</span>';
      cardBorderColor = 'rgba(212,175,55,0.4)';
    } else if (c.category === 'customer') {
      categoryBadge = '<span class="status-badge" style="color:#5cb85c; border-color:rgba(92,184,92,0.3); background:rgba(92,184,92,0.05);">👤 Kayıtlı Müşteri</span>';
    } else {
      categoryBadge = '<span class="status-badge" style="color:var(--muted); border-color:var(--border); background:rgba(255,255,255,0.02);">📱 Kayıtsız (Otomatik Yapay Zeka Sınıflandırmasında)</span>';
    }
    
    const nameEsc = c.name.replace(/'/g, "\\'");
    const phoneEsc = c.phone.replace(/'/g, "\\'");
    
    return `
      <div class="missed-row" style="grid-template-columns: 220px 140px 1.5fr 180px; padding: 14px 18px; border-color:${cardBorderColor}; transition: all 0.2s;">
        <div>
          <div style="font-weight:700; color:var(--text); font-size:14px;">${c.name}</div>
          <div style="font-size:11px; color:var(--muted); margin-top:2px;">${c.hint}</div>
        </div>
        <div style="font-family:monospace; font-size:12px; color:var(--muted);">${c.phone}</div>
        <div>${categoryBadge}</div>
        <div style="display:flex; gap:6px; justify-content:flex-end;">
          <button class="btn-sm" style="border-color:#ff6b6b; color:#ff6b6b; background:${c.category === 'family' ? 'rgba(255,107,107,0.15)' : 'none'}" onclick="saveContactCategory('${nameEsc}', '${phoneEsc}', 'family')">❤️ Aile</button>
          <button class="btn-sm" style="border-color:#d4af37; color:#d4af37; background:${c.category === 'friend' ? 'rgba(212,175,55,0.15)' : 'none'}" onclick="saveContactCategory('${nameEsc}', '${phoneEsc}', 'friend')">🤝 Dost</button>
          ${c.category !== 'unclassified' && c.category !== 'unknown' ? `
            <button class="btn-sm" style="border-color:var(--muted); color:var(--muted);" onclick="resetContactCategory('${phoneEsc}')">❌ Sıfırla</button>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');
}

async function saveContactCategory(name, phone, category) {
  try {
    const res = await fetch(`${API}/api/assistant/contacts`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name, phone, category, autoReplyEnabled: true })
    });
    if (res.ok) {
      await loadScannerContacts();
      loadMissedCalls();
    } else {
      const data = await res.json();
      throw new Error(data.error);
    }
  } catch(e) {
    alert('Sınıflandırma kaydedilirken hata oluştu: ' + e.message);
  }
}

async function resetContactCategory(phone) {
  try {
    const res = await fetch(`${API}/api/assistant/contacts/${encodeURIComponent(phone)}`, {
      method: 'DELETE',
      headers: {'Authorization': `Bearer ${token}`}
    });
    if (res.ok) {
      await loadScannerContacts();
      loadMissedCalls();
    } else {
      const data = await res.json();
      throw new Error(data.error);
    }
  } catch(e) {
    alert('Sıfırlama sırasında hata oluştu: ' + e.message);
  }
}

function filterContacts() {
  renderScannerContactsList();
}

function startSimulatedContactScan() {
  const progressBox = document.getElementById('scan-progress-box');
  const btnScan = document.getElementById('btn-scan-contacts');
  const statusText = document.getElementById('scan-status-text');
  const percentage = document.getElementById('scan-percentage');
  const progressBar = document.getElementById('scan-progress-bar');
  const subtext = document.getElementById('scan-subtext');
  
  btnScan.disabled = true;
  progressBox.style.display = 'block';
  progressBar.style.width = '0%';
  percentage.textContent = '0%';
  
  let currentProgress = 0;
  
  const interval = setInterval(() => {
    currentProgress += 5;
    if (currentProgress > 100) currentProgress = 100;
    
    progressBar.style.width = currentProgress + '%';
    percentage.textContent = currentProgress + '%';
    
    if (currentProgress < 25) {
      statusText.textContent = '🔍 Cihaz Analizi...';
      subtext.textContent = 'Android / iOS işletim sistemi ve API katmanı taranıyor...';
    } else if (currentProgress < 55) {
      statusText.textContent = '🔑 İzinler Kontrol Ediliyor...';
      subtext.textContent = 'Rehber okuma ve entegrasyon izinleri onaylanıyor...';
    } else if (currentProgress < 85) {
      statusText.textContent = '📂 Rehber Belleği Okunuyor...';
      subtext.textContent = 'Entegre 427 yerel kişi taranıyor ve senkronize ediliyor...';
    } else if (currentProgress < 100) {
      statusText.textContent = '☁️ Bulut Senkronizasyonu...';
      subtext.textContent = 'Akıllı yapay zeka hafıza modelleriyle eşleştirme yapılıyor...';
    } else {
      statusText.textContent = '✅ Tarama Tamamlandı!';
      subtext.textContent = 'Telefon rehberiniz başarıyla tarandı ve asistanınıza aktarıldı!';
      clearInterval(interval);
      
      safeStorage.setItem('contacts_scanned', 'true');
      btnScan.disabled = false;
      
      setTimeout(() => {
        progressBox.style.display = 'none';
        loadScannerContacts();
      }, 1000);
    }
  }, 100);
}
