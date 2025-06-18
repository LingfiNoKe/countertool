document.addEventListener('DOMContentLoaded', () => {
    // --- グローバル変数と状態管理 ---
    let heroesData = [];
    let countersData = {};
    let mapsData = {};
    let synergyData = {};

    let state = {
        allyTeam: Array(5).fill(null),
        enemyTeam: Array(5).fill(null),
        bannedHeroes: [],
        currentMap: 'none',
        myHeroSlotIndex: 0,
        activeSelection: null,
        activeAnalysis: null,
        settings: {
            suggestionCount: 2,
            heroPool: [],
            roleLimits: {} // { tank: 1, damage: 2, support: 2 }
        }
    };

    // --- DOM要素のキャッシュ ---
    const allySlotsContainer = document.getElementById('ally-team-slots');
    const enemySlotsContainer = document.getElementById('enemy-team-slots');
    const heroPalette = document.getElementById('hero-palette');
    const banPalette = document.getElementById('ban-palette');
    const bannedListContainer = document.getElementById('banned-list');
    const mapSelector = document.getElementById('map-selector');
    const roleLimitSettingsContainer = document.getElementById('role-limit-settings');

    // --- 初期化処理 ---
    async function initializeApp() {
        [heroesData, countersData, mapsData, synergyData] = await Promise.all([
            fetch('heroes.json').then(res => res.json()),
            fetch('counters.json').then(res => res.json()),
            fetch('maps.json').then(res => res.json()),
            fetch('synergy.json').then(res => res.json())
        ]);
        
        loadSettings(); // データ読み込み後に設定をロード

        createHeroSlots();
        populatePalettes();
        populateMapSelector();
        populateHeroPoolChecklist();
        populateRoleLimitSettings();

        setupEventListeners();
        renderAll();
    }

    // --- UI生成関数 ---
    function createHeroSlots() {
        allySlotsContainer.innerHTML = '';
        enemySlotsContainer.innerHTML = '';
        for (let i = 0; i < 5; i++) {
            allySlotsContainer.innerHTML += createSlotHTML('ally', i);
            enemySlotsContainer.innerHTML += createSlotHTML('enemy', i);
        }
    }

    function createSlotHTML(team, index) {
        const isMineClass = (team === 'ally' && index === state.myHeroSlotIndex) ? 'is-mine' : '';
        return `
            <div class="hero-slot-wrapper" data-team="${team}" data-index="${index}">
                ${team === 'ally' ? createSuggestionHTML() : ''}
                <div class="hero-slot ${team} ${isMineClass}" data-team="${team}" data-index="${index}">
                    スロット ${index + 1}
                </div>
                ${team === 'enemy' ? createSuggestionHTML() : ''}
            </div>
        `;
    }
    
    function createSuggestionHTML() {
        return `<div class="suggestion-area"><div class="suggestion high-risk"></div><div class="suggestion low-risk"></div></div>`;
    }

    function populatePalettes() {
        heroPalette.innerHTML = '';
        banPalette.innerHTML = '';
        const uniqueRoles = getUniqueRoles();
        const roleNames = { tank: 'タンク', damage: 'ダメージ', support: 'サポート' };

        uniqueRoles.forEach(role => {
            const headerName = roleNames[role] || role;
            const heroHeader = `<h3 class="role-header">${headerName}</h3>`;
            heroPalette.innerHTML += heroHeader;
            banPalette.innerHTML += heroHeader;

            const heroesInRole = heroesData
                .filter(hero => hero.role === role)
                .sort((a, b) => a.name.localeCompare(b.name, 'ja'));

            heroesInRole.forEach(hero => {
                const cardHTML = `<div class="hero-card" data-hero-id="${hero.id}">${hero.name}</div>`;
                heroPalette.innerHTML += cardHTML;
                banPalette.innerHTML += cardHTML;
            });
        });
    }

    function populateMapSelector() {
        mapSelector.innerHTML = '<option value="none">マップ未選択</option>';
        Object.keys(mapsData).forEach(mapId => {
            mapSelector.innerHTML += `<option value="${mapId}">${mapsData[mapId].name}</option>`;
        });
    }

    function populateHeroPoolChecklist() {
        const checklist = document.getElementById('hero-pool-checklist');
        checklist.innerHTML = '';
        [...heroesData].sort((a, b) => a.name.localeCompare(b.name)).forEach(hero => {
            checklist.innerHTML += `<div class="hero-pool-item"><input type="checkbox" id="pool-${hero.id}" data-hero-id="${hero.id}"><label for="pool-${hero.id}">${hero.name}</label></div>`;
        });
    }

    function populateRoleLimitSettings() {
        roleLimitSettingsContainer.innerHTML = '';
        getUniqueRoles().forEach(role => {
            const limit = state.settings.roleLimits[role] || 5;
            roleLimitSettingsContainer.innerHTML += `
                <div class="role-limit-item">
                    <label for="limit-${role}">${role}:</label>
                    <input type="number" id="limit-${role}" data-role="${role}" value="${limit}" min="0" max="5">
                </div>
            `;
        });
    }
    
    // --- イベントリスナー設定 ---
    function setupEventListeners() {
        document.getElementById('battle-board').addEventListener('click', e => {
            if (e.target.closest('.hero-slot')) handleSlotClick(e.target.closest('.hero-slot'));
        });

        heroPalette.addEventListener('click', e => {
            const card = e.target;
            if (card.classList.contains('hero-card') && !card.matches('.banned, .picked, .role-locked')) {
                handleHeroSelection(card.dataset.heroId);
            }
        });
        
        banPalette.addEventListener('click', e => {
            const card = e.target;
            if (card.classList.contains('hero-card') && !card.classList.contains('picked')) {
                toggleBan(card.dataset.heroId);
            }
        });
        
        bannedListContainer.addEventListener('click', e => {
            if (e.target.classList.contains('banned-hero-item')) toggleBan(e.target.dataset.heroId);
        });

        mapSelector.addEventListener('change', e => {
            state.currentMap = e.target.value;
            triggerAnalysisUpdate();
        });

        document.getElementById('global-analysis-btn').addEventListener('click', handleGlobalAnalysis);
        document.getElementById('reset-all-btn').addEventListener('click', resetAll);
        document.getElementById('reset-heroes-btn').addEventListener('click', resetHeroes);
        document.getElementById('reset-bans-btn').addEventListener('click', resetBans);
        document.getElementById('tabs').addEventListener('click', e => {
            if (e.target.classList.contains('tab-link')) switchTab(e.target.dataset.tab);
        });

        document.getElementById('suggestion-count').addEventListener('change', e => {
            state.settings.suggestionCount = parseInt(e.target.value, 10);
            saveSettings();
            triggerAnalysisUpdate();
        });

        roleLimitSettingsContainer.addEventListener('change', e => {
            if (e.target.matches('input[type="number"]')) {
                const role = e.target.dataset.role;
                const value = parseInt(e.target.value, 10);
                state.settings.roleLimits[role] = value;
                saveSettings();
                renderPalettes();
            }
        });
        
        document.getElementById('hero-pool-checklist').addEventListener('change', e => {
            if (e.target.type === 'checkbox') handleHeroPoolChange(e.target);
        });
        
        document.getElementById('export-data-btn').addEventListener('click', exportData);
        document.getElementById('import-data-input').addEventListener('change', importData);
        document.getElementById('import-data-input').previousElementSibling.addEventListener('click', () => document.getElementById('import-data-input').click());
    }
    
    // --- イベントハンドラ ---
    function handleSlotClick(slotElement) {
        const team = slotElement.dataset.team;
        const index = parseInt(slotElement.dataset.index, 10);
        const currentHeroId = state[team === 'ally' ? 'allyTeam' : 'enemyTeam'][index];

        if (currentHeroId) {
            clearAllSuggestions();
            let analysisMode = null;
            if (team === 'ally') {
                analysisMode = index === state.myHeroSlotIndex ? 'Self-Analysis' : 'Ally-Support';
            } else {
                analysisMode = 'Threat-Elimination';
            }
            state.activeAnalysis = { mode: analysisMode, target: { team, index } };
            runActiveAnalysis();
        } else {
            state.activeSelection = { team, index };
            renderActiveSelection();
            switchTab('heroes');
        }
    }

    function handleHeroSelection(heroId) {
        if (state.activeSelection) {
            const { team, index } = state.activeSelection;
            state[team === 'ally' ? 'allyTeam' : 'enemyTeam'][index] = heroId;
            state.activeSelection = null;
            triggerAnalysisUpdate();
        }
    }

    function handleHeroPoolChange(checkbox) {
        const heroId = checkbox.dataset.heroId;
        if (checkbox.checked) {
            if (!state.settings.heroPool.includes(heroId)) state.settings.heroPool.push(heroId);
        } else {
            state.settings.heroPool = state.settings.heroPool.filter(id => id !== heroId);
        }
        saveSettings();
        triggerAnalysisUpdate();
    }
    
    function toggleBan(heroId) {
        const index = state.bannedHeroes.indexOf(heroId);
        if (index > -1) {
            state.bannedHeroes.splice(index, 1);
        } else {
            state.bannedHeroes.push(heroId);
        }
        triggerAnalysisUpdate();
    }
    
    function handleGlobalAnalysis() {
        clearAllSuggestions();
        state.activeAnalysis = { mode: 'Strategic-Optimization', target: null };
        runActiveAnalysis();
    }

    function triggerAnalysisUpdate() {
        if (state.activeAnalysis) runActiveAnalysis();
        renderAll();
    }
    
    // --- 状態リセット関数 ---
    function resetAll() {
        if (!confirm('すべての設定と選択をリセットしますか？')) return;
        Object.assign(state, {
            allyTeam: Array(5).fill(null), enemyTeam: Array(5).fill(null), bannedHeroes: [],
            currentMap: 'none', activeAnalysis: null
        });
        clearAllSuggestions();
        renderAll();
    }
    function resetHeroes() {
        state.allyTeam.fill(null); state.enemyTeam.fill(null);
        state.activeAnalysis = null;
        clearAllSuggestions();
        renderAll();
    }
    function resetBans() {
        state.bannedHeroes = [];
        triggerAnalysisUpdate();
    }

    // --- レンダリング（描画）関数 ---
    function renderAll() {
        renderSlots();
        renderPalettes();
        renderBans();
        renderMapSelector();
        renderSettings();
        renderTeamRoleIcons();
    }

    function renderSlots() {
        document.querySelectorAll('.hero-slot').forEach(slot => {
            const team = slot.dataset.team;
            const index = parseInt(slot.dataset.index, 10);
            const heroId = state[team === 'ally' ? 'allyTeam' : 'enemyTeam'][index];
            if (heroId) {
                slot.textContent = getHeroById(heroId).name;
                slot.classList.add('selected');
            } else {
                slot.textContent = `スロット ${index + 1}`;
                slot.classList.remove('selected');
            }
        });
        renderActiveSelection();
    }

    function renderActiveSelection() {
        document.querySelectorAll('.hero-slot').forEach(s => s.classList.remove('active-selection'));
        if (state.activeSelection) {
            const { team, index } = state.activeSelection;
            document.querySelector(`.hero-slot[data-team="${team}"][data-index="${index}"]`).classList.add('active-selection');
        }
    }

    function renderPalettes() {
        const pickedHeroes = [...state.allyTeam, ...state.enemyTeam].filter(Boolean);
        const allyRoleCounts = countRoles(state.allyTeam);
        const enemyRoleCounts = countRoles(state.enemyTeam);

        document.querySelectorAll('#hero-palette .hero-card, #ban-palette .hero-card').forEach(card => {
            const heroId = card.dataset.heroId;
            const hero = getHeroById(heroId);
            card.classList.remove('picked', 'banned', 'role-locked');

            if (pickedHeroes.includes(heroId)) card.classList.add('picked');
            if (state.bannedHeroes.includes(heroId)) card.classList.add('banned');
            
            // ロールロックのチェック
            if (state.activeSelection) {
                const isAlly = state.activeSelection.team === 'ally';
                const roleCounts = isAlly ? allyRoleCounts : enemyRoleCounts;
                const limit = state.settings.roleLimits[hero.role] ?? 5;
                if ((roleCounts[hero.role] || 0) >= limit) {
                    card.classList.add('role-locked');
                }
            }
        });
    }

    function renderBans() {
        bannedListContainer.innerHTML = state.bannedHeroes.map(heroId => `<div class="banned-hero-item" data-hero-id="${heroId}">${getHeroById(heroId).name}</div>`).join('');
        document.querySelectorAll('#ban-palette .hero-card').forEach(card => {
            card.style.backgroundColor = state.bannedHeroes.includes(card.dataset.heroId) ? 'var(--enemy-color)' : '';
        });
    }
    
    function renderTeamRoleIcons() {
        const allyIconContainer = document.querySelector('#ally-team-column .team-role-icons');
        allyIconContainer.innerHTML = '';
        const roleLimits = state.settings.roleLimits;
        getUniqueRoles().forEach(role => {
            for(let i=0; i < (roleLimits[role] ?? 0); i++) {
                allyIconContainer.innerHTML += `<span class="role-icon ${role}"></span>`;
            }
        });
    }

    function renderMapSelector() { mapSelector.value = state.currentMap; }
    function renderSettings() {
        document.getElementById('suggestion-count').value = state.settings.suggestionCount;
        document.querySelectorAll('#hero-pool-checklist input').forEach(cb => { cb.checked = state.settings.heroPool.includes(cb.dataset.heroId); });
        getUniqueRoles().forEach(role => {
            const input = document.getElementById(`limit-${role}`);
            if (input) input.value = state.settings.roleLimits[role] ?? 5;
        });
    }

    function clearAllSuggestions() {
        document.querySelectorAll('.suggestion').forEach(el => { el.innerHTML = ''; el.classList.remove('show'); });
    }

    // --- 分析ロジック ---
    function runActiveAnalysis() {
        if (!state.activeAnalysis) return;

        // 【変更】自分のヒーローが選択されていない場合、提案を行わない
        const myHeroId = state.allyTeam[state.myHeroSlotIndex];
        if (!myHeroId && state.activeAnalysis.mode !== 'Strategic-Optimization-Empty') {
             clearAllSuggestions();
             return;
        }

        const scores = calculateAllHeroScores(state.activeAnalysis.mode, state.activeAnalysis.target);
        const suggestions = generateSuggestions(scores);
        
        clearAllSuggestions();
        const mySlotWrapper = document.querySelector(`.hero-slot-wrapper[data-team="ally"][data-index="${state.myHeroSlotIndex}"]`);
        if (mySlotWrapper) displaySuggestions(mySlotWrapper, suggestions);
    }

    function calculateAllHeroScores(mode, target) {
        const scores = [];
        const myCurrentHero = getHeroById(state.allyTeam[state.myHeroSlotIndex]);
        
        // 【変更】提案対象のロールを自分のロールに限定する
        const targetRole = myCurrentHero ? myCurrentHero.role : null;
        if (!targetRole) return []; // ロールが不明な場合は提案しない

        const pickedHeroes = [...state.allyTeam, ...state.enemyTeam].filter(Boolean);
        const enemyTeam = state.enemyTeam.filter(Boolean);
        const myTeam = state.allyTeam.filter(h => h && h !== (myCurrentHero ? myCurrentHero.id : null));

        for (const candidateHero of heroesData) {
            // 【変更】ロールが違う、BAN/ピック済み、自分自身の場合はスキップ
            if (candidateHero.role !== targetRole ||
                state.bannedHeroes.includes(candidateHero.id) ||
                pickedHeroes.includes(candidateHero.id) ||
                (myCurrentHero && candidateHero.id === myCurrentHero.id)) {
                continue;
            }

            let counterScore = 0;
            switch(mode) {
                case 'Self-Analysis':
                    const threatsToMe = enemyTeam.filter(e => getCounterScore(myCurrentHero.id, e) < 0);
                    counterScore = threatsToMe.reduce((sum, t) => sum + getCounterScore(candidateHero.id, t), 0);
                    break;
                case 'Ally-Support':
                    const allyHeroId = state.allyTeam[target.index];
                    const threatsToAlly = enemyTeam.filter(e => getCounterScore(allyHeroId, e) < 0);
                    counterScore = threatsToAlly.reduce((sum, t) => sum + getCounterScore(candidateHero.id, t), 0);
                    break;
                case 'Threat-Elimination':
                    const enemyHeroId = state.enemyTeam[target.index];
                    counterScore = getCounterScore(candidateHero.id, enemyHeroId);
                    break;
                case 'Strategic-Optimization':
                    counterScore = enemyTeam.reduce((sum, e) => sum + getCounterScore(candidateHero.id, e), 0);
                    break;
            }

            const mapScore = getMapScore(candidateHero.id, state.currentMap);
            const synergyScore = myTeam.reduce((sum, a) => sum + getSynergyScore(candidateHero.id, a), 0);
            const returnScore = counterScore + mapScore + synergyScore;

            const counterScoresVsEnemies = enemyTeam.map(e => getCounterScore(candidateHero.id, e));
            const riskScore = counterScoresVsEnemies.filter(s => s < 0).reduce((sum, s) => sum + Math.abs(s), 0);
            const specializationScore = calculateStandardDeviation(counterScoresVsEnemies);
            
            scores.push({ heroId: candidateHero.id, return: returnScore, risk: riskScore, specialization: specializationScore });
        }
        return scores;
    }
    
    function generateSuggestions(scores) {
        if (scores.length === 0) return { highRisk: [], lowRisk: [] };
        const topCandidates = scores.sort((a, b) => b.return - a.return).slice(0, 6);
        if (topCandidates.length === 0) return { highRisk: [], lowRisk: [] };

        const riskMedian = calculateMedian(topCandidates.map(c => c.risk));
        const specMedian = calculateMedian(topCandidates.map(c => c.specialization));
        const highRisk = [], lowRisk = [];

        for (const candidate of topCandidates) {
            if (candidate.risk <= riskMedian && candidate.specialization <= specMedian) lowRisk.push(candidate);
            else highRisk.push(candidate);
        }
        
        return { highRisk: highRisk.sort((a,b) => b.return - a.return), lowRisk: lowRisk.sort((a,b) => b.return - a.return) };
    }
    
    function displaySuggestions(slotWrapper, { highRisk, lowRisk }) {
        const count = state.settings.suggestionCount;
        const highRiskArea = slotWrapper.querySelector('.suggestion.high-risk');
        const lowRiskArea = slotWrapper.querySelector('.suggestion.low-risk');
        
        const createHTML = (title, suggestions) => `<h4>${title}</h4>` + suggestions.slice(0, count).map(s => `<div class="${state.settings.heroPool.includes(s.heroId) ? 'greyed-out' : ''}">${getHeroById(s.heroId).name}</div>`).join('');
        
        if (highRisk.length > 0) { highRiskArea.innerHTML = createHTML('【ハイリスク案】', highRisk); highRiskArea.classList.add('show'); }
        if (lowRisk.length > 0) { lowRiskArea.innerHTML = createHTML('【ローリスク案】', lowRisk); lowRiskArea.classList.add('show'); }
    }

    // --- データアクセス＆計算ヘルパー ---
    function getHeroById(id) { return heroesData.find(h => h.id === id); }
    function getUniqueRoles() {
        const allRoles = heroesData.map(h => h.role);
        const unique = [...new Set(allRoles)];
        const order = ['tank', 'damage', 'support'];
        unique.sort((a,b) => (order.indexOf(a) === -1 ? Infinity : order.indexOf(a)) - (order.indexOf(b) === -1 ? Infinity : order.indexOf(b)));
        return unique;
    }
    function countRoles(team) {
        return team.filter(Boolean).reduce((acc, heroId) => {
            const role = getHeroById(heroId).role;
            acc[role] = (acc[role] || 0) + 1;
            return acc;
        }, {});
    }

    function getCounterScore(heroA, heroB) {
        if (countersData[heroA]?.[heroB] !== undefined) return countersData[heroA][heroB];
        if (countersData[heroB]?.[heroA] !== undefined) return -countersData[heroB][heroA];
        return 0;
    }
    function getSynergyScore(heroA, heroB) {
        if (synergyData[heroA]?.[heroB] !== undefined) return synergyData[heroA][heroB];
        if (synergyData[heroB]?.[heroA] !== undefined) return synergyData[heroB][heroA];
        return 0;
    }
    function getMapScore(heroId, mapId) { return mapsData[mapId]?.heroAffinity?.[heroId] || 0; }
    function calculateMedian(arr) {
        if (arr.length === 0) return 0;
        const sorted = [...arr].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    }
    function calculateStandardDeviation(arr) {
        if (arr.length < 2) return 0;
        const n = arr.length;
        const mean = arr.reduce((a, b) => a + b) / n;
        const variance = arr.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
        return Math.sqrt(variance);
    }
    
    // --- パーソナライズ機能 ---
    function saveSettings() {
        localStorage.setItem('owAnalyzerSettings', JSON.stringify(state.settings));
    }

    function loadSettings() {
        const saved = localStorage.getItem('owAnalyzerSettings');
        if (saved) {
            Object.assign(state.settings, JSON.parse(saved));
        }
        // デフォルトのロール制限を設定（未設定の場合）
        const roles = getUniqueRoles();
        let needsSave = false;
        roles.forEach(role => {
            if (state.settings.roleLimits[role] === undefined) {
                const defaults = { tank: 1, damage: 2, support: 2 };
                state.settings.roleLimits[role] = defaults[role] ?? 5;
                needsSave = true;
            }
        });
        if (needsSave) saveSettings();
    }

    function switchTab(tabId) {
        document.querySelectorAll('.tab-pane, .tab-link').forEach(el => el.classList.remove('active'));
        document.getElementById(`${tabId}-tab`).classList.add('active');
        document.querySelector(`.tab-link[data-tab="${tabId}"]`).classList.add('active');
    }
    
    function exportData() {
        const dataToExport = { counters: countersData, synergy: synergyData, maps: mapsData };
        const blob = new Blob([JSON.stringify(dataToExport, null, 2)], {type: "application/json"});
        const url = URL.createObjectURL(blob);
        const a = Object.assign(document.createElement('a'), { href: url, download: 'ow_analyzer_data.json' });
        a.click();
        URL.revokeObjectURL(url);
    }

    function importData(event) {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const importedData = JSON.parse(e.target.result);
                if (importedData.counters && importedData.synergy && importedData.maps) {
                    if (confirm('現在の相性・シナジー・マップデータをインポートしたデータで上書きしますか？')) {
                        countersData = importedData.counters;
                        synergyData = importedData.synergy;
                        mapsData = importedData.maps;
                        populateMapSelector();
                        triggerAnalysisUpdate();
                        alert('データのインポートが完了しました。');
                    }
                } else { alert('無効なファイル形式です。'); }
            } catch (error) { alert('ファイルの読み込みに失敗しました: ' + error.message); }
        };
        reader.readAsText(file);
        event.target.value = '';
    }

    initializeApp();
});
