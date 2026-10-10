import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, doc, setDoc, query, where, onSnapshot, orderBy } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
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
let personaisReaisDB = [];
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
            await setDoc(doc(db, "usuarios", user.uid), {
                nome: alunoLogado.nome,
                email: alunoLogado.email,
                ultimoAcesso: new Date().toISOString()
            }, { merge: true });
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
            criadoEm: new Date().toISOString()
        }, { merge: true });
        iniciarAppAluno();
    } catch (error) {
        console.error("Erro login aluno:", error);
        alert("Falha ao entrar com Google.");
    }
}

function iniciarAppAluno() {
    document.getElementById('display-name-home').innerText = alunoLogado.nome;
    document.getElementById('display-name-profile').innerText = alunoLogado.nome;
    const initial = alunoLogado.nome.charAt(0).toUpperCase();
    document.getElementById('main-user-avatar').innerText = initial;
    document.getElementById('display-avatar-profile').innerText = initial;

    if (alunoLogado.foto) {
        document.getElementById('main-user-avatar').innerHTML = `<img src="${alunoLogado.foto}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
    }

    const btnWp = document.getElementById('btn-whatsapp-suporte');
    if (btnWp) btnWp.style.display = 'none';

    navTo('screen-main');
    carregarPersonaisReais();
    carregarListaConversasAluno();
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
    if (tabId === 'tab-mensagens') carregarListaConversasAluno();
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
        disableDefaultUI: true,
        styles: [
            { elementType: "geometry", stylers: [{ color: "#1a1a24" }] },
            { elementType: "labels.text.stroke", stylers: [{ color: "#1a1a24" }] },
            { elementType: "labels.text.fill", stylers: [{ color: "#746855" }] },
            { featureType: "road", elementType: "geometry", stylers: [{ color: "#2c2c38" }] },
            { featureType: "water", elementType: "geometry", stylers: [{ color: "#0e1626" }] }
        ]
    });
}

async function carregarPersonaisReais() {
    const container = document.getElementById('lista-personais-reais');
    if (!container) return;
    container.innerHTML = "<p style='color: var(--text-muted); font-size: 13px;'>Buscando profissionais...</p>";

    try {
        const querySnapshot = await getDocs(collection(db, "profissionais"));
        personaisReaisDB = [];
        querySnapshot.forEach((docItem) => {
            const data = docItem.data();
            if (data.status === "ativo") {
                personaisReaisDB.push({
                    nome: data.nome || "Personal",
                    cref: data.cref || "Ativo",
                    lat: data.lat || -22.4389 + (Math.random() - 0.5) * 0.02,
                    lng: data.lng || -46.8258 + (Math.random() - 0.5) * 0.02
                });
            }
        });

        if (personaisReaisDB.length === 0) {
            container.innerHTML = "<p style='color: var(--text-muted); font-size: 13px;'>Nenhum personal ativo no momento.</p>";
            return;
        }

        container.innerHTML = "";
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition((pos) => {
                const localAluno = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                if (mapRadar) mapRadar.setCenter(localAluno);
                renderizarCardsPersonais(localAluno);
            }, () => {
                renderizarCardsPersonais({ lat: -22.4389, lng: -46.8258 });
            });
        } else {
            renderizarCardsPersonais({ lat: -22.4389, lng: -46.8258 });
        }
    } catch (e) {
        console.error("Erro personais:", e);
    }
}

function renderizarCardsPersonais(localAluno) {
    const container = document.getElementById('lista-personais-reais');
    if (!container) return;
    container.innerHTML = "";

    personaisReaisDB.forEach(personal => {
        let distanciaTexto = "Próximo";
        if (window.google && google.maps && google.maps.geometry) {
            const pAluno = new google.maps.LatLng(localAluno.lat, localAluno.lng);
            const pProf = new google.maps.LatLng(personal.lat, personal.lng);
            const metros = google.maps.geometry.spherical.computeDistanceBetween(pAluno, pProf);
            distanciaTexto = metros < 1000 ? `${Math.round(metros)}m de você` : `${(metros / 1000).toFixed(1)}km de você`;
        }

        if (mapRadar) {
            new google.maps.Marker({
                position: { lat: personal.lat, lng: personal.lng },
                map: mapRadar,
                title: personal.nome
            });
        }

        const card = document.createElement('div');
        card.className = 'trainer-card glass card-gold';
        card.innerHTML = `
            <div class="trainer-header">
                <div class="avatar-container story-ring">
                    <div class="avatar">${personal.nome.charAt(0)}</div>
                </div>
                <div class="trainer-info">
                    <h4>${personal.nome} <span class="badge badge-gold">Verificado</span></h4>
                    <p>CREF: ${personal.cref}</p>
                    <div class="trainer-status status-online">
                        <span class="dot"></span> Online • <span>${distanciaTexto}</span>
                    </div>
                </div>
            </div>
            <div class="trainer-actions">
                <button class="btn-action btn-outline" onclick="openTrainerProfile('${personal.nome}')">Ver Perfil</button>
                <button class="btn-action btn-fill" onclick="openActiveChat('${personal.nome}')">Conversar</button>
            </div>
        `;
        container.appendChild(card);
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
        if (snap.empty) {
            listaConv.innerHTML = "<p style='color:var(--text-muted); font-size:13px;'>Nenhum personal disponível.</p>";
            return;
        }
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
                        <p>Clique para abrir o chat em tempo real</p>
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
            bubble.className = `chat-bubble ${msg.remetente === alunoLogado.uid ? 'bubble-user' : 'bubble-trainer'}`;
            bubble.innerText = msg.texto;
            msgsArea.appendChild(bubble);
        });
        msgsArea.scrollTop = msgsArea.scrollHeight;
    });
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
