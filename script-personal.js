// ==========================================
// IMPORTAÇÕES DO FIREBASE (SDK Modular v10)
// ==========================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, doc, setDoc, query, where } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Suas credenciais reais do Firebase
const firebaseConfig = {
    apiKey: "AIzaSyA2PVDpo4X3G8ok_Mk5MU1WeRUaxwIhEpg",
    authDomain: "app-diego-e0591.firebaseapp.com",
    projectId: "app-diego-e0591",
    storageBucket: "app-diego-e0591.firebasestorage.app",
    messagingSenderId: "69109305372",
    appId: "1:69109305372:web:5139a52f1342671c520fd9",
    measurementId: "G-P2J3HHKK2R"
};

// Inicializa o Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ==========================================
// ESTADO DO PERFIL E DADOS REAIS
// ==========================================
let dadosPerfil = {
    nome: "Professor",
    cref: "",
    cpf: "",
    bio: "",
    fotoUrl: null,
    tarifas: { normal: 60, surge: 85, discount: 45 }
};

let agendaDeHoje = [];
const ADMIN_CPF = "11122233344"; // Altere aqui se preferir outro CPF para o seu Admin

// ==========================================
// VALIDAÇÃO DE ACESSO COM O BANCO DE DADOS
// ==========================================
async function validarProfissional() {
    const nome = document.getElementById('input-nome').value.trim();
    const cpf = document.getElementById('input-cpf').value.replace(/\D/g, '');
    const cref = document.getElementById('input-cref').value.trim();
    const loader = document.getElementById('login-loader');
    const btnLogin = document.getElementById('btn-login');

    if (!nome || !cpf || !cref) {
        alert("Preencha todos os campos obrigatórios.");
        return;
    }

    loader.style.display = 'block';
    btnLogin.style.display = 'none';

    try {
        // Se for o Admin, libera direto e registra o perfil no Firestore
        if (cpf === ADMIN_CPF) {
            dadosPerfil.nome = nome;
            dadosPerfil.cpf = cpf;
            dadosPerfil.cref = cref;
            
            await setDoc(doc(db, "profissionais", cpf), {
                nome, cpf, cref, ativo: true, atualizadoEm: new Date()
            });

            loader.style.display = 'none';
            btnLogin.style.display = 'block';
            entrarNoPainel();
            return;
        }

        // Validação buscando no Firestore por profissionais cadastrados
        const q = query(collection(db, "profissionais"), where("cpf", "==", cpf), where("cref", "==", cref));
        const querySnapshot = await getDocs(q);

        loader.style.display = 'none';
        btnLogin.style.display = 'block';

        if (!querySnapshot.empty) {
            const profData = querySnapshot.docs[0].data();
            dadosPerfil.nome = profData.nome;
            dadosPerfil.cpf = profData.cpf;
            dadosPerfil.cref = profData.cref;
            entrarNoPainel();
        } else {
            alert("❌ Acesso Negado: CPF ou CREF não encontrados na base de dados real do TAPAGO.");
        }
    } catch (error) {
        console.error("Erro ao validar no Firebase:", error);
        loader.style.display = 'none';
        btnLogin.style.display = 'block';
        alert("Erro de conexão com o banco de dados. Verifique o console.");
    }
}

function entrarNoPainel() {
    document.getElementById('nome-exibicao').innerText = dadosPerfil.nome;
    document.getElementById('perfil-nome-display').innerText = dadosPerfil.nome;
    document.getElementById('perfil-cref-display').innerText = `CREF: ${dadosPerfil.cref}`;
    
    document.getElementById('screen-login-personal').classList.remove('active');
    document.getElementById('screen-dashboard').classList.add('active');
    
    carregarAgendaDoBanco();
}

// ==========================================
// BUSCAR AGENDA E ALUNOS REAIS DO FIRESTORE
// ==========================================
async function carregarAgendaDoBanco() {
    try {
        const querySnapshot = await getDocs(collection(db, "agenda"));
        agendaDeHoje = [];
        
        querySnapshot.forEach((doc) => {
            agendaDeHoje.push(doc.data());
        });

        // Se a coleção estiver vazia, cria dados padrão para teste
        if (agendaDeHoje.length === 0) {
            agendaDeHoje = [
                { hora: "08:00", aluno: "Carlos Andrade", objetivo: "Hipertrofia", status: "ocupado", vencimento: 5 },
                { hora: "09:00", aluno: "Mariana Souza", objetivo: "Emagrecimento", status: "ocupado", vencimento: 10 },
                { hora: "11:00", aluno: "Vaga Livre", objetivo: "Disponível no Radar", status: "livre", preco: 85 }
            ];
        }

        renderizarAgenda();
    } catch (error) {
        console.error("Erro ao carregar agenda:", error);
    }
}

// ==========================================
// CADASTRO REAL DE ALUNOS NO FIRESTORE
// ==========================================
async function consultarCpfAluno() {
    const cpfDigitado = document.getElementById('cad-aluno-cpf').value.trim();
    const statusDiv = document.getElementById('status-cpf-busca');

    if (cpfDigitado.length === 11) {
        statusDiv.style.display = "block";
        statusDiv.innerText = "Consultando base de alunos reais...";
        
        try {
            const q = query(collection(db, "usuarios"), where("cpf", "==", cpfDigitado), where("tipo", "==", "aluno"));
            const querySnapshot = await getDocs(q);

            if (!querySnapshot.empty) {
                const alunoData = querySnapshot.docs[0].data();
                document.getElementById('cad-aluno-nome').value = alunoData.nome;
                document.getElementById('cad-aluno-objetivo').value = alunoData.objetivo || "Geral";
                statusDiv.innerText = "✓ Aluno real localizado no Firestore!";
                statusDiv.style.color = "var(--neon-green)";
            } else {
                statusDiv.innerText = "ℹ CPF não encontrado na base de alunos. Um link de convite será gerado.";
                statusDiv.style.color = "var(--gold)";
            }
        } catch (e) {
            console.error("Erro na busca de aluno:", e);
        }
    }
}

async function confirmarCadastroAluno() {
    const nome = document.getElementById('cad-aluno-nome').value.trim();
    const objetivo = document.getElementById('cad-aluno-objetivo').value.trim();
    const cpf = document.getElementById('cad-aluno-cpf').value.trim();

    if (!nome || !cpf) {
        alert("Preencha os dados do aluno.");
        return;
    }

    const novoSlot = {
        hora: "12:00",
        aluno: nome,
        objetivo: objetivo || "Geral",
        status: "ocupado",
        vencimento: 5,
        cpfAluno: cpf
    };

    try {
        await addDoc(collection(db, "agenda"), novoSlot);
        agendaDeHoje.push(novoSlot);
        renderizarAgenda();
        fecharModalCadastrarAluno();
        alert(`🎉 Aluno ${nome} matriculado e salvo no Banco de Dados Real!`);
    } catch (e) {
        console.error("Erro ao salvar aluno no Firestore: ", e);
        alert("Erro ao gravar no banco de dados.");
    }
}

// ==========================================
// RENDERIZAÇÃO DA AGENDA E TELA
// ==========================================
function renderizarAgenda() {
    const lista = document.getElementById('lista-agenda');
    if (!lista) return;
    lista.innerHTML = ""; 

    agendaDeHoje.forEach((slot) => {
        const div = document.createElement('div');
        div.className = `glass agenda-slot`;
        
        if (slot.status === "livre") {
            div.innerHTML = `
                <div class="slot-time">${slot.hora}</div>
                <div class="slot-info">
                    <div class="slot-info-name">VAGA ABERTA</div>
                    <div class="slot-info-desc">Radar: R$ ${slot.preco || 60},00</div>
                </div>
            `;
        } else {
            div.innerHTML = `
                <div class="slot-time" style="color: #fff;">${slot.hora}</div>
                <div class="slot-info">
                    <div class="slot-info-name">${slot.aluno}</div>
                    <div class="slot-info-desc">Foco: ${slot.objetivo}</div>
                </div>
            `;
        }
        lista.appendChild(div);
    });
}

// Funções de apoio
function switchTabPersonal(tabId, navElement) {
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    const tabAlvo = document.getElementById(tabId);
    if (tabAlvo) tabAlvo.classList.add('active');
    
    document.querySelectorAll('#nav-personal .nav-item').forEach(item => item.classList.remove('active'));
    if (navElement) navElement.classList.add('active');
}

function abrirModalCadastrarAluno() { document.getElementById('modal-cadastrar-aluno').classList.add('active'); }
function fecharModalCadastrarAluno() { document.getElementById('modal-cadastrar-aluno').classList.remove('active'); }
function sairModoPessoal() { document.getElementById('screen-dashboard').classList.remove('active'); document.getElementById('screen-login-personal').classList.add('active'); }

// Expondo funções globais para o HTML
window.validarProfissional = validarProfissional;
window.consultarCpfAluno = consultarCpfAluno;
window.confirmarCadastroAluno = confirmarCadastroAluno;
window.abrirModalCadastrarAluno = abrirModalCadastrarAluno;
window.fecharModalCadastrarAluno = fecharModalCadastrarAluno;
window.switchTabPersonal = switchTabPersonal;
window.sairModoPessoal = sairModoPessoal;
    timers.forEach(t => clearInterval(t));
    timers = [];
}
