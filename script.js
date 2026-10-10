import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, doc, setDoc, query, where, onSnapshot, orderBy, deleteDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

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

let alunoLogado = null;
let mapRadar;
let marcadoresPersonal = {};
let conversaAtivaPersonal = null;
let avaliacaoEstrelasSelecionadas = 5;
let unsubscribeChat = null;

window.addEventListener('DOMContentLoaded', () => {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            alunoLogado = {
                uid: user.uid,
                nome: user.displayName || "Aluno",
                email: user.email,
                foto: user.photoURL
            };
            iniciarAppAluno();
        }
    });
});

async function loginGoogleAluno() {
    try {
        const result = await signInWithPopup(auth, googleProvider);
        const user = result.user;
        alunoLogado = {
            uid: user.uid,
            nome: user.displayName || "Aluno",
            email: user.email,
            foto: user.photoURL
        };
        await setDoc(doc(db, "usuarios", user.uid), {
            nome: alunoLogado.nome,
            email: alunoLogado.email,
            foto: alunoLogado.foto || "",
            criadoEm: new Date().toISOString()
        }, { merge: true });
        iniciarAppAluno();
    } catch (error) {
        console.error("Erro login aluno:", error);
    }
}

function iniciarAppAluno() {
    document.getElementById('display-name-home').innerText = alunoLogado.nome;
    document.getElementById('display-name-profile').innerText = alunoLogado.nome;
    
    const initial = alunoLogado.nome.charAt(0).toUpperCase();
    const mainAvatar = document.getElementById('main-user-avatar');
    const profileSpan = document.getElementById('display-avatar-profile');
    const profileImg = document.getElementById('img-aluno-perfil-preview');

    if (mainAvatar) {
        mainAvatar.innerText = initial;
        if (alunoLogado.foto) {
            mainAvatar.innerHTML = `<img src="${alunoLogado.foto}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
        }
    }

    if (profileSpan && profileImg) {
        if (alunoLogado.foto) {
            profileImg.src = alunoLogado.foto;
            profileImg.style.display = 'block';
            profileSpan.style.display = 'none';
        } else {
            profileSpan.innerText = initial;
            profileImg.style.display = 'none';
            profileSpan.style.display = 'block';
        }
    }

    const btnWp = document.getElementById('btn-whatsapp-suporte');
    if (btnWp) btnWp.style.display = 'none';

    navTo('screen-main');
    setTimeout(() => { if (mapRadar) google.maps.event.trigger(mapRadar, 'resize'); }, 400);
    escutarPersonaisEmTempoReal();
    carregarListaConversasAluno();
    carregarProximoAgendamentoAluno();
}

function calcularPrecoDinamico() {
    const horaAtual = new Date().getHours();
    const ehPico = (horaAtual >= 6 && horaAtual <= 8) || (horaAtual >= 17 && horaAtual <= 20);
    return {
        valor: ehPico ? 80 : 60,
        ehPico: ehPico
    };
}

window.solicitarTreinoModoUber = async function() {
    if (!alunoLogado) return alert("Faça login para solicitar um treino.");
    const horario = document.getElementById('solicitacao-horario').value;
    const foco = document.getElementById('solicitacao-foco').value;
    const local = document.getElementById('solicitacao-local').value.trim() || "Localização Atual (GPS)";

    const tarifa = calcularPrecoDinamico();

    try {
        await addDoc(collection(db, "chamadas_uber"), {
            alunoId: alunoLogado.uid,
            alunoNome: alunoLogado.nome,
            horario: horario,
            foco: foco,
            local: local,
            valor: tarifa.valor,
            ehPico: tarifa.ehPico,
            status: "pendente",
            criadoEm: new Date().toISOString()
        });
        
        const msgPico = tarifa.ehPico ? "\n⚡ (Tarifa ajustada para Horário de Pico nas Academias: R$ 80,00)" : "";
        alert(`🚀 Chamada enviada em TEMPO REAL para os personais da área!${msgPico}\n\nAguarde o aceite de um profissional...`);
    } catch (e) {
        console.error("Erro ao solicitar treino:", e);
    }
}

async function carregarProximoAgendamentoAluno() {
    const container = document.getElementById('card-proximo-treino-conteudo');
    if (!container || !alunoLogado) return;

    try {
        const q = query(collection(db, "agenda"), where("nome", "==", alunoLogado.nome));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            container.innerHTML = `
                <p style="font-size: 13px; color: var(--text-muted); margin: 5px 0;">Nenhum treino agendado no momento.</p>
                <small style="font-size: 11px; color: var(--gold);">Combine um horário pelo chat com um personal!</small>
            `;
            return;
        }

        let agendamentoDocId = null;
        let proximoAgendamento = null;

        querySnapshot.forEach((docItem) => {
            agendamentoDocId = docItem.id;
            proximoAgendamento = docItem.data();
        });

        if (proximoAgendamento) {
            const hojeStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
            const horaClean = (proximoAgendamento.horario || "15:00").replace(':', '') + '00';
            const gCalUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=Treino+TAPAGO&dates=${hojeStr}T${horaClean}/${hojeStr}T${parseInt(proximoAgendamento.horario||15)+1}0000&details=Treino+confirmado+via+TAPAGO`;

            container.innerHTML = `
                <div style="margin-top: 5px;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <h3 style="font-size: 15px; font-weight: bold; margin: 0; color: var(--text-color);">${proximoAgendamento.frequencia || 'Aula Confirmada'}</h3>
                            <p style="font-size: 12px; color: var(--text-muted); margin: 2px 0 0 0;">Horário: <strong>${proximoAgendamento.horario || '08:00'}</strong> • R$ ${proximoAgendamento.preco || 60},00</p>
                        </div>
                        <a href="${gCalUrl}" target="_blank" style="background: var(--neon-green); color: #000; text-decoration: none; padding: 6px 10px; border-radius: 6px; font-size: 11px; font-weight: bold;">Google Agenda 📅</a>
                    </div>
                    <button onclick="desmarcarTreinoAluno('${agendamentoDocId}')" style="margin-top: 10px; width: 100%; background: rgba(255, 51, 51, 0.15); color: #ff3333; border: 1px solid #ff3333; padding: 6px; border-radius: 6px; font-size: 11px; font-weight: bold; cursor: pointer;">
                        ✕ Desmarcar Treino (Taxa R$ 15,00)
                    </button>
                </div>
            `;
        }
    } catch (e) {
        console.error("Erro ao carregar agendamento:", e);
    }
}

window.desmarcarTreinoAluno = async function(agendamentoId) {
    const confirma = confirm("⚠️ TAXA DE CANCELAMENTO:\n\nTem certeza que deseja desmarcar o treino?\n\nO cancelamento de última hora acarreta uma taxa administrativa de R$ 15,00 rebatida na sua conta.");
    if (!confirma) return;

    try {
        await deleteDoc(doc(db, "agenda", agendamentoId));
        alert("✅ Treino desmarcado com sucesso.");
        carregarProximoAgendamentoAluno();
    } catch (e) {
        console.error("Erro ao desmarcar treino:", e);
    }
}

window.atualizarFotoPerfilAluno = function(event) {
    const file = event.target.files[0];
    if (file && alunoLogado) {
        const reader = new FileReader();
        reader.onload = async function(e) {
            const base64Img = e.target.result;
            alunoLogado.foto = base64Img;
            
            const profileImg = document.getElementById('img-aluno-perfil-preview');
            const profileSpan = document.getElementById('display-avatar-profile');
            if (profileImg && profileSpan) {
                profileImg.src = base64Img;
                profileImg.style.display = 'block';
                profileSpan.style.display = 'none';
            }
            const mainAvatar = document.getElementById('main-user-avatar');
            if (mainAvatar) {
                mainAvatar.innerHTML = `<img src="${base64Img}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
            }

            try {
                await setDoc(doc(db, "usuarios", alunoLogado.uid), {
                    foto: base64Img
                }, { merge: true });
                alert("✅ Foto de perfil atualizada com sucesso!");
            } catch (err) {
                console.error("Erro ao salvar foto no Firestore:", err);
            }
        };
        reader.readAsDataURL(file);
    }
}

async function logoutAluno() {
    if (confirm("Deseja realmente sair?")) {
        await signOut(auth);
        alunoLogado = null;
        const btnWp = document.getElementById('btn-whatsapp-suporte');
        if (btnWp) btnWp.style.display = 'flex';
        navTo('screen-login');
    }
}

function navTo(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
}

function switchTab(tabId, navElement) {
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    if (navElement) navElement.classList.add('active');

    if (tabId === 'tab-home') {
        setTimeout(() => { if (mapRadar) google.maps.event.trigger(mapRadar, 'resize'); }, 200);
    }
    if (tabId === 'tab-mensagens') carregarListaConversasAluno();
    if (tabId === 'tab-perfil') carregarProximoAgendamentoAluno();
}

function toggleTheme() {
    if (document.getElementById('theme-toggle').checked) {
        document.body.classList.add('light-theme');
    } else {
        document.body.classList.remove('light-theme');
    }
}

window.initMap = function() {
    const mapaElemento = document.getElementById("mapa-quadrado");
    if (!mapaElemento) return;
    const pontoInicial = { lat: -22.4389, lng: -46.8258 };
    mapRadar = new google.maps.Map(mapaElemento, {
        zoom: 14,
        center: pontoInicial,
        disableDefaultUI: true
    });
}

function estaNoHorarioTrabalho(data) {
    const agora = new Date();
    const horaAtual = agora.getHours();
    const diaSemana = agora.getDay();
    const inicio = data.horaInicio ? parseInt(data.horaInicio) : 8;
    const fim = data.horaFim ? parseInt(data.horaFim) : 21;
    const diaFolga = data.diaFolga !== undefined ? parseInt(data.diaFolga) : 0;

    if (diaSemana === diaFolga) return false;
    if (horaAtual < inicio || horaAtual >= fim) return false;
    return true;
}

function escutarPersonaisEmTempoReal() {
    const container = document.getElementById('lista-personais-reais');
    if (!container) return;

    onSnapshot(collection(db, "profissionais"), (snapshot) => {
        container.innerHTML = "";
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition((pos) => {
                const localAluno = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                if (mapRadar) mapRadar.setCenter(localAluno);
                processarSnapshotPersonais(snapshot, localAluno, container);
            }, () => {
                processarSnapshotPersonais(snapshot, { lat: -22.4389, lng: -46.8258 }, container);
            });
        } else {
            processarSnapshotPersonais(snapshot, { lat: -22.4389, lng: -46.8258 }, container);
        }
    });
}

function processarSnapshotPersonais(snapshot, localAluno, container) {
    let count = 0;
    snapshot.forEach((docItem) => {
        const data = docItem.data();
        if (data.status === "ativo") {
            count++;
            const onlinePorHorario = estaNoHorarioTrabalho(data);
            const pLat = data.lat || (-22.4389 + (count * 0.003));
            const pLng = data.lng || (-46.8258 + (count * 0.003));
            const nomeProf = data.nome || "Personal";

            if (mapRadar && onlinePorHorario) {
                const posLatLng = new google.maps.LatLng(pLat, pLng);
                if (marcadoresPersonal[docItem.id]) {
                    marcadoresPersonal[docItem.id].setPosition(posLatLng);
                } else {
                    marcadoresPersonal[docItem.id] = new google.maps.Marker({
                        position: posLatLng,
                        map: mapRadar,
                        title: nomeProf
                    });
                }
            } else if (marcadoresPersonal[docItem.id]) {
                marcadoresPersonal[docItem.id].setMap(null);
            }

            let distanciaTexto = "Próximo";
            if (window.google && google.maps && google.maps.geometry) {
                const pAluno = new google.maps.LatLng(localAluno.lat, localAluno.lng);
                const pProf = new google.maps.LatLng(pLat, pLng);
                const metros = google.maps.geometry.spherical.computeDistanceBetween(pAluno, pProf);
                distanciaTexto = metros < 1000 ? `${Math.round(metros)}m de você` : `${(metros / 1000).toFixed(1)}km de você`;
            }

            const card = document.createElement('div');
            card.className = 'trainer-card glass card-gold';
            card.innerHTML = `
                <div class="trainer-header">
                    <div class="avatar-container story-ring">
                        <div class="avatar">${nomeProf.charAt(0)}</div>
                    </div>
                    <div class="trainer-info">
                        <h4>${nomeProf} <span class="badge badge-gold">Verificado</span></h4>
                        <p>CREF: ${data.cref || 'Ativo'}</p>
                        <div class="trainer-status" style="color: ${onlinePorHorario ? '#39ff14' : '#ff3333'};">
                            <span class="dot" style="background:${onlinePorHorario ? '#39ff14' : '#ff3333'};"></span> 
                            ${onlinePorHorario ? 'ONLINE' : 'OFFLINE'} • <span>${distanciaTexto}</span>
                        </div>
                    </div>
                </div>
                <div class="trainer-actions">
                    <button class="btn-action btn-outline" onclick="openTrainerProfile('${nomeProf}')">Ver Perfil</button>
                    <button class="btn-action btn-fill" onclick="openActiveChat('${nomeProf}')">Conversar</button>
                </div>
            `;
            container.appendChild(card);
        }
    });
}

let viewingTrainerName = "";
window.openTrainerProfile = async function(nomeProfessor) {
    viewingTrainerName = nomeProfessor;
    document.getElementById('tp-name').innerText = nomeProfessor;
    document.getElementById('tp-avatar').innerText = nomeProfessor.charAt(0);
    document.getElementById('tp-spec').innerText = "Profissional Credenciado TAPAGO";
    await carregarAvaliacoesFirestore(nomeProfessor);
    document.getElementById('trainer-profile-overlay').classList.add('active');
}

window.closeTrainerProfile = function() {
    document.getElementById('trainer-profile-overlay').classList.remove('active');
}

window.setRating = function(estrelas) {
    avaliacaoEstrelasSelecionadas = estrelas;
    const spans = document.querySelectorAll('#star-selector span');
    spans.forEach((s, idx) => {
        s.style.color = idx < estrelas ? 'var(--gold)' : 'rgba(255,255,255,0.2)';
    });
}

async function carregarAvaliacoesFirestore(nomeProf) {
    const listaArea = document.getElementById('reviews-list');
    listaArea.innerHTML = "<p style='color: var(--text-muted); font-size: 13px;'>Carregando avaliações...</p>";
    try {
        const q = query(collection(db, "avaliacoes"), where("professor", "==", nomeProf));
        const querySnapshot = await getDocs(q);
        listaArea.innerHTML = "";
        let soma = 0, total = 0;

        if (querySnapshot.empty) {
            listaArea.innerHTML = "<p style='color: var(--text-muted); font-size: 13px;'>Nenhuma avaliação ainda.</p>";
            document.getElementById('tp-media-estrelas').innerText = "⭐⭐⭐⭐⭐ (Novo)";
            return;
        }

        querySnapshot.forEach((docItem) => {
            const av = docItem.data();
            total++;
            soma += (av.estrelas || 5);
            const div = document.createElement('div');
            div.className = 'review-card';
            div.innerHTML = `
                <div class="review-header">
                    <span class="review-author">${av.autor}</span>
                    <span class="review-date">${new Date(av.data).toLocaleDateString()}</span>
                </div>
                <div style="color: var(--gold); font-size: 11px; margin-bottom: 5px;">${"★".repeat(av.estrelas || 5)}</div>
                <div class="review-text">${av.texto}</div>
            `;
            listaArea.appendChild(div);
        });
        document.getElementById('tp-media-estrelas').innerText = `⭐⭐⭐⭐⭐ (${(soma/total).toFixed(1)})`;
    } catch (e) {
        console.error("Erro avaliacoes:", e);
    }
}

window.submitReview = async function() {
    const textArea = document.getElementById('new-review-text');
    const texto = textArea.value.trim();
    if (texto === "") return alert("Escreva sua avaliação.");

    try {
        await addDoc(collection(db, "avaliacoes"), {
            professor: viewingTrainerName,
            autor: alunoLogado ? alunoLogado.nome : "Aluno",
            estrelas: avaliacaoEstrelasSelecionadas,
            texto: texto,
            data: new Date().toISOString()
        });
        textArea.value = "";
        alert("✅ Avaliação publicada!");
        carregarAvaliacoesFirestore(viewingTrainerName);
    } catch (e) {
        console.error("Erro review:", e);
    }
}

async function carregarListaConversasAluno() {
    const listaConv = document.getElementById('lista-conversas');
    if (!listaConv || !alunoLogado) return;
    try {
        const snap = await getDocs(collection(db, "profissionais"));
        listaConv.innerHTML = "";
        snap.forEach(docProf => {
            const prof = docProf.data();
            if (prof.status === "ativo") {
                const item = document.createElement('div');
                item.className = "chat-item glass";
                item.onclick = () => openActiveChat(prof.nome);
                item.innerHTML = `
                    <div class="avatar" style="border-color: var(--gold); width: 45px; height: 45px;">${prof.nome.charAt(0)}</div>
                    <div class="chat-info">
                        <div class="chat-header">
                            <h4>${prof.nome}</h4>
                            <span class="chat-time">Online</span>
                        </div>
                        <p>Abrir chat em tempo real</p>
                    </div>
                `;
                listaConv.appendChild(item);
            }
        });
    } catch (e) {
        console.error("Erro conversas aluno:", e);
    }
}

window.openActiveChat = function(nomeProfessor) {
    if (!alunoLogado) return;
    conversaAtivaPersonal = nomeProfessor;
    document.getElementById('active-chat-name').innerText = nomeProfessor;
    document.getElementById('active-chat-avatar').innerText = nomeProfessor.charAt(0);
    document.getElementById('active-chat-screen').classList.add('active');
    ouvirMensagensFirestore();
}

window.closeActiveChat = function() {
    if (unsubscribeChat) unsubscribeChat();
    document.getElementById('active-chat-screen').classList.remove('active');
    carregarListaConversasAluno();
}

function ouvirMensagensFirestore() {
    const msgsArea = document.getElementById('chat-messages');
    msgsArea.innerHTML = '';
    const chatId = `${alunoLogado.uid}_${conversaAtivaPersonal}`;
    const q = query(collection(db, "chats", chatId, "mensagens"), orderBy("data", "asc"));

    unsubscribeChat = onSnapshot(q, (snapshot) => {
        msgsArea.innerHTML = "";
        if (snapshot.empty) {
            msgsArea.innerHTML = `<p style="text-align:center; color: var(--text-muted); font-size:12px; margin-top:20px;">Inicie o chat com ${conversaAtivaPersonal}</p>`;
            return;
        }
        snapshot.forEach((docItem) => {
            const msg = docItem.data();
            const bubble = document.createElement('div');
            
            if (msg.tipo === "proposta") {
                bubble.className = `chat-bubble bubble-trainer`;
                bubble.innerHTML = `
                    <strong>${msg.texto}</strong><br>
                    <button onclick="aceitarProposta('${msg.horario}', '${msg.preco}', '${conversaAtivaPersonal}')" style="margin-top:8px; background:var(--neon-green); color:#000; border:none; padding:8px 12px; border-radius:6px; font-weight:bold; cursor:pointer; width:100%;">Aceitar e Agendar no Google Agenda</button>
                `;
            } else {
                bubble.className = `chat-bubble ${msg.remetente === alunoLogado.uid ? 'bubble-user' : 'bubble-trainer'}`;
                bubble.innerText = msg.texto;
            }
            msgsArea.appendChild(bubble);
        });
        msgsArea.scrollTop = msgsArea.scrollHeight;
    });
}

window.aceitarProposta = async function(horario, preco, nomeProf) {
    try {
        await addDoc(collection(db, "agenda"), {
            nome: alunoLogado.nome,
            aluno: alunoLogado.nome,
            professor: nomeProf,
            objetivo: "Treino Personalizado",
            preco: parseFloat(preco),
            horario: horario,
            diaSemana: "Hoje",
            frequencia: "Aula Confirmada",
            status: "ativo",
            criadoEm: new Date().toISOString()
        });

        const hojeStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
        const horaClean = horario.replace(':', '') + '00';
        const gCalendarUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=Treino+com+${encodeURIComponent(nomeProf)}&dates=${hojeStr}T${horaClean}/${hojeStr}T${parseInt(horario)+1}0000&details=Treino+contratado+via+TAPAGO+por+R$${preco}+recolhendo+15%+da+plataforma&location=Itapira+SP`;

        alert(`🎉 Proposta aceita com sucesso!\n\nSalvando horário na sua agenda...`);
        carregarProximoAgendamentoAluno();
        window.open(gCalendarUrl, '_blank');
    } catch (e) {
        console.error("Erro ao aceitar proposta:", e);
    }
}

window.salvarPerfilAluno = async function() {
    if (!alunoLogado) return;
    const objetivo = document.getElementById('aluno-select-objetivo').value;
    const telefone = document.getElementById('aluno-input-telefone').value.trim();

    try {
        await setDoc(doc(db, "usuarios", alunoLogado.uid), {
            objetivo: objetivo,
            telefone: telefone,
            atualizadoEm: new Date().toISOString()
        }, { merge: true });
        alert("✅ Preferências de perfil salvas com sucesso!");
    } catch (e) {
        console.error("Erro ao salvar perfil do aluno:", e);
    }
}

window.handleEnter = function(event) { if (event.key === 'Enter') sendMessage(); }

window.sendMessage = async function() {
    const input = document.getElementById('chat-message-input');
    const texto = input.value.trim();
    if (texto === "" || !alunoLogado) return;
    const chatId = `${alunoLogado.uid}_${conversaAtivaPersonal}`;
    input.value = "";

    try {
        await addDoc(collection(db, "chats", chatId, "mensagens"), {
            remetente: alunoLogado.uid,
            nomeRemetente: alunoLogado.nome,
            destinatario: conversaAtivaPersonal,
            texto: texto,
            data: new Date().toISOString()
        });
    } catch (e) {
        console.error("Erro envio aluno:", e);
    }
}

window.loginGoogleAluno = loginGoogleAluno;
window.logoutAluno = logoutAluno;
window.navTo = navTo;
window.switchTab = switchTab;
window.toggleTheme = toggleTheme;
