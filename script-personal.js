import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, getDocs, doc, setDoc, getDoc, updateDoc, query, where, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAuth, signInWithPopup, signInWithRedirect, GoogleAuthProvider, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyA0Z1SEkqrtXuAjtFntv1WRvkKIuY1zilY",
    authDomain: "abastece-ja-240d5.firebaseapp.com",
    projectId: "abastece-ja-240d5",
    storageBucket: "abastece-ja-240d5.firebasestorage.app",
    messagingSenderId: "1061248119348",
    appId: "1:1061248119348:web:90d82ea266683086a39061",
    measurementId: "G-8XFZ5ZGK4L"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

const $ = (id) => document.getElementById(id);

try { 
    const r = new URLSearchParams(location.search).get("ref"); 
    if (r) localStorage.setItem("personow_ref", r.replace(/[^\w-]/g, "").slice(0, 40)); 
} catch (e) {}

const refRecebido = () => { 
    try { return localStorage.getItem("personow_ref") || ""; } catch (e) { return ""; } 
};

let dadosPerfil = { nome: "Personal", cpf: "", cref: "", uid: "", status: "pendente", fotoUrl: null };
let agendaDeHoje = [];
let ganhosAvulsos = 0;
let mapaOfertas = null;
let dataCalendario = new Date();

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

function validarCheckTermos() {
    const ok = $("check-termos")?.checked;
    const btn = $("btn-login");
    if (btn) {
        btn.disabled = !ok;
        btn.style.opacity = ok ? "1" : "0.5";
        btn.style.cursor = ok ? "pointer" : "not-allowed";
    }
}

function abrirModalTermos() { 
    $("modal-termos")?.classList.add("active"); 
}

function aceitarTermosModal() {
    if ($("check-termos")) $("check-termos").checked = true;
    validarCheckTermos();
    $("modal-termos")?.classList.remove("active");
}

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
        const ref = doc(db, "profissionais", cpf);
        const snap = await getDoc(ref);
        if (snap.exists()) {
            status = snap.data().status || "pendente";
            if (status === "bloqueado") { 
                toast("❌ Acesso não liberado para este CPF."); 
                setLoading(false); 
                return; 
            }
        } else {
            await setDoc(ref, { 
                nome, 
                cpf, 
                cref, 
                status: "pendente", 
                indicadoPor: refRecebido(), 
                criadoEm: serverTimestamp() 
            });
        }
    } catch (e) {
        console.error("Erro no Firestore:", e);
    }
    setLoading(false);
    finalizarLogin({ lembreme, nome, cpf, cref, status });
}

async function acharProfissionalPorEmail(email) {
    const q = query(collection(db, "profissionais"), where("email", "==", email));
    const snap = await getDocs(q);
    return snap.empty ? null : snap.docs[0].data();
}

async function loginComGoogle() {
    if (!$("check-termos")?.checked) { 
        toast("Aceite os Termos de Uso para continuar."); 
        return; 
    }
    try {
        const { user } = await signInWithPopup(auth, googleProvider);
        await processarUsuarioGoogle(user, true);
    } catch (error) {
        if (error.code === "auth/popup-blocked") {
            try { 
                await signInWithRedirect(auth, googleProvider); 
                return; 
            } catch (e) { error = e; }
        }
        console.error("Erro no login Google:", error);
    }
}

async function processarUsuarioGoogle(user, interativo) {
    dadosPerfil.uid = user.uid;
    dadosPerfil.fotoUrl = user.photoURL;

    let prof = null;
    try { prof = await acharProfissionalPorEmail(user.email); } catch (e) {}

    if (prof) {
        if (prof.status === "bloqueado") { 
            toast("❌ Acesso não liberado para este e-mail."); 
            return; 
        }
        finalizarLogin({ 
            lembreme: false, 
            nome: prof.nome || user.displayName, 
            cpf: prof.cpf || "", 
            cref: prof.cref || "", 
            status: prof.status || "pendente" 
        });
        return;
    }
    if (!interativo) return;

    try {
        await setDoc(doc(db, "profissionais", user.uid), {
            nome: user.displayName || "", 
            email: user.email, 
            uid: user.uid, 
            cpf: "", 
            cref: "",
            fotoGoogle: user.photoURL || "", 
            status: "pendente", 
            indicadoPor: refRecebido(), 
            criadoEm: serverTimestamp()
        });
    } catch (e) {}
    finalizarLogin({ lembreme: false, nome: user.displayName || user.email, cpf: "", cref: "", status: "pendente" });
}

onAuthStateChanged(auth, (user) => { 
    if (user) processarUsuarioGoogle(user, false); 
});

window.addEventListener("DOMContentLoaded", () => {
    try {
        const salvo = JSON.parse(localStorage.getItem("personow_personal") || "null");
        if (salvo && $("input-nome")) { 
            $("input-nome").value = salvo.nome || ""; 
            $("check-remember").checked = true; 
        }
    } catch (e) {}
});

function finalizarLogin({ lembreme, nome, cpf, cref, status }) {
    dadosPerfil = { ...dadosPerfil, nome: nome || "Personal", cpf, cref, status };
    try {
        if (lembreme) localStorage.setItem("personow_personal", JSON.stringify({ nome }));
        else localStorage.removeItem("personow_personal");
    } catch (e) {}

    atualizarExibicaoPerfil();
    const aprovado = status === "ativo";
    if ($("card-status-analise")) $("card-status-analise").style.display = aprovado ? "none" : "block";

    $("screen-login-personal")?.classList.remove("active");
    $("screen-dashboard")?.classList.add("active");
    carregarAgendaDoBanco();
    renderizarCalendario();
    renderizarOfertas();
}

async function sairModoPessoal() {
    if (!confirm("Deseja realmente sair do portal?")) return;
    try { await signOut(auth); } catch (e) {}
    $("screen-dashboard")?.classList.remove("active");
    $("screen-login-personal")?.classList.add("active");
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
}

function switchTabPersonal(tabId, navElement) {
    document.querySelectorAll("#screen-dashboard .tab-content").forEach((t) => t.classList.remove("active"));
    $(tabId)?.classList.add("active");
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

function fecharSubtela(id) { 
    if ($(id))$(id).style.display = "none"; 
}

async function salvarMerge(dados) {
    const chave = dadosPerfil.cpf || dadosPerfil.uid;
    if (!chave) return;
    await setDoc(doc(db, "profissionais", chave), { ...dados, atualizadoEm: serverTimestamp() }, { merge: true });
}

async function salvarPerfilProfissionalCompleto() {
    try {
        await salvarMerge({
            nome: $("perfil-input-nome")?.value.trim(),
            cpf: $("perfil-input-cpf")?.value.trim(),
            cref: $("perfil-input-cref")?.value.trim(),
            naturalidade: $("perfil-input-naturalidade")?.value.trim(),
            bio: $("personal-input-bio")?.value.trim()
        });
        dadosPerfil.nome = $("perfil-input-nome")?.value.trim() || dadosPerfil.nome;
        atualizarExibicaoPerfil();
        toast("✅ Perfil salvo com sucesso!");
        fecharSubtela("subscreen-perfil-detalhes");
    } catch (e) { 
        toast("Erro ao salvar perfil."); 
    }
}

async function salvarDadosBancarios() {
    try {
        await salvarMerge({
            banco: { 
                banco: $("bank-select-banco")?.value, 
                agencia: $("bank-input-agencia")?.value.trim(), 
                conta: $("bank-input-conta")?.value.trim() 
            },
            pix: { chave: $("bank-input-chave-pix")?.value.trim() }
        });
        toast("✅ Dados bancários salvos!");
        fecharSubtela("subscreen-dados-bancarios");
    } catch (e) { 
        toast("Erro ao salvar dados bancários."); 
    }
}

async function salvarPrefs() {
    try {
        await salvarMerge({
            estilo: $("pref-estilo")?.value,
            valorMinimo: parseFloat($("pref-valor-min")?.value) || 0
        });
        toast("✅ Preferências salvas!");
        fecharSubtela("subscreen-preferencias-atendimento");
    } catch(e) {
        toast("Erro ao salvar preferências.");
    }
}

function atualizarFotoPerfil(event) {
    const file = event.target.files[0];
    if (!file) return;
    const r = new FileReader();
    r.onload = (e) => { 
        dadosPerfil.fotoUrl = e.target.result; 
        atualizarExibicaoPerfil(); 
    };
    r.readAsDataURL(file);
}

const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmtBRL = (v) => (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtData = (d) => (d ? d.split("-").reverse().join("/") : "");
const chavePromotor = () => dadosPerfil.cpf || dadosPerfil.uid;

async function carregarAgendaDoBanco() {
    agendaDeHoje = [];
    try {
        const chave = chavePromotor();
        if (chave) {
            const snap = await getDocs(query(collection(db, "solicitacoes"), where("promotorChave", "==", chave)));
            agendaDeHoje = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => `${a.data}${a.entrada}`.localeCompare(`${b.data}${b.entrada}`));
        }
    } catch (e) {}
    ganhosAvulsos = agendaDeHoje.filter((x) => x.status === "concluida").reduce((t, x) => t + (x.valor * 0.85), 0);
    atualizarFinanceiro();
    renderizarAgenda();
}

function renderizarAgenda() {
    const lista = $("lista-agenda"), resumo = $("lista-agenda-resumo");
    if (!lista || !resumo) return;
    if (!agendaDeHoje.length) {
        const v = `<div class="empty-state"><h4>Nenhum atendimento</h4><p>As aulas que você aceitar nas Ofertas aparecem aqui.</p></div>`;
        lista.innerHTML = v; resumo.innerHTML = v; return;
    }
    const card = (x) => `<div class="glass agenda-slot" style="padding:15px; margin-bottom:10px;"><strong>${esc(x.loja || x.aluno || "Aluno")}</strong><p>${fmtData(x.data)} · ${esc(x.entrada)} · R$ ${esc(x.valor)}</p></div>`;
    lista.innerHTML = agendaDeHoje.map(card).join("");
    resumo.innerHTML = agendaDeHoje.map(card).join("");
}

function atualizarFinanceiro() {
    const fmt = (v) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    if ($("valor-avulso")) $("valor-avulso").innerText = fmt(ganhosAvulsos);
    if ($("valor-total")) $("valor-total").innerText = fmt(ganhosAvulsos);
}

function renderizarCalendario() {
    const grid = $("calendar-days-grid");
    if (!grid) return;
    const ano = dataCalendario.getFullYear(), mes = dataCalendario.getMonth();
    if ($("calendar-month-year")) $("calendar-month-year").innerText = dataCalendario.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
    let html = "";
    for (let d = 1; d <= 28; d++) html += `<div class="cal-day" style="padding:10px; text-align:center;">${d}</div>`;
    grid.innerHTML = html;
}

function mudarMesCalendario(delta) {
    dataCalendario = new Date(dataCalendario.getFullYear(), dataCalendario.getMonth() + delta, 1);
    renderizarCalendario();
}

async function renderizarOfertas() {
    const el = $("lista-demandas-cards");
    if (!el) return;
    if (dadosPerfil.status !== "ativo") {
        el.innerHTML = `<div class="empty-state"><h4>Ofertas liberadas após aprovação</h4><p>Estamos analisando seu CREF.</p></div>`;
        return;
    }
    let lista = [];
    try {
        const snap = await getDocs(query(collection(db, "solicitacoes"), where("status", "==", "aberta")));
        lista = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    } catch (e) {}
    el.innerHTML = lista.length ? lista.map((x) => `<div class="glass agenda-slot" style="padding:15px;"><strong>${esc(x.loja)}</strong><p>${fmtBRL(x.valor)}</p><button class="btn btn-primary" onclick="aceitarOferta('${x.id}')" style="margin-top:10px;">Aceitar Aula</button></div>`).join("") : `<div class="empty-state"><h4>Sem ofertas no momento</h4><p>Novas solicitações aparecerão aqui.</p></div>`;
}

async function aceitarOferta(id) {
    try {
        await updateDoc(doc(db, "solicitacoes", id), { 
            status: "aceita", 
            promotorChave: chavePromotor(), 
            promotorNome: dadosPerfil.nome 
        });
        toast("Aula aceita com sucesso!");
        carregarAgendaDoBanco();
        renderizarOfertas();
    } catch (e) { 
        toast("Erro ao aceitar aula."); 
    }
}

function initMapAlunos() {
    const el = $("mapa-alunos");
    if (!el || !window.google || !window.google.maps) return;
    if (!mapaOfertas) {
        mapaOfertas = new google.maps.Map(el, {
            zoom: 14, 
            center: { lat: -22.4389, lng: -46.8258 }, 
            disableDefaultUI: true
        });
    }
}

function abrirModalCadastrarAluno() { 
    $("modal-cadastrar-aluno")?.classList.add("active"); 
}

function fecharModalCadastrarAluno() { 
    $("modal-cadastrar-aluno")?.classList.remove("active"); 
}

async function confirmarCadastroAluno() {
    const nome = $("cad-aluno-nome")?.value.trim();
    const objetivo = $("cad-aluno-objetivo")?.value.trim();
    const preco = parseFloat($("cad-aluno-preco")?.value) || 0;
    const horario = $("cad-aluno-horario")?.value.trim();

    if (!nome || !preco) {
        toast("Preencha o nome e o valor da aula.");
        return;
    }

    try {
        await addDoc(collection(db, "solicitacoes"), {
            promotorChave: chavePromotor(),
            promotorNome: dadosPerfil.nome,
            aluno: nome,
            loja: objetivo ? `Treino: ${objetivo}` : "Treino Particular",
            data: new Date().toISOString().split("T")[0],
            entrada: horario || "08:00",
            valor: preco,
            status: "aceita",
            criadoEm: serverTimestamp()
        });
        fecharModalCadastrarAluno();
        toast("✅ Aluno cadastrado com sucesso!");
        carregarAgendaDoBanco();
    } catch(e) {
        toast("Erro ao cadastrar aluno.");
    }
}

function fecharQR() {
    $("modal-qr")?.classList.remove("active");
}

Object.assign(window, {
    validarProfissional, loginComGoogle, validarCheckTermos, abrirModalTermos, aceitarTermosModal,
    abrirOpcaoMenu, fecharSubtela, salvarPerfilProfissionalCompleto, salvarDadosBancarios, salvarPrefs,
    atualizarFotoPerfil, sairModoPessoal, switchTabPersonal, mudarMesCalendario,
    abrirModalCadastrarAluno, fecharModalCadastrarAluno, confirmarCadastroAluno, 
    aceitarOferta, initMapAlunos, fecharQR, copiarLinkIndicacao: window.copiarLinkIndicacao, compartilharWhatsApp: window.compartilharWhatsApp
});
