document.addEventListener('DOMContentLoaded', () => {
    // DOM要素の取得
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

    // 状態管理
    let heroMaster = {}, counterData = {}, mapData = {}, defaultCounterData = {};
    let playerRole = null;
    let bannedHeroes = new Set();
    let yourTeam = new Set(), enemyTeam = new Set();
    let disabledHeroes = new Set();

    // 初期化
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
            alert("設定ファイルの読み込みに失敗しました。");
        }
    }

    function createHeroPalettes() {
        const roles = { Tank: [], Damage: [], Support: [] };
        const heroKeys = Object.keys(heroMaster).sort((a,b) => heroMaster[a].name_jp.localeCompare(heroMaster[b].name_jp, 'ja'));
        for (const key of heroKeys) {
            roles[heroMaster[key].role].push(key);
        }
        [banPalette, pickPalette].forEach(palette => {
            palette.innerHTML = '';
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
                palette.appendChild(roleSection);
            }
        });
    }

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

    function handleHeroPick(heroKey) {
        if (yourTeam.has(heroKey) || enemyTeam.has(heroKey)) return;
        
        const role = heroMaster[heroKey].role;
        const yourTeamRoles = countRoles(yourTeam);
        const enemyTeamRoles = countRoles(enemyTeam);

        if (yourTeamRoles[role] < (role === 'Tank' ? 1 : 2)) {
            yourTeam.add(heroKey);
        } else if (enemyTeamRoles[role] < (role === 'Tank' ? 1 : 2)) {
            enemyTeam.add(heroKey);
        } else {
            alert(`このロールのヒーローは既に両チームとも満員です。`);
        }
        updateDisabledHeroes();
        updatePaletteUI();
        updateTeamDisplays();
    }

    function updateDisabledHeroes() {
        disabledHeroes = new Set([...bannedHeroes, ...yourTeam, ...enemyTeam]);
    }
    
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
        const teamArray = Array.from(teamSet).sort((a,b) => Object.keys(heroMaster).indexOf(a) - Object.keys(heroMaster).indexOf(b));
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

    function analyze() {
        if (!playerRole) {
            alert("まず、あなたのロールを選択してください。");
            return;
        }

        const yourHero = Array.from(yourTeam).find(key => heroMaster[key].role === playerRole);
        if (!yourHero) {
            alert("あなたのロールのヒーローが味方チームに選択されていません。");
            return;
        }

        resultDiv.innerHTML = ''; // 結果をリセット
        // 自己分析
        const selfAnalysisTitle = `【自己分析】あなたの「${heroMaster[yourHero].name_jp}」への対策案`;
        const selfThreats = findThreatsFor(yourHero, enemyTeam);
        const selfResults = selfThreats.length > 0 ? calculateBestPicks(enemyTeam, yourTeam, new Set([yourHero])) : {};
        displayResults(selfAnalysisTitle, selfResults, selfThreats.length > 0 ? "" : "明確なカウンターは受けていません。");

        // チームの課題分析
        const teamThreat = findBiggestTeamThreat(enemyTeam);
        if (teamThreat) {
            const teamAnalysisTitle = `【チーム課題】敵の脅威「${heroMaster[teamThreat].name_jp}」への対策案`;
            const teamResults = calculateBestPicks(new Set([teamThreat]), yourTeam);
            displayResults(teamAnalysisTitle, teamResults);
        }
    }
    
    function displayResults(title, results, emptyMessage = "") {
        const section = document.createElement('div');
        section.className = 'result-section';
        section.innerHTML = `<h3 class="result-title">${title}</h3>`;

        if (Object.keys(results).length === 0 || !results[playerRole] || results[playerRole].length === 0) {
            section.innerHTML += `<p>${emptyMessage || "あなたのロールで有効なカウンターピックはありません。"}</p>`;
            resultDiv.appendChild(section);
            return;
        }
        
        const list = document.createElement('ul');
        list.className = 'result-list';
        results[playerRole].slice(0, 3).forEach(hero => {
             const item = document.createElement('li');
             const isEnabled = !JSON.parse(localStorage.getItem('disabledHeroes') || '{}')[hero.key];
             item.className = isEnabled ? "" : "disabled";
             item.innerHTML = `<span class="hero-name">${hero.name}</span> <span class="hero-score">スコア: ${hero.score.toFixed(1)}</span>`;
             list.appendChild(item);
        });
        section.appendChild(list);
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

    function findThreatsFor(heroKey, oppositeTeam) {
        return Array.from(oppositeTeam).filter(enemyKey => getCounterScore(heroKey, enemyKey) < -1.0);
    }

    function findBiggestTeamThreat(enemyTeamSet) {
        let maxThreatScore = 0;
        let biggestThreat = null;
        enemyTeamSet.forEach(enemyKey => {
            let threatScore = 0;
            yourTeam.forEach(yourKey => {
                threatScore += getCounterScore(enemyKey, yourKey); // 敵から見た有利スコア
            });
            if(threatScore > maxThreatScore) {
                maxThreatScore = threatScore;
                biggestThreat = enemyKey;
            }
        });
        return biggestThreat;
    }
    
    function countRoles(teamSet) {
        const roles = { Tank: 0, Damage: 0, Support: 0 };
        teamSet.forEach(key => {
            if(heroMaster[key]) roles[heroMaster[key].role]++;
        });
        return roles;
    }
    
    // 設定管理機能
    function handleImport(event){const file=event.target.files[0];if(!file)return;const reader=new FileReader();reader.onload=e=>{try{counterData=JSON.parse(e.target.result);saveData();alert('設定がインポートされました。')}catch(err){alert('ファイルの読み込みに失敗しました。')}};reader.readAsText(file)}
    function handleExport(){const dataStr="data:text/json;charset=utf-8,"+encodeURIComponent(JSON.stringify(counterData,null,2));const downloadNode=document.createElement('a');downloadNode.setAttribute("href",dataStr);downloadNode.setAttribute("download","ow_counters_config.json");document.body.appendChild(downloadNode);downloadNode.click();downloadNode.remove()}
    function handleReset(){if(confirm('現在の設定を破棄し、デフォルトに戻しますか？')){counterData={...defaultCounterData};saveData();alert('設定がリセットされました。')}}
    
    initialize();
});