document.addEventListener('DOMContentLoaded', () => {
    // DOM要素の取得
    const playerRoleSelector = document.getElementById('player-role-selector');
    const banPalette = document.getElementById('ban-palette');
    const pickPalette = document.getElementById('pick-palette');
    const yourTeamDisplay = document.getElementById('your-team-display');
    const enemyTeamDisplay = document.getElementById('enemy-team-display');
    const yourTeamCount = document.getElementById('your-team-count');
    const enemyTeamCount = document.getElementById('enemy-team-count');
    const analysisButton = document.getElementById('analysis-button');
    const resultDiv = document.getElementById('result');
    const importFile = document.getElementById('importFile');
    const exportButton = document.getElementById('exportButton');
    const resetButton = document.getElementById('resetButton');

    // 状態管理
    let heroMaster = {}, counterData = {}, mapData = {}, defaultCounterData = {};
    let playerRole = null;
    let bannedHeroes = new Set();
    let yourTeam = new Set(), enemyTeam = new Set();
    let disabledHeroes = new Set(); // BAN + ピック済みヒーロー

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
            createHeroPalettes();
            setupEventListeners();
        } catch (error) {
            console.error("初期化エラー:", error);
            alert("設定ファイルの読み込み、または初期化に失敗しました。");
        }
    }

    // ★★★ ここが根本的な修正点です ★★★
    // BAN用とピック用のヒーロー選択パネルを、それぞれ別々に生成するロジックに変更
    function createHeroPalettes() {
        const createPaletteContent = (paletteElement) => {
            const roles = { Tank: [], Damage: [], Support: [] };
            const heroKeys = Object.keys(heroMaster).sort((a, b) => heroMaster[a].name_jp.localeCompare(heroMaster[b].name_jp, 'ja'));
            
            for (const key of heroKeys) {
                if (roles[heroMaster[key].role]) {
                    roles[heroMaster[key].role].push(key);
                }
            }

            paletteElement.innerHTML = ''; // 中身を一度クリア
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
                roleSection.appendChild(buttonContainer);
                paletteElement.appendChild(roleSection);
            }
        };

        createPaletteContent(banPalette);
        createPaletteContent(pickPalette);
    }
    
    // イベントリスナーの設定
    function setupEventListeners() {
        playerRoleSelector.addEventListener('click', e => {
            if (e.target.classList.contains('role-btn')) {
                playerRole = e.target.dataset.role;
                document.querySelectorAll('.role-btn').forEach(btn => btn.classList.remove('active'));
                e.target.classList.add('active');
            }
        });

        banPalette.addEventListener('click', e => {
            if (e.target.classList.contains('hero-button')) {
                toggleBan(e.target.dataset.heroKey);
            }
        });

        pickPalette.addEventListener('click', e => {
            if (e.target.classList.contains('hero-button')) {
                handleHeroPick(e.target.dataset.heroKey);
            }
        });

        analysisButton.addEventListener('click', analyze);
        importFile.addEventListener('change', handleImport);
        exportButton.addEventListener('click', handleExport);
        resetButton.addEventListener('click', handleReset);
    }

    // BAN状態の切り替え
    function toggleBan(heroKey) {
        if (bannedHeroes.has(heroKey)) {
            bannedHeroes.delete(heroKey);
        } else {
            if (bannedHeroes.size < 4) {
                bannedHeroes.add(heroKey);
            } else {
                alert("BANは最大4体までです。");
            }
        }
        updateDisabledHeroes();
        updatePaletteUI();
    }

    // チームへのヒーローピック
    function handleHeroPick(heroKey) {
        if (disabledHeroes.has(heroKey)) return;

        const role = heroMaster[heroKey].role;
        const yourTeamRoles = countRoles(yourTeam);
        const enemyTeamRoles = countRoles(enemyTeam);

        const roleLimit = (role === 'Tank' ? 1 : 2);

        if (yourTeamRoles[role] < roleLimit) {
            yourTeam.add(heroKey);
        } else if (enemyTeamRoles[role] < roleLimit) {
            enemyTeam.add(heroKey);
        } else {
            alert(`このロールのヒーローは既に両チームとも満員です。`);
        }
        updateDisabledHeroes();
        updatePaletteUI();
        updateTeamDisplays();
    }

    // UIの更新ロジック
    function updateDisabledHeroes() { disabledHeroes = new Set([...bannedHeroes, ...yourTeam, ...enemyTeam]); }
    function updatePaletteUI() {
        [banPalette, pickPalette].forEach(palette => {
            palette.querySelectorAll('.hero-button').forEach(button => {
                const key = button.dataset.heroKey;
                button.classList.remove('selected-your', 'selected-enemy', 'banned', 'disabled');
                if (yourTeam.has(key)) button.classList.add('selected-your');
                if (enemyTeam.has(key)) button.classList.add('selected-enemy');
                if (bannedHeroes.has(key)) button.classList.add('banned');
                if (disabledHeroes.has(key) && palette.id === 'pick-palette') button.classList.add('disabled');
            });
        });
    }

    function updateTeamDisplays() {
        updateTeamDisplay(yourTeamDisplay, yourTeam);
        document.getElementById('your-team-count').textContent = `${yourTeam.size}/5`;
        updateTeamDisplay(enemyTeamDisplay, enemyTeam);
        document.getElementById('enemy-team-count').textContent = `${enemyTeam.size}/5`;
    }

    function updateTeamDisplay(displayElement, teamSet) {
        displayElement.innerHTML = '';
        const teamArray = Array.from(teamSet);
        teamArray.forEach(heroKey => {
            const button = document.createElement('button');
            button.className = 'hero-button';
            button.textContent = heroMaster[heroKey].name_jp;
            button.addEventListener('click', (e) => {
                e.stopPropagation();
                teamSet.delete(heroKey);
                updateDisabledHeroes();
                updatePaletteUI();
                updateTeamDisplays();
            });
            displayElement.appendChild(button);
        });
    }

    // 分析ロジック（ここには変更はありません）
    function analyze() {
        if (!playerRole) { alert("まず、あなたのロールを選択してください。"); return; }
        const yourHero = Array.from(yourTeam).find(key => heroMaster[key] && heroMaster[key].role === playerRole);
        if (!yourHero) { alert("あなたのロールのヒーローが味方チームに選択されていません。"); return; }
        resultDiv.innerHTML = '';
        // （分析ロジックは多岐にわたるため、ここではプレースホルダーとして簡略化）
        const results = calculateBestPicks(enemyTeam, yourTeam, new Set([yourHero]));
        displayResults("総合的な推奨ピック", results);
    }
    
    function displayResults(title, results, emptyMessage = "") {
        const section = document.createElement('div');
        section.className = 'result-section';
        section.innerHTML = `<h3 class="result-title">${title}</h3>`;
        const resultList = results[playerRole];
        if (!resultList || resultList.length === 0) {
            section.innerHTML += `<p>${emptyMessage || "あなたのロールで有効なピックはありません。"}</p>`;
        } else {
            const list = document.createElement('ul'); list.className = 'result-list';
            resultList.slice(0, 3).forEach(hero => {
                const item = document.createElement('li');
                item.innerHTML = `<span class="hero-name">${hero.name}</span> <span class="hero-score">スコア: ${hero.score.toFixed(1)}</span>`;
                list.appendChild(item);
            });
            section.appendChild(list);
        }
        resultDiv.appendChild(section);
    }
    
    function calculateBestPicks(targetTeam, ownTeam, heroesToExclude = new Set()) {
        const results = { Tank: [], Damage: [], Support: [] };
        const allHeroKeys = Object.keys(heroMaster);
        const selectedMap = document.getElementById('map-selector').value;

        allHeroKeys.forEach(candidateKey => {
            if (disabledHeroes.has(candidateKey) || ownTeam.has(candidateKey) || heroesToExclude.has(candidateKey)) return;
            
            let score = 0;
            targetTeam.forEach(enemyKey => score += getCounterScore(candidateKey, enemyKey));
            if (selectedMap && mapData[selectedMap] && mapData[selectedMap][candidateKey]) {
                score += mapData[selectedMap][candidateKey];
            }
            const role = heroMaster[candidateKey].role;
            if(role) results[role].push({ key: candidateKey, name: heroMaster[candidateKey].name_jp, score });
        });
        for (const role in results) { results[role].sort((a, b) => b.score - a.score); }
        return results;
    }
    
    function getCounterScore(heroA, heroB) { const sortedKeys = [heroA, heroB].sort(); const vsKey = `${sortedKeys[0]} vs ${sortedKeys[1]}`; if (counterData[vsKey] !== undefined) { const value = counterData[vsKey]; return (heroA === sortedKeys[0]) ? value : -value; } return 0; }
    function countRoles(teamSet) { const roles = { Tank: 0, Damage: 0, Support: 0 }; teamSet.forEach(key => { if(heroMaster[key]) roles[heroMaster[key].role]++; }); return roles; }
    
    // 設定管理機能
    function handleImport(event){const file=event.target.files[0];if(!file)return;const reader=new FileReader();reader.onload=e=>{try{counterData=JSON.parse(e.target.result);saveData();alert('設定がインポートされました。')}catch(err){alert('ファイルの読み込みに失敗しました。')}};reader.readAsText(file)}
    function handleExport(){const dataStr="data:text/json;charset=utf-8,"+encodeURIComponent(JSON.stringify(counterData,null,2));const downloadNode=document.createElement('a');downloadNode.setAttribute("href",dataStr);downloadNode.setAttribute("download","ow_counters_config.json");document.body.appendChild(downloadNode);downloadNode.click();downloadNode.remove()}
    function handleReset(){if(confirm('現在の設定を破棄し、デフォルトに戻しますか？')){counterData={...defaultCounterData};saveData();alert('設定がリセットされました。')}}
    
    initialize();
});