document.addEventListener('DOMContentLoaded', () => {
    // === DOM要素の取得 ===
    const playerRoleSelector = document.getElementById('player-role-selector');
    const banPalette = document.getElementById('ban-palette');
    const pickPalette = document.getElementById('pick-palette');
    const yourTeamDisplay = document.getElementById('your-team-display');
    const enemyTeamDisplay = document.getElementById('enemy-team-display');
    const analysisButton = document.getElementById('analysis-button');
    const resultDiv = document.getElementById('result');
    const importFile = document.getElementById('importFile');
    const exportButton = document.getElementById('exportButton');
    const resetButton = document.getElementById('resetButton');

    // === 状態管理 ===
    let heroMaster = {}, counterData = {}, mapData = {}, defaultCounterData = {};
    let playerRole = null;
    let bannedHeroes = new Set();
    let yourTeam = new Set(), enemyTeam = new Set();
    
    // --- 補助関数 (呼び出される前に定義) ---
    const loadData = () => { try { const saved = localStorage.getItem('owCounterConfig'); counterData = saved ? JSON.parse(saved) : { ...defaultCounterData }; } catch (e) { counterData = { ...defaultCounterData }; }};
    const saveData = () => { localStorage.setItem('owCounterConfig', JSON.stringify(counterData)); };
    const getCounterScore = (heroA, heroB) => { const keys = [heroA, heroB].sort(); const vsKey = `${keys[0]} vs ${keys[1]}`; if (counterData[vsKey] !== undefined) { const val = counterData[vsKey]; return heroA === keys[0] ? val : -val; } return 0; };
    const countRoles = (teamSet) => { const roles = { Tank: 0, Damage: 0, Support: 0 }; teamSet.forEach(key => { if(heroMaster[key]) roles[heroMaster[key].role]++; }); return roles; };
    
    // --- UI生成・更新関数 ---
    function createPaletteContent(paletteElement) {
        const roles = { Tank: [], Damage: [], Support: [] };
        const heroKeys = Object.keys(heroMaster).sort((a,b) => heroMaster[a].name_jp.localeCompare(heroMaster[b].name_jp, 'ja'));
        for (const key of heroKeys) { if (roles[heroMaster[key].role]) roles[heroMaster[key].role].push(key); }
        paletteElement.innerHTML = '';
        for (const role in roles) {
            const section = document.createElement('div');
            section.className = 'role-section';
            section.innerHTML = `<div class="role-title">${role}</div>`;
            const container = document.createElement('div');
            container.className = 'button-container';
            roles[role].forEach(heroKey => {
                const button = document.createElement('button');
                button.className = 'hero-button';
                button.textContent = heroMaster[heroKey].name_jp;
                button.dataset.heroKey = heroKey;
                container.appendChild(button);
            });
            section.appendChild(container);
            paletteElement.appendChild(section);
        }
    }
    function createMapSelector() { const mapNames = Object.keys(mapData).sort(); mapNames.forEach(mapName => { const option = document.createElement('option'); option.value = mapName; option.textContent = mapName; mapSelector.appendChild(option); }); }
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
        const teamArray = Array.from(teamSet);
        teamArray.forEach(heroKey => {
            const button = document.createElement('button');
            button.className = 'hero-button';
            button.textContent = heroMaster[heroKey].name_jp;
            button.dataset.heroKey = heroKey;
            displayElement.appendChild(button);
        });
        document.getElementById('your-team-count').textContent = `${yourTeam.size}/5`;
        document.getElementById('enemy-team-count').textContent = `${enemyTeam.size}/5`;
    }

    // --- 分析ロジック関数 ---
    function calculateBestPicks(targetTeam, ownTeam, heroesToExclude = new Set()) {
        const results = { Tank: [], Damage: [], Support: [] };
        if (!playerRole) return results;
        const allAvailableHeroes = Object.keys(heroMaster).filter(k => !bannedHeroes.has(k) && !ownTeam.has(k) && !heroesToExclude.has(k) && heroMaster[k].role === playerRole);
        const selectedMap = document.getElementById('map-selector').value;
        allAvailableHeroes.forEach(ck => {
            let score = 0;
            targetTeam.forEach(ek => score += getCounterScore(ck, ek));
            if (selectedMap && mapData[selectedMap]?.[ck]) score += mapData[selectedMap][ck];
            results[playerRole].push({ name: heroMaster[ck].name_jp, score });
        });
        results[playerRole].sort((a, b) => b.score - a.score);
        return results;
    }
    function displayResults(title, results, emptyMsg = "") {
        const section = document.createElement('div');
        section.className = 'result-section';
        section.innerHTML = `<h3 class="result-title">${title}</h3>`;
        const resultList = results[playerRole];
        if (!resultList || resultList.length === 0) {
            section.innerHTML += `<p>${emptyMsg || "有効なピックはありません。"}</p>`;
        } else {
            const list = document.createElement('ul');
            list.className = 'result-list';
            resultList.slice(0, 3).forEach(h => {
                const item = document.createElement('li');
                item.innerHTML = `<span class="hero-name">${h.name}</span> <span class="hero-score">スコア: ${h.score.toFixed(1)}</span>`;
                list.appendChild(item);
            });
            section.appendChild(list);
        }
        resultDiv.appendChild(section);
    }
    
    // --- イベントハンドラ関数 ---
    function handleRoleSelect(e) { if (e.target.classList.contains('role-btn')) { playerRole = e.target.dataset.role; localStorage.setItem('playerRole', playerRole); document.querySelectorAll('.role-btn').forEach(btn => btn.classList.remove('active')); e.target.classList.add('active'); } }
    function toggleBan(e) { if (e.target.classList.contains('hero-button')) { const key = e.target.dataset.heroKey; if (yourTeam.has(key) || enemyTeam.has(key)) return; if (bannedHeroes.has(key)) bannedHeroes.delete(key); else if (bannedHeroes.size < 4) bannedHeroes.add(key); else alert("BANは最大4体までです。"); updateUI(); } }
    function handlePick(e) { if (e.target.classList.contains('hero-button')) { const key = e.target.dataset.heroKey; if (bannedHeroes.has(key) || yourTeam.has(key) || enemyTeam.has(key)) return; const role = heroMaster[key].role; const roleLimit = (role === 'Tank' ? 1 : 2); if (countRoles(yourTeam)[role] < roleLimit) yourTeam.add(key); else if (countRoles(enemyTeam)[role] < roleLimit) enemyTeam.add(key); else alert(`このロールのヒーローは既に両チームとも満員です。`); updateUI(); } }
    function handleDisplayClick(e) {
        if (e.target.classList.contains('hero-button')) {
            const key = e.target.dataset.heroKey;
            const isYourTeam = yourTeam.has(key);
            
            if (isYourTeam) {
                const yourHero = Array.from(yourTeam).find(k => heroMaster[k] && heroMaster[k].role === playerRole);
                if(key === yourHero) {
                     // 自己分析
                    const threats = Array.from(enemyTeam).filter(ek => getCounterScore(key, ek) < -1.0);
                    const title = `【自己分析】あなたの「${heroMaster[key].name_jp}」への対策案`;
                    const results = threats.length > 0 ? calculateBestPicks(enemyTeam, yourTeam, new Set([key])) : {};
                    displayResults(title, results, "明確なカウンターは受けていません。");
                } else {
                     // 味方支援
                    const threats = Array.from(enemyTeam).filter(ek => getCounterScore(key, ek) < -1.0);
                    if (threats.length > 0) {
                        const title = `【味方支援】味方の「${heroMaster[key].name_jp}」を助けるための対策案`;
                        const results = calculateBestPicks(new Set(threats), yourTeam);
                        displayResults(title, results);
                    } else {
                        alert(`味方の「${heroMaster[key].name_jp}」は現在、明確なカウンターを受けていません。`);
                    }
                }
            } else if (enemyTeam.has(key)) {
                // 特定脅威排除
                const title = `【脅威排除】敵の「${heroMaster[key].name_jp}」への直接的なカウンター案`;
                const results = calculateBestPicks(new Set([key]), yourTeam);
                displayResults(title, results);
            }
        }
    }
    function analyzeOverall() { if (!playerRole) { alert("まず、あなたのロールを選択してください。"); return; } resultDiv.innerHTML = ''; const title = "【全体分析】敵チーム構成に対する総合的な推奨ピック"; const results = calculateBestPicks(enemyTeam, yourTeam); displayResults(title, results); }
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
            enemyTeamDisplay.addEventListener('click', handleDisplayClick);
            analysisButton.addEventListener('click', analyzeOverall);
            importFile.addEventListener('change', handleImport);
            exportButton.addEventListener('click', handleExport);
            resetButton.addEventListener('click', handleReset);

            const savedRole = localStorage.getItem('playerRole');
            if (savedRole) { playerRole = savedRole; playerRoleSelector.querySelector(`[data-role="${savedRole}"]`)?.classList.add('active'); }
            
        } catch (error) {
            console.error("初期化エラー:", error);
            alert("設定ファイルの読み込み、または初期化に失敗しました。");
        }
    }
    
    initialize();
});
