document.addEventListener('DOMContentLoaded', () => {
    // DOM要素の取得
    const heroPalette = document.querySelector('.hero-palette');
    const yourTeamDisplay = document.getElementById('your-team-display');
    const enemyTeamDisplay = document.getElementById('enemy-team-display');
    const yourTeamCount = document.getElementById('your-team-count');
    const enemyTeamCount = document.getElementById('enemy-team-count');
    const overallAnalysisButton = document.getElementById('overall-analysis-button');
    const resultDiv = document.getElementById('result');
    const importFile = document.getElementById('importFile');
    const exportButton = document.getElementById('exportButton');
    const resetButton = document.getElementById('resetButton');

    // 状態管理
    let heroMaster = {};
    let counterData = {};
    let defaultCounterData = {};
    let yourTeam = new Set();
    let enemyTeam = new Set();
    
    // 初期化処理
    async function initialize() {
        try {
            const [heroes, counters] = await Promise.all([
                fetch('heroes.json').then(res => res.json()),
                fetch('counters.json').then(res => res.json())
            ]);
            heroMaster = heroes;
            defaultCounterData = counters;
            loadData();
            createHeroPalette();
            setupEventListeners();
        } catch (error) {
            console.error("初期化に失敗しました:", error);
            alert("設定ファイルの読み込みに失敗しました。");
        }
    }

    function loadData() {
        try {
            const savedCounters = localStorage.getItem('owCounterConfig');
            counterData = savedCounters ? JSON.parse(savedCounters) : { ...defaultCounterData };
        } catch (e) {
            counterData = { ...defaultCounterData };
        }
    }

    function saveData() {
        localStorage.setItem('owCounterConfig', JSON.stringify(counterData));
    }

    function createHeroPalette() {
        const roles = { Tank: [], Damage: [], Support: [] };
        const heroKeys = Object.keys(heroMaster);
        heroKeys.sort();

        for (const key of heroKeys) {
            roles[heroMaster[key].role].push(key);
        }

        heroPalette.innerHTML = '';
        for (const role in roles) {
            const roleSection = document.createElement('div');
            roleSection.className = 'role-section';
            roleSection.innerHTML = `<div class="role-title">${role}</div>`;
            const buttonContainer = document.createElement('div');
            buttonContainer.className = 'button-container';
            roles[role].forEach(heroKey => {
                const button = document.createElement('button');
                button.className = 'hero-button';
                button.textContent = heroMaster[heroKey].name_jp;
                button.dataset.heroKey = heroKey;
                buttonContainer.appendChild(button);
            });
            roleSection.appendChild(roleSection);
        }
    }
    
    function setupEventListeners() {
        heroPalette.addEventListener('click', e => {
            if (e.target.classList.contains('hero-button')) {
                handleHeroSelection(e.target.dataset.heroKey);
            }
        });
        overallAnalysisButton.addEventListener('click', () => analyzeOverall());
        importFile.addEventListener('change', handleImport);
        exportButton.addEventListener('click', handleExport);
        resetButton.addEventListener('click', handleReset);
    }
    
    function handleHeroSelection(heroKey) {
        if (yourTeam.has(heroKey)) { // 自分のチームのヒーローがクリックされた (自己分析モード)
            analyzeForSelf(heroKey);
        } else if (enemyTeam.has(heroKey)) { // 敵のヒーローがクリックされた (特定脅威排除モード)
            analyzeVsEnemy(heroKey);
        } else { // ヒーローをチームに追加
            if (yourTeam.size < 5) {
                yourTeam.add(heroKey);
            } else if (enemyTeam.size < 5) {
                enemyTeam.add(heroKey);
            }
        }
        updateUI();
    }
    
    function updateUI() {
        // 全ヒーローボタンの状態を更新
        document.querySelectorAll('.hero-button').forEach(button => {
            const key = button.dataset.heroKey;
            button.classList.remove('selected-for-your-team', 'selected-for-enemy-team', 'disabled');
            if (yourTeam.has(key)) {
                button.classList.add('selected-for-your-team', 'disabled');
            } else if (enemyTeam.has(key)) {
                button.classList.add('selected-for-enemy-team', 'disabled');
            }
        });

        // チーム表示を更新
        updateTeamDisplay(yourTeamDisplay, yourTeam, 'your-team');
        yourTeamCount.textContent = `${yourTeam.size}/5`;
        updateTeamDisplay(enemyTeamDisplay, enemyTeam, 'enemy-team');
        enemyTeamCount.textContent = `${enemyTeam.size}/5`;
    }

    function updateTeamDisplay(displayElement, teamSet, teamName) {
        displayElement.innerHTML = '';
        teamSet.forEach(heroKey => {
            const button = document.createElement('button');
            button.className = 'hero-button';
            button.textContent = heroMaster[heroKey].name_jp;
            // 選択解除のためのクリックイベント
            button.addEventListener('click', (e) => {
                e.stopPropagation(); // パレットへの伝播を防ぐ
                teamSet.delete(heroKey);
                updateUI();
            });
            displayElement.appendChild(button);
        });
    }

    // --- 4つの分析モード ---
    function analyzeForSelf(myHeroKey) {
        const threats = findThreatsFor(myHeroKey, enemyTeam);
        if (threats.length === 0) {
            displayResults(`あなたの「${heroMaster[myHeroKey].name_jp}」は現在、明確なカウンターを受けていません。`, {});
            return;
        }
        const title = `あなたの「${heroMaster[myHeroKey].name_jp}」をカウンターしている敵（${threats.map(t => heroMaster[t].name_jp).join(', ')}）への対策案`;
        const results = calculateBestPicksAgainst(new Set(threats));
        displayResults(title, results);
    }
    
    // 味方支援モード (味方ヒーローをクリックした場合に発動)
    // この機能は、ユーザーが味方ヒーローをもう一度クリックした際に発動するように拡張可能。
    // 今回のシンプル版では、`handleHeroSelection`に味方クリック時のロジックを追加することで実装します。

    function analyzeVsEnemy(enemyHeroKey) {
        const title = `敵の「${heroMaster[enemyHeroKey].name_jp}」への直接的なカウンター案`;
        const results = calculateBestPicksAgainst(new Set([enemyHeroKey]));
        displayResults(title, results);
    }
    
    function analyzeOverall() {
        const title = 'チーム全体に対する総合的な推奨ピック';
        const results = calculateBestPicksAgainst(enemyTeam);
        displayResults(title, results);
    }

    // --- 補助関数 ---
    function findThreatsFor(heroKey, oppositeTeam) {
        let threats = [];
        oppositeTeam.forEach(enemyKey => {
            const score = getCounterScore(heroKey, enemyKey);
            if (score < -1.0) { // ハードカウンターの閾値
                threats.push(enemyKey);
            }
        });
        return threats;
    }

    function calculateBestPicksAgainst(targetTeam) {
        const results = { Tank: [], Damage: [], Support: [] };
        const allHeroKeys = Object.keys(heroMaster);

        allHeroKeys.forEach(candidateKey => {
            if (yourTeam.has(candidateKey) || enemyTeam.has(candidateKey)) return;
            
            let score = 0;
            targetTeam.forEach(enemyKey => {
                score += getCounterScore(candidateKey, enemyKey);
            });

            const role = heroMaster[candidateKey].role;
            results[role].push({ name: heroMaster[candidateKey].name_jp, score });
        });
        for (const role in results) {
            results[role].sort((a, b) => b.score - a.score);
        }
        return results;
    }

    function getCounterScore(heroA, heroB) {
        const sortedKeys = [heroA, heroB].sort();
        const vsKey = `${sortedKeys[0]} vs ${sortedKeys[1]}`;
        if (counterData[vsKey] !== undefined) {
            const value = counterData[vsKey];
            return (heroA === sortedKeys[0]) ? value : -value;
        }
        return 0;
    }
    
    function displayResults(title, results) {
        resultDiv.innerHTML = `<div class="result-title">${title}</div>`;
        for (const role in results) {
            if (results[role] && results[role].length > 0) {
                const roleDiv = document.createElement('div');
                roleDiv.className = 'role-result';
                const list = document.createElement('ul');
                results[role].slice(0, 3).forEach(hero => {
                    const item = document.createElement('li');
                    item.innerHTML = `<span class="hero-name">${hero.name}</span> <span class="hero-score">スコア: ${hero.score.toFixed(1)}</span>`;
                    list.appendChild(item);
                });
                roleDiv.appendChild(list);
                resultDiv.appendChild(roleDiv);
            }
        }
    }

    // --- 設定管理機能 ---
    function handleImport(event) { /* (変更なし) */ }
    function handleExport() { /* (変更なし) */ }
    function handleReset() { /* (変更なし) */ }
    
    // handleImport, handleExport, handleReset の内容は前回のコードをそのままコピーしてください
    function handleImport(event){const file=event.target.files[0];if(!file)return;const reader=new FileReader();reader.onload=e=>{try{counterData=JSON.parse(e.target.result);saveData();alert('設定がインポートされました。')}catch(err){alert('ファイルの読み込みに失敗しました。')}};reader.readAsText(file)}
    function handleExport(){const dataStr="data:text/json;charset=utf-8,"+encodeURIComponent(JSON.stringify(counterData,null,2));const downloadNode=document.createElement('a');downloadNode.setAttribute("href",dataStr);downloadNode.setAttribute("download","ow_counters_config.json");document.body.appendChild(downloadNode);downloadNode.click();downloadNode.remove()}
    function handleReset(){if(confirm('現在の設定を破棄し、デフォルトに戻しますか？')){counterData={...defaultCounterData};saveData();alert('設定がリセットされました。')}}

    initialize();
});