document.addEventListener('DOMContentLoaded', () => {
    // --- グローバル変数と状態管理 ---
    let heroesData = [], countersData = {}, mapsData = {}, synergyData = {};
    let state = {
        allyTeam: Array(5).fill(null),
        enemyTeam: Array(5).fill(null),
        bannedHeroes: [],
        currentMap: 'none',
        myHeroSlotIndex: 0,
        activeSelection: null,
        settings: {
            suggestionCount: 2,
            heroPool: [],
            roleLimits: {},
            allowTeamDuplicates: false
        }
    };

    // --- DOM要素のキャッシュ ---
    const elements = {
        allySlotsContainer: document.getElementById('ally-team-slots'),
        enemySlotsContainer: document.getElementById('enemy-team-slots'),
        heroPalette: document.getElementById('hero-palette'),
        banPalette: document.getElementById('ban-palette'),
        bannedListContainer: document.getElementById('banned-list'),
        mapSelector: document.getElementById('map-selector'),
        roleLimitSettingsContainer: document.getElementById('role-limit-settings'),
        allowDuplicatesCheckbox: document.getElementById('allow-duplicates-checkbox'),
        suggestionCountSelect: document.getElementById('suggestion-count'),
        heroPoolChecklist: document.getElementById('hero-pool-checklist'),
        globalSuggestionArea: document.getElementById('global-suggestion-area'),
        battleBoard: document.getElementById('battle-board'),
        tabs: document.getElementById('tabs'),
        resetAllBtn: document.getElementById('reset-all-btn'),
        resetHeroesBtn: document.getElementById('reset-heroes-btn'),
        resetBansBtn: document.getElementById('reset-bans-btn'),
        exportBtn: document.getElementById('export-data-btn'),
        importInput: document.getElementById('import-data-input')
    };

    // --- 初期化処理 ---
    async function initializeApp() {
        [heroesData, countersData, mapsData, synergyData] = await Promise.all([
            fetch('heroes.json').then(res => res.json()), fetch('counters.json').then(res => res.json()),
            fetch('maps.json').then(res => res.json()), fetch('synergy.json').then(res => res.json())
        ]);
        loadSettings();
        createHeroSlots();
        populatePalettes();
        populateMapSelector();
        populateHeroPoolChecklist();
        populateRoleLimitSettings();
        setupEventListeners();
        runAllAnalyses();
        renderAll();
    }

    // --- UI生成 ---
    function createHeroSlots() {
        for (let i = 0; i < 5; i++) {
            elements.allySlotsContainer.innerHTML += createSlotHTML('ally', i);
            elements.enemySlotsContainer.innerHTML += createSlotHTML('enemy', i);
        }
    }
    function createSlotHTML(team, index) {
        const isMineClass = (team === 'ally' && index === state.myHeroSlotIndex) ? 'is-mine' : '';
        const suggestionHTML = `<div class="suggestion-area"><div class="suggestion high-risk"></div><div class="suggestion low-risk"></div></div>`;
        return `<div class="hero-slot-wrapper" data-team="${team}" data-index="${index}">${team === 'ally' ? suggestionHTML : ''}<div class="hero-slot ${team} ${isMineClass}" data-team="${team}" data-index="${index}">スロット ${index + 1}</div>${team === 'enemy' ? suggestionHTML : ''}</div>`;
    }
    function populatePalettes() {
        const uniqueRoles = getUniqueRoles();
        const roleNames = { tank: 'タンク', damage: 'ダメージ', support: 'サポート' };
        [elements.heroPalette, elements.banPalette].forEach(palette => {
            palette.innerHTML = uniqueRoles.map(role => `
                <h3 class="role-header">${roleNames[role] || role}</h3>
                ${heroesData.filter(h => h.role === role).sort((a,b) => a.name.localeCompare(b.name,'ja')).map(h => `<div class="hero-card" data-hero-id="${h.id}">${h.name}</div>`).join('')}`
            ).join('');
        });
    }
    function populateMapSelector() { elements.mapSelector.innerHTML += Object.keys(mapsData).map(id => `<option value="${id}">${mapsData[id].name}</option>`).join(''); }
    function populateHeroPoolChecklist() { elements.heroPoolChecklist.innerHTML = [...heroesData].sort((a,b) => a.name.localeCompare(b.name,'ja')).map(h => `<div class="hero-pool-item"><input type="checkbox" id="pool-${h.id}" data-hero-id="${h.id}"><label for="pool-${h.id}">${h.name}</label></div>`).join(''); }
    function populateRoleLimitSettings() { elements.roleLimitSettingsContainer.innerHTML = getUniqueRoles().map(role => `<div class="role-limit-item"><label for="limit-${role}">${role}:</label><input type="number" id="limit-${role}" data-role="${role}" value="${state.settings.roleLimits[role]??5}" min="0" max="5"></div>`).join(''); }

    // --- イベントリスナー設定 ---
    function setupEventListeners() {
        elements.battleBoard.addEventListener('click', e => {
            if (e.target.closest('.hero-slot')) handleSlotClick(e.target.closest('.hero-slot'));
        });
        elements.heroPalette.addEventListener('click', e => {
            if (e.target.matches('.hero-card:not(.banned, .picked, .role-locked)')) handleHeroSelection(e.target.dataset.heroId);
        });
        elements.banPalette.addEventListener('click', e => { if (e.target.matches('.hero-card')) toggleBan(e.target.dataset.heroId); });
        elements.bannedListContainer.addEventListener('click', e => { if (e.target.matches('.banned-hero-item')) toggleBan(e.target.dataset.heroId); });
        elements.mapSelector.addEventListener('change', () => { state.currentMap = elements.mapSelector.value; runAllAnalysesAndRender(); });
        elements.suggestionCountSelect.addEventListener('change', () => { state.settings.suggestionCount = parseInt(elements.suggestionCountSelect.value,10); saveAndReRender(); });
        elements.roleLimitSettingsContainer.addEventListener('change', e => { if (e.target.matches('input')) { state.settings.roleLimits[e.target.dataset.role] = parseInt(e.target.value, 10); saveAndReRender(); }});
        elements.allowDuplicatesCheckbox.addEventListener('change', () => { state.settings.allowTeamDuplicates = elements.allowDuplicatesCheckbox.checked; saveAndReRender(); });
        elements.heroPoolChecklist.addEventListener('change', e => { if (e.target.matches('input')) { handleHeroPoolChange(e.target); saveAndReRender(); }});
        elements.tabs.addEventListener('click', e => { if (e.target.matches('.tab-link')) switchTab(e.target.dataset.tab); });
        elements.resetAllBtn.addEventListener('click', resetAll);
        elements.resetHeroesBtn.addEventListener('click', resetHeroes);
        elements.resetBansBtn.addEventListener('click', resetBans);
        elements.exportBtn.addEventListener('click', exportData);
        elements.importInput.addEventListener('change', importData);
        elements.importInput.previousElementSibling.addEventListener('click', () => elements.importInput.click());
    }

    // --- イベントハンドラ ---
    function handleSlotClick(slotElement) { state.activeSelection = { team: slotElement.dataset.team, index: parseInt(slotElement.dataset.index, 10) }; renderActiveSelection(); renderPalettes(); switchTab('heroes'); }
    function handleHeroSelection(heroId) {
        if (!state.activeSelection) return;
        const { team, index } = state.activeSelection;
        const teamState = team === 'ally' ? state.allyTeam : state.enemyTeam;
        if (teamState[index] !== heroId) { teamState[index] = heroId; runAllAnalysesAndRender(); }
    }
    function toggleBan(heroId) {
        const index = state.bannedHeroes.indexOf(heroId);
        if (index > -1) state.bannedHeroes.splice(index, 1);
        else state.bannedHeroes.push(heroId);
        runAllAnalysesAndRender();
    }
    function handleHeroPoolChange(checkbox) {
        const heroId = checkbox.dataset.heroId;
        if (checkbox.checked) { if (!state.settings.heroPool.includes(heroId)) state.settings.heroPool.push(heroId); }
        else { state.settings.heroPool = state.settings.heroPool.filter(id => id !== heroId); }
    }
    function saveAndReRender() { saveSettings(); runAllAnalysesAndRender(); }
    
    // --- 状態リセット ---
    function resetAll() { if (confirm('すべての設定と選択をリセットしますか？')) { state.allyTeam.fill(null); state.enemyTeam.fill(null); state.bannedHeroes = []; state.currentMap = 'none'; runAllAnalysesAndRender(); }}
    function resetHeroes() { state.allyTeam.fill(null); state.enemyTeam.fill(null); runAllAnalysesAndRender(); }
    function resetBans() { state.bannedHeroes = []; runAllAnalysesAndRender(); }

    // --- 分析と描画のメインフロー ---
    function runAllAnalysesAndRender() { runAllAnalyses(); renderAll(); }
    
    function runAllAnalyses() {
        clearAllSuggestions();
        for (let i = 0; i < 5; i++) {
            const allyWrapper = document.querySelector(`.hero-slot-wrapper[data-team="ally"][data-index="${i}"]`);
            if(state.allyTeam[i]) {
                const mode = i === state.myHeroSlotIndex ? 'Self-Analysis' : 'Ally-Support';
                displaySuggestions(allyWrapper, runAnalysis(mode, {team: 'ally', index: i}));
            }
            const enemyWrapper = document.querySelector(`.hero-slot-wrapper[data-team="enemy"][data-index="${i}"]`);
            if(state.enemyTeam[i]) {
                displaySuggestions(enemyWrapper, runAnalysis('Threat-Elimination', {team: 'enemy', index: i}));
            }
        }
        displaySuggestions(elements.globalSuggestionArea, runAnalysis('Strategic-Optimization', null));
    }

    function runAnalysis(mode, target) {
        const scores = calculateAllHeroScores(mode, target);
        return generateSuggestions(scores);
    }
    
    function calculateAllHeroScores(mode, target) {
        const scores = [];
        const myCurrentHero = getHeroById(state.allyTeam[state.myHeroSlotIndex]);
        const targetRole = myCurrentHero ? myCurrentHero.role : null;
        if (!targetRole && mode !== 'Strategic-Optimization') return [];

        const enemyTeam = state.enemyTeam.filter(Boolean);
        const myTeamForSynergy = state.allyTeam.filter(h => h && h !== (myCurrentHero ? myCurrentHero.id : null));

        for (const candidateHero of heroesData) {
            if ( (targetRole && candidateHero.role !== targetRole) || state.bannedHeroes.includes(candidateHero.id) || (myCurrentHero && candidateHero.id === myCurrentHero.id) || (!state.settings.allowTeamDuplicates && state.allyTeam.includes(candidateHero.id)) ) {
                continue;
            }
            let counterScore = 0;
            const targetHeroId = target ? getHeroIdBySlot(target) : null;

            switch(mode) {
                case 'Self-Analysis':
                case 'Ally-Support':
                    const threats = enemyTeam.filter(e => getCounterScore(targetHeroId, e) < 0);
                    counterScore = threats.reduce((sum, t) => sum + getCounterScore(candidateHero.id, t), 0);
                    break;
                case 'Threat-Elimination':
                    counterScore = getCounterScore(candidateHero.id, targetHeroId);
                    break;
                case 'Strategic-Optimization':
                    counterScore = enemyTeam.reduce((sum, e) => sum + getCounterScore(candidateHero.id, e), 0);
                    break;
            }
            const mapScore = getMapScore(candidateHero.id, state.currentMap);
            const synergyScore = myTeamForSynergy.reduce((sum, a) => sum + getSynergyScore(candidateHero.id, a), 0);
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
        const topCandidates = scores.sort((a,b) => b.return - a.return).slice(0, 6);
        if (topCandidates.length === 0) return { highRisk: [], lowRisk: [] };
        const riskMedian = calculateMedian(topCandidates.map(c => c.risk));
        const specMedian = calculateMedian(topCandidates.map(c => c.specialization));
        const highRisk = [], lowRisk = [];
        for (const c of topCandidates) { (c.risk<=riskMedian && c.specialization<=specMedian ? lowRisk : highRisk).push(c); }
        return { highRisk: highRisk.sort((a,b) => b.return - a.return), lowRisk: lowRisk.sort((a,b) => b.return - a.return) };
    }

    // --- レンダリング ---
    function renderAll() {
        renderSlots();
        renderBans();
        renderTeamRoleIcons();
        renderSettings();
        if(state.activeSelection) { // アクティブな選択がある時だけパレットを更新
             renderPalettes();
             renderActiveSelection();
        }
    }
    function renderSlots() { document.querySelectorAll('.hero-slot').forEach(slot => { const { team, index } = slot.dataset; const heroId = state[`${team}Team`][index]; if(heroId) { slot.textContent = getHeroById(heroId).name; slot.classList.add('selected'); } else { slot.textContent = `スロット ${parseInt(index)+1}`; slot.classList.remove('selected'); }}); }
    function renderActiveSelection() { document.querySelectorAll('.hero-slot.active-selection').forEach(s => s.classList.remove('active-selection')); if (state.activeSelection) { const { team, index } = state.activeSelection; document.querySelector(`.hero-slot[data-team="${team}"][data-index="${index}"]`).classList.add('active-selection'); }}
    
    /**
     * 【変更】ヒーローパレットのロック条件を修正。
     * ロール上限に達していても、そのロールのヒーローと入れ替える場合はロックしない。
     */
    function renderPalettes() {
        if (!state.activeSelection) return;
        const { team, index } = state.activeSelection;
        const targetTeamState = team === 'ally' ? state.allyTeam : state.enemyTeam;
        const pickedInTeam = state.settings.allowTeamDuplicates ? [] : targetTeamState.filter(Boolean);
        const roleCounts = countRoles(targetTeamState);
        const selectedSlotHeroId = targetTeamState[index];
        const selectedSlotHero = selectedSlotHeroId ? getHeroById(selectedSlotHeroId) : null;

        document.querySelectorAll('#hero-palette .hero-card, #ban-palette .hero-card').forEach(card => {
            const hero = getHeroById(card.dataset.heroId);
            card.className = 'hero-card'; // Reset classes
            if (state.bannedHeroes.includes(hero.id)) card.classList.add('banned');
            if (pickedInTeam.includes(hero.id)) card.classList.add('picked');
            
            const limit = state.settings.roleLimits[hero.role] ?? 5;
            let isLocked = (roleCounts[hero.role] || 0) >= limit;
            
            // ロックの例外条件: 選択中のスロットのヒーローのロールと同じなら、ロックを解除
            if (isLocked && selectedSlotHero && hero.role === selectedSlotHero.role) {
                isLocked = false;
            }
            // 空のスロットを選択中で、ロールが埋まっている場合はロック
            if (!selectedSlotHero && isLocked){
                isLocked = true;
            }

            if (isLocked) card.classList.add('role-locked');
        });
    }

    function renderBans() { elements.bannedListContainer.innerHTML = state.bannedHeroes.map(id => `<div class="banned-hero-item" data-hero-id="${id}">${getHeroById(id).name}</div>`).join(''); }
    function renderTeamRoleIcons() { const container = document.querySelector('#ally-team-column .team-role-icons'); container.innerHTML = ''; getUniqueRoles().forEach(role => { for(let i=0; i<(state.settings.roleLimits[role]??0); i++) container.innerHTML += `<span class="role-icon ${role}"></span>`; }); }
    function renderSettings() { elements.suggestionCountSelect.value = state.settings.suggestionCount; elements.allowDuplicatesCheckbox.checked = state.settings.allowTeamDuplicates; document.querySelectorAll('#hero-pool-checklist input').forEach(cb => cb.checked = state.settings.heroPool.includes(cb.dataset.heroId)); getUniqueRoles().forEach(role => { const input = document.getElementById(`limit-${role}`); if (input) input.value = state.settings.roleLimits[role] ?? 5; }); }
    function displaySuggestions(wrapper, { highRisk, lowRisk }) {
        if (!wrapper) return;
        const highRiskArea = wrapper.querySelector('.suggestion.high-risk');
        const lowRiskArea = wrapper.querySelector('.suggestion.low-risk');
        const createHTML = (title, suggestions) => `<h4>${title}</h4>` + suggestions.slice(0, state.settings.suggestionCount).map(s => `<div class="${state.settings.heroPool.includes(s.heroId) ? 'greyed-out' : ''}">${getHeroById(s.heroId).name}</div>`).join('');
        if (highRisk.length > 0) { highRiskArea.innerHTML = createHTML('【ハイリスク案】', highRisk); highRiskArea.classList.add('show'); }
        if (lowRisk.length > 0) { lowRiskArea.innerHTML = createHTML('【ローリスク案】', lowRisk); lowRiskArea.classList.add('show'); }
    }
    function clearAllSuggestions() { document.querySelectorAll('.suggestion').forEach(el => { el.innerHTML = ''; el.classList.remove('show'); }); }

    // --- データアクセス＆ヘルパー ---
    function getHeroById(id) { return heroesData.find(h => h.id === id); }
    function getHeroIdBySlot(target) { return state[`${target.team}Team`][target.index]; }
    function getUniqueRoles() { const order = ['tank', 'damage', 'support']; return [...new Set(heroesData.map(h => h.role))].sort((a,b) => (order.indexOf(a) === -1 ? Infinity : order.indexOf(a)) - (order.indexOf(b) === -1 ? Infinity : order.indexOf(b))); }
    function countRoles(team) { return team.filter(Boolean).reduce((acc, id) => { const role = getHeroById(id).role; acc[role] = (acc[role] || 0) + 1; return acc; }, {}); }
    function getCounterScore(heroA, heroB) { if(!heroA || !heroB) return 0; if (countersData[heroA]?.[heroB] !== undefined) return countersData[heroA][heroB]; if (countersData[heroB]?.[heroA] !== undefined) return -countersData[heroB][heroA]; return 0; }
    function getSynergyScore(heroA, heroB) { if(!heroA || !heroB) return 0; if (synergyData[heroA]?.[heroB] !== undefined) return synergyData[heroA][heroB]; if (synergyData[heroB]?.[heroA] !== undefined) return synergyData[heroB][heroA]; return 0; }
    function getMapScore(heroId, mapId) { return mapsData[mapId]?.heroAffinity?.[heroId] || 0; }
    function calculateMedian(arr) { if (arr.length===0) return 0; const s = [...arr].sort((a,b)=>a-b), mid=Math.floor(s.length/2); return s.length%2!==0?s[mid]:(s[mid-1]+s[mid])/2; }
    function calculateStandardDeviation(arr) { if(arr.length<2)return 0; const n=arr.length,mean=arr.reduce((a,b)=>a+b)/n; return Math.sqrt(arr.reduce((a,b)=>a+(b-mean)**2,0)/n); }

    // --- パーソナライズ機能 ---
    function saveSettings() { localStorage.setItem('owAnalyzerSettings', JSON.stringify(state.settings)); }
    function loadSettings() {
        const saved = localStorage.getItem('owAnalyzerSettings');
        if (saved) Object.assign(state.settings, JSON.parse(saved));
        let needsSave = false;
        getUniqueRoles().forEach(role => { if (state.settings.roleLimits[role] === undefined) { const defaults = {tank:1,damage:2,support:2}; state.settings.roleLimits[role] = defaults[role]??5; needsSave=true; }});
        if(needsSave) saveSettings();
    }
    function switchTab(tabId) { document.querySelectorAll('.tab-pane, .tab-link').forEach(el => el.classList.remove('active')); document.getElementById(`${tabId}-tab`).classList.add('active'); document.querySelector(`.tab-link[data-tab="${tabId}"]`).classList.add('active'); }
    function exportData() { const blob = new Blob([JSON.stringify({ counters: countersData, synergy: synergyData, maps: mapsData }, null, 2)], {type: "application/json"}); const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'ow_analyzer_data.json' }); a.click(); URL.revokeObjectURL(a.href); }
    function importData(event) {
        const file = event.target.files[0]; if (!file) return;
        const reader = new FileReader();
        reader.onload = e => { try { const d = JSON.parse(e.target.result); if (d.counters&&d.synergy&&d.maps&&confirm('設定を上書きしますか？')) { countersData=d.counters; synergyData=d.synergy; mapsData=d.maps; populateMapSelector(); runAllAnalysesAndRender(); alert('インポート完了'); } else { alert('無効なファイル'); } } catch (err) { alert('読込失敗: '+err); }};
        reader.readAsText(file); event.target.value = '';
    }

    initializeApp();
});
