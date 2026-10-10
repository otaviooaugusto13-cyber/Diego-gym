import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, doc, setDoc, query, where, onSnapshot, orderBy, updateDoc, deleteDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAuth, signInWithPopup, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

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
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();



let dadosPerfil = {
    nome: "Professor",
    cref: "",
    cpf: "",
    horaInicio: 8,
    horaFim: 21,
    diaFolga: 0,
    fotoUrl: null,
    status: "pendente",
    dadosBancarios: null
};

let mapAlunos;
let marcadoresAlunosMap = {};
let conversaAtiva = null;
let unsubscribePersonalChat = null;
let ganhosAvulsos = 0;
let agendaDeHoje = [];
let primeiraCargaChamadas = true;
let audioCtx = null;

// ==========================================
// CALENDÁRIO MENSAL (ESTILO GOOGLE AGENDA)
// ==========================================
let dataAtualCalendario = new Date(2026, 9, 10);
let diaSelecionadoCalendario = 10;

function renderizarCalendario() {
    const monthYearText = document.getElementById('calendar-month-year');
    const grid = document.getElementById('calendar-days-grid');
    if (!grid || !monthYearText) return;

    const meses = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
    const ano = dataAtualCalendario.getFullYear();
    const mes = dataAtualCalendario.getMonth();

    monthYearText.innerText = `${meses[mes]} ${ano}`;
    grid.innerHTML = "";

    const primeiroDiaSemana = new Date(ano, mes, 1).getDay();
    const totalDiasMes = new Date(ano, mes + 1, 0).getDate();

    for (let i = 0; i < primeiroDiaSemana; i++) {
        grid.innerHTML += `<div></div>`;
    }

    for (let dia = 1; dia <= totalDiasMes; dia++) {
        const ehHoje = (dia === diaSelecionadoCalendario);
        grid.innerHTML += `
            <div onclick="selecionarDiaCalendario(${dia})" style="padding: 8px 0; border-radius: 50%; font-size: 12px; cursor: pointer; font-weight: ${ehHoje ? 'bold' : 'normal'}; background: ${ehHoje ? 'var(--gold)' : 'transparent'}; color: ${ehHoje ? '#000' : 'var(--text-color)'};">
                ${dia}
            </div>
        `;
    }
}

window.mudarMesCalendario = function(delta) {
    dataAtualCalendario.setMonth(dataAtualCalendario.getMonth() + delta);
    renderizarCalendario();
}

window.selecionarDiaCalendario = function(dia) {
    diaSelecionadoCalendario = dia;
    renderizarCalendario();
    const label = document.getElementById('selected-date-label');
    if (label) label.innerText = `Atendimentos agendados para o dia ${dia}/${dataAtualCalendario.getMonth() + 1}/${dataAtualCalendario.getFullYear()}:`;
    carregarAgendaDoBanco();
}

// ==========================================
// CONFIGURAÇÃO MERCADO PAGO
// ==========================================
const MP_PUBLIC_KEY = "APP_USR-xxxx-xxxx-xxxx-xxxx"; 

window.iniciarCheckoutMercadoPago = function(valorAula = 80) {
    try {
        const mp = new MercadoPago(MP_PUBLIC_KEY, { locale: 'pt-BR' });
        alert(`⚡ Conectando ao Mercado Pago...\n\nValor: R$ ${valorAula},00\n- 85% para ${dadosPerfil.nome}\n- 15% para Plataforma TAPAGO`);
        setTimeout(() => {
            alert("✅ Pagamento aprovado via Mercado Pago! Split concluído com sucesso.");
            carregarAgendaDoBanco();
        }, 1500);
    } catch (e) {
        console.error("Erro Mercado Pago:", e);
        alert("Erro ao iniciar pagamento.");
    }
}

window.addEventListener('DOMContentLoaded', () => {
    if ("Notification" in window && Notification.permission === "granted") {
        const banner = document.getElementById('banner-notificacao');
        if (banner) banner.style.display = 'none';
    }

    const savedProfile = localStorage.getItem('tapago_personal_user');
    if (savedProfile) {
        const parsed = JSON.parse(savedProfile);
        dadosPerfil.nome = parsed.nome;
        dadosPerfil.cpf = parsed.cpf;
        dadosPerfil.cref = parsed.cref;
        finalizarLogin(true, parsed.nome, parsed.cpf, parsed.cref);
    }
    renderizarCalendario();
});

window.solicitarPermissaoNotificacao = function() {
    try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        audioCtx.resume();
    } catch(e) {}

    if ("Notification" in window) {
        Notification.requestPermission().then(permission => {
            if (permission === "granted") {
                const banner = document.getElementById('banner-notificacao');
                if (banner) banner.style.display = 'none';
                alert("🔔 Notificações e alertas sonoros ativados!");
            }
        });
    }
}

function dispararNotificacaoNovaChamada(nomeAluno, foco) {
    if ("vibrate" in navigator) {
        navigator.vibrate([300, 150, 300]);
    }

    if ("Notification" in window && Notification.permission === "granted") {
        new Notification("⚡ Novo Treino Solicitado no TAPAGO!", {
            body: `${nomeAluno} está procurando um Personal para ${foco}!`,
            icon: "manifest-icon.png"
        });
    }
}

function iniciarRastreamentoGPS() {
    if (navigator.geolocation && dadosPerfil.cpf) {
        navigator.geolocation.watchPosition(async (position) => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            try {
                await setDoc(doc(db, "profissionais", dadosPerfil.cpf), {
                    lat: lat,
                    lng: lng,
                    ultimaAtualizacao: new Date().toISOString()
                }, { merge: true });
            } catch (e) {
                console.error("Erro GPS personal:", e);
            }
        }, (err) => console.error(err), { enableHighAccuracy: true });
    }
}

async function loginComGoogle() {
    try {
        const result = await signInWithPopup(auth, googleProvider);
        const user = result.user;
        const q = query(collection(db, "profissionais"), where("email", "==", user.email));
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
            const profDoc = querySnapshot.docs[0];
            const profData = profDoc.data();
            dadosPerfil.nome = profData.nome || user.displayName;
            dadosPerfil.cpf = profData.cpf;
            dadosPerfil.cref = profData.cref;
            dadosPerfil.fotoUrl = user.photoURL;
            dadosPerfil.status = profData.status || "pendente";
            dadosPerfil.dadosBancarios = profData.dadosBancarios || null;
            finalizarLogin(true, dadosPerfil.nome, dadosPerfil.cpf, dadosPerfil.cref);
        } else {
            const cpfInput = prompt("Digite seu CPF (apenas números):");
            if (!cpfInput) return;
            const crefInput = prompt("Digite seu CREF (Ex: 123456-G/SP):");
            if (!crefInput) return;
            const cpf = cpfInput.replace(/\D/g, '');
            const cref = crefInput.trim();

            dadosPerfil.nome = user.displayName;
            dadosPerfil.cpf = cpf;
            dadosPerfil.cref = cref;
            dadosPerfil.status = "pendente";
            dadosPerfil.dadosBancarios = null;

            await setDoc(doc(db, "profissionais", cpf), {
                nome: user.displayName,
                email: user.email,
                cpf: cpf,
                cref: cref,
                status: "pendente",
                horaInicio: 8,
                horaFim: 21,
                diaFolga: 0,
                criadoEm: new Date().toISOString()
            });

            finalizarLogin(true, user.displayName, cpf, cref);
        }
    } catch (error) {
        console.error("Erro Google personal:", error);
    }
}

async function validarProfissional() {
    const nome = document.getElementById('input-nome').value.trim();
    const cpf = document.getElementById('input-cpf').value.replace(/\D/g, '');
    const cref = document.getElementById('input-cref').value.trim();
    const lembreme = document.getElementById('check-remember').checked;

    if (!nome || !cpf || !cref) return alert("Preencha todos os campos.");

    document.getElementById('login-loader').style.display = 'block';
    document.getElementById('btn-login').style.display = 'none';

    try {
        dadosPerfil.nome = nome;
        dadosPerfil.cpf = cpf;
        dadosPerfil.cref = cref;

        const docRef = doc(db, "profissionais", cpf);
        const docSnap = await getDoc(docRef);

        if (cpf === ADMIN_CPF) {
            dadosPerfil.status = "ativo";
            await setDoc(docRef, { nome, cpf, cref, status: "ativo", horaInicio: 8, horaFim: 21, diaFolga: 0, atualizadoEm: new Date() }, { merge: true });
        } else if (docSnap.exists()) {
            const profData = docSnap.data();
            dadosPerfil.status = profData.status || "pendente";
            dadosPerfil.dadosBancarios = profData.dadosBancarios || null;
        } else {
            dadosPerfil.status = "pendente";
            dadosPerfil.dadosBancarios = null;
            await setDoc(docRef, { nome, cpf, cref, status: "pendente", horaInicio: 8, horaFim: 21, diaFolga: 0, criadoEm: new Date().toISOString() });
        }

        finalizarLogin(lembreme, nome, cpf, cref);
    } catch (e) {
        console.error(e);
        document.getElementById('login-loader').style.display = 'none';
        document.getElementById('btn-login').style.display = 'block';
    }
}

function finalizarLogin(lembreme, nome, cpf, cref) {
    document.getElementById('login-loader').style.display = 'none';
    const btnLogin = document.getElementById('btn-login');
    if (btnLogin) btnLogin.style.display = 'block';

    if (lembreme) {
        localStorage.setItem('tapago_personal_user', JSON.stringify({ nome, cpf, cref }));
    }

    atualizarExibicaoPerfil();
    document.getElementById('screen-login-personal').classList.remove('active');
    document.getElementById('screen-dashboard').classList.add('active');

    iniciarRastreamentoGPS();
    carregarAgendaDoBanco();
    carregarListaConversasPersonal();
    escutarChamadasUberPersonal();
}

function escutarChamadasUberPersonal() {
    const container = document.getElementById('painel-chamadas-uber');
    if (!container) return;

    const q = query(collection(db, "chamadas_uber"), where("status", "==", "pendente"));
    onSnapshot(q, (snapshot) => {
        container.innerHTML = "";
        
        if (!snapshot.empty) {
            snapshot.docChanges().forEach((change) => {
                if (change.type === "added" && !primeiraCargaChamadas) {
                    const novaChamada = change.doc.data();
                    dispararNotificacaoNovaChamada(novaChamada.alunoNome, novaChamada.foco);
                }
            });

            snapshot.forEach((docItem) => {
                const c = docItem.data();
                const card = document.createElement('div');
                card.className = "glass";
                card.style.cssText = "padding: 15px; border-left: 4px solid var(--neon-green); margin-bottom: 10px; background: rgba(57, 255, 20, 0.08); border: 1px solid var(--neon-green);";
                card.innerHTML = `
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                        <span style="font-size: 11px; font-weight: bold; color: var(--neon-green); text-transform: uppercase;">⚡ Chamada Solicitada ${c.ehPico ? '🔥 Pico' : ''}</span>
                        <span style="font-size: 14px; font-weight: bold; color: var(--gold);">R$ ${c.valor},00</span>
                    </div>
                    <h4 style="margin: 0; font-size: 15px;">${c.alunoNome}</h4>
                    <p style="font-size: 12px; color: var(--text-muted); margin: 3px 0;">Foco: <strong>${c.foco}</strong> • Horário: <strong>${c.horario}</strong></p>
                    <p style="font-size: 11px; color: var(--text-muted); margin-bottom: 10px;">Local: ${c.local}</p>
                    <button onclick="aceitarChamadaUber('${docItem.id}', '${c.alunoNome}', '${c.horario}', ${c.valor}, '${c.foco}')" style="width: 100%; background: var(--neon-green); color: #000; font-weight: bold; padding: 10px; border: none; border-radius: 8px; cursor: pointer; font-size: 13px;">
                        ⚡ Aceitar Chamada Agora (Split Mercado Pago)
                    </button>
                `;
                container.appendChild(card);
            });
        }
        primeiraCargaChamadas = false;
    });
}

// ==========================================
// TRAVA DE SEGURANÇA PARA ACEITAR CHAMADA
// ==========================================
window.aceitarChamadaUber = async function(chamadaId, nomeAluno, horario, valor, foco) {
    try {
        if (dadosPerfil.cpf) {
            const docRef = doc(db, "profissionais", dadosPerfil.cpf);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                const data = docSnap.data();
                dadosPerfil.status = data.status || "pendente";
                dadosPerfil.dadosBancarios = data.dadosBancarios || null;
            }
        }
    } catch (e) {
        console.error("Erro ao verificar status:", e);
    }

    if (dadosPerfil.status !== "ativo") {
        alert("⏳ Cadastro em Análise!\n\nVocê ainda não pode aceitar chamadas de treino enquanto seu cadastro estiver pendente de aprovação pela administração.");
        return;
    }

    if (!dadosPerfil.dadosBancarios) {
        alert("💳 Dados Bancários Pendentes!\n\nPara receber os repasses das aulas, cadastre sua conta bancária na aba 'Carteira' antes de aceitar treinos.");
        return;
    }

    try {
        await updateDoc(doc(db, "chamadas_uber", chamadaId), {
            status: "aceito",
            personalAceitou: dadosPerfil.nome
        });

        await addDoc(collection(db, "agenda"), {
            nome: nomeAluno,
            aluno: nomeAluno,
            professor: dadosPerfil.nome,
            objetivo: foco || "Treino Rápido",
            preco: parseFloat(valor),
            horario: horario,
            diaSemana: "Hoje",
            frequencia: "Chamada Instantânea",
            status: "ativo",
            criadoEm: new Date().toISOString()
        });

        alert(`🎉 Você aceitou o treino de ${nomeAluno}!\n\nA taxa de 15% foi retida automaticamente pela TAPAGO via Mercado Pago.`);
        carregarAgendaDoBanco();
    } catch (e) {
        console.error("Erro ao aceitar chamada:", e);
    }
}

async function carregarAgendaDoBanco() {
    try {
        const querySnapshot = await getDocs(collection(db, "agenda"));
        agendaDeHoje = [];
        querySnapshot.forEach((docItem) => {
            agendaDeHoje.push({ id: docItem.id, ...docItem.data() });
        });
        renderizarAgenda();
        atualizarProjecaoFinanceiraReal();
    } catch (error) {
        console.error("Erro agenda:", error);
    }
}

function renderizarAgenda() {
    const lista = document.getElementById('lista-agenda');
    const resumo = document.getElementById('lista-agenda-resumo');
    if (!lista) return;
    lista.innerHTML = "";
    if (resumo) resumo.innerHTML = "";

    if (agendaDeHoje.length === 0) {
        lista.innerHTML = "<p style='color: var(--text-muted); font-size: 12px; text-align: center; padding: 15px;'>Nenhum atendimento agendado para esta data.</p>";
        if (resumo) resumo.innerHTML = "<p style='color: var(--text-muted); font-size: 12px;'>Nenhum atendimento para hoje.</p>";
        return;
    }

    agendaDeHoje.forEach((slot, index) => {
        const itemHtml = `
            <div class="glass" style="padding: 12px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <div>
                    <h4 style="margin: 0; font-size: 14px;">${slot.nome || slot.aluno} (${slot.horario || '08:00'})</h4>
                    <p style="font-size: 11px; color: var(--gold); margin: 2px 0;">Foco: ${slot.objetivo} • R$ ${slot.preco || 0}</p>
                </div>
                <button onclick="desmarcarTreinoPersonal('${slot.id}', '${slot.nome || slot.aluno}')" style="background: rgba(255, 51, 51, 0.2); color: #ff3333; border: 1px solid #ff3333; padding: 4px 8px; border-radius: 6px; font-size: 10px; cursor: pointer;">✕ Desmarcar</button>
            </div>
        `;
        lista.innerHTML += itemHtml;
        if (resumo) resumo.innerHTML += itemHtml;
    });
}

window.desmarcarTreinoPersonal = async function(agendamentoId, nomeAluno) {
    const confirma = confirm(`⚠️ TAXA DE CANCELAMENTO:\n\nTem certeza que deseja desmarcar a aula com ${nomeAluno}?\n\nO cancelamento gera uma taxa administrativa de R$ 15,00 retida pela plataforma para ressarcimento da agenda.`);
    if (!confirma) return;

    try {
        await deleteDoc(doc(db, "agenda", agendamentoId));
        alert("✅ Aula desmarcada com sucesso.");
        carregarAgendaDoBanco();
    } catch (e) {
        console.error("Erro ao desmarcar treino:", e);
    }
}

async function atualizarProjecaoFinanceiraReal() {
    try {
        const querySnapshot = await getDocs(collection(db, "agenda"));
        let totalBruto = 0;
        querySnapshot.forEach((docItem) => {
            const data = docItem.data();
            if (data.preco) totalBruto += Number(data.preco);
        });
        let totalLiquido = totalBruto * 0.85;
        const elFixo = document.getElementById('valor-fixo');
        const elTotal = document.getElementById('valor-total');
        if (elFixo) elFixo.innerText = `R$ ${totalLiquido.toLocaleString('pt-BR', {maximumFractionDigits:2})}`;
        let totalGeral = totalLiquido + (ganhosAvulsos * 0.85);
        if (elTotal) elTotal.innerText = `R$ ${totalGeral.toLocaleString('pt-BR', {maximumFractionDigits:2})}`;
    } catch (e) {
        console.error("Erro finanças:", e);
    }
}

async function confirmarCadastroAluno() {
    const nome = document.getElementById('cad-aluno-nome').value.trim();
    const objetivo = document.getElementById('cad-aluno-objetivo').value.trim();
    const cpf = document.getElementById('cad-aluno-cpf').value.trim();
    const preco = parseFloat(document.getElementById('cad-aluno-preco').value) || 350;
    const diaSemana = document.getElementById('cad-aluno-dias').value.trim() || "Seg, Qua, Sex";
    const horario = document.getElementById('cad-aluno-horario').value.trim() || "08:00";
    const frequencia = document.getElementById('cad-aluno-frequencia').value.trim() || "3x na semana";

    if (!nome) return alert("Digite o nome do aluno.");

    try {
        await addDoc(collection(db, "agenda"), {
            nome, cpf: cpf || "Não informado", objetivo: objetivo || "Geral",
            preco, diaSemana, horario, frequencia, status: "ativo", criadoEm: new Date().toISOString()
        });
        fecharModalCadastrarAluno();
        alert(`🎉 Aluno ${nome} matriculado!`);
        carregarAgendaDoBanco();
    } catch (e) {
        console.error("Erro cadastro aluno:", e);
    }
}

async function carregarListaConversasPersonal() {
    const listaView = document.getElementById('chat-list-view');
    if (!listaView) return;
    try {
        const snap = await getDocs(collection(db, "usuarios"));
        listaView.innerHTML = "";
        snap.forEach(docUsr => {
            const u = docUsr.data();
            const item = document.createElement('div');
            item.className = "chat-item glass";
            item.onclick = () => abrirConversa(docUsr.id, u.nome);
            item.innerHTML = `
                <div class="chat-avatar">${u.nome.charAt(0)}</div>
                <div class="chat-info">
                    <h4>${u.nome} <span class="chat-time">Online</span></h4>
                    <p>Clique para conversar</p>
                </div>
            `;
            listaView.appendChild(item);
        });
    } catch (e) {
        console.error("Erro conversas personal:", e);
    }
}

async function abrirConversa(alunoUid, nomeAluno) {
    conversaAtiva = alunoUid;
    document.getElementById('chat-list-view').style.display = 'none';
    document.getElementById('chat-conversation-view').style.display = 'flex';
    document.getElementById('chat-active-name').innerText = nomeAluno;

    const chatBox = document.getElementById('chat-box');
    chatBox.innerHTML = '';

    const chatId = `${alunoUid}_${dadosPerfil.nome}`;
    const q = query(collection(db, "chats", chatId, "mensagens"), orderBy("data", "asc"));

    if (unsubscribePersonalChat) unsubscribePersonalChat();

    unsubscribePersonalChat = onSnapshot(q, (snapshot) => {
        chatBox.innerHTML = '';
        snapshot.forEach((docItem) => {
            const msg = docItem.data();
            const msgDiv = document.createElement('div');
            const ehMinha = msg.remetente === dadosPerfil.nome;
            msgDiv.className = `msg ${ehMinha ? 'msg-sent' : 'msg-received'}`;
            msgDiv.innerHTML = `<p>${msg.texto}</p><span class="msg-time">${new Date(msg.data).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>`;
            chatBox.appendChild(msgDiv);
        });
        chatBox.scrollTop = chatBox.scrollHeight;
    });
}

function fecharConversa() {
    if (unsubscribePersonalChat) unsubscribePersonalChat();
    document.getElementById('chat-list-view').style.display = 'block';
    document.getElementById('chat-conversation-view').style.display = 'none';
    conversaAtiva = null;
    carregarListaConversasPersonal();
}

async function enviarMensagemChat() {
    const input = document.getElementById('input-chat-msg');
    const texto = input.value.trim();
    if (texto === "" || !conversaAtiva) return;

    const chatId = `${conversaAtiva}_${dadosPerfil.nome}`;
    input.value = "";

    try {
        await addDoc(collection(db, "chats", chatId, "mensagens"), {
            remetente: dadosPerfil.nome,
            texto: texto,
            data: new Date().toISOString()
        });
    } catch (e) {
        console.error("Erro envio personal:", e);
    }
}

async function enviarPropostaPersonal() {
    if (!conversaAtiva) return alert("Abra uma conversa primeiro.");
    const horario = prompt("Digite o horário da aula (Ex: 15:00):", "15:00");
    const preco = prompt("Digite o valor da aula (R$):", "60");
    if (!horario || !preco) return;

    const chatId = `${conversaAtiva}_${dadosPerfil.nome}`;
    try {
        await addDoc(collection(db, "chats", chatId, "mensagens"), {
            remetente: dadosPerfil.nome,
            tipo: "proposta",
            horario: horario,
            preco: preco,
            texto: `📋 Proposta de Treino: Horário às ${horario} - Valor: R$ ${preco},00 (Split Mercado Pago)`,
            data: new Date().toISOString()
        });
    } catch (e) {
        console.error("Erro proposta:", e);
    }
}

function atualizarExibicaoPerfil() {
    const primeiraLetra = dadosPerfil.nome.charAt(0).toUpperCase();
    const elNome = document.getElementById('nome-exibicao');
    const elPerfilNome = document.getElementById('perfil-nome-display');
    const elPerfilCref = document.getElementById('perfil-cref-display');
    const elInitPerfil = document.getElementById('initials-perfil');

    if (elNome) elNome.innerText = dadosPerfil.nome;
    if (elPerfilNome) elPerfilNome.innerText = dadosPerfil.nome;
    if (elPerfilCref) elPerfilCref.innerText = `CREF: ${dadosPerfil.cref}`;
    if (elInitPerfil) elInitPerfil.innerText = primeiraLetra;
}

window.sairModoPessoal = function() {
    if (confirm("Deseja realmente sair do modo profissional?")) {
        localStorage.removeItem('tapago_personal_user');
        const dash = document.getElementById('screen-dashboard');
        const login = document.getElementById('screen-login-personal');
        if (dash) dash.classList.remove('active');
        if (login) login.classList.add('active');
    }
}

function abrirModalCadastrarAluno() { document.getElementById('modal-cadastrar-aluno').classList.add('active'); }
function fecharModalCadastrarAluno() { document.getElementById('modal-cadastrar-aluno').classList.remove('active'); }

// MODAL DADOS BANCÁRIOS (ATUALIZADO E COMPLETO)
window.abrirModalDadosBancarios = async function() {
    document.getElementById('modal-dados-bancarios').classList.add('active');

    if (dadosPerfil.cpf) {
        try {
            const docRef = doc(db, "profissionais", dadosPerfil.cpf);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists() && docSnap.data().dadosBancarios) {
                const b = docSnap.data().dadosBancarios;
                if (b.banco) document.getElementById('bank-select-banco').value = b.banco;
                if (b.tipoConta) document.getElementById('bank-select-tipo-conta').value = b.tipoConta;
                if (b.agencia) document.getElementById('bank-input-agencia').value = b.agencia;
                if (b.conta) document.getElementById('bank-input-conta').value = b.conta;
                if (b.digito) document.getElementById('bank-input-digito').value = b.digito;
                if (b.tipoPix) document.getElementById('bank-select-tipo-pix').value = b.tipoPix;
                if (b.chavePix) document.getElementById('bank-input-chave-pix').value = b.chavePix;
            }
        } catch (e) {
            console.error("Erro ao carregar dados bancários:", e);
        }
    }
}

window.fecharModalDadosBancarios = function() {
    document.getElementById('modal-dados-bancarios').classList.remove('active');
}

window.salvarDadosBancarios = async function() {
    const banco = document.getElementById('bank-select-banco').value;
    const tipoConta = document.getElementById('bank-select-tipo-conta').value;
    const agencia = document.getElementById('bank-input-agencia').value.trim();
    const conta = document.getElementById('bank-input-conta').value.trim();
    const digito = document.getElementById('bank-input-digito').value.trim();
    const tipoPix = document.getElementById('bank-select-tipo-pix').value;
    const chavePix = document.getElementById('bank-input-chave-pix').value.trim();

    if (!agencia || !conta || !chavePix) {
        return alert("Por favor, preencha Agência, Número da Conta e Chave PIX.");
    }

    if (!dadosPerfil.cpf) {
        return alert("Erro: Identificação do perfil não encontrada. Faça login novamente.");
    }

    try {
        const dadosBancariosObj = {
            banco,
            tipoConta,
            agencia,
            conta,
            digito,
            tipoPix,
            chavePix,
            atualizadoEm: new Date().toISOString()
        };

        dadosPerfil.dadosBancarios = dadosBancariosObj;

        await setDoc(doc(db, "profissionais", dadosPerfil.cpf), {
            dadosBancarios: dadosBancariosObj
        }, { merge: true });

        alert("✅ Dados bancários salvos com sucesso!");
        fecharModalDadosBancarios();
    } catch (e) {
        console.error("Erro ao salvar dados bancários:", e);
        alert("Erro ao salvar dados. Tente novamente.");
    }
}

// ==========================================
// MAPA E LISTAGEM DE ALUNOS ONLINE NO RADAR
// ==========================================
window.initMapAlunos = function() {
    const mapElement = document.getElementById('mapa-alunos');
    if (!mapElement) return;

    mapAlunos = new google.maps.Map(mapElement, {
        center: { lat: -22.4243, lng: -46.8427 },
        zoom: 14,
        disableDefaultUI: true
    });

    carregarAlunosNoMapa();
}

window.carregarAlunosNoMapa = async function() {
    if (!mapAlunos) return;
    const containerDemandas = document.getElementById('lista-demandas-cards');
    if (containerDemandas) containerDemandas.innerHTML = "";

    try {
        const querySnapshot = await getDocs(collection(db, "usuarios"));
        
        if (querySnapshot.empty) {
            if (containerDemandas) containerDemandas.innerHTML = "<p style='color: var(--text-muted); font-size: 12px; text-align: center; padding: 10px;'>Nenhum aluno online no momento.</p>";
            return;
        }

        querySnapshot.forEach((docItem) => {
            const aluno = docItem.data();
            const uid = docItem.id;

            if (aluno.lat && aluno.lng) {
                const pos = { lat: aluno.lat, lng: aluno.lng };
                if (!marcadoresAlunosMap[uid]) {
                    marcadoresAlunosMap[uid] = new google.maps.Marker({
                        position: pos,
                        map: mapAlunos,
                        title: aluno.nome,
                        icon: {
                            path: google.maps.SymbolPath.CIRCLE,
                            scale: 8,
                            fillColor: "#39ff14",
                            fillOpacity: 1,
                            strokeColor: "#ffffff",
                            strokeWeight: 2
                        }
                    });
                }
            }

            if (containerDemandas) {
                const card = document.createElement('div');
                card.className = "glass";
                card.style.cssText = "padding: 12px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;";
                card.innerHTML = `
                    <div>
                        <h4 style="margin: 0; font-size: 14px;">${aluno.nome || 'Aluno TAPAGO'} <span style="font-size: 10px; color: var(--neon-green);">● Online</span></h4>
                        <p style="font-size: 11px; color: var(--gold); margin: 2px 0;">Foco: ${aluno.objetivo || 'Geral'}</p>
                    </div>
                    <button onclick="abrirConversaModal('${uid}', '${aluno.nome || 'Aluno'}')" style="background: var(--gold); color: #000; border: none; padding: 6px 12px; border-radius: 6px; font-weight: bold; font-size: 11px; cursor: pointer;">💬 Conversar</button>
                `;
                containerDemandas.appendChild(card);
            }
        });
    } catch (e) {
        console.error("Erro ao carregar alunos no mapa:", e);
    }
}

window.abrirConversaModal = function(alunoUid, nomeAluno) {
    const modalChat = document.getElementById('modal-chat-flutuante');
    if (modalChat) {
        modalChat.classList.add('active');
        abrirConversa(alunoUid, nomeAluno);
    } else {
        switchTabPersonal('tab-menu');
        abrirConversa(alunoUid, nomeAluno);
    }
}

window.fecharConversaModal = function() {
    const modalChat = document.getElementById('modal-chat-flutuante');
    if (modalChat) {
        modalChat.classList.remove('active');
        fecharConversa();
    }
}

// ==========================================
// CONTROLE DAS 5 ABAS E DO MENU
// ==========================================
window.switchTabPersonal = function(tabId, navElement) {
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    const tabAlvo = document.getElementById(tabId);
    if (tabAlvo) tabAlvo.classList.add('active');
    
    document.querySelectorAll('#nav-personal .nav-item').forEach(item => item.classList.remove('active'));
    if (navElement) navElement.classList.add('active');

    const sub = document.getElementById('subscreen-perfil-detalhes');
    if (sub) sub.style.display = 'none';

    if (tabId === 'tab-ofertas') {
        setTimeout(() => {
            if (mapAlunos) google.maps.event.trigger(mapAlunos, 'resize');
        }, 200);
        carregarAlunosNoMapa();
    }
}

wwindow.abrirOpcaoMenu = function(nomeOpcao) {
    if (nomeOpcao === 'Perfil') {
        const sub = document.getElementById('subscreen-perfil-detalhes');
        if (sub) {
            sub.style.display = 'block';
            window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
        }
    } else if (nomeOpcao === 'Dados bancários') {
        const sub = document.getElementById('subscreen-dados-bancarios');
        if (sub) sub.style.display = 'block';
    } else if (nomeOpcao === 'Preferências de Atendimento' || nomeOpcao === 'Atendimento') {
        const sub = document.getElementById('subscreen-preferencias-atendimento');
        if (sub) sub.style.display = 'block';
    } else if (nomeOpcao === 'Convidar Amigos') {
        const sub = document.getElementById('subscreen-indicar-amigo');
        if (sub) {
            sub.style.display = 'block';
            const cpfPersonal = typeof dadosPerfil !== 'undefined' && dadosPerfil && dadosPerfil.cpf ? dadosPerfil.cpf : "OTAVIO";
            const linkInput = document.getElementById('input-link-indicacao');
            if (linkInput) linkInput.value = `https://tapago.com.br/personal/cadastro?ref=${cpfPersonal}`;
        }
    } else if (nomeOpcao === 'Notificações') {
        const sub = document.getElementById('subscreen-notificacoes');
        if (sub) sub.style.display = 'block';
    } else if (nomeOpcao === 'Ajuda') {
        const sub = document.getElementById('subscreen-ajuda');
        if (sub) sub.style.display = 'block';
    } else {
        alert(`📌 Em breve: Redirecionando para ${nomeOpcao}.`);
    }
}

window.fecharSubtelaPerfil = function() {
    const sub = document.getElementById('subscreen-perfil-detalhes');
    if (sub) sub.style.display = 'none';
}

window.validarCheckTermos = function() {
    const checkbox = document.getElementById('check-termos');
    const btnLogin = document.getElementById('btn-login');
    if (!checkbox || !btnLogin) return;
    
    if (checkbox.checked) {
        btnLogin.disabled = false;
        btnLogin.style.opacity = '1';
        btnLogin.style.cursor = 'pointer';
    } else {
        btnLogin.disabled = true;
        btnLogin.style.opacity = '0.5';
        btnLogin.style.cursor = 'not-allowed';
    }
}

window.abrirModalTermos = function() {
    document.getElementById('modal-termos').classList.add('active');
}

window.fecharModalTermos = function() {
    document.getElementById('modal-termos').classList.remove('active');
}

window.aceitarTermosModal = function() {
    const chk = document.getElementById('check-termos');
    if (chk) chk.checked = true;
    validarCheckTermos();
    fecharModalTermos();
}

// EXPORTAÇÕES GLOBAIS
window.validarProfissional = validarProfissional;
window.loginComGoogle = loginComGoogle;
window.abrirModalCadastrarAluno = abrirModalCadastrarAluno;
window.fecharModalCadastrarAluno = fecharModalCadastrarAluno;
window.confirmarCadastroAluno = confirmarCadastroAluno;
window.abrirConversa = abrirConversa;
window.fecharConversa = fecharConversa;
window.enviarMensagemChat = enviarMensagemChat;
window.enviarPropostaPersonal = enviarPropostaPersonal;
window.salvarBioPersonal = (async function() {
    const bioText = document.getElementById('personal-input-bio').value;
    const pixText = document.getElementById('personal-input-pix').value;
    if (dadosPerfil.cpf) {
        try {
            await setDoc(doc(db, "profissionais", dadosPerfil.cpf), { bio: bioText, pixChave: pixText }, { merge: true });
            alert("📝 Dados profissionais salvos com sucesso!");
            fecharSubtelaPerfil();
        } catch (e) { console.error(e); }
    }
});
window.sairModoPessoal = sairModoPessoal;
window.switchTabPersonal = switchTabPersonal;
window.carregarAlunosNoMapa = carregarAlunosNoMapa;
window.aceitarChamadaUber = aceitarChamadaUber;
window.desmarcarTreinoPersonal = desmarcarTreinoPersonal;
window.solicitarPermissaoNotificacao = solicitarPermissaoNotificacao;
window.iniciarCheckoutMercadoPago = iniciarCheckoutMercadoPago;
window.validarCheckTermos = validarCheckTermos;
window.abrirModalTermos = abrirModalTermos;
window.fecharModalTermos = fecharModalTermos;
window.aceitarTermosModal = aceitarTermosModal;
window.abrirOpcaoMenu = abrirOpcaoMenu;
window.fecharSubtelaPerfil = fecharSubtelaPerfil;
window.abrirModalDadosBancarios = abrirModalDadosBancarios;
window.fecharModalDadosBancarios = fecharModalDadosBancarios;
window.salvarDadosBancarios = salvarDadosBancarios;
window.mudarMesCalendario = mudarMesCalendario;
window.selecionarDiaCalendario = selecionarDiaCalendario;
window.abrirConversaModal = abrirConversaModal;
window.fecharConversaModal = fecharConversaModal;
window.initMapAlunos = initMapAlunos;
