document.addEventListener('DOMContentLoaded', () => {
    // --- グローバル変数と状態管理 ---
    let heroesData = [], countersData = {}, mapsData = {}, synergyData = {};
    let state = {
        allyTeam: [], enemyTeam: [], bannedHeroes: [],
        currentMap: 'none', myHeroSlotIndex: 0, activeSelection: null,
        settings: {
            teamSize: 5, suggestionCount: 3, heroPool: [], 
            roleLimits: {}, allowTeamDuplicates: false
        }
    };
    const elements = {};
    let drawnLines = [];

    // --- 初期化フロー ---
    async function initializeApp() {
        cacheDOMElements();
        await loadData();
        loadSettings();
        initializeAppState();
        createUI();
        setupEventListeners();
        runAllAnalysesAndRender();
    }

    function cacheDOMElements() {
        const idMap = {
            battleBoard: 'battle-board', allySlotsContainer: 'ally-team-slots',
            enemySlotsContainer: 'enemy-team-slots', heroPalette: 'hero-palette',
            banPalette: 'ban-palette', bannedList: 'banned-list', 
            teamSizeSelect: 'team-size-select', roleLimitSettingsContainer: 'role-limit-settings',
            allowDuplicatesCheckbox: 'allow-duplicates-checkbox', suggestionCount: 'suggestion-count',
            heroPoolChecklist: 'hero-pool-checklist', mapSelector: 'map-selector', 
            globalSuggestionArea: 'global-suggestion-area', resetAllBtn: 'reset-all-btn', 
            resetHeroesBtn: 'reset-heroes-btn', resetBansBtn: 'reset-bans-btn',
            exportBtn: 'export-data-btn', importInput: 'import-data-input', 
            tabInterface: 'tab-interface', relationView: 'relation-view', 
            relationAllyList: 'relation-ally-list', relationEnemyList: 'relation-enemy-list'
        };
        for (const key in idMap) {
            elements[key] = document.getElementById(idMap[key]);
        }
    }
    async function loadData() { [heroesData, countersData, mapsData, synergyData] = await Promise.all([fetch('heroes.json').then(r=>r.json()), fetch('counters.json').then(r=>r.json()), fetch('maps.json').then(r=>r.json()), fetch('synergy.json').then(r=>r.json())]); }
    function initializeAppState() { const size = state.settings.teamSize; state.allyTeam = Array(size).fill(null); state.enemyTeam = Array(size).fill(null); state.myHeroSlotIndex = Math.min(state.myHeroSlotIndex, size - 1); }
    function createUI() { createHeroSlots(); populatePalettes(); populateMapSelector(); populateHeroPoolChecklist(); populateRoleLimitSettings(); renderSettings(); }
    
    // --- UI生成 ---
    function createHeroSlots() {
        elements.allySlotsContainer.innerHTML = '';
        elements.enemySlotsContainer.innerHTML = '';
        for (let i = 0; i < state.settings.teamSize; i++) {
            elements.allySlotsContainer.innerHTML += createSlotHTML('ally', i);
            elements.enemySlotsContainer.innerHTML += createSlotHTML('enemy', i);
        }
    }
    function createSlotHTML(team, index) {
        const isMineClass = (team === 'ally' && index === state.myHeroSlotIndex) ? 'is-mine' : '';
        const wrapperStyle = team === 'enemy' ? ' style="flex-direction: row-reverse;"' : '';
        return `<div class="hero-slot-wrapper" id="wrapper-${team}-${index}" data-team="${team}" data-index="${index}"${wrapperStyle}><div class="suggestion-area"></div><div class="hero-slot ${team} ${isMineClass}" id="slot-${team}-${index}" data-team="${team}" data-index="${index}">スロット ${index + 1}</div></div>`;
    }
    function populatePalettes() { const uniqueRoles = getUniqueRoles(); [elements.heroPalette, elements.banPalette].forEach(p => { p.innerHTML = uniqueRoles.map(r => `<h3 class="role-header">${r}</h3>` + heroesData.filter(h => h.role === r).sort((a, b) => a.name.localeCompare(b.name, 'ja')).map(h => `<div class="hero-card" data-hero-id="${h.id}">${h.name}</div>`).join('')).join(''); }); }
    function populateMapSelector() { elements.mapSelector.innerHTML = '<option value="none">マップ未選択</option>' + Object.keys(mapsData).map(id => `<option value="${id}">${mapsData[id].name}</option>`).join(''); }
    function populateHeroPoolChecklist() { elements.heroPoolChecklist.innerHTML = [...heroesData].sort((a,b)=>a.name.localeCompare(b.name,'ja')).map(h=>`<div class="hero-pool-item"><input type="checkbox" id="pool-${h.id}" data-hero-id="${h.id}"><label for="pool-${h.id}">${h.name}</label></div>`).join('');}
    function populateRoleLimitSettings() { elements.roleLimitSettingsContainer.innerHTML = getUniqueRoles().map(r => `<div class="role-limit-item"><label for="limit-${r}">${r}:</label><input type="number" id="limit-${r}" data-role="${r}" value="${state.settings.roleLimits[r]??state.settings.teamSize}" min="0" max="${state.settings.teamSize}"></div>`).join(''); }

    // --- イベントリスナー ---
    function setupEventListeners() {
        document.getElementById('battle-board').addEventListener('click', e => { if (e.target.closest('.hero-slot')) handleSlotClick(e.target.closest('.hero-slot')); });
        elements.heroPalette.addEventListener('click', e => { if (e.target.matches('.hero-card:not(.banned,.picked,.role-locked)')) handleHeroSelection(e.target.dataset.heroId); });
        elements.banPalette.addEventListener('click', e => { if (e.target.matches('.hero-card')) toggleBan(e.target.dataset.heroId); });
        elements.bannedList.addEventListener('click', e => { if (e.target.matches('.banned-hero-item')) toggleBan(e.target.dataset.heroId); });
        elements.mapSelector.addEventListener('change', () => { state.currentMap = elements.mapSelector.value; runAllAnalysesAndRender(); });
        elements.suggestionCount.addEventListener('change', () => { state.settings.suggestionCount = parseInt(elements.suggestionCount.value,10); saveAndReRender(); });
        elements.teamSizeSelect.addEventListener('change', () => { state.settings.teamSize = parseInt(elements.teamSizeSelect.value, 10); saveSettings(); initializeAppState(); createUI(); runAllAnalysesAndRender(); });
        elements.roleLimitSettingsContainer.addEventListener('change', e => { if (e.target.matches('input')) { state.settings.roleLimits[e.target.dataset.role] = parseInt(e.target.value,10); saveAndReRender(); } });
        elements.allowDuplicatesCheckbox.addEventListener('change', () => { state.settings.allowTeamDuplicates = elements.allowDuplicatesCheckbox.checked; saveAndReRender(); });
        elements.heroPoolChecklist.addEventListener('change', e => { if (e.target.matches('input')) { handleHeroPoolChange(e.target); saveAndReRender(); } });
        document.getElementById('tabs').addEventListener('click', e => { if (e.target.matches('.tab-link')) switchTab(e.target.dataset.tab); });
        elements.resetAllBtn.addEventListener('click', resetAll);
        elements.resetHeroesBtn.addEventListener('click', resetHeroes);
        elements.resetBansBtn.addEventListener('click', resetBans);
        elements.exportBtn.addEventListener('click', exportData);
        elements.importInput.addEventListener('change', importData);
        elements.importInput.previousElementSibling.addEventListener('click', () => elements.importInput.click());
    }

    // --- イベントハンドラ ---
    function handleSlotClick(slot) { if (isAllFilled()) { toggleRelationView(false); } state.activeSelection = { team: slot.dataset.team, index: parseInt(slot.dataset.index, 10) }; renderAll(); switchTab('heroes'); }
    function handleHeroSelection(heroId) { if (!state.activeSelection) return; const {team,index} = state.activeSelection; state[`${team}Team`][index] = heroId; state.activeSelection = null; runAllAnalysesAndRender(); }
    function toggleBan(heroId) { const idx = state.bannedHeroes.indexOf(heroId); if (idx > -1) state.bannedHeroes.splice(idx, 1); else state.bannedHeroes.push(heroId); runAllAnalysesAndRender(); }
    function handleHeroPoolChange(cb) { const id = cb.dataset.heroId; if (cb.checked) { if (!state.settings.heroPool.includes(id)) state.settings.heroPool.push(id); } else { state.settings.heroPool = state.settings.heroPool.filter(hid => hid !== id); } }
    function saveAndReRender() { saveSettings(); runAllAnalysesAndRender(); }
    function resetAll() { if (confirm('リセットしますか？')) { state.bannedHeroes=[]; state.currentMap='none'; resetHeroes(); } }
    function resetHeroes() { state.allyTeam.fill(null); state.enemyTeam.fill(null); runAllAnalysesAndRender(); }
    function resetBans() { state.bannedHeroes=[]; runAllAnalysesAndRender(); }

    // --- 分析と描画のメインフロー ---
    function runAllAnalysesAndRender() { runAllAnalyses(); toggleRelationView(isAllFilled()); renderAll(); }
    function runAllAnalyses() {
        document.querySelectorAll('.suggestion-area').forEach(el => el.innerHTML = '');
        const isEnemyPicked = state.enemyTeam.some(Boolean);
        const myHeroId = state.allyTeam[state.myHeroSlotIndex];

        for (let i = 0; i < state.settings.teamSize; i++) {
            if (state.allyTeam[i]) {
                const mode = i === state.myHeroSlotIndex ? 'Self-Analysis' : 'Ally-Support';
                const threats = getThreats(state.allyTeam[i]);
                if (isEnemyPicked && threats.length > 0) displaySuggestions({ team: 'ally', index: i }, runAnalysis(mode, threats));
                else displayMessage({ team: 'ally', index: i }, '明確な脅威なし');
            }
            if (myHeroId && state.enemyTeam[i]) {
                displaySuggestions({ team: 'enemy', index: i }, runAnalysis('Threat-Elimination', state.enemyTeam[i]));
            }
        }
        if (myHeroId && isEnemyPicked) {
            displaySuggestions('global', runAnalysis('Strategic-Optimization'));
        }
    }
    function runAnalysis(mode, analysisTarget) { const scores = calculateReturnScores(mode, analysisTarget); scores.sort((a,b) => b.return - a.return); return scores; }

    // --- スコア計算 ---
    function calculateReturnScores(mode, analysisTarget) {
        const myHero = getHeroById(state.allyTeam[state.myHeroSlotIndex]);
        const targetRole = myHero ? myHero.role : null;
        if (!targetRole) return [];
        const myTeamForSynergy = state.allyTeam.filter(h => h && h !== myHero?.id);

        return heroesData.filter(cH => 
            !(targetRole && cH.role !== targetRole) && !state.bannedHeroes.includes(cH.id) &&
            cH.id !== myHero?.id && (state.settings.allowTeamDuplicates || !state.allyTeam.includes(cH.id))
        ).map(candidateHero => {
            let counterScore = 0;
            switch(mode) {
                case 'Self-Analysis': case 'Ally-Support':
                    counterScore = analysisTarget.reduce((sum, t) => sum + getCounterScore(candidateHero.id, t), 0);
                    break;
                case 'Threat-Elimination':
                    counterScore = getCounterScore(candidateHero.id, analysisTarget);
                    break;
                case 'Strategic-Optimization':
                    counterScore = state.enemyTeam.filter(Boolean).reduce((sum, e) => sum + getCounterScore(candidateHero.id, e), 0);
                    break;
            }
            const mapScore = getMapScore(candidateHero.id, state.currentMap);
            const synergyScore = myTeamForSynergy.reduce((sum, a) => sum + getSynergyScore(candidateHero.id, a), 0);
            return { heroId: candidateHero.id, return: counterScore + mapScore + synergyScore };
        });
    }
    function calculateForceDifference(allyTeam, enemyTeam) { return calculateTeamPower(allyTeam, enemyTeam) - calculateTeamPower(enemyTeam, allyTeam); }
    function calculateTeamPower(team1, team2) {
        let synergyScore = 0;
        const validTeam1 = team1.filter(Boolean);
        for (let i = 0; i < validTeam1.length; i++) { for (let j = i + 1; j < validTeam1.length; j++) { synergyScore += getSynergyScore(validTeam1[i], validTeam1[j]); } }
        const mapScore = validTeam1.reduce((sum, h) => sum + getMapScore(h, state.currentMap), 0);
        const counterScore = validTeam1.reduce((sum, h1) => sum + team2.filter(Boolean).reduce((s, h2) => s + getCounterScore(h1, h2), 0), 0);
        return synergyScore + mapScore + counterScore;
    }

    // --- レンダリング ---
    function renderAll() {
        renderSlots(); renderBans(); renderTeamRoleIcons(); renderSettings();
        if(state.activeSelection) { renderPalettes(); renderActiveSelection(); } else { renderActiveSelection(true); }
    }
    function renderSlots() { document.querySelectorAll('.hero-slot').forEach(slot => { const {team,index} = slot.dataset; const heroId = state[`${team}Team`][index]; if(heroId){slot.textContent=getHeroById(heroId).name;slot.classList.add('selected');}else{slot.textContent=`スロット ${parseInt(index)+1}`;slot.classList.remove('selected');}}); }
    function renderActiveSelection(forceClear = false) { document.querySelectorAll('.hero-slot.active-selection').forEach(s=>s.classList.remove('active-selection')); if(!forceClear && state.activeSelection){ const{team,index}=state.activeSelection; document.querySelector(`.hero-slot[data-team="${team}"][data-index="${index}"]`).classList.add('active-selection'); } }
    function renderPalettes() {
        if (!state.activeSelection) return;
        const {team,index} = state.activeSelection;
        const targetTeam = state[`${team}Team`];
        const pickedInTeam = state.settings.allowTeamDuplicates ? [] : targetTeam.filter(Boolean);
        const roleCounts = countRoles(targetTeam);
        const currentHero = getHeroById(targetTeam[index]);
        document.querySelectorAll('#hero-palette .hero-card').forEach(card => {
            const hero = getHeroById(card.dataset.heroId);
            card.className = 'hero-card';
            if (state.bannedHeroes.includes(hero.id)) card.classList.add('banned');
            if (pickedInTeam.includes(hero.id) && hero.id !== currentHero?.id) card.classList.add('picked');
            const limit = state.settings.roleLimits[hero.role] ?? state.settings.teamSize;
            let isLocked = (roleCounts[hero.role] || 0) >= limit;
            if (isLocked && currentHero && hero.role === currentHero.role) { isLocked = false; }
            if (!currentHero && isLocked) { isLocked = true; }
            if (isLocked) card.classList.add('role-locked');
        });
    }
    function renderBans() { elements.bannedList.innerHTML = state.bannedHeroes.map(id => `<div class="banned-hero-item" data-hero-id="${id}">${getHeroById(id).name}</div>`).join(''); }
    function renderTeamRoleIcons() { const c = document.querySelector('#ally-team-column .team-role-icons'); c.innerHTML = ''; getUniqueRoles().forEach(r => { const limit = state.settings.roleLimits[r] ?? 0; for(let i=0; i<limit; i++) c.innerHTML+=`<span class="role-icon ${r}"></span>`; }); }
    function renderSettings() { elements.teamSizeSelect.value = state.settings.teamSize; elements.suggestionCount.value = state.settings.suggestionCount; elements.allowDuplicatesCheckbox.checked = state.settings.allowTeamDuplicates; document.querySelectorAll('#hero-pool-checklist input').forEach(cb=>cb.checked=state.settings.heroPool.includes(cb.dataset.heroId)); getUniqueRoles().forEach(r => { const i = document.getElementById(`limit-${r}`); if(i) i.value = state.settings.roleLimits[r] ?? state.settings.teamSize; }); }
    function displaySuggestions(target, suggestions) {
        const wrapper = getWrapper(target);
        if (!wrapper || !state.allyTeam[state.myHeroSlotIndex]) return;
        const area = wrapper.querySelector('.suggestion-area');
        const scoreBefore = calculateForceDifference(state.allyTeam, state.enemyTeam);
        area.innerHTML = suggestions.slice(0, state.settings.suggestionCount).map(s => {
            const tempAllyTeam = [...state.allyTeam];
            tempAllyTeam[state.myHeroSlotIndex] = s.heroId;
            const scoreAfter = calculateForceDifference(tempAllyTeam, state.enemyTeam);
            const tagClass = (scoreAfter >= scoreBefore) ? 'low-risk' : 'high-risk';
            const tagName = tagClass === 'low-risk' ? '安定' : '挑戦';
            const greyedClass = state.settings.heroPool.includes(s.heroId) ? 'greyed-out' : '';
            return `<div class="suggestion-item show"><span class="suggestion-name ${greyedClass}">${getHeroById(s.heroId).name}</span><span class="suggestion-tag ${tagClass}">${tagName}</span></div>`;
        }).join('');
    }
    function displayMessage(target, message) { const wrapper = getWrapper(target); if(wrapper) wrapper.querySelector('.suggestion-area').innerHTML = `<div class="suggestion-message">${message}</div>`; }

    // --- 関係図ロジック ---
    function toggleRelationView(show) {
        elements.tabInterface.classList.toggle('hidden', show);
        elements.relationView.classList.toggle('hidden', !show);
        drawnLines.forEach(line => line.remove());
        drawnLines = [];
        if (show) {
            setTimeout(drawRelationLines, 50);
        }
    }
    function drawRelationLines() {
        elements.relationAllyList.innerHTML = state.allyTeam.map((id, i) => `<div class="relation-hero" id="rel-ally-${i}">${getHeroById(id).name}</div>`).join('');
        elements.relationEnemyList.innerHTML = state.enemyTeam.map((id, i) => `<div class="relation-hero" id="rel-enemy-${i}">${getHeroById(id).name}</div>`).join('');
        
        const deltas = [];
        for (let i = 0; i < state.settings.teamSize; i++) {
            for (let j = 0; j < state.settings.teamSize; j++) {
                const scoreFwd = getCounterScore(state.allyTeam[i], state.enemyTeam[j]);
                const scoreBwd = getCounterScore(state.enemyTeam[j], state.allyTeam[i]);
                if (scoreFwd === 0 && scoreBwd === 0) continue;
                const delta = (scoreFwd !== 0 && scoreBwd === 0) ? scoreFwd * 2 : scoreFwd - scoreBwd;
                deltas.push({ i, j, delta });
            }
        }
        
        const maxDelta = Math.max(...deltas.map(d => Math.abs(d.delta)), 1); // ゼロ除算を避ける

        deltas.forEach(({ i, j, delta }) => {
            if (Math.abs(delta) < 0.1) return;
            const startEl = document.getElementById(delta > 0 ? `rel-ally-${i}` : `rel-enemy-${j}`);
            const endEl = document.getElementById(delta > 0 ? `rel-enemy-${j}` : `rel-ally-${i}`);
            if (!startEl || !endEl) return;
            const color = delta > 0 ? 'rgba(93, 156, 236, 0.7)' : 'rgba(229, 115, 115, 0.7)';
            const size = Math.max( (Math.abs(delta) / maxDelta) * 6, 1.5 );
            try {
                const line = new LeaderLine(startEl, endEl, { color, size, path: 'fluid', endPlug: 'arrow1', hide: true });
                line.show('draw');
                drawnLines.push(line);
            } catch(e) { console.error("LeaderLine error:", e); }
        });
    }

    // --- データアクセス＆ヘルパー ---
    function getHeroById(id) { return heroesData.find(h => h.id === id); }
    function getThreats(heroId) { return state.enemyTeam.filter(e => e && getCounterScore(heroId, e) < 0); }
    function getWrapper(target) { return (target === 'global') ? elements.globalSuggestionArea.parentElement : document.querySelector(`.hero-slot-wrapper[data-team="${target.team}"][data-index="${target.index}"]`); }
    function getUniqueRoles() { return [...new Set(heroesData.map(h => h.role))].sort((a,b) => (['tank','damage','support'].indexOf(a)) - (['tank','damage','support'].indexOf(b))); }
    function countRoles(team) { return team.filter(Boolean).reduce((acc,id)=>{const r=getHeroById(id).role;acc[r]=(acc[r]||0)+1;return acc;},{});}
    function getCounterScore(hA,hB) { if(!hA||!hB)return 0; if(countersData[hA]?.[hB]!==undefined)return countersData[hA][hB]; if(countersData[hB]?.[hA]!==undefined)return -countersData[hB][hA]; return 0;}
    function getSynergyScore(hA,hB) { if(!hA||!hB)return 0; if(synergyData[hA]?.[hB]!==undefined)return synergyData[hA][hB]; if(synergyData[hB]?.[hA]!==undefined)return synergyData[hB][hA]; return 0;}
    function getMapScore(id,mapId) { return mapsData[mapId]?.heroAffinity?.[id]||0; }
    function isAllFilled() { return state.allyTeam.every(Boolean) && state.enemyTeam.every(Boolean); }
    
    // --- パーソナライズ機能 ---
    function saveSettings() { localStorage.setItem('heroAnalyzerSettings', JSON.stringify(state.settings)); }
    function loadSettings() {
        const saved = localStorage.getItem('heroAnalyzerSettings');
        if (saved) {
            const parsed = JSON.parse(saved);
            state.settings = { ...state.settings, ...parsed };
        }
        let needsSave=false; getUniqueRoles().forEach(r=>{if(state.settings.roleLimits[r]===undefined){state.settings.roleLimits[r]=r==='tank'?1:(r==='damage'?2:2);needsSave=true;}}); if(needsSave)saveSettings();
    }
    function switchTab(tabId) { const tc=document.getElementById('tab-content');const t=document.getElementById(`${tabId}-tab`);if(!tc||!t)return;document.querySelectorAll('.tab-pane,.tab-link').forEach(el=>el.classList.remove('active'));t.classList.add('active');document.querySelector(`.tab-link[data-tab="${tabId}"]`).classList.add('active'); }
    function exportData() { const blob=new Blob([JSON.stringify({counters:countersData,synergy:synergyData,maps:mapsData},null,2)],{type:"application/json"});const a=Object.assign(document.createElement('a'),{href:URL.createObjectURL(blob),download:'analyzer_data.json'});a.click();URL.revokeObjectURL(a.href);}
    function importData(e) { const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=e=>{try{const d=JSON.parse(e.target.result);if(d.counters&&d.synergy&&d.maps&&confirm('データを上書きしますか？')){countersData=d.counters;synergyData=d.synergy;mapsData=d.maps;populateMapSelector();runAllAnalysesAndRender();alert('インポート完了');}else{alert('無効なファイル');}}catch(err){alert('読込失敗: '+err);}};r.readAsText(f);e.target.value='';}

    initializeApp();
});