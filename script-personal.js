// ==========================================
// ESTADO DO PERFIL, MENSAGENS E TARIFAS
// ==========================================

let dadosPerfil = {
    nome: "Professor",
    cref: "",
    cpf: "",
    bio: "",
    fotoUrl: null,
    tarifas: {
        normal: 60,
        surge: 85,
        discount: 45
    }
};

// Banco de Dados Simulado de Alunos (para busca por CPF)
const bancoAlunosCadastrados = [
    { cpf: "12345678901", nome: "Lucas Silveira", objetivo: "Condicionamento Físico" },
    { cpf: "98765432100", nome: "Fernanda Lima", objetivo: "Emagrecimento" }
];

let conversaAtiva = null;

// ==========================================
// INICIALIZAÇÃO & "LEMBRE-SE DE MIM"
// ==========================================

window.addEventListener('DOMContentLoaded', () => {
    carregarEstado();
    // Verifica se salvou login no localStorage
    const savedProfile = localStorage.getItem('tapago_personal_user');
    if (savedProfile) {
        const parsed = JSON.parse(savedProfile);
        document.getElementById('input-nome').value = parsed.nome || '';
        document.getElementById('input-cpf').value = parsed.cpf || '';
        document.getElementById('input-cref').value = parsed.cref || '';
        document.getElementById('check-remember').checked = true;
    }
});

function validarProfissional() {
    const nome = document.getElementById('input-nome').value.trim();
    const cpf = document.getElementById('input-cpf').value.trim();
    const cref = document.getElementById('input-cref').value.trim();
    const lembreme = document.getElementById('check-remember').checked;

    if (nome === "" || cpf === "" || cref === "") {
        alert("Preencha todos os campos obrigatórios.");
        return;
    }

    document.getElementById('login-loader').style.display = 'block';
    document.getElementById('btn-login').style.display = 'none';

    setTimeout(() => {
        document.getElementById('login-loader').style.display = 'none';
        document.getElementById('btn-login').style.display = 'block';
        
        const regexCref = /\d+-G\/[A-Z]{2}/i; 
        
        if (cpf.length < 11) {
            alert("Erro: CPF inválido.");
        } else if (!regexCref.test(cref)) {
            alert("Erro: CREF formato incorreto. Ex: 123456-G/SP");
        } else {
            dadosPerfil.nome = nome;
            dadosPerfil.cpf = cpf;
            dadosPerfil.cref = cref;

            // Salvar no dispositivo
            if (lembreme) {
                localStorage.setItem('tapago_personal_user', JSON.stringify({ nome, cpf, cref }));
            } else {
                localStorage.removeItem('tapago_personal_user');
            }

            atualizarExibicaoPerfil();
            aplicarEstadoNaUI();

            document.getElementById('screen-login-personal').classList.remove('active');
            document.getElementById('screen-dashboard').classList.add('active');
            renderizarAgenda();
            pararTimers();
            iniciarRadar();
            iniciarNotificacoes();
        }
    }, 1200);
}

// ==========================================
// CONFIGURAÇÃO DE TARIFAS DE HORA/AULA
// ==========================================

function salvarTarifas() {
    const normal = parseFloat(document.getElementById('rate-normal').value) || 60;
    const surge = parseFloat(document.getElementById('rate-surge').value) || 85;
    const discount = parseFloat(document.getElementById('rate-discount').value) || 45;

    dadosPerfil.tarifas.normal = normal;
    dadosPerfil.tarifas.surge = surge;
    dadosPerfil.tarifas.discount = discount;
    salvarEstado();

    alert("✅ Tabela de preços atualizada com sucesso!");
}

function abrirModalPricing(index) {
    indiceVagaSelecionada = index;
    // Atualiza valores nos botões do modal com base nas tarifas salvas
    document.getElementById('display-rate-normal').innerText = dadosPerfil.tarifas.normal;
    document.getElementById('display-rate-surge').innerText = dadosPerfil.tarifas.surge;
    document.getElementById('display-rate-discount').innerText = dadosPerfil.tarifas.discount;

    document.getElementById('modal-pricing').classList.add('active');
}

function fecharModalPricing() {
    document.getElementById('modal-pricing').classList.remove('active');
    indiceVagaSelecionada = null;
}

function confirmarVagaAvulsa(tipo) {
    if (indiceVagaSelecionada !== null) {
        let precoFinal = dadosPerfil.tarifas.normal;
        if (tipo === 'promocional') precoFinal = dadosPerfil.tarifas.discount;
        if (tipo === 'premium') precoFinal = dadosPerfil.tarifas.surge;

        agendaDeHoje[indiceVagaSelecionada].status = "livre";
        agendaDeHoje[indiceVagaSelecionada].preco = precoFinal;
        salvarEstado();
        renderizarAgenda();
        fecharModalPricing();
        alert(`✅ Vaga liberada no Radar por R$ ${precoFinal},00.`);
    }
}

// ==========================================
// CADASTRO DE ALUNO POR CPF
// ==========================================

function abrirModalCadastrarAluno() {
    document.getElementById('modal-cadastrar-aluno').classList.add('active');
}

function fecharModalCadastrarAluno() {
    document.getElementById('modal-cadastrar-aluno').classList.remove('active');
    document.getElementById('cad-aluno-cpf').value = "";
    document.getElementById('cad-aluno-nome').value = "";
    document.getElementById('cad-aluno-objetivo').value = "";
    document.getElementById('status-cpf-busca').style.display = "none";
}

function consultarCpfAluno() {
    const cpfDigitado = document.getElementById('cad-aluno-cpf').value.trim();
    const statusDiv = document.getElementById('status-cpf-busca');

    if (cpfDigitado.length === 11) {
        const alunoEncontrado = bancoAlunosCadastrados.find(a => a.cpf === cpfDigitado);
        
        statusDiv.style.display = "block";
        if (alunoEncontrado) {
            document.getElementById('cad-aluno-nome').value = alunoEncontrado.nome;
            document.getElementById('cad-aluno-objetivo').value = alunoEncontrado.objetivo;
            statusDiv.innerText = "✓ Aluno localizado no banco de dados TAPAGO!";
            statusDiv.style.color = "var(--neon-green)";
        } else {
            statusDiv.innerText = "ℹ CPF não encontrado na base. Um pré-cadastro será criado.";
            statusDiv.style.color = "var(--gold)";
        }
    }
}

function confirmarCadastroAluno() {
    const nome = document.getElementById('cad-aluno-nome').value.trim();
    const objetivo = document.getElementById('cad-aluno-objetivo').value.trim();

    if (!nome) {
        alert("Digite o nome do aluno.");
        return;
    }

    // Adiciona o novo aluno em um horário vago da agenda
    agendaDeHoje.push({
        hora: "12:00",
        aluno: nome,
        objetivo: objetivo || "Geral",
        status: "ocupado"
    });

    salvarEstado();
    renderizarAgenda();
    fecharModalCadastrarAluno();
    alert(`🎉 Aluno ${nome} matriculado e adicionado à sua agenda!`);
}

// ==========================================
// CHAT COM ALUNOS
// ==========================================

// ==========================================
// FUNÇÕES DE PERFIL, TEMA E NAVEGAÇÃO
// ==========================================

function atualizarExibicaoPerfil() {
    const primeiraLetra = dadosPerfil.nome.charAt(0).toUpperCase();

    document.getElementById('nome-exibicao').innerText = dadosPerfil.nome;
    document.getElementById('perfil-nome-display').innerText = dadosPerfil.nome;
    document.getElementById('perfil-cref-display').innerText = `CREF: ${dadosPerfil.cref}`;
    
    document.getElementById('initials-header').innerText = primeiraLetra;
    document.getElementById('initials-perfil').innerText = primeiraLetra;

    if (dadosPerfil.fotoUrl) {
        document.getElementById('img-avatar-header').src = dadosPerfil.fotoUrl;
        document.getElementById('img-avatar-header').style.display = 'block';
        document.getElementById('initials-header').style.display = 'none';

        document.getElementById('img-perfil-preview').src = dadosPerfil.fotoUrl;
        document.getElementById('img-perfil-preview').style.display = 'block';
        document.getElementById('initials-perfil').style.display = 'none';
    }
}

function atualizarFotoPerfil(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            dadosPerfil.fotoUrl = e.target.result;
            salvarEstado();
            atualizarExibicaoPerfil();
        };
        reader.readAsDataURL(file);
    }
}

function salvarBio() {
    dadosPerfil.bio = document.getElementById('input-bio').value;
    salvarEstado();
    alert("✅ Biografia atualizada!");
}

function alternarTema() {
    document.body.classList.toggle('light-theme');
    const claro = document.body.classList.contains('light-theme');
    document.getElementById('label-tema').innerText = claro ? "Modo Claro Ativo" : "Modo Escuro Ativo";
    document.getElementById('icon-tema').innerText = claro ? "☀️" : "🌙";
    salvarEstado();
}

function sairModoPessoal() {
    if (confirm("Deseja realmente sair da sua conta?")) {
        pararTimers();
        document.getElementById('screen-dashboard').classList.remove('active');
        document.getElementById('screen-login-personal').classList.add('active');
    }
}

// ==========================================
// GESTÃO DA AGENDA DE TREINOS
// ==========================================

let agendaDeHoje = [
    { hora: "08:00", aluno: "Carlos Andrade", objetivo: "Hipertrofia", status: "ocupado" },
    { hora: "09:00", aluno: "Mariana Souza", objetivo: "Emagrecimento", status: "ocupado" },
    { hora: "10:00", aluno: "Roberto Costa", objetivo: "Força", status: "ocupado" },
    { hora: "11:00", aluno: "Vaga Livre", objetivo: "Disponível no Radar", status: "livre", preco: 85 }
];

let indiceVagaSelecionada = null;
let ganhosAvulsos = 450;

function renderizarAgenda() {
    const lista = document.getElementById('lista-agenda');
    lista.innerHTML = ""; 

    agendaDeHoje.forEach((slot, index) => {
        const div = document.createElement('div');
        
        if (slot.status === "concluida") {
            div.className = `glass agenda-slot slot-concluida`;
            div.innerHTML = `
                <div class="slot-time">${slot.hora}</div>
                <div class="slot-info">
                    <div class="slot-info-name">${escapeHtml(slot.aluno)} (Check-in OK)</div>
                    <div class="slot-info-desc">Pagamento Liberado</div>
                </div>
            `;
        } else if (slot.status === "livre") {
            div.className = `glass agenda-slot slot-livre`;
            div.innerHTML = `
                <div class="slot-time">${slot.hora}</div>
                <div class="slot-info">
                    <div class="slot-info-name">VAGA ABERTA</div>
                    <div class="slot-info-desc">Radar Ativo: R$ ${slot.preco},00</div>
                </div>
                <div style="display:flex; flex-direction:column;">
                    <button class="btn-slot-action" onclick="cancelarVagaAvulsa(${index})">Cancelar</button>
                </div>
            `;
        } else {
            div.className = `glass agenda-slot slot-ocupado`;
            div.innerHTML = `
                <div class="slot-time">${slot.hora}</div>
                <div class="slot-info">
                    <div class="slot-info-name">${escapeHtml(slot.aluno)}${slot.novo ? '<span class="slot-novo-tag">NOVO</span>' : ''}</div>
                    <div class="slot-info-desc">Foco: ${escapeHtml(slot.objetivo)}</div>
                </div>
                <div style="display:flex; flex-direction:column; align-items:flex-end;">
                    <button class="btn-slot-action btn-qr" onclick="abrirQRCode(${index})">Check-in QR</button>
                    <button class="btn-slot-action" onclick="abrirModalPricing(${index})">Aluno Faltou</button>
                </div>
            `;
        }
        
        lista.appendChild(div);
    });
}

function cancelarVagaAvulsa(index) {
    agendaDeHoje[index].status = "ocupado";
    agendaDeHoje[index].aluno = "Horário Fechado";
    agendaDeHoje[index].objetivo = "Indisponível";
    salvarEstado();
    renderizarAgenda();
}

function abrirQRCode(index) {
    indiceVagaSelecionada = index;
    document.getElementById('modal-qrcode').classList.add('active');
}

function fecharModalQRCode() {
    document.getElementById('modal-qrcode').classList.remove('active');
    indiceVagaSelecionada = null;
}

function simularLeituraQRCode() {
    if (indiceVagaSelecionada !== null) {
        agendaDeHoje[indiceVagaSelecionada].status = "concluida";
        salvarEstado();
        renderizarAgenda();
        fecharModalQRCode();
        atualizarFinanceiro(dadosPerfil.tarifas.normal);
        alert("📸 Leitura de QR Code concluída! Aula validada e pagamento creditado.");
    }
}

function atualizarFinanceiro(valorAdicional) {
    ganhosAvulsos += valorAdicional;
    salvarEstado();
    renderFinanceiro();
}

function switchTabPersonal(tabId, navElement) {
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    
    document.querySelectorAll('#nav-personal .nav-item').forEach(item => item.classList.remove('active'));
    if (navElement) {
        navElement.classList.add('active');
    }
    limparBadgeAba(tabId);
    const painel = document.getElementById('painel-notificacoes');
    if (painel) painel.hidden = true;
}
// ==========================================
// UTILITÁRIOS
// ==========================================

function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function dataHoje() {
    return new Date().toISOString().slice(0, 10);
}

// ==========================================
// PERSISTÊNCIA (LocalStorage com versionamento)
// Trocar por backend: basta reimplementar salvarEstado/carregarEstado com fetch().
// ==========================================

const STORAGE_KEY = 'tapago_personal_state_v1';
let agendaPadrao = null;
let historicoAgenda = [];

function salvarEstado() {
    const { cpf, ...perfilSemCpf } = dadosPerfil; // CPF não é guardado aqui
    const estado = {
        versao: 1,
        data: dataHoje(),
        dadosPerfil: perfilSemCpf,
        agendaDeHoje,
        ganhosAvulsos,
        historicoAgenda,
        conversas,
        radarRaioKm,
        tema: document.body.classList.contains('light-theme')
    };
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(estado));
    } catch (e) {
        // Foto em base64 pode estourar a cota: tenta de novo sem ela
        try {
            estado.dadosPerfil.fotoUrl = null;
            localStorage.setItem(STORAGE_KEY, JSON.stringify(estado));
        } catch (e2) {
            console.warn('TAPAGO: não foi possível salvar o estado.', e2);
        }
    }
}

function carregarEstado() {
    agendaPadrao = JSON.parse(JSON.stringify(agendaDeHoje));
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        const s = JSON.parse(raw);
        if (s.versao !== 1) return;

        if (s.dadosPerfil) {
            dadosPerfil = {
                ...dadosPerfil,
                ...s.dadosPerfil,
                tarifas: { ...dadosPerfil.tarifas, ...(s.dadosPerfil.tarifas || {}) }
            };
        }
        if (typeof s.ganhosAvulsos === 'number') ganhosAvulsos = s.ganhosAvulsos;
        if (s.conversas) conversas = s.conversas;
        if (s.radarRaioKm) radarRaioKm = s.radarRaioKm;
        historicoAgenda = Array.isArray(s.historicoAgenda) ? s.historicoAgenda : [];

        // Virou o dia? Arquiva a agenda anterior e começa uma nova.
        if (Array.isArray(s.agendaDeHoje)) {
            if (s.data && s.data !== dataHoje()) {
                historicoAgenda.push({ data: s.data, agenda: s.agendaDeHoje });
                historicoAgenda = historicoAgenda.slice(-30);
                agendaDeHoje = JSON.parse(JSON.stringify(agendaPadrao));
            } else {
                agendaDeHoje = s.agendaDeHoje;
            }
        }
        if (s.tema) document.body.classList.add('light-theme');
    } catch (e) {
        console.warn('TAPAGO: estado salvo inválido, ignorando.', e);
    }
}

function renderFinanceiro() {
    document.getElementById('valor-avulso').innerText = `R$ ${ganhosAvulsos}`;
    document.getElementById('valor-total').innerText = `R$ ${(4200 + ganhosAvulsos).toLocaleString('pt-BR')}`;
}

function aplicarEstadoNaUI() {
    document.getElementById('rate-normal').value = dadosPerfil.tarifas.normal;
    document.getElementById('rate-surge').value = dadosPerfil.tarifas.surge;
    document.getElementById('rate-discount').value = dadosPerfil.tarifas.discount;
    document.getElementById('input-bio').value = dadosPerfil.bio || '';

    const claro = document.body.classList.contains('light-theme');
    document.getElementById('label-tema').innerText = claro ? "Modo Claro Ativo" : "Modo Escuro Ativo";
    document.getElementById('icon-tema').innerText = claro ? "☀️" : "🌙";

    const slider = document.getElementById('radar-raio');
    if (slider) slider.value = radarRaioKm;
    document.getElementById('radar-raio-label').innerText = `${radarRaioKm} km`;

    renderFinanceiro();
    renderListaConversas();
}

// ==========================================
// CHAT COM ALUNOS (histórico por conversa, persistido)
// ==========================================

let conversas = {
    "Carlos Andrade": {
        ts: Date.now(), naoLidas: 0,
        msgs: [{ tipo: 'received', texto: 'Professor, consigo mudar o treino de hoje pra 18h?', hora: '10:42' }]
    },
    "Mariana Souza": {
        ts: Date.now() - 86400000, naoLidas: 0,
        msgs: [{ tipo: 'received', texto: 'Treino pago! Valeu pela força hoje 🔥', hora: 'Ontem' }]
    }
};

function horaAgora() {
    return new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function renderListaConversas() {
    const lista = document.getElementById('chat-list-view');
    lista.innerHTML = '';
    Object.entries(conversas)
        .sort((a, b) => b[1].ts - a[1].ts)
        .forEach(([nome, c]) => {
            const ultima = c.msgs[c.msgs.length - 1] || { texto: '', hora: '' };
            const item = document.createElement('div');
            item.className = 'chat-item glass';
            item.onclick = () => abrirConversa(nome);
            item.innerHTML = `
                <div class="chat-avatar">${escapeHtml(nome.charAt(0))}</div>
                <div class="chat-info">
                    <h4>${escapeHtml(nome)} <span class="chat-time">${escapeHtml(ultima.hora)}</span></h4>
                    <p>${escapeHtml(ultima.texto)}</p>
                </div>
                ${c.naoLidas > 0 ? `<span class="unread-dot">${c.naoLidas}</span>` : ''}
            `;
            lista.appendChild(item);
        });
    atualizarBadgeChat();
}

function renderMensagens(nome) {
    const box = document.getElementById('chat-box');
    box.innerHTML = '';
    (conversas[nome]?.msgs || []).forEach(m => {
        const div = document.createElement('div');
        div.className = `msg msg-${m.tipo}`;
        div.innerHTML = `<p>${escapeHtml(m.texto)}</p><span class="msg-time">${escapeHtml(m.hora)}</span>`;
        box.appendChild(div);
    });
    box.scrollTop = box.scrollHeight;
}

function adicionarMensagem(nome, tipo, texto) {
    if (!conversas[nome]) conversas[nome] = { ts: 0, naoLidas: 0, msgs: [] };
    const c = conversas[nome];
    c.msgs.push({ tipo, texto, hora: horaAgora() });
    c.ts = Date.now();
    if (tipo === 'received' && conversaAtiva !== nome) c.naoLidas++;
    if (conversaAtiva === nome) renderMensagens(nome);
    renderListaConversas();
    salvarEstado();
}

function abrirConversa(nomeAluno) {
    conversaAtiva = nomeAluno;
    if (conversas[nomeAluno]) conversas[nomeAluno].naoLidas = 0;
    document.getElementById('chat-list-view').style.display = 'none';
    document.getElementById('chat-conversation-view').style.display = 'block';
    document.getElementById('chat-active-name').innerText = nomeAluno;
    renderMensagens(nomeAluno);
    atualizarBadgeChat();
    salvarEstado();
}

function fecharConversa() {
    conversaAtiva = null;
    document.getElementById('chat-list-view').style.display = 'block';
    document.getElementById('chat-conversation-view').style.display = 'none';
    renderListaConversas();
}

function handleEnterChat(event) {
    if (event.key === 'Enter') enviarMensagemChat();
}

function enviarMensagemChat() {
    const input = document.getElementById('input-chat-msg');
    const texto = input.value.trim();
    if (texto === "" || !conversaAtiva) return;

    const nome = conversaAtiva;
    adicionarMensagem(nome, 'sent', texto);
    input.value = "";

    setTimeout(() => adicionarMensagem(nome, 'received', 'Perfeito, professor! Combinado.'), 1200);
}

// ==========================================
// RADAR DE DEMANDA (hotspots interativos + raio + tempo real simulado)
// ==========================================

const RADAR_ZONAS = [
    { id: 'centro',  nome: 'Centro',   top: 35, left: 40 },
    { id: 'bairroA', nome: 'Bairro A', top: 62, left: 70 },
    { id: 'bairroB', nome: 'Bairro B', top: 22, left: 80 },
    { id: 'bairroC', nome: 'Bairro C', top: 70, left: 22 }
];
const RADAR_MODALIDADES = ['Hipertrofia', 'Emagrecimento', 'Funcional', 'Mobilidade', 'Condicionamento'];
const NOMES_FICTICIOS = ['Ana P.', 'Bruno M.', 'Camila R.', 'Diego T.', 'Elisa F.', 'Felipe G.', 'Gabi L.', 'Henrique S.'];

let radarChamados = [];
let radarRaioKm = 5;
let radarZonaSel = null;
let chamadoSeq = 1;
let timers = [];

function sortear(lista) {
    return lista[Math.floor(Math.random() * lista.length)];
}

function gerarChamado() {
    return {
        id: chamadoSeq++,
        zona: sortear(RADAR_ZONAS).id,
        aluno: sortear(NOMES_FICTICIOS),
        modalidade: sortear(RADAR_MODALIDADES),
        distKm: Math.round((Math.random() * 9 + 0.3) * 10) / 10,
        criadoEm: Date.now()
    };
}

function chamadosVisiveis() {
    return radarChamados.filter(c => c.distKm <= radarRaioKm);
}

function nivelDaZona(qtd) {
    return qtd >= 4 ? 'high' : qtd >= 2 ? 'medium' : 'low';
}

function tempoDecorrido(ts) {
    const s = Math.round((Date.now() - ts) / 1000);
    return s < 60 ? 'agora' : `há ${Math.round(s / 60)} min`;
}

function renderRadar() {
    const box = document.getElementById('radar-mapa');
    if (!box) return;
    const vis = chamadosVisiveis();

    let html = `<div class="radar-ring" style="height:${(radarRaioKm / 10) * 90}%"></div><div class="radar-you">Você</div>`;
    RADAR_ZONAS.forEach(z => {
        const qtd = vis.filter(c => c.zona === z.id).length;
        const nivel = nivelDaZona(qtd);
        const pos = `top:${z.top}%; left:${z.left}%;`;
        html += `<div class="hotspot hotspot-${nivel}" style="${pos} ${qtd === 0 ? 'opacity:.25;' : ''}"></div>
                 <button class="hotspot-pin ${radarZonaSel === z.id ? 'selecionado' : ''}" style="${pos}"
                    onclick="selecionarZona('${z.id}')" aria-label="${z.nome}: ${qtd} chamados">${z.nome} · ${qtd}</button>`;
    });
    box.innerHTML = html;
    renderRadarDetalhe(vis);
}

function renderRadarDetalhe(vis) {
    const painel = document.getElementById('radar-detalhe');
    const zona = RADAR_ZONAS.find(z => z.id === radarZonaSel);
    const lista = (zona ? vis.filter(c => c.zona === zona.id) : vis).sort((a, b) => a.distKm - b.distKm);
    const titulo = zona ? zona.nome : 'Todas as regiões';

    let html = `<div class="radar-detalhe-header"><strong>${titulo}</strong>
                <span>${lista.length} chamado(s) em até ${radarRaioKm} km</span></div>`;

    if (lista.length >= 4 || (zona && nivelDaZona(lista.length) === 'high')) {
        html += `<div class="radar-surge">🔥 Alta demanda: considere sua tarifa Surge (R$ ${dadosPerfil.tarifas.surge},00)</div>`;
    }
    if (lista.length === 0) {
        html += `<p class="radar-vazio">Nenhum chamado ativo neste raio agora.</p>`;
    }
    lista.forEach(c => {
        html += `<div class="radar-chamado">
                    <div><strong>${escapeHtml(c.aluno)}</strong> · ${c.modalidade}
                    <small>${c.distKm} km · ${tempoDecorrido(c.criadoEm)}</small></div>
                    <button class="btn-slot-action btn-qr" onclick="atenderChamado(${c.id})">Atender</button>
                 </div>`;
    });
    painel.innerHTML = html;
}

function selecionarZona(id) {
    radarZonaSel = radarZonaSel === id ? null : id;
    renderRadar();
}

function mudarRaio(valor) {
    radarRaioKm = parseInt(valor, 10);
    document.getElementById('radar-raio-label').innerText = `${radarRaioKm} km`;
    renderRadar();
    salvarEstado();
}

function atenderChamado(id) {
    const c = radarChamados.find(x => x.id === id);
    if (!c) return;
    const qtdZona = chamadosVisiveis().filter(x => x.zona === c.zona).length;
    const preco = nivelDaZona(qtdZona) === 'high' ? dadosPerfil.tarifas.surge : dadosPerfil.tarifas.normal;
    radarChamados = radarChamados.filter(x => x.id !== id);
    renderRadar();
    mostrarToast({ icone: '📡', titulo: 'Proposta enviada', texto: `${c.aluno} · R$ ${preco},00 (${c.modalidade})` });
}

function radarTick() {
    const agora = Date.now();
    radarChamados = radarChamados.filter(c => agora - c.criadoEm < 150000);
    if (Math.random() < 0.6 && radarChamados.length < 14) radarChamados.push(gerarChamado());
    if (radarChamados.length > 3 && Math.random() < 0.3) {
        radarChamados.splice(Math.floor(Math.random() * radarChamados.length), 1);
    }
    renderRadar();
}

function iniciarRadar() {
    radarChamados = Array.from({ length: 6 }, gerarChamado);
    renderRadar();
    timers.push(setInterval(radarTick, 4000));
}

// ==========================================
// NOTIFICAÇÕES (toasts, sino e badges - simuladas)
// ==========================================

let notificacoes = [];
const NAV_INDEX = { 'tab-agenda': 0, 'tab-heatmap': 1, 'tab-chat': 2, 'tab-perfil': 3 };

function abaAtual() {
    const ativa = document.querySelector('.tab-content.active');
    return ativa ? ativa.id : null;
}

function setBadge(tabId, n) {
    const item = document.querySelectorAll('#nav-personal .nav-item')[NAV_INDEX[tabId]];
    if (!item) return;
    let b = item.querySelector('.nav-badge');
    if (!b) {
        b = document.createElement('span');
        b.className = 'nav-badge';
        item.appendChild(b);
    }
    b.textContent = n > 9 ? '9+' : n;
    b.style.display = n > 0 ? 'flex' : 'none';
}

function atualizarBadgeChat() {
    const total = Object.values(conversas).reduce((s, c) => s + (c.naoLidas || 0), 0);
    setBadge('tab-chat', total);
}

function atualizarBadgeAgenda() {
    setBadge('tab-agenda', agendaDeHoje.filter(s => s.novo).length);
}

function limparBadgeAba(tabId) {
    if (tabId === 'tab-agenda' && agendaDeHoje.some(s => s.novo)) {
        setBadge('tab-agenda', 0);
        setTimeout(() => {
            agendaDeHoje.forEach(s => { s.novo = false; });
            salvarEstado();
            renderizarAgenda();
        }, 4000);
    }
}

function atualizarSino() {
    const n = notificacoes.filter(x => !x.lida).length;
    const b = document.getElementById('bell-badge');
    if (!b) return;
    b.textContent = n > 9 ? '9+' : n;
    b.hidden = n === 0;
}

function irParaAba(tabId) {
    const nav = document.querySelectorAll('#nav-personal .nav-item')[NAV_INDEX[tabId]];
    switchTabPersonal(tabId, nav);
}

function mostrarToast({ icone = '🔔', titulo, texto, aba = null }) {
    const cont = document.getElementById('toast-container');
    if (!cont) return;
    const t = document.createElement('div');
    t.className = 'toast glass';
    t.innerHTML = `<span class="toast-icon">${icone}</span>
                   <div><strong>${escapeHtml(titulo)}</strong><small>${escapeHtml(texto)}</small></div>`;
    t.onclick = () => { if (aba) irParaAba(aba); t.remove(); };
    cont.appendChild(t);
    setTimeout(() => t.remove(), 5000);
}

function registrarNotificacao({ icone, titulo, texto, aba }) {
    notificacoes.unshift({ icone, titulo, texto, aba, hora: horaAgora(), lida: false });
    notificacoes = notificacoes.slice(0, 20);
    atualizarSino();
    mostrarToast({ icone, titulo, texto, aba });
}

function alternarPainelNotificacoes() {
    const painel = document.getElementById('painel-notificacoes');
    painel.hidden = !painel.hidden;
    if (painel.hidden) return;

    painel.innerHTML = notificacoes.length === 0
        ? '<p class="radar-vazio">Sem notificações por enquanto.</p>'
        : '';
    notificacoes.forEach(n => {
        const el = document.createElement('div');
        el.className = `notif-item ${n.lida ? '' : 'nao-lida'}`;
        el.innerHTML = `<span>${n.icone}</span><div><strong>${escapeHtml(n.titulo)}</strong>
                        <small>${escapeHtml(n.texto)} · ${n.hora}</small></div>`;
        el.onclick = () => { painel.hidden = true; if (n.aba) irParaAba(n.aba); };
        painel.appendChild(el);
    });
    notificacoes.forEach(n => { n.lida = true; });
    atualizarSino();
}

function simularNovoAgendamento() {
    const usadas = agendaDeHoje.map(s => s.hora);
    const livres = ['14:00', '15:00', '16:00', '17:00', '18:00', '19:00'].filter(h => !usadas.includes(h));
    if (livres.length === 0) return;

    const aluno = sortear(NOMES_FICTICIOS);
    const objetivo = sortear(RADAR_MODALIDADES);
    agendaDeHoje.push({ hora: livres[0], aluno, objetivo, status: 'ocupado', novo: true });
    agendaDeHoje.sort((a, b) => a.hora.localeCompare(b.hora));
    renderizarAgenda();
    salvarEstado();

    if (abaAtual() !== 'tab-agenda') atualizarBadgeAgenda();
    registrarNotificacao({ icone: '📅', titulo: 'Novo agendamento', texto: `${aluno} · ${livres[0]} · ${objetivo}`, aba: 'tab-agenda' });
}

function simularMensagemAluno() {
    const nomes = Object.keys(conversas);
    if (nomes.length === 0) return;
    const nome = sortear(nomes);
    const texto = sortear([
        'Professor, posso levar um amigo na próxima aula?',
        'Vou chegar 10 minutos atrasado, tudo bem?',
        'Qual a melhor refeição antes do treino?',
        'Confirmado para amanhã!'
    ]);
    adicionarMensagem(nome, 'received', texto);
    if (conversaAtiva !== nome) {
        registrarNotificacao({ icone: '💬', titulo: nome, texto, aba: 'tab-chat' });
    }
}

function iniciarNotificacoes() {
    timers.push(setTimeout(simularNovoAgendamento, 8000));
    timers.push(setTimeout(simularMensagemAluno, 15000));
    timers.push(setInterval(simularNovoAgendamento, 70000));
    timers.push(setInterval(simularMensagemAluno, 45000));
    atualizarSino();
    atualizarBadgeChat();
    atualizarBadgeAgenda();
}

function pararTimers() {
    timers.forEach(t => { clearInterval(t); clearTimeout(t); });
    timers = [];
}
