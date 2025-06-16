document.addEventListener('DOMContentLoaded', () => {
    // === DOM要素の取得 ===
    const playerRoleSelector = document.getElementById('player-role-selector');
    const banPalette = document.getElementById('ban-palette');
    const pickPalette = document.getElementById('pick-palette');
    const yourTeamDisplay = document.getElementById('your-team-display');
    const enemyTeamDisplay = document.getElementById('enemy-team-display');
    const yourTeamCount = document.getElementById('your-team-count');
    const enemyTeamCount = document.getElementById('enemy-team-count');
    const analysisButton = document.getElementById('analysis-button');
    const resultDiv = document.getElementById('result');
    const modal = document.getElementById('settings-modal');
    const settingsButton = document.getElementById('settings-button');
    const closeButton = document.querySelector('.close-button');
    const saveSettingsButton = document.getElementById('save-settings-button');
    const mapSelector = document.getElementById('map-selector');
    const importFile = document.getElementById('importFile');
    const exportButton = document.getElementById('exportButton');
    const resetButton = document.getElementById('resetButton');
    const suggestionCountInput = document.getElementById('suggestion-count');
    const heroPoolSettingsDiv = document.getElementById('hero-pool-settings');

    // === 状態管理 ===
    let heroMaster = {}, counterData = {}, mapData = {}, defaultCounterData = {};
    let playerRole = null;
    let bannedHeroes = new Set();
    let yourTeam = new Set(), enemyTeam = new Set();
    let heroPool = {}; 
    let suggestionCount = 3;

    // --- 補助関数 ---
    const loadData = () => { try { const saved = localStorage.getItem('owCounterConfig'); counterData = saved ? JSON.parse(saved) : { ...defaultCounterData }; } catch (e) { counterData = { ...defaultCounterData }; }};
    const saveData = () => { localStorage.setItem('owCounterConfig', JSON.stringify(counterData)); };
    const getCounterScore = (heroA, heroB) => { const keys = [heroA, heroB].sort(); const vsKey = `${keys[0]} vs ${keys[1]}`; if (counterData[vsKey] !== undefined) { const val = counterData[vsKey]; return heroA === keys[0] ? val : -val; } return 0; };
    const countRoles = (teamSet) => { const roles = { Tank: 0, Damage: 0, Support: 0 }; teamSet.forEach(key => { if(heroMaster[key]) roles[heroMaster[key].role]++; }); return roles; };
    
    // --- UI生成 ---
    function createPaletteContent(paletteElement) {
        const roles = { Tank: [], Damage: [], Support: [] };
        const heroKeys = Object.keys(heroMaster).sort((a,b) => heroMaster[a].name_jp.localeCompare(heroMaster[b].name_jp, 'ja'));
        for (const key of heroKeys) { if (roles[heroMaster[key].role]) roles[heroMaster[key].role].push(key); }
        paletteElement.innerHTML = '';
        for (const role in roles) {
            const section = document.createElement('div'); section.className = 'role-section';
            section.innerHTML = `<div class="role-title">${role}</div>`;
            const container = document.createElement('div'); container.className = 'button-container';
            roles[role].forEach(heroKey => {
                const button = document.createElement('button'); button.className = 'hero-button'; button.textContent = heroMaster[heroKey].name_jp; button.dataset.heroKey = heroKey;
                container.appendChild(button);
            });
            section.appendChild(container);
            paletteElement.appendChild(section);
        }
    }
    function createMapSelector() { Object.keys(mapData).sort().forEach(mapName => { const option = document.createElement('option'); option.value = mapName; option.textContent = mapName; mapSelector.appendChild(option); }); }
    function populateHeroPoolSettings() {
        heroPoolSettingsDiv.innerHTML = '';
        const roles = { Tank: [], Damage: [], Support: [] };
        const heroKeys = Object.keys(heroMaster).sort((a,b) => heroMaster[a].name_jp.localeCompare(heroMaster[b].name_jp, 'ja'));
        for (const key of heroKeys) { if (roles[heroMaster[key].role]) roles[heroMaster[key].role].push(key); }
        for (const role in roles) {
            const section = document.createElement('div'); section.className = 'role-section';
            section.innerHTML = `<div class="role-title">${role}</div>`;
            const container = document.createElement('div'); container.className = 'button-container';
            roles[role].forEach(heroKey => {
                const label = document.createElement('label'); label.className = 'hero-pool-label';
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.dataset.heroKey = heroKey;
                checkbox.checked = heroPool[heroKey] !== false; // 未設定はtrue(使える)扱い
                label.appendChild(checkbox);
                label.append(heroMaster[heroKey].name_jp);
                container.appendChild(label);
            });
            section.appendChild(container);
            heroPoolSettingsDiv.appendChild(section);
        }
    }
    
    // --- UI更新 ---
    function updateUI() {
        const allPicks = new Set([...yourTeam, ...enemyTeam, ...bannedHeroes]);
        document.querySelectorAll('.hero-button').forEach(button => {
            const key = button.dataset.heroKey;
            button.classList.remove('selected-your', 'selected-enemy', 'banned', 'disabled');
            if (yourTeam.has(key)) button.classList.add('selected-your');
            if (enemyTeam.has(key)) button.classList.add('selected-enemy');
            if (bannedHeroes.has(key)) button.classList.add('banned');
            if (allPicks.has(key)) button.classList.add('disabled');
        });
        updateTeamDisplay(yourTeamDisplay, yourTeam);
        updateTeamDisplay(enemyTeamDisplay, enemyTeam);
    }
    function updateTeamDisplay(displayElement, teamSet) {
        displayElement.innerHTML = '';
        Array.from(teamSet).forEach(heroKey => {
            const button = document.createElement('button'); button.className = 'hero-button'; button.textContent = heroMaster[heroKey].name_jp; button.dataset.heroKey = heroKey;
            displayElement.appendChild(button);
        });
        document.getElementById('your-team-count').textContent = `${yourTeam.size}/5`;
        document.getElementById('enemy-team-count').textContent = `${enemyTeam.size}/5`;
    }
    
    // --- 分析ロジック ---
    function calculateBestPicks(targetTeam, ownTeam, heroesToExclude = new Set()) {
        const results = { highRisk: [], lowRisk: [] };
        if (!playerRole) return results;
        const allPicks = new Set([...bannedHeroes, ...ownTeam, ...heroesToExclude]);
        const availableHeroes = Object.keys(heroMaster).filter(k => !allPicks.has(k) && heroMaster[k].role === playerRole);
        
        availableHeroes.forEach(ck => {
            let score = 0;
            targetTeam.forEach(ek => score += getCounterScore(ck, ek));
            if (mapSelector.value && mapData[mapSelector.value]?.[ck]) score += mapData[mapSelector.value][ck];
            
            const isCountered = Array.from(enemyTeam).some(ek => getCounterScore(ck, ek) < -1.0);
            const suggestion = { key: ck, name: heroMaster[ck].name_jp, score };
            if (isCountered) results.highRisk.push(suggestion);
            else results.lowRisk.push(suggestion);
        });
        
        results.highRisk.sort((a,b) => b.score - a.score);
        results.lowRisk.sort((a,b) => b.score - a.score);
        return results;
    }
    function displayResults(title, results, emptyMsg = "") {
        const section = document.createElement('div');
        section.className = 'result-section';
        section.innerHTML = `<h3 class="result-title">${title}</h3>`;
        
        if (results.lowRisk.length === 0 && results.highRisk.length === 0) {
            section.innerHTML += `<p>${emptyMsg || "有効なピックはありません。"}</p>`;
        } else {
            if (results.lowRisk.length > 0) {
                section.innerHTML += '<h4>ローリスク案（安全策）</h4>';
                const list = document.createElement('ul'); list.className = 'result-list';
                results.lowRisk.slice(0, suggestionCount).forEach(h => appendResultItem(list, h));
                section.appendChild(list);
            }
            if (results.highRisk.length > 0) {
                section.innerHTML += '<h4>ハイリスク案（一発逆転策）</h4>';
                const list = document.createElement('ul'); list.className = 'result-list';
                results.highRisk.slice(0, suggestionCount).forEach(h => appendResultItem(list, h));
                section.appendChild(list);
            }
        }
        resultDiv.appendChild(section);
    }
    function appendResultItem(list, hero) {
        const item = document.createElement('li');
        const isEnabled = heroPool[hero.key] !== false;
        item.className = isEnabled ? "" : "disabled";
        item.innerHTML = `<span class="hero-name">${hero.name}</span> <span class="hero-score">スコア: ${hero.score.toFixed(1)}</span>`;
        list.appendChild(item);
    }
    
    // --- イベントハンドラ ---
    function handleRoleSelect(e) { if (e.target.classList.contains('role-btn')) { playerRole = e.target.dataset.role; localStorage.setItem('playerRole', playerRole); document.querySelectorAll('.role-btn').forEach(btn => btn.classList.remove('active')); e.target.classList.add('active'); } }
    function toggleBan(e) { if (e.target.classList.contains('hero-button')) { const key = e.target.dataset.heroKey; if (yourTeam.has(key) || enemyTeam.has(key)) return; if (bannedHeroes.has(key)) bannedHeroes.delete(key); else if (bannedHeroes.size < 4) bannedHeroes.add(key); else alert("BANは最大4体までです。"); updateUI(); } }
    function handlePick(e) { if (e.target.classList.contains('hero-button')) { const key = e.target.dataset.heroKey; if (bannedHeroes.has(key) || yourTeam.has(key) || enemyTeam.has(key)) return; const role = heroMaster[key].role; const roleLimit = (role === 'Tank' ? 1 : 2); if (countRoles(yourTeam)[role] < roleLimit) yourTeam.add(key); else if (countRoles(enemyTeam)[role] < roleLimit) enemyTeam.add(key); else alert(`このロールのヒーローは既に両チームとも満員です。`); updateUI(); } }
    function handleDisplayClick(e) {
        if (e.target.classList.contains('hero-button')) {
            const key = e.target.dataset.heroKey;
            const isYourTeam = yourTeam.has(key);
            const yourHero = Array.from(yourTeam).find(k => heroMaster[k] && heroMaster[k].role === playerRole);

            if (isYourTeam && key === yourHero) {
                analyze('self', key);
            } else if (isYourTeam) {
                analyze('ally', key);
            } else { // 敵チーム or 表示エリアの味方をクリックで解除
                if (yourTeam.has(key)) yourTeam.delete(key);
                if (enemyTeam.has(key)) enemyTeam.delete(key);
                updateUI();
            }
        }
    }
    function handleEnemyDisplayClick(e) {
        if (e.target.classList.contains('hero-button')) {
            const key = e.target.dataset.heroKey;
            if (enemyTeam.has(key)) {
                analyze('enemy', key);
            }
        }
    }
    function analyze(analysisType, targetKey = null) {
        resultDiv.innerHTML = '';
        if (!playerRole) { alert("まず、あなたのロールを選択してください。"); return; }
        
        let title = "", results = {};
        switch(analysisType) {
            case 'self':
                const threats = Array.from(enemyTeam).filter(ek => getCounterScore(targetKey, ek) < -1.0);
                title = `【自己分析】あなたの「${heroMaster[targetKey].name_jp}」への対策案`;
                results = threats.length > 0 ? calculateBestPicks(enemyTeam, yourTeam, new Set([targetKey])) : { highRisk:[], lowRisk:[] };
                displayResults(title, results, "明確なカウンターは受けていません。");
                break;
            case 'ally':
                const allyThreats = Array.from(enemyTeam).filter(ek => getCounterScore(targetKey, ek) < -1.0);
                title = `【味方支援】味方の「${heroMaster[targetKey].name_jp}」を助ける対策案`;
                results = allyThreats.length > 0 ? calculateBestPicks(new Set(allyThreats), yourTeam) : { highRisk:[], lowRisk:[] };
                displayResults(title, results, "この味方は現在、明確なカウンターを受けていません。");
                break;
            case 'enemy':
                title = `【脅威排除】敵の「${heroMaster[targetKey].name_jp}」への直接的なカウンター案`;
                results = calculateBestPicks(new Set([targetKey]), yourTeam);
                displayResults(title, results);
                break;
            case 'overall':
                title = "【全体分析】敵チーム構成に対する総合的な推奨ピック";
                results = calculateBestPicks(enemyTeam, yourTeam);
                displayResults(title, results);
                break;
        }
    }
    const handleImport = (e) => { const file = e.target.files[0]; if (!file) return; const reader = new FileReader(); reader.onload = e => { try { counterData = JSON.parse(e.target.result); saveData(); alert('設定がインポートされました。'); } catch (err) { alert('ファイルの読み込みに失敗しました。'); } }; reader.readAsText(file); };
    const handleExport = () => { const dataStr = `data:text/json;charset=utf-8,${encodeURIComponent(JSON.stringify(counterData, null, 2))}`; const a = document.createElement('a'); a.href = dataStr; a.download = "ow_counters_config.json"; a.click(); a.remove(); };
    const handleReset = () => { if (confirm('設定をデフォルトに戻しますか？')) { counterData = { ...defaultCounterData }; saveData(); alert('設定がリセットされました。'); } };

    // === 初期化処理の呼び出し ===
    async function initialize() {
        try {
            const [h, c, m] = await Promise.all([fetch('heroes.json').then(r=>r.json()), fetch('counters.json').then(r=>r.json()), fetch('maps.json').then(r=>r.json())]);
            heroMaster = h; defaultCounterData = c; mapData = m;
            
            loadData();
            createPaletteContent(banPalette);
            createPaletteContent(pickPalette);
            createMapSelector();
            
            playerRoleSelector.addEventListener('click', handleRoleSelect);
            banPalette.addEventListener('click', toggleBan);
            pickPalette.addEventListener('click', handlePick);
            yourTeamDisplay.addEventListener('click', handleDisplayClick);
            enemyTeamDisplay.addEventListener('click', handleEnemyDisplayClick);
            analysisButton.addEventListener('click', () => analyze('overall'));
            
            settingsButton.onclick = () => { modal.style.display = "block"; populateHeroPoolSettings(); };
            closeButton.onclick = () => { modal.style.display = "none"; };
            window.onclick = (event) => { if (event.target == modal) modal.style.display = "none"; };
            saveSettingsButton.onclick = () => {
                suggestionCount = parseInt(document.getElementById('suggestion-count').value, 10);
                heroPool = {};
                document.querySelectorAll('#hero-pool-settings input[type="checkbox"]').forEach(cb => {
                    heroPool[cb.dataset.heroKey] = cb.checked;
                });
                localStorage.setItem('heroPool', JSON.stringify(heroPool));
                localStorage.setItem('suggestionCount', suggestionCount);
                alert("設定を保存しました。");
                modal.style.display = "none";
            };
            const importButton = document.querySelector('.file-label');
            importButton.addEventListener('click', () => importFile.click());
            importFile.addEventListener('change', handleImport);
            exportButton.addEventListener('click', handleExport);
            resetButton.addEventListener('click', handleReset);
            
            const savedRole = localStorage.getItem('playerRole');
            if (savedRole) { playerRole = savedRole; playerRoleSelector.querySelector(`[data-role="${savedRole}"]`)?.classList.add('active'); }
            heroPool = JSON.parse(localStorage.getItem('heroPool') || '{}');
            suggestionCount = parseInt(localStorage.getItem('suggestionCount') || '3', 10);
            document.getElementById('suggestion-count').value = suggestionCount;

        } catch (error) {
            console.error("初期化エラー:", error);
            alert("設定ファイルの読み込み、または初期化に失敗しました。");
        }
    }
    
    initialize();
});