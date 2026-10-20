import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, getDocs, doc, setDoc, getDoc, updateDoc, query, where, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAuth, signInWithPopup, signInWithRedirect, getRedirectResult, GoogleAuthProvider, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getDatabase, ref, set, onDisconnect, onValue, serverTimestamp as rtdbServerTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

const firebaseConfig = {
    apiKey: "AIzaSyA2PVDpo4X3G8ok_Mk5MU1WeRUaxwIhEpg",
    authDomain: "app-diego-e0591.firebaseapp.com",
    projectId: "app-diego-e0591",
    storageBucket: "app-diego-e0591.firebasestorage.app",
    messagingSenderId: "69109305372",
    appId: "1:69109305372:web:5139a52f1342671c520fd9",
    measurementId: "G-P2J3HHKK2R"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const rtdb = getDatabase(app);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

const $ = (id) => document.getElementById(id);

// ==========================================
// INDICAÇÃO: guarda ?ref= do link que o amigo abriu
// ==========================================
try { const r = new URLSearchParams(location.search).get("ref"); if (r) localStorage.setItem("abastece_ref", r.replace(/[^\w-]/g, "").slice(0, 40)); } catch (e) {}
const refRecebido = () => { try { return localStorage.getItem("abastece_ref") || ""; } catch (e) { return ""; } };
const baseSite = () => location.origin + location.pathname.replace(/[^/]*$/, "");
const novoCodigo = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => "abcdefghjkmnpqrstuvwxyz23456789"[b % 31]).join("");

let dadosPerfil = { nome: "Promotor", cpf: "", cref: "", uid: "", status: "pendente", fotoUrl: null };
let agendaDeHoje = [];
let ganhosAvulsos = 0;
let mapaOfertas = null;
let dataCalendario = new Date();
let diaSelecionado = null;

// ==========================================
// UTILITÁRIOS
// ==========================================
function toast(msg) {
    let t = $("toast");
    if (!t) { t = document.createElement("div"); t.id = "toast"; document.body.appendChild(t); }
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.remove("show"), 3500);
}

function cpfValido(cpf) {
    cpf = (cpf || "").replace(/\D/g, "");
    if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
    for (let t = 9; t < 11; t++) {
        let soma = 0;
        for (let i = 0; i < t; i++) soma += parseInt(cpf[i]) * (t + 1 - i);
        const dig = ((soma * 10) % 11) % 10;
        if (dig !== parseInt(cpf[t])) return false;
    }
    return true;
}

function setLoading(on) {
    if ($("login-loader")) $("login-loader").style.display = on ? "block" : "none";
    if ($("btn-login")) $("btn-login").style.display = on ? "none" : "block";
}

function mensagemErroAuth(error) {
    switch (error.code) {
        case "auth/unauthorized-domain": return "Domínio não autorizado no Firebase.";
        case "auth/operation-not-allowed": return "Login com Google não está ativado no Firebase.";
        case "auth/popup-closed-by-user":
        case "auth/cancelled-popup-request": return null;
        case "auth/network-request-failed": return "Sem conexão com a internet.";
        default: return "Falha ao autenticar com o Google. (" + (error.code || "erro") + ")";
    }
}

// ==========================================
// STATUS "ONLINE DE VERDADE" (PRESENÇA RTDB)
// ==========================================
function monitorarPresencaOnline(promotorId) {
    if (!promotorId) return;
    const statusRef = ref(rtdb, `presenca/${promotorId}`);
    const conexaoRef = ref(rtdb, '.info/connected');

    onValue(conexaoRef, (snapshot) => {
        if (snapshot.val() === false) return;
        onDisconnect(statusRef).set({
            online: false,
            ultimaVez: rtdbServerTimestamp()
        });
        set(statusRef, {
            online: true,
            ultimaVez: rtdbServerTimestamp()
        });
    });
}

// ==========================================
// CÁLCULO DE DISTÂNCIA REAL EM QUILÔMETROS (KM)
// ==========================================
function calcularDistanciaKm(lat1, lon1, lat2, lon2) {
    if (window.google && google.maps && google.maps.geometry) {
        const pontoA = new google.maps.LatLng(lat1, lon1);
        const pontoB = new google.maps.LatLng(lat2, lon2);
        const metros = google.maps.geometry.spherical.computeDistanceBetween(pontoA, pontoB);
        return (metros / 1000).toFixed(1);
    }
    const R = 6371; 
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return (R * c).toFixed(1);
}

// ==========================================
// TERMOS
// ==========================================
function validarCheckTermos() {
    const chk = $("check-termos");
    const ok = chk ? chk.checked : false;
    const btn = $("btn-login");
    if (btn) {
        btn.disabled = !ok;
        btn.style.opacity = ok ? "1" : "0.5";
        btn.style.cursor = ok ? "pointer" : "not-allowed";
    }
}
function abrirModalTermos() { if ($("modal-termos")) $("modal-termos").classList.add("active"); }
function aceitarTermosModal() {
    if ($("check-termos")) $("check-termos").checked = true;
    validarCheckTermos();
    if ($("modal-termos")) $("modal-termos").classList.remove("active");
}

// ==========================================
// LOGIN POR CPF
// ==========================================
async function validarProfissional() {
    const nome = $("input-nome").value.trim();
    const cpf = $("input-cpf").value.replace(/\D/g, "");
    const cref = $("input-cref").value.trim();
    const lembreme = $("check-remember").checked;

    if (!nome || !cpf) { toast("Preencha nome e CPF."); return; }
    if (!cpfValido(cpf)) { toast("CPF inválido. Confira os 11 dígitos."); return; }

    setLoading(true);
    let status = "pendente";
    try {
        const docRef = doc(db, "profissionais", cpf);
        const snap = await getDoc(docRef);
        if (snap.exists()) {
            status = snap.data().status || "pendente";
            if (status === "bloqueado") { toast("❌ Acesso não liberado para este CPF."); setLoading(false); return; }
        } else {
            await setDoc(docRef, { nome, cpf, cref, status: "pendente", indicadoPor: refRecebido(), criadoEm: serverTimestamp() });
        }
    } catch (e) {
        console.error("Firestore:", e);
        toast("Sem acesso ao banco agora. Entrando em modo offline.");
    }
    setLoading(false);
    finalizarLogin({ lembreme, nome, cpf, cref, status });
}

// ==========================================
// LOGIN GOOGLE
// ==========================================
async function acharProfissionalPorEmail(email) {
    const q = query(collection(db, "profissionais"), where("email", "==", email));
    const snap = await getDocs(q);
    return snap.empty ? null : snap.docs[0].data();
}

async function loginComGoogle() {
    const chk = $("check-termos");
    if (chk && !chk.checked) { 
        toast("Aceite os Termos de Uso para continuar."); 
        return; 
    }
    try {
        const { user } = await signInWithPopup(auth, googleProvider);
        await processarUsuarioGoogle(user, true);
    } catch (error) {
        if (error.code === "auth/popup-blocked") {
            try { await signInWithRedirect(auth, googleProvider); return; } catch (e) { error = e; }
        }
        console.error(error);
        const msg = mensagemErroAuth(error);
        if (msg) toast(msg);
    }
}

async function processarUsuarioGoogle(user, interativo) {
    dadosPerfil.uid = user.uid;
    dadosPerfil.fotoUrl = user.photoURL;

    let prof = null;
    let erroBanco = false;
    try { prof = await acharProfissionalPorEmail(user.email); }
    catch (e) { erroBanco = true; console.error("Firestore:", e); }

    if (prof) {
        if (prof.status === "bloqueado") { toast("❌ Acesso não liberado para este e-mail."); return; }
        finalizarLogin({ lembreme: false, nome: prof.nome || user.displayName, cpf: prof.cpf || "", cref: prof.cref || "", status: prof.status || "pendente" });
        return;
    }
    if (!interativo) return;

    if (!erroBanco) {
        try {
            await setDoc(doc(db, "profissionais", user.uid), {
                nome: user.displayName || "", email: user.email, uid: user.uid, cpf: "", cref: "",
                fotoGoogle: user.photoURL || "", status: "pendente", indicadoPor: refRecebido(), criadoEm: serverTimestamp()
            });
        } catch (e) {
            erroBanco = true;
            console.error("Firestore:", e);
        }
    }
    finalizarLogin({ lembreme: false, nome: user.displayName || user.email, cpf: "", cref: "", status: "pendente" });
}

onAuthStateChanged(auth, (user) => { if (user) processarUsuarioGoogle(user, false); });
getRedirectResult(auth).then((r) => { if (r && r.user) processarUsuarioGoogle(r.user, true); }).catch((e) => {
    const msg = mensagemErroAuth(e); if (msg) toast(msg);
});

// ==========================================
// SESSÃO / DASHBOARD
// ==========================================
window.addEventListener("DOMContentLoaded", () => {
    if (refRecebido() && $("login-sub")) $("login-sub").textContent = "🎁 Você foi convidado. Cadastre-se e faça seu primeiro turno!";
    try {
        const salvo = JSON.parse(localStorage.getItem("abastece_ja_promotor") || "null");
        if (salvo && $("input-nome")) { $("input-nome").value = salvo.nome || ""; if ($("check-remember")) $("check-remember").checked = true; }
    } catch (e) {}
});

function finalizarLogin({ lembreme, nome, cpf, cref, status }) {
    dadosPerfil = { ...dadosPerfil, nome: nome || "Promotor", cpf, cref, status };

    try {
        if (lembreme) localStorage.setItem("abastece_ja_promotor", JSON.stringify({ nome }));
        else localStorage.removeItem("abastece_ja_promotor");
    } catch (e) {}

    monitorarPresencaOnline(cpf || dadosPerfil.uid);

    atualizarExibicaoPerfil();
    garantirLinkIndicacao();
    const aprovado = status === "ativo";
    const analise = $("card-status-analise");
    if (analise) analise.style.display = aprovado ? "none" : "block";

    if ($("screen-login-personal")) $("screen-login-personal").classList.remove("active");
    if ($("screen-dashboard")) $("screen-dashboard").classList.add("active");
    carregarAgendaDoBanco();
    renderizarCalendario();
    renderizarOfertas();
}

async function garantirLinkIndicacao() {
    const input = $("input-link-indicacao");
    const chave = dadosPerfil.cpf || dadosPerfil.uid;
    if (!input || !chave) return;
    try {
        const docRef = doc(db, "profissionais", chave);
        const snap = await getDoc(docRef);
        let codigo = snap.exists() ? snap.data().refCode : "";
        if (!codigo) { codigo = novoCodigo(); await setDoc(docRef, { refCode: codigo }, { merge: true }); }
        input.value = `${baseSite()}promotor.html?ref=${codigo}`;
    } catch (e) { input.value = `${baseSite()}promotor.html`; }
}

async function sairModoPessoal() {
    if (!confirm("Deseja realmente sair do portal?")) return;
    try { await signOut(auth); } catch (e) {}
    if ($("screen-dashboard")) $("screen-dashboard").classList.remove("active");
    if ($("screen-login-personal")) $("screen-login-personal").classList.add("active");
}

function atualizarExibicaoPerfil() {
    const inicial = (dadosPerfil.nome || "P").charAt(0).toUpperCase();
    if ($("perfil-nome-display")) $("perfil-nome-display").innerText = dadosPerfil.nome;
    if ($("perfil-cref-display")) $("perfil-cref-display").innerText = dadosPerfil.status === "ativo" ? "Status: Ativo ✓" : "Status: Em análise";
    if ($("initials-perfil")) $("initials-perfil").innerText = inicial;
    if (dadosPerfil.fotoUrl && $("img-perfil-preview")) {
        const img = $("img-perfil-preview");
        img.src = dadosPerfil.fotoUrl;
        img.style.display = "block";
        if ($("initials-perfil")) $("initials-perfil").style.display = "none";
    }
    if ($("perfil-input-nome")) $("perfil-input-nome").value = dadosPerfil.nome;
    if ($("perfil-input-cpf") && dadosPerfil.cpf) $("perfil-input-cpf").value = dadosPerfil.cpf;
}

// ==========================================
// NAVEGAÇÃO
// ==========================================
function switchTabPersonal(tabId, navElement) {
    document.querySelectorAll("#screen-dashboard .tab-content").forEach((t) => t.classList.remove("active"));
    const tab = $(tabId);
    if (tab) tab.classList.add("active");
    document.querySelectorAll("#nav-personal .nav-item").forEach((i) => i.classList.remove("active"));
    if (navElement) navElement.classList.add("active");
    window.scrollTo(0, 0);
    if (tabId === "tab-ofertas") initMapAlunos();
}

const SUBTELAS = {
    "Perfil": "subscreen-perfil-detalhes",
    "Dados bancários": "subscreen-dados-bancarios",
    "Preferências de Atendimento": "subscreen-preferencias-atendimento",
    "Convidar Amigos": "subscreen-indicar-amigo",
    "Notificações": "subscreen-notificacoes",
    "Ajuda": "subscreen-ajuda"
};
function abrirOpcaoMenu(nome) {
    const id = SUBTELAS[nome];
    if (id && $(id))$(id).style.display = "block";
}
function fecharSubtela(id) { if ($(id))$(id).style.display = "none"; }

// ==========================================
// PERFIL / BANCO / PREFERÊNCIAS
// ==========================================
async function salvarMerge(dados) {
    const chave = dadosPerfil.cpf || dadosPerfil.uid;
    if (!chave) { toast("Faça login para salvar."); return; }
    await setDoc(doc(db, "profissionais", chave), { ...dados, atualizadoEm: serverTimestamp() }, { merge: true });
}

async function salvarPerfilProfissionalCompleto() {
    try {
        await salvarMerge({
            nome: $("perfil-input-nome").value.trim(),
            nascimento: $("perfil-input-nascimento").value,
            cidade: $("perfil-input-naturalidade").value.trim(),
            bio: $("personal-input-bio").value.trim()
        });
        dadosPerfil.nome = $("perfil-input-nome").value.trim() || dadosPerfil.nome;
        atualizarExibicaoPerfil();
        toast("✅ Perfil salvo!");
        fecharSubtela("subscreen-perfil-detalhes");
    } catch (e) { toast("Não foi possível salvar o perfil."); }
}

async function salvarDadosBancarios() {
    const agencia = $("bank-input-agencia").value.trim();
    const conta = $("bank-input-conta").value.trim();
    const pix = $("bank-input-chave-pix").value.trim();
    if (!pix && !(agencia && conta)) { toast("Informe a chave PIX ou agência e conta."); return; }
    try {
        await salvarMerge({
            banco: { banco: $("bank-select-banco").value, tipo: $("bank-select-tipo-conta").value, agencia, conta, digito: $("bank-input-digito").value.trim() },
            pix: { tipo: $("bank-select-tipo-pix").value, chave: pix }
        });
        toast("✅ Dados bancários salvos!");
        fecharSubtela("subscreen-dados-bancarios");
    } catch (e) { toast("Não foi possível salvar os dados bancários."); }
}

function atualizarFotoPerfil(event) {
    const file = event.target.files[0];
    if (!file) return;
    const r = new FileReader();
    r.onload = (e) => { dadosPerfil.fotoUrl = e.target.result; atualizarExibicaoPerfil(); };
    r.readAsDataURL(file);
}

// ==========================================
// AGENDA / CALENDÁRIO
// ==========================================
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmtBRL = (v) => (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtData = (d) => (d ? d.split("-").reverse().join("/") : "");
const chavePromotor = () => dadosPerfil.cpf || dadosPerfil.uid;
let valorMinimo = 0;

async function carregarAgendaDoBanco() {
    agendaDeHoje = [];
    try {
        const chave = chavePromotor();
        if (chave) {
            const snap = await getDocs(query(collection(db, "solicitacoes"), where("promotorChave", "==", chave)));
            agendaDeHoje = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => `${a.data}${a.entrada}`.localeCompare(`${b.data}${b.entrada}`));
        }
    } catch (e) { console.warn("Agenda:", e.code); }
    ganhosAvulsos = agendaDeHoje.filter((x) => x.status === "concluida").reduce((t, x) => t + x.valor * 0.85, 0);
    atualizarFinanceiro();
    renderizarAgenda();
}

function estadoVazio(icone, titulo, texto) {
    return `<div class="empty-state" style="text-align:center; padding:30px;"><div style="font-size:36px; margin-bottom:10px;">${icone}</div><h4 style="color:#fff; margin-bottom:5px;">${titulo}</h4><p style="color:var(--text-muted); font-size:12px;">${texto}</p></div>`;
}

function renderizarAgenda() {
    atualizarProximaReposicao();
    const lista = $("lista-agenda"), resumo = $("lista-agenda-resumo");
    if (!lista && !resumo) return;
    if (!agendaDeHoje.length) {
        const v = estadoVazio("📅", "Nenhum turno por aqui", "Os turnos que você aceitar nas Ofertas aparecem neste espaço.");
        if (lista) lista.innerHTML = v;
        if (resumo) resumo.innerHTML = v;
        return;
    }
    const card = (x, acao) => `<div class="glass agenda-slot" style="padding:15px; border-radius:16px; margin-bottom:10px; display:flex; justify-content:space-between; align-items:center;">
        <div><div style="font-weight:bold; color:#fff; font-size:14px;">${esc(x.loja)}</div>
        <div style="font-size:12px; color:var(--text-muted);">${fmtData(x.data)} · ${esc(x.entrada)}–${esc(x.saida)} · ${esc(x.foco)}</div></div>${acao}</div>`;
    const html = agendaDeHoje.map((x, i) => card(x, x.status === "aceita" ? `<button class="btn btn-primary" style="padding:8px 12px; font-size:12px; width:auto;" onclick="mostrarQR(${i})">Cobrar (QR)</button>` : "")).join("");
    if (lista) lista.innerHTML = html;
    if (resumo) resumo.innerHTML = html;
}

function mostrarQR(i) {
    const x = agendaDeHoje[i];
    const base = location.origin + location.pathname.replace(/[^/]*$/, "");
    if ($("qr-box")) {
        $("qr-box").innerHTML = "";
        if (window.QRCode) new QRCode($("qr-box"), { text: `${base}pagar.html?id=${encodeURIComponent(x.id)}`, width: 200, height: 200 });
    }
    if ($("qr-valor")) $("qr-valor").textContent = `Valor: ${fmtBRL(x.valor)}`;
    if ($("qr-liquido")) $("qr-liquido").textContent = `Você recebe 85% (${fmtBRL(x.valor * 0.85)})`;
    if ($("modal-qr")) $("modal-qr").classList.add("active");
}
function fecharQR() { if ($("modal-qr")) $("modal-qr").classList.remove("active"); }

function atualizarFinanceiro() {
    const fmt = (v) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    if ($("valor-avulso")) $("valor-avulso").innerText = fmt(ganhosAvulsos);
    if ($("valor-total")) $("valor-total").innerText = fmt(ganhosAvulsos);
}

function renderizarCalendario() {
    const grid = $("calendar-days-grid");
    if (!grid) return;
    const ano = dataCalendario.getFullYear(), mes = dataCalendario.getMonth();
    if ($("calendar-month-year")) $("calendar-month-year").innerText = dataCalendario.toLocaleDateString("pt-BR", { month: "long", year: "numeric" }).replace(/^./, (c) => c.toUpperCase());

    const primeiro = (new Date(ano, mes, 1).getDay() + 6) % 7;
    const total = new Date(ano, mes + 1, 0).getDate();
    const hoje = new Date();
    let html = "";
    for (let i = 0; i < primeiro; i++) html += "<div></div>";
    for (let d = 1; d <= total; d++) {
        const ehHoje = d === hoje.getDate() && mes === hoje.getMonth() && ano === hoje.getFullYear();
        const sel = diaSelecionado === `${ano}-${mes}-${d}`;
        html += `<div style="padding:8px; border-radius:8px; background:${sel ? 'var(--accent)' : (ehHoje ? 'rgba(59,130,246,0.15)' : 'transparent')}; color:#fff; cursor:pointer;" onclick="selecionarDia(${d})">${d}</div>`;
    }
    grid.innerHTML = html;
}
function mudarMesCalendario(delta) {
    dataCalendario = new Date(dataCalendario.getFullYear(), dataCalendario.getMonth() + delta, 1);
    renderizarCalendario();
}
function selecionarDia(d) {
    diaSelecionado = `${dataCalendario.getFullYear()}-${dataCalendario.getMonth()}-${d}`;
    const data = new Date(dataCalendario.getFullYear(), dataCalendario.getMonth(), d);
    if ($("selected-date-label")) $("selected-date-label").innerText = "Turnos de " + data.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
    renderizarCalendario();
}

// ==========================================
// OFERTAS + MAPA
// ==========================================
async function renderizarOfertas() {
    const el = $("lista-demandas-cards");
    if (!el) return;
    if (dadosPerfil.status !== "ativo") {
        el.innerHTML = estadoVazio("🔒", "Ofertas liberadas após aprovação", "Estamos analisando seu cadastro.");
        return;
    }
    let lista = [];
    try {
        const chave = chavePromotor();
        if (chave) {
            const perfil = await getDoc(doc(db, "profissionais", chave));
            valorMinimo = Number(perfil.data()?.valorMin) || 0;
            if ($("pref-valor-min")) $("pref-valor-min").value = valorMinimo || "";
        }
        const snap = await getDocs(query(collection(db, "solicitacoes"), where("status", "==", "aberta")));
        lista = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((x) => x.valor >= valorMinimo);
    } catch (e) { console.warn("Ofertas:", e.code); }
    el.innerHTML = lista.length ? lista.map((x) => `<div class="glass" style="padding:16px; border-radius:16px; margin-bottom:10px; display:flex; justify-content:space-between; align-items:center;">
        <div><div style="font-weight:bold; color:#fff;">${esc(x.loja)}</div>
        <div style="font-size:12px; color:var(--text-muted);">${fmtData(x.data)} · ${esc(x.entrada)}–${esc(x.saida)} · ${esc(x.foco)}</div>
        <div style="font-size:13px; color:var(--accent); font-weight:bold; margin-top:4px;">Recebe: ${fmtBRL(x.valor * 0.85)}</div></div>
        <button class="btn btn-primary" style="padding:8px 16px; font-size:12px; width:auto;" onclick="aceitarOferta('${x.id}')">Aceitar</button></div>`).join("")
        : estadoVazio("🛒", "Sem ofertas no momento", "Novas demandas aparecerão aqui.");
}

async function aceitarOferta(id) {
    try {
        await updateDoc(doc(db, "solicitacoes", id), { status: "aceita", promotorChave: chavePromotor(), promotorNome: dadosPerfil.nome, aceitoEm: serverTimestamp() });
        toast("Turno aceito com sucesso!");
        carregarAgendaDoBanco(); renderizarOfertas();
    } catch (e) { toast("Não foi possível aceitar. Outro profissional pode ter pego."); }
}

async function salvarPrefs() {
    const v = parseFloat($("pref-valor-min").value) || 0;
    try {
        await salvarMerge({ valorMin: v, especialidade: $("pref-estilo").selectedOptions[0].text, disponibilidade: { inicio: $("pref-hora-inicio").value, fim: $("pref-hora-fim").value } });
        valorMinimo = v;
        toast("✅ Preferências salvas!");
        fecharSubtela("subscreen-preferencias-atendimento");
        renderizarOfertas();
    } catch (e) { toast("Erro ao salvar preferências."); }
}

function initMapAlunos() {
    const el = $("mapa-alunos");
    if (!el || !window.google || !window.google.maps) return;
    if (!mapaOfertas) {
        mapaOfertas = new google.maps.Map(el, {
            zoom: 14, center: { lat: -22.4389, lng: -46.8258 }, disableDefaultUI: true,
            styles: [
                { elementType: "geometry", stylers: [{ color: "#1a1a24" }] },
                { elementType: "labels.text.fill", stylers: [{ color: "#746855" }] },
                { featureType: "road", elementType: "geometry", stylers: [{ color: "#2c2c38" }] },
                { featureType: "water", elementType: "geometry", stylers: [{ color: "#0e1626" }] }
            ]
        });
    } else {
        google.maps.event.trigger(mapaOfertas, "resize");
    }
}

// ==========================================
// CADASTRO DE LOJA E CHAT (ANTI-FUGA)
// ==========================================
function abrirModalCadastrarAluno() { if ($("modal-cadastrar-aluno")) $("modal-cadastrar-aluno").classList.add("active"); }
function fecharModalCadastrarAluno() {
    if ($("modal-cadastrar-aluno")) $("modal-cadastrar-aluno").classList.remove("active");
    ["cpf", "nome", "objetivo", "preco", "dias", "horario", "frequencia"].forEach((k) => { const e = $("cad-aluno-" + k); if (e) e.value = ""; });
}
function confirmarCadastroAluno() {
    const nome = $("cad-aluno-nome").value.trim();
    if (!nome) { toast("Informe o nome da loja."); return; }
    agendaDeHoje.push({ hora: $("cad-aluno-horario").value.trim() || "12:00", loja: nome, setor: $("cad-aluno-objetivo").value.trim() \vert{}\vert{} "Geral", status: "ocupado", valor: parseFloat($("cad-aluno-preco").value) || 100 });
    renderizarAgenda();
    fecharModalCadastrarAluno();
    toast("✅ Loja vinculada à sua escala!");
}

function fecharConversaModal() { if ($("modal-chat-flutuante")) $("modal-chat-flutuante").classList.remove("active"); }

const palavrasProibidas = ['whatsapp', 'wpp', 'zap', 'whats', 'pix', 'instagram', 'insta', 'telefone', 'celular', 'contato', 'chama no pv', 'privado', 'telegram'];
const regexTelefone = /\b(?:\d{2}\s?)?\d{9}\b|\b\d{2}\s?\d{4,5}[-.\s]?\d{4}\b/;

function verificarConteudoMensagem(texto) {
    const textoLower = texto.toLowerCase();
    const encontrouPalavra = palavrasProibidas.some(palavra => textoLower.includes(palavra));
    const encontrouNumero = regexTelefone.test(texto);
    return encontrouPalavra || encontrouNumero;
}

function enviarMensagemChat() {
    const input = $("input-chat-msg");
    if (!input) return;
    const texto = input.value.trim();
    if (!texto) return;

    if (verificarConteudoMensagem(texto)) {
        toast("⚠️ Advertência: O envio de contatos ou Pix externos viola os Termos de Uso. Na próxima ocorrência, sua conta será banida.");
        input.value = '';
        return;
    }

    const box = $("chat-box");
    if (box) {
        const m = document.createElement("div");
        m.className = "msg msg-sent";
        m.textContent = texto;
        box.appendChild(m);
        box.scrollTop = box.scrollHeight;
    }
    input.value = "";
}
function enviarPropostaPersonal() { toast("Orçamento enviado à loja."); }
function toggleDiaTrabalho(btn) {}

// ==========================================
// PARIDADE E MAPEAMENTO DE JANELA
// ==========================================
function toggleTheme() {
    const claro = $("theme-toggle").checked;
    document.body.classList.toggle("light-theme", claro);
    try { localStorage.setItem("abastece_tema", claro ? "claro" : "escuro"); } catch (e) {}
}
try {
    if (localStorage.getItem("abastece_tema") === "claro") {
        document.body.classList.add("light-theme");
        window.addEventListener("DOMContentLoaded", () => { const t = $("theme-toggle"); if (t) t.checked = true; });
    }
} catch (e) {}

async function salvarContato() {
    const tel = $("promotor-input-telefone").value.trim();
    if (!tel) { toast("Informe seu telefone ou WhatsApp."); return; }
    try { await salvarMerge({ telefone: tel }); toast("✅ Contato salvo!"); }
    catch (e) { toast("Não foi possível salvar o contato."); }
}

function atualizarProximaReposicao() {
    const el = $("proxima-reposicao");
    const prox = agendaDeHoje.find((x) => x.status === "aceita");
    if (el) el.textContent = prox ? `${fmtData(prox.data)} · ${prox.entrada}–${prox.saida} · ${prox.loja}` : "Nenhum turno agendado.";
}

window.addEventListener("DOMContentLoaded", () => {
    const c = $("lista-conversas-promotor");
    if (c) c.innerHTML = estadoVazio("💬", "Nenhuma conversa ainda", "Quando você aceitar um turno, o chat com a loja aparece aqui.");
});

Object.assign(window, {
    validarProfissional, loginComGoogle, validarCheckTermos, abrirModalTermos, aceitarTermosModal,
    abrirOpcaoMenu, fecharSubtela, salvarPerfilProfissionalCompleto, salvarDadosBancarios,
    atualizarFotoPerfil, sairModoPessoal, switchTabPersonal, mudarMesCalendario, selecionarDia,
    abrirModalCadastrarAluno, fecharModalCadastrarAluno, confirmarCadastroAluno,
    fecharConversaModal, enviarMensagemChat, enviarPropostaPersonal, initMapAlunos,
    toggleTheme, salvarContato, toast, mostrarQR, fecharQR, aceitarOferta, salvarPrefs, calcularDistanciaKm
});
