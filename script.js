document.addEventListener('DOMContentLoaded', () => {
    // --- グローバル変数と状態管理 ---
    let data = { heroes: [], counters: {}, synergy: {}, maps: {} };
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
        await loadAllData();
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
            banPalette: 'ban-palette', bannedList: 'banned-list', centralPanel: 'central-panel',
            teamSizeSelect: 'team-size-select', roleLimitSettingsContainer: 'role-limit-settings',
            allowDuplicatesCheckbox: 'allow-duplicates-checkbox', suggestionCount: 'suggestion-count',
            heroPoolChecklist: 'hero-pool-checklist', mapSelector: 'map-selector', 
            globalSuggestionArea: 'global-suggestion-area', resetAllBtn: 'reset-all-btn', 
            resetHeroesBtn: 'reset-heroes-btn', copyCompositionBtn: 'copy-composition-btn',
            importInput: 'import-data-input', overlaySvg: 'overlay-svg',
            tabInterface: 'tab-interface', relationModeUi: 'relation-mode-ui',
            exitRelationModeBtn: 'exit-relation-mode-btn'
        };
        for (const key in idMap) { elements[key] = document.getElementById(idMap[key]); }
    }
    async function loadAllData() { [data.heroes, data.counters, data.synergy, data.maps] = await Promise.all([fetch('heroes.json').then(r=>r.json()), fetch('counters.json').then(r=>r.json()), fetch('synergy.json').then(r=>r.json()), fetch('maps.json').then(r=>r.json())]); }
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
    function populatePalettes() { const uniqueRoles = getUniqueRoles(); [elements.heroPalette, elements.banPalette].forEach(p => { p.innerHTML = uniqueRoles.map(r => `<h3 class="role-header">${r}</h3>` + data.heroes.filter(h => h.role === r).sort((a, b) => a.name.localeCompare(b.name, 'ja')).map(h => `<div class="hero-card" data-hero-id="${h.id}">${h.name}</div>`).join('')).join(''); }); }
    function populateMapSelector() { elements.mapSelector.innerHTML = '<option value="none">マップ未選択</option>' + Object.keys(data.maps).map(id => `<option value="${id}">${data.maps[id].name}</option>`).join(''); }
    function populateHeroPoolChecklist() { elements.heroPoolChecklist.innerHTML = [...data.heroes].sort((a,b)=>a.name.localeCompare(b.name,'ja')).map(h=>`<div class="hero-pool-item"><input type="checkbox" id="pool-${h.id}" data-hero-id="${h.id}"><label for="pool-${h.id}">${h.name}</label></div>`).join('');}
    function populateRoleLimitSettings() { elements.roleLimitSettingsContainer.innerHTML = getUniqueRoles().map(r => `<div class="role-limit-item"><label for="limit-${r}">${r}:</label><input type="number" id="limit-${r}" data-role="${r}" value="${state.settings.roleLimits[r]??state.settings.teamSize}" min="0" max="${state.settings.teamSize}"></div>`).join(''); }

    // --- イベントリスナー ---
    function setupEventListeners() {
        elements.battleBoard.addEventListener('click', e => { if (e.target.closest('.hero-slot')) handleSlotClick(e.target.closest('.hero-slot')); });
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
        elements.copyCompositionBtn.addEventListener('click', copyComposition);
        document.querySelector('.data-management').addEventListener('click', e => { if(e.target.matches('button.control-btn')) handleDataManagement(e.target); });
        elements.importInput.addEventListener('change', importData);
        elements.exitRelationModeBtn.addEventListener('click', () => toggleRelationView(false));
    }

    // --- イベントハンドラ ---
    function handleSlotClick(slot) {
        const clickedTeam = slot.dataset.team;
        const clickedIndex = parseInt(slot.dataset.index, 10);
        if (state.activeSelection && state.activeSelection.team === clickedTeam && state.activeSelection.index === clickedIndex) {
            state.activeSelection = null;
        } else {
            state.activeSelection = { team: clickedTeam, index: clickedIndex };
            if(!elements.relationModeUi.classList.contains('hidden')) {
                toggleRelationView(false);
            }
            switchTab('heroes');
        }
        renderAll();
    }
    function handleHeroSelection(heroId) {
        if (!state.activeSelection) return;
        const { team, index } = state.activeSelection;
        const teamState = state[`${team}Team`];
        
        if (team === 'ally' && index === state.myHeroSlotIndex && !isAllFilled()) {
            const newHeroRole = getHeroById(heroId).role;
            const currentRoleCounts = countRoles(teamState, index);
            const limit = state.settings.roleLimits[newHeroRole] ?? state.settings.teamSize;
            if ((currentRoleCounts[newHeroRole] || 0) >= limit) {
                for (let i = 0; i < teamState.length; i++) {
                    if (i !== index && teamState[i] && getHeroById(teamState[i]).role === newHeroRole) {
                        teamState[i] = null;
                    }
                }
            }
        }
        
        teamState[index] = heroId;
        state.activeSelection = null;
        runAllAnalysesAndRender();
    }
    function toggleBan(heroId) {
        const idx = state.bannedHeroes.indexOf(heroId);
        if (idx > -1) { state.bannedHeroes.splice(idx, 1); } 
        else { state.bannedHeroes.push(heroId); state.allyTeam = state.allyTeam.map(id => id === heroId ? null : id); state.enemyTeam = state.enemyTeam.map(id => id === heroId ? null : id); }
        runAllAnalysesAndRender();
    }
    function handleHeroPoolChange(cb) { const id = cb.dataset.heroId; if (cb.checked) { if (!state.settings.heroPool.includes(id)) state.settings.heroPool.push(id); } else { state.settings.heroPool = state.settings.heroPool.filter(hid => hid !== id); } }
    function saveAndReRender() { saveSettings(); runAllAnalysesAndRender(); }
    function resetAll() { if (confirm('リセットしますか？')) { state.bannedHeroes=[]; state.currentMap='none'; resetHeroes(); } }
    function resetHeroes() { state.allyTeam.fill(null); state.enemyTeam.fill(null); runAllAnalysesAndRender(); }
    function copyComposition() {
        const mapName = state.currentMap === 'none' ? 'マップ未選択' : data.maps[state.currentMap].name;
        const forceDiff = calculateForceDifference(state.allyTeam, state.enemyTeam);
        let text = `【マップ】 ${mapName}\n【チーム戦力差】: ${forceDiff.toFixed(2)}\n\n`;
        const createTeamText = (teamName, team) => { text += `【${teamName}】\n`; getUniqueRoles().forEach(role => { const heroes = team.map(getHeroById).filter(h => h && h.role === role); if(heroes.length > 0) text += `${role}: ${heroes.map(h => h.name).join(', ')}\n`; }); };
        createTeamText('味方チーム', state.allyTeam);
        text += '\n';
        createTeamText('敵チーム', state.enemyTeam);

        if (state.allyTeam[state.myHeroSlotIndex] && state.enemyTeam.some(Boolean)) {
            text += '\n--- 全体分析リターン内訳 ---\n';
            const suggestions = runAnalysis('Strategic-Optimization');
            suggestions.slice(0, 3).forEach(s => {
                const candHero = getHeroById(s.heroId);
                let breakdown = `vs敵: ${state.enemyTeam.filter(Boolean).map(eId => getCounterScore(s.heroId, eId).toFixed(1)).join(', ')}`;
                let synergyScore = state.allyTeam.filter(h => h && h !== state.allyTeam[state.myHeroSlotIndex]).reduce((sum, a) => sum + getSynergyScore(s.heroId, a), 0);
                let mapScore = getMapScore(s.heroId, state.currentMap);
                breakdown += ` | シナジー: ${synergyScore.toFixed(1)} | マップ: ${mapScore.toFixed(1)}`;
                text += `${candHero.name} -> ${s.return.toFixed(2)} (${breakdown})\n`;
            });
        }
        navigator.clipboard.writeText(text).then(() => showToast('構成をコピーしました！'));
    }
    function handleDataManagement(button) {
        const fileKey = button.closest('.data-row').dataset.file;
        const isExport = button.classList.contains('export');

        if (isExport) {
            const dataToExport = data[fileKey];
            const blob = new Blob([JSON.stringify(dataToExport, null, 2)], {type: "application/json"});
            const a = Object.assign(document.createElement('a'), {href: URL.createObjectURL(blob), download: `${fileKey}.json`});
            a.click();
            URL.revokeObjectURL(a.href);
        } else {
            elements.importInput.dataset.targetFile = fileKey;
            elements.importInput.click();
        }
    }
    function importData(e) {
        const file = e.target.files[0];
        const targetFile = e.target.dataset.targetFile;
        if (!file || !targetFile) return;
        const reader = new FileReader();
        reader.onload = e => {
            try {
                const importedData = JSON.parse(e.target.result);
                if (confirm(`${targetFile}.json をインポートして上書きしますか？`)) {
                    data[targetFile] = importedData;
                    if (targetFile === 'heroes') { initializeAppState(); createUI(); } 
                    else if (targetFile === 'maps') { populateMapSelector(); }
                    runAllAnalysesAndRender();
                    showToast(`${targetFile}.json をインポートしました`);
                }
            } catch (err) { alert('ファイルの読み込みに失敗しました: ' + err); }
        };
        reader.readAsText(file);
        e.target.value = '';
    }

    // --- 分析と描画のメインフロー ---
    function runAllAnalysesAndRender() {
        runAllAnalyses(); 
        renderAll();
    }
    function runAllAnalyses() {
        clearVisualOverlays();
        if (isAllFilled()) {
            toggleRelationView(true);
            setTimeout(() => { drawRelationLines(); drawSynergyLines(); }, 50);
        } else {
            toggleRelationView(false);
            const myHeroId = state.allyTeam[state.myHeroSlotIndex];
            for (let i = 0; i < state.settings.teamSize; i++) {
                if (state.allyTeam[i]) {
                    const mode = i === state.myHeroSlotIndex ? 'Self-Analysis' : 'Ally-Support';
                    const threats = getThreats(state.allyTeam[i]);
                    if (state.enemyTeam.some(Boolean) && threats.length > 0) {
                        displaySuggestions({ team: 'ally', index: i }, runAnalysis(mode, threats));
                    } else {
                        displayMessage({ team: 'ally', index: i }, '明確な脅威なし');
                    }
                }
                if (myHeroId && state.enemyTeam[i]) {
                    displaySuggestions({ team: 'enemy', index: i }, runAnalysis('Threat-Elimination', state.enemyTeam[i]));
                }
            }
            if (myHeroId && state.enemyTeam.some(Boolean)) {
                displaySuggestions('global', runAnalysis('Strategic-Optimization'));
            }
        }
    }
    function runAnalysis(mode, analysisTarget) {
        let scores = calculateReturnScores(mode, analysisTarget);
        if (scores.length > 0 && scores.every(s => s.return === 0)) { return []; }
        
        const scoreBefore = calculateForceDifference(state.allyTeam, state.enemyTeam);
        scores = scores.map(s => {
            const tempAllyTeam = [...state.allyTeam];
            tempAllyTeam[state.myHeroSlotIndex] = s.heroId;
            const scoreAfter = calculateForceDifference(tempAllyTeam, state.enemyTeam);
            s.delta = scoreAfter - scoreBefore;
            return s;
        });

        scores.sort((a, b) => (b.return - a.return) || (b.delta - a.delta));
        return scores;
    }

    // --- スコア計算 ---
    function calculateReturnScores(mode, analysisTarget) {
        const myHero = getHeroById(state.allyTeam[state.myHeroSlotIndex]);
        const targetRole = myHero ? myHero.role : null;
        if (!targetRole) return [];
        const myTeamForSynergy = state.allyTeam.filter(h => h && h !== myHero?.id);

        return data.heroes.filter(cH => 
            !(targetRole && cH.role !== targetRole) && !state.bannedHeroes.includes(cH.id) &&
            cH.id !== myHero?.id && (state.settings.allowTeamDuplicates || !state.allyTeam.includes(cH.id))
        ).map(candidateHero => {
            let counterScore = 0;
            switch(mode) {
                case 'Self-Analysis': case 'Ally-Support':
                    counterScore = analysisTarget.reduce((sum, t) => sum + getCounterScore(candidateHero.id, t), 0); break;
                case 'Threat-Elimination':
                    counterScore = getCounterScore(candidateHero.id, analysisTarget); break;
                case 'Strategic-Optimization':
                    counterScore = state.enemyTeam.filter(Boolean).reduce((sum, e) => sum + getCounterScore(candidateHero.id, e), 0); break;
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
        drawMapAffinityTags();
    }
    function renderSlots() { document.querySelectorAll('.hero-slot').forEach(slot => { const {team,index} = slot.dataset; const heroId = state[`${team}Team`][index]; if(heroId){slot.textContent=getHeroById(heroId).name;slot.classList.add('selected');}else{slot.textContent=`スロット ${parseInt(index)+1}`;slot.classList.remove('selected');}}); }
    function renderActiveSelection(forceClear = false) { document.querySelectorAll('.hero-slot.active-selection').forEach(s=>s.classList.remove('active-selection')); if(!forceClear && state.activeSelection){ const{team,index}=state.activeSelection; document.querySelector(`.hero-slot[data-team="${team}"][data-index="${index}"]`).classList.add('active-selection'); } }
    function renderPalettes() {
        if (!state.activeSelection) return;
        const {team,index} = state.activeSelection;
        const targetTeam = state[`${team}Team`];
        const pickedInTeam = state.settings.allowTeamDuplicates ? [] : targetTeam.filter(Boolean);
        const roleCounts = countRoles(targetTeam, team === 'ally' ? index : -1);
        const currentHero = getHeroById(targetTeam[index]);
        document.querySelectorAll('#hero-palette .hero-card').forEach(card => {
            const hero = getHeroById(card.dataset.heroId);
            card.className = 'hero-card';
            if (state.bannedHeroes.includes(hero.id)) card.classList.add('banned');
            if (pickedInTeam.includes(hero.id) && hero.id !== currentHero?.id) card.classList.add('picked');
            const limit = state.settings.roleLimits[hero.role] ?? state.settings.teamSize;
            let isLocked = (roleCounts[hero.role] || 0) >= limit;
            if (team === 'ally' && index === state.myHeroSlotIndex && !isAllFilled()) { isLocked = false; }
            else if (isLocked && currentHero && hero.role === currentHero.role) { isLocked = false; }
            if (isLocked) card.classList.add('role-locked');
        });
    }
    function renderBans() { elements.bannedList.innerHTML = state.bannedHeroes.map(id => `<div class="banned-hero-item" data-hero-id="${id}">${getHeroById(id).name}</div>`).join(''); }
    function renderTeamRoleIcons() { const c = document.querySelector('#ally-team-column .team-role-icons'); c.innerHTML = ''; getUniqueRoles().forEach(r => { const limit = state.settings.roleLimits[r] ?? 0; for(let i=0; i<limit; i++) c.innerHTML+=`<span class="role-icon ${r}"></span>`; }); }
    function renderSettings() { elements.teamSizeSelect.value = state.settings.teamSize; elements.suggestionCount.value = state.settings.suggestionCount; elements.allowDuplicatesCheckbox.checked = state.settings.allowTeamDuplicates; document.querySelectorAll('#hero-pool-checklist input').forEach(cb=>cb.checked=state.settings.heroPool.includes(cb.dataset.heroId)); getUniqueRoles().forEach(r => { const i = document.getElementById(`limit-${r}`); if(i) i.value = state.settings.roleLimits[r] ?? state.settings.teamSize; }); }
    function displaySuggestions(target, suggestions) {
        const wrapper = getWrapper(target);
        if (!wrapper) return;
        const area = wrapper.querySelector('.suggestion-area');
        if (suggestions.length === 0) { displayMessage(target, '明確な提案不可'); return; }
        
        area.innerHTML = suggestions.slice(0, state.settings.suggestionCount).map((s, index) => {
            const tagClass = (s.delta >= 0) ? 'low-risk' : 'high-risk';
            const tagName = tagClass === 'low-risk' ? '安定' : '挑戦';
            const greyedClass = state.settings.heroPool.includes(s.heroId) ? 'greyed-out' : '';
            return `<div class="suggestion-item show"><span class="suggestion-rank">${index + 1}.</span><span class="suggestion-name ${greyedClass}">${getHeroById(s.heroId).name}</span><span class="suggestion-tag ${tagClass}">${tagName}</span></div>`;
        }).join('');
    }
    function displayMessage(target, message) { const wrapper = getWrapper(target); if(wrapper) wrapper.querySelector('.suggestion-area').innerHTML = `<div class="suggestion-message">${message}</div>`; }
    
    // --- 可視化ロジック ---
    function clearVisualOverlays() { drawnLines.forEach(line => line.remove()); drawnLines = []; document.querySelectorAll('.map-affinity-tag').forEach(t => t.remove()); }
    function toggleRelationView(show) {
        elements.centralPanel.classList.toggle('relation-mode', show);
        elements.tabInterface.classList.toggle('hidden', show);
        elements.relationModeUi.classList.toggle('hidden', !show);
    }
    function drawRelationLines() {
        const deltas = [];
        for (let i = 0; i < state.settings.teamSize; i++) {
            for (let j = 0; j < state.settings.teamSize; j++) {
                if (!state.allyTeam[i] || !state.enemyTeam[j]) continue;
                const scoreFwd = getCounterScore(state.allyTeam[i], state.enemyTeam[j]);
                const scoreBwd = getCounterScore(state.enemyTeam[j], state.allyTeam[i]);
                if (scoreFwd === 0 && scoreBwd === 0) continue;
                const delta = (scoreFwd !== 0 && scoreBwd === 0) ? scoreFwd * 2 : (scoreFwd === 0 && scoreBwd !== 0 ? scoreBwd * 2 : scoreFwd - scoreBwd);
                deltas.push({ i, j, delta });
            }
        }
        if (deltas.length === 0) return;
        const maxDelta = Math.max(...deltas.map(d => Math.abs(d.delta)), 1);

        deltas.forEach(({ i, j, delta }) => {
            if (Math.abs(delta) < 0.1) return;
            const startEl = document.getElementById(delta > 0 ? `slot-ally-${i}` : `slot-enemy-${j}`);
            const endEl = document.getElementById(delta > 0 ? `slot-enemy-${j}` : `slot-ally-${i}`);
            if (!startEl || !endEl) return;
            const color = delta > 0 ? 'rgba(93, 156, 236, 0.7)' : 'rgba(229, 115, 115, 0.7)';
            const size = `calc(2px + ${0.2 * (Math.abs(delta) / maxDelta)}vw)`;
            try {
                const line = new LeaderLine(startEl, endEl, { color, size, path: 'fluid', endPlug: 'arrow1', hide: true });
                line.show('draw', {duration: 300, timing: 'ease-in-out'});
                drawnLines.push(line);
            } catch(e) { console.error("LeaderLine error:", e); }
        });
    }
    function drawSynergyAndMapInfo() {
        const allySlots = state.allyTeam.map((id, i) => id ? document.getElementById(`slot-ally-${i}`) : null);
        for(let i = 0; i < allySlots.length; i++) {
            if (!allySlots[i]) continue;
            if (getMapScore(state.allyTeam[i], state.currentMap) > 0) {
                const tag = document.createElement('div');
                tag.className = 'map-affinity-tag';
                tag.textContent = 'MAP◎';
                allySlots[i].appendChild(tag);
            }
            for(let j = i + 1; j < allySlots.length; j++) {
                if (!allySlots[j] || getSynergyScore(state.allyTeam[i], state.allyTeam[j]) <= 0) continue;
                try {
                    const line = new LeaderLine(allySlots[i], allySlots[j], { color: 'rgba(255, 193, 7, 0.6)', size: 3, dash: {animation: true}, path: 'arc' });
                    drawnLines.push(line);
                } catch(e) { console.error("LeaderLine error:", e); }
            }
        }
    }

    // --- データアクセス＆ヘルパー ---
    function getHeroById(id) { return data.heroes.find(h => h.id === id); }
    function getThreats(heroId) { return state.enemyTeam.filter(e => e && getCounterScore(heroId, e) < 0); }
    function getWrapper(target) { return (target === 'global') ? elements.globalSuggestionArea.parentElement : document.querySelector(`.hero-slot-wrapper[data-team="${target.team}"][data-index="${target.index}"]`); }
    function getUniqueRoles() { return [...new Set(data.heroes.map(h => h.role))].sort((a,b) => (['tank','damage','support'].indexOf(a)) - (['tank','damage','support'].indexOf(b))); }
    function countRoles(team, excludeIndex = -1) { return team.map((id,i) => i === excludeIndex ? null : id).filter(Boolean).reduce((acc,id)=>{const r=getHeroById(id).role;acc[r]=(acc[r]||0)+1;return acc;},{});}
    function getCounterScore(hA,hB) { if(!hA||!hB)return 0; if(data.counters[hA]?.[hB]!==undefined)return data.counters[hA][hB]; if(data.counters[hB]?.[hA]!==undefined)return -data.counters[hB][hA]; return 0;}
    function getSynergyScore(hA,hB) { if(!hA||!hB)return 0; if(data.synergy[hA]?.[hB]!==undefined)return data.synergy[hA][hB]; if(data.synergy[hB]?.[hA]!==undefined)return data.synergy[hB][hA]; return 0;}
    function getMapScore(id,mapId) { return data.maps[mapId]?.heroAffinity?.[id]||0; }
    function isAllFilled() { return state.allyTeam.every(Boolean) && state.enemyTeam.every(Boolean); }
    
    // --- パーソナライズ機能 ---
    function saveSettings() { localStorage.setItem('heroAnalyzerSettings', JSON.stringify(state.settings)); }
    function loadSettings() {
        const saved = localStorage.getItem('heroAnalyzerSettings');
        if (saved) {
            const parsed = JSON.parse(saved);
            state.settings = { ...state.settings, ...parsed };
        }
        let needsSave=false; getUniqueRoles().forEach(r=>{if(state.settings.roleLimits[r]===undefined){const defaults = {'tank':1, 'damage':2, 'support':2}; state.settings.roleLimits[r] = defaults[r] ?? 1; needsSave=true;}}); if(needsSave)saveSettings();
    }
    function switchTab(tabId) { const tc=document.getElementById('tab-content'); const t=document.getElementById(`${tabId}-tab`); const tabs=document.getElementById('tabs'); if(!tc||!t||!tabs)return; tabs.querySelectorAll('.tab-link').forEach(el=>el.classList.remove('active')); tc.querySelectorAll('.tab-pane').forEach(el=>el.classList.remove('active')); t.classList.add('active'); tabs.querySelector(`.tab-link[data-tab="${tabId}"]`).classList.add('active'); }
    function showToast(message) { const t=document.getElementById('copy-toast'); t.textContent = message; t.className = "toast show"; setTimeout(() => { t.className = t.className.replace("show", ""); }, 2000); }

    initializeApp();
});