document.addEventListener('DOMContentLoaded', () => {
    // DOM要素の取得
    const mapSelector = document.getElementById('map-selector');
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
    let heroMaster = {}, counterData = {}, mapData = {}, defaultCounterData = {};
    let yourTeam = new Set(), enemyTeam = new Set();
    
    // 初期化処理
    async function initialize() {
        try {
            const [heroes, counters, maps] = await Promise.all([
                fetch('heroes.json').then(res => res.json()),
                fetch('counters.json').then(res => res.json()),
                fetch('maps.json').then(res => res.json())
            ]);
            heroMaster = heroes;
            defaultCounterData = counters;
            mapData = maps;
            loadData();
            createHeroPalette();
            createMapSelector();
            setupEventListeners();
            updateUI();
        } catch (error) {
            console.error("初期化に失敗しました:", error);
            alert("設定ファイルの読み込みに失敗しました。ファイルが存在し、形式が正しいか確認してください。");
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
            if (roles[heroMaster[key].role]) {
                roles[heroMaster[key].role].push(key);
            }
        }

        heroPalette.innerHTML = '';
        for (const role in roles) {
            const roleSection = document.createElement('div');
            roleSection.className = 'role-section';
            
            const roleTitle = document.createElement('div');
            roleTitle.className = 'role-title';
            roleTitle.textContent = role;
            roleSection.appendChild(roleTitle);

            const buttonContainer = document.createElement('div');
            buttonContainer.className = 'button-container';
            roles[role].forEach(heroKey => {
                const button = document.createElement('button');
                button.className = 'hero-button';
                button.textContent = heroMaster[heroKey].name_jp;
                button.dataset.heroKey = heroKey;
                buttonContainer.appendChild(button);
            });
            roleSection.appendChild(buttonContainer);
            
            // ★★★ ここが修正点です ★★★
            // 自分自身(roleSection)ではなく、親となるheroPaletteに追加します。
            heroPalette.appendChild(roleSection);
        }
    }

    function createMapSelector() {
        const mapNames = Object.keys(mapData).sort();
        mapNames.forEach(mapName => {
            const option = document.createElement('option');
            option.value = mapName;
            option.textContent = mapName;
            mapSelector.appendChild(option);
        });
    }

    function setupEventListeners() {
        heroPalette.addEventListener('click', e => {
            if (e.target.classList.contains('hero-button')) {
                const heroKey = e.target.dataset.heroKey;
                handleHeroClick(heroKey);
            }
        });
        
        overallAnalysisButton.addEventListener('click', () => analyzeOverall(enemyTeam));
        
        importFile.addEventListener('change', handleImport);
        exportButton.addEventListener('click', handleExport);
        resetButton.addEventListener('click', handleReset);
    }

    function handleHeroClick(heroKey) {
        if (yourTeam.has(heroKey)) {
             analyzeForSelf(heroKey);
        } else if (enemyTeam.has(heroKey)) {
            analyzeVsEnemy(heroKey);
        } else {
            // チーム選択ロジック（どちらかのチームに空きがあれば追加）
            if (yourTeam.size < 5) {
                yourTeam.add(heroKey);
            } else if (enemyTeam.size < 5) {
                enemyTeam.add(heroKey);
            } else {
                alert("両チームとも満員です。ヒーローを解除してから選択してください。");
            }
        }
        updateUI();
    }
    
    function updateUI() {
        document.querySelectorAll('.hero-button').forEach(button => {
            const key = button.dataset.heroKey;
            button.classList.remove('selected-for-your-team', 'selected-for-enemy-team');
            if (yourTeam.has(key)) {
                button.classList.add('selected-for-your-team');
            } else if (enemyTeam.has(key)) {
                button.classList.add('selected-for-enemy-team');
            }
        });
        updateTeamDisplay(yourTeamDisplay, yourTeam);
        yourTeamCount.textContent = `${yourTeam.size}/5`;
        updateTeamDisplay(enemyTeamDisplay, enemyTeam);
        enemyTeamCount.textContent = `${enemyTeam.size}/5`;
    }

    function updateTeamDisplay(displayElement, teamSet) {
        displayElement.innerHTML = '';
        teamSet.forEach(heroKey => {
            const button = document.createElement('button');
            button.className = 'hero-button';
            button.textContent = heroMaster[heroKey].name_jp;
            button.addEventListener('click', (e) => {
                e.stopPropagation();
                teamSet.delete(heroKey);
                updateUI();
            });
            displayElement.appendChild(button);
        });
    }

    function analyzeForSelf(myHeroKey) {
        const threats = findThreatsFor(myHeroKey, enemyTeam);
        if (threats.length === 0) {
            displayResults(`あなたの「${heroMaster[myHeroKey].name_jp}」は現在、明確なカウンターを受けていません。`, {});
            return;
        }
        const title = `あなたの「${heroMaster[myHeroKey].name_jp}」をカウンターしている敵（${threats.map(t => heroMaster[t].name_jp).join(', ')}）への対策案`;
        const currentTeam = new Set(yourTeam);
        currentTeam.delete(myHeroKey);
        const results = calculateBestPicks(enemyTeam, currentTeam, new Set([myHeroKey]));
        displayResults(title, results);
    }
    
    function analyzeVsEnemy(enemyHeroKey) {
        const title = `敵の「${heroMaster[enemyHeroKey].name_jp}」への直接的なカウンター案`;
        const results = calculateBestPicks(enemyTeam, yourTeam);
        displayResults(title, results);
    }
    
    function analyzeOverall(targetTeam) {
        const title = 'チーム全体に対する総合的な推奨ピック';
        const results = calculateBestPicks(targetTeam, yourTeam);
        displayResults(title, results);
    }

    function findThreatsFor(heroKey, oppositeTeam) {
        return Array.from(oppositeTeam).filter(enemyKey => getCounterScore(heroKey, enemyKey) < -1.0);
    }

    function calculateBestPicks(targetTeam, ownTeam, heroesToExclude = new Set()) {
        const results = { Tank: [], Damage: [], Support: [] };
        const allHeroKeys = Object.keys(heroMaster);
        const selectedMap = mapSelector.value;

        allHeroKeys.forEach(candidateKey => {
            if (ownTeam.has(candidateKey) || targetTeam.has(candidateKey) || heroesToExclude.has(candidateKey)) return;
            
            let score = 0;
            targetTeam.forEach(enemyKey => {
                score += getCounterScore(candidateKey, enemyKey);
            });
            if (selectedMap && mapData[selectedMap] && mapData[selectedMap][candidateKey]) {
                score += mapData[selectedMap][candidateKey];
            }
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

    function handleImport(event){const file=event.target.files[0];if(!file)return;const reader=new FileReader();reader.onload=e=>{try{counterData=JSON.parse(e.target.result);saveData();alert('設定がインポートされました。')}catch(err){alert('ファイルの読み込みに失敗しました。')}};reader.readAsText(file)}
    function handleExport(){const dataStr="data:text/json;charset=utf-8,"+encodeURIComponent(JSON.stringify(counterData,null,2));const downloadNode=document.createElement('a');downloadNode.setAttribute("href",dataStr);downloadNode.setAttribute("download","ow_counters_config.json");document.body.appendChild(downloadNode);downloadNode.click();downloadNode.remove()}
    function handleReset(){if(confirm('現在の設定を破棄し、デフォルトに戻しますか？')){counterData={...defaultCounterData};saveData();alert('設定がリセットされました。')}}

    initialize();
});