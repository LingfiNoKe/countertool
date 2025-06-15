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
    let yourHero = null;

    // --- 補助関数 (呼び出される前に定義) ---
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

    // --- UI更新 ---
    function updateUI() {
        const allPicks = new Set([...yourTeam, ...enemyTeam]);
        const disabledSet = new Set([...bannedHeroes, ...allPicks]);

        document.querySelectorAll('.hero-button').forEach(button => {
            const key = button.dataset.heroKey;
            button.classList.remove('selected-your', 'selected-enemy', 'banned', 'disabled');
            if (yourTeam.has(key)) button.classList.add('selected-your');
            if (enemyTeam.has(key)) button.classList.add('selected-enemy');
            if (bannedHeroes.has(key)) button.classList.add('banned');
            if (disabledSet.has(key)) button.classList.add('disabled');
        });
        
        updateTeamDisplay(yourTeamDisplay, yourTeam);
        document.getElementById('your-team-count').textContent = `${yourTeam.size}/5`;
        updateTeamDisplay(enemyTeamDisplay, enemyTeam);
        document.getElementById('enemy-team-count').textContent = `${enemyTeam.size}/5`;
    }

    function updateTeamDisplay(displayElement, teamSet) {
        displayElement.innerHTML = '';
        teamSet.forEach(heroKey => {
            const button = document.createElement('button');
            button.className = 'hero-button';
            button.textContent = heroMaster[heroKey].name_jp;
            button.dataset.heroKey = heroKey;
            displayElement.appendChild(button);
        });
    }

    // --- イベントハンドラ ---
    function handleRoleSelect(e) { if (e.target.classList.contains('role-btn')) { playerRole = e.target.dataset.role; localStorage.setItem('playerRole', playerRole); document.querySelectorAll('.role-btn').forEach(btn => btn.classList.remove('active')); e.target.classList.add('active'); } }
    function toggleBan(e) { if (e.target.classList.contains('hero-button')) { const key = e.target.dataset.heroKey; if (bannedHeroes.has(key)) bannedHeroes.delete(key); else if (bannedHeroes.size < 4) bannedHeroes.add(key); else alert("BANは最大4体までです。"); updateUI(); } }
    function handlePick(e) { if (e.target.classList.contains('hero-button')) { const key = e.target.dataset.heroKey; if (bannedHeroes.has(key) || yourTeam.has(key) || enemyTeam.has(key)) return; const role = heroMaster[key].role; const roleLimit = (role === 'Tank' ? 1 : 2); if (countRoles(yourTeam)[role] < roleLimit) yourTeam.add(key); else if (countRoles(enemyTeam)[role] < roleLimit) enemyTeam.add(key); else alert(`このロールのヒーローは既に両チームとも満員です。`); updateUI(); } }
    function handleDisplayClick(e) { if (e.target.classList.contains('hero-button')) { const key = e.target.dataset.heroKey; if (yourTeam.has(key)) yourTeam.delete(key); if (enemyTeam.has(key)) enemyTeam.delete(key); updateUI(); } }
    function analyze() { resultDiv.innerHTML = ''; if (!playerRole) { alert("まず、あなたのロールを選択してください。"); return; } yourHero = Array.from(yourTeam).find(k => heroMaster[k] && heroMaster[k].role === playerRole); if (!yourHero) { analyzeForTeam(); return; } analyzeForSelf(); analyzeForTeam(); }

    // --- 分析ロジック ---
    function analyzeForSelf() { const threats = Array.from(enemyTeam).filter(ek => getCounterScore(yourHero, ek) < -1.0); const title = `【自己分析】あなたの「${heroMaster[yourHero].name_jp}」への対策案`; const results = threats.length > 0 ? calculateBestPicks(new Set([yourHero])) : {}; displayResults(title, results, threats.length > 0 ? "" : "明確なカウンターは受けていません。"); }
    function analyzeForTeam() { const biggestThreat = findBiggestTeamThreat(); let title = "【チーム課題】現構成での最適ピック"; let results = calculateBestPicks(new Set()); if (biggestThreat) { title = `【チーム課題】敵の脅威「${heroMaster[biggestThreat].name_jp}」への対策案`; results = calculateBestPicks(new Set(), biggestThreat); } displayResults(title, results); }
    function findBiggestTeamThreat() { let maxThreatScore = 0; let biggestThreat = null; enemyTeam.forEach(ek => { let score = 0; yourTeam.forEach(yk => { score += getCounterScore(ek, yk); }); if (score > maxThreatScore) { maxThreatScore = score; biggestThreat = ek; } }); return biggestThreat; }
    function calculateBestPicks(excludeSet = new Set(), specificTarget = null) {
        const results = { Tank: [], Damage: [], Support: [] };
        const availableHeroes = Object.keys(heroMaster).filter(k => !disabledHeroes.has(k) && !excludeSet.has(k) && heroMaster[k].role === playerRole);
        const targetTeam = specificTarget ? new Set([specificTarget]) : enemyTeam;
        const selectedMap = document.getElementById('map-selector').value;
        availableHeroes.forEach(ck => {
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
        const listContent = results[playerRole]?.slice(0, 3).map(h => `<li><span class="hero-name">${h.name}</span> <span class="hero-score">スコア: ${h.score.toFixed(1)}</span></li>`).join('') || '';
        if (listContent) { section.innerHTML += `<ul class="result-list">${listContent}</ul>`; } 
        else { section.innerHTML += `<p>${emptyMsg || "有効なピックはありません。"}</p>`; }
        resultDiv.appendChild(section);
    }
    
    // --- 設定管理 (変更なし) ---
    const handleImport = (e) => { const file = e.target.files[0]; if (!file) return; const reader = new FileReader(); reader.onload = e => { try { counterData = JSON.parse(e.target.result); saveData(); alert('設定がインポートされました。'); } catch (err) { alert('ファイルの読み込みに失敗しました。'); } }; reader.readAsText(file); };
    const handleExport = () => { const dataStr = `data:text/json;charset=utf-8,${encodeURIComponent(JSON.stringify(counterData, null, 2))}`; const a = document.createElement('a'); a.href = dataStr; a.download = "ow_counters_config.json"; a.click(); a.remove(); };
    const handleReset = () => { if (confirm('設定をデフォルトに戻しますか？')) { counterData = { ...defaultCounterData }; saveData(); alert('設定がリセットされました。'); } };

    // === 初期化処理の呼び出し ===
    async function initialize() {
        try {
            const [h, c, m] = await Promise.all([fetch('heroes.json').then(r=>r.json()), fetch('counters.json').then(r=>r.json()), fetch('maps.json').then(r=>r.json())]);
            heroMaster = h; defaultCounterData = c; mapData = m;
            loadData();
            createPaletteContent(banPalette); createPaletteContent(pickPalette); createMapSelector();
            playerRoleSelector.addEventListener('click', handleRoleSelect);
            banPalette.addEventListener('click', toggleBan);
            pickPalette.addEventListener('click', handlePick);
            yourTeamDisplay.addEventListener('click', handleDisplayClick);
            enemyTeamDisplay.addEventListener('click', handleDisplayClick);
            analysisButton.addEventListener('click', analyze);
            importFile.addEventListener('change', handleImport);
            exportButton.addEventListener('click', handleExport);
            resetButton.addEventListener('click', handleReset);
            const savedRole = localStorage.getItem('playerRole');
            if (savedRole) { playerRole = savedRole; playerRoleSelector.querySelector(`[data-role="${savedRole}"]`)?.classList.add('active'); }
        } catch (error) { console.error("初期化エラー:", error); alert("設定ファイルの読み込み、または初期化に失敗しました。"); }
    }
    
    initialize();
});
