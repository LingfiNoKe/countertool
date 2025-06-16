document.addEventListener('DOMContentLoaded', () => {
    // === DOM要素の取得 ===
    const playerRoleSelector = document.getElementById('player-role-selector');
    const pickPalette = document.getElementById('pick-palette');
    const heroSlots = document.querySelectorAll('.hero-slot');
    const modal = document.getElementById('settings-modal');
    const settingsButton = document.getElementById('settings-button');
    const closeButton = document.querySelector('.close-button');
    const saveSettingsButton = document.getElementById('save-settings-button');
    const suggestionCountInput = document.getElementById('suggestion-count');
    const heroPoolSettingsDiv = document.getElementById('hero-pool-settings');
    const importFile = document.getElementById('importFile');
    const exportButton = document.getElementById('exportButton');
    const resetButton = document.getElementById('resetButton');

    // === 状態管理 ===
    let heroMaster = {}, counterData = {}, mapData = {}, defaultCounterData = {};
    let playerRole = null;
    let heroPool = {}; 
    let suggestionCount = 3;
    let teams = { your: Array(5).fill(null), enemy: Array(5).fill(null) };
    let activeSlot = { team: 'your', index: 0 };

    // --- 補助関数 ---
    const loadData = () => { try { const saved = localStorage.getItem('owCounterConfig'); counterData = saved ? JSON.parse(saved) : { ...defaultCounterData }; } catch (e) { counterData = { ...defaultCounterData }; }};
    const saveData = () => { localStorage.setItem('owCounterConfig', JSON.stringify(counterData)); };
    const getCounterScore = (heroA, heroB) => { const keys = [heroA, heroB].sort(); const vsKey = `${keys[0]} vs ${keys[1]}`; if (counterData[vsKey] !== undefined) { const val = counterData[vsKey]; return heroA === keys[0] ? val : -val; } return 0; };
    
    // --- UI生成 ---
    function createHeroPalette() {
        const roles = { Tank: [], Damage: [], Support: [] };
        const heroKeys = Object.keys(heroMaster).sort((a,b) => heroMaster[a].name_jp.localeCompare(heroMaster[b].name_jp, 'ja'));
        for (const key of heroKeys) { if (roles[heroMaster[key].role]) roles[heroMaster[key].role].push(key); }
        pickPalette.innerHTML = '';
        for (const role in roles) {
            const section = document.createElement('div'); section.className = 'role-section';
            section.innerHTML = `<div class="role-title">${role}</div>`;
            const container = document.createElement('div'); container.className = 'button-container';
            roles[role].forEach(heroKey => {
                const button = document.createElement('button'); button.className = 'hero-button'; button.textContent = heroMaster[heroKey].name_jp; button.dataset.heroKey = heroKey;
                container.appendChild(button);
            });
            section.appendChild(container);
            pickPalette.appendChild(section);
        }
    }
    
    // --- UI更新 ---
    function updateAllUI() {
        updateHeroSlots();
        updatePaletteUI();
    }
    function updateHeroSlots() {
        heroSlots.forEach(slot => {
            const team = slot.dataset.team;
            const index = parseInt(slot.dataset.index, 10);
            const heroKey = teams[team][index];
            slot.innerHTML = ''; // 中身をリセット
            slot.classList.remove('active', 'player-hero');
            if (activeSlot.team === team && activeSlot.index === index) slot.classList.add('active');

            if (heroKey) {
                const heroName = heroMaster[heroKey]?.name_jp || '不明';
                const changeBtnHTML = `<span class="change-btn" data-team="${team}" data-index="${index}">変更/解除</span>`;
                slot.innerHTML = `<div class="hero-header"><span class="hero-name-display">${heroName}</span>${changeBtnHTML}</div><div class="suggestion-area"></div>`;
                if(team === 'your' && index === 0) slot.classList.add('player-hero');
                updateSingleSuggestion(slot); // スロット毎に提案を更新
            } else {
                slot.innerHTML = `スロット ${index + 1}`;
            }
        });
    }
    function updatePaletteUI() {
        const allPicks = new Set([...teams.your, ...teams.enemy].filter(p => p));
        pickPalette.querySelectorAll('.hero-button').forEach(button => {
            button.classList.toggle('disabled', allPicks.has(button.dataset.heroKey));
        });
    }

    // --- 分析ロジック (リアルタイム常時表示) ---
    function updateSingleSuggestion(slot) {
        const suggestionArea = slot.querySelector('.suggestion-area');
        if (!suggestionArea || !playerRole) return;

        const team = slot.dataset.team;
        const heroKey = teams[team][parseInt(slot.dataset.index, 10)];
        if (!heroKey) { suggestionArea.innerHTML = ''; return; }

        let results;
        if (team === 'your') { // 味方スロットの場合（自己分析 or 味方支援）
            const threats = Array.from(new Set(teams.enemy)).filter(ek => ek && getCounterScore(heroKey, ek) < -1.0);
            results = threats.length > 0 ? calculateBestPicks(new Set(threats), new Set(teams.your)) : { highRisk:[], lowRisk:[] };
        } else { // 敵スロットの場合（脅威排除）
            results = calculateBestPicks(new Set([heroKey]), new Set(teams.your));
        }

        suggestionArea.innerHTML = '';
        if (results.lowRisk.length > 0) {
            suggestionArea.innerHTML += '<h4>安全策</h4><ul class="suggestion-list"></ul>';
            const list = suggestionArea.querySelector('ul:last-child');
            results.lowRisk.slice(0, suggestionCount).forEach(h => appendResultItem(list, h));
        }
        if (results.highRisk.length > 0) {
            suggestionArea.innerHTML += '<h4>ハイリスク案</h4><ul class="suggestion-list"></ul>';
            const list = suggestionArea.querySelector('ul:last-child');
            results.highRisk.slice(0, suggestionCount).forEach(h => appendResultItem(list, h));
        }
    }

    function calculateBestPicks(targetTeam, ownTeam, heroesToExclude = new Set()) {
        const results = { highRisk: [], lowRisk: [] };
        const allPicks = new Set([...ownTeam, ...bannedHeroes, ...heroesToExclude]);
        const availableHeroes = Object.keys(heroMaster).filter(k => !allPicks.has(k) && heroMaster[k].role === playerRole);
        
        const calculateScore = (candidateKey) => {
            let score = 0;
            targetTeam.forEach(enemyKey => score += getCounterScore(candidateKey, enemyKey));
            return score;
        };

        availableHeroes.forEach(ck => {
            const score = calculateScore(ck);
            const isCountered = Array.from(new Set(teams.enemy)).filter(p => p).some(ek => getCounterScore(ck, ek) < -1.0);
            const suggestion = { key: ck, name: heroMaster[ck].name_jp, score };
            if (isCountered) results.highRisk.push(suggestion);
            else results.lowRisk.push(suggestion);
        });
        
        results.highRisk.sort((a,b) => b.score - a.score);
        results.lowRisk.sort((a,b) => b.score - a.score);
        return results;
    }
    
    function appendResultItem(list, hero) {
        const item = document.createElement('li');
        const isEnabled = heroPool[hero.key] !== false;
        if (!isEnabled) item.classList.add('disabled');
        item.textContent = hero.name;
        list.appendChild(item);
    }
    
    // --- イベントハンドラ ---
    function handleRoleSelect(e) { if (e.target.classList.contains('role-btn')) { playerRole = e.target.dataset.role; localStorage.setItem('playerRole', playerRole); document.querySelectorAll('.role-btn').forEach(btn => btn.classList.remove('active')); e.target.classList.add('active'); updateAllUI(); } }
    function setActiveSlot(team, index) { activeSlot = { team, index: parseInt(index, 10) }; updateUI(); }
    function handlePick(e) {
        if (e.target.classList.contains('hero-button') && !e.target.classList.contains('disabled')) {
            const heroKey = e.target.dataset.heroKey;
            teams[activeSlot.team][activeSlot.index] = heroKey;
            // 次の空きスロットを自動でアクティブに
            const nextSlot = findNextEmptySlot(activeSlot.team, activeSlot.index);
            setActiveSlot(nextSlot.team, nextSlot.index);
            updateAllUI();
        }
    }
    function findNextEmptySlot(currentTeam, currentIndex) {
        for (let i = currentIndex + 1; i < 5; i++) {
            if (!teams[currentTeam][i]) return { team: currentTeam, index: i };
        }
        const otherTeam = currentTeam === 'your' ? 'enemy' : 'your';
        for (let i = 0; i < 5; i++) {
            if (!teams[otherTeam][i]) return { team: otherTeam, index: i };
        }
        return { team: currentTeam, index: currentIndex }; // 全て埋まっている場合
    }
    function handleChangeClick(e) {
        if (e.target.classList.contains('change-btn')) {
            const team = e.target.dataset.team;
            const index = parseInt(e.target.dataset.index, 10);
            teams[team][index] = null; // ヒーローを解除
            setActiveSlot(team, index);
            updateAllUI();
        }
    }

    // --- 設定モーダル関連 ---
    function setupSettingsModal() { /* (モーダル関連のイベントリスナーを設定) */ }

    // === 初期化処理の呼び出し ===
    async function initialize() {
        try {
            const [h, c, m] = await Promise.all([fetch('heroes.json').then(r=>r.json()), fetch('counters.json').then(r=>r.json()), fetch('maps.json').then(r=>r.json())]);
            heroMaster = h; defaultCounterData = c; mapData = m;
            
            loadData();
            createHeroPalette();
            // (createMapSelectorは不要になったので削除)
            
            roleSelector.addEventListener('click', handleRoleSelect);
            heroSlots.forEach(slot => {
                slot.addEventListener('click', () => setActiveSlot(slot.dataset.team, slot.dataset.index));
                slot.addEventListener('click', handleChangeClick);
            });
            pickPalette.addEventListener('click', handlePick);
            
            // (設定モーダル関連のイベントリスナーをここに移動)
            settingsButton.onclick = () => { /* ... */ };
            closeButton.onclick = () => { /* ... */ };
            saveSettingsButton.onclick = () => { /* ... */ };
            // ...その他設定関連のハンドラ

            // LocalStorageから設定を復元
            const savedRole = localStorage.getItem('playerRole');
            if (savedRole) { playerRole = savedRole; roleSelector.querySelector(`[data-role="${savedRole}"]`)?.classList.add('active'); }
            heroPool = JSON.parse(localStorage.getItem('heroPool') || '{}');
            suggestionCount = parseInt(localStorage.getItem('suggestionCount') || '3', 10);
            
            setActiveSlot('your', 0); // 最初に「自分のヒーロー」スロットをアクティブにする
            updateAllUI();

        } catch (error) {
            console.error("初期化エラー:", error);
            alert("設定ファイルの読み込み、または初期化に失敗しました。");
        }
    }
    
    initialize();
});