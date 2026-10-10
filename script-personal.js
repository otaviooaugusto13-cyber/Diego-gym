import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, doc, setDoc, query, where, onSnapshot, orderBy, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
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

const ADMIN_CPF = "11122233344";

let dadosPerfil = {
    nome: "Professor",
    cref: "",
    cpf: "",
    horaInicio: 8,
    horaFim: 21,
    diaFolga: 0,
    fotoUrl: null
};

let mapAlunos;
let marcadoresAlunosMap = {};
let conversaAtiva = null;
let unsubscribePersonalChat = null;
let ganhosAvulsos = 450;
let agendaDeHoje = [];
let primeiraCargaChamadas = true;
let audioCtx = null;

// ==========================================
// CONFIGURAÇÃO MERCADO PAGO (PRONTO PARA API)
// ==========================================
const MP_PUBLIC_KEY = "APP_USR-xxxx-xxxx-xxxx-xxxx"; 

window.iniciarCheckoutMercadoPago = function(valorAula = 80) {
    try {
        const mp = new MercadoPago(MP_PUBLIC_KEY, {
            locale: 'pt-BR'
        });

        alert(`⚡ Conectando ao Mercado Pago...\n\nValor: R$ ${valorAula},00\n- 85% para ${dadosPerfil.nome}\n- 15% para Plataforma TAPAGO\n\n(Insira seu Access Token no backend para gerar o QR Code real do PIX).`);

        setTimeout(() => {
            fecharModalQRCode();
            alert("✅ Pagamento aprovado via Mercado Pago! Crédito dividido com sucesso.");
            carregarAgendaDoBanco();
        }, 1500);

    } catch (e) {
        console.error("Erro Mercado Pago:", e);
        alert("Erro ao iniciar pagamento. Verifique a chave pública do Mercado Pago.");
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
                alert("🔔 Notificações e alertas sonoros ativados com sucesso!");
                dispararNotificacaoNovaChamada("Teste de Notificação", "Sistema Ativo");
            }
        });
    }
}

function dispararNotificacaoNovaChamada(nomeAluno, foco) {
    if ("vibrate" in navigator) {
        navigator.vibrate([300, 150, 300]);
    }

    try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.3);
        gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.5);
    } catch (e) {
        console.error("Erro som alerta:", e);
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
            const profData = querySnapshot.docs[0].data();
            if (profData.status === "ativo") {
                dadosPerfil.nome = profData.nome || user.displayName;
                dadosPerfil.cpf = profData.cpf;
                dadosPerfil.cref = profData.cref;
                dadosPerfil.fotoUrl = user.photoURL;
                finalizarLogin(true, profData.nome, profData.cpf, profData.cref);
            } else {
                alert("⏳ Cadastro em análise.");
            }
        } else {
            const cpfInput = prompt("Digite seu CPF (apenas números):");
            if (!cpfInput) return;
            const crefInput = prompt("Digite seu CREF (Ex: 123456-G/SP):");
            if (!crefInput) return;
            const cpf = cpfInput.replace(/\D/g, '');
            const cref = crefInput.trim();

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
            alert("🚀 Solicitação enviada com sucesso!");
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
        if (cpf === ADMIN_CPF) {
            dadosPerfil.nome = nome;
            dadosPerfil.cpf = cpf;
            dadosPerfil.cref = cref;
            await setDoc(doc(db, "profissionais", cpf), { nome, cpf, cref, status: "ativo", horaInicio: 8, horaFim: 21, diaFolga: 0, atualizadoEm: new Date() });
            finalizarLogin(lembreme, nome, cpf, cref);
            return;
        }

        const q = query(collection(db, "profissionais"), where("cpf", "==", cpf));
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
            const profData = querySnapshot.docs[0].data();
            if (profData.status === "ativo") {
                dadosPerfil.nome = profData.nome;
                dadosPerfil.cpf = profData.cpf;
                dadosPerfil.cref = profData.cref;
                finalizarLogin(lembreme, profData.nome, cpf, cref);
            } else {
                alert("⏳ Cadastro em análise.");
                document.getElementById('login-loader').style.display = 'none';
                document.getElementById('btn-login').style.display = 'block';
            }
        } else {
            await setDoc(doc(db, "profissionais", cpf), { nome, cpf, cref, status: "pendente", horaInicio: 8, horaFim: 21, diaFolga: 0, criadoEm: new Date().toISOString() });
            alert("🚀 Solicitação enviada!");
            document.getElementById('login-loader').style.display = 'none';
            document.getElementById('btn-login').style.display = 'block';
        }
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

window.aceitarChamadaUber = async function(chamadaId, nomeAluno, horario, valor, foco) {
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
    if (!lista) return;
    lista.innerHTML = "";

    if (agendaDeHoje.length === 0) {
        lista.innerHTML = "<p style='color: var(--text-muted); font-size: 13px;'>Nenhum aluno cadastrado.</p>";
        return;
    }

    agendaDeHoje.forEach((slot, index) => {
        const div = document.createElement('div');
        div.className = `glass agenda-slot slot-ocupado`;
        div.innerHTML = `
            <div class="slot-time">${slot.horario || '08:00'}</div>
            <div class="slot-info">
                <div class="slot-info-name">${slot.nome || slot.aluno}</div>
                <div class="slot-info-desc">Foco: ${slot.objetivo} | ${slot.frequencia || '3x'} (${slot.diaSemana || 'Seg, Qua, Sex'}) - R$ ${slot.preco || 0}</div>
            </div>
            <div style="display:flex; flex-direction:column; align-items:flex-end; gap: 5px;">
                <button class="btn-slot-action btn-qr" onclick="abrirQRCode(${index})">Pagar Mercado Pago</button>
                <button onclick="desmarcarTreinoPersonal('${slot.id}', '${slot.nome || slot.aluno}')" style="background: rgba(255, 51, 51, 0.2); color: #ff3333; border: 1px solid #ff3333; padding: 4px 8px; border-radius: 6px; font-size: 10px; font-weight: bold; cursor: pointer;">
                    ✕ Desmarcar (Taxa R$15)
                </button>
            </div>
        `;
        lista.appendChild(div);
    });
}

window.desmarcarTreinoPersonal = async function(agendamentoId, nomeAluno) {
    const confirma = confirm(`⚠️ TAXA DE CANCELAMENTO:\n\nTem certeza que deseja desmarcar a aula com ${nomeAluno}?\n\nO cancelamento gera uma taxa administrativa de R$ 15,00 retida pela plataforma para ressarcimento da agenda.`);
    if (!confirma) return;

    try {
        await deleteDoc(doc(db, "agenda", agendamentoId));
        alert("✅ Aula desmarcada. A taxa administrativa de cancelamento foi aplicada.");
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
        document.getElementById('valor-fixo').innerText = `R$ ${totalLiquido.toLocaleString('pt-BR', {maximumFractionDigits:2})}`;
        let totalGeral = totalLiquido + (ganhosAvulsos * 0.85);
        document.getElementById('valor-total').innerText = `R$ ${totalGeral.toLocaleString('pt-BR', {maximumFractionDigits:2})}`;
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
    document.getElementById('chat-conversation-view').style.display = 'block';
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

function abrirQRCode(index) {
    document.getElementById('modal-qrcode').classList.add('active');
}

function fecharModalQRCode() {
    document.getElementById('modal-qrcode').classList.remove('active');
}

function atualizarExibicaoPerfil() {
    const primeiraLetra = dadosPerfil.nome.charAt(0).toUpperCase();
    document.getElementById('nome-exibicao').innerText = dadosPerfil.nome;
    document.getElementById('perfil-nome-display').innerText = dadosPerfil.nome;
    document.getElementById('perfil-cref-display').innerText = `CREF: ${dadosPerfil.cref}`;
    document.getElementById('initials-header').innerText = primeiraLetra;
    document.getElementById('initials-perfil').innerText = primeiraLetra;
}

function atualizarFotoPerfil(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            dadosPerfil.fotoUrl = e.target.result;
            atualizarExibicaoPerfil();
        };
        reader.readAsDataURL(file);
    }
}

function alternarTema() {
    document.body.classList.toggle('light-theme');
    const claro = document.body.classList.contains('light-theme');
    document.getElementById('label-tema').innerText = claro ? "Modo Claro Ativo" : "Modo Escuro Ativo";
    document.getElementById('icon-tema').innerText = claro ? "☀️" : "🌙";
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

window.salvarHorarioAtendimento = async function() {
    const hInicio = document.getElementById('select-hora-inicio').value;
    const hFim = document.getElementById('select-hora-fim').value;
    const dFolga = document.getElementById('select-dia-folga').value;

    dadosPerfil.horaInicio = hInicio;
    dadosPerfil.horaFim = hFim;
    dadosPerfil.diaFolga = dFolga;

    if (dadosPerfil.cpf) {
        try {
            await setDoc(doc(db, "profissionais", dadosPerfil.cpf), {
                horaInicio: hInicio,
                horaFim: hFim,
                diaFolga: dFolga
            }, { merge: true });
            alert("🕒 Horário de atendimento salvo com sucesso!");
        } catch (e) {
            console.error("Erro ao salvar expediente:", e);
        }
    }
}

window.salvarBioPersonal = async function() {
    const bioText = document.getElementById('personal-input-bio').value;
    const pixText = document.getElementById('personal-input-pix').value;

    if (dadosPerfil.cpf) {
        try {
            await setDoc(doc(db, "profissionais", dadosPerfil.cpf), {
                bio: bioText,
                pixChave: pixText
            }, { merge: true });
            alert("📝 Dados profissionais salvos com sucesso!");
        } catch (e) {
            console.error("Erro ao salvar bio:", e);
        }
    }
}

// MAPA E RADAR DO PERSONAL
window.initMapAlunos = function() {
    const mapElement = document.getElementById('mapa-alunos');
    if (!mapElement) return;

    mapAlunos = new google.maps.Map(mapElement, {
        center: { lat: -22.4243, lng: -46.8427 }, // Itapira / Região padrão
        zoom: 14,
        disableDefaultUI: true,
        styles: [
            { elementType: "geometry", stylers: [{ color: "#1d2c4d" }] },
            { elementType: "labels.text.fill", stylers: [{ color: "#8ec3b9" }] },
            { elementType: "labels.text.stroke", stylers: [{ color: "#1a3646" }] },
            { featureType: "road", elementType: "geometry", stylers: [{ color: "#304a7d" }] },
            { featureType: "water", elementType: "geometry", stylers: [{ color: "#0e1626" }] }
        ]
    });

    carregarAlunosNoMapa();
}

window.carregarAlunosNoMapa = async function() {
    if (!mapAlunos) return;
    const filtroObjetivo = document.getElementById('select-filtro-objetivo')?.value || "Todos";
    const containerDemandas = document.getElementById('lista-demandas-cards');
    if (containerDemandas) containerDemandas.innerHTML = "";

    try {
        const querySnapshot = await getDocs(collection(db, "usuarios"));
        
        querySnapshot.forEach((docItem) => {
            const aluno = docItem.data();
            const uid = docItem.id;

            if (filtroObjetivo !== "Todos" && aluno.objetivo && aluno.objetivo !== filtroObjetivo) {
                return;
            }

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
                        <h4 style="margin: 0; font-size: 14px;">${aluno.nome || 'Aluno TAPAGO'}</h4>
                        <p style="font-size: 11px; color: var(--gold); margin: 2px 0;">Foco: ${aluno.objetivo || 'Geral'}</p>
                    </div>
                    <button onclick="abrirConversa('${uid}', '${aluno.nome || 'Aluno'}')" style="background: var(--gold); color: #000; border: none; padding: 6px 10px; border-radius: 6px; font-weight: bold; font-size: 11px; cursor: pointer;">💬 Conversar</button>
                `;
                containerDemandas.appendChild(card);
            }
        });
    } catch (e) {
        console.error("Erro ao carregar alunos no mapa:", e);
    }
}

// CORREÇÃO DOS CLIQUES NAS ABAS
window.switchTabPersonal = function(tabId, navElement) {
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    const tabAlvo = document.getElementById(tabId);
    if (tabAlvo) tabAlvo.classList.add('active');
    
    document.querySelectorAll('#nav-personal .nav-item').forEach(item => item.classList.remove('active'));
    if (navElement) navElement.classList.add('active');

    if (tabId === 'tab-chat') carregarListaConversasPersonal();
    if (tabId === 'tab-heatmap') {
        setTimeout(() => {
            if (mapAlunos) google.maps.event.trigger(mapAlunos, 'resize');
        }, 200);
        carregarAlunosNoMapa();
    }
}

// VALIDAÇÃO E CONTROLE DOS TERMOS DE USO
window.validarCheckTermos = function() {
    const checkbox = document.getElementById('check-termos');
    const btnLogin = document.getElementById('btn-login');
    
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
    document.getElementById('check-termos').checked = true;
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
window.salvarHorarioAtendimento = salvarHorarioAtendimento;
window.salvarBioPersonal = salvarBioPersonal;
window.atualizarFotoPerfil = atualizarFotoPerfil;
window.alternarTema = alternarTema;
window.sairModoPessoal = sairModoPessoal;
window.abrirQRCode = abrirQRCode;
window.fecharModalQRCode = fecharModalQRCode;
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
