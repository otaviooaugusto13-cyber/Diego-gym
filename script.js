import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, addDoc, doc, setDoc, getDoc, getDocs, query, where, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import {
    getAuth, signInWithPopup, signInWithRedirect, getRedirectResult,
    GoogleAuthProvider, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyA2PVDpo4X3G8ok_Mk5MU1WeRUaxwIhEpg",
    authDomain: "app-diego-e0591.firebaseapp.com",
    projectId: "app-diego-e0591",
    storageBucket: "app-diego-e0591.firebasestorage.app",
    messagingSenderId: "69109305372",
    appId: "1:69109305372:web:5139a52f1342671c520fd9",
    measurementId: "G-P2J3HHKK2R"
};

// ==========================================
// FIREBASE (antes não era inicializado — causa nº 1 do login quebrado)
// ==========================================
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

let usuarioAtual = null;
let mapRadar;
let userMarker;


// ==========================================
// UTILITÁRIOS
// ==========================================
const $ = (id) => document.getElementById(id);
const hojeLocal = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

function toast(msg) {
    let t = $("toast");
    if (!t) {
        t = document.createElement("div");
        t.id = "toast";
        document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.remove("show"), 3500);
}

function setLoginLoading(loading) {
    const btn = $("btn-login-aluno");
    if (!btn) return;
    btn.disabled = loading;
    btn.classList.toggle("loading", loading);
    btn.dataset.label = btn.dataset.label || btn.innerHTML;
    if (loading) btn.innerHTML = '<span class="spinner"></span> Entrando...';
    else btn.innerHTML = btn.dataset.label;
}

function mensagemErroAuth(error) {
    switch (error.code) {
        case "auth/unauthorized-domain":
            return "Domínio não autorizado no Firebase. Adicione este endereço em Authentication → Settings → Domínios autorizados.";
        case "auth/operation-not-allowed":
            return "Login com Google não está ativado no Firebase (Authentication → Sign-in method).";
        case "auth/popup-closed-by-user":
        case "auth/cancelled-popup-request":
            return null; // usuário fechou, sem alerta
        case "auth/network-request-failed":
            return "Sem conexão com a internet. Tente novamente.";
        default:
            return "Não foi possível entrar com o Google. (" + (error.code || "erro") + ")";
    }
}

// ==========================================
// LOGIN / LOGOUT
// ==========================================
async function loginGoogleAluno() {
    const termos = $("check-termos-aluno");
    if (termos && !termos.checked) {
        toast("Aceite os Termos de Uso para continuar.");
        return;
    }
    setLoginLoading(true);
    try {
        await signInWithPopup(auth, googleProvider);
        // onAuthStateChanged cuida do resto
    } catch (error) {
        if (error.code === "auth/popup-blocked") {
            // Celulares/navegadores que bloqueiam popup: usa redirecionamento
            try { await signInWithRedirect(auth, googleProvider); return; } catch (e) { error = e; }
        }
        console.error("Erro no login Google:", error);
        const msg = mensagemErroAuth(error);
        if (msg) toast(msg);
        setLoginLoading(false);
    }
}

async function logoutAluno() {
    try { await signOut(auth); } catch (e) { console.error(e); }
}

function mostrarApp(user) {
    usuarioAtual = user;
    const nome = user.displayName || user.email.split("@")[0];

    $("display-name-home").innerText = nome.split(" ")[0];
    $("display-name-profile").innerText = nome;

    const inicial = nome.charAt(0).toUpperCase();
    $("main-user-avatar").innerText = inicial;
    if (user.photoURL) { const av = $("main-user-avatar"); av.innerText = ""; av.style.backgroundImage = `url("${user.photoURL}")`; av.style.backgroundSize = "cover"; av.style.backgroundPosition = "center"; }
    $("display-avatar-profile").innerText = inicial;

    if (user.photoURL) {
        const img = $("img-aluno-perfil-preview");
        img.src = user.photoURL;
        img.style.display = "block";
        $("display-avatar-profile").style.display = "none";
    }

    navTo("screen-main");
    const lk = $("input-link-indicacao"); if (lk) lk.value = location.origin + location.pathname.replace(/[^/]*$/, "") + "index.html";
    const inpData = $("solicitacao-data");
    if (inpData) { inpData.min = hojeLocal(); if (!inpData.value) inpData.value = hojeLocal(); }
    renderPersonais();
    pedirLocalizacao();
    renderConversas();
    renderCalendario();
    carregarPedidos();
    carregarPerfilAluno();
    carregarProximoTreino();
    if (window.google && !mapRadar) initMap();
}

function mostrarLogin() {
    usuarioAtual = null;
    setLoginLoading(false);
    navTo("screen-login");
}

onAuthStateChanged(auth, (user) => {
    if (user) mostrarApp(user);
    else mostrarLogin();
});

getRedirectResult(auth).catch((error) => {
    const msg = mensagemErroAuth(error);
    if (msg) toast(msg);
});

// ==========================================
// NAVEGAÇÃO
// ==========================================
function navTo(screenId) {
    document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
    $(screenId).classList.add("active");
    window.scrollTo(0, 0);
}

function switchTab(tabId, navElement) {
    document.querySelectorAll(".tab-content").forEach((t) => t.classList.remove("active"));
    $(tabId).classList.add("active");
    document.querySelectorAll(".nav-item").forEach((i) => i.classList.remove("active"));
    if (navElement) navElement.classList.add("active");
    window.scrollTo(0, 0);
    if (usuarioAtual) {
        if (tabId === "tab-pedidos" || tabId === "tab-agenda" || tabId === "tab-carteira") carregarPedidos();
        if (tabId === "tab-home") renderPersonais();
    }
}

function toggleTheme() {
    const claro = $("theme-toggle").checked;
    document.body.classList.toggle("light-theme", claro);
    try { localStorage.setItem("personow_tema", claro ? "claro" : "escuro"); } catch (e) {}
}

try {
    if (localStorage.getItem("personow_tema") === "claro") {
        document.body.classList.add("light-theme");
        const tg = $("theme-toggle");
        if (tg) tg.checked = true;
    }
} catch (e) {}

// ==========================================
// LISTAS (PERSONAIS / CONVERSAS)
// ==========================================
async function renderPersonais() {
    if (!$("lista-personais-reais")) return;
    let ativos = [];
    try {
        const snap = await getDocs(query(collection(db, "profissionais"), where("status", "==", "ativo")));
        ativos = snap.docs.map((d) => d.data());
    } catch (e) { console.warn("Personais não carregados:", e.code); }
    personaisAtivos = ativos;
    aplicarDistancias();
}

function renderConversas() {
    const el = $("lista-conversas");
    if (!el) return;
    el.innerHTML = `<div class="empty-state">
        <div class="empty-icon">💬</div>
        <h4>Nenhuma conversa ainda</h4>
        <p>Quando um personal aceitar sua solicitação, o chat aparecerá aqui.</p>
    </div>`;
}

function abrirChatSimples(nome) {
    toast("Chat com " + nome + " estará disponível após a solicitação ser aceita.");
}

// ==========================================
// SOLICITAÇÕES (Firestore)
// ==========================================
async function enviarSolicitacao(extra = {}) {
    if (!usuarioAtual) { toast("Faça login primeiro."); return; }
    const local = $("solicitacao-local").value.trim();
    const data = $("solicitacao-data").value, entrada = $("solicitacao-entrada").value, saida = $("solicitacao-saida").value;
    const valor = parseFloat($("solicitacao-valor").value);
    if (!local) { toast("Informe a academia ou o endereço do treino."); $("solicitacao-local").focus(); return; }
    if (!data) { toast("Escolha o dia do treino."); return; }
    if (data < hojeLocal()) { toast("O dia não pode ser anterior a hoje."); return; }
    if (!entrada || !saida || saida <= entrada) { toast("O término precisa ser depois do início."); return; }
    if (!(valor > 0)) { toast("Informe o valor que deseja pagar."); $("solicitacao-valor").focus(); return; }
    try {
        await addDoc(collection(db, "solicitacoes"), {
            uid: usuarioAtual.uid, email: usuarioAtual.email, loja: local,
            data, entrada, saida, horario: `${entrada}–${saida}`, valor,
            foco: $("solicitacao-foco").value, status: "aberta", criadoEm: serverTimestamp(), ...extra
        });
        toast("✅ Pedido enviado! Os personais da região serão avisados.");
        try { localStorage.setItem("personow_local", local); } catch (e) {}
        precisaPadroes = true; pedidoPreferido = null;
        fecharSheetPedido();
        carregarPedidos();
        switchTab("tab-pedidos", document.querySelectorAll("#bottom-nav .nav-item")[1]);
    } catch (e) {
        console.error(e);
        toast("Não foi possível enviar. Verifique as regras do Firestore.");
    }
}

function solicitarTreinoModoUber() { abrirSheetPedido(); }
function solicitarPersonalEspecifico(nome) { abrirSheetPedido(null, nome); }

function carregarProximoTreino(s) {
    const el = $("card-proximo-treino-conteudo");
    if (!el) return;
    if (!s) {
        el.innerHTML = '<p class="muted-line">Nenhum treino agendado.</p>';
        return;
    }
    el.innerHTML = `<p style="font-size:14px;font-weight:600">${s.loja}</p>
                    <p class="muted-line">${s.horario} · aguardando personal</p>`;
}

// ==========================================
// PERFIL DO ALUNO
// ==========================================
async function carregarPerfilAluno() {
    try {
        const snap = await getDoc(doc(db, "contratantes", usuarioAtual.uid));
        if (snap.exists()) {
            const d = snap.data();
            const obj = d.objetivo || d.ramo; if (obj) $("aluno-select-objetivo").value = obj;
            if (d.telefone) $("aluno-input-telefone").value = d.telefone;
        }
    } catch (e) { console.warn("Perfil não carregado:", e.code); }
}

async function salvarPerfilAluno() {
    if (!usuarioAtual) return;
    try {
        await setDoc(doc(db, "contratantes", usuarioAtual.uid), {
            nome: usuarioAtual.displayName || "",
            email: usuarioAtual.email,
            objetivo: $("aluno-select-objetivo").value,
            telefone: $("aluno-input-telefone").value.trim(),
            atualizadoEm: serverTimestamp()
        }, { merge: true });
        toast("✅ Perfil salvo!");
    } catch (e) {
        console.error(e);
        toast("Erro ao salvar. Verifique as regras do Firestore.");
    }
}

function atualizarFotoPerfilAluno(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        const img = $("img-aluno-perfil-preview");
        img.src = e.target.result;
        img.style.display = "block";
        $("display-avatar-profile").style.display = "none";
    };
    reader.readAsDataURL(file);
}

// ==========================================
// GOOGLE MAPS
// ==========================================
function initMap() {
    const el = $("mapa-quadrado");
    if (!el || mapRadar || !window.google || mapaFalhou) return;
    // Só cria o mapa com a tela visível (container oculto tem tamanho 0)
    if (!$("screen-main").classList.contains("active")) return;

    mapRadar = new google.maps.Map(el, {
        zoom: 14,
        center: posicaoAluno || { lat: -22.4389, lng: -46.8258 },
        disableDefaultUI: true,
        styles: [
            { elementType: "geometry", stylers: [{ color: "#1a1a24" }] },
            { elementType: "labels.text.stroke", stylers: [{ color: "#1a1a24" }] },
            { elementType: "labels.text.fill", stylers: [{ color: "#8a93a6" }] },
            { featureType: "road", elementType: "geometry", stylers: [{ color: "#2c2c38" }] },
            { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#212123" }] },
            { featureType: "water", elementType: "geometry", stylers: [{ color: "#0e1626" }] }
        ]
    });
    // O mapa só substitui o radar animado se carregar sem erro de chave
    google.maps.event.addListenerOnce(mapRadar, "tilesloaded", () => {
        setTimeout(() => { if (!mapaFalhou) el.classList.add("on"); }, 700);
    });
    atualizarMapaPosicao();
    marcarPersonaisNoMapa();
}

// ==========================================
// HOME: BOTTOM SHEET, CARDS DOS PERSONAIS, RADAR
// ==========================================
let personaisAtivos = [];
let posicaoAluno = null;
let pedidoPreferido = null;
let precisaPadroes = true;
let mapaFalhou = false;
let marcadoresPersonais = [];

// Se a chave do Google Maps for recusada, o mapa some e o radar animado continua visível
window.gm_authFailure = () => {
    mapaFalhou = true;
    const el = $("mapa-quadrado");
    if (el) { el.classList.remove("on"); el.innerHTML = ""; }
};

const ymdLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const hhmm = (d) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

function preencherPadroes() {
    const agora = new Date();
    let ini = new Date(agora);
    ini.setMinutes(Math.ceil(agora.getMinutes() / 30) * 30, 0, 0);
    let dia = new Date(agora);
    if (ini.getHours() >= 22 || ini.getDate() !== agora.getDate()) {
        dia.setDate(dia.getDate() + 1);
        ini = new Date(dia); ini.setHours(8, 0, 0, 0);
    }
    const fim = new Date(ini.getTime() + 3600000);
    $("solicitacao-data").value = ymdLocal(dia);
    $("solicitacao-entrada").value = hhmm(ini);
    $("solicitacao-saida").value = hhmm(fim);
}

function atualizarResumoValor() {
    const n = parseFloat($("solicitacao-valor").value) || 0;
    $("rv-prom").textContent = fmtBRL(n * 0.85);
    $("rv-taxa").textContent = fmtBRL(n * 0.15);
}
function definirValor(v) { $("solicitacao-valor").value = v; atualizarResumoValor(); }

function selecionarFoco(v) {
    $("solicitacao-foco").value = v;
    document.querySelectorAll(".chip[data-v]").forEach((c) => {
        const on = c.dataset.v === v;
        c.classList.toggle("sel", on);
        c.setAttribute("aria-checked", on ? "true" : "false");
    });
    const t = $("sheet-titulo"); if (t) t.textContent = "Pedir personal · " + v;
}

function abrirSheetPedido(foco, preferido) {
    pedidoPreferido = typeof preferido === "string" ? preferido : null;
    if (typeof foco === "string" && foco) selecionarFoco(foco); else selecionarFoco($("solicitacao-foco").value);
    if (precisaPadroes) { preencherPadroes(); precisaPadroes = false; }
    if (!$("solicitacao-valor").value) $("solicitacao-valor").value = 80;
    if (!$("solicitacao-local").value) { try { $("solicitacao-local").value = localStorage.getItem("personow_local") || ""; } catch (e) {} }
    atualizarResumoValor();
    $("sheet-sub").textContent = pedidoPreferido ? "Pedido direcionado a " + pedidoPreferido : "Os personais da região recebem o seu pedido.";
    $("sheet-pedido").classList.add("open");
    document.body.classList.add("no-scroll");
}
function fecharSheetPedido() { $("sheet-pedido").classList.remove("open"); document.body.classList.remove("no-scroll"); }
function confirmarPedido() { enviarSolicitacao(pedidoPreferido ? { promotorPreferido: pedidoPreferido } : {}); }

document.addEventListener("click", (e) => {
    const chip = e.target.closest(".chip[data-v]");
    if (!chip) return;
    selecionarFoco(chip.dataset.v);
    if (chip.closest("#hero-chips")) abrirSheetPedido();
});

// ---------- cards ----------
const iconeEsp = (t) => {
    t = (t || "").toLowerCase();
    if (t.includes("hiper")) return "🔥"; if (t.includes("muscul")) return "💪"; if (t.includes("emag")) return "⚡";
    if (t.includes("func")) return "🤸"; if (t.includes("aval")) return "📋"; if (t.includes("corr")) return "🏃";
    return "🏋️";
};
const fmtKm = (km) => (km < 1 ? `${Math.max(50, Math.round(km * 10) * 100)} m` : `${km.toFixed(1).replace(".", ",")} km`);
function kmEntre(a, b) {
    const R = 6371, rad = (x) => (x * Math.PI) / 180;
    const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
}
const temCoord = (p) => Number.isFinite(p.lat) && Number.isFinite(p.lng);

function cartaoPersonal(p, i) {
    const nome = p.nome || "Personal";
    const foto = /^https:\/\//.test(p.fotoGoogle || "") ? `<img src="${esc(p.fotoGoogle)}" alt="" referrerpolicy="no-referrer">` : esc(nome.charAt(0).toUpperCase());
    const cref = (p.cref || "").trim() ? `<span class="pc-verif" title="CREF informado: ${esc(p.cref)}">CREF ✓</span>` : "";
    const esp = p.especialidade || "Personal trainer";
    const preco = Number(p.valorMin) > 0 ? `💰 A partir de ${fmtBRL(p.valorMin)}/aula` : "💰 Valor definido no pedido";
    const dist = p._km != null ? `📍 ${fmtKm(p._km)} de você` : "📍 Na sua região";
    return `<article class="pc">
        <div class="pc-top">
            <div class="pc-ring"><div class="pc-photo">${foto}</div><span class="pc-dot"></span></div>
            <div class="pc-info">
                <div class="pc-name"><strong>${esc(nome)}</strong>${cref}</div>
                <span class="pc-pill">${iconeEsp(esp)} ${esc(esp)}</span>
            </div>
        </div>
        <div class="pc-meta"><span>${dist}</span><span>${preco}</span></div>
        <div class="pc-actions">
            <button type="button" class="pc-btn ghost" onclick="verPerfil(${i})">Ver perfil</button>
            <button type="button" class="pc-btn" onclick="chamarPersonal(${i})">⚡ Chamar agora</button>
        </div>
    </article>`;
}

function renderListaPersonais() {
    const lista = $("lista-personais-reais");
    if (!lista) return;
    lista.innerHTML = personaisAtivos.length
        ? personaisAtivos.map(cartaoPersonal).join("")
        : vazio("🏋️", "Nenhum personal ativo ainda", "Faça seu pedido acima: os personais da região recebem a sua proposta.");
}

function chamarPersonal(i) { const p = personaisAtivos[i]; if (p) abrirSheetPedido(null, p.nome || "Personal"); }
function fecharSheetPerfil() { $("sheet-perfil").classList.remove("open"); document.body.classList.remove("no-scroll"); }
function verPerfil(i) {
    const p = personaisAtivos[i]; if (!p) return;
    const nome = p.nome || "Personal", esp = p.especialidade || "Personal trainer";
    const foto = /^https:\/\//.test(p.fotoGoogle || "") ? `<img src="${esc(p.fotoGoogle)}" alt="" referrerpolicy="no-referrer">` : esc(nome.charAt(0).toUpperCase());
    $("sheet-perfil-corpo").innerHTML = `
        <div class="pf-head"><div class="pc-ring big"><div class="pc-photo">${foto}</div><span class="pc-dot"></span></div>
        <h3>${esc(nome)}</h3><span class="pc-pill">${iconeEsp(esp)} ${esc(esp)}</span></div>
        <div class="pc-meta pf-meta"><span>${p._km != null ? "📍 " + fmtKm(p._km) + " de você" : "📍 Na sua região"}</span><span>${Number(p.valorMin) > 0 ? "💰 A partir de " + fmtBRL(p.valorMin) + "/aula" : "💰 Valor definido no pedido"}</span></div>
        ${(p.cref || "").trim() ? `<p class="pf-line">🛡️ CREF informado: <strong>${esc(p.cref)}</strong></p>` : ""}
        ${p.cidade ? `<p class="pf-line">🏙️ Atua em ${esc(p.cidade)}</p>` : ""}
        <p class="pf-bio">${p.bio ? esc(p.bio) : "Este personal ainda não escreveu uma apresentação."}</p>
        <button type="button" class="btn btn-primary" onclick="fecharSheetPerfil();chamarPersonal(${i})">⚡ Chamar ${esc(nome.split(" ")[0])}</button>
        <button type="button" class="btn btn-outline" style="margin-top:8px" onclick="fecharSheetPerfil()">Fechar</button>`;
    $("sheet-perfil").classList.add("open");
    document.body.classList.add("no-scroll");
}

// ---------- distância, radar e mapa ----------
function aplicarDistancias() {
    personaisAtivos.forEach((p) => { p._km = posicaoAluno && temCoord(p) ? kmEntre(posicaoAluno, p) : null; });
    personaisAtivos.sort((a, b) => (a._km ?? 1e9) - (b._km ?? 1e9));
    renderListaPersonais();
    atualizarRadar();
    marcarPersonaisNoMapa();
}

function hashStr(s) { let h = 7; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; }

function atualizarRadar() {
    const blips = $("radar-blips"), cnt = $("radar-count");
    if (!blips || !cnt) return;
    const n = personaisAtivos.length;
    cnt.textContent = n === 0 ? "Nenhum personal online agora" : n === 1 ? "1 personal disponível na região" : `${n} personais disponíveis na região`;
    blips.innerHTML = personaisAtivos.slice(0, 12).map((p, i) => {
        let x, y;
        if (p._km != null && posicaoAluno) {
            const ang = Math.atan2((p.lng - posicaoAluno.lng) * Math.cos((posicaoAluno.lat * Math.PI) / 180), p.lat - posicaoAluno.lat);
            const r = 0.18 + Math.min(p._km / 5, 1) * 0.72;
            x = 50 + r * 46 * Math.sin(ang); y = 50 - r * 40 * Math.cos(ang);
        } else {
            const h = hashStr(p.nome || i), ang = (h % 360) * (Math.PI / 180), r = 0.3 + ((h >> 4) % 60) / 100;
            x = 50 + r * 46 * Math.sin(ang); y = 50 - r * 40 * Math.cos(ang);
        }
        return `<button type="button" class="radar-blip" style="left:${x.toFixed(1)}%;top:${y.toFixed(1)}%;animation-delay:${(i * 0.35).toFixed(2)}s" title="${esc(p.nome)}" onclick="verPerfil(${i})">${esc((p.nome || "P").charAt(0).toUpperCase())}</button>`;
    }).join("");
}

function marcarPersonaisNoMapa() {
    if (!mapRadar || !window.google || mapaFalhou) return;
    marcadoresPersonais.forEach((m) => m.setMap(null));
    marcadoresPersonais = personaisAtivos.map((p, i) => temCoord(p) ? new google.maps.Marker({ position: { lat: p.lat, lng: p.lng }, map: mapRadar, title: p.nome, label: { text: (p.nome || "P").charAt(0).toUpperCase(), color: "#fff", fontWeight: "700" } }) : null).filter(Boolean);
    marcadoresPersonais.forEach((m, k) => m.addListener("click", () => verPerfil(personaisAtivos.findIndex((p) => p.nome === m.getTitle()))));
}

function atualizarMapaPosicao() {
    if (!mapRadar || !posicaoAluno || !window.google) return;
    mapRadar.setCenter(posicaoAluno);
    if (userMarker) userMarker.setPosition(posicaoAluno);
    else userMarker = new google.maps.Marker({ position: posicaoAluno, map: mapRadar, title: "Você", icon: { path: google.maps.SymbolPath.CIRCLE, scale: 7, fillColor: "#3B82F6", fillOpacity: 1, strokeWeight: 2, strokeColor: "#ffffff" } });
}

function pedirLocalizacao() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((pos) => {
        posicaoAluno = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        $("loc-text").textContent = "Localização ativa";
        aplicarDistancias();
        atualizarMapaPosicao();
        if (window.google && google.maps && google.maps.Geocoder && !mapaFalhou) {
            new google.maps.Geocoder().geocode({ location: posicaoAluno }, (res, status) => {
                if (status !== "OK" || !res || !res[0]) return;
                const comp = (t) => (res[0].address_components.find((c) => c.types.includes(t)) || {});
                const cidade = comp("administrative_area_level_2").long_name || comp("locality").long_name, uf = comp("administrative_area_level_1").short_name;
                if (cidade) $("loc-text").textContent = uf ? `${cidade}, ${uf}` : cidade;
            });
        }
    }, () => {}, { maximumAge: 300000, timeout: 10000 });
}

// ==========================================
// EXPORTS PARA O HTML (onclick="...")
// Módulos ES não expõem funções ao escopo global automaticamente.
// ==========================================
// ==========================================
// PEDIDOS / AGENDA / CARTEIRA / MENU
// ==========================================
let pedidos = [];
let dataCalendario = new Date();
const ROTULO = { aberta: "Aguardando personal", aceita: "Aceito", concluida: "Concluído", cancelada: "Cancelado" };
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmtData = (d) => (d ? d.split("-").reverse().join("/") : "");
const fmtBRL = (v) => (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const vazio = (i, t, x) => `<div class="empty-state"><div class="empty-icon">${i}</div><h4>${t}</h4><p>${x}</p></div>`;

async function carregarPedidos() {
    try {
        const snap = await getDocs(query(collection(db, "solicitacoes"), where("uid", "==", usuarioAtual.uid)));
        pedidos = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (b.criadoEm?.seconds || 0) - (a.criadoEm?.seconds || 0));
    } catch (e) { console.warn("Pedidos não carregados:", e.code); pedidos = []; }
    renderPedidos();
    renderCarteira();
    carregarProximoTreino(pedidos.find((p) => p.status === "aberta" || p.status === "aceita"));
}

function cartaoPedido(p) {
    const st = p.status || "aberta";
    const etapa = st === "concluida" ? 3 : st === "aceita" ? 2 : 1;
    const barra = `<div class="steps-line"><span class="${etapa >= 1 ? "on" : ""}"></span><span class="${etapa >= 2 ? "on" : ""}"></span><span class="${etapa >= 3 ? "on" : ""}"></span></div>`;
    const pagar = st === "aceita" ? `<a class="btn-pagar-pedido" href="pagar.html?id=${encodeURIComponent(p.id)}">💳 Pagar com Pix</a>` : "";
    const quem = p.promotorNome ? ` · ${esc(p.promotorNome)}` : "";
    return `<div class="glass agenda-slot slot-${st === "concluida" ? "concluida" : st === "aberta" ? "livre" : "ocupado"}" style="flex-wrap:wrap">
        <div class="pedido-linha"><div class="slot-info-name">${esc(p.loja)}</div>
        <div class="slot-info-desc">${fmtData(p.data)} · ${esc(p.horario)} · ${esc(p.foco)} · ${fmtBRL(p.valor)}${quem}</div>${pagar}</div>
        <span class="badge badge-gold">${ROTULO[st] || st}</span>${barra}</div>`;
}
function renderPedidos() {
    const el = $("lista-pedidos");
    el.innerHTML = pedidos.length ? pedidos.map(cartaoPedido).join("") : vazio("🏋️", "Nenhum pedido ainda", "Solicite um personal na aba Início e acompanhe o andamento aqui.");
    el.style.cssText = "display:flex;flex-direction:column;gap:10px";
}
function renderCarteira() {
    $("cart-abertos").innerText = pedidos.filter((p) => p.status === "aberta" || p.status === "aceita").length;
    const total = pedidos.filter((p) => p.status === "concluida").reduce((s, p) => s + (p.valor || 0), 0);
    $("cart-total").innerText = total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function renderCalendario() {
    const grid = $("calendar-days-grid");
    const ano = dataCalendario.getFullYear(), mes = dataCalendario.getMonth();
    $("calendar-month-year").innerText = dataCalendario.toLocaleDateString("pt-BR", { month: "long", year: "numeric" }).replace(/^./, (c) => c.toUpperCase());
    const primeiro = (new Date(ano, mes, 1).getDay() + 6) % 7, total = new Date(ano, mes + 1, 0).getDate(), hoje = new Date();
    let html = "<div></div>".repeat(primeiro);
    for (let d = 1; d <= total; d++) {
        const ehHoje = d === hoje.getDate() && mes === hoje.getMonth() && ano === hoje.getFullYear();
        html += `<div class="cal-day${ehHoje ? " today" : ""}" onclick="selecionarDia(${d})">${d}</div>`;
    }
    grid.innerHTML = html;
}
function mudarMesCalendario(n) { dataCalendario = new Date(dataCalendario.getFullYear(), dataCalendario.getMonth() + n, 1); renderCalendario(); }
function selecionarDia(d) {
    const data = new Date(dataCalendario.getFullYear(), dataCalendario.getMonth(), d);
    $("selected-date-label").innerText = "Treinos de " + data.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
    const iso = `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const dia = pedidos.filter((p) => p.data === iso);
    $("lista-agenda").innerHTML = dia.length ? dia.map(cartaoPedido).join("") : vazio("📅", "Nenhum treino neste dia", "Pedidos para esta data aparecem aqui.");
}

const SUB = { pagamento: "pagamento", preferencias: "preferencias", indicar: "indicar", notificacoes: "notificacoes", ajuda: "ajuda" };
function abrirOpcaoMenu(n) { const e = $("subscreen-" + SUB[n]); if (e) e.style.display = "block"; }
function fecharSubtela(id) { $(id).style.display = "none"; }

async function salvarCampos(dados, msg, subId) {
    if (!usuarioAtual) return;
    try {
        await setDoc(doc(db, "contratantes", usuarioAtual.uid), { ...dados, atualizadoEm: serverTimestamp() }, { merge: true });
        toast(msg); fecharSubtela(subId);
    } catch (e) { console.error(e); toast("Não foi possível salvar. Verifique as regras do Firestore."); }
}
function salvarPagamento() { salvarCampos({ pagamento: { metodo: $("pg-metodo").value, documento: $("pg-doc").value.trim() } }, "✅ Forma de pagamento salva!", "subscreen-pagamento"); }
function salvarPreferencias() { salvarCampos({ preferencias: { setor: $("pref-setor").value, turno: $("pref-turno").value } }, "✅ Preferências salvas!", "subscreen-preferencias"); }
function copiarLinkIndicacao() { const i = $("input-link-indicacao"); i.select(); navigator.clipboard?.writeText(i.value); toast("📋 Link copiado!"); }
function compartilharWhatsApp() {
    const t = encodeURIComponent("Conheça o PERSONOW: personal trainers sob demanda para a sua academia. " + $("input-link-indicacao").value);
    window.open("https://api.whatsapp.com/send?text=" + t, "_blank");
}

Object.assign(window, {
    mudarMesCalendario, selecionarDia, abrirOpcaoMenu, fecharSubtela, salvarPagamento, salvarPreferencias, copiarLinkIndicacao, compartilharWhatsApp, toast,
    initMap, loginGoogleAluno, logoutAluno, navTo, switchTab, toggleTheme,
    solicitarTreinoModoUber, solicitarPersonalEspecifico, salvarPerfilAluno,
    atualizarFotoPerfilAluno, abrirChatSimples,
    abrirSheetPedido, fecharSheetPedido, confirmarPedido, chamarPersonal, verPerfil, fecharSheetPerfil, definirValor, atualizarResumoValor
});

// Se o Maps carregou antes do módulo, inicia agora
if (window.google && window.google.maps) initMap();
