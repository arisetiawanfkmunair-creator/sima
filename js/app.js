'use strict';
'use strict';
/* =============================================================================
   SIMA SOBAT JEZ — app.js (SPA klien, GitHub Pages)
   Arsitektur gas-pro-api: frontend statis di GitHub Pages, backend Apps Script
   sebagai REST API JSON. Komunikasi: fetch() POST text/plain ke GAS_URL (js/config.js).
   Empat prinsip instant UX:
   1) SPA: semua halaman dirender di klien; pindah menu tanpa muat ulang halaman.
   2) Optimistic UI + localStorage: data tampil seketika dari cache lalu disegarkan.
   3) Dedupe request baca in-flight; aksi tulis menaikkan epoch agar data tidak basi.
   4) Batch di server: 1 panggilan 'boot' / 'sinkron' membawa paket data lengkap.
   ========================================================================== */

/* ============================== 0. UTILITAS ============================== */
let BOOT = (() => { try { return JSON.parse(localStorage.getItem('sima_brand') || '{}') || {}; } catch (e) { return {}; } })();
const ST = { DRAFT: 'Draft', DIKIRIM: 'Dikirim', KEMBALI: 'Dikembalikan', MENUNGGU: 'Menunggu TTD', SELESAI: 'Selesai', DITOLAK: 'Ditolak', BATAL: 'Dibatalkan', TOLAK_SA: 'Ditolak Super Admin' };
const ST_AKHIR = [ST.SELESAI, ST.DITOLAK, ST.BATAL, ST.TOLAK_SA];
const ST_GAGAL = [ST.DITOLAK, ST.BATAL, ST.TOLAK_SA];
const ROLE_LBL = { SUPER_ADMIN: 'Super Admin', ADMIN_DIVISI: 'Admin Divisi', PENANDA_TANGAN: 'Penanda Tangan', ANGGOTA: 'Anggota' };
const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const BLN3 = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const HARI3 = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const ROMAWI = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
const WARNA = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)', 'var(--c5)', 'var(--c6)'];
const AV_BG = ['#3B6CF6', '#0E9F6E', '#C2410C', '#7C3AED', '#0891B2', '#BE185D', '#A16207', '#475569'];
const LS = { token: 'sima_token', cache: 'sima_cache_v1', tema: 'sima_tema', draft: 'sima_draft_', brand: 'sima_brand' };
const CDN = {
  qr: 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js',
  scan: 'https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js',
  xlsx: 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
  jspdf: 'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js',
  autotable: 'https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js',
  pdfjs: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js',
  pdfjsWorker: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js'
};

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ic = (n, c = '') => `<span class="ms ${c}" aria-hidden="true">${n}</span>`;
const rp = n => 'Rp' + Math.round(Number(n) || 0).toLocaleString('id-ID');
const angka = n => Number(n || 0).toLocaleString('id-ID');
const ya = v => String(v).toUpperCase() === 'YA';
const pad2 = n => String(n).padStart(2, '0');
function tgl(ms) { if (!ms) return '-'; const d = new Date(ms); return `${d.getDate()} ${BLN3[d.getMonth()]} ${d.getFullYear()}`; }
function tglPanjang(ms) { if (!ms) return '-'; const d = new Date(ms); return `${d.getDate()} ${BULAN[d.getMonth()]} ${d.getFullYear()}`; }
function jam(ms) { const d = new Date(ms); return pad2(d.getHours()) + ':' + pad2(d.getMinutes()); }
function tglJam(ms) { return ms ? tgl(ms) + ' • ' + jam(ms) : '-'; }
function relatif(ms) {
  if (!ms) return '-';
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 45) return 'baru saja';
  if (s < 3600) return Math.round(s / 60) + ' mnt lalu';
  if (s < 86400) return Math.round(s / 3600) + ' jam lalu';
  if (s < 86400 * 7) return Math.round(s / 86400) + ' hari lalu';
  return tgl(ms);
}
function durasi(ms) {
  ms = Math.abs(ms);
  const tj = Math.round(ms / 36e5), h = Math.floor(tj / 24), j = tj % 24;
  if (h && j) return `${h} hari ${j} jam`;
  if (h) return `${h} hari`;
  if (j) return `${j} jam`;
  return Math.max(1, Math.round(ms / 6e4)) + ' mnt';
}
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } };
const lsDel = k => { try { localStorage.removeItem(k); } catch (e) { /* abaikan */ } };
function inisial(nama) { const p = String(nama || '?').replace(/^(Ir|Dr|H|Hj|Prof)\.\s*/gi, '').trim().split(/\s+/); return ((p[0] || '?')[0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase(); }
function avBg(s) { let h = 0; String(s || '').split('').forEach(c => { h = (h * 31 + c.charCodeAt(0)) >>> 0; }); return AV_BG[h % AV_BG.length]; }
const avatar = (nama, sm) => `<span class="avatar ${sm ? 'sm' : ''}" style="background:${avBg(nama)}" aria-hidden="true">${esc(inisial(nama))}</span>`;
function toNum(v) {
  if (typeof v === 'number') return v;
  let s = String(v == null ? '' : v).trim().replace(/^Rp\s?/i, '').replace(/\s/g, '');
  if (s === '') return NaN;
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) return Number(s.replace(/\./g, '').replace(',', '.'));
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  if (/^-?\d+,\d+$/.test(s)) return Number(s.replace(',', '.'));
  return NaN;
}
const loaded = {};
function muatSkrip(url) {
  if (loaded[url]) return loaded[url];
  loaded[url] = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = url; s.async = true;
    s.onload = () => res(); s.onerror = () => { delete loaded[url]; rej(new Error('Gagal memuat pustaka. Periksa koneksi internet.')); };
    document.head.appendChild(s);
  });
  return loaded[url];
}
function b64ToBlob(b64, mime) {
  const bin = atob(b64); const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime || 'application/octet-stream' });
}
function unduhBlob(blob, nama) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nama || 'unduhan'; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
async function salin(teks) {
  try { await navigator.clipboard.writeText(teks); }
  catch (e) { const t = document.createElement('textarea'); t.value = teks; t.style.position = 'fixed'; t.style.opacity = '0'; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); } catch (x) { /* abaikan */ } t.remove(); }
  toast('Disalin ke papan klip', 'ok', 1800);
}

/* ============================== 1. STORE ============================== */
const S = {
  token: lsGet(LS.token), me: null, cfg: {}, divisi: [], jenis: [], syarat: [], aturan: [], alur: [], panduan: [], users: [], wa: [], akses: [],
  docs: [], docF: [], ttd: [], meta: {}, t: 0,
  det: {}, view: 'dashboard', params: {}, hist: [],
  period: 'minggu', distTab: 'jenis',
  list: { tab: 'semua', q: '', jenis: '', status: '', divisi: '', tahun: '', bulan: '', sort: 'diperbarui', dir: -1, page: 1 },
  kb: { jenis: '', divisi: '' }, lap: { tahun: new Date().getFullYear(), jenis: '', divisi: '' },
  form: null, setJenis: { kode: null, tab: 'umum', draft: null }, setAlur: { kode: null, list: null }, setAkun: 'permintaan',
  scan: { riwayat: [], aktif: null }, detTab: 'ttd', auth: {}
};
const isSA = () => S.me && S.me.role === 'SUPER_ADMIN';
const isAD = () => S.me && S.me.role === 'ADMIN_DIVISI';
const bisaBuat = () => S.me && S.me.role !== 'PENANDA_TANGAN';
const bisaKanban = () => S.me && S.me.role !== 'ANGGOTA';
const jenisBy = k => S.jenis.find(j => j.Kode === k);
const divisiNama = k => { const d = S.divisi.find(x => x.Kode === k); return d ? d.Nama : (k || '-'); };
const userBy = e => S.users.find(u => u.email === e);
const syaratJenis = k => S.syarat.filter(s => s.Kode_Jenis === k).sort((a, b) => (Number(a.Urutan) || 0) - (Number(b.Urutan) || 0));

function normDoc(o) {
  try { o.alurArr = JSON.parse(o.alur || '[]'); } catch (e) { o.alurArr = []; }
  o.nominal = Number(o.nominal) || 0;
  o.level = Number(o.level) || 0;
  o.totalLevel = Number(o.totalLevel) || o.alurArr.length;
  return o;
}
function barisKeDoc(f, r) { const o = {}; f.forEach((k, i) => { o[k] = r[i]; }); return normDoc(o); }
function terapkanData(d, lengkap) {
  if (d.me) S.me = d.me;
  if (d.docs) { S.docF = d.docs.f; S.docs = d.docs.r.map(r => barisKeDoc(d.docs.f, r)); }
  if (d.ttd) S.ttd = d.ttd;
  if (d.meta) S.meta = d.meta;
  if (d.akses) S.akses = d.akses;
  if (lengkap) ['cfg', 'divisi', 'jenis', 'syarat', 'aturan', 'alur', 'panduan', 'users', 'wa'].forEach(k => { if (d[k] !== undefined) S[k] = d[k]; });
  S.t = d.t || Date.now();
}
function terapkanCfg(c) { if (!c) return; ['jenis', 'syarat', 'aturan', 'alur', 'divisi', 'wa', 'panduan'].forEach(k => { if (c[k]) S[k] = c[k]; }); if (c.set) S.cfg.set = c.set; simpanCache(); }
const simpanCache = debounce(() => {
  if (!S.me) return;
  const pak = {
    email: S.me.email, me: S.me, cfg: S.cfg, divisi: S.divisi, jenis: S.jenis, syarat: S.syarat, aturan: S.aturan, alur: S.alur, panduan: S.panduan,
    users: S.users, wa: S.wa, akses: S.akses, ttd: S.ttd, meta: S.meta, t: S.t,
    docs: { f: S.docF, r: S.docs.map(o => S.docF.map(k => o[k])) }
  };
  if (!lsSet(LS.cache, JSON.stringify(pak))) { pak.ttd = []; lsSet(LS.cache, JSON.stringify(pak)); }
}, 400);
function upsertDoc(o) {
  if (!o || !o.no) return null;
  normDoc(o);
  const i = S.docs.findIndex(d => d.no === o.no);
  if (i >= 0) S.docs[i] = Object.assign(S.docs[i], o); else S.docs.unshift(o);
  simpanCache();
  perbaruiLencana();
  return i >= 0 ? S.docs[i] : o;
}

/* ============================== 2. API ============================== */
let syncN = 0;
function syncBar(d) { syncN = Math.max(0, syncN + d); const b = $('#syncbar'); if (b) b.classList.toggle('on', syncN > 0); }
/** Aksi baca: boleh di-dedupe (request kembar menumpang promise yang sama) dan di-ulang sekali. */
const AKSI_BACA = new Set(['boot', 'sinkron', 'detail', 'pratinjau', 'profil', 'sistem', 'waStatus', 'waAntrean', 'templatInfo', 'ambilBerkas', 'analisa']);
const GAS_URL = (window.SIMA_CONFIG && window.SIMA_CONFIG.GAS_URL) || '';
const _inflight = new Map();
let _epoch = 0;                       // naik setiap aksi tulis → dedupe lama tidak dipakai lagi
const TIMEOUT_MS = 25000;
function gasSiap() { return !!GAS_URL && GAS_URL.indexOf('GANTI_DENGAN') < 0; }
// QR TTD/riwayat yang sudah tercetak memakai alamat GitHub Pages (?v= / ?r=). Halaman verifikasi
// dilayani backend, jadi pengguna dialihkan penuh ke /exec dengan parameter yang sama (bukan iframe).
if (gasSiap() && /[?&](v|r)=/.test(location.search)) location.replace(GAS_URL + location.search);
async function kirimApi(body) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    // text/plain agar TIDAK memicu preflight CORS (ditolak Apps Script)
    const res = await fetch(GAS_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body), signal: ctrl.signal });
    if (!res.ok) throw new Error('Server merespons HTTP ' + res.status + '.');
    return await res.json();
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('Server terlalu lama merespons. Coba lagi.');
    throw e;
  } finally { clearTimeout(t); }
}
function call(action, data = {}, opt = {}) {
  if (!gasSiap()) return Promise.reject(new Error('Alamat server belum diisi di js/config.js (GAS_URL).'));
  const baca = AKSI_BACA.has(action);
  const kunci = baca ? _epoch + '|' + action + '|' + (S.token || '') + '|' + JSON.stringify(data) : '';
  if (baca && _inflight.has(kunci)) return _inflight.get(kunci);
  if (!baca) _epoch++;
  if (!opt.silent) syncBar(1);
  const p = (async () => {
    try {
      let res;
      try { res = await kirimApi({ action: action, token: S.token, data: data }); }
      catch (e) { if (!baca) throw e; res = await kirimApi({ action: action, token: S.token, data: data }); }   // ulang sekali khusus baca
      if (res && res.success) return res.data;
      const err = new Error((res && res.message) || 'Terjadi kesalahan pada server.');
      err.code = res && res.code; err.detail = res && res.detail;
      if (err.code === 'AUTH' && action !== 'boot') { toast(err.message, 'warn'); keluar(true); }
      throw err;
    } catch (e) {
      if (/Failed to fetch|NetworkError|Load failed/i.test(String(e && e.message))) throw new Error('Koneksi ke server gagal. Periksa internet Anda.');
      throw e;
    } finally { if (!opt.silent) syncBar(-1); }
  })();
  if (baca) { _inflight.set(kunci, p); p.then(() => _inflight.delete(kunci), () => _inflight.delete(kunci)); }
  return p;
}
/** Jalankan aksi dengan status tombol (spinner) — tanpa overlay yang memblokir layar. */
async function denganTombol(btn, fn) {
  if (btn && btn.disabled) return;
  const html = btn ? btn.innerHTML : '';
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spin" aria-hidden="true"></span>' + (btn.dataset.loading || 'Memproses…'); }
  try { return await fn(); }
  catch (e) { toast(e.message, 'bad', 5000); throw e; }
  finally { if (btn && btn.isConnected) { btn.disabled = false; btn.innerHTML = html; } }
}

/* ============================== 3. RULE ENGINE (cermin server) ============================== */
const RE_TERM = /^([A-Za-z_]\w*)\s*(?:(<=|>=|==|!=|=|<|>|~)\s*|\s+(in)\s+)([^<>=!~\s].*)$/i;
function evalKondisi(expr, data) {
  expr = String(expr == null ? '' : expr).trim();
  if (!expr) return true;
  return expr.split(/\s+(?:OR|ATAU|\|\|)\s+/i).some(or => or.split(/\s+(?:AND|DAN|&&)\s+/i).every(t => evalTerm(t.trim(), data)));
}
function evalTerm(t, data) {
  const m = t.match(RE_TERM);
  if (!m) return false;
  const f = m[1], op = (m[2] || m[3]).toLowerCase();
  let raw = m[4].trim();
  const left = data[f] == null ? '' : data[f];
  if (op === 'in') { const list = raw.replace(/^\[|\]$/g, '').split(',').map(s => s.trim().replace(/^["']|["']$/g, '').toLowerCase()); return list.indexOf(String(left).toLowerCase()) >= 0; }
  const quoted = /^(["']).*\1$/.test(raw);
  if (quoted) raw = raw.slice(1, -1);
  const ln = toNum(left), rn = toNum(raw);
  const num = !quoted && !isNaN(ln) && !isNaN(rn);
  const a = num ? ln : String(left).toLowerCase(), b = num ? rn : String(raw).toLowerCase();
  if (!num && ['<', '<=', '>', '>='].indexOf(op) >= 0 && (String(left) === '' || isNaN(ln))) return false;
  switch (op) { case '<': return a < b; case '<=': return a <= b; case '>': return a > b; case '>=': return a >= b; case '==': case '=': return a === b; case '!=': return a !== b; case '~': return String(a).indexOf(String(b)) >= 0; default: return false; }
}
const kondisiValid = e => !String(e || '').trim() || String(e).trim().split(/\s+(?:OR|ATAU|\|\|)\s+/i).every(o => o.split(/\s+(?:AND|DAN|&&)\s+/i).every(t => RE_TERM.test(t.trim())));
function labelJabatan(kode) {
  const map = {};
  String(S.cfg.labelJabatan || '').split(';').forEach(p => { const kv = p.split('='); if (kv[0]) map[kv[0].trim()] = (kv[1] || '').trim(); });
  return map[kode] || String(kode || '').replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}
function tentukanFormat(kodeJenis, ctx) {
  const j = jenisBy(kodeJenis) || {};
  const rules = S.aturan.filter(a => a.Kode_Jenis === kodeJenis).sort((a, b) => (Number(a.Urutan) || 0) - (Number(b.Urutan) || 0));
  for (const r of rules) if (evalKondisi(r.Kondisi, ctx)) return { nama: r.Nama_Format, kode: String(r.Kode_Format || kodeJenis), kondisi: r.Kondisi || '' };
  return { nama: j.Nama || kodeJenis, kode: kodeJenis, kondisi: '' };
}
function tentukanAlur(kodeJenis, ctx) {
  const lv = S.alur.filter(a => a.Kode_Jenis === kodeJenis).sort((a, b) => (Number(a.Urutan_Level) || 0) - (Number(b.Urutan_Level) || 0)).filter(a => evalKondisi(a.Kondisi_Pemicu, ctx));
  const out = lv.map(a => ({ r: String(a.Role_Penanda_Tangan), l: a.Label_Jabatan || labelJabatan(a.Role_Penanda_Tangan), s: String(a.Lingkup || 'DIVISI').toUpperCase(), k: a.Kondisi_Pemicu || '' }));
  if (!out.length || out[0].r !== 'ADMIN_DIVISI') out.unshift({ r: 'ADMIN_DIVISI', l: 'Admin Divisi', s: 'DIVISI', k: '' });
  return out.map((a, i) => Object.assign({ lv: i + 1 }, a));
}
function bisaTtdLevel(u, divisi, lv) {
  if (!lv || !u) return false;
  if (lv.r === 'ADMIN_DIVISI') return (u.role === 'ADMIN_DIVISI' || u.jabatanTtd === 'ADMIN_DIVISI') && u.divisi === divisi;
  if (u.jabatanTtd !== lv.r) return false;
  return lv.s === 'GLOBAL' || u.divisi === divisi;
}
const kandidat = (divisi, lv) => S.users.filter(u => u.status === 'Aktif' && bisaTtdLevel(u, divisi, lv));
function pemicuJenis(kode) {
  const kunci = new Set();
  S.aturan.filter(a => a.Kode_Jenis === kode).concat(S.alur.filter(a => a.Kode_Jenis === kode))
    .forEach(r => String(r.Kondisi || r.Kondisi_Pemicu || '').replace(/([A-Za-z_]\w*)\s*(?:<=|>=|==|!=|=|<|>|~|\s+in\s+)/gi, (m, k) => { kunci.add(k); return m; }));
  return kunci;
}
function prediksiNomor(kodeJenis, kodeFormat, divisi) {
  const j = jenisBy(kodeJenis) || {};
  const pola = String(j.Pola_Nomor || '{KODE}/{DIVISI}/{BULAN_ROMAWI}/{TAHUN}/{URUT}');
  const d = new Date(), th = String(d.getFullYear()), bl = pad2(d.getMonth() + 1);
  return pola.replace(/\{KODE\}/g, kodeFormat || kodeJenis).replace(/\{JENIS\}/g, kodeJenis).replace(/\{DIVISI\}/g, divisi || '???')
    .replace(/\{TAHUN\}/g, th).replace(/\{TH\}/g, th.slice(2)).replace(/\{BULAN\}/g, bl).replace(/\{BULAN_ROMAWI\}/g, ROMAWI[d.getMonth()])
    .replace(/\{URUT5\}/g, '•••••').replace(/\{URUT3\}/g, '•••').replace(/\{URUT\}/g, '••••');
}

/* ============================== 4. KOMPONEN UI ============================== */
function toast(pesan, jenis = 'ok', ms = 3500) {
  const ikon = { ok: 'check_circle', bad: 'error', warn: 'warning', info: 'info' }[jenis] || 'info';
  const el = document.createElement('div');
  el.className = 'toast ' + jenis;
  el.setAttribute('role', jenis === 'bad' ? 'alert' : 'status');
  el.innerHTML = `<div class="ic">${ic(ikon, 's18')}</div><div class="grow" style="padding-top:4px">${esc(pesan)}</div><button class="ico-btn" style="width:28px;height:28px" aria-label="Tutup">${ic('close', 's16')}</button>`;
  const tutup = () => { el.classList.add('out'); setTimeout(() => el.remove(), 200); };
  el.querySelector('button').onclick = tutup;
  $('#toasts').appendChild(el);
  setTimeout(tutup, ms);
}
let modalStack = [];
function modal({ judul, isi = '', kaki = '', ukuran = '', bahaya = false, ikon = '', onTutup } = {}) {
  const prev = document.activeElement;
  const el = document.createElement('div');
  el.className = 'mdl-bg';
  const id = 'm' + Date.now();
  el.innerHTML = `<div class="mdl ${ukuran} ${bahaya ? 'danger' : ''}" role="dialog" aria-modal="true" aria-labelledby="${id}">
    <div class="mdl-h"><div class="flex center gap8">${ikon ? `<span class="ic-tile ${bahaya ? 'bad' : ''}">${ic(ikon)}</span>` : ''}<h3 id="${id}">${esc(judul)}</h3></div>
    <button class="ico-btn" data-close aria-label="Tutup">${ic('close')}</button></div>
    <div class="mdl-b">${isi}</div>${kaki ? `<div class="mdl-f">${kaki}</div>` : ''}</div>`;
  $('#modalRoot').appendChild(el);
  const m = { el, body: el.querySelector('.mdl-b'), kaki: el.querySelector('.mdl-f') };
  const onKey = e => { if (e.key === 'Escape' && modalStack[modalStack.length - 1] === m) m.tutup(); };
  m.tutup = () => { el.remove(); modalStack = modalStack.filter(x => x !== m); document.removeEventListener('keydown', onKey); if (onTutup) onTutup(); if (prev && prev.focus) prev.focus(); };
  el.addEventListener('mousedown', e => { if (e.target === el) m.tutup(); });
  el.addEventListener('click', e => { if (e.target.closest('[data-close]')) m.tutup(); });
  document.addEventListener('keydown', onKey);
  modalStack.push(m);
  setTimeout(() => { const f = el.querySelector('textarea, input:not([type=hidden]), select, .btn-p'); if (f) f.focus(); }, 60);
  return m;
}
function tanyaAlasan({ judul, pesan = '', label = 'Alasan', okTeks = 'Konfirmasi', bahaya = true, placeholder = '', ikon = 'warning', min = 5 }) {
  return new Promise(resolve => {
    let selesai = false;
    const m = modal({
      judul, bahaya, ikon,
      isi: `${pesan ? `<p class="muted" style="margin:0 0 14px">${pesan}</p>` : ''}
        <div class="fld"><label class="lbl upper xs" for="alasanIn">${esc(label)} <span class="req">*</span></label>
        <textarea class="txa" id="alasanIn" rows="4" placeholder="${esc(placeholder)}"></textarea><div class="err-msg hidden" id="alasanErr">${ic('error', 's14')}Minimal ${min} karakter.</div></div>`,
      kaki: `<button class="btn" data-close>Batal</button><button class="btn ${bahaya ? 'btn-dd' : 'btn-p'}" id="alasanOk">${esc(okTeks)}</button>`,
      onTutup: () => { if (!selesai) resolve(null); }
    });
    m.el.querySelector('#alasanOk').onclick = () => {
      const v = m.el.querySelector('#alasanIn').value.trim();
      if (v.length < min) { m.el.querySelector('#alasanErr').classList.remove('hidden'); m.el.querySelector('#alasanIn').classList.add('bad'); return; }
      selesai = true; m.tutup(); resolve(v);
    };
  });
}
function konfirmasi({ judul, pesan, okTeks = 'Ya, lanjutkan', bahaya = false, ikon = 'help' }) {
  return new Promise(resolve => {
    let ok = false;
    const m = modal({ judul, bahaya, ikon, isi: `<div style="line-height:1.6">${pesan}</div>`, kaki: `<button class="btn" data-close>Batal</button><button class="btn ${bahaya ? 'btn-dd' : 'btn-p'}" id="kfOk">${esc(okTeks)}</button>`, onTutup: () => resolve(ok) });
    m.el.querySelector('#kfOk').onclick = () => { ok = true; m.tutup(); };
  });
}
const kosong = (ikon, judul, desk = '', aksi = '') => `<div class="empty"><div class="ic">${ic(ikon, 's28')}</div><h4>${esc(judul)}</h4>${desk ? `<div class="small" style="max-width:360px">${desk}</div>` : ''}${aksi}</div>`;
const skeleton = (n = 3, h = 120) => Array.from({ length: n }, () => `<div class="sk" style="height:${h}px;border-radius:14px"></div>`).join('');
function pillStatus(d) {
  const st = d.status;
  if (st === ST.DRAFT) return `<span class="pill mut">${ic('edit_note')}Draft</span>`;
  if (st === ST.DIKIRIM) return `<span class="pill pri">${ic('send')}Di Admin Divisi</span>`;
  if (st === ST.KEMBALI) return `<span class="pill warn">${ic('undo')}Dikembalikan</span>`;
  if (st === ST.MENUNGGU) return `<span class="pill warn">${ic('schedule')}Menunggu TTD L${d.level}</span>`;
  if (st === ST.SELESAI) return `<span class="pill ok">${ic('check_circle')}Selesai</span>`;
  return `<span class="pill bad">${ic('cancel')}${esc(st)}</span>`;
}
function ltInfo(d) {
  const now = Date.now(), jamP = Number(S.cfg.pengingatJam) || 24;
  if (d.status === ST.MENUNGGU && d.batasLT) {
    const sisa = d.batasLT - now;
    if (sisa < 0) return { cls: 'bad', t: 'Terlambat ' + durasi(sisa), sisa };
    if (sisa <= jamP * 36e5) return { cls: 'warn', t: 'Sisa ' + durasi(sisa), sisa };
    return { cls: 'ok', t: 'Sisa ' + durasi(sisa), sisa };
  }
  if (d.status === ST.DIKIRIM) return { cls: 'mut', t: 'Belum mulai' };
  if (d.status === ST.SELESAI && d.batasLT) return d.selesai <= d.batasLT ? { cls: 'mut', t: 'Tepat waktu' } : { cls: 'mut', t: 'Lewat ' + durasi(d.selesai - d.batasLT) };
  if (ST_GAGAL.indexOf(d.status) >= 0) return { cls: 'mut', t: 'Dihentikan' };
  return { cls: 'mut', t: '—' };
}
const ltBadge = d => { const l = ltInfo(d); return `<span class="lt ${l.cls}">${esc(l.t)}</span>`; };
const nominalTeks = d => d.nominal ? rp(d.nominal) : '<span class="muted" style="font-style:italic">Non-nominal</span>';
const jenisChip = d => { const j = jenisBy(d.jenis); return `<span class="chip">${esc(j ? j.Nama : d.jenis)}</span>`; };
function hbar(nama, nilai, total, warna) {
  const p = total ? Math.round(nilai / total * 100) : 0;
  return `<div class="hbar"><div class="top-r"><span class="nm">${esc(nama)}</span><span class="vals"><span class="muted tnum">${angka(nilai)}</span><span class="p tnum">${p}%</span></span></div><div class="trk"><div class="fl" style="width:${Math.max(p, nilai ? 2 : 0)}%;background:${warna}"></div></div></div>`;
}
function vbars(seri, opt = {}) {
  const max = Math.max(1, ...seri.map(s => s.v));
  return `<div class="vbars" role="img" aria-label="${esc(opt.aria || 'Grafik batang')}">${seri.map(s => {
    const p = Math.round(s.v / max * 100);
    return `<div class="vbar ${s.on ? 'on' : ''}" title="${esc(s.x)}: ${s.v} dokumen">${s.on ? `<span class="badge">${p}% (${s.v} Dok)</span>` : `<span class="pct tnum">${s.v}</span>`}<div class="track" style="height:${Math.max(p, 4)}%"><div class="fill"></div></div><span class="x">${esc(s.x)}</span></div>`;
  }).join('')}</div>`;
}
async function hydrateQR(root = document) {
  const els = $$('[data-qr]', root);
  if (!els.length) return;
  try { await muatSkrip(CDN.qr); } catch (e) { els.forEach(el => { el.innerHTML = ic('qr_code_2', 's40'); }); return; }
  els.forEach(el => {
    try {
      const q = window.qrcode(0, el.dataset.ec || 'M');
      q.addData(el.dataset.qr); q.make();
      el.innerHTML = q.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
      el.removeAttribute('data-qr');
    } catch (e) { el.innerHTML = ic('qr_code_2', 's40'); }
  });
}
function lokasiPerangkat(timeout = 7000) {
  return new Promise(resolve => {
    if (!navigator.geolocation) { resolve(null); return; }
    let done = false;
    const t = setTimeout(() => { if (!done) { done = true; resolve(null); } }, timeout);
    navigator.geolocation.getCurrentPosition(p => { if (done) return; done = true; clearTimeout(t); resolve({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }); },
      () => { if (done) return; done = true; clearTimeout(t); resolve(null); }, { enableHighAccuracy: true, timeout: timeout - 500, maximumAge: 60000 });
  });
}
const perangkat = () => { const u = navigator.userAgent; const os = /Android/.test(u) ? 'Android' : /iPhone|iPad/.test(u) ? 'iOS' : /Windows/.test(u) ? 'Windows' : /Mac/.test(u) ? 'macOS' : 'Lainnya'; const b = u.includes('Edg/') ? 'Edge' : u.includes('Chrome/') ? 'Chrome' : u.includes('Safari/') ? 'Safari' : u.includes('Firefox/') ? 'Firefox' : 'Browser'; return b + ' · ' + os; };

/** Pratinjau berkas di modal (gambar / PDF via pdf.js) + tombol unduh. Tidak membuka tab baru. */
async function pratinjauBerkas(berkas) {
  const m = modal({ judul: berkas.nama, ukuran: 'xl', ikon: 'visibility', isi: `<div id="pvBody">${skeleton(1, 360)}</div>`, kaki: `<button class="btn" data-close>Tutup</button><button class="btn btn-p" id="pvDl">${ic('download')}Unduh</button>` });
  m.el.querySelector('#pvDl').onclick = () => unduhBlob(b64ToBlob(berkas.b64, berkas.mime), berkas.nama);
  const body = m.el.querySelector('#pvBody');
  if (String(berkas.mime || '').startsWith('image/')) { body.innerHTML = `<img alt="${esc(berkas.nama)}" src="data:${berkas.mime};base64,${berkas.b64}" style="max-width:100%;border-radius:12px;display:block;margin:auto">`; return; }
  if (berkas.mime === 'application/pdf') {
    try {
      await muatSkrip(CDN.pdfjs);
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = CDN.pdfjsWorker;
      const data = Uint8Array.from(atob(berkas.b64), c => c.charCodeAt(0));
      const pdf = await window.pdfjsLib.getDocument({ data }).promise;
      body.innerHTML = '<div class="pdf-pages" id="pvPages"></div>';
      const wrap = body.querySelector('#pvPages');
      const lebar = Math.min(body.clientWidth - 24, 900);
      for (let i = 1; i <= Math.min(pdf.numPages, 30); i++) {
        const page = await pdf.getPage(i);
        const v1 = page.getViewport({ scale: 1 });
        const scale = (lebar / v1.width) * (window.devicePixelRatio || 1);
        const vp = page.getViewport({ scale });
        const cv = document.createElement('canvas');
        cv.width = vp.width; cv.height = vp.height; cv.style.width = lebar + 'px';
        wrap.appendChild(cv);
        await page.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
      }
    } catch (e) {
      body.innerHTML = kosong('picture_as_pdf', 'Pratinjau PDF tidak tersedia', 'Gunakan tombol Unduh untuk membuka berkas di perangkat Anda. (' + esc(e.message) + ')');
    }
    return;
  }
  body.innerHTML = kosong('draft', 'Format tidak dapat dipratinjau', 'Unduh berkas untuk membukanya di aplikasi yang sesuai.');
}

/* ============================== 5. TEMA ============================== */
function terapkanTema(t) {
  document.documentElement.setAttribute('data-theme', t);
  lsSet(LS.tema, t);
  $$('.theme-seg button').forEach(b => b.classList.toggle('on', b.dataset.v === t));
  const meta = document.querySelector('meta[name=theme-color]');
  if (meta) meta.setAttribute('content', t === 'light' ? '#F4F5F8' : '#17171A');
}

/* ============================== 6. ROUTER SPA ============================== */
const VIEWS = {
  dashboard: { t: 'Dashboard', ic: 'space_dashboard', r: () => rDashboard() },
  buat: { t: 'Buat Pengajuan', ic: 'add_circle', r: p => rBuat(p), boleh: bisaBuat },
  daftar: { t: 'Daftar Pengajuan', ic: 'description', r: p => rDaftar(p) },
  kanban: { t: 'Papan Kanban', ic: 'view_kanban', r: () => rKanban(), boleh: bisaKanban },
  detail: { t: 'Detail Dokumen', ic: 'article', r: p => rDetail(p) },
  scanner: { t: 'Scanner Verifikasi', ic: 'qr_code_scanner', r: () => rScanner() },
  panduan: { t: 'Pusat Panduan', ic: 'help_center', r: () => rPanduan() },
  laporan: { t: 'Laporan', ic: 'monitoring', r: () => rLaporan(), boleh: bisaKanban },
  'set-jenis': { t: 'Jenis Administrasi', ic: 'category', r: () => rSetJenis(), boleh: isSA, grup: 'Pengaturan' },
  'set-alur': { t: 'Alur Penandatangan', ic: 'draw', r: () => rSetAlur(), boleh: isSA, grup: 'Pengaturan' },
  'set-akun': { t: 'Persetujuan Akun', ic: 'how_to_reg', r: () => rSetAkun(), boleh: isSA, grup: 'Pengaturan' },
  'set-wa': { t: 'Notifikasi WhatsApp', ic: 'chat', r: () => rSetWa(), boleh: isSA, grup: 'Pengaturan' },
  'set-umum': { t: 'Pengaturan Umum', ic: 'tune', r: () => rSetUmum(), boleh: isSA, grup: 'Pengaturan' },
  profil: { t: 'Profil Saya', ic: 'person', r: () => rProfil() }
};
function go(view, params = {}, opt = {}) {
  const v = VIEWS[view] ? view : 'dashboard';
  if (VIEWS[v].boleh && !VIEWS[v].boleh()) { toast('Menu ini tidak tersedia untuk peran Anda.', 'warn'); return; }
  if (S.view === 'scanner' && v !== 'scanner') hentikanKamera();
  if (!opt.back && (S.view !== v || JSON.stringify(S.params) !== JSON.stringify(params))) S.hist.push({ view: S.view, params: S.params });
  if (S.hist.length > 30) S.hist.shift();
  S.view = v; S.params = params;
  $$('.view').forEach(s => s.classList.toggle('on', s.id === 'v-' + v));
  const meta = VIEWS[v];
  $('#topTitle').textContent = v === 'detail' && params.no ? params.no : meta.t;
  $('#topIc').innerHTML = ic(meta.ic);
  $$('[data-nav]').forEach(a => { const on = a.dataset.nav === v || (v === 'detail' && a.dataset.nav === 'daftar'); a.classList.toggle('on', on); if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  bukaDrawer(false);
  tutupPopover();
  try { meta.r(params); } catch (e) { console.error(e); $('#v-' + v).innerHTML = kosong('error', 'Gagal menampilkan halaman', esc(e.message)); }
  if (!opt.keepScroll) window.scrollTo({ top: 0, behavior: 'auto' });
}
function kembali() { const h = S.hist.pop(); if (h) go(h.view, h.params, { back: true }); else go('dashboard', {}, { back: true }); }
function rerender(opt = {}) {
  if (!S.me) return;
  renderNav();
  const a = document.activeElement;
  const mengetik = a && $('#v-' + S.view) && $('#v-' + S.view).contains(a) && /INPUT|TEXTAREA|SELECT/.test(a.tagName);
  if (S.view === 'buat') { if (S.form) panelForm(); return; }
  if (mengetik && !opt.paksa) return;
  if (['set-jenis', 'set-alur', 'set-wa', 'set-umum', 'profil', 'scanner'].indexOf(S.view) >= 0 && !opt.paksa) return;
  VIEWS[S.view].r(S.params);
}
function bukaDrawer(on) {
  const sb = $('#sb'), bg = $('#drawerBg');
  if (!sb) return;
  const buka = on === undefined ? !sb.classList.contains('open') : on;
  sb.classList.toggle('open', buka); bg.classList.toggle('on', buka);
}

/* ============================== 7. SHELL: navigasi, profil, lencana ============================== */
function jumlahAksi() { return S.docs.filter(d => d.aksi).length; }
function renderNav() {
  const nAksi = jumlahAksi();
  const nAkses = isSA() ? S.akses.length : 0;
  const a = (view, label, ikon, extra = '') => `<button class="nav-a" data-act="go" data-view="${view}" data-nav="${view}" title="${esc(label)}">${ic(ikon)}<span class="lbl-t">${esc(label)}</span>${extra}<span class="ms chev" aria-hidden="true">chevron_right</span></button>`;
  let h = '';
  h += a('dashboard', 'Dashboard', 'grid_view');
  if (bisaBuat()) h += a('buat', 'Buat Pengajuan', 'add_circle');
  h += a('daftar', 'Daftar Pengajuan', 'description', nAksi ? `<span class="badge-n" aria-label="${nAksi} perlu tindakan">${nAksi}</span>` : '');
  if (bisaKanban()) h += a('kanban', 'Papan Kanban', 'view_kanban');
  h += a('scanner', 'Scanner Verifikasi', 'qr_code_scanner', '<span class="badge-new">Baru</span>');
  if (bisaKanban()) h += a('laporan', 'Laporan', 'monitoring');
  h += a('panduan', 'Pusat Panduan', 'help_center');
  if (isSA()) {
    h += '<div class="nav-sec">Pengaturan</div><div class="nav-sep"></div>';
    h += a('set-jenis', 'Jenis Administrasi', 'category');
    h += a('set-alur', 'Alur Penandatangan', 'draw');
    h += a('set-akun', 'Persetujuan Akun', 'how_to_reg', nAkses ? `<span class="badge-n">${nAkses}</span>` : '');
    h += a('set-wa', 'Notifikasi WhatsApp', 'chat');
    h += a('set-umum', 'Pengaturan Umum', 'tune');
  }
  $('#sbNav').innerHTML = `<div class="col gap4">${h}</div>`;
  const b = (view, label, ikon, badge = '') => `<button data-act="go" data-view="${view}" data-nav="${view}" aria-label="${esc(label)}">${ic(ikon)}<span>${esc(label)}</span>${badge}</button>`;
  const mid = bisaBuat() ? `<button data-act="buatBaru" aria-label="Buat pengajuan"><span class="fab">${ic('add', 's28')}</span></button>` : b('scanner', 'Scan', 'qr_code_scanner');
  const ke4 = bisaKanban() ? b('kanban', 'Kanban', 'view_kanban') : b('scanner', 'Scan', 'qr_code_scanner');
  $('#bnav').innerHTML = b('dashboard', 'Beranda', 'grid_view') + b('daftar', 'Daftar', 'description', nAksi ? `<span class="badge-n">${nAksi}</span>` : '') + mid + ke4 + `<button data-act="drawer" aria-label="Menu lainnya">${ic('menu')}<span>Menu</span></button>`;
  $$('[data-nav]').forEach(x => x.classList.toggle('on', x.dataset.nav === S.view || (S.view === 'detail' && x.dataset.nav === 'daftar')));
  $('#notifPing').classList.toggle('hidden', !(nAksi + nAkses));
  $('#topCta').classList.toggle('hidden', !bisaBuat());
}
function perbaruiLencana() { if (S.me) renderNav(); }
function renderShell() {
  const c = S.cfg || {};
  const nama = c.nama || BOOT.nama || 'SIMA SOBAT JEZ';
  $('#sbNama').textContent = nama;
  $('#sbSub').textContent = c.sub || BOOT.sub || 'Admin Management';
  document.title = nama;
  const logo = c.logo || BOOT.logo;
  $('#sbLogo').innerHTML = logo ? `<img src="${esc(logo)}" alt="Logo ${esc(nama)}">` : ic('verified_user', 'f s18');
  const me = S.me;
  $('#meNama').textContent = me.nama;
  $('#meRole').textContent = ROLE_LBL[me.role] + (me.divisi ? ' / ' + me.divisi : '');
  $('#meAvatar').innerHTML = esc(inisial(me.nama)) + '<span class="dot"></span>';
  $('#meAvatar').style.background = avBg(me.nama);
  $('#topGreet').textContent = 'Selamat datang kembali, ' + String(me.nama).split(' ')[0] + ' 👋';
  terapkanTema(document.documentElement.getAttribute('data-theme') || 'dark');
  renderNav();
}

/* ============================== 8. AUTENTIKASI ============================== */
function tampilAuth(step, data = {}) {
  S.auth = Object.assign(S.auth || {}, data, { step });
  $('#app').classList.add('hidden');
  const el = $('#auth');
  el.classList.remove('hidden');
  const b = Object.assign({}, BOOT, data.brand || {});
  const kepala = `<div class="flex center gap12"><div class="brand-mark">${b.logo ? `<img src="${esc(b.logo)}" alt="">` : ic('verified_user', 'f s22')}</div><div><div class="ff-h fw6" style="font-size:16px">${esc(b.nama || 'SIMA SOBAT JEZ')}</div><div class="xs muted">${esc(b.sub || 'Sistem Informasi Manajemen Administrasi')}</div></div></div>`;
  let isi = '';
  if (BOOT.siap === false) {
    isi = `<h1>Aplikasi belum siap</h1><p class="muted">Super Admin perlu menjalankan fungsi <span class="mono">setupAppEnvironment()</span> di editor Apps Script, lalu membuat deployment Web App.</p><div class="alert bad mt12">${ic('build')}<div>${esc(BOOT.sub || '')}</div></div>`;
  } else if (step === 'email') {
    isi = `<h1>Masuk ke akun Anda</h1><p class="muted" style="margin:0 0 18px">Gunakan email Google (Gmail) Anda. Kode verifikasi 6 digit akan dikirim ke email tersebut.</p>
      <form id="fEmail" class="col gap12" novalidate>
        <div class="fld"><label class="lbl" for="inEmail">Email Google</label><input class="inp" id="inEmail" type="email" inputmode="email" autocomplete="email" placeholder="nama@gmail.com" value="${esc(S.auth.email || '')}" required></div>
        <div class="err-msg hidden" id="authErr"></div>
        <button class="btn btn-p btn-block" type="submit" id="btnEmail" data-loading="Mengirim kode…">${ic('mail')}Kirim Kode Verifikasi</button>
      </form>
      <p class="small muted mt16">Belum punya akses? Masukkan email Anda — setelah verifikasi Anda akan diminta mengisi permintaan akses untuk disetujui Super Admin.</p>`;
  } else if (step === 'otp') {
    isi = `<h1>Masukkan kode</h1><p class="muted" style="margin:0 0 18px">Kode 6 digit dikirim via ${esc(S.auth.kanal === 'whatsapp' ? 'WhatsApp' : 'email')} ke <b class="tx">${esc(S.auth.tujuan || S.auth.email)}</b>. Berlaku 10 menit.</p>
      <form id="fOtp" class="col gap16" novalidate>
        <div class="otp" role="group" aria-label="Kode verifikasi">${Array.from({ length: 6 }, (_, i) => `<input inputmode="numeric" autocomplete="${i ? 'off' : 'one-time-code'}" maxlength="6" aria-label="Digit ${i + 1}" data-otp="${i}">`).join('')}</div>
        <div class="err-msg hidden" id="authErr"></div>
        <button class="btn btn-p btn-block" type="submit" id="btnOtp" data-loading="Memverifikasi…">${ic('verified_user')}Verifikasi & Masuk</button>
        <div class="flex between center small"><button type="button" class="lnk" data-act="authKe" data-step="email">${ic('arrow_back', 's16')}Ganti email</button><button type="button" class="lnk" id="btnUlang" disabled>Kirim ulang (60)</button></div>
      </form>`;
  } else if (step === 'daftar') {
    const div = (S.auth.divisi || data.divisi || []).map(d => `<option value="${esc(d.Kode)}">${esc(d.Nama)}</option>`).join('');
    isi = `<h1>Permintaan akses</h1><p class="muted" style="margin:0 0 16px">Email <b class="tx">${esc(S.auth.email)}</b> terverifikasi. ${S.auth.status === 'DITOLAK' ? `<br><span class="c-bad">Permintaan sebelumnya ditolak: ${esc(S.auth.catatan || '-')}</span>` : 'Lengkapi data berikut untuk ditinjau Super Admin.'}</p>
      <form id="fDaftar" class="col gap12" novalidate>
        <div class="fld"><label class="lbl" for="dNama">Nama lengkap <span class="req">*</span></label><input class="inp" id="dNama" autocomplete="name" required></div>
        <div class="g2"><div class="fld"><label class="lbl" for="dJab">Jabatan <span class="req">*</span></label><input class="inp" id="dJab" placeholder="Staf Gudang" required></div>
        <div class="fld"><label class="lbl" for="dDiv">Divisi</label><select class="sel" id="dDiv"><option value="">— pilih —</option>${div}</select></div></div>
        <div class="fld"><label class="lbl" for="dWa">No. WhatsApp <span class="req">*</span></label><input class="inp" id="dWa" inputmode="tel" autocomplete="tel" placeholder="0812xxxxxxxx" required><span class="hint">Untuk notifikasi pengajuan & tanda tangan.</span></div>
        <div class="fld"><label class="lbl" for="dDesk">Keperluan akses <span class="req">*</span></label><textarea class="txa" id="dDesk" rows="3" placeholder="Contoh: membuat nota retur untuk gudang Karawang"></textarea></div>
        <div class="err-msg hidden" id="authErr"></div>
        <button class="btn btn-p btn-block" type="submit" id="btnDaftar" data-loading="Mengirim…">${ic('how_to_reg')}Kirim Permintaan Akses</button>
      </form>`;
  } else if (step === 'menunggu') {
    isi = `<div class="tc mt16"><div class="ic-tile lg warn" style="margin:auto;width:56px;height:56px">${ic('hourglass_top', 's28')}</div><h1>Menunggu persetujuan</h1>
      <p class="muted">Permintaan akses${S.auth.nama ? ' atas nama <b class="tx">' + esc(S.auth.nama) + '</b>' : ''} sedang ditinjau Super Admin${S.auth.diajukan ? ' (diajukan ' + relatif(S.auth.diajukan) + ')' : ''}. Anda akan menerima WhatsApp saat disetujui.</p>
      <button class="btn btn-block mt16" data-act="authKe" data-step="email">${ic('refresh')}Periksa lagi</button></div>`;
  } else if (step === 'nonaktif') {
    isi = `<div class="tc mt16"><div class="ic-tile lg bad" style="margin:auto;width:56px;height:56px">${ic('block', 's28')}</div><h1>Akun nonaktif</h1><p class="muted">Akun Anda dinonaktifkan. Hubungi Super Admin untuk mengaktifkan kembali.</p><button class="btn btn-block mt16" data-act="authKe" data-step="email">Kembali</button></div>`;
  } else {
    isi = `<h1>Tidak dapat terhubung</h1><p class="muted">${esc(data.pesan || 'Server tidak merespons.')}</p><button class="btn btn-p btn-block mt16" data-act="muatUlang">${ic('refresh')}Coba lagi</button>`;
  }
  el.innerHTML = `<div class="auth-card">${kepala}${isi}<p class="xs faint tc mt20">v${esc(BOOT.versi || '1.0')} · Tanda tangan digital ber-HMAC</p></div>`;
  sembunyikanSplash();
  if (step === 'email' && $('#fEmail')) {
    $('#fEmail').onsubmit = e => { e.preventDefault(); mintaOtp(); };
    setTimeout(() => $('#inEmail').focus(), 50);
  }
  if (step === 'otp') pasangOtp();
  if (step === 'daftar') $('#fDaftar').onsubmit = e => { e.preventDefault(); kirimDaftar(); };
}
function authErr(m) { const e = $('#authErr'); if (e) { e.innerHTML = ic('error', 's14') + esc(m); e.classList.remove('hidden'); } }
async function mintaOtp() {
  const email = $('#inEmail').value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { authErr('Masukkan alamat email yang valid.'); $('#inEmail').classList.add('bad'); return; }
  try {
    const r = await denganTombol($('#btnEmail'), () => call('otpMinta', { email }));
    tampilAuth('otp', { email, kanal: r.kanal, tujuan: r.tujuan });
  } catch (e) { authErr(e.message); }
}
function pasangOtp() {
  const ins = $$('[data-otp]');
  ins[0].focus();
  ins.forEach((inp, i) => {
    inp.addEventListener('input', () => {
      const v = inp.value.replace(/\D/g, '');
      if (v.length > 1) { v.slice(0, 6).split('').forEach((c, k) => { if (ins[k]) ins[k].value = c; }); (ins[Math.min(v.length, 5)]).focus(); if (v.length >= 6) $('#fOtp').requestSubmit(); return; }
      inp.value = v;
      if (v && ins[i + 1]) ins[i + 1].focus();
      if (ins.every(x => x.value)) $('#fOtp').requestSubmit();
    });
    inp.addEventListener('keydown', e => { if (e.key === 'Backspace' && !inp.value && ins[i - 1]) ins[i - 1].focus(); });
  });
  $('#fOtp').onsubmit = async e => {
    e.preventDefault();
    const kode = ins.map(x => x.value).join('');
    if (kode.length !== 6) { authErr('Lengkapi 6 digit kode.'); return; }
    try {
      const r = await denganTombol($('#btnOtp'), () => call('otpVerif', { email: S.auth.email, kode }));
      hasilAkun(r);
    } catch (err) { authErr(err.message); ins.forEach(x => { x.value = ''; }); ins[0].focus(); }
  };
  let n = 60;
  const btn = $('#btnUlang');
  const tick = setInterval(() => { if (!btn.isConnected) { clearInterval(tick); return; } n--; btn.textContent = n > 0 ? `Kirim ulang (${n})` : 'Kirim ulang kode'; if (n <= 0) { btn.disabled = false; clearInterval(tick); } }, 1000);
  btn.onclick = async () => { try { const r = await call('otpMinta', { email: S.auth.email }); toast('Kode baru dikirim', 'ok'); tampilAuth('otp', { kanal: r.kanal, tujuan: r.tujuan }); } catch (e) { authErr(e.message); } };
}
function hasilAkun(r) {
  if (r.status === 'OK') {
    S.token = r.token; lsSet(LS.token, r.token);
    terapkanData(r, true); simpanCache();
    $('#auth').classList.add('hidden');
    tampilApp(true);
    toast('Selamat datang, ' + String(r.me.nama).split(' ')[0] + '!', 'ok');
    return;
  }
  if (r.status === 'DAFTAR' || r.status === 'DITOLAK') { tampilAuth('daftar', { vtok: r.vtok, email: r.email, divisi: r.divisi, status: r.status, catatan: r.catatan }); return; }
  if (r.status === 'MENUNGGU') { tampilAuth('menunggu', { nama: r.nama, diajukan: r.diajukan }); return; }
  tampilAuth('nonaktif');
}
async function kirimDaftar() {
  const d = { vtok: S.auth.vtok, nama: $('#dNama').value.trim(), jabatan: $('#dJab').value.trim(), divisi: $('#dDiv').value, noWa: $('#dWa').value.trim(), deskripsi: $('#dDesk').value.trim() };
  if (d.nama.length < 3) return authErr('Nama lengkap minimal 3 karakter.');
  if (!d.jabatan) return authErr('Jabatan wajib diisi.');
  if (d.noWa.replace(/\D/g, '').length < 9) return authErr('Nomor WhatsApp tidak valid.');
  if (d.deskripsi.length < 10) return authErr('Jelaskan keperluan akses (min. 10 karakter).');
  try { const r = await denganTombol($('#btnDaftar'), () => call('daftar', d)); hasilAkun(r); } catch (e) { authErr(e.message); }
}
function keluar(paksa) {
  const lanjut = () => { S.token = null; S.me = null; lsDel(LS.token); lsDel(LS.cache); S.docs = []; S.det = {}; S.form = null; tampilAuth('email', {}); };
  if (paksa) { lanjut(); return; }
  konfirmasi({ judul: 'Keluar dari aplikasi?', pesan: 'Data tersimpan di perangkat ini akan dihapus. Anda perlu kode verifikasi untuk masuk kembali.', okTeks: 'Keluar', ikon: 'logout' }).then(ok => { if (ok) lanjut(); });
}

/* ============================== 9. PENCARIAN GLOBAL & POPOVER ============================== */
function cariDok(q, n = 8) {
  q = q.trim().toLowerCase();
  if (!q) return [];
  return S.docs.filter(d => {
    const j = jenisBy(d.jenis);
    return [d.no, d.judul, d.pemohonNama, d.divisi, d.format, j && j.Nama, d.status].join(' ').toLowerCase().indexOf(q) >= 0;
  }).slice(0, n);
}
function renderCari() {
  const q = $('#gSearch').value;
  const box = $('#searchRes');
  const hasil = cariDok(q);
  if (!q.trim()) { box.classList.add('hidden'); return; }
  box.innerHTML = hasil.length ? hasil.map((d, i) => `<div class="it ${i === 0 ? 'on' : ''}" data-act="bukaDok" data-no="${esc(d.no)}" role="option">${ic('description', 'muted')}<div class="grow" style="min-width:0"><div class="fw6 truncate" style="font-size:13px">${esc(d.no)}</div><div class="xs muted truncate">${esc(d.judul)} · ${esc(d.pemohonNama)}</div></div>${pillStatus(d)}</div>`).join('')
    : `<div class="small muted" style="padding:12px">Tidak ada dokumen cocok dengan “${esc(q)}”.</div>`;
  box.classList.remove('hidden');
}
function tutupPopover() { const p = $('#notifPop'); if (p) p.classList.add('hidden'); const r = $('#searchRes'); if (r) r.classList.add('hidden'); }
function bukaNotif() {
  const pop = $('#notifPop');
  if (!pop.classList.contains('hidden')) { pop.classList.add('hidden'); return; }
  const aksi = S.docs.filter(d => d.aksi).sort((a, b) => (a.batasLT || 9e15) - (b.batasLT || 9e15));
  const akses = isSA() ? S.akses.length : 0;
  pop.innerHTML = `<div class="flex between center" style="padding:6px 8px 10px"><b class="ff-h">Perlu tindakan</b><span class="xs muted">${aksi.length + akses} item</span></div>
    ${akses ? `<div class="list-it click" data-act="go" data-view="set-akun">${ic('how_to_reg', 'c-warn')}<div class="grow"><div class="fw5 small">${akses} permintaan akses baru</div><div class="xs muted">Tinjau & tetapkan role</div></div>${ic('chevron_right', 'muted')}</div>` : ''}
    <div class="col gap6 mt8">${aksi.slice(0, 12).map(d => `<div class="list-it click" data-act="bukaDok" data-no="${esc(d.no)}">${ic(d.status === ST.KEMBALI ? 'undo' : 'draw', d.status === ST.KEMBALI ? 'c-warn' : 'c-pri')}<div class="grow" style="min-width:0"><div class="fw6 small truncate">${esc(d.no)}</div><div class="xs muted truncate">${d.status === ST.KEMBALI ? 'Dikembalikan — perlu revisi' : 'Menunggu TTD Anda'} · ${esc(d.judul)}</div></div>${ltBadge(d)}</div>`).join('') || (akses ? '' : kosong('task_alt', 'Semua beres', 'Tidak ada dokumen yang menunggu tindakan Anda.'))}</div>`;
  pop.classList.remove('hidden');
}

/* ============================== 10. BOOT & SINKRON ============================== */
function sembunyikanSplash() { const s = $('#splash'); if (s && !s.classList.contains('out')) { s.classList.add('out'); setTimeout(() => s.remove(), 300); } }
function tampilApp(segar) {
  $('#auth').classList.add('hidden');
  $('#app').classList.remove('hidden');
  renderShell();
  if (segar || !$('#v-' + S.view).innerHTML) go(S.view, S.params, { back: true, keepScroll: true });
  else rerender();
  sembunyikanSplash();
}
function muatCache() {
  const raw = lsGet(LS.cache);
  if (!raw || !S.token) return false;
  try {
    const c = JSON.parse(raw);
    if (!c.me) return false;
    terapkanData(c, true);
    return true;
  } catch (e) { return false; }
}
let terakhirSinkron = 0;
async function sinkron(opt = {}) {
  if (!S.token || !S.me) return;
  if (Date.now() - terakhirSinkron < 8000 && !opt.paksa) return;
  terakhirSinkron = Date.now();
  try {
    const cvLama = S.meta.cv;
    const d = await call('sinkron', {}, { silent: !opt.tampil });
    terapkanData(d, false);
    if (cvLama && d.meta && d.meta.cv !== cvLama) { const full = await call('boot', {}, { silent: true }); if (!full.perluLogin) terapkanData(full, true); renderShell(); }
    simpanCache();
    rerender();
  } catch (e) { /* senyap: tetap tampilkan data cache */ }
}
let pasangPrompt = null;
let terakhirAktif = Date.now();
/** Pendaftaran service worker (cangkang statis saja) + tombol pasang PWA. */
function daftarPwa() {
  if ('serviceWorker' in navigator && /^https?:/.test(location.protocol)) navigator.serviceWorker.register('sw.js').catch(() => {});
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); pasangPrompt = e; });
  window.addEventListener('appinstalled', () => { pasangPrompt = null; toast('Aplikasi SIMA berhasil dipasang di layar utama.', 'ok', 4000); });
  ['pointerdown', 'keydown'].forEach(ev => document.addEventListener(ev, () => { terakhirAktif = Date.now(); }, { passive: true }));
}
async function pasangAplikasi() {
  if (!pasangPrompt) { toast('Chrome Android: menu ⋮ → Instal aplikasi. iPhone (Safari): Bagikan → Tambahkan ke Layar Utama.', 'warn', 6000); return; }
  pasangPrompt.prompt();
  try { await pasangPrompt.userChoice; } catch (e) { /* abaikan */ }
  pasangPrompt = null;
}
async function init() {
  terapkanTema(document.documentElement.getAttribute('data-theme') || 'dark');
  pasangEvent();
  daftarPwa();
  if (!gasSiap()) { tampilAuth('error', { pesan: 'Alamat server belum diisi. Buka js/config.js lalu isi GAS_URL dengan URL /exec Web App.' }); return; }
  const adaCache = muatCache();
  if (adaCache) tampilApp(true);
  try {
    const d = await call('boot', {}, { silent: adaCache });
    if (d.brand) { BOOT = Object.assign({}, BOOT, d.brand); lsSet(LS.brand, JSON.stringify(BOOT)); }
    if (BOOT.siap === false) { tampilAuth('email'); return; }
    if (d.perluLogin) { S.me = null; lsDel(LS.cache); tampilAuth('email', { brand: d.brand, divisi: d.divisi }); return; }
    if (d.token) { S.token = d.token; lsSet(LS.token, d.token); }
    terapkanData(d, true);
    simpanCache();
    terakhirSinkron = Date.now();
    if (adaCache) { renderShell(); rerender(); } else tampilApp(true);
  } catch (e) {
    if (!adaCache) tampilAuth('error', { pesan: e.message });
    else toast('Offline: menampilkan data tersimpan. ' + e.message, 'warn', 5000);
  }
  // Polling adaptif: 60 dtk saat pengguna aktif (5 menit terakhir), berhenti saat diam atau tab tersembunyi.
  setInterval(() => { if (document.visibilityState === 'visible' && Date.now() - terakhirAktif < 300000) sinkron(); }, 60000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && Date.now() - terakhirSinkron > 60000) sinkron(); });
}

/* ============================== 11. DASHBOARD ============================== */
function periode(p) {
  const now = new Date(), d0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (p === 'hari') return { a: +d0, b: +now, pa: +d0 - 864e5, pb: +d0, lbl: 'hari ini', lblP: 'kemarin' };
  if (p === 'minggu') { const a = +d0 - 6 * 864e5; return { a, b: +now, pa: a - 7 * 864e5, pb: a, lbl: '7 hari terakhir', lblP: 'minggu lalu' }; }
  if (p === 'bulan') { const a = +new Date(now.getFullYear(), now.getMonth(), 1); return { a, b: +now, pa: +new Date(now.getFullYear(), now.getMonth() - 1, 1), pb: a, lbl: 'bulan ini', lblP: 'bulan lalu' }; }
  const a = +new Date(now.getFullYear(), 0, 1);
  return { a, b: +now, pa: +new Date(now.getFullYear() - 1, 0, 1), pb: a, lbl: 'tahun ini', lblP: 'tahun lalu' };
}
const dalam = (ms, a, b) => ms && ms >= a && ms < b + 1;
function deltaChip(cur, prev, ikonNaik = 'trending_up', baikJikaNaik = true, lbl = '') {
  if (!prev && !cur) return `<span class="delta">${ic('remove')}<span class="t">Stabil</span></span>`;
  const p = prev ? Math.round((cur - prev) / prev * 100) : 100;
  const naik = p >= 0;
  const cls = p === 0 ? '' : (naik === baikJikaNaik ? 'up' : 'down');
  return `<span class="delta ${cls}">${ic(naik ? ikonNaik : 'trending_down')}${naik ? '+' : ''}${p}%<span class="t"> ${esc(lbl)}</span></span>`;
}
function seriVolume(p) {
  const now = new Date();
  const hit = (a, b) => S.docs.filter(d => dalam(d.dibuat, a, b - 1)).length;
  if (p === 'tahun') return BLN3.map((x, m) => ({ x, v: hit(+new Date(now.getFullYear(), m, 1), +new Date(now.getFullYear(), m + 1, 1)), on: m === now.getMonth() }));
  if (p === 'bulan') {
    const y = now.getFullYear(), m = now.getMonth(), akhir = new Date(y, m + 1, 0).getDate();
    const out = [];
    for (let w = 0; w * 7 < akhir; w++) { const a = +new Date(y, m, 1 + w * 7), b = +new Date(y, m, Math.min(1 + (w + 1) * 7, akhir + 1)); out.push({ x: 'Mg ' + (w + 1), v: hit(a, b), on: now.getDate() > w * 7 && now.getDate() <= (w + 1) * 7 }); }
    return out;
  }
  const d0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Array.from({ length: 7 }, (_, i) => { const a = +d0 - (6 - i) * 864e5; return { x: HARI3[new Date(a).getDay()], v: hit(a, a + 864e5), on: i === 6 }; });
}
function hitungDash(P) {
  const masuk = S.docs.filter(d => dalam(d.dikirim, P.a, P.b));
  const masukP = S.docs.filter(d => dalam(d.dikirim, P.pa, P.pb));
  const proses = S.docs.filter(d => [ST.DIKIRIM, ST.KEMBALI, ST.MENUNGGU].indexOf(d.status) >= 0);
  const selesai = S.docs.filter(d => d.status === ST.SELESAI && dalam(d.selesai, P.a, P.b));
  const selesaiP = S.docs.filter(d => d.status === ST.SELESAI && dalam(d.selesai, P.pa, P.pb));
  const gagal = S.docs.filter(d => ST_GAGAL.indexOf(d.status) >= 0 && dalam(d.selesai || d.diperbarui, P.a, P.b));
  const gagalP = S.docs.filter(d => ST_GAGAL.indexOf(d.status) >= 0 && dalam(d.selesai || d.diperbarui, P.pa, P.pb));
  const ttd = S.ttd.filter(t => t[5] && dalam(t[4], P.a, P.b));
  const ttdP = S.ttd.filter(t => t[5] && dalam(t[4], P.pa, P.pb));
  const risiko = S.docs.filter(d => d.status === ST.MENUNGGU && d.batasLT && d.batasLT - Date.now() <= (Number(S.cfg.pengingatJam) || 24) * 36e5);
  const dgnLT = selesai.filter(d => d.mulaiLT && d.selesai);
  const rataLT = dgnLT.length ? dgnLT.reduce((s, d) => s + (d.selesai - d.mulaiLT), 0) / dgnLT.length : 0;
  const target = dgnLT.length ? dgnLT.reduce((s, d) => s + (d.batasLT - d.mulaiLT), 0) / dgnLT.length : 0;
  const tepat = dgnLT.filter(d => d.selesai <= d.batasLT).length;
  return { masuk, masukP, proses, selesai, selesaiP, gagal, gagalP, ttd, ttdP, risiko, rataLT, target, tepat, dgnLT };
}
function ringkasanCerdas(P, h) {
  const kal = [];
  const nM = h.masuk.length, nMP = h.masukP.length;
  if (nM || nMP) {
    const p = nMP ? Math.round((nM - nMP) / nMP * 100) : 100;
    kal.push(`Pengajuan masuk ${P.lbl} <b>${nM} dokumen</b>${nMP ? `, ${p >= 0 ? 'naik' : 'turun'} <b>${Math.abs(p)}%</b> dibanding ${P.lblP}` : ''}.`);
  } else kal.push(`Belum ada pengajuan masuk ${P.lbl}.`);
  const perJenis = {};
  h.masuk.forEach(d => { perJenis[d.jenis] = (perJenis[d.jenis] || 0) + 1; });
  const top = Object.entries(perJenis).sort((a, b) => b[1] - a[1])[0];
  if (top && nM > 1) kal.push(`Didominasi <b>${esc((jenisBy(top[0]) || {}).Nama || top[0])}</b> (${Math.round(top[1] / nM * 100)}%).`);
  if (h.risiko.length) {
    const div = [...new Set(h.risiko.map(d => divisiNama(d.divisi)))].slice(0, 2).join(' & ');
    const telat = h.risiko.filter(d => d.batasLT < Date.now()).length;
    kal.push(`<b class="c-warn">${h.risiko.length} dokumen</b> mendekati${telat ? '/melewati' : ''} batas lead time (${esc(div)}) — notifikasi pengingat WhatsApp dikirim otomatis.`);
  } else if (h.proses.length) kal.push('Semua dokumen yang berjalan masih dalam batas lead time.');
  if (h.rataLT) {
    const sel = h.target ? Math.round((1 - h.rataLT / h.target) * 100) : 0;
    kal.push(`Rata-rata penyelesaian <b>${durasi(h.rataLT)}</b>${h.target ? ` — ${sel >= 0 ? sel + '% lebih cepat' : Math.abs(sel) + '% lebih lambat'} dari target` : ''}; ${Math.round(h.tepat / h.dgnLT.length * 100)}% tepat waktu.`);
  }
  const akhir = h.selesai.length + h.gagal.length;
  if (akhir) { const r = Math.round(h.gagal.length / akhir * 100); kal.push(`Tingkat penolakan/pembatalan ${r}%${r > 15 ? ' — pertimbangkan memperjelas persyaratan agar format & isian tidak salah sejak awal.' : '.'}`); }
  const aksi = jumlahAksi();
  if (aksi) kal.push(`Anda memiliki <b class="c-pri">${aksi} dokumen</b> yang menunggu tindakan.`);
  return kal.join(' ');
}
function tabelDok(rows, opt = {}) {
  if (!rows.length) return kosong('inbox', opt.kosong || 'Belum ada dokumen', opt.kosongDesk || '');
  const th = (k, l, cls = '') => opt.sort ? `<th class="sort ${cls}" data-act="sortList" data-k="${k}">${l}${S.list.sort === k ? ic(S.list.dir > 0 ? 'arrow_upward' : 'arrow_downward', 's14') : ''}</th>` : `<th class="${cls}">${l}</th>`;
  const R = !!opt.ringkas;
  const desk = `<div class="tbl-wrap hide-m"><table class="tbl"><thead><tr>${th('no', 'No. Dokumen & Tanggal')}${R ? '' : th('jenis', 'Jenis')}${th('pemohonNama', 'Pemohon')}${th('nominal', 'Nominal')}${R ? '' : th('batasLT', 'Lead Time')}${th('status', R ? 'Status & Lead Time' : 'Status')}${R ? '' : '<th class="tr">Aksi</th>'}</tr></thead><tbody>
    ${rows.map(d => `<tr class="click" data-act="bukaDok" data-no="${esc(d.no)}" tabindex="0"><td><div class="no" style="white-space:nowrap">${esc(d.no)}</div><div class="xs muted" style="white-space:nowrap">${R ? esc((jenisBy(d.jenis) || {}).Nama || d.jenis) + ' · ' + tgl(d.dikirim || d.dibuat) : tglJam(d.dikirim || d.dibuat)}</div></td>
      ${R ? '' : `<td>${jenisChip(d)}<div class="xs muted mt4 truncate" style="max-width:180px">${esc(d.format)}</div></td>`}
      <td><div class="fw5 truncate" style="max-width:${R ? 130 : 180}px">${esc(d.pemohonNama)}</div><div class="xs muted truncate" style="max-width:${R ? 130 : 180}px">${esc(R ? d.divisi : divisiNama(d.divisi))}</div></td>
      <td class="tnum fw5" style="white-space:nowrap">${nominalTeks(d)}</td>${R ? '' : `<td>${ltBadge(d)}</td>`}<td>${pillStatus(d)}${R ? `<div class="mt4">${ltBadge(d)}</div>` : ''}${d.aksi ? `<div class="xs c-warn mt4 fw5" style="white-space:nowrap">${ic('priority_high', 's14')}Perlu tindakan</div>` : ''}</td>
      ${R ? '' : `<td class="tr"><span class="ico-btn" style="width:32px;height:32px" aria-hidden="true">${ic('chevron_right')}</span></td>`}</tr>`).join('')}</tbody></table></div>`;
  const mob = `<div class="cards-m show-m">${rows.map(d => `<div class="cm" data-act="bukaDok" data-no="${esc(d.no)}" role="button" tabindex="0">
      <div class="flex between start gap8"><div style="min-width:0"><div class="fw6 truncate">${esc(d.no)}</div><div class="xs muted">${tglJam(d.dikirim || d.dibuat)}</div></div>${pillStatus(d)}</div>
      <div class="small truncate">${esc(d.judul)}</div>
      <div class="flex between center wrap gap6">${jenisChip(d)}<span class="fw6 tnum small">${nominalTeks(d)}</span></div>
      <div class="flex between center"><span class="xs muted">${esc(d.pemohonNama)} · ${esc(d.divisi)}</span>${ltBadge(d)}</div></div>`).join('')}</div>`;
  return desk + mob;
}
function rDashboard() {
  const el = $('#v-dashboard');
  if (!S.me) { el.innerHTML = skeleton(4); return; }
  const P = periode(S.period);
  const h = hitungDash(P);
  const seri = seriVolume(S.period);
  const pilihPeriode = `<div class="seg inline" role="tablist" aria-label="Periode">${[['hari', 'Hari Ini'], ['minggu', 'Minggu Ini'], ['bulan', 'Bulan Ini'], ['tahun', 'Tahun Ini']].map(([k, l]) => `<button role="tab" aria-selected="${S.period === k}" class="${S.period === k ? 'on' : ''}" data-act="periode" data-v="${k}">${l}</button>`).join('')}</div>`;
  const perJenis = {};
  h.masuk.forEach(d => { perJenis[d.jenis] = (perJenis[d.jenis] || 0) + 1; });
  const legend = Object.entries(perJenis).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v], i) => `<div><span class="dotc" style="background:${WARNA[i]}"></span><span class="truncate">${esc((jenisBy(k) || {}).Nama || k)} <b>${Math.round(v / Math.max(1, h.masuk.length) * 100)}%</b></span></div>`).join('') || '<div>Belum ada data periode ini</div>';
  const dist = distribusi(S.distTab);
  const terbaru = S.docs.slice().sort((a, b) => (b.diperbarui || b.dibuat) - (a.diperbarui || a.dibuat)).slice(0, 5);
  const ltList = S.docs.filter(d => d.status === ST.MENUNGGU && d.batasLT).sort((a, b) => a.batasLT - b.batasLT).slice(0, 5);
  const rTarget = Math.round((h.target || 0) / 864e5 * 10) / 10;
  const sla = h.dgnLT.length ? Math.round(h.tepat / h.dgnLT.length * 100) : null;
  const aksi = jumlahAksi();
  el.innerHTML = `
  ${h.risiko.length ? `<div class="banner mb16"><div class="flex center gap12" style="min-width:0"><span class="ic-tile warn">${ic('bolt')}</span><div style="min-width:0"><div class="h-title">Lead Time Attention Watch</div><div class="small muted"><b class="c-warn">${h.risiko.length} Dokumen</b> mendekati/melewati batas SLA (${esc([...new Set(h.risiko.map(d => divisiNama(d.divisi)))].slice(0, 3).join(', '))}). Pengingat WhatsApp terkirim otomatis.</div></div></div><button class="btn btn-sm" data-act="go" data-view="daftar" data-tab="risiko">Tinjau Antrean${ic('arrow_forward')}</button></div>` : ''}
  <div class="page-h"><div class="flex center gap12"><span class="ic-tile lg">${ic('analytics')}</span><div><h1>Dashboard Pengajuan</h1><p>Pantau status dokumen, SLA lead time, dan integritas tanda tangan digital real-time</p></div></div>
    <div class="flex center gap8 wrap">${pilihPeriode}<button class="btn btn-sm" data-act="eksporRekap">${ic('table_view', 'c-ok')}Unduh Rekap Excel</button></div></div>
  <div class="grid c12">
    <div class="s7 col gap16">
      <div class="card"><div class="card-h"><div class="flex center gap8"><span class="ic-tile">${ic('folder_open')}</span><div><div class="h-title">Status Pengajuan Dokumen</div><div class="h-sub">Total ${angka(S.docs.length)} dokumen dalam akses Anda</div></div></div><span class="chip muted">${esc(P.lbl)}</span></div>
        <div class="g3 tiles">
          <div class="tile"><span class="lbl">Masuk Baru</span><div class="stat">${h.masuk.length}<span class="unit">dok</span></div>${deltaChip(h.masuk.length, h.masukP.length, 'trending_up', true, 'dari ' + P.lblP)}</div>
          <div class="tile"><span class="lbl">Sedang Diproses</span><div class="stat">${h.proses.length}<span class="unit">dok</span></div><span class="delta ${h.risiko.length ? 'warn' : ''}">${ic('schedule')}<span class="t">${h.risiko.length ? h.risiko.length + ' mendekati batas' : 'Semua on-track'}</span></span></div>
          <div class="tile"><span class="lbl">Selesai Final</span><div class="stat">${h.selesai.length}<span class="unit">dok</span></div>${deltaChip(h.selesai.length, h.selesaiP.length, 'verified', true, 'dari ' + P.lblP)}</div>
        </div></div>
      <div class="card"><div class="card-h"><div class="flex center gap8"><span class="ic-tile ok">${ic('verified_user')}</span><div><div class="h-title">Aktivitas Penandatanganan & Verifikasi</div><div class="h-sub">Segel HMAC-SHA256 & otoritas berjenjang</div></div></div><span class="chip muted">${esc(P.lbl)}</span></div>
        <div class="g3 tiles">
          <div class="tile" data-act="go" data-view="daftar" data-tab="aksi" role="button" tabindex="0" style="cursor:pointer"><span class="lbl">Menunggu Tindakan Anda</span><div class="stat ${aksi ? 'c-warn' : ''}">${aksi}<span class="unit">antrean</span></div><span class="delta ${aksi ? 'warn' : 'up'}">${ic(aksi ? 'priority_high' : 'task_alt')}<span class="t">${aksi ? 'Segera tinjau' : 'Tidak ada antrean'}</span></span></div>
          <div class="tile"><span class="lbl">TTD Digital Sah</span><div class="stat">${h.ttd.length}<span class="unit">tersegel</span></div>${deltaChip(h.ttd.length, h.ttdP.length, 'check_circle', true, 'dari ' + P.lblP)}</div>
          <div class="tile"><span class="lbl">Ditolak / Dibatalkan</span><div class="stat ${h.gagal.length ? 'c-bad' : ''}">${pad2(h.gagal.length)}<span class="unit">dok</span></div>${deltaChip(h.gagal.length, h.gagalP.length, 'trending_up', false, 'dari ' + P.lblP)}</div>
        </div></div>
    </div>
    <div class="card s5 col"><div class="card-h"><div class="flex center gap8"><span class="ic-tile">${ic('bar_chart')}</span><div><div class="h-title">Volume Pengajuan Dokumen</div><div class="h-sub">${S.period === 'tahun' ? 'Per bulan' : S.period === 'bulan' ? 'Per minggu bulan ini' : '7 hari terakhir • distribusi harian'}</div></div></div></div>
      <div class="legend">${legend}</div>
      <div class="grow" style="display:flex;align-items:flex-end">${vbars(seri, { aria: 'Volume pengajuan' })}</div>
      <div class="flex between center xs muted mt12 wrap gap8"><span class="flex center gap4">${ic('check', 's14 c-ok')}Tersinkron ${relatif(S.t)}</span><span>Rata-rata lead time: <b class="tx">${h.rataLT ? durasi(h.rataLT) : '—'}</b></span></div>
    </div>
    <div class="card s5"><div class="card-h"><div class="flex center gap8"><span class="ic-tile">${ic('pie_chart')}</span><div><div class="h-title">Distribusi Dokumen Berdasarkan Parameter</div><div class="h-sub">${angka(S.docs.length)} total dokumen</div></div></div></div>
      <div class="seg mb16" role="tablist">${[['jenis', 'Jenis Administrasi'], ['divisi', 'Divisi'], ['status', 'Status Alur'], ['ttd', 'Penanda Tangan']].map(([k, l]) => `<button role="tab" class="${S.distTab === k ? 'on' : ''}" data-act="distTab" data-v="${k}">${l}</button>`).join('')}</div>
      <div id="distBody">${dist}</div>
      <div class="flex between center xs muted mt16"><span>Sinkronisasi: <b class="tx">${relatif(S.t)}</b></span>${isSA() ? `<button class="lnk" data-act="go" data-view="set-jenis">Kelola Jenis${ic('arrow_forward', 's14')}</button>` : ''}</div></div>
    <div class="card s7"><div class="card-h"><div class="flex center gap8"><span class="ic-tile">${ic('receipt_long')}</span><div><div class="h-title">Pengajuan Dokumen Terbaru</div><div class="h-sub">Aktivitas & registrasi surat terakhir</div></div></div><button class="btn btn-sm" data-act="go" data-view="daftar">Lihat Semua${ic('chevron_right')}</button></div>
      ${tabelDok(terbaru, { ringkas: true, kosong: 'Belum ada pengajuan', kosongDesk: bisaBuat() ? 'Mulai dengan tombol “Buat Pengajuan”.' : '' })}</div>
  </div>
  <div class="g4 mt16">
    <div class="card mini"><span class="ic-tile lg">${ic('timer')}</span><div style="min-width:0"><div class="xs muted">Rata-rata Lead Time</div><div class="v">${h.rataLT ? durasi(h.rataLT) : '—'}</div><div class="xs ${h.rataLT && h.rataLT <= h.target ? 'c-ok' : 'muted'}">${rTarget ? 'Target ' + rTarget + ' hari' : 'Belum ada dokumen selesai'}</div></div></div>
    <div class="card mini"><span class="ic-tile lg ok">${ic('task_alt')}</span><div><div class="xs muted">Ketepatan SLA</div><div class="v">${sla === null ? '—' : sla + '%'}</div><div class="xs muted">${h.tepat}/${h.dgnLT.length} selesai tepat waktu</div></div></div>
    <div class="card mini"><span class="ic-tile lg" style="color:var(--c3)">${ic('mark_chat_read')}</span><div><div class="xs muted">Notifikasi WhatsApp</div><div class="v">${angka(S.meta.wa30 || 0)} pesan</div><div class="xs ${S.meta.waGagal30 ? 'c-warn' : 'c-ok'}">${S.meta.waGagal30 ? S.meta.waGagal30 + ' gagal' : 'Terkirim'} · 30 hari</div></div></div>
    <div class="card mini"><span class="ic-tile lg" style="color:var(--c5)">${ic('qr_code_2')}</span><div><div class="xs muted">Audit Scanner QR</div><div class="v">${angka(S.meta.scan30 || 0)} scan</div><div class="xs muted">${angka(S.meta.scanValid30 || 0)} valid · 30 hari</div></div></div>
  </div>
  <div class="grid c12 mt16">
    <div class="card s7"><div class="card-h"><div class="flex center gap8"><span class="ic-tile warn">${ic('hourglass_top')}</span><div><div class="h-title">Lead Time Berjalan</div><div class="h-sub">Hari kalender sejak TTD Admin Divisi</div></div></div></div>
      <div class="col gap8">${ltList.map(d => { const tot = d.batasLT - d.mulaiLT, jl = Date.now() - d.mulaiLT, p = Math.min(100, Math.round(jl / tot * 100)); const l = ltInfo(d); return `<div class="list-it click" data-act="bukaDok" data-no="${esc(d.no)}"><div class="grow" style="min-width:0"><div class="flex between center gap8"><span class="fw6 small truncate">${esc(d.no)}</span>${ltBadge(d)}</div><div class="xs muted truncate mt4">${esc(d.judul)} · menunggu ${esc((d.alurArr[d.level - 1] || {}).l || '')}</div><div class="prog ${l.cls === 'bad' ? 'bad' : l.cls === 'warn' ? 'warn' : ''} mt8"><div style="width:${p}%"></div></div></div></div>`; }).join('') || kosong('verified', 'Tidak ada lead time berjalan', 'Dokumen terkunci yang menunggu TTD akan tampil di sini.')}</div></div>
    <div class="card s5 insight"><div class="flex center gap8"><span class="ic-tile">${ic('auto_awesome')}</span><div><div class="h-title">Ringkasan Cerdas</div><div class="h-sub">Analisis otomatis ${esc(P.lbl)}</div></div></div><p>${ringkasanCerdas(P, h)}</p></div>
  </div>`;
}
function distribusi(tab) {
  const hit = {};
  let total = 0;
  if (tab === 'ttd') { S.ttd.filter(t => t[5]).forEach(t => { hit[t[3]] = (hit[t[3]] || 0) + 1; total++; }); }
  else S.docs.forEach(d => { const k = tab === 'jenis' ? ((jenisBy(d.jenis) || {}).Nama || d.jenis) : tab === 'divisi' ? divisiNama(d.divisi) : d.status; hit[k] = (hit[k] || 0) + 1; total++; });
  const rows = Object.entries(hit).sort((a, b) => b[1] - a[1]).slice(0, 7);
  return rows.length ? rows.map(([k, v], i) => hbar(k, v, total, WARNA[i % WARNA.length])).join('') : kosong('donut_small', 'Belum ada data');
}

/* ============================== 12. DAFTAR PENGAJUAN ============================== */
function filterDaftar() {
  const L = S.list;
  const q = L.q.trim().toLowerCase();
  let rows = S.docs.filter(d => {
    if (L.tab === 'aksi' && !d.aksi) return false;
    if (L.tab === 'saya' && d.pemohon !== S.me.email) return false;
    if (L.tab === 'risiko' && !(d.status === ST.MENUNGGU && d.batasLT && d.batasLT - Date.now() <= (Number(S.cfg.pengingatJam) || 24) * 36e5)) return false;
    if (L.jenis && d.jenis !== L.jenis) return false;
    if (L.status && (L.status === 'gagal' ? ST_GAGAL.indexOf(d.status) < 0 : d.status !== L.status)) return false;
    if (L.divisi && d.divisi !== L.divisi) return false;
    const t = new Date(d.dibuat);
    if (L.tahun && t.getFullYear() !== Number(L.tahun)) return false;
    if (L.bulan !== '' && t.getMonth() !== Number(L.bulan)) return false;
    if (q) { const j = jenisBy(d.jenis); if ([d.no, d.judul, d.pemohonNama, d.format, j && j.Nama, d.divisi].join(' ').toLowerCase().indexOf(q) < 0) return false; }
    return true;
  });
  const k = L.sort;
  rows.sort((a, b) => { const x = a[k] == null ? '' : a[k], y = b[k] == null ? '' : b[k]; return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'id')) * L.dir; });
  return rows;
}
function rDaftar(p = {}) {
  const L = S.list;
  if (p.tab) { L.tab = p.tab; L.page = 1; delete p.tab; }
  const el = $('#v-daftar');
  const tahun = [...new Set(S.docs.map(d => new Date(d.dibuat).getFullYear()))].sort((a, b) => b - a);
  const aksi = jumlahAksi();
  const tabs = [['semua', 'Semua'], ['aksi', `Perlu Tindakan${aksi ? ' (' + aksi + ')' : ''}`], ['saya', 'Pengajuan Saya'], ['risiko', 'Mendekati Batas']];
  const opt = (arr, v) => arr.map(([k, l]) => `<option value="${esc(k)}" ${String(v) === String(k) ? 'selected' : ''}>${esc(l)}</option>`).join('');
  el.innerHTML = `<div class="page-h"><div><h1>${S.me.role === 'ANGGOTA' ? 'Pengajuan Saya' : 'Daftar Pengajuan'}</h1><p>Cari, saring, dan unduh rekap dokumen administrasi</p></div>
    <div class="flex gap8 wrap"><button class="btn btn-sm" data-act="eksporDaftar" data-f="xlsx">${ic('table_view', 'c-ok')}Excel</button><button class="btn btn-sm" data-act="eksporDaftar" data-f="pdf">${ic('picture_as_pdf', 'c-bad')}PDF</button>${bisaBuat() ? `<button class="btn btn-sm btn-p" data-act="buatBaru">${ic('add')}Buat</button>` : ''}</div></div>
    <div class="card">
      <div class="seg mb12" role="tablist">${tabs.map(([k, l]) => `<button role="tab" class="${L.tab === k ? 'on' : ''}" data-act="listTab" data-v="${k}">${esc(l)}</button>`).join('')}</div>
      <div class="filters mb16">
        <div class="inp-wrap span2"><span class="pre">${ic('search', 's18')}</span><input class="inp" id="fQ" placeholder="Nomor, perihal, pemohon…" value="${esc(L.q)}" aria-label="Cari"></div>
        <select class="sel" data-f="jenis" aria-label="Jenis"><option value="">Semua jenis</option>${opt(S.jenis.map(j => [j.Kode, j.Nama]), L.jenis)}</select>
        <select class="sel" data-f="status" aria-label="Status"><option value="">Semua status</option>${opt([[ST.DRAFT, 'Draft'], [ST.DIKIRIM, 'Dikirim'], [ST.KEMBALI, 'Dikembalikan'], [ST.MENUNGGU, 'Menunggu TTD'], [ST.SELESAI, 'Selesai'], ['gagal', 'Ditolak / Dibatalkan']], L.status)}</select>
        ${S.me.role !== 'ANGGOTA' ? `<select class="sel" data-f="divisi" aria-label="Divisi"><option value="">Semua divisi</option>${opt(S.divisi.map(d => [d.Kode, d.Nama]), L.divisi)}</select>` : ''}
        <select class="sel" data-f="tahun" aria-label="Tahun"><option value="">Semua tahun</option>${opt(tahun.map(t => [t, t]), L.tahun)}</select>
        <select class="sel" data-f="bulan" aria-label="Bulan"><option value="">Semua bulan</option>${opt(BULAN.map((b, i) => [i, b]), L.bulan)}</select>
      </div>
      <div id="daftarIsi"></div>
    </div>`;
  isiDaftar();
}
function isiDaftar() {
  const rows = filterDaftar();
  const per = 20, L = S.list, hal = Math.max(1, Math.ceil(rows.length / per));
  L.page = Math.min(L.page, hal);
  const pg = rows.slice((L.page - 1) * per, L.page * per);
  const tombol = [];
  for (let i = 1; i <= hal; i++) if (i === 1 || i === hal || Math.abs(i - L.page) <= 1) tombol.push(i); else if (tombol[tombol.length - 1] !== '…') tombol.push('…');
  $('#daftarIsi').innerHTML = tabelDok(pg, { sort: true, kosong: 'Tidak ada dokumen', kosongDesk: 'Ubah kata kunci atau filter untuk melihat dokumen lain.' }) +
    `<div class="flex between center wrap gap8 mt16 xs muted"><span>Menampilkan <b class="tx">${pg.length}</b> dari <b class="tx">${rows.length}</b> dokumen</span>
    <div class="pager"><button data-act="hal" data-v="${L.page - 1}" ${L.page <= 1 ? 'disabled' : ''} aria-label="Sebelumnya">${ic('chevron_left', 's16')}</button>${tombol.map(t => t === '…' ? '<span>…</span>' : `<button class="${t === L.page ? 'on' : ''}" data-act="hal" data-v="${t}">${t}</button>`).join('')}<button data-act="hal" data-v="${L.page + 1}" ${L.page >= hal ? 'disabled' : ''} aria-label="Berikutnya">${ic('chevron_right', 's16')}</button></div></div>`;
}
function barisEkspor(rows) {
  return rows.map(d => ({
    'No. Dokumen': d.no, 'Tanggal Dibuat': tglJam(d.dibuat), 'Jenis': (jenisBy(d.jenis) || {}).Nama || d.jenis, 'Format': d.format, 'Perihal': d.judul,
    'Pemohon': d.pemohonNama, 'Divisi': divisiNama(d.divisi), 'Nominal': d.nominal || '', 'Status': d.status, 'Level TTD': d.status === ST.MENUNGGU ? d.level + '/' + d.totalLevel : '',
    'Mulai Lead Time': d.mulaiLT ? tglJam(d.mulaiLT) : '', 'Batas Lead Time': d.batasLT ? tglJam(d.batasLT) : '', 'Selesai': d.selesai ? tglJam(d.selesai) : '', 'Lead Time': ltInfo(d).t, 'Alasan': d.alasan || '', 'Dokumen Asal': d.asal || '', 'Pengganti': d.pengganti || ''
  }));
}
async function eksporXlsx(lembar, nama) {
  await muatSkrip(CDN.xlsx);
  const wb = window.XLSX.utils.book_new();
  lembar.forEach(([judul, data]) => { const ws = window.XLSX.utils.json_to_sheet(data.length ? data : [{ Keterangan: 'Tidak ada data' }]); ws['!cols'] = Object.keys(data[0] || { a: 1 }).map(k => ({ wch: Math.min(40, Math.max(10, k.length + 2)) })); window.XLSX.utils.book_append_sheet(wb, ws, judul.slice(0, 31)); });
  const out = window.XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  unduhBlob(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), nama);
}
async function eksporPdf(judul, kolom, baris, nama) {
  await muatSkrip(CDN.jspdf);
  await muatSkrip(CDN.autotable);
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  doc.setFontSize(13); doc.text(judul, 40, 36);
  doc.setFontSize(8); doc.setTextColor(110); doc.text((S.cfg.nama || 'SIMA SOBAT JEZ') + ' · dicetak ' + tglJam(Date.now()) + ' oleh ' + S.me.nama, 40, 50);
  doc.autoTable({ head: [kolom], body: baris, startY: 60, styles: { fontSize: 7.5, cellPadding: 4 }, headStyles: { fillColor: [47, 91, 232] }, alternateRowStyles: { fillColor: [244, 245, 248] } });
  unduhBlob(doc.output('blob'), nama);
}

/* ============================== 13. KANBAN ============================== */
function rKanban() {
  const el = $('#v-kanban');
  const K = S.kb;
  const kol = [
    ['Draft', 'edit_note', 'mut', d => d.status === ST.DRAFT],
    ['Dikirim', 'send', 'pri', d => d.status === ST.DIKIRIM],
    ['Dikembalikan', 'undo', 'warn', d => d.status === ST.KEMBALI],
    ['Menunggu TTD', 'draw', 'warn', d => d.status === ST.MENUNGGU],
    ['Ditolak / Dibatalkan', 'cancel', 'bad', d => ST_GAGAL.indexOf(d.status) >= 0],
    ['Selesai', 'check_circle', 'ok', d => d.status === ST.SELESAI]
  ];
  const docs = S.docs.filter(d => (!K.jenis || d.jenis === K.jenis) && (!K.divisi || d.divisi === K.divisi));
  const opt = (arr, v) => arr.map(([k, l]) => `<option value="${esc(k)}" ${v === k ? 'selected' : ''}>${esc(l)}</option>`).join('');
  el.innerHTML = `<div class="page-h"><div><h1>Papan Kanban</h1><p>Alur status dokumen dengan indikator sisa lead time</p></div>
    <div class="flex gap8 wrap"><select class="sel" style="min-height:36px;font-size:13px;width:auto" data-kb="jenis" aria-label="Filter jenis"><option value="">Semua jenis</option>${opt(S.jenis.map(j => [j.Kode, j.Nama]), K.jenis)}</select>
    ${isSA() || S.me.role === 'PENANDA_TANGAN' ? `<select class="sel" style="min-height:36px;font-size:13px;width:auto" data-kb="divisi" aria-label="Filter divisi"><option value="">Semua divisi</option>${opt(S.divisi.map(d => [d.Kode, d.Nama]), K.divisi)}</select>` : ''}</div></div>
    <div class="kb">${kol.map(([judul, ikon, cls, f]) => {
      let isi = docs.filter(f);
      isi = isi.sort((a, b) => (b.aksi - a.aksi) || ((a.batasLT || 9e15) - (b.batasLT || 9e15)) || (b.diperbarui - a.diperbarui));
      const tampil = isi.slice(0, 40);
      return `<section class="kb-col" aria-label="${esc(judul)}"><div class="kb-h"><span class="pill ${cls}">${ic(ikon)}${esc(judul)}</span><span class="badge-n blue">${isi.length}</span></div>
        <div class="kb-list">${tampil.map(d => `<article class="kb-card ${d.aksi ? 'aksi' : ''}" data-act="bukaDok" data-no="${esc(d.no)}" tabindex="0">
          <div class="flex between start gap6"><span class="fw6 small" style="word-break:break-all">${esc(d.no)}</span>${d.aksi ? `<span class="pill warn" title="Perlu tindakan Anda">${ic('priority_high')}</span>` : ''}</div>
          <div class="small truncate">${esc(d.judul)}</div>
          <div class="flex between center gap6">${jenisChip(d)}<span class="fw6 small tnum">${d.nominal ? rp(d.nominal) : ''}</span></div>
          <div class="flex between center gap6"><span class="flex center gap6 xs muted" style="min-width:0">${avatar(d.pemohonNama, 1)}<span class="truncate">${esc(d.pemohonNama)}</span></span>${ltBadge(d)}</div>
          ${d.status === ST.MENUNGGU ? `<div class="prog"><div style="width:${Math.round((d.level - 1) / d.totalLevel * 100)}%"></div></div><div class="xs muted">TTD ${d.level - 1}/${d.totalLevel} · menunggu ${esc((d.alurArr[d.level - 1] || {}).l || '')}</div>` : ''}
        </article>`).join('') || `<div class="xs muted tc" style="padding:18px 6px">Kosong</div>`}
        ${isi.length > tampil.length ? `<button class="btn btn-sm btn-g" data-act="go" data-view="daftar">+${isi.length - tampil.length} lainnya</button>` : ''}</div></section>`;
    }).join('')}</div>`;
}

/* ============================== 14. LAPORAN ============================== */
function rLaporan() {
  const el = $('#v-laporan');
  const L = S.lap;
  const docs = S.docs.filter(d => new Date(d.dibuat).getFullYear() === Number(L.tahun) && (!L.jenis || d.jenis === L.jenis) && (!L.divisi || d.divisi === L.divisi));
  const tahun = [...new Set(S.docs.map(d => new Date(d.dibuat).getFullYear()).concat([new Date().getFullYear()]))].sort((a, b) => b - a);
  const per = BLN3.map((x, m) => ({ x, v: docs.filter(d => new Date(d.dibuat).getMonth() === m).length, on: Number(L.tahun) === new Date().getFullYear() && m === new Date().getMonth() }));
  const selesai = docs.filter(d => d.status === ST.SELESAI), gagal = docs.filter(d => ST_GAGAL.indexOf(d.status) >= 0);
  const lt = selesai.filter(d => d.mulaiLT);
  const rata = lt.length ? lt.reduce((s, d) => s + d.selesai - d.mulaiLT, 0) / lt.length : 0;
  const tepat = lt.filter(d => d.selesai <= d.batasLT).length;
  const ringkas = S.jenis.map(j => {
    const x = docs.filter(d => d.jenis === j.Kode); const s = x.filter(d => d.status === ST.SELESAI); const g = x.filter(d => ST_GAGAL.indexOf(d.status) >= 0); const l = s.filter(d => d.mulaiLT);
    return { kode: j.Kode, nama: j.Nama, total: x.length, selesai: s.length, gagal: g.length, rasio: (s.length + g.length) ? Math.round(g.length / (s.length + g.length) * 100) : 0, rata: l.length ? l.reduce((a, d) => a + d.selesai - d.mulaiLT, 0) / l.length : 0, tepat: l.length ? Math.round(l.filter(d => d.selesai <= d.batasLT).length / l.length * 100) : null, target: Number(j.Lead_Time_Hari) || 0 };
  }).filter(r => r.total);
  const perDiv = {};
  docs.forEach(d => { perDiv[d.divisi] = (perDiv[d.divisi] || 0) + 1; });
  const opt = (arr, v) => arr.map(([k, l]) => `<option value="${esc(k)}" ${String(v) === String(k) ? 'selected' : ''}>${esc(l)}</option>`).join('');
  el.innerHTML = `<div class="page-h"><div><h1>Laporan & Statistik</h1><p>Dokumen per bulan, jenis, divisi, rata-rata lead time, dan tingkat penolakan</p></div>
    <div class="flex gap8 wrap"><button class="btn btn-sm" data-act="eksporLaporan" data-f="xlsx">${ic('table_view', 'c-ok')}Excel</button><button class="btn btn-sm" data-act="eksporLaporan" data-f="pdf">${ic('picture_as_pdf', 'c-bad')}PDF</button></div></div>
    <div class="card mb16"><div class="filters" style="grid-template-columns:repeat(auto-fit,minmax(160px,1fr))">
      <select class="sel" data-lap="tahun" aria-label="Tahun">${opt(tahun.map(t => [t, 'Tahun ' + t]), L.tahun)}</select>
      <select class="sel" data-lap="jenis" aria-label="Jenis"><option value="">Semua jenis</option>${opt(S.jenis.map(j => [j.Kode, j.Nama]), L.jenis)}</select>
      ${S.me.role !== 'ANGGOTA' ? `<select class="sel" data-lap="divisi" aria-label="Divisi"><option value="">Semua divisi</option>${opt(S.divisi.map(d => [d.Kode, d.Nama]), L.divisi)}</select>` : ''}</div></div>
    <div class="g4 mb16">
      <div class="card"><div class="xs muted">Total dokumen</div><div class="stat mt4">${angka(docs.length)}</div></div>
      <div class="card"><div class="xs muted">Selesai</div><div class="stat mt4 c-ok">${angka(selesai.length)}</div></div>
      <div class="card"><div class="xs muted">Tingkat penolakan</div><div class="stat mt4 ${gagal.length ? 'c-bad' : ''}">${(selesai.length + gagal.length) ? Math.round(gagal.length / (selesai.length + gagal.length) * 100) : 0}%</div></div>
      <div class="card"><div class="xs muted">Rata-rata lead time</div><div class="stat mt4" style="font-size:22px">${rata ? durasi(rata) : '—'}</div><div class="xs muted">${lt.length ? Math.round(tepat / lt.length * 100) + '% tepat waktu' : ''}</div></div>
    </div>
    <div class="grid c12">
      <div class="card s7"><div class="card-h"><div class="h-title">Dokumen per bulan · ${esc(L.tahun)}</div></div>${vbars(per, { aria: 'Dokumen per bulan' })}</div>
      <div class="card s5"><div class="card-h"><div class="h-title">Per divisi</div></div>${Object.entries(perDiv).sort((a, b) => b[1] - a[1]).map(([k, v], i) => hbar(divisiNama(k), v, docs.length, WARNA[i % 6])).join('') || kosong('donut_small', 'Belum ada data')}</div>
      <div class="card s12"><div class="card-h"><div class="h-title">Ringkasan per jenis administrasi</div></div>
        ${ringkas.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Jenis</th><th class="tr">Total</th><th class="tr">Selesai</th><th class="tr">Ditolak/Batal</th><th class="tr">Rasio Tolak</th><th class="tr">Rata Lead Time</th><th class="tr">Target</th><th class="tr">Tepat Waktu</th></tr></thead><tbody>
        ${ringkas.map(r => `<tr><td class="fw5">${esc(r.nama)}</td><td class="tr tnum">${r.total}</td><td class="tr tnum c-ok">${r.selesai}</td><td class="tr tnum ${r.gagal ? 'c-bad' : ''}">${r.gagal}</td><td class="tr tnum">${r.rasio}%</td><td class="tr">${r.rata ? durasi(r.rata) : '—'}</td><td class="tr">${r.target} hari</td><td class="tr">${r.tepat === null ? '—' : r.tepat + '%'}</td></tr>`).join('')}</tbody></table></div>` : kosong('query_stats', 'Tidak ada data untuk filter ini')}</div>
    </div>`;
  S.lapData = { docs, ringkas };
}

/* ============================== 15. FORMULIR CERDAS ============================== */
function formBaru(kodeJenis) {
  const aktif = S.jenis.filter(j => j.Aktif !== 'TIDAK');
  return { no: '', kodeJenis: kodeJenis || (aktif.length === 1 ? aktif[0].Kode : ''), kodeFormat: '', divisi: S.me.divisi, isian: {}, errs: {}, files: [], lampiran: [], status: ST.DRAFT, asal: '' };
}
const kunciDraft = () => LS.draft + (S.me ? S.me.email : '');
const simpanDraftLokal = debounce(() => { const F = S.form; if (!F || F.no || !F.kodeJenis) return; lsSet(kunciDraft(), JSON.stringify({ kodeJenis: F.kodeJenis, divisi: F.divisi, isian: F.isian, t: Date.now() })); }, 500);
const hapusDraftLokal = () => lsDel(kunciDraft());
function rBuat(p = {}) {
  const el = $('#v-buat');
  if (p.no) {
    if (!S.form || S.form.no !== p.no) {
      const det = S.det[p.no];
      const isi = (d, dt) => { S.form = Object.assign(formBaru(d.jenis), { no: d.no, kodeJenis: d.jenis, kodeFormat: d.kodeFormat, divisi: d.divisi, isian: Object.assign({}, dt.data), lampiran: dt.lampiran.slice(), status: d.status, asal: d.asal }); };
      if (det) isi(normDoc(det.doc), det);
      else {
        el.innerHTML = skeleton(3, 140);
        call('detail', { no: p.no }).then(r => { S.det[p.no] = r; if (!r.izin.edit) { toast('Dokumen ini tidak dapat diubah lagi.', 'warn'); go('detail', { no: p.no }); return; } isi(normDoc(r.doc), r); if (S.view === 'buat') renderForm(); }).catch(e => { toast(e.message, 'bad'); kembali(); });
        return;
      }
    }
  } else if (p.baru || !S.form || S.form.no) {
    S.form = formBaru(p.jenis);
    const raw = lsGet(kunciDraft());
    if (raw && !p.jenis) {
      try {
        const d = JSON.parse(raw);
        if (Date.now() - d.t < 7 * 864e5 && jenisBy(d.kodeJenis)) { Object.assign(S.form, { kodeJenis: d.kodeJenis, divisi: d.divisi || S.me.divisi, isian: d.isian || {} }); setTimeout(() => toast('Isian draf terakhir dipulihkan dari perangkat ini.', 'info'), 200); }
      } catch (e) { /* abaikan */ }
    }
  }
  renderForm();
}
function nilaiForm(f) { const v = S.form.isian[f.Nama_Isian]; return v == null ? '' : String(v); }
function fieldHtml(f, aktif) {
  const k = f.Nama_Isian, v = nilaiForm(f), id = 'f_' + k, wajib = ya(f.Wajib);
  const err = S.form.errs[k];
  const a = `id="${id}" data-k="${esc(k)}" ${wajib ? 'aria-required="true"' : ''} ${err ? 'aria-invalid="true"' : ''}`;
  const cls = err ? ' bad' : '';
  let inp;
  switch (f.Tipe_Isian) {
    case 'teks_panjang': inp = `<textarea class="txa${cls}" ${a} rows="3" maxlength="3000" placeholder="${esc(f.Petunjuk || '')}">${esc(v)}</textarea>`; break;
    case 'rupiah': inp = `<div class="inp-wrap"><span class="pre">Rp</span><input class="inp tnum${cls}" ${a} data-rp inputmode="numeric" autocomplete="off" value="${v ? Number(v).toLocaleString('id-ID') : ''}" placeholder="0"></div>`; break;
    case 'angka': inp = `<input class="inp tnum${cls}" ${a} inputmode="decimal" value="${esc(v)}">`; break;
    case 'tanggal': inp = `<input class="inp${cls}" ${a} type="date" value="${esc(v)}">`; break;
    case 'pilihan': inp = `<select class="sel${cls}" ${a}><option value="">— pilih —</option>${String(f.Opsi || '').split(',').map(o => o.trim()).filter(Boolean).map(o => `<option ${o === v ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`; break;
    default: inp = `<input class="inp${cls}" ${a} maxlength="300" value="${esc(v)}" placeholder="${esc(f.Petunjuk || '')}">`;
  }
  const span = f.Tipe_Isian === 'teks_panjang' ? 'style="grid-column:1/-1"' : '';
  return `<div class="fld ${aktif ? '' : 'hidden'}" data-fld="${esc(k)}" ${span}><div class="lbl-row"><label class="lbl" for="${id}">${esc(f.Label)}${wajib ? '<span class="req">*</span>' : ''}</label>${f.Kondisi ? `<span class="hint" title="Tampil bila ${esc(f.Kondisi)}">${ic('rule', 's14')}</span>` : ''}</div>${inp}
    ${f.Petunjuk && f.Tipe_Isian !== 'teks' && f.Tipe_Isian !== 'teks_panjang' ? `<span class="hint">${esc(f.Petunjuk)}</span>` : ''}<div class="err-msg ${err ? '' : 'hidden'}">${ic('error', 's14')}<span>${esc(err || '')}</span></div></div>`;
}
function konteksForm() { const F = S.form; const c = { divisi: F.divisi }; syaratJenis(F.kodeJenis).forEach(f => { c[f.Nama_Isian] = nilaiForm(f); }); return c; }
function renderForm() {
  const F = S.form, el = $('#v-buat');
  const j = jenisBy(F.kodeJenis);
  const fields = j ? syaratJenis(j.Kode) : [];
  const trig = j ? pemicuJenis(j.Kode) : new Set();
  const ctx = konteksForm();
  const f1 = fields.filter(f => trig.has(f.Nama_Isian)), f2 = fields.filter(f => !trig.has(f.Nama_Isian));
  const jenisOpt = S.jenis.filter(x => x.Aktif !== 'TIDAK' || x.Kode === F.kodeJenis).map(x => `<option value="${esc(x.Kode)}" ${x.Kode === F.kodeJenis ? 'selected' : ''}>${esc(x.Nama)}</option>`).join('');
  const divisiF = isSA() && !F.no ? `<select class="sel" id="fDivisi">${S.divisi.filter(d => d.Aktif !== 'TIDAK').map(d => `<option value="${esc(d.Kode)}" ${d.Kode === F.divisi ? 'selected' : ''}>${esc(d.Nama)}</option>`).join('')}</select>`
    : `<div class="inp-wrap"><input class="inp" readonly value="${esc(divisiNama(F.divisi))}" aria-label="Divisi pemohon"><span class="suf">${ic('check_circle', 's18')}</span></div>`;
  const revisiAdmin = F.no && F.status === ST.DIKIRIM;
  el.innerHTML = `
  <div class="page-h"><div style="min-width:0"><div class="xs muted">Beranda / Pengajuan / ${F.no ? 'Revisi ' + esc(F.no) : 'Formulir Pengajuan Cerdas Baru'}</div>
    <div class="flex center gap8 mt4"><span class="live-dot" aria-hidden="true"></span><h1>${F.no ? 'Revisi Pengajuan ' + esc(F.no) : 'Buat Pengajuan Dokumen Administrasi'}</h1></div>
    <p>Sistem otomatis menentukan format dokumen, pola penomoran resmi, dan hierarki penandatanganan digital berdasarkan isian.</p></div>
    <div class="card flex center gap8" style="padding:8px 12px"><span class="live-dot"></span><div><div class="xs fw6 tx">Rule Engine Aktif</div><div class="xs muted" style="font-size:10px">Validasi ganda klien & server</div></div>${ic('neurology', 's16 c-pri')}</div></div>
  <div class="steps mb16" id="steps"></div>
  <div class="grid c12" style="align-items:start">
    <div class="s8 col gap16">
      <div class="card" id="kartu1"><div class="card-h bd"><div class="flex center gap8"><span class="ic-tile" style="color:var(--link)">${ic('rule')}</span><div><div class="h-title">1. Identifikasi Dokumen & Klasifikasi</div><div class="h-sub">Pilih jenis administrasi untuk mengaktifkan skema dinamis</div></div></div><span class="rule-pill hide-m" id="rulePill">RULE-${esc(F.kodeJenis || '—')}</span></div>
        <div class="col gap16"><div class="g2">
          <div class="fld"><div class="lbl-row"><label class="lbl" for="fJenis">Jenis Administrasi<span class="req">*</span></label>${F.no ? '<span class="hint">Terkunci (bernomor)</span>' : ''}</div><select class="sel" id="fJenis" ${F.no ? 'disabled' : ''}><option value="">— pilih jenis —</option>${jenisOpt}</select></div>
          <div class="fld"><div class="lbl-row"><label class="lbl">Divisi Pemohon<span class="req">*</span></label><span class="pill ok">Divisi Anda</span></div>${divisiF}</div>
          ${f1.map(f => fieldHtml(f, evalKondisi(f.Kondisi, ctx))).join('')}
        </div><div id="ruleAlert"></div>${j && j.Deskripsi ? `<div class="xs muted">${ic('info', 's14')} ${esc(j.Deskripsi)}</div>` : ''}</div></div>
      <div class="card" id="kartu2"><div class="card-h bd"><div class="flex center gap8"><span class="ic-tile ok">${ic(j && j.Ikon ? j.Ikon : 'inventory_2')}</span><div><div class="h-title">2. Parameter Dinamis Formulir</div><div class="h-sub">${j ? 'Isian menyesuaikan format ' + esc(j.Nama) : 'Pilih jenis administrasi terlebih dahulu'}</div></div></div>${j ? `<span class="small c-ok flex center gap4">${ic('auto_fix_high', 's16')}Skema sinkron</span>` : ''}</div>
        ${j ? (f2.length ? `<div class="g2">${f2.map(f => fieldHtml(f, evalKondisi(f.Kondisi, ctx))).join('')}</div>` : '<div class="small muted">Tidak ada isian tambahan.</div>') : kosong('category', 'Belum ada jenis dipilih', 'Formulir akan muncul otomatis sesuai jenis administrasi.')}</div>
      <div class="card" id="kartu3"><div class="card-h bd"><div class="flex center gap8"><span class="ic-tile cy">${ic('attach_file')}</span><div><div class="h-title">3. Berkas Lampiran & Bukti Fisik</div><div class="h-sub">PDF, Excel, atau foto pendukung (gambar dikompres otomatis)</div></div></div><span class="xs muted hide-m">Maks. 10 MB/berkas</span></div>
        <label class="drop" id="dropZone" tabindex="0"><input type="file" id="fileIn" multiple class="sr" accept=".pdf,.xlsx,.xls,.csv,.doc,.docx,image/*"><span class="ic">${ic('cloud_upload', 's28')}</span><span class="fw5 small">Tarik & lepas berkas di sini, atau <span class="c-pri">pilih dari perangkat</span></span><span class="xs muted">${F.no ? 'Berkas langsung diunggah ke folder Drive dokumen.' : 'Berkas diunggah otomatis setelah draft tersimpan.'}</span></label>
        <div class="col gap8 mt12" id="fileList"></div></div>
      <div class="actbar">
        <div class="flex gap8 wrap">
          <button class="btn" data-act="simpanForm" data-loading="Menyimpan…" id="btnDraft">${ic('save')}${revisiAdmin ? 'Simpan Revisi' : 'Simpan Draft'}</button>
          <button class="btn" data-act="pratinjauForm" data-loading="Menyusun PDF…" ${F.no ? '' : 'disabled title="Simpan draft terlebih dahulu"'}>${ic('preview')}Pratinjau PDF</button>
          ${F.no ? `<button class="btn btn-g" data-act="bukaDok" data-no="${esc(F.no)}">${ic('open_in_new')}Detail</button>` : ''}
        </div>
        ${revisiAdmin ? '' : `<button class="btn btn-p" data-act="kirimForm" data-loading="Mengirim…">${ic('send')}Ajukan ke Admin Divisi</button>`}
      </div>
    </div>
    <aside class="s4 sticky-col col gap12" id="formPanel" aria-label="Pratinjau alur"></aside>
  </div>`;
  renderFileList();
  panelForm();
}
function perbaruiKondisional() {
  const ctx = konteksForm();
  syaratJenis(S.form.kodeJenis).forEach(f => { const el = $(`[data-fld="${CSS.escape(f.Nama_Isian)}"]`); if (el) el.classList.toggle('hidden', !evalKondisi(f.Kondisi, ctx)); });
}
function statusForm() {
  const F = S.form, j = jenisBy(F.kodeJenis);
  if (!j) return { s1: false, s2: false, kosong: [] };
  const ctx = konteksForm(), trig = pemicuJenis(j.Kode);
  const aktif = syaratJenis(j.Kode).filter(f => evalKondisi(f.Kondisi, ctx));
  const s1 = aktif.filter(f => trig.has(f.Nama_Isian)).every(f => nilaiForm(f).trim());
  const kosongW = aktif.filter(f => ya(f.Wajib) && !nilaiForm(f).trim());
  return { s1, s2: s1 && !kosongW.length, kosong: kosongW };
}
function panelForm() {
  const F = S.form, j = jenisBy(F.kodeJenis);
  const P = $('#formPanel');
  if (!P) return;
  const st = statusForm();
  const steps = [['Identifikasi & Parameter', st.s1 ? 'Lengkap' : 'Sedang diisi • aturan aktif', 'edit_document', st.s1 ? 'done' : 'on'],
    ['Detail Berkas & Data', st.s2 ? 'Lengkap' : st.kosong.length + ' isian wajib tersisa', 'dataset', st.s2 ? 'done' : st.s1 ? 'on' : ''],
    ['Tinjau & Kirim', st.s2 ? 'Siap diajukan' : 'Kunci integritas HMAC', 'verified_user', st.s2 ? 'on' : '']];
  $('#steps').innerHTML = steps.map((s, i) => `<button class="step ${s[3]}" data-act="keKartu" data-v="${i + 1}"><span class="n">${s[3] === 'done' ? ic('check', 's16') : i + 1}</span><span class="grow" style="min-width:0"><span class="t truncate" style="display:block">${s[0]}</span><span class="s truncate" style="display:block">${esc(s[1])}</span></span>${ic(s[2], 'muted s18')}</button>`).join('');
  if (!j) { P.innerHTML = `<div class="card">${kosong('visibility', 'Pratinjau alur', 'Pilih jenis administrasi untuk melihat format, nomor, dan rantai tanda tangan secara langsung.')}</div>`; $('#ruleAlert').innerHTML = ''; return; }
  const ctx = konteksForm();
  const fmt = tentukanFormat(j.Kode, ctx);
  const alur = tentukanAlur(j.Kode, Object.assign({}, ctx, { format: fmt.kode }));
  const nomor = F.no || prediksiNomor(j.Kode, fmt.kode, F.divisi);
  const pola = String(j.Pola_Nomor || '');
  const formatBerubah = F.no && F.kodeFormat && fmt.kode !== F.kodeFormat && /\{KODE\}/.test(pola);
  const lt = Number(j.Lead_Time_Hari) || 3;
  const msgs = [];
  if (fmt.kondisi) msgs.push(`Format <b>${esc(fmt.nama)}</b> dipilih otomatis karena <span class="mono">${esc(fmt.kondisi)}</span>.`);
  alur.filter(a => a.k).forEach(a => msgs.push(`Kondisi <span class="mono">${esc(a.k)}</span> terpenuhi — <b>${esc(a.l)}</b> disisipkan ke rantai tanda tangan.`));
  $('#ruleAlert').innerHTML = formatBerubah
    ? `<div class="alert bad">${ic('block')}<div><b class="t">Format akan berubah: ${esc(fmt.nama)}</b><div>Nomor resmi ${esc(F.no)} sudah terbit untuk format lain. Kembalikan nilai, atau batalkan & buat pengajuan baru.</div></div></div>`
    : msgs.length ? `<div class="alert warn">${ic('warning')}<div><b class="t">Rule Engine Trigger: ${alur.some(a => a.k) ? 'Eskalasi Jenjang TTD' : 'Penentuan Format'}</b><div>${msgs.join(' ')}</div></div></div>`
      : `<div class="alert info">${ic('info')}<div>Format standar <b>${esc(fmt.nama)}</b> · ${alur.length} level tanda tangan.</div></div>`;
  $('#rulePill').textContent = 'RULE-' + j.Kode + '-' + fmt.kode;
  const nm = u => `<span class="flex center gap6 xs muted mt4">${avatar(u.nama, 1)}<span class="truncate">${esc(u.nama)}</span></span>`;
  P.innerHTML = `<div class="card">
    <div class="card-h bd"><div class="flex center gap8">${ic('visibility', 'c-pri')}<div class="h-title">Live Preview Alur & Dokumen</div></div><span class="pill ok upper" style="font-size:10px">Real-time</span></div>
    <div class="xs muted upper fw6 mb8">${F.no ? 'Nomor Dokumen Resmi' : 'Prediksi Nomor Dokumen'}</div>
    <div class="well"><div class="flex between center gap8"><span class="mono c-pri fw6" style="font-size:13px;word-break:break-all">${esc(nomor)}</span>${ic(F.no ? 'lock' : 'verified', 's16 c-ok')}</div>
      <div class="xs muted mt4 flex center gap6"><span class="dotc" style="background:var(--ok)"></span>${F.no ? 'Terkunci & tidak dapat diubah' : 'Dikonfirmasi LockService saat draft disimpan'}</div>
      <div class="xs faint mono mt8 truncate" title="${esc(pola)}">Pola: ${esc(pola)}</div></div>
    <div class="xs muted upper fw6 mb8 mt16">Format Dokumen Terdeteksi</div>
    <div class="well flex gap8 start"><span class="ic-tile" style="width:28px;height:28px">${ic('description', 's16')}</span><div style="min-width:0"><div class="fw6 small">${esc(fmt.nama)}</div><div class="xs ${formatBerubah ? 'c-bad' : 'c-ok'} mt4">${ic(formatBerubah ? 'error' : 'check', 's14')} ${fmt.kondisi ? 'Aturan: ' + esc(fmt.kondisi) : 'Format default jenis ini (tanpa kondisi)'}</div></div></div>
    <div class="flex between center mt16 mb8"><span class="xs muted upper fw6">Rantai Hierarki TTD Digital</span><span class="xs mono c-pri">${alur.length} Level + WA</span></div>
    <div class="chain">${alur.map(a => { const k = kandidat(F.divisi, a); return `<div class="lv ${a.lv === 1 ? 'l1' : ''} ${a.k ? 'esc' : ''}"><span class="k">${a.lv}</span><div class="flex between start gap8"><div style="min-width:0"><div class="flex center gap6 wrap"><span class="fw6 small">${esc(a.l)}</span>${a.k ? '<span class="tag-esc">Rule Escalation</span>' : ''}</div>${k.slice(0, 2).map(nm).join('') || `<div class="xs c-warn mt4">${ic('warning', 's14')} Belum ada pejabat aktif</div>`}<div class="xs muted mt4">${a.lv === 1 ? 'Pemeriksaan & kunci dokumen · lead time mulai' : a.lv === alur.length ? 'Persetujuan akhir' : 'Persetujuan TTD ber-QR'}</div></div><span class="pill ${a.s === 'GLOBAL' ? 'cy' : 'mut'}" style="font-size:10px">${a.s === 'GLOBAL' ? 'Global' : 'Divisi'}</span></div></div>`; }).join('')}
      <div class="lv wa"><span class="k">${ic('chat', 's14')}</span><div class="small c-ok fw5">Tembusan WhatsApp Otomatis</div><div class="xs muted">Grup final & penolakan · dikumpulkan ≤ 10 menit</div></div></div>
    <div class="well flex center gap8 mt16">${ic('schedule', 'c-c3')}<div class="grow"><div class="small fw5">Estimasi Lead Time: ${lt} Hari Kalender</div><div class="xs muted">Mulai saat TTD Admin Divisi · target ≈ ${tgl(Date.now() + lt * 864e5)}</div></div></div>
    <div class="flex gap8 start mt12 xs muted" style="line-height:1.6">${ic('lock_clock', 's18 c-pri')}<span><b class="tx">Kunci Integritas:</b> dokumen otomatis terkunci dan isian tidak dapat diubah setelah Admin Divisi membubuhkan tanda tangan pertama.</span></div>
  </div>
  <div class="list-it click" data-act="go" data-view="panduan">${ic('help_center', 'muted')}<div class="grow"><div class="small fw5">Butuh format kustom?</div><div class="xs muted">Hubungi Super Admin · lihat Panduan SOP</div></div>${ic('chevron_right', 'muted')}</div>`;
}
function renderFileList() {
  const F = S.form, box = $('#fileList');
  if (!box) return;
  const ikonMime = m => /pdf/.test(m) ? ['picture_as_pdf', 'var(--c3)'] : /sheet|excel|csv/.test(m) ? ['table_view', 'var(--ok-t)'] : /image/.test(m) ? ['image', 'var(--c2)'] : ['draft', 'var(--muted)'];
  const kb = n => n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
  const srv = F.lampiran.map(l => { const [i, c] = ikonMime(l.Mime); return `<div class="file-it"><span class="fi" style="background:color-mix(in srgb,${c} 14%,transparent);color:${c}">${ic(i)}</span><div class="grow" style="min-width:0"><div class="small fw5 truncate">${esc(l.Nama_File)}</div><div class="xs muted">${kb(Number(l.Ukuran))} · <span class="c-ok">${ic('cloud_done', 's14')} Tersimpan di Drive</span></div></div>
    <button class="ico-btn" data-act="lihatLampiran" data-no="${esc(F.no)}" data-id="${esc(l.ID)}" aria-label="Lihat ${esc(l.Nama_File)}">${ic('visibility', 's18')}</button><button class="ico-btn" data-act="hapusLampiranForm" data-id="${esc(l.ID)}" aria-label="Hapus ${esc(l.Nama_File)}">${ic('delete', 's18')}</button></div>`; });
  const lok = F.files.map(f => { const [i, c] = ikonMime(f.mime); const st = { antri: `<span class="muted">${ic('schedule', 's14')} Menunggu draft disimpan</span>`, unggah: '<span class="c-pri"><span class="spin sm" style="display:inline-block;vertical-align:middle"></span> Mengunggah…</span>', gagal: `<span class="c-bad">${ic('error', 's14')} Gagal — ${esc(f.err || '')}</span>` }[f.status] || '';
    return `<div class="file-it"><span class="fi" style="background:color-mix(in srgb,${c} 14%,transparent);color:${c}">${ic(i)}</span><div class="grow" style="min-width:0"><div class="small fw5 truncate">${esc(f.nama)}</div><div class="xs muted">${kb(f.ukuran)} · ${st}</div></div>${f.status !== 'unggah' ? `<button class="ico-btn" data-act="buangFileLokal" data-id="${f.lid}" aria-label="Buang ${esc(f.nama)}">${ic('close', 's18')}</button>` : ''}</div>`; });
  box.innerHTML = srv.concat(lok).join('');
}
function bacaB64(blob) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = () => rej(new Error('Gagal membaca berkas')); r.readAsDataURL(blob); }); }
function kompresGambar(file, maks = 1600, q = 0.82) {
  return new Promise(resolve => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const s = Math.min(1, maks / Math.max(img.width, img.height));
      const cv = document.createElement('canvas'); cv.width = Math.round(img.width * s); cv.height = Math.round(img.height * s);
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      URL.revokeObjectURL(url);
      cv.toBlob(b => resolve(b && b.size < file.size ? b : file), 'image/jpeg', q);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}
async function tambahBerkas(list) {
  const F = S.form;
  for (const file of Array.from(list || [])) {
    let blob = file, nama = file.name;
    if (String(file.type || '').startsWith('image/') && file.size > 900 * 1024 && !/gif|svg/.test(file.type)) { blob = await kompresGambar(file); if (blob !== file) nama = nama.replace(/\.\w+$/, '') + '.jpg'; }
    if (blob.size > 10 * 1024 * 1024) { toast(`${file.name} melebihi 10 MB.`, 'warn'); continue; }
    F.files.push({ lid: 'L' + Math.random().toString(36).slice(2, 9), nama, mime: blob.type || file.type || 'application/octet-stream', ukuran: blob.size, b64: await bacaB64(blob), status: 'antri' });
  }
  renderFileList();
  if (F.no) await unggahAntrean();
}
async function unggahAntrean() {
  const F = S.form;
  if (!F || !F.no) return;
  for (const it of F.files.filter(x => x.status === 'antri' || x.status === 'gagal')) {
    it.status = 'unggah'; renderFileList();
    try { const r = await call('unggah', { no: F.no, nama: it.nama, mime: it.mime, b64: it.b64 }, { silent: true }); it.status = 'ok'; it.b64 = null; F.lampiran.push(r); }
    catch (e) { it.status = 'gagal'; it.err = e.message; toast('Gagal mengunggah ' + it.nama + ': ' + e.message, 'bad'); }
    renderFileList();
  }
  F.files = F.files.filter(x => x.status !== 'ok');
  delete S.det[F.no];
  renderFileList();
}
function validasiForm(penuh) {
  const F = S.form, errs = {};
  const ctx = konteksForm();
  syaratJenis(F.kodeJenis).forEach(f => {
    if (!evalKondisi(f.Kondisi, ctx)) return;
    const v = nilaiForm(f).trim();
    if (!v) { if (penuh && ya(f.Wajib)) errs[f.Nama_Isian] = f.Label + ' wajib diisi.'; return; }
    if ((f.Tipe_Isian === 'angka' || f.Tipe_Isian === 'rupiah') && isNaN(toNum(v))) errs[f.Nama_Isian] = f.Label + ' harus berupa angka.';
    if (f.Tipe_Isian === 'tanggal' && !/^\d{4}-\d{2}-\d{2}$/.test(v)) errs[f.Nama_Isian] = f.Label + ' tidak valid.';
  });
  return errs;
}
function tampilErr(errs) {
  S.form.errs = errs || {};
  $$('#v-buat [data-fld]').forEach(el => {
    const k = el.dataset.fld, e = S.form.errs[k];
    const msg = el.querySelector('.err-msg');
    const inp = el.querySelector('[data-k]');
    if (msg) { msg.classList.toggle('hidden', !e); msg.querySelector('span').textContent = e || ''; }
    if (inp) { inp.classList.toggle('bad', !!e); if (e) inp.setAttribute('aria-invalid', 'true'); else inp.removeAttribute('aria-invalid'); }
  });
  const pertama = $$('#v-buat [data-fld]').find(el => S.form.errs[el.dataset.fld]);
  if (pertama) { pertama.scrollIntoView({ behavior: 'smooth', block: 'center' }); const i = pertama.querySelector('[data-k]'); if (i) setTimeout(() => i.focus({ preventScroll: true }), 300); }
}
function isianBersih() { const F = S.form, o = {}; syaratJenis(F.kodeJenis).forEach(f => { o[f.Nama_Isian] = nilaiForm(f); }); return o; }
async function simpanForm(kirim, btn) {
  const F = S.form;
  if (!F.kodeJenis) { toast('Pilih jenis administrasi terlebih dahulu.', 'warn'); $('#fJenis').focus(); return; }
  const errs = validasiForm(kirim);
  if (Object.keys(errs).length) { tampilErr(errs); toast(Object.values(errs)[0], 'warn'); return; }
  tampilErr({});
  if (kirim && !(await konfirmasiKirim())) return;
  await denganTombol(btn, async () => {
    const antri = F.files.some(x => x.status === 'antri' || x.status === 'gagal');
    let r;
    try { r = await call('simpanDokumen', { no: F.no || undefined, kodeJenis: F.kodeJenis, divisi: F.divisi, isian: isianBersih(), kirim: kirim && !antri, asal: F.asal || undefined }); }
    catch (e) {
      if (e.code === 'FORMAT_BERUBAH') { modalFormatBerubah(e); return; }
      if (e.code === 'VALIDASI' && e.detail) tampilErr(e.detail);
      throw e;
    }
    F.no = r.no; F.kodeFormat = r.doc.kodeFormat; F.status = r.doc.status;
    upsertDoc(r.doc); delete S.det[r.no]; hapusDraftLokal();
    if (antri) await unggahAntrean();
    if (kirim && antri) { const k = await call('kirim', { no: F.no }); upsertDoc(k.doc); }
    if (kirim) { toast(`${F.no} terkirim ke Admin Divisi. Notifikasi WhatsApp dikumpulkan ≤ 10 menit.`, 'ok', 5000); S.form = null; go('detail', { no: r.no }); }
    else { toast(`Draft tersimpan · nomor resmi ${r.no}`, 'ok'); renderForm(); }
  }).catch(() => { /* pesan sudah ditampilkan */ });
}
function konfirmasiKirim() {
  const F = S.form, j = jenisBy(F.kodeJenis);
  const ctx = konteksForm(), fmt = tentukanFormat(j.Kode, ctx), alur = tentukanAlur(j.Kode, Object.assign({}, ctx, { format: fmt.kode }));
  const n = F.lampiran.length + F.files.length;
  return konfirmasi({
    judul: 'Ajukan ke Admin Divisi?', ikon: 'send', okTeks: 'Ajukan Sekarang',
    pesan: `<div class="col gap8"><div class="kv"><span>Format</span><span>${esc(fmt.nama)}</span></div><div class="kv"><span>Nomor</span><span class="mono">${esc(F.no || prediksiNomor(j.Kode, fmt.kode, F.divisi))}</span></div>
      <div class="kv"><span>Rantai TTD</span><span>${alur.map(a => esc(a.l)).join(' → ')}</span></div><div class="kv"><span>Lampiran</span><span>${n} berkas</span></div>
      <div class="alert info mt8">${ic('info')}<div>Admin Divisi menerima notifikasi WhatsApp. Anda masih bisa merevisi bila dokumen dikembalikan. Setelah Admin Divisi menandatangani, dokumen <b>terkunci</b> dan lead time mulai berjalan.</div></div></div>`
  });
}
function modalFormatBerubah(e) {
  const F = S.form;
  const m = modal({
    judul: 'Format dokumen berubah', ikon: 'block', bahaya: true,
    isi: `<p style="margin-top:0">${esc(e.message)}</p><div class="alert warn">${ic('lightbulb')}<div>Pilih <b>Batalkan & buat baru</b> untuk membatalkan ${esc(F.no)} (tercatat di riwayat) lalu membuat pengajuan pengganti dengan isian saat ini — kedua dokumen akan saling terhubung.</div></div>`,
    kaki: `<button class="btn" id="fbKembali">${ic('undo')}Kembalikan nilai</button><button class="btn btn-dd" id="fbBaru">${ic('autorenew')}Batalkan & buat baru</button>`
  });
  m.el.querySelector('#fbKembali').onclick = () => { m.tutup(); delete S.det[F.no]; const no = F.no; S.form = null; go('buat', { no }, { back: true }); };
  m.el.querySelector('#fbBaru').onclick = e2 => denganTombol(e2.currentTarget, async () => {
    const isian = isianBersih();
    const b = await call('batalDraft', { no: F.no, alasan: 'Format berubah menjadi ' + ((e.detail && e.detail.formatBaru) || 'format lain') + ' — diganti pengajuan baru' });
    upsertDoc(b.doc);
    const p = await call('pengganti', { no: F.no, isian });
    upsertDoc(p.lama); upsertDoc(p.doc);
    m.tutup(); S.form = null; delete S.det[F.no];
    toast('Pengajuan pengganti ' + p.no + ' dibuat', 'ok');
    go('buat', { no: p.no });
  }).catch(() => {});
}

/* ============================== 16. DETAIL DOKUMEN ============================== */
const AKSI_LBL = { DIBUAT: ['Pengajuan dibuat', 'add_circle', ''], DIKIRIM: ['Dikirim ke Admin Divisi', 'send', ''], DIUBAH: ['Isian direvisi', 'edit', 'warn'], DIKEMBALIKAN: ['Dikembalikan ke pemohon', 'undo', 'warn'], DITOLAK: ['Ditolak', 'cancel', 'bad'], DIBATALKAN: ['Dibatalkan', 'block', 'bad'], DITOLAK_SUPER_ADMIN: ['Ditolak Super Admin', 'gpp_bad', 'bad'], ANALISA: ['Analisa admin ditambahkan', 'speaker_notes', 'mut'], LAMPIRAN_DITAMBAH: ['Lampiran ditambah', 'attach_file', 'mut'], LAMPIRAN_DIHAPUS: ['Lampiran dihapus', 'delete', 'mut'], PENGGANTI_DIBUAT: ['Dokumen pengganti dibuat', 'link', ''], PENGGANTI_DARI: ['Pengganti dari dokumen lain', 'link', ''] };
function aksiLbl(a) { if (/^TTD_LEVEL_/.test(a)) return ['Tanda tangan level ' + a.split('_').pop(), 'draw', 'ok']; return AKSI_LBL[a] || [String(a).replace(/_/g, ' ').toLowerCase(), 'history', 'mut']; }
function nilaiTampil(f, v) {
  if (v === '' || v == null) return '-';
  if (f && f.Tipe_Isian === 'rupiah') return rp(v);
  if (f && f.Tipe_Isian === 'tanggal' && /^\d{4}-\d{2}-\d{2}$/.test(v)) { const p = v.split('-'); return Number(p[2]) + ' ' + BULAN[Number(p[1]) - 1] + ' ' + p[0]; }
  if (f && f.Tipe_Isian === 'angka') return angka(v);
  return String(v);
}
function rDetail(p) {
  const no = p.no, el = $('#v-detail');
  if (!no) { go('daftar'); return; }
  if (S.detNo !== no) { S.detNo = no; S.detTab = 'ttd'; }
  const ada = S.docs.find(d => d.no === no) || S.det[no];
  if (ada) renderDetail(no); else el.innerHTML = skeleton(1, 220) + '<div class="mt16"></div>' + skeleton(2, 160);
  call('detail', { no }, { silent: !!S.det[no] }).then(r => {
    S.det[no] = r; upsertDoc(r.doc);
    if (S.view === 'detail' && S.params.no === no) renderDetail(no);
  }).catch(e => {
    if (!S.det[no]) el.innerHTML = `<div class="card">${kosong('error', 'Dokumen tidak dapat dibuka', esc(e.message), `<button class="btn mt8" data-act="kembali">${ic('arrow_back')}Kembali</button>`)}</div>`;
    else toast(e.message, 'bad');
  });
}
function renderDetail(no) {
  const el = $('#v-detail');
  const det = S.det[no];
  const doc = S.docs.find(d => d.no === no) || (det && normDoc(det.doc));
  if (!doc) return;
  const catatanLama = $('#anIn') ? $('#anIn').value : '';
  const iz = det ? det.izin : {};
  const j = jenisBy(doc.jenis) || {};
  const pem = userBy(doc.pemohon);
  const ttd = det ? det.ttd : [];
  const ttdSah = ttd.filter(t => t.berlaku);
  const lt = ltInfo(doc);
  const aCur = doc.alurArr[doc.level - 1];
  const B = [];
  if (iz.folder) B.push(`<a class="btn btn-sm" href="${esc(det.folderUrl)}" target="_blank" rel="noopener">${ic('folder_open', 'c-c4')}<span class="hide-m">Drive Berkas</span></a>`);
  if (iz.pdf) B.push(`<button class="btn btn-sm" data-act="unduhPdf" data-no="${esc(no)}" data-loading="Mengunduh…">${ic('download')}Unduh PDF</button>`);
  B.push(`<button class="btn btn-sm" data-act="pratinjauPdf" data-no="${esc(no)}" data-loading="Menyusun PDF…">${ic('preview')}Pratinjau PDF</button>`);
  if (iz.edit) B.push(`<button class="btn btn-sm" data-act="editDok" data-no="${esc(no)}">${ic('edit')}${doc.pemohon === S.me.email ? 'Edit' : 'Revisi'}</button>`);
  if (iz.kembalikan) B.push(`<button class="btn btn-sm" data-act="alasanDok" data-k="kembalikan" data-no="${esc(no)}">${ic('undo')}Kembalikan</button>`);
  if (iz.batalDraft) B.push(`<button class="btn btn-sm btn-d" data-act="alasanDok" data-k="batalDraft" data-no="${esc(no)}">${ic('block')}Batalkan</button>`);
  if (iz.tolak) B.push(`<button class="btn btn-sm btn-d" data-act="alasanDok" data-k="tolak" data-no="${esc(no)}">${ic('cancel')}Tolak</button>`);
  if (iz.batal) B.push(`<button class="btn btn-sm btn-d" data-act="alasanDok" data-k="batal" data-no="${esc(no)}">${ic('block')}Batalkan</button>`);
  if (iz.tolakSA) B.push(`<button class="btn btn-sm btn-d" data-act="alasanDok" data-k="tolakSA" data-no="${esc(no)}">${ic('gpp_bad')}Tolak (Super Admin)</button>`);
  if (iz.pengganti) B.push(`<button class="btn btn-sm btn-p" data-act="penggantiDok" data-no="${esc(no)}" data-loading="Membuat…">${ic('autorenew')}Buat Dokumen Pengganti</button>`);
  if (iz.kirim) B.push(`<button class="btn btn-sm btn-p" data-act="kirimDok" data-no="${esc(no)}" data-loading="Mengirim…">${ic('send')}Ajukan ke Admin Divisi</button>`);
  if (iz.ttd) B.push(`<button class="btn btn-p" data-act="ttdDok" data-no="${esc(no)}">${ic('draw')}Tanda Tangani Digital (Level ${doc.level})</button>`);
  const segel = ttdSah[0] ? ttdSah[0].segel : '';
  const banner = ST_GAGAL.indexOf(doc.status) >= 0
    ? `<div class="alert bad mt12">${ic(doc.status === ST.BATAL ? 'block' : 'gpp_bad')}<div><b class="t">${esc(doc.status)}</b><div>${esc(doc.alasan || '')}</div>${doc.pengganti ? `<button class="lnk mt4" data-act="bukaDok" data-no="${esc(doc.pengganti)}">Lihat dokumen pengganti ${esc(doc.pengganti)}${ic('arrow_forward', 's14')}</button>` : ''}</div></div>`
    : doc.terkunci ? `<div class="well flex between center gap12 mt12"><div class="flex gap12 start"><span class="ic-tile">${ic('verified_user')}</span><div><div class="flex center gap8 wrap"><span class="h-title">Integritas Dokumen Terkunci Permanen</span><span class="pill pri mono" style="font-size:10px">HMAC SHA-256</span></div><div class="small muted mt4">Divalidasi Admin Divisi pada ${tglJam(doc.terkunci)} WIB. Isi data terkunci dari perubahan manual demi kepatuhan audit — perubahan langsung di Sheets akan membuat QR berstatus TIDAK VALID.</div></div></div>${segel ? `<div class="hide-m tr mono xs muted shrink0">SEGEL: ${esc(segel.match(/.{1,4}/g).join('·'))}<div class="c-ok" style="font-family:Inter">${ttdSah.length === ttd.length ? 'Validitas rantai utuh' : 'Ada TTD dicabut'}</div></div>` : ''}</div>`
      : `<div class="alert info mt12">${ic('lock_open')}<div>Dokumen masih dapat direvisi hingga Admin Divisi menandatangani. Setelah itu dokumen <b>terkunci</b> dan lead time (hari kalender) mulai berjalan.</div></div>`;
  let sla = '';
  if (doc.mulaiLT) {
    const tot = doc.batasLT - doc.mulaiLT, akhir = doc.selesai || Date.now(), jl = akhir - doc.mulaiLT, p = Math.min(100, Math.round(jl / tot * 100));
    sla = `<div class="card mt16 flex wrap between center gap12"><div class="flex center gap12"><span class="ic-tile">${ic('speed')}</span><div><div class="h-title">Pelacakan Waktu Tanggap (SLA)</div><div class="xs muted">Target: ${Math.round(tot / 864e5)} hari kalender (maks. ${tglJam(doc.batasLT)})</div></div></div>
      <div class="grow" style="max-width:460px;min-width:220px"><div class="flex between xs mb8"><span class="muted">${doc.selesai ? 'Durasi' : 'Berjalan'}: <b class="tx">${durasi(jl)} (${p}%)</b></span><span class="${lt.cls === 'bad' ? 'c-bad' : lt.cls === 'warn' ? 'c-warn' : 'c-ok'} fw5">${esc(lt.t)}</span></div><div class="prog ${lt.cls === 'bad' ? 'bad' : lt.cls === 'warn' ? 'warn' : ''}"><div style="width:${p}%"></div></div></div></div>`;
  }
  const tabs = [['ttd', 'draw', `TTD (${doc.alurArr.length})`], ['timeline', 'history', 'Lini Masa'], ['catatan', 'speaker_notes', `Catatan${det && det.analisa.length ? ' (' + det.analisa.length + ')' : ''}`], ['terkait', 'link', 'Terkait']];
  el.innerHTML = `
  <div class="card">
    <div class="flex between center wrap gap8"><nav class="xs muted flex center gap6"><button class="lnk" data-act="kembali" style="color:var(--muted)">${ic('arrow_back', 's16')}Kembali</button><span>/</span><span class="tx fw5">${esc(no)}</span></nav>
      <div class="flex gap6 wrap">${doc.mulaiLT && !doc.selesai ? `<span class="pill warn">${ic('timer')}SLA ${esc(lt.t)}</span>` : ''}${pillStatus(doc)}</div></div>
    <div class="flex wrap between gap16 mt12" style="align-items:flex-end">
      <div style="min-width:0;flex:1 1 360px">
        <div class="flex center gap8 wrap"><span class="chip upper xs" style="font-weight:600">${esc(j.Nama || doc.jenis)}</span><span class="chip"><span class="muted">No:</span><span class="mono">${esc(no)}</span><button class="ico-btn" style="width:24px;height:24px" data-act="salin" data-v="${esc(no)}" aria-label="Salin nomor">${ic('content_copy', 's14')}</button></span>
          ${doc.terkunci && !ST_AKHIR.includes(doc.status) ? `<span class="pill warn">${ic('lock_clock')}Terkunci · Menunggu TTD Level ${doc.level}</span>` : ''}${doc.aksi ? `<span class="pill pri">${ic('priority_high')}Perlu tindakan Anda</span>` : ''}</div>
        <h1 class="mt8" style="font-size:20px;line-height:28px">${esc(doc.judul)}</h1>
        <div class="small muted mt4">${esc(doc.format)} · diajukan oleh <b class="tx">${esc(doc.pemohonNama)}</b>${pem && pem.jabatan ? ' (' + esc(pem.jabatan) + ')' : ''} pada ${tglJam(doc.dibuat)}</div>
      </div>
      <div class="flex gap8 wrap jend">${B.join('')}</div>
    </div>
    ${banner}
  </div>
  ${sla}
  <div class="grid c12 mt16" style="align-items:start">
    <div class="s7 col gap16">
      <div class="meta4">
        <div class="card"><div class="xs muted">Pemohon</div><div class="v">${esc(doc.pemohonNama)}</div><div class="xs muted truncate">${esc(pem ? pem.jabatan : '')}</div></div>
        <div class="card"><div class="xs muted">${doc.nominal ? 'Nominal' : 'Format'}</div><div class="v tnum">${doc.nominal ? rp(doc.nominal) : esc(doc.kodeFormat)}</div>${doc.alurArr.some(a => a.k) ? `<div class="xs c-c3 fw5">${ic('bolt', 's14')}Eskalasi aturan</div>` : `<div class="xs muted">${esc(doc.kodeFormat)}</div>`}</div>
        <div class="card"><div class="xs muted">Divisi</div><div class="v">${esc(divisiNama(doc.divisi))}</div><div class="xs muted">${esc(doc.divisi)}</div></div>
        <div class="card"><div class="xs muted">Dibuat</div><div class="v">${tgl(doc.dibuat)}</div><div class="xs muted">Pukul ${jam(doc.dibuat)} WIB</div></div>
      </div>
      <div class="card pad0" style="overflow:hidden"><div class="sheet-bar"><span class="flex center gap6 tx fw5">${ic('article', 'c-pri s18')}Pratinjau Lembar Dokumen</span><span class="xs">${det ? 'Data langsung' : 'Memuat…'}</span></div>${det ? lembarDok(doc, det) : `<div style="padding:20px">${skeleton(1, 260)}</div>`}</div>
      <div class="card"><div class="card-h"><div class="flex center gap8">${ic('attachment', 'c-pri')}<span class="h-title">Berkas Lampiran (${det ? det.lampiran.length : '…'})</span></div>${iz.unggah ? `<label class="btn btn-sm">${ic('upload')}Tambah<input type="file" class="sr" multiple data-unggah-detail="${esc(no)}"></label>` : '<span class="xs muted">Tersimpan di folder Drive dokumen</span>'}</div>
        <div class="g2">${det ? (det.lampiran.map(l => `<div class="file-it"><span class="fi" style="background:var(--card);color:var(--link)">${ic(/pdf/.test(l.Mime) ? 'picture_as_pdf' : /image/.test(l.Mime) ? 'image' : /sheet|excel/.test(l.Mime) ? 'table_view' : 'draft')}</span><div class="grow" style="min-width:0"><div class="small fw5 truncate">${esc(l.Nama_File)}</div><div class="xs muted">${Math.max(1, Math.round(Number(l.Ukuran) / 1024))} KB · ${esc(l.Diunggah_Oleh)}</div></div><button class="ico-btn" data-act="lihatLampiran" data-no="${esc(no)}" data-id="${esc(l.ID)}" aria-label="Lihat">${ic('visibility', 's18')}</button></div>`).join('') || '<div class="small muted">Tidak ada lampiran.</div>') : skeleton(1, 56)}</div></div>
    </div>
    <div class="s5 col gap16">
      <div class="card"><div class="seg mb16" role="tablist">${tabs.map(([k, i, l]) => `<button role="tab" class="${S.detTab === k ? 'on' : ''}" data-act="detTab" data-v="${k}">${ic(i, 's16')}<span>${esc(l)}</span></button>`).join('')}</div>
        <div id="detTabIsi">${det ? tabDetail(doc, det) : skeleton(3, 70)}</div></div>
      <div class="card flex between center gap12"><div class="flex center gap12"><span class="ic-tile">${ic('fact_check')}</span><div><div class="h-title">Audit Log Eksternal</div><div class="xs muted">Ekspor riwayat kepatuhan untuk auditor</div></div></div><button class="btn btn-sm" data-act="eksporAudit" data-no="${esc(no)}" ${det ? '' : 'disabled'}>${ic('file_download')}CSV</button></div>
    </div>
  </div>`;
  if (catatanLama && $('#anIn')) $('#anIn').value = catatanLama;
  hydrateQR(el);
}
function lembarDok(doc, det) {
  const fields = syaratJenis(doc.jenis);
  const rows = fields.filter(f => det.data[f.Nama_Isian] !== undefined && det.data[f.Nama_Isian] !== '');
  const pem = userBy(doc.pemohon);
  const j = jenisBy(doc.jenis) || {};
  return `<div class="doc-sheet">
    <div class="kop"><div class="flex gap12 center"><span class="ic-tile lg">${ic('account_balance', 's22')}</span><div><div class="ff-h fw6" style="font-size:14px">${esc((S.cfg.org || 'Sobat JEZ').toUpperCase())}</div><div class="xs muted">${esc(S.cfg.nama || 'SIMA SOBAT JEZ')} · Divisi ${esc(divisiNama(doc.divisi))}</div></div></div><div class="mono xs muted tr hide-m">DOC-ID: ${esc(doc.id)}<br>${esc(doc.status.toUpperCase())}</div></div>
    <h2>${esc(doc.format)}</h2><div class="nomor">NOMOR: ${esc(doc.no)}</div>
    <p style="margin:0">Pada ${tglPanjang(doc.dibuat)}, <b>${esc(doc.pemohonNama)}</b>${pem && pem.jabatan ? ' (' + esc(pem.jabatan) + ')' : ''} dari divisi ${esc(divisiNama(doc.divisi))} mengajukan ${esc(j.Nama || doc.jenis)} dengan perihal “${esc(doc.judul)}” dan rincian sebagai berikut:</p>
    <table><tbody>${rows.map(f => `<tr><td>${esc(f.Label)}</td><td style="white-space:pre-line">${esc(nilaiTampil(f, det.data[f.Nama_Isian]))}</td></tr>`).join('')}</tbody></table>
    <p style="margin:0" class="small">Demikian dokumen ini dibuat dengan sebenar-benarnya untuk dipergunakan sebagaimana mestinya.</p>
    <div class="sig-grid">${doc.alurArr.map(a => { const t = det.ttd.find(x => x.level === a.lv && x.berlaku) || det.ttd.find(x => x.level === a.lv); return `<div class="sig-box ${t && !t.berlaku ? 'void' : ''}"><span class="xs muted">${esc(a.l)}</span><div class="qr ${t ? '' : 'empty'}" ${t ? `data-qr="${esc(t.qr)}" data-ec="H"` : ''}>${t ? '' : ic('draw', 's28')}</div><b class="small">${esc(t ? t.nama : '……………………')}</b><span class="xs muted">${t ? tglJam(t.waktu) : 'Level ' + a.lv}</span></div>`; }).join('')}</div>
    <div class="flex wrap between center gap12 mt20 well" style="background:var(--card)"><div class="flex center gap12"><div class="qr-wrap" style="width:72px;height:72px;padding:6px" data-qr="${esc(det.riwayatUrl)}"></div><div><div class="small fw6">Keaslian & Riwayat Elektronik</div><div class="mono xs muted">#${esc(doc.id)}</div><div class="xs c-ok mt4">${ic('lock', 's14')} Terdaftar di SIMA Trust Registry</div></div></div>
      <div class="tr xs muted">Pindai QR untuk riwayat revisi & analisa<br><button class="lnk" data-act="salin" data-v="${esc(det.riwayatUrl)}">Salin tautan riwayat${ic('content_copy', 's14')}</button></div></div>
  </div>`;
}
function tabDetail(doc, det) {
  const tab = S.detTab, iz = det.izin;
  if (tab === 'timeline') {
    return `<div class="flex between center mb12"><span class="h-title">Kronologis Audit Lengkap</span><span class="xs muted">Waktu lokal (WIB)</span></div><div class="tl">${det.riwayat.map(r => { const [l, i, c] = aksiLbl(r.Aksi); return `<div class="it ${c}"><div class="flex between gap8"><span class="small fw6">${esc(l)}</span><span class="mono xs muted shrink0">${tglJam(r.Waktu)}</span></div><div class="xs muted mt4">${esc(r.Pelaku)}${r.Lokasi ? ' · ' + esc(r.Lokasi) : ''}</div>${r.Alasan ? `<div class="small mt4">${esc(r.Alasan)}${r.Aksi === 'DIUBAH' ? `: <span class="muted" style="text-decoration:line-through">${esc(r.Nilai_Lama || '∅')}</span> → <b>${esc(r.Nilai_Baru || '∅')}</b>` : ''}</div>` : (r.Nilai_Baru ? `<div class="xs muted mt4">${esc(r.Nilai_Baru)}</div>` : '')}</div>`; }).join('') || '<div class="small muted">Belum ada riwayat.</div>'}</div>`;
  }
  if (tab === 'catatan') {
    return `<div class="flex between center mb12"><span class="h-title">Catatan & Analisa Tim</span><span class="xs muted">${det.analisa.length} catatan</span></div>
      <div class="col gap8" id="anList">${det.analisa.map(a => `<div class="note-it ${a._p ? 'muted' : ''}"><div class="flex between center gap8"><span class="flex center gap6">${avatar(a.Penulis, 1)}<b class="small">${esc(a.Penulis)}</b><span class="chip xs" style="padding:0 6px">${esc(a.Peran)}</span></span><span class="mono xs muted">${a._p ? 'menyimpan…' : relatif(a.Waktu)}</span></div><div class="small mt8" style="white-space:pre-line">${esc(a.Catatan)}</div></div>`).join('') || '<div class="small muted">Belum ada analisa admin.</div>'}</div>
      ${iz.analisa ? `<div class="fld mt16"><label class="lbl xs muted" for="anIn">Tambah catatan analisa</label><textarea class="txa" id="anIn" rows="3" placeholder="Tulis hasil pemeriksaan atau instruksi…"></textarea><div class="flex jend"><button class="btn btn-sm" data-act="simpanAnalisa" data-no="${esc(doc.no)}">${ic('send')}Simpan Catatan</button></div></div>` : ''}`;
  }
  if (tab === 'terkait') {
    return `<div class="h-title mb12">Rantai Dokumen Terkait</div><div class="col gap8">${det.rantai.map(r => `<div class="list-it click" data-act="bukaDok" data-no="${esc(r.no)}">${ic(r.relasi === 'Dokumen asal' ? 'history_edu' : 'autorenew', 'c-pri')}<div class="grow" style="min-width:0"><div class="small fw6">${esc(r.no)}</div><div class="xs muted truncate">${esc(r.relasi)} · ${esc(r.judul || '')}</div></div>${r.status ? `<span class="pill mut">${esc(r.status)}</span>` : ''}</div>`).join('') || '<div class="small muted">Tidak ada dokumen asal / pengganti.</div>'}</div>
      <div class="divider"></div><div class="flex center gap12"><div class="qr-wrap" style="width:96px;height:96px;padding:6px" data-qr="${esc(det.riwayatUrl)}"></div><div class="small"><b>QR Riwayat & Analisa</b><div class="xs muted mt4">Tersemat di dokumen. Saat dipindai membuka halaman riwayat revisi & analisa admin secara real-time.</div><button class="lnk mt8" data-act="salin" data-v="${esc(det.riwayatUrl)}">${ic('content_copy', 's14')}Salin tautan</button></div></div>`;
  }
  const kartu = doc.alurArr.map(a => {
    const t = det.ttd.find(x => x.level === a.lv && x.berlaku) || det.ttd.find(x => x.level === a.lv);
    if (t && t.berlaku) return `<div class="sig done"><div class="flex between start gap8"><div class="flex center gap8"><span class="av">${ic('verified')}</span><div><div class="flex center gap6 wrap"><b class="small">Level ${a.lv}: ${esc(a.l)}</b><span class="pill ok" style="font-size:10px">VALID</span></div><div class="xs muted">${esc(t.nama)}</div></div></div><span class="mono xs c-ok shrink0">${jam(t.waktu)} WIB</span></div>
      <div class="metab">Waktu: ${tglJam(t.waktu)}<br>Lokasi: ${esc(t.lokasi)}<br>Kode: <span class="c-pri">${esc(t.kode)}</span> · Segel: ${esc(t.segel)}…</div>
      <div class="flex between center xs"><span class="c-ok flex center gap4">${ic('shield', 's14')}Sertifikat SIMA valid</span><button class="lnk" data-act="cekTtd" data-v="${esc(t.qr)}">Verifikasi${ic('chevron_right', 's14')}</button></div></div>`;
    if (t && !t.berlaku) return `<div class="sig void lock"><div class="flex center gap8"><span class="av">${ic('gpp_bad')}</span><div><b class="small">Level ${a.lv}: ${esc(a.l)} — DICABUT</b><div class="xs muted">${esc(t.nama)} · ${tglJam(t.waktu)}</div></div></div><div class="xs c-bad">${esc(t.ket || '')}</div></div>`;
    const giliran = [ST.DIKIRIM, ST.MENUNGGU].includes(doc.status) && doc.level === a.lv;
    const kand = kandidat(doc.divisi, a);
    if (giliran) return `<div class="sig cur"><div class="flex between start gap8"><div class="flex center gap8"><span class="av">${ic('pending')}</span><div><div class="flex center gap6 wrap"><b class="small">Level ${a.lv}: ${esc(a.l)}</b><span class="pill warn" style="font-size:10px">${iz.ttd ? 'MENUNGGU ANDA' : 'MENUNGGU'}</span></div><div class="xs muted">${esc(kand.map(u => u.nama).join(', ') || 'Belum ada pejabat aktif')}</div></div></div>${doc.batasLT ? `<span class="xs c-warn fw5 shrink0">${esc(ltInfo(doc).t)}</span>` : ''}</div>
      ${iz.ttd ? `<div class="note"><b class="c-warn">${ic('info', 's14')} Peran Anda aktif.</b> Tanda tangan digital akan menyematkan hash HMAC-SHA256 baru${a.lv === 1 ? ', <b>mengunci dokumen</b>, dan memulai lead time' : ''}${a.lv < doc.alurArr.length ? ' lalu meneruskan ke ' + esc(doc.alurArr[a.lv].l) : ' dan menerbitkan PDF final'}.</div><button class="btn btn-p btn-block" data-act="ttdDok" data-no="${esc(doc.no)}">${ic('fingerprint')}Bubuhkan TTD Digital Sekarang</button>` : ''}</div>`;
    return `<div class="sig lock"><div class="flex between start gap8"><div class="flex center gap8"><span class="av">${ic('lock')}</span><div><b class="small muted">Level ${a.lv}: ${esc(a.l)}</b><div class="xs muted">${esc(kand.map(u => u.nama).join(', ') || '—')}</div></div></div>${a.k ? `<span class="xs c-c3 fw5 shrink0">${ic('bolt', 's14')}${esc(a.k)}</span>` : ''}</div></div>`;
  }).join('');
  return `<div class="flex between center mb12"><div><div class="h-title">Alur Penandatanganan Kriptografis</div><div class="xs muted">Hierarki pengesahan berurutan otomatis</div></div><span class="chip mono">${det.ttd.filter(t => t.berlaku).length}/${doc.alurArr.length} Selesai</span></div>
    <div class="col gap8">${kartu}</div>
    <div class="list-it mt12 xs muted">${ic('mark_chat_read', 's18 c-ok')}<span>Notifikasi WhatsApp ke penanda tangan berikutnya dikumpulkan & terkirim ≤ 10 menit.</span></div>`;
}
async function ttdDok(no) {
  const doc = S.docs.find(d => d.no === no);
  const a = doc.alurArr[doc.level - 1] || {};
  const lanjut = doc.alurArr[doc.level];
  const lokP = lokasiPerangkat();
  let lok = null;
  const m = modal({
    judul: 'Tanda tangan digital — Level ' + doc.level, ikon: 'draw',
    isi: `<div class="kv"><span>Dokumen</span><span class="mono">${esc(no)}</span></div><div class="kv"><span>Sebagai</span><span>${esc(a.l || '')}</span></div><div class="kv"><span>Penanda tangan</span><span>${esc(S.me.nama)}</span></div>
      <div class="kv"><span>Lokasi</span><span id="lokSt" class="flex center gap6 jend"><span class="spin sm"></span>Mendeteksi…</span></div>
      <div class="alert ${doc.level === 1 ? 'warn' : 'info'} mt12">${ic(doc.level === 1 ? 'lock' : 'info')}<div>${doc.level === 1 ? 'Setelah ditandatangani, dokumen <b>terkunci permanen</b> dan lead time mulai berjalan.' : 'Tanda tangan akan disegel HMAC-SHA256 beserta hash isi dokumen.'} ${lanjut ? 'Dokumen diteruskan ke <b>' + esc(lanjut.l) + '</b>.' : 'Ini tanda tangan terakhir — PDF final ber-QR akan diterbitkan.'}</div></div>
      <label class="flex gap8 start mt16 small" style="cursor:pointer"><input type="checkbox" id="ttdSetuju" style="width:18px;height:18px;margin-top:2px"><span>Saya telah memeriksa isi dokumen dan menyetujui penandatanganan secara digital.</span></label>`,
    kaki: `<button class="btn" data-close>Batal</button><button class="btn btn-p" id="ttdOk" data-loading="Menyegel…">${ic('fingerprint')}Bubuhkan TTD</button>`
  });
  lokP.then(l => { lok = l; const s = m.el.querySelector('#lokSt'); if (s) s.innerHTML = l ? `${ic('location_on', 's16 c-ok')}Terdeteksi (±${Math.round(l.acc || 0)} m)` : `${ic('location_off', 's16 c-warn')}Tidak diizinkan — tetap sah`; });
  m.el.querySelector('#ttdOk').onclick = e => {
    if (!m.el.querySelector('#ttdSetuju').checked) { toast('Centang pernyataan persetujuan terlebih dahulu.', 'warn'); return; }
    denganTombol(e.currentTarget, async () => {
      await Promise.race([lokP, new Promise(r => setTimeout(r, 2500))]);
      const r = await call('ttd', { no, lokasi: lok, perangkat: perangkat() });
      m.tutup();
      upsertDoc(r.doc);
      if (S.det[no]) { S.det[no].ttd.push(r.ttd); S.det[no].doc = r.doc; S.det[no].izin = Object.assign({}, S.det[no].izin, { ttd: false, tolak: false, batal: false, edit: false, unggah: false, kembalikan: false }); }
      toast(r.doc.status === ST.SELESAI ? 'Dokumen FINAL. PDF ber-QR sedang diterbitkan.' : 'TTD berhasil · diteruskan ke ' + ((r.doc.status === ST.MENUNGGU && normDoc(r.doc).alurArr[r.doc.level - 1]) || {}).l, 'ok', 5000);
      rDetail({ no });
    }).catch(() => {});
  };
}
const AKSI_ALASAN = {
  kembalikan: { judul: 'Kembalikan ke pemohon', label: 'Catatan revisi', ok: 'Kembalikan', bahaya: false, ikon: 'undo', pesan: 'Pemohon akan menerima notifikasi WhatsApp untuk memperbaiki dokumen. Seluruh riwayat tetap tercatat.', ph: 'Contoh: lampirkan foto segel & surat jalan pemasok.' },
  tolak: { judul: 'Tolak dokumen', label: 'Alasan penolakan', ok: 'Konfirmasi Penolakan', bahaya: true, ikon: 'cancel', pesan: 'Dokumen akan berstatus DITOLAK, lead time berhenti, dan grup WhatsApp menerima notifikasi.', ph: 'Contoh: bukti fisik belum mencantumkan stempel QC gudang…' },
  batal: { judul: 'Batalkan dokumen', label: 'Alasan pembatalan', ok: 'Batalkan Dokumen', bahaya: true, ikon: 'block', pesan: 'Lead time berhenti. Pemohon diminta membuat dokumen pengganti bernomor baru yang terhubung ke dokumen ini.', ph: 'Contoh: nilai varian tidak sesuai kartu stok.' },
  tolakSA: { judul: 'Tolak dokumen final (Super Admin)', label: 'Alasan penolakan', ok: 'Tolak & Cabut TTD', bahaya: true, ikon: 'gpp_bad', pesan: 'Semua tanda tangan akan dinyatakan TIDAK BERLAKU (QR menjadi TIDAK VALID). Riwayat tetap utuh dan grup WhatsApp menerima notifikasi.', ph: 'Contoh: ditemukan kesalahan nilai setelah audit.' },
  batalDraft: { judul: 'Batalkan pengajuan', label: 'Alasan pembatalan', ok: 'Batalkan', bahaya: true, ikon: 'block', pesan: 'Nomor dokumen tetap tercatat dengan status Dibatalkan.', ph: 'Contoh: salah memilih jenis administrasi.' }
};
async function alasanDok(k, no) {
  const c = AKSI_ALASAN[k];
  const alasan = await tanyaAlasan({ judul: c.judul, label: c.label, okTeks: c.ok, bahaya: c.bahaya, ikon: c.ikon, pesan: c.pesan + ` <br><span class="mono xs">${esc(no)}</span>`, placeholder: c.ph });
  if (!alasan) return;
  try {
    const r = await call(k, { no, alasan });
    upsertDoc(r.doc); delete S.det[no];
    toast({ kembalikan: 'Dokumen dikembalikan ke pemohon', tolak: 'Dokumen ditolak', batal: 'Dokumen dibatalkan', tolakSA: 'Dokumen ditolak & TTD dicabut', batalDraft: 'Pengajuan dibatalkan' }[k], 'ok');
    rDetail({ no });
  } catch (e) { toast(e.message, 'bad', 5000); }
}
function simpanAnalisa(no) {
  const ta = $('#anIn');
  const cat = ta.value.trim();
  if (cat.length < 3) { toast('Catatan terlalu pendek.', 'warn'); return; }
  const det = S.det[no];
  const temp = { Catatan: cat, Penulis: S.me.nama, Peran: S.me.jabatanTtd ? labelJabatan(S.me.jabatanTtd) : ROLE_LBL[S.me.role], Waktu: Date.now(), _p: 1 };
  det.analisa.unshift(temp);
  ta.value = '';
  $('#detTabIsi').innerHTML = tabDetail(S.docs.find(d => d.no === no), det);
  call('analisa', { no, catatan: cat }, { silent: true }).then(r => { Object.assign(temp, r); delete temp._p; if (S.view === 'detail' && S.detTab === 'catatan') $('#detTabIsi').innerHTML = tabDetail(S.docs.find(d => d.no === no), det); toast('Catatan tersimpan', 'ok', 1800); })
    .catch(e => { det.analisa = det.analisa.filter(a => a !== temp); toast('Gagal menyimpan catatan: ' + e.message, 'bad'); if (S.view === 'detail') { $('#detTabIsi').innerHTML = tabDetail(S.docs.find(d => d.no === no), det); $('#anIn').value = cat; } });
}
function eksporAudit(no) {
  const det = S.det[no];
  const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const rows = [['Waktu', 'Aksi', 'Pelaku', 'Lokasi', 'Alasan/Kolom', 'Nilai Lama', 'Nilai Baru']].concat(det.riwayat.slice().reverse().map(r => [tglJam(r.Waktu), r.Aksi, r.Pelaku, r.Lokasi, r.Alasan, r.Nilai_Lama, r.Nilai_Baru]))
    .concat([[], ['Level', 'Penanda Tangan', 'Jabatan', 'Waktu', 'Lokasi', 'Kode Verifikasi', 'Berlaku']]).concat(det.ttd.map(t => [t.level, t.nama, t.jabatan, tglJam(t.waktu), t.lokasi, t.kode, t.berlaku ? 'YA' : 'TIDAK']));
  unduhBlob(new Blob(['﻿' + rows.map(r => r.map(q).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' }), 'Audit_' + String(no).split('/').join('-') + '.csv');
}

/* ============================== 17. SCANNER VERIFIKASI ============================== */
let qrScanner = null;
function kartuVerif(r) {
  if (r.isRiwayat) return kartuRiwayat(r);
  return `<div class="vres ${r.valid ? 'ok' : 'bad'}" role="status"><div class="xs muted">Hasil verifikasi tanda tangan digital</div>
    <div class="big mt4">${ic(r.valid ? 'verified' : 'gpp_bad', 's40 f')}${r.valid ? 'VALID' : 'TIDAK VALID'}</div>
    <p class="small" style="margin:8px 0 12px">${esc(r.alasan || 'Tanda tangan asli: segel HMAC cocok dan isi dokumen utuh sejak ditandatangani.')}</p>
    ${r.noDokumen ? `<div class="kv"><span>Nomor Dokumen</span><span class="mono">${esc(r.noDokumen)}</span></div><div class="kv"><span>Format</span><span>${esc(r.format)}</span></div><div class="kv"><span>Penanda Tangan</span><span>${esc(r.penandaTangan)}</span></div><div class="kv"><span>Jabatan</span><span>${esc(r.jabatan)} (Level ${r.level})</span></div><div class="kv"><span>Waktu TTD</span><span>${esc(r.waktuTeks || tglJam(r.waktu))}</span></div><div class="kv"><span>Lokasi</span><span>${esc(r.lokasi)}</span></div><div class="kv"><span>Status Dokumen</span><span>${esc(r.statusDokumen)}</span></div>
      ${S.docs.some(d => d.no === r.noDokumen) ? `<button class="btn btn-sm mt12" data-act="bukaDok" data-no="${esc(r.noDokumen)}">${ic('open_in_new')}Buka dokumen</button>` : ''}` : `<div class="kv"><span>Kode</span><span class="mono">${esc(r.kode || '-')}</span></div>`}</div>`;
}
function kartuRiwayat(r) {
  return `<div class="vres"><div class="xs muted">Riwayat & analisa dokumen</div><div class="ff-h fw6 mt4" style="font-size:18px">${esc(r.no)}</div><div class="small">${esc(r.judul)}</div><div class="flex gap6 wrap mt8"><span class="pill mut">${esc(r.status)}</span><span class="pill pri">${esc(r.format)}</span></div>
    <div class="mt12">${r.ttd.map(t => `<div class="kv"><span>L${t.level} · ${esc(t.jabatan)}</span><span>${esc(t.nama)} ${t.berlaku ? '<span class="c-ok">✔</span>' : '<span class="c-bad">✖ dicabut</span>'}</span></div>`).join('')}</div>
    ${r.analisa.length ? `<div class="h-title mt12 mb8">Analisa admin</div>${r.analisa.map(a => `<div class="note-it mb8"><b class="small">${esc(a.penulis)}</b> <span class="xs muted">${esc(a.peran)} · ${tglJam(a.waktu)}</span><div class="small mt4">${esc(a.catatan)}</div></div>`).join('')}` : ''}
    <div class="h-title mt12 mb8">Lini masa</div><div class="tl">${r.riwayat.map(x => { const [l, , c] = aksiLbl(x.aksi); return `<div class="it ${c}"><div class="small fw6">${esc(l)}</div><div class="xs muted">${tglJam(x.waktu)} · ${esc(x.pelaku)}</div>${x.alasan ? `<div class="xs mt4">${esc(x.alasan)}</div>` : ''}</div>`; }).join('')}</div></div>`;
}
function rScanner() {
  const el = $('#v-scanner');
  el.innerHTML = `<div class="page-h"><div><h1>Scanner Verifikasi</h1><p>Pindai QR tanda tangan digital (VALID / TIDAK VALID) atau QR riwayat dokumen</p></div></div>
  <div class="grid c12" style="align-items:start">
    <div class="card s6"><div class="scan-box"><div id="scanReader" style="width:100%;height:100%"></div><div class="scan-frame"></div>
      <div id="scanIdle" style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;color:#fff;text-align:center;padding:24px">${ic('qr_code_scanner', 's40')}<span class="small">Kamera belum aktif</span></div></div>
      <div class="flex gap8 wrap mt12"><button class="btn btn-p grow" data-act="scanMulai" id="btnScan">${ic('photo_camera')}Aktifkan Kamera</button><label class="btn grow" tabindex="0">${ic('image')}Unggah Foto QR<input type="file" accept="image/*" class="sr" id="scanFile"></label></div>
      <form id="scanManual" class="flex gap8 mt12"><input class="inp" id="scanKode" placeholder="Tempel kode / tautan verifikasi" aria-label="Kode verifikasi"><button class="btn" type="submit">Periksa</button></form>
      <div class="xs muted mt8">${ic('info', 's14')} QR juga dapat dipindai dengan kamera HP biasa — hasilnya membuka halaman verifikasi publik.</div></div>
    <div class="s6 col gap16"><div id="scanHasil"><div class="card">${kosong('shield', 'Belum ada hasil', 'Arahkan kamera ke QR tanda tangan pada dokumen.')}</div></div>
      <div class="card"><div class="h-title mb12">Riwayat pindai sesi ini</div><div id="scanRiwayat" class="col gap8">${riwayatScan()}</div></div></div>
  </div>`;
}
function riwayatScan() { return S.scan.riwayat.map(r => `<div class="list-it">${ic(r.riwayat ? 'history' : r.valid ? 'verified' : 'gpp_bad', r.riwayat ? 'c-pri' : r.valid ? 'c-ok' : 'c-bad')}<div class="grow" style="min-width:0"><div class="small fw6 truncate">${esc(r.noDokumen || r.no || r.kode || '-')}</div><div class="xs muted">${r.riwayat ? 'Riwayat dokumen' : r.valid ? 'VALID' : 'TIDAK VALID'} · ${jam(r.t)}</div></div></div>`).join('') || '<div class="small muted">Belum ada.</div>'; }
async function mulaiKamera(btn) {
  try {
    await muatSkrip(CDN.scan);
    if (!qrScanner) qrScanner = new window.Html5Qrcode('scanReader', { verbose: false });
    if (S.scan.aktif) { hentikanKamera(); return; }
    $('#scanIdle').classList.add('hidden');
    await qrScanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 220, height: 220 }, aspectRatio: 1 }, teks => { hentikanKamera(); prosesScan(teks); }, () => {});
    S.scan.aktif = true;
    if (btn) btn.innerHTML = ic('stop_circle') + 'Hentikan Kamera';
  } catch (e) {
    const idle = $('#scanIdle');
    if (idle) { idle.classList.remove('hidden'); idle.innerHTML = ic('no_photography', 's40') + `<span class="small">Kamera tidak dapat diakses. Gunakan “Unggah Foto QR”.</span><span class="xs" style="opacity:.7">${esc(e.message || e)}</span>`; }
  }
}
function hentikanKamera() {
  if (qrScanner && S.scan.aktif) { qrScanner.stop().catch(() => {}); S.scan.aktif = false; }
  const b = $('#btnScan'); if (b) b.innerHTML = ic('photo_camera') + 'Aktifkan Kamera';
  const idle = $('#scanIdle'); if (idle) idle.classList.remove('hidden');
}
async function scanBerkas(file) {
  try {
    await muatSkrip(CDN.scan);
    hentikanKamera();
    if (!qrScanner) qrScanner = new window.Html5Qrcode('scanReader', { verbose: false });
    const teks = await qrScanner.scanFile(file, false);
    prosesScan(teks);
  } catch (e) { toast('QR tidak terbaca dari gambar. Pastikan foto jelas & tidak buram.', 'warn'); }
}
async function prosesScan(teks) {
  teks = String(teks || '').trim();
  if (!teks) return;
  const box = $('#scanHasil');
  if (box) box.innerHTML = `<div class="card">${skeleton(1, 200)}</div>`;
  try {
    let r;
    const mr = teks.match(/[?&]r=([A-Za-z0-9.]+)/);
    if (mr) { r = await call('riwayatPublik', { tok: mr[1] }); r.isRiwayat = true; }
    else r = await call('verifikasi', { kode: teks, sumber: 'Scanner Aplikasi' });
    const html = r.isRiwayat ? kartuRiwayat(r) : kartuVerif(r);
    if (box) box.innerHTML = html;
    S.scan.riwayat.unshift(Object.assign({ t: Date.now() }, r.isRiwayat ? { riwayat: 1, no: r.no } : r));
    if ($('#scanRiwayat')) $('#scanRiwayat').innerHTML = riwayatScan();
    if (!box) modal({ judul: 'Hasil verifikasi', isi: html, ikon: 'qr_code_scanner' });
  } catch (e) { if (box) box.innerHTML = `<div class="vres bad"><div class="big">${ic('error', 's40')}Gagal</div><p class="small">${esc(e.message)}</p></div>`; else toast(e.message, 'bad'); }
}
async function cekTtd(url) {
  const m = modal({ judul: 'Verifikasi tanda tangan', ikon: 'verified_user', isi: skeleton(1, 220) });
  try { const r = await call('verifikasi', { kode: url, sumber: 'Detail Dokumen' }); m.body.innerHTML = kartuVerif(r); } catch (e) { m.body.innerHTML = kosong('error', 'Gagal memverifikasi', esc(e.message)); }
}

/* ============================== 18. PUSAT PANDUAN ============================== */
const ytId = u => { const m = String(u || '').match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{11})/); return m ? m[1] : ''; };
function rPanduan() {
  const el = $('#v-panduan');
  const ikon = { artikel: 'menu_book', youtube: 'smart_display', dokumen: 'description', tautan: 'link' };
  const list = S.panduan.slice().sort((a, b) => (Number(a.Urutan) || 99) - (Number(b.Urutan) || 99));
  el.innerHTML = `<div class="page-h"><div><h1>Pusat Panduan</h1><p>Dokumen SOP, video tutorial, dan tautan penting</p></div>${isSA() ? `<button class="btn btn-p btn-sm" data-act="panduanEdit">${ic('add')}Tambah Panduan</button>` : ''}</div>
  <div class="g3">${list.map(p => `<div class="card col gap8"><div class="flex between start gap8"><span class="ic-tile lg ${p.Tipe === 'youtube' ? 'bad' : p.Tipe === 'artikel' ? '' : 'cy'}">${ic(ikon[p.Tipe] || 'link')}</span>${p.Aktif === 'TIDAK' ? '<span class="pill mut">Nonaktif</span>' : `<span class="chip xs">${esc(p.Tipe)}</span>`}</div>
    <div class="h-title">${esc(p.Judul)}</div><div class="small muted" style="display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;white-space:pre-line">${esc(p.Deskripsi || '')}</div>
    <div class="flex gap8 wrap mt8" style="margin-top:auto">${p.Tipe === 'artikel' || p.Tipe === 'youtube' ? `<button class="btn btn-sm" data-act="panduanBuka" data-id="${esc(p.ID)}">${ic(p.Tipe === 'youtube' ? 'play_arrow' : 'chrome_reader_mode')}${p.Tipe === 'youtube' ? 'Tonton' : 'Baca'}</button>` : `<a class="btn btn-sm" href="${esc(p.URL)}" target="_blank" rel="noopener">${ic('open_in_new')}Buka</a>`}
    ${isSA() ? `<button class="btn btn-sm btn-g" data-act="panduanEdit" data-id="${esc(p.ID)}" aria-label="Edit">${ic('edit')}</button><button class="btn btn-sm btn-g" data-act="panduanHapus" data-id="${esc(p.ID)}" aria-label="Hapus">${ic('delete')}</button>` : ''}</div></div>`).join('') || `<div class="card">${kosong('help_center', 'Belum ada panduan')}</div>`}
  <div class="card col gap8"><span class="ic-tile lg ok">${ic('install_mobile')}</span><div class="h-title">Pasang aplikasi di HP</div><div class="small muted">Akses lebih cepat dari layar utama ponsel seperti aplikasi biasa.</div><button class="btn btn-sm mt8" data-act="go" data-view="profil" style="margin-top:auto">${ic('qr_code_2')}Lihat cara pasang</button></div></div>`;
}
function bukaPanduan(id) {
  const p = S.panduan.find(x => x.ID === id);
  if (!p) return;
  if (p.Tipe === 'youtube') { const v = ytId(p.URL); modal({ judul: p.Judul, ukuran: 'lg', ikon: 'smart_display', isi: v ? `<div class="yt"><iframe src="https://www.youtube-nocookie.com/embed/${v}" title="${esc(p.Judul)}" allow="accelerometer; encrypted-media; picture-in-picture" allowfullscreen></iframe></div><p class="small muted">${esc(p.Deskripsi || '')}</p>` : kosong('error', 'URL YouTube tidak valid') }); return; }
  modal({ judul: p.Judul, ukuran: 'lg', ikon: 'menu_book', isi: `<div style="white-space:pre-line;line-height:1.75">${esc(p.Deskripsi)}</div>`, kaki: '<button class="btn" data-close>Tutup</button>' });
}
function editPanduan(id) {
  const p = S.panduan.find(x => x.ID === id) || { Tipe: 'artikel', Aktif: 'YA', Urutan: S.panduan.length + 1 };
  const m = modal({ judul: id ? 'Edit panduan' : 'Tambah panduan', ikon: 'help_center', ukuran: 'lg',
    isi: `<div class="col gap12"><div class="fld"><label class="lbl">Judul</label><input class="inp" id="pJ" value="${esc(p.Judul || '')}"></div>
      <div class="g3"><div class="fld"><label class="lbl">Tipe</label><select class="sel" id="pT">${['artikel', 'youtube', 'dokumen', 'tautan'].map(t => `<option ${t === p.Tipe ? 'selected' : ''}>${t}</option>`).join('')}</select></div><div class="fld"><label class="lbl">Urutan</label><input class="inp" id="pU" type="number" value="${esc(p.Urutan || 1)}"></div><div class="fld"><label class="lbl">Status</label><select class="sel" id="pA"><option value="YA">Aktif</option><option value="TIDAK" ${p.Aktif === 'TIDAK' ? 'selected' : ''}>Nonaktif</option></select></div></div>
      <div class="fld"><label class="lbl">URL (https://…)</label><input class="inp" id="pL" value="${esc(p.URL || '')}" placeholder="Wajib untuk YouTube / dokumen / tautan"></div>
      <div class="fld"><label class="lbl">Deskripsi / isi artikel</label><textarea class="txa" id="pD" rows="8">${esc(p.Deskripsi || '')}</textarea></div></div>`,
    kaki: `<button class="btn" data-close>Batal</button><button class="btn btn-p" id="pOk" data-loading="Menyimpan…">${ic('save')}Simpan</button>` });
  m.el.querySelector('#pOk').onclick = e => denganTombol(e.currentTarget, async () => {
    const r = await call('simpanPanduan', { ID: id || '', Judul: $('#pJ').value, Tipe: $('#pT').value, Urutan: $('#pU').value, Aktif: $('#pA').value, URL: $('#pL').value, Deskripsi: $('#pD').value });
    terapkanCfg(r.cfg); m.tutup(); toast('Panduan tersimpan', 'ok'); rPanduan();
  }).catch(() => {});
}

/* ============================== 19. PENGATURAN: JENIS ADMINISTRASI ============================== */
const salinDalam = o => JSON.parse(JSON.stringify(o));
function rSetJenis() {
  const sj = S.setJenis, el = $('#v-set-jenis');
  if (!sj.kode && S.jenis[0]) sj.kode = S.jenis[0].Kode;
  const baru = sj.kode === '__baru';
  const j = baru ? { Kode: '', Nama: '', Pola_Nomor: '{KODE}/{DIVISI}/{BULAN_ROMAWI}/{TAHUN}/{URUT}', Reset_Nomor: 'TAHUNAN', Lead_Time_Hari: 3, Aktif: 'YA', Notifikasi_Aktif: 'YA', Ikon: 'description', Warna: '#3B6CF6', Urutan: S.jenis.length + 1 } : jenisBy(sj.kode);
  if (!j) { el.innerHTML = kosong('category', 'Belum ada jenis'); return; }
  if (sj.untuk !== sj.kode) { sj.untuk = sj.kode; sj.syarat = salinDalam(syaratJenis(sj.kode)); sj.aturan = salinDalam(S.aturan.filter(a => a.Kode_Jenis === sj.kode).sort((a, b) => a.Urutan - b.Urutan)); }
  const tabs = [['umum', 'Umum & Penomoran'], ['syarat', `Persyaratan (${sj.syarat.length})`], ['format', `Format Dokumen (${sj.aturan.length})`]];
  el.innerHTML = `<div class="page-h"><div><h1>Jenis Administrasi</h1><p>Tambah jenis baru, atur persyaratan, format otomatis, dan pola nomor — tanpa mengubah kode</p></div><button class="btn btn-p btn-sm" data-act="jenisPilih" data-v="__baru">${ic('add')}Tambah Jenis</button></div>
  <div class="grid c12" style="align-items:start">
    <div class="card s4 col gap8">${S.jenis.map(x => `<div class="list-it click" data-act="jenisPilih" data-v="${esc(x.Kode)}" style="${x.Kode === sj.kode ? 'border-color:var(--primary)' : ''}"><span class="ic-tile" style="color:${esc(x.Warna || 'var(--link)')}">${ic(x.Ikon || 'description')}</span><div class="grow" style="min-width:0"><div class="small fw6 truncate">${esc(x.Nama)}</div><div class="xs muted mono">${esc(x.Kode)} · ${esc(x.Lead_Time_Hari)} hari · ${S.syarat.filter(s => s.Kode_Jenis === x.Kode).length} isian</div></div>${x.Aktif === 'TIDAK' ? '<span class="pill mut">Off</span>' : ''}</div>`).join('')}
      ${baru ? `<div class="list-it" style="border-color:var(--primary)">${ic('add_circle', 'c-pri')}<span class="small fw6">Jenis baru</span></div>` : ''}</div>
    <div class="card s8"><div class="card-h"><div class="flex center gap8"><span class="ic-tile" style="color:${esc(j.Warna || 'var(--link)')}">${ic(j.Ikon || 'description')}</span><div><div class="h-title">${baru ? 'Jenis administrasi baru' : esc(j.Nama)}</div><div class="h-sub mono">${baru ? 'Isi kode & nama lalu simpan' : esc(j.Kode)}</div></div></div></div>
      ${baru ? '' : `<div class="seg mb16">${tabs.map(([k, l]) => `<button class="${sj.tab === k ? 'on' : ''}" data-act="jenisTab" data-v="${k}">${esc(l)}</button>`).join('')}</div>`}
      <div id="jenisBody">${baru || sj.tab === 'umum' ? formJenisUmum(j, baru) : sj.tab === 'syarat' ? formSyarat() : formAturan()}</div></div>
  </div>`;
}
function formJenisUmum(j, baru) {
  const v = k => esc(j[k] == null ? '' : j[k]);
  return `<div class="col gap12">
    <div class="g2"><div class="fld"><label class="lbl">Kode <span class="req">*</span></label><input class="inp mono" id="jKode" value="${v('Kode')}" ${baru ? '' : 'readonly'} maxlength="10" placeholder="NR"></div><div class="fld"><label class="lbl">Nama <span class="req">*</span></label><input class="inp" id="jNama" value="${v('Nama')}" placeholder="Nota Retur"></div></div>
    <div class="fld"><label class="lbl">Deskripsi</label><input class="inp" id="jDesk" value="${v('Deskripsi')}"></div>
    <div class="fld"><div class="lbl-row"><label class="lbl">Pola nomor <span class="req">*</span></label><span class="hint mono" id="jPrev">${esc(prediksiNomor(j.Kode || 'XX', j.Kode || 'XX', S.me.divisi || 'DIV'))}</span></div><input class="inp mono" id="jPola" value="${v('Pola_Nomor')}">
      <div class="flex gap6 wrap">${['{KODE}', '{JENIS}', '{DIVISI}', '{BULAN_ROMAWI}', '{BULAN}', '{TAHUN}', '{TH}', '{URUT}', '{URUT3}', '{URUT5}'].map(t => `<button class="chip mono" data-act="sisipToken" data-v="${t}" style="border:0;cursor:pointer">${t}</button>`).join('')}</div><span class="hint">{KODE} = kode format (mis. BA/MK) atau kode jenis. Nomor dijaga unik dengan LockService.</span></div>
    <div class="g3"><div class="fld"><label class="lbl">Reset nomor</label><select class="sel" id="jReset">${['TAHUNAN', 'BULANAN', 'TIDAK'].map(x => `<option ${x === j.Reset_Nomor ? 'selected' : ''}>${x}</option>`).join('')}</select></div>
      <div class="fld"><label class="lbl">Lead time (hari kalender)</label><input class="inp" id="jLT" type="number" min="1" max="90" value="${v('Lead_Time_Hari')}"></div>
      <div class="fld"><label class="lbl">Urutan tampil</label><input class="inp" id="jUrut" type="number" value="${v('Urutan')}"></div></div>
    <div class="fld"><div class="lbl-row"><label class="lbl">ID Templat Google Docs</label><button class="lnk" data-act="cekTemplat">${ic('fact_check', 's14')}Cek placeholder</button></div><input class="inp mono" id="jTpl" value="${v('ID_Templat')}" placeholder="Kosong = templat umum bawaan"><span class="hint">Placeholder: {{NO_DOKUMEN}} {{JUDUL}} {{FORMAT}} {{PEMOHON}} {{DIVISI}} {{TANGGAL}} {{NOMINAL_RUPIAH}} {{TERBILANG}} {{TABEL_ISIAN}} {{BLOK_TTD}} {{TTD_1}} {{NAMA_TTD_1}} {{QR_RIWAYAT}} serta {{nama_isian}}.</span></div>
    <div class="g3"><div class="fld"><label class="lbl">Ikon (Material Symbols)</label><input class="inp" id="jIkon" value="${v('Ikon')}"></div><div class="fld"><label class="lbl">Warna</label><input class="inp" id="jWarna" type="color" value="${v('Warna') || '#3B6CF6'}" style="padding:4px;height:42px"></div>
      <div class="col gap8" style="padding-top:22px"><label class="flex center gap8 small"><span class="sw"><input type="checkbox" id="jAktif" ${j.Aktif !== 'TIDAK' ? 'checked' : ''}><span></span></span>Aktif</label><label class="flex center gap8 small"><span class="sw"><input type="checkbox" id="jNotif" ${j.Notifikasi_Aktif !== 'TIDAK' ? 'checked' : ''}><span></span></span>Notif revisi & analisa</label></div></div>
    <div class="flex jend gap8 mt8"><button class="btn btn-p" data-act="simpanJenis" data-loading="Menyimpan…">${ic('save')}Simpan Jenis</button></div></div>`;
}
function formSyarat() {
  const sj = S.setJenis;
  return `<div class="alert info mb12">${ic('info')}<div>Nama isian <span class="mono">nominal</span> menjadi nominal dokumen & bisa dipakai di aturan, <span class="mono">perihal</span> menjadi judul. Kondisi tampil contoh: <span class="mono">penyebab == "Lainnya"</span>.</div></div>
  <div class="col gap8">${sj.syarat.map((s, i) => `<div class="well col gap8"><div class="flex between center"><b class="small">#${i + 1} ${esc(s.Label || 'Isian baru')}</b><div class="flex gap4"><button class="btn btn-sm btn-ic btn-g" data-act="syaratGeser" data-i="${i}" data-d="-1" aria-label="Naik" ${i ? '' : 'disabled'}>${ic('arrow_upward')}</button><button class="btn btn-sm btn-ic btn-g" data-act="syaratGeser" data-i="${i}" data-d="1" aria-label="Turun" ${i < sj.syarat.length - 1 ? '' : 'disabled'}>${ic('arrow_downward')}</button><button class="btn btn-sm btn-ic btn-d" data-act="syaratHapus" data-i="${i}" aria-label="Hapus">${ic('delete')}</button></div></div>
    <div class="g2"><input class="inp" data-sy="${i}" data-f="Label" value="${esc(s.Label || '')}" placeholder="Label tampil" aria-label="Label"><input class="inp mono" data-sy="${i}" data-f="Nama_Isian" value="${esc(s.Nama_Isian || '')}" placeholder="nama_isian" aria-label="Nama isian"></div>
    <div class="g3"><select class="sel" data-sy="${i}" data-f="Tipe_Isian" aria-label="Tipe">${['teks', 'teks_panjang', 'angka', 'rupiah', 'tanggal', 'pilihan'].map(t => `<option ${t === s.Tipe_Isian ? 'selected' : ''}>${t}</option>`).join('')}</select><select class="sel" data-sy="${i}" data-f="Wajib" aria-label="Wajib"><option value="YA">Wajib</option><option value="TIDAK" ${s.Wajib === 'TIDAK' ? 'selected' : ''}>Opsional</option></select><input class="inp mono ${kondisiValid(s.Kondisi) ? '' : 'bad'}" data-sy="${i}" data-f="Kondisi" value="${esc(s.Kondisi || '')}" placeholder="Kondisi tampil (opsional)" aria-label="Kondisi"></div>
    <input class="inp ${s.Tipe_Isian === 'pilihan' ? '' : 'hidden'}" data-sy="${i}" data-f="Opsi" value="${esc(s.Opsi || '')}" placeholder="Opsi dipisah koma: A,B,C" aria-label="Opsi">
    <input class="inp" data-sy="${i}" data-f="Petunjuk" value="${esc(s.Petunjuk || '')}" placeholder="Petunjuk pengisian (opsional)" aria-label="Petunjuk"></div>`).join('')}</div>
  <div class="flex between gap8 mt12 wrap"><button class="btn" data-act="syaratTambah">${ic('add')}Tambah Isian</button><button class="btn btn-p" data-act="simpanSyarat" data-loading="Menyimpan…">${ic('save')}Simpan Persyaratan</button></div>`;
}
function formAturan() {
  const sj = S.setJenis, j = jenisBy(sj.kode);
  const trig = new Set(['nominal']); sj.aturan.forEach(a => String(a.Kondisi || '').replace(/([A-Za-z_]\w*)\s*(?:<=|>=|==|!=|=|<|>|~)/g, (m, k) => { trig.add(k); return m; }));
  return `<div class="alert info mb12">${ic('info')}<div>Aturan dievaluasi berurutan; yang pertama cocok dipakai. Kosongkan kondisi pada baris terakhir sebagai format bawaan. Contoh: <span class="mono">nominal &lt; 300000</span> → Memo Kas.</div></div>
  <div class="col gap8">${sj.aturan.map((a, i) => `<div class="well col gap8"><div class="flex between center"><b class="small">Aturan #${i + 1}</b><div class="flex gap4"><button class="btn btn-sm btn-ic btn-g" data-act="aturanGeser" data-i="${i}" data-d="-1" ${i ? '' : 'disabled'} aria-label="Naik">${ic('arrow_upward')}</button><button class="btn btn-sm btn-ic btn-g" data-act="aturanGeser" data-i="${i}" data-d="1" ${i < sj.aturan.length - 1 ? '' : 'disabled'} aria-label="Turun">${ic('arrow_downward')}</button><button class="btn btn-sm btn-ic btn-d" data-act="aturanHapus" data-i="${i}" aria-label="Hapus">${ic('delete')}</button></div></div>
    <div class="g3"><input class="inp mono ${kondisiValid(a.Kondisi) ? '' : 'bad'}" data-fm="${i}" data-f="Kondisi" value="${esc(a.Kondisi || '')}" placeholder="Kondisi (kosong = bawaan)" aria-label="Kondisi"><input class="inp" data-fm="${i}" data-f="Nama_Format" value="${esc(a.Nama_Format || '')}" placeholder="Nama format" aria-label="Nama format"><input class="inp mono" data-fm="${i}" data-f="Kode_Format" value="${esc(a.Kode_Format || '')}" placeholder="Kode (BA)" maxlength="10" aria-label="Kode format"></div>
    <input class="inp mono" data-fm="${i}" data-f="ID_Templat" value="${esc(a.ID_Templat || '')}" placeholder="ID templat khusus format ini (opsional)" aria-label="ID templat"></div>`).join('') || '<div class="small muted">Belum ada aturan — format memakai nama jenis.</div>'}</div>
  <div class="flex between gap8 mt12 wrap"><button class="btn" data-act="aturanTambah">${ic('add')}Tambah Aturan</button><button class="btn btn-p" data-act="simpanAturan" data-loading="Menyimpan…">${ic('save')}Simpan Format</button></div>
  <div class="well mt16"><div class="h-title mb8">Simulator format</div><div class="g3">${[...trig].map(k => `<input class="inp" data-simfm="${esc(k)}" placeholder="${esc(k)}" aria-label="${esc(k)}">`).join('')}</div><div class="small mt8" id="simFm">Isi nilai untuk menguji.</div></div>`;
}
function simulasiFormat() {
  const sj = S.setJenis, ctx = {};
  $$('[data-simfm]').forEach(i => { ctx[i.dataset.simfm] = i.value.replace(/\./g, ''); });
  const r = sj.aturan.find(a => evalKondisi(a.Kondisi, ctx));
  $('#simFm').innerHTML = r ? `Hasil: <b>${esc(r.Nama_Format)}</b> <span class="mono c-pri">${esc(r.Kode_Format)}</span>${r.Kondisi ? ' — karena <span class="mono">' + esc(r.Kondisi) + '</span>' : ' (bawaan)'}` : `Hasil: format bawaan <b>${esc((jenisBy(sj.kode) || {}).Nama)}</b>`;
}

/* ============================== 20. PENGATURAN: ALUR PENANDATANGAN ============================== */
function rSetAlur() {
  const sa = S.setAlur, el = $('#v-set-alur');
  if (!sa.kode && S.jenis[0]) sa.kode = S.jenis[0].Kode;
  if (!sa.kode) { el.innerHTML = kosong('draw', 'Belum ada jenis administrasi'); return; }
  if (sa.untuk !== sa.kode) { sa.untuk = sa.kode; sa.list = salinDalam(S.alur.filter(a => a.Kode_Jenis === sa.kode).sort((a, b) => a.Urutan_Level - b.Urutan_Level)); if (!sa.list.length) sa.list = [{ Role_Penanda_Tangan: 'ADMIN_DIVISI', Label_Jabatan: 'Admin Divisi', Lingkup: 'DIVISI', Kondisi_Pemicu: '' }]; }
  const jab = S.cfg.jabatanTtd || ['ADMIN_DIVISI'];
  const trig = new Set(['nominal']);
  pemicuJenis(sa.kode).forEach(k => trig.add(k));
  sa.list.forEach(a => String(a.Kondisi_Pemicu || '').replace(/([A-Za-z_]\w*)\s*(?:<=|>=|==|!=|=|<|>|~)/g, (m, k) => { trig.add(k); return m; }));
  el.innerHTML = `<div class="page-h"><div><h1>Alur Penandatangan</h1><p>Urutan level TTD per jenis. Level 1 selalu Admin Divisi; level lain bisa dipicu kondisi (mis. nominal)</p></div>
    <select class="sel" style="width:auto;min-height:38px" data-alurjenis aria-label="Jenis">${S.jenis.map(j => `<option value="${esc(j.Kode)}" ${j.Kode === sa.kode ? 'selected' : ''}>${esc(j.Nama)}</option>`).join('')}</select></div>
  <div class="grid c12" style="align-items:start">
    <div class="card s7"><div class="card-h"><div class="h-title">Level tanda tangan · ${esc((jenisBy(sa.kode) || {}).Nama)}</div></div>
      <div class="col gap8">${sa.list.map((a, i) => `<div class="well col gap8"><div class="flex between center"><span class="flex center gap8"><span class="badge-n blue" style="height:24px;min-width:24px">${i + 1}</span><b class="small">${esc(a.Label_Jabatan || labelJabatan(a.Role_Penanda_Tangan))}</b></span>
        ${i ? `<div class="flex gap4"><button class="btn btn-sm btn-ic btn-g" data-act="alurGeser" data-i="${i}" data-d="-1" ${i > 1 ? '' : 'disabled'} aria-label="Naik">${ic('arrow_upward')}</button><button class="btn btn-sm btn-ic btn-g" data-act="alurGeser" data-i="${i}" data-d="1" ${i < sa.list.length - 1 ? '' : 'disabled'} aria-label="Turun">${ic('arrow_downward')}</button><button class="btn btn-sm btn-ic btn-d" data-act="alurHapus" data-i="${i}" aria-label="Hapus">${ic('delete')}</button></div>` : '<span class="pill pri">Wajib</span>'}</div>
        <div class="g3"><select class="sel" data-al="${i}" data-f="Role_Penanda_Tangan" ${i ? '' : 'disabled'} aria-label="Kode jabatan">${jab.map(r => `<option value="${esc(r)}" ${r === a.Role_Penanda_Tangan ? 'selected' : ''}>${esc(r)}</option>`).join('')}</select>
          <input class="inp" data-al="${i}" data-f="Label_Jabatan" value="${esc(a.Label_Jabatan || '')}" placeholder="Label (Manajer Operasional)" aria-label="Label">
          <select class="sel" data-al="${i}" data-f="Lingkup" ${i ? '' : 'disabled'} aria-label="Lingkup"><option value="DIVISI">Divisi pemohon</option><option value="GLOBAL" ${a.Lingkup === 'GLOBAL' ? 'selected' : ''}>Global</option></select></div>
        ${i ? `<input class="inp mono ${kondisiValid(a.Kondisi_Pemicu) ? '' : 'bad'}" data-al="${i}" data-f="Kondisi_Pemicu" value="${esc(a.Kondisi_Pemicu || '')}" placeholder="Kondisi pemicu, mis. nominal >= 10000000 (kosong = selalu)" aria-label="Kondisi pemicu">` : '<div class="xs muted">Memeriksa, dapat mengembalikan, lalu TTD → dokumen terkunci & lead time mulai.</div>'}</div>`).join('')}</div>
      <div class="flex between gap8 mt12 wrap"><button class="btn" data-act="alurTambah">${ic('add')}Tambah Level</button><button class="btn btn-p" data-act="simpanAlur" data-loading="Menyimpan…">${ic('save')}Simpan Alur</button></div>
      <div class="xs muted mt12">Kode jabatan tersedia: ${jab.map(x => `<span class="mono">${esc(x)}</span>`).join(', ')} — ubah di Pengaturan Umum. Tetapkan jabatan TTD pengguna di Persetujuan Akun.</div></div>
    <div class="card s5"><div class="card-h"><div class="flex center gap8"><span class="ic-tile">${ic('science')}</span><div><div class="h-title">Simulator alur</div><div class="h-sub">Uji kondisi sebelum disimpan</div></div></div></div>
      <div class="g2">${[...trig].map(k => `<div class="fld"><label class="lbl xs">${esc(k)}</label><input class="inp" data-simal="${esc(k)}" placeholder="${k === 'nominal' ? '12850000' : ''}"></div>`).join('')}<div class="fld"><label class="lbl xs">divisi</label><select class="sel" data-simal="divisi">${S.divisi.map(d => `<option value="${esc(d.Kode)}" ${d.Kode === S.me.divisi ? 'selected' : ''}>${esc(d.Kode)}</option>`).join('')}</select></div></div>
      <div id="simAlur" class="mt12"></div></div>
  </div>`;
  simulasiAlur();
}
function simulasiAlur() {
  const sa = S.setAlur, ctx = {};
  $$('[data-simal]').forEach(i => { ctx[i.dataset.simal] = i.value.replace(/\./g, ''); });
  const fmt = tentukanFormat(sa.kode, ctx);
  ctx.format = fmt.kode;
  const lv = sa.list.filter((a, i) => !i || evalKondisi(a.Kondisi_Pemicu, ctx)).map((a, i) => ({ lv: i + 1, r: a.Role_Penanda_Tangan, l: a.Label_Jabatan || labelJabatan(a.Role_Penanda_Tangan), s: a.Lingkup || 'DIVISI', k: a.Kondisi_Pemicu }));
  $('#simAlur').innerHTML = `<div class="small mb8">Format: <b>${esc(fmt.nama)}</b> <span class="mono c-pri">${esc(fmt.kode)}</span></div><div class="chain">${lv.map(a => { const k = kandidat(ctx.divisi, a); return `<div class="lv ${a.lv === 1 ? 'l1' : ''} ${a.k ? 'esc' : ''}"><span class="k">${a.lv}</span><div class="small fw6">${esc(a.l)}</div><div class="xs ${k.length ? 'muted' : 'c-warn'}">${k.length ? esc(k.map(u => u.nama).join(', ')) : 'Belum ada pejabat aktif untuk level ini'}</div></div>`; }).join('')}</div>`;
}

/* ============================== 21. PENGATURAN: AKUN & DIVISI ============================== */
const opsiRole = v => Object.keys(ROLE_LBL).map(r => `<option value="${r}" ${r === v ? 'selected' : ''}>${ROLE_LBL[r]}</option>`).join('');
const opsiDivisi = v => S.divisi.filter(d => d.Aktif !== 'TIDAK').map(d => `<option value="${esc(d.Kode)}" ${d.Kode === v ? 'selected' : ''}>${esc(d.Nama)}</option>`).join('');
const opsiJab = v => '<option value="">— tanpa jabatan TTD —</option>' + (S.cfg.jabatanTtd || []).map(j => `<option value="${esc(j)}" ${j === v ? 'selected' : ''}>${esc(labelJabatan(j))} (${esc(j)})</option>`).join('');
function rSetAkun() {
  const el = $('#v-set-akun'), tab = S.setAkun;
  const tabs = [['permintaan', `Permintaan (${S.akses.length})`], ['pengguna', `Pengguna (${S.users.length})`], ['divisi', `Divisi (${S.divisi.length})`]];
  let isi = '';
  if (tab === 'permintaan') {
    isi = S.akses.length ? `<div class="g2">${S.akses.map(a => `<div class="card col gap12" data-rq="${esc(a.ID)}"><div class="flex gap12 start">${avatar(a.Nama)}<div class="grow" style="min-width:0"><div class="fw6">${esc(a.Nama)}</div><div class="xs muted truncate">${esc(a.Email)}</div><div class="xs muted">${esc(a.Jabatan)} · WA ${esc(a.No_WA)} · ${relatif(a.Diajukan)}</div></div>${a.Divisi_Diminta ? `<span class="chip">${esc(a.Divisi_Diminta)}</span>` : ''}</div>
      <div class="note-it small">${esc(a.Deskripsi)}</div>
      <div class="g3"><select class="sel" data-rqf="role" aria-label="Role">${opsiRole('ANGGOTA')}</select><select class="sel" data-rqf="divisi" aria-label="Divisi">${opsiDivisi(a.Divisi_Diminta || '')}</select><select class="sel" data-rqf="jab" aria-label="Jabatan TTD">${opsiJab('')}</select></div>
      <div class="flex jend gap8"><button class="btn btn-sm btn-d" data-act="aksesTolak" data-id="${esc(a.ID)}">${ic('close')}Tolak</button><button class="btn btn-sm btn-p" data-act="aksesSetuju" data-id="${esc(a.ID)}" data-loading="Menyetujui…">${ic('check')}Setujui</button></div></div>`).join('')}</div>`
      : `<div class="card">${kosong('how_to_reg', 'Tidak ada permintaan menunggu', 'Calon anggota masuk dengan email Google lalu mengisi deskripsi keperluan; permintaan muncul di sini.')}</div>`;
  } else if (tab === 'pengguna') {
    isi = `<div class="card"><div class="flex between gap8 wrap mb12"><div class="inp-wrap" style="flex:1;max-width:360px"><span class="pre">${ic('search', 's18')}</span><input class="inp" id="uCari" placeholder="Cari nama / email / divisi" value="${esc(S.uCari || '')}"></div><button class="btn btn-sm btn-p" data-act="penggunaEdit">${ic('person_add')}Tambah Pengguna</button></div><div id="uList">${daftarPengguna()}</div></div>`;
  } else {
    isi = `<div class="card"><div class="flex jend mb12"><button class="btn btn-sm btn-p" data-act="divisiEdit">${ic('add')}Tambah Divisi</button></div><div class="col gap8">${S.divisi.map(d => `<div class="list-it click" data-act="divisiEdit" data-v="${esc(d.Kode)}"><span class="chip mono">${esc(d.Kode)}</span><div class="grow small fw5">${esc(d.Nama)}</div><span class="xs muted">${S.users.filter(u => u.divisi === d.Kode).length} pengguna</span>${d.Aktif === 'TIDAK' ? '<span class="pill mut">Nonaktif</span>' : '<span class="pill ok">Aktif</span>'}</div>`).join('')}</div></div>`;
  }
  el.innerHTML = `<div class="page-h"><div><h1>Persetujuan Akun & Pengguna</h1><p>Setujui anggota baru, tetapkan role, divisi, dan jabatan penanda tangan</p></div></div><div class="seg mb16">${tabs.map(([k, l]) => `<button class="${tab === k ? 'on' : ''}" data-act="akunTab" data-v="${k}">${esc(l)}</button>`).join('')}</div>${isi}`;
}
function daftarPengguna() {
  const q = String(S.uCari || '').toLowerCase();
  const rows = S.users.filter(u => !q || [u.nama, u.email, u.divisi, u.jabatan, u.role].join(' ').toLowerCase().indexOf(q) >= 0);
  return `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Pengguna</th><th>Role</th><th class="hide-m">Divisi</th><th class="hide-m">Jabatan TTD</th><th class="hide-m">WhatsApp</th><th>Status</th></tr></thead><tbody>${rows.map(u => `<tr class="click" data-act="penggunaEdit" data-v="${esc(u.email)}" tabindex="0"><td><div class="flex center gap8">${avatar(u.nama, 1)}<div style="min-width:0"><div class="fw5 truncate">${esc(u.nama)}</div><div class="xs muted truncate">${esc(u.email)}</div></div></div></td><td><span class="pill ${u.role === 'SUPER_ADMIN' ? 'pri' : u.role === 'ADMIN_DIVISI' ? 'cy' : 'mut'}">${esc(ROLE_LBL[u.role] || u.role)}</span></td><td class="hide-m">${esc(u.divisi || '-')}</td><td class="hide-m mono xs">${esc(u.jabatanTtd || '-')}</td><td class="hide-m xs">${esc(u.noWa || '-')}${u.statusWa ? `<div class="${u.statusWa === 'Terdaftar' ? 'c-ok' : 'c-bad'}">${esc(u.statusWa)}</div>` : ''}${u.optOut ? '<div class="c-warn">Opt-out</div>' : ''}</td><td>${u.status === 'Aktif' ? '<span class="pill ok">Aktif</span>' : '<span class="pill mut">Nonaktif</span>'}</td></tr>`).join('')}</tbody></table></div>`;
}
function editPengguna(email) {
  const u = email ? userBy(email) : null;
  const m = modal({ judul: u ? 'Edit pengguna' : 'Tambah pengguna', ikon: 'manage_accounts', ukuran: 'lg',
    isi: `<div class="col gap12"><div class="g2"><div class="fld"><label class="lbl">Email Google</label><input class="inp" id="uEmail" value="${esc(u ? u.email : '')}" ${u ? 'readonly' : ''} placeholder="nama@gmail.com"></div><div class="fld"><label class="lbl">Nama</label><input class="inp" id="uNama" value="${esc(u ? u.nama : '')}"></div></div>
      <div class="g2"><div class="fld"><label class="lbl">Jabatan</label><input class="inp" id="uJab" value="${esc(u ? u.jabatan || '' : '')}"></div><div class="fld"><label class="lbl">No. WhatsApp</label><input class="inp" id="uWa" inputmode="tel" value="${esc(u ? u.noWa || '' : '')}"></div></div>
      <div class="g3"><div class="fld"><label class="lbl">Role</label><select class="sel" id="uRole">${opsiRole(u ? u.role : 'ANGGOTA')}</select></div><div class="fld"><label class="lbl">Divisi</label><select class="sel" id="uDiv">${opsiDivisi(u ? u.divisi : '')}</select></div><div class="fld"><label class="lbl">Jabatan TTD</label><select class="sel" id="uJt">${opsiJab(u ? u.jabatanTtd : '')}</select></div></div>
      ${u ? `<div class="g2"><div class="fld"><label class="lbl">Status</label><select class="sel" id="uSt"><option>Aktif</option><option ${u.status !== 'Aktif' ? 'selected' : ''}>Nonaktif</option></select></div><label class="flex center gap8 small" style="padding-top:24px"><span class="sw"><input type="checkbox" id="uOpt" ${u.optOut ? 'checked' : ''}><span></span></span>Opt-out WhatsApp</label></div>
      <div class="xs muted">Login terakhir: ${u.login ? tglJam(u.login) : 'belum pernah'} · terdaftar ${u.dibuat ? tgl(u.dibuat) : '-'}</div>` : ''}
      <div class="alert info">${ic('info')}<div>Admin Divisi otomatis menjadi penanda tangan Level 1 untuk divisinya. Penanda tangan lanjutan (Manajer, Direktur) memerlukan <b>Jabatan TTD</b> yang cocok dengan Alur Penandatangan.</div></div></div>`,
    kaki: `<button class="btn" data-close>Batal</button><button class="btn btn-p" id="uOk" data-loading="Menyimpan…">${ic('save')}Simpan</button>` });
  m.el.querySelector('#uOk').onclick = e => denganTombol(e.currentTarget, async () => {
    const d = { email: $('#uEmail').value.trim(), nama: $('#uNama').value.trim(), jabatan: $('#uJab').value.trim(), noWa: $('#uWa').value.trim(), role: $('#uRole').value, divisi: $('#uDiv').value, jabatanTtd: $('#uJt').value };
    if (u) { d.status = $('#uSt').value; d.optOut = $('#uOpt').checked; }
    const r = await call(u ? 'simpanPengguna' : 'tambahPengguna', d);
    S.users = r.users; simpanCache(); m.tutup(); toast('Pengguna tersimpan', 'ok'); rSetAkun();
  }).catch(() => {});
}
function editDivisi(kode) {
  const d = S.divisi.find(x => x.Kode === kode) || { Aktif: 'YA' };
  const m = modal({ judul: kode ? 'Edit divisi' : 'Tambah divisi', ikon: 'corporate_fare',
    isi: `<div class="col gap12"><div class="g2"><div class="fld"><label class="lbl">Kode</label><input class="inp mono" id="dvK" value="${esc(d.Kode || '')}" ${kode ? 'readonly' : ''} maxlength="10" placeholder="LOG"></div><div class="fld"><label class="lbl">Status</label><select class="sel" id="dvA"><option value="YA">Aktif</option><option value="TIDAK" ${d.Aktif === 'TIDAK' ? 'selected' : ''}>Nonaktif</option></select></div></div><div class="fld"><label class="lbl">Nama divisi</label><input class="inp" id="dvN" value="${esc(d.Nama || '')}"></div></div>`,
    kaki: `<button class="btn" data-close>Batal</button><button class="btn btn-p" id="dvOk" data-loading="Menyimpan…">${ic('save')}Simpan</button>` });
  m.el.querySelector('#dvOk').onclick = e => denganTombol(e.currentTarget, async () => { const r = await call('simpanDivisi', { Kode: $('#dvK').value, Nama: $('#dvN').value, Aktif: $('#dvA').value }); terapkanCfg(r.cfg); m.tutup(); toast('Divisi tersimpan', 'ok'); rSetAkun(); }).catch(() => {});
}
async function prosesAkses(id, setuju, btn) {
  const card = $(`[data-rq="${CSS.escape(id)}"]`);
  const d = { id, keputusan: setuju ? 'SETUJU' : 'TOLAK', role: card.querySelector('[data-rqf=role]').value, divisi: card.querySelector('[data-rqf=divisi]').value, jabatanTtd: card.querySelector('[data-rqf=jab]').value };
  if (!setuju) { const c = await tanyaAlasan({ judul: 'Tolak permintaan akses', label: 'Alasan (dikirim via WhatsApp)', okTeks: 'Tolak', min: 3 }); if (!c) return; d.catatan = c; }
  const simpan = S.akses.slice();
  S.akses = S.akses.filter(a => a.ID !== id);
  card.style.opacity = '.4';
  try {
    const r = await call('prosesAkses', d);
    if (r.users) S.users = r.users;
    toast(setuju ? 'Akun disetujui · notifikasi WA dikirim' : 'Permintaan ditolak', 'ok');
    simpanCache(); renderNav(); rSetAkun();
  } catch (e) { S.akses = simpan; card.style.opacity = '1'; toast(e.message, 'bad', 5000); }
}

/* ============================== 22. PENGATURAN: WHATSAPP ============================== */
async function rSetWa(segar) {
  const el = $('#v-set-wa');
  if (!S.waSt || segar === true) { el.innerHTML = `<div class="page-h"><div><h1>Notifikasi WhatsApp</h1><p>Memuat status Fonnte…</p></div></div>${skeleton(3, 140)}`; try { S.waSt = await call('waStatus', {}, { silent: true }); } catch (e) { el.innerHTML = kosong('error', 'Gagal memuat', esc(e.message)); return; } }
  if (S.view !== 'set-wa') return;
  const w = S.waSt, pr = w.perangkat;
  const pill = st => ({ Terkirim: 'ok', Antri: 'warn', Gagal: 'bad', Batal: 'mut' }[st] || 'mut');
  el.innerHTML = `<div class="page-h"><div><h1>Notifikasi WhatsApp</h1><p>Fonnte · pesan dikumpulkan per penerima & terkirim ≤ 10 menit · anti-spam</p></div><button class="btn btn-sm" data-act="waMuat">${ic('refresh')}Muat ulang</button></div>
  <div class="grid c12" style="align-items:start">
    <div class="card s7 col gap12"><div class="card-h bd"><div class="flex center gap8"><span class="ic-tile ok">${ic('chat')}</span><div><div class="h-title">Koneksi Fonnte</div><div class="h-sub">Token tersimpan di Script Properties (tidak di Sheets)</div></div></div>${pr ? `<span class="pill ${pr.status === 'connect' ? 'ok' : 'bad'}">${ic(pr.status === 'connect' ? 'link' : 'link_off')}${esc(pr.status)}</span>` : '<span class="pill mut">Belum diatur</span>'}</div>
      <div class="g2"><div class="fld"><label class="lbl">Token saat ini</label><input class="inp mono" readonly value="${esc(w.token || '— belum ada —')}"></div><div class="fld"><label class="lbl">Token baru</label><input class="inp mono" id="waTok" type="password" autocomplete="off" placeholder="Tempel token dari dashboard Fonnte"></div></div>
      ${pr && pr.kuota !== undefined ? `<div class="xs muted">Perangkat ${esc(pr.nomor || '-')} · kuota ${esc(pr.kuota)} · paket ${esc(pr.paket || '-')}</div>` : ''}
      <div class="g3"><label class="flex center gap8 small"><span class="sw"><input type="checkbox" id="waAktif" ${w.aktif ? 'checked' : ''}><span></span></span>WhatsApp aktif</label>
        <div class="fld"><label class="lbl">Jendela kumpul</label><select class="sel" id="waJendela">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<option value="${n}" ${n === w.jendela ? 'selected' : ''}>${n} menit</option>`).join('')}</select></div>
        <div class="fld"><label class="lbl">Salam penutup</label><input class="inp" id="waSalam" value="${esc(w.salam)}"></div></div>
      <div class="fld"><div class="lbl-row"><label class="lbl">ID grup default (final & penolakan)</label><button class="lnk" data-act="waGrup">${ic('groups', 's14')}Ambil daftar grup</button></div><input class="inp mono" id="waGrupIn" value="${esc(w.grup)}" placeholder="120363xxxxxxxx@g.us"></div>
      <div class="flex jend gap8 wrap">${w.token ? `<button class="btn btn-sm btn-d" data-act="waHapusToken">${ic('key_off')}Hapus token</button>` : ''}<button class="btn btn-p" data-act="waSimpan" data-loading="Menyimpan…">${ic('save')}Simpan</button></div></div>
    <div class="s5 col gap16">
      <div class="card"><div class="g3"><div class="tile"><span class="lbl">Antre</span><div class="stat c-warn">${w.statistik.antri}</div></div><div class="tile"><span class="lbl">Terkirim 24j</span><div class="stat c-ok">${w.statistik.terkirim24}</div></div><div class="tile"><span class="lbl">Gagal 24j</span><div class="stat ${w.statistik.gagal24 ? 'c-bad' : ''}">${w.statistik.gagal24}</div></div></div>
        <div class="flex gap8 wrap mt12"><button class="btn btn-sm grow" data-act="waProses" data-loading="Mengirim…">${ic('send')}Kirim antrean sekarang</button><button class="btn btn-sm grow" data-act="waValidasi" data-loading="Memeriksa…">${ic('verified')}Validasi nomor pengguna</button></div></div>
      <div class="card"><div class="h-title mb8">Tes kirim</div><div class="flex gap8"><input class="inp" id="waTes" placeholder="0812… atau ID grup"><button class="btn" data-act="waTes" data-loading="…">${ic('send')}</button></div></div>
      <div class="card"><div class="h-title mb8">Matriks kejadian</div><div class="col gap6 small">${[['Pengajuan baru', 'Admin Divisi terkait'], ['Naik ke level berikutnya', 'Penanda tangan level itu'], ['Dikembalikan / revisi / analisa', 'Pemohon (opsional per jenis)'], ['Ditolak / dibatalkan', 'Grup WA + pemohon'], ['Dokumen final', 'Grup WA + pemohon'], ['Lead time mendekati batas', 'Penanda tangan saat ini'], ['Permintaan akses', 'Super Admin']].map(r => `<div class="kv"><span>${r[0]}</span><span>${r[1]}</span></div>`).join('')}</div></div>
    </div>
    <div class="card s12"><div class="card-h"><div class="h-title">Grup & tembusan per jenis administrasi</div><button class="btn btn-sm btn-p" data-act="waSimpanJenis" data-loading="Menyimpan…">${ic('save')}Simpan</button></div>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Jenis</th><th>ID grup (kosong = default)</th><th>Nomor tembusan</th><th>Aktif</th></tr></thead><tbody>${S.jenis.map(j => { const c = S.wa.find(x => x.Kode_Jenis === j.Kode) || {}; return `<tr data-wj="${esc(j.Kode)}"><td class="fw5">${esc(j.Nama)}</td><td><input class="inp mono" style="min-height:36px;font-size:13px" data-wf="ID_Grup" value="${esc(c.ID_Grup || '')}"></td><td><input class="inp" style="min-height:36px;font-size:13px" data-wf="Nomor_Tambahan" value="${esc(c.Nomor_Tambahan || '')}" placeholder="0812…,0813…"></td><td><span class="sw"><input type="checkbox" data-wf="Aktif" ${c.Aktif !== 'TIDAK' ? 'checked' : ''} aria-label="Aktif"><span></span></span></td></tr>`; }).join('')}</tbody></table></div></div>
    <div class="card s6"><div class="h-title mb12">Antrean terbaru</div><div class="col gap6">${w.antrean.map(a => `<div class="list-it"><div class="grow" style="min-width:0"><div class="small fw5 truncate">${esc(a.nama || a.tujuan)} <span class="xs muted mono">${esc(a.event)}</span></div><div class="xs muted truncate">${esc(a.ringkasan)}</div></div><span class="pill ${pill(a.status)}">${esc(a.status)}</span></div>`).join('') || '<div class="small muted">Antrean kosong.</div>'}</div></div>
    <div class="card s6"><div class="h-title mb12">Log pengiriman</div><div class="col gap6">${w.log.map(l => `<div class="list-it"><div class="grow" style="min-width:0"><div class="small fw5 truncate">${esc(l.nama || l.tujuan)} · ${l.jumlah} item</div><div class="xs muted truncate">${tglJam(l.waktu)} · ${esc(l.respon)}</div></div><span class="pill ${pill(l.status)}">${esc(l.status)}</span></div>`).join('') || '<div class="small muted">Belum ada pengiriman.</div>'}</div></div>
  </div>`;
}

/* ============================== 23. PENGATURAN UMUM, SISTEM & MIGRASI ============================== */
function rSetUmum() {
  const el = $('#v-set-umum'), s = S.cfg.set || {};
  const f = (k, l, ph = '', tipe = 'text', hint = '') => `<div class="fld"><label class="lbl" for="st_${k}">${l}</label><input class="inp ${/URL|JABATAN/.test(k) ? 'mono' : ''}" id="st_${k}" data-set="${k}" type="${tipe}" value="${esc(s[k] || '')}" placeholder="${esc(ph)}">${hint ? `<span class="hint">${hint}</span>` : ''}</div>`;
  el.innerHTML = `<div class="page-h"><div><h1>Pengaturan Umum</h1><p>Identitas aplikasi, logo QR, URL, jabatan penanda tangan, sistem & migrasi data</p></div></div>
  <div class="grid c12" style="align-items:start">
    <div class="card s7 col gap12"><div class="card-h bd"><div class="h-title">Identitas & tampilan</div></div>
      <div class="g2">${f('NAMA_APLIKASI', 'Nama aplikasi')}${f('SUBJUDUL', 'Subjudul sidebar')}</div>${f('NAMA_ORGANISASI', 'Nama organisasi (kop dokumen)')}
      <div class="g2">${f('LOGO_URL', 'URL logo aplikasi', 'https://…')}${f('LOGO_QR_URL', 'URL logo di tengah QR TTD', 'https://… (PNG persegi)', 'text', 'Ditempel pada QR tanda tangan digital.')}</div>
      <div class="card-h bd mt8"><div class="h-title">URL & instalasi</div></div>
      ${f('APP_URL', 'URL Web App (/exec)', 'https://script.google.com/macros/s/…/exec', 'text', 'Dipakai di QR verifikasi & pesan WA. Terisi otomatis saat aplikasi pertama dibuka.')}
      ${f('PWA_URL', 'URL PWA GitHub Pages', 'https://username.github.io/sima/', 'text', 'Halaman pembungkus agar aplikasi bisa dipasang di HP.')}
      <div class="card-h bd mt8"><div class="h-title">Penanda tangan & lead time</div></div>
      ${f('DAFTAR_JABATAN_TTD', 'Kode jabatan TTD (pisah koma)', 'ADMIN_DIVISI,MANAJER,DIREKTUR')}${f('LABEL_JABATAN_TTD', 'Label jabatan', 'MANAJER=Manajer;DIREKTUR=Direktur')}
      <div class="g2">${f('LEADTIME_PENGINGAT_JAM', 'Pengingat lead time (jam sebelum batas)', '24', 'number')}<div class="fld"><label class="lbl">Analisa di halaman QR riwayat publik</label><select class="sel" data-set="RIWAYAT_PUBLIK_ANALISA"><option value="YA">Tampilkan</option><option value="TIDAK" ${s.RIWAYAT_PUBLIK_ANALISA === 'TIDAK' ? 'selected' : ''}>Sembunyikan</option></select></div></div>
      <div class="flex jend"><button class="btn btn-p" data-act="simpanUmum" data-loading="Menyimpan…">${ic('save')}Simpan Pengaturan</button></div></div>
    <div class="s5 col gap16">
      <div class="card" id="sistemCard"><div class="card-h"><div class="flex center gap8"><span class="ic-tile">${ic('dns')}</span><div class="h-title">Sistem</div></div><button class="btn btn-sm" data-act="muatSistem">${ic('refresh')}Periksa</button></div><div id="sistemIsi" class="small muted">Klik “Periksa” untuk melihat trigger, kuota email, dan antrean tugas.</div></div>
      <div class="card"><div class="card-h"><div class="flex center gap8"><span class="ic-tile warn">${ic('move_up')}</span><div><div class="h-title">Migrasi database</div><div class="h-sub">Impor dari spreadsheet versi lama (hanya dibaca)</div></div></div></div>
        <div class="flex gap8"><input class="inp mono" id="migSrc" placeholder="ID / URL spreadsheet lama"><button class="btn" data-act="migPindai" data-loading="Memindai…">${ic('search')}Pindai</button></div>
        <div class="xs muted mt8">Dry-run dulu, lalu impor per tabel (idempoten, aman diulang untuk delta-sync sebelum cutover). Salin juga Script Property <span class="mono">HMAC_KEY</span> dari proyek lama agar QR lama tetap VALID.</div>
        <div id="migHasil" class="mt12"></div></div>
    </div>
  </div>`;
}
async function muatSistem(btn) {
  await denganTombol(btn, async () => {
    const s = await call('sistem');
    $('#sistemIsi').innerHTML = `<div class="kv"><span>Versi</span><span>${esc(s.versi)}</span></div><div class="kv"><span>Spreadsheet</span><span><a href="${esc(s.spreadsheet)}" target="_blank" rel="noopener">Buka ${ic('open_in_new', 's14')}</a></span></div><div class="kv"><span>Folder Drive</span><span><a href="${esc(s.folder)}" target="_blank" rel="noopener">Buka ${ic('open_in_new', 's14')}</a></span></div><div class="kv"><span>Templat umum</span><span><a href="${esc(s.templat)}" target="_blank" rel="noopener">Edit ${ic('open_in_new', 's14')}</a></span></div>
      <div class="kv"><span>Trigger</span><span>${s.trigger.length ? esc(s.trigger.join(', ')) : '<span class="c-bad">Belum terpasang</span>'}</span></div><div class="kv"><span>Kuota email hari ini</span><span>${s.kuotaEmail}</span></div><div class="kv"><span>Antrean tugas PDF</span><span>${s.tugasAntri}</span></div><div class="kv"><span>Dokumen / pengguna</span><span>${s.jumlah.dokumen} / ${s.jumlah.pengguna}</span></div><div class="kv"><span>Token Fonnte</span><span>${s.fonnte ? '<span class="c-ok">Terpasang</span>' : '<span class="c-warn">Belum</span>'}</span></div>
      ${s.tugasGagal.length ? `<div class="alert bad mt8">${ic('error')}<div>${s.tugasGagal.map(t => esc(t.tugas + ' ' + t.no + ': ' + t.pesan)).join('<br>')}</div></div>` : ''}
      <div class="flex gap8 wrap mt12"><button class="btn btn-sm" data-act="sysAksi" data-v="pasangTrigger">${ic('schedule')}Pasang ulang trigger</button><button class="btn btn-sm" data-act="sysAksi" data-v="bersihkanCache">${ic('mop')}Bersihkan cache</button><button class="btn btn-sm" data-act="sysAksi" data-v="sinkronSkema">${ic('table_rows')}Sinkronkan skema</button></div>`;
  }).catch(() => {});
}
async function migPindai(btn) {
  const src = $('#migSrc').value.trim();
  if (!src) { toast('Masukkan ID spreadsheet lama.', 'warn'); return; }
  await denganTombol(btn, async () => {
    const r = await call('migrasiPindai', { sumber: src });
    S.mig = { src, hasil: r.hasil };
    $('#migHasil').innerHTML = `<div class="small mb8">Sumber: <b>${esc(r.sumber)}</b></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Tabel</th><th class="tr">+Baru</th><th class="tr">Ubah</th><th class="tr">Lewati</th><th></th></tr></thead><tbody>${r.hasil.map(h => `<tr><td class="small">${esc(h.tabel)}</td>${h.ada ? `<td class="tr tnum c-ok">${h.tambah}</td><td class="tr tnum c-warn">${h.perbarui}</td><td class="tr tnum muted">${h.lewati}</td><td class="tr">${h.tambah || h.perbarui ? `<button class="btn btn-sm" data-act="migImpor" data-v="${esc(h.tabel)}" data-loading="…">Impor</button>` : ''}</td>` : '<td colspan="4" class="xs muted">tidak ada di sumber</td>'}</tr>`).join('')}</tbody></table></div>
      <button class="btn btn-p btn-block mt12" data-act="migSemua" data-loading="Mengimpor…">${ic('move_up')}Impor semua tabel berubah</button>`;
  }).catch(() => {});
}
async function migImpor(tabel, btn) {
  return denganTombol(btn, async () => { const r = await call('migrasiImpor', { sumber: S.mig.src, tabel }); toast(`${tabel}: +${r.tambah} baru, ${r.perbarui} diperbarui`, 'ok'); if (btn) btn.closest('td').innerHTML = `<span class="pill ok">${ic('check')}Selesai</span>`; });
}

/* ============================== 24. PROFIL & INSTALASI HP ============================== */
function rProfil() {
  const el = $('#v-profil'), me = S.me, pwa = S.cfg.pwaUrl || BOOT.pwa;
  el.innerHTML = `<div class="page-h"><div><h1>Profil Saya</h1><p>Data akun, preferensi notifikasi, dan instalasi aplikasi di HP</p></div><button class="btn btn-d btn-sm" data-act="logout">${ic('logout')}Keluar</button></div>
  <div class="grid c12" style="align-items:start">
    <div class="card s6 col gap12"><div class="flex center gap12"><span class="avatar" style="width:56px;height:56px;font-size:18px;background:${avBg(me.nama)}">${esc(inisial(me.nama))}</span><div><div class="ff-h fw6" style="font-size:18px">${esc(me.nama)}</div><div class="small muted">${esc(me.email)}</div><div class="flex gap6 wrap mt4"><span class="pill pri">${esc(ROLE_LBL[me.role])}</span><span class="chip">${esc(divisiNama(me.divisi))}</span>${me.jabatanTtd ? `<span class="chip mono">${esc(me.jabatanTtd)}</span>` : ''}</div></div></div>
      <div class="divider"></div>
      <div class="fld"><label class="lbl" for="pfNama">Nama tampilan</label><input class="inp" id="pfNama" value="${esc(me.nama)}"></div>
      <div class="fld"><label class="lbl" for="pfWa">No. WhatsApp</label><input class="inp" id="pfWa" inputmode="tel" value="${esc(me.noWa || '')}" placeholder="0812xxxxxxxx"><span class="hint">Untuk notifikasi pengajuan & tanda tangan.</span></div>
      <label class="flex center gap8 small"><span class="sw"><input type="checkbox" id="pfOpt" ${me.optOut ? 'checked' : ''}><span></span></span>Berhenti menerima notifikasi WhatsApp (opt-out)</label>
      <div class="flex jend"><button class="btn btn-p" data-act="simpanProfil" data-loading="Menyimpan…">${ic('save')}Simpan Profil</button></div>
      <div class="divider"></div>
      <div class="flex between center"><span class="small fw5">Mode tampilan</span><div class="theme-seg"><button data-act="tema" data-v="dark" class="${document.documentElement.dataset.theme === 'dark' ? 'on' : ''}" aria-label="Gelap">${ic('dark_mode', 's16')}</button><button data-act="tema" data-v="light" class="${document.documentElement.dataset.theme === 'light' ? 'on' : ''}" aria-label="Terang">${ic('light_mode', 's16')}</button></div></div></div>
    <div class="card s6"><div class="card-h"><div class="flex center gap8"><span class="ic-tile ok">${ic('install_mobile')}</span><div><div class="h-title">Pasang di HP (PWA)</div><div class="h-sub">Ikon di layar utama, layar penuh tanpa bilah browser</div></div></div></div>
      ${pwa ? `<div class="flex gap16 wrap center"><div class="qr-wrap" style="width:140px;height:140px" data-qr="${esc(pwa)}"></div><div class="grow" style="min-width:200px"><div class="small">Pindai QR ini dengan kamera HP, atau buka tautan:</div><div class="mono xs c-pri mt4" style="word-break:break-all">${esc(pwa)}</div><button class="btn btn-sm mt8" data-act="salin" data-v="${esc(pwa)}">${ic('content_copy')}Salin tautan</button></div></div>` : `<div class="alert warn">${ic('info')}<div>Super Admin belum mengisi <b>URL PWA</b> di Pengaturan Umum. Sementara itu Anda tetap dapat menambahkan halaman ini ke layar utama dari menu browser.</div></div>`}
      <div class="flex gap8 mt12"><button class="btn btn-p" data-act="pasangApp">${ic('download')}Pasang aplikasi sekarang</button></div><div class="col gap8 mt16 small"><div class="list-it">${ic('android', 'c-ok')}<div><b>Android (Chrome)</b><div class="xs muted">Buka tautan → ketuk “Pasang aplikasi” atau menu ⋮ → <i>Tambahkan ke layar utama</i>.</div></div></div><div class="list-it">${ic('phone_iphone', 'muted')}<div><b>iPhone (Safari)</b><div class="xs muted">Buka tautan → tombol Bagikan → <i>Tambah ke Layar Utama</i>.</div></div></div></div></div>
  </div>`;
  hydrateQR(el);
}

/* ============================== 25. AKSI (event delegation) ============================== */
const ACT = {
  pasangApp: () => pasangAplikasi(),
  go: t => go(t.dataset.view, t.dataset.tab ? { tab: t.dataset.tab } : {}),
  drawer: () => bukaDrawer(),
  tema: t => terapkanTema(t.dataset.v),
  logout: (t, e) => { e.stopPropagation(); keluar(); },
  buatBaru: () => go('buat', { baru: 1 }),
  bukaDok: t => { tutupPopover(); const g = $('#gSearch'); if (g) g.value = ''; const m = modalStack[modalStack.length - 1]; if (m && t.closest('.mdl-bg')) m.tutup(); go('detail', { no: t.dataset.no }); },
  kembali: () => kembali(),
  notif: (t, e) => { e.stopPropagation(); bukaNotif(); },
  searchM: () => {
    const m = modal({ judul: 'Cari dokumen', ikon: 'search', isi: `<input class="inp" id="mCari" placeholder="Nomor, perihal, pemohon…" autocomplete="off"><div id="mCariRes" class="col gap6 mt12"></div>` });
    const inp = m.el.querySelector('#mCari');
    inp.addEventListener('input', debounce(() => { m.el.querySelector('#mCariRes').innerHTML = cariDok(inp.value, 15).map(d => `<div class="list-it click" data-act="bukaDok" data-no="${esc(d.no)}"><div class="grow" style="min-width:0"><div class="small fw6 truncate">${esc(d.no)}</div><div class="xs muted truncate">${esc(d.judul)}</div></div>${pillStatus(d)}</div>`).join('') || (inp.value ? '<div class="small muted">Tidak ditemukan.</div>' : ''); }, 120));
  },
  authKe: t => tampilAuth(t.dataset.step),
  muatUlang: () => init(),
  periode: t => { S.period = t.dataset.v; rDashboard(); },
  distTab: t => { S.distTab = t.dataset.v; $$('[data-act=distTab]').forEach(b => b.classList.toggle('on', b === t)); $('#distBody').innerHTML = distribusi(S.distTab); },
  listTab: t => { S.list.tab = t.dataset.v; S.list.page = 1; rDaftar(); },
  sortList: t => { const k = t.dataset.k; if (S.list.sort === k) S.list.dir *= -1; else { S.list.sort = k; S.list.dir = k === 'no' || k === 'pemohonNama' || k === 'jenis' ? 1 : -1; } rDaftar(); },
  hal: t => { S.list.page = Number(t.dataset.v); isiDaftar(); $('#daftarIsi').scrollIntoView({ block: 'start', behavior: 'smooth' }); },
  eksporRekap: t => denganTombol(t, () => { const per = {}; S.docs.forEach(d => { const k = (jenisBy(d.jenis) || {}).Nama || d.jenis; per[k] = per[k] || { Jenis: k, Total: 0, Selesai: 0, Proses: 0, 'Ditolak/Batal': 0 }; per[k].Total++; if (d.status === ST.SELESAI) per[k].Selesai++; else if (ST_GAGAL.includes(d.status)) per[k]['Ditolak/Batal']++; else per[k].Proses++; }); return eksporXlsx([['Rekap Dokumen', barisEkspor(S.docs)], ['Per Jenis', Object.values(per)]], 'Rekap_SIMA_' + new Date().toISOString().slice(0, 10) + '.xlsx'); }).catch(() => {}),
  eksporDaftar: t => denganTombol(t, () => { const rows = barisEkspor(filterDaftar()); const nama = 'Daftar_Pengajuan_' + new Date().toISOString().slice(0, 10); if (t.dataset.f === 'xlsx') return eksporXlsx([['Daftar Pengajuan', rows]], nama + '.xlsx'); const kol = ['No. Dokumen', 'Tanggal Dibuat', 'Jenis', 'Perihal', 'Pemohon', 'Divisi', 'Nominal', 'Status', 'Lead Time']; return eksporPdf('Daftar Pengajuan Dokumen', kol, rows.map(r => kol.map(k => k === 'Nominal' && r[k] ? rp(r[k]) : String(r[k] || ''))), nama + '.pdf'); }).catch(() => {}),
  eksporLaporan: t => denganTombol(t, () => { const L = S.lapData; const ring = L.ringkas.map(r => ({ Jenis: r.nama, Total: r.total, Selesai: r.selesai, 'Ditolak/Batal': r.gagal, 'Rasio Tolak (%)': r.rasio, 'Rata Lead Time': r.rata ? durasi(r.rata) : '-', 'Target (hari)': r.target, 'Tepat Waktu (%)': r.tepat === null ? '-' : r.tepat })); const nama = 'Laporan_SIMA_' + S.lap.tahun; if (t.dataset.f === 'xlsx') return eksporXlsx([['Ringkasan', ring], ['Detail', barisEkspor(L.docs)]], nama + '.xlsx'); return eksporPdf('Laporan Administrasi ' + S.lap.tahun, Object.keys(ring[0] || { Jenis: 1 }), ring.map(r => Object.values(r).map(String)), nama + '.pdf'); }).catch(() => {}),
  keKartu: t => { const k = $('#kartu' + t.dataset.v); if (k) k.scrollIntoView({ behavior: 'smooth', block: 'start' }); },
  simpanForm: t => simpanForm(false, t),
  kirimForm: t => simpanForm(true, t),
  pratinjauForm: t => { if (!S.form.no) return; denganTombol(t, async () => pratinjauBerkas(await call('pratinjau', { no: S.form.no }))).catch(() => {}); },
  buangFileLokal: t => { S.form.files = S.form.files.filter(f => f.lid !== t.dataset.id); renderFileList(); },
  hapusLampiranForm: async t => {
    const F = S.form, it = F.lampiran.find(l => l.ID === t.dataset.id);
    if (!it || !(await konfirmasi({ judul: 'Hapus lampiran?', pesan: esc(it.Nama_File) + ' akan dipindahkan ke sampah Drive.', okTeks: 'Hapus', bahaya: true, ikon: 'delete' }))) return;
    F.lampiran = F.lampiran.filter(l => l !== it); renderFileList();
    call('hapusLampiran', { no: F.no, id: it.ID }, { silent: true }).then(() => { delete S.det[F.no]; toast('Lampiran dihapus', 'ok', 1800); }).catch(e => { F.lampiran.push(it); renderFileList(); toast(e.message, 'bad'); });
  },
  lihatLampiran: t => denganTombol(null, async () => pratinjauBerkas(await call('ambilBerkas', { no: t.dataset.no, id: t.dataset.id }))).catch(() => {}),
  unduhPdf: t => denganTombol(t, async () => { const f = await call('ambilBerkas', { no: t.dataset.no, jenis: 'pdf' }); unduhBlob(b64ToBlob(f.b64, f.mime), f.nama); }).catch(() => {}),
  pratinjauPdf: t => denganTombol(t, async () => pratinjauBerkas(await call('pratinjau', { no: t.dataset.no }))).catch(() => {}),
  editDok: t => go('buat', { no: t.dataset.no }),
  alasanDok: t => alasanDok(t.dataset.k, t.dataset.no),
  penggantiDok: async t => { if (!(await konfirmasi({ judul: 'Buat dokumen pengganti?', pesan: 'Draft baru bernomor baru dibuat dengan isian yang sama dan terhubung ke <span class="mono">' + esc(t.dataset.no) + '</span>. Anda dapat merevisinya sebelum diajukan.', okTeks: 'Buat Pengganti', ikon: 'autorenew' }))) return; denganTombol(t, async () => { const r = await call('pengganti', { no: t.dataset.no }); upsertDoc(r.lama); upsertDoc(r.doc); delete S.det[t.dataset.no]; toast('Pengganti ' + r.no + ' dibuat', 'ok'); S.form = null; go('buat', { no: r.no }); }).catch(() => {}); },
  kirimDok: async t => { if (!(await konfirmasi({ judul: 'Ajukan ke Admin Divisi?', pesan: 'Admin Divisi akan menerima notifikasi WhatsApp.', okTeks: 'Ajukan', ikon: 'send' }))) return; denganTombol(t, async () => { const r = await call('kirim', { no: t.dataset.no }); upsertDoc(r.doc); delete S.det[t.dataset.no]; toast('Dokumen diajukan', 'ok'); rDetail({ no: t.dataset.no }); }).catch(() => {}); },
  ttdDok: t => ttdDok(t.dataset.no),
  detTab: t => { S.detTab = t.dataset.v; const no = S.params.no; $$('[data-act=detTab]').forEach(b => b.classList.toggle('on', b === t)); const box = $('#detTabIsi'); if (box && S.det[no]) { box.innerHTML = tabDetail(S.docs.find(d => d.no === no), S.det[no]); hydrateQR(box); } },
  salin: t => salin(t.dataset.v),
  simpanAnalisa: t => simpanAnalisa(t.dataset.no),
  eksporAudit: t => eksporAudit(t.dataset.no),
  cekTtd: t => cekTtd(t.dataset.v),
  scanMulai: t => mulaiKamera(t),
  panduanBuka: t => bukaPanduan(t.dataset.id),
  panduanEdit: t => editPanduan(t.dataset.id),
  panduanHapus: async t => { if (!(await konfirmasi({ judul: 'Hapus panduan?', pesan: 'Panduan dihapus permanen.', okTeks: 'Hapus', bahaya: true, ikon: 'delete' }))) return; try { const r = await call('hapusPanduan', { id: t.dataset.id }); terapkanCfg(r.cfg); rPanduan(); toast('Panduan dihapus', 'ok'); } catch (e) { toast(e.message, 'bad'); } },
  jenisPilih: t => { S.setJenis.kode = t.dataset.v; S.setJenis.tab = 'umum'; S.setJenis.untuk = null; rSetJenis(); },
  jenisTab: t => { S.setJenis.tab = t.dataset.v; rSetJenis(); },
  sisipToken: t => { const i = $('#jPola'); const p = i.selectionStart || i.value.length; i.value = i.value.slice(0, p) + t.dataset.v + i.value.slice(i.selectionEnd || p); i.focus(); },
  cekTemplat: async t => { const id = $('#jTpl').value.trim(); try { const r = await denganTombol(t, () => call('templatInfo', { id })); modal({ judul: r.nama, ikon: 'description', isi: `<div class="small mb8">Placeholder ditemukan (${r.placeholder.length}):</div><div class="flex gap6 wrap">${r.placeholder.map(p => `<span class="chip mono">{{${esc(p)}}}</span>`).join('') || '<span class="muted">Tidak ada</span>'}</div><a class="btn btn-sm mt16" href="${esc(r.url)}" target="_blank" rel="noopener">${ic('open_in_new')}Buka templat</a>` }); } catch (e) { /* toast */ } },
  simpanJenis: t => denganTombol(t, async () => {
    const d = { Kode: $('#jKode').value.trim().toUpperCase(), Nama: $('#jNama').value, Deskripsi: $('#jDesk').value, Pola_Nomor: $('#jPola').value, Reset_Nomor: $('#jReset').value, Lead_Time_Hari: $('#jLT').value, Urutan: $('#jUrut').value, ID_Templat: $('#jTpl').value, Ikon: $('#jIkon').value, Warna: $('#jWarna').value, Aktif: $('#jAktif').checked ? 'YA' : 'TIDAK', Notifikasi_Aktif: $('#jNotif').checked ? 'YA' : 'TIDAK' };
    const r = await call('simpanJenis', d); terapkanCfg(r.cfg); S.setJenis.kode = r.jenis.Kode; S.setJenis.untuk = null; toast('Jenis administrasi tersimpan', 'ok'); rSetJenis();
  }).catch(() => {}),
  syaratTambah: () => { S.setJenis.syarat.push({ Label: '', Nama_Isian: '', Tipe_Isian: 'teks', Wajib: 'YA', Kondisi: '', Opsi: '', Petunjuk: '' }); $('#jenisBody').innerHTML = formSyarat(); },
  syaratHapus: t => { S.setJenis.syarat.splice(Number(t.dataset.i), 1); $('#jenisBody').innerHTML = formSyarat(); },
  syaratGeser: t => { const a = S.setJenis.syarat, i = Number(t.dataset.i), j = i + Number(t.dataset.d); [a[i], a[j]] = [a[j], a[i]]; $('#jenisBody').innerHTML = formSyarat(); },
  simpanSyarat: t => denganTombol(t, async () => { const r = await call('simpanSyarat', { kodeJenis: S.setJenis.kode, list: S.setJenis.syarat }); terapkanCfg(r.cfg); S.setJenis.untuk = null; toast('Persyaratan tersimpan', 'ok'); rSetJenis(); }).catch(() => {}),
  aturanTambah: () => { S.setJenis.aturan.push({ Kondisi: '', Nama_Format: '', Kode_Format: '', ID_Templat: '' }); $('#jenisBody').innerHTML = formAturan(); },
  aturanHapus: t => { S.setJenis.aturan.splice(Number(t.dataset.i), 1); $('#jenisBody').innerHTML = formAturan(); },
  aturanGeser: t => { const a = S.setJenis.aturan, i = Number(t.dataset.i), j = i + Number(t.dataset.d); [a[i], a[j]] = [a[j], a[i]]; $('#jenisBody').innerHTML = formAturan(); },
  simpanAturan: t => denganTombol(t, async () => { const r = await call('simpanAturan', { kodeJenis: S.setJenis.kode, list: S.setJenis.aturan }); terapkanCfg(r.cfg); S.setJenis.untuk = null; toast('Format dokumen tersimpan', 'ok'); rSetJenis(); }).catch(() => {}),
  alurTambah: () => { S.setAlur.list.push({ Role_Penanda_Tangan: (S.cfg.jabatanTtd || [])[1] || 'MANAJER', Label_Jabatan: '', Lingkup: 'DIVISI', Kondisi_Pemicu: '' }); rSetAlur(); },
  alurHapus: t => { S.setAlur.list.splice(Number(t.dataset.i), 1); rSetAlur(); },
  alurGeser: t => { const a = S.setAlur.list, i = Number(t.dataset.i), j = i + Number(t.dataset.d); if (j < 1) return; [a[i], a[j]] = [a[j], a[i]]; rSetAlur(); },
  simpanAlur: t => denganTombol(t, async () => { const r = await call('simpanAlur', { kodeJenis: S.setAlur.kode, list: S.setAlur.list }); terapkanCfg(r.cfg); S.setAlur.untuk = null; toast('Alur penandatangan tersimpan', 'ok'); rSetAlur(); }).catch(() => {}),
  akunTab: t => { S.setAkun = t.dataset.v; rSetAkun(); },
  aksesSetuju: t => prosesAkses(t.dataset.id, true, t),
  aksesTolak: t => prosesAkses(t.dataset.id, false, t),
  penggunaEdit: t => editPengguna(t.dataset.v),
  divisiEdit: t => editDivisi(t.dataset.v),
  waMuat: () => rSetWa(true),
  waSimpan: t => denganTombol(t, async () => { S.waSt = await call('waSimpan', { token: $('#waTok').value.trim() || undefined, aktif: $('#waAktif').checked, jendela: $('#waJendela').value, grup: $('#waGrupIn').value, salam: $('#waSalam').value }); toast('Pengaturan WhatsApp tersimpan', 'ok'); rSetWa(); }).catch(() => {}),
  waHapusToken: async () => { if (!(await konfirmasi({ judul: 'Hapus token Fonnte?', pesan: 'Notifikasi WhatsApp akan berhenti.', okTeks: 'Hapus', bahaya: true, ikon: 'key_off' }))) return; try { S.waSt = await call('waSimpan', { hapusToken: true }); rSetWa(); } catch (e) { toast(e.message, 'bad'); } },
  waSimpanJenis: t => denganTombol(t, async () => { const list = $$('[data-wj]').map(tr => ({ Kode_Jenis: tr.dataset.wj, ID_Grup: tr.querySelector('[data-wf=ID_Grup]').value, Nomor_Tambahan: tr.querySelector('[data-wf=Nomor_Tambahan]').value, Aktif: tr.querySelector('[data-wf=Aktif]').checked ? 'YA' : 'TIDAK' })); S.waSt = await call('waSimpan', { perJenis: list }); S.wa = list; toast('Grup per jenis tersimpan', 'ok'); }).catch(() => {}),
  waTes: t => denganTombol(t, async () => { await call('waTes', { tujuan: $('#waTes').value }); toast('Pesan tes terkirim', 'ok'); }).catch(() => {}),
  waProses: t => denganTombol(t, async () => { S.waSt = await call('waProses'); const h = S.waSt.hasil || {}; toast(`Terkirim ${h.terkirim || 0}, gagal ${h.gagal || 0}, menunggu ${h.menunggu || 0}`, 'ok'); rSetWa(); }).catch(() => {}),
  waValidasi: t => denganTombol(t, async () => { const r = await call('waValidasi'); toast(`${r.diperbarui} dari ${r.diperiksa} nomor diperbarui`, 'ok'); const b = await call('boot', {}, { silent: true }); terapkanData(b, true); }).catch(() => {}),
  waGrup: async t => { try { const r = await denganTombol(t, () => call('waGrup')); const m = modal({ judul: 'Pilih grup WhatsApp', ikon: 'groups', isi: `<div class="col gap6">${r.grup.map(g => `<button class="list-it click" data-pilihgrup="${esc(g.id)}" style="text-align:left;width:100%">${ic('groups', 'c-ok')}<div class="grow" style="min-width:0"><div class="small fw5">${esc(g.nama)}</div><div class="xs mono muted truncate">${esc(g.id)}</div></div></button>`).join('') || kosong('groups', 'Tidak ada grup', 'Pastikan perangkat Fonnte tergabung di grup.')}</div>` }); m.el.addEventListener('click', e => { const b = e.target.closest('[data-pilihgrup]'); if (b) { $('#waGrupIn').value = b.dataset.pilihgrup; m.tutup(); } }); } catch (e) { /* toast */ } },
  simpanUmum: t => denganTombol(t, async () => { const map = {}; $$('[data-set]').forEach(i => { map[i.dataset.set] = i.value; }); const r = await call('simpanPengaturan', { map }); terapkanCfg(r.cfg); const b = await call('boot', {}, { silent: true }); terapkanData(b, true); simpanCache(); renderShell(); toast('Pengaturan tersimpan', 'ok'); }).catch(() => {}),
  muatSistem: t => muatSistem(t),
  sysAksi: t => denganTombol(t, async () => { const r = await call(t.dataset.v); toast(t.dataset.v === 'sinkronSkema' ? 'Skema: ' + ((r.laporan || []).join('; ') || 'sudah terbaru') : 'Selesai', 'ok', 5000); }).catch(() => {}),
  migPindai: t => migPindai(t),
  migImpor: t => migImpor(t.dataset.v, t).catch(() => {}),
  migSemua: t => denganTombol(t, async () => { for (const h of S.mig.hasil.filter(x => x.ada && (x.tambah || x.perbarui))) { const r = await call('migrasiImpor', { sumber: S.mig.src, tabel: h.tabel }); toast(`${h.tabel}: +${r.tambah} / ${r.perbarui} diperbarui`, 'ok', 2000); } toast('Migrasi selesai — jalankan ulang Pindai untuk delta-sync sebelum cutover.', 'ok', 6000); }).catch(() => {}),
  simpanProfil: t => denganTombol(t, async () => { const r = await call('profil', { nama: $('#pfNama').value, noWa: $('#pfWa').value, optOut: $('#pfOpt').checked }); S.me = r.me; const u = userBy(S.me.email); if (u) Object.assign(u, { nama: r.me.nama, noWa: r.me.noWa, optOut: r.me.optOut }); simpanCache(); renderShell(); toast('Profil tersimpan', 'ok'); }).catch(() => {})
};

function pasangEvent() {
  document.addEventListener('click', e => {
    const t = e.target.closest('[data-act]');
    if (!e.target.closest('#notifPop') && !e.target.closest('[data-act=notif]') && !e.target.closest('#searchBox')) tutupPopover();
    if (!t) return;
    if (t.tagName === 'A' && t.getAttribute('target') === '_blank') return;
    if (t.tagName === 'LABEL') return;
    e.preventDefault();
    const f = ACT[t.dataset.act];
    if (f) f(t, e);
  });
  document.addEventListener('keydown', e => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-act][tabindex], tr[data-act]') && !/INPUT|TEXTAREA|SELECT|BUTTON/.test(e.target.tagName)) { e.preventDefault(); e.target.click(); }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); const g = $('#gSearch'); if (g && g.offsetParent) g.focus(); else if (S.me) ACT.searchM(); }
    if (e.key === 'Escape' && !modalStack.length) { bukaDrawer(false); tutupPopover(); }
    if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && S.me && !modalStack.length) { e.preventDefault(); const g = $('#gSearch'); if (g && g.offsetParent) g.focus(); }
  });
  const gs = $('#gSearch');
  gs.addEventListener('input', debounce(renderCari, 100));
  gs.addEventListener('focus', renderCari);
  gs.addEventListener('keydown', e => {
    const items = $$('#searchRes .it');
    let i = items.findIndex(x => x.classList.contains('on'));
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (!items.length) return; items.forEach(x => x.classList.remove('on')); i = (i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length; items[i].classList.add('on'); items[i].scrollIntoView({ block: 'nearest' }); }
    if (e.key === 'Enter' && items.length) { e.preventDefault(); (items[i] || items[0]).click(); gs.blur(); }
    if (e.key === 'Escape') { gs.value = ''; tutupPopover(); gs.blur(); }
  });
  document.addEventListener('input', e => {
    const t = e.target;
    if (t.id === 'fQ') { S.list.q = t.value; S.list.page = 1; debounceDaftar(); return; }
    if (t.id === 'uCari') { S.uCari = t.value; $('#uList').innerHTML = daftarPengguna(); return; }
    if (t.dataset.k && t.closest('#v-buat')) { onFormInput(t); return; }
    if (t.dataset.sy !== undefined) { const r = S.setJenis.syarat[Number(t.dataset.sy)]; r[t.dataset.f] = t.value; if (t.dataset.f === 'Kondisi') t.classList.toggle('bad', !kondisiValid(t.value)); if (t.dataset.f === 'Tipe_Isian') { const o = t.closest('.well').querySelector('[data-f=Opsi]'); if (o) o.classList.toggle('hidden', t.value !== 'pilihan'); } return; }
    if (t.dataset.fm !== undefined) { S.setJenis.aturan[Number(t.dataset.fm)][t.dataset.f] = t.value; if (t.dataset.f === 'Kondisi') t.classList.toggle('bad', !kondisiValid(t.value)); if ($('#simFm')) simulasiFormat(); return; }
    if (t.dataset.simfm !== undefined) { simulasiFormat(); return; }
    if (t.dataset.al !== undefined) { S.setAlur.list[Number(t.dataset.al)][t.dataset.f] = t.value; if (t.dataset.f === 'Kondisi_Pemicu') t.classList.toggle('bad', !kondisiValid(t.value)); simulasiAlur(); return; }
    if (t.dataset.simal !== undefined) { simulasiAlur(); return; }
    if (t.id === 'jPola') { const kode = ($('#jKode').value || 'XX').toUpperCase(); const d = new Date(); $('#jPrev').textContent = t.value.replace(/\{KODE\}|\{JENIS\}/g, kode).replace(/\{DIVISI\}/g, S.me.divisi || 'DIV').replace(/\{TAHUN\}/g, d.getFullYear()).replace(/\{TH\}/g, String(d.getFullYear()).slice(2)).replace(/\{BULAN_ROMAWI\}/g, ROMAWI[d.getMonth()]).replace(/\{BULAN\}/g, pad2(d.getMonth() + 1)).replace(/\{URUT5\}/g, '00001').replace(/\{URUT3\}/g, '001').replace(/\{URUT\}/g, '0001'); }
  });
  document.addEventListener('change', e => {
    const t = e.target;
    if (t.dataset.f && t.closest('#v-daftar')) { S.list[t.dataset.f] = t.value; S.list.page = 1; isiDaftar(); return; }
    if (t.dataset.kb) { S.kb[t.dataset.kb] = t.value; rKanban(); return; }
    if (t.dataset.lap) { S.lap[t.dataset.lap] = t.value; rLaporan(); return; }
    if (t.id === 'fJenis') { S.form.kodeJenis = t.value; S.form.errs = {}; renderForm(); simpanDraftLokal(); return; }
    if (t.id === 'fDivisi') { S.form.divisi = t.value; panelForm(); return; }
    if (t.id === 'fileIn') { tambahBerkas(t.files); t.value = ''; return; }
    if (t.id === 'scanFile') { if (t.files[0]) scanBerkas(t.files[0]); t.value = ''; return; }
    if (t.dataset.unggahDetail) { const no = t.dataset.unggahDetail; unggahDariDetail(no, t.files); t.value = ''; return; }
    if (t.hasAttribute('data-alurjenis')) { S.setAlur.kode = t.value; S.setAlur.untuk = null; rSetAlur(); return; }
    if (t.dataset.k && t.closest('#v-buat') && t.tagName === 'SELECT') onFormInput(t);
    if (t.dataset.sy !== undefined || t.dataset.al !== undefined || t.dataset.fm !== undefined) t.dispatchEvent(new Event('input', { bubbles: true }));
  });
  document.addEventListener('submit', e => {
    if (e.target.id === 'scanManual') { e.preventDefault(); const v = $('#scanKode').value.trim(); if (v) prosesScan(v); }
  });
  ['dragover', 'dragenter'].forEach(ev => document.addEventListener(ev, e => { const z = e.target.closest && e.target.closest('#dropZone'); if (z) { e.preventDefault(); z.classList.add('over'); } }));
  ['dragleave', 'drop'].forEach(ev => document.addEventListener(ev, e => { const z = e.target.closest && e.target.closest('#dropZone'); if (z) { e.preventDefault(); z.classList.remove('over'); if (ev === 'drop') tambahBerkas(e.dataTransfer.files); } }));
}
const debounceDaftar = debounce(() => { if ($('#daftarIsi')) isiDaftar(); }, 150);
function onFormInput(t) {
  const F = S.form;
  let v = t.value;
  if (t.hasAttribute('data-rp')) {
    const digits = v.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
    const pos = t.selectionStart, panjangLama = t.value.length;
    t.value = digits ? Number(digits).toLocaleString('id-ID') : '';
    try { const p = Math.max(0, pos + (t.value.length - panjangLama)); t.setSelectionRange(p, p); } catch (e) { /* abaikan */ }
    v = digits;
  }
  F.isian[t.dataset.k] = v;
  if (F.errs[t.dataset.k]) { delete F.errs[t.dataset.k]; const w = t.closest('[data-fld]'); if (w) { w.querySelector('.err-msg').classList.add('hidden'); t.classList.remove('bad'); t.removeAttribute('aria-invalid'); } }
  perbaruiKondisional();
  panelForm();
  simpanDraftLokal();
}
async function unggahDariDetail(no, files) {
  const det = S.det[no];
  const sebelum = S.form;
  S.form = Object.assign(formBaru(), { no, kodeJenis: det.doc.jenis, lampiran: det.lampiran.slice(), files: [] });
  try { await tambahBerkas(files); toast('Lampiran diunggah', 'ok'); }
  finally { S.form = sebelum; delete S.det[no]; rDetail({ no }); }
}

document.addEventListener('DOMContentLoaded', init);
