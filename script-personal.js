// Script Completo e Atualizado - TAPAGO Personal
// Contém: Validação de Termos, Trava de Aceite, Logout de Segurança, Radar e Mercado Pago Split

document.addEventListener('DOMContentLoaded', () => {
    carregarSessaoPersonal();
});

// 1. GESTÃO DE SESSÃO E LOGIN
function carregarSessaoPersonal() {
    const userSalvo = localStorage.getItem('tapago_personal_user');
    if (userSalvo) {
        const dados = JSON.parse(userSalvo);
        preencherDadosPersonal(dados);
        mostrarTelaDashboard();
    }
}

function preencherDadosPersonal(dados) {
    const nome = dados.nome || 'Professor';
    const cref = dados.cref || 'Não informado';
    
    document.getElementById('nome-exibicao').innerText = nome;
    document.getElementById('perfil-nome-display').innerText = nome;
    document.getElementById('perfil-cref-display').innerText = `CREF: ${cref}`;
    
    // Iniciais do Avatar
    const inicial = nome.charAt(0).toUpperCase();
    document.getElementById('initials-header').innerText = inicial;
    document.getElementById('initials-perfil').innerText = inicial;

    if (dados.bio) {
        document.getElementById('personal-input-bio').value = dados.bio;
    }
    if (dados.pix) {
        document.getElementById('personal-input-pix').value = dados.pix;
    }
}

window.validarProfissional = function() {
    const nome = document.getElementById('input-nome').value.trim();
    const cpf = document.getElementById('input-cpf').value.trim();
    const cref = document.getElementById('input-cref').value.trim();
    const checkTermos = document.getElementById('check-termos').checked;

    if (!checkTermos) {
        alert("É necessário ler e aceitar os Termos de Uso para prosseguir.");
        return;
    }

    if (!nome || !cpf || !cref) {
        alert("Por favor, preencha Nome, CPF e CREF para entrar.");
        return;
    }

    const loader = document.getElementById('login-loader');
    if (loader) loader.style.display = 'block';

    setTimeout(() => {
        if (loader) loader.style.display = 'none';
        const dadosUser = { nome, cpf, cref, bio: '', pix: '' };
        
        if (document.getElementById('check-remember').checked) {
            localStorage.setItem('tapago_personal_user', JSON.stringify(dadosUser));
        }

        preencherDadosPersonal(dadosUser);
        mostrarTelaDashboard();
    }, 1000);
}

window.loginComGoogle = function() {
    const checkTermos = document.getElementById('check-termos').checked;
    if (!checkTermos) {
        alert("É necessário concordar com os Termos de Uso antes de acessar.");
        return;
    }

    const dadosUser = {
        nome: "Prof. Marcos Silva",
        cpf: "12345678900",
        cref: "012345-G/SP",
        bio: "Especialista em Hipertrofia e Condicionamento Físico.",
        pix: "marcos.personal@email.com"
    };

    localStorage.setItem('tapago_personal_user', JSON.stringify(dadosUser));
    preencherDadosPersonal(dadosUser);
    mostrarTelaDashboard();
}

function mostrarTelaDashboard() {
    document.getElementById('screen-login-personal').classList.remove('active');
    document.getElementById('screen-dashboard').classList.add('active');
    carregarListaAgenda();
}

// 2. FUNÇÕES DO MODAL DE TERMOS E ACEITE
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
    const modal = document.getElementById('modal-termos');
    if (modal) modal.classList.add('active');
}

window.fecharModalTermos = function() {
    const modal = document.getElementById('modal-termos');
    if (modal) modal.classList.remove('active');
}

window.aceitarTermosModal = function() {
    document.getElementById('check-termos').checked = true;
    validarCheckTermos();
    fecharModalTermos();
}

// 3. FUNÇÃO SAIR / LOGOUT (CORRIGIDO)
window.sairModoPessoal = function() {
    if (confirm("Deseja realmente sair do modo profissional?")) {
        localStorage.removeItem('tapago_personal_user');
        
        const screenDash = document.getElementById('screen-dashboard');
        const screenLogin = document.getElementById('screen-login-personal');

        if (screenDash) screenDash.classList.remove('active');
        if (screenLogin) screenLogin.classList.add('active');

        // Reseta formulários de login
        document.getElementById('check-termos').checked = false;
        validarCheckTermos();
    }
}

// 4. MUDANÇA DE ABAS
window.switchTabPersonal = function(tabId, element) {
    const tabs = document.querySelectorAll('.tab-content');
    tabs.forEach(tab => tab.classList.remove('active'));

    const navItems = document.querySelectorAll('#nav-personal .nav-item');
    navItems.forEach(item => item.classList.remove('active'));

    const targetTab = document.getElementById(tabId);
    if (targetTab) targetTab.classList.add('active');
    if (element) element.classList.add('active');

    if (tabId === 'tab-heatmap' && typeof initMapAlunos === 'function') {
        setTimeout(() => { initMapAlunos(); }, 200);
    }
}

// 5. MERCADO PAGO SPLIT (85% PERSONAL / 15% TAPAGO)
window.iniciarCheckoutMercadoPago = function(valorAula) {
    const taxaPlataforma = valorAula * 0.15; // 15% de retenção
    const repassePersonal = valorAula * 0.85;  // 85% para o personal

    alert(`Iniciando Checkout Split Mercado Pago:\n\nValor Aula: R$ ${valorAula.toFixed(2)}\n• Repasse Personal (85%): R$ ${repassePersonal.toFixed(2)}\n• Taxa TAPAGO (15%): R$ ${taxaPlataforma.toFixed(2)}`);
}

window.fecharModalQRCode = function() {
    const modal = document.getElementById('modal-qrcode');
    if (modal) modal.classList.remove('active');
}

// 6. NAVEGAÇÃO E AGENDA FAKE/EXEMPLO
function carregarListaAgenda() {
    const container = document.getElementById('lista-agenda');
    if (!container) return;

    container.innerHTML = `
        <div class="glass" style="padding: 12px; border-left: 4px solid var(--neon-green); display: flex; justify-content: space-between; align-items: center;">
            <div>
                <strong style="font-size: 14px;">Carlos Eduardo</strong>
                <p style="font-size: 11px; color: var(--text-muted); margin: 2px 0;">Hoje às 18:00 • Hipertrofia</p>
            </div>
            <button class="btn btn-primary" style="font-size: 10px; padding: 5px 10px;" onclick="document.getElementById('modal-qrcode').classList.add('active')">Cobrar R$ 80</button>
        </div>
    `;
}

// 7. INICIALIZAÇÃO DO MAPA DO PERSONAL
window.initMapAlunos = function() {
    const mapElement = document.getElementById('mapa-alunos');
    if (!mapElement || typeof google === 'undefined') return;

    const spCoords = { lat: -23.55052, lng: -46.633308 };
    const map = new google.maps.Map(mapElement, {
        zoom: 13,
        center: spCoords,
        disableDefaultUI: true
    });

    new google.maps.Marker({
        position: spCoords,
        map: map,
        title: "Sua Localização Atual"
    });
}
