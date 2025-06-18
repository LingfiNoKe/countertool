document.addEventListener('DOMContentLoaded', () => {
    // --- グローバル変数と状態管理 ---
    let heroesData = [];
    let countersData = {};
    let mapsData = {};
    let synergyData = {};

    let state = {
        allyTeam: Array(5).fill(null),
        enemyTeam: Array(5).fill(null),
        bannedHeroes: [],
        currentMap: 'none',
        myHeroSlotIndex: 0, // 味方チームの0番目をデフォルトで「自分」とする
        activeSelection: null, // { team: 'ally'/'enemy', index: number }
        activeAnalysis: null, // { mode: string, target: any }
        settings: {
            suggestionCount: 2,
            heroPool: []
        }
    };

    // --- DOM要素のキャッシュ ---
    const allySlotsContainer = document.getElementById('ally-team-slots');
    const enemySlotsContainer = document.getElementById('enemy-team-slots');
    const heroPalette = document.getElementById('hero-palette');
    const banPalette = document.getElementById('ban-palette');
    const bannedListContainer = document.getElementById('banned-list');
    const mapSelector = document.getElementById('map-selector');

    // --- 初期化処理 ---
    async function initializeApp() {
        // ローカルストレージから設定を読み込み
        loadSettings();

        // データファイルの並列読み込み
        [heroesData, countersData, mapsData, synergyData] = await Promise.all([
            fetch('heroes.json').then(res => res.json()),
            fetch('counters.json').then(res => res.json()),
            fetch('maps.json').then(res => res.json()),
            fetch('synergy.json').then(res => res.json())
        ]);

        // UIの生成
        createHeroSlots();
        populatePalettes();
        populateMapSelector();
        populateHeroPoolChecklist();

        // イベントリスナーの設定
        setupEventListeners();
        
        // 初回レンダリング
        renderAll();
    }

    // --- UI生成関数 ---
    function createHeroSlots() {
        allySlotsContainer.innerHTML = '';
        enemySlotsContainer.innerHTML = '';
        for (let i = 0; i < 5; i++) {
            allySlotsContainer.innerHTML += createSlotHTML('ally', i);
            enemySlotsContainer.innerHTML += createSlotHTML('enemy', i);
        }
    }

    function createSlotHTML(team, index) {
        const isMineClass = (team === 'ally' && index === state.myHeroSlotIndex) ? 'is-mine' : '';
        return `
            <div class="hero-slot-wrapper" data-team="${team}" data-index="${index}">
                ${team === 'ally' ? createSuggestionHTML() : ''}
                <div class="hero-slot ${team} ${isMineClass}" data-team="${team}" data-index="${index}">
                    スロット ${index + 1}
                </div>
                ${team === 'enemy' ? createSuggestionHTML() : ''}
            </div>
        `;
    }
    
    function createSuggestionHTML() {
        return `
            <div class="suggestion-area">
                <div class="suggestion high-risk"></div>
                <div class="suggestion low-risk"></div>
            </div>
        `;
    }

    /**
     * 【修正箇所】
     * ヒーロー選択パレットを生成する関数。
     * heroes.jsonからロール情報を動的に読み取り、セクションを生成するよう変更。
     */
    function populatePalettes() {
        heroPalette.innerHTML = '';
        banPalette.innerHTML = '';

        // 1. heroes.jsonからロールのリストを重複なく取得する
        const allRoles = heroesData.map(hero => hero.role);
        const uniqueRoles = [...new Set(allRoles)];

        // 2. 表示順を定義（オーバーウォッチの慣例に合わせる）
        // この配列に含まれない新しいロールは、配列の最後に追加される
        const roleOrder = ['tank', 'damage', 'support'];
        uniqueRoles.sort((a, b) => {
            const indexA = roleOrder.indexOf(a);
            const indexB = roleOrder.indexOf(b);
            if (indexA > -1 && indexB > -1) return indexA - indexB;
            if (indexA > -1) return -1;
            if (indexB > -1) return 1;
            return a.localeCompare(b); // roleOrderにないロールは末尾でアルファベット順に
        });
        
        // 3. ロールの日本語名を定義
        const roleNames = {
            tank: 'タンク',
            damage: 'ダメージ',
            support: 'サポート'
        };

        // 4. 動的に取得したロールごとに処理
        uniqueRoles.forEach(role => {
            // パレットに見出しを追加
            const headerName = roleNames[role] || role; // 未定義のロールは英語名をそのまま使用
            const heroHeader = `<h3 class="role-header">${headerName}</h3>`;
            heroPalette.innerHTML += heroHeader;
            
            const banHeader = `<h3 class="role-header">${headerName}</h3>`;
            banPalette.innerHTML += banHeader;

            // そのロールに属するヒーローを名前（日本語）のアルファベット順でソート
            const heroesInRole = heroesData
                .filter(hero => hero.role === role)
                .sort((a, b) => a.name.localeCompare(b.name, 'ja'));

            // ソートされたヒーローをカードとしてパレットに追加
            heroesInRole.forEach(hero => {
                const cardHTML = `<div class="hero-card" data-hero-id="${hero.id}">${hero.name}</div>`;
                heroPalette.innerHTML += cardHTML;
                banPalette.innerHTML += cardHTML;
            });
        });
    }

    function populateMapSelector() {
        mapSelector.innerHTML = '<option value="none">マップ未選択</option>';
        for (const mapId in mapsData) {
            mapSelector.innerHTML += `<option value="${mapId}">${mapsData[mapId].name}</option>`;
        }
    }

    function populateHeroPoolChecklist() {
        const checklist = document.getElementById('hero-pool-checklist');
        checklist.innerHTML = '';
        const sortedHeroes = [...heroesData].sort((a, b) => a.name.localeCompare(b.name));
        for (const hero of sortedHeroes) {
            checklist.innerHTML += `
                <div class="hero-pool-item">
                    <input type="checkbox" id="pool-${hero.id}" data-hero-id="${hero.id}">
                    <label for="pool-${hero.id}">${hero.name}</label>
                </div>
            `;
        }
    }
    
    // --- イベントリスナー設定 ---
    function setupEventListeners() {
        // ヒーロースロットクリック
        document.getElementById('battle-board').addEventListener('click', (e) => {
            if (e.target.closest('.hero-slot')) {
                handleSlotClick(e.target.closest('.hero-slot'));
            }
        });

        // ヒーロー選択パレットクリック
        heroPalette.addEventListener('click', (e) => {
            if (e.target.classList.contains('hero-card') && !e.target.classList.contains('banned') && !e.target.classList.contains('picked')) {
                handleHeroSelection(e.target.dataset.heroId);
            }
        });
        
        // BANパレットクリック
        banPalette.addEventListener('click', (e) => {
            if (e.target.classList.contains('hero-card') && !e.target.classList.contains('picked')) {
                toggleBan(e.target.dataset.heroId);
            }
        });
        
        // BAN解除クリック
        bannedListContainer.addEventListener('click', (e) => {
            if (e.target.classList.contains('banned-hero-item')) {
                toggleBan(e.target.dataset.heroId);
            }
        });

        // マップ選択
        mapSelector.addEventListener('change', (e) => {
            state.currentMap = e.target.value;
            triggerAnalysisUpdate();
        });

        // 全体分析ボタン
        document.getElementById('global-analysis-btn').addEventListener('click', handleGlobalAnalysis);
        
        // リセットボタン群
        document.getElementById('reset-all-btn').addEventListener('click', resetAll);
        document.getElementById('reset-heroes-btn').addEventListener('click', resetHeroes);
        document.getElementById('reset-bans-btn').addEventListener('click', resetBans);

        // タブ切り替え
        document.getElementById('tabs').addEventListener('click', (e) => {
            if (e.target.classList.contains('tab-link')) {
                switchTab(e.target.dataset.tab);
            }
        });

        // 設定変更
        document.getElementById('suggestion-count').addEventListener('change', (e) => {
            state.settings.suggestionCount = parseInt(e.target.value, 10);
            saveSettings();
            triggerAnalysisUpdate();
        });
        document.getElementById('hero-pool-checklist').addEventListener('change', (e) => {
            if (e.target.type === 'checkbox') {
                const heroId = e.target.dataset.heroId;
                if (e.target.checked) {
                    if (!state.settings.heroPool.includes(heroId)) state.settings.heroPool.push(heroId);
                } else {
                    state.settings.heroPool = state.settings.heroPool.filter(id => id !== heroId);
                }
                saveSettings();
                triggerAnalysisUpdate();
                renderPalettes();
            }
        });
        
        // データ管理
        document.getElementById('export-data-btn').addEventListener('click', exportData);
        document.getElementById('import-data-input').addEventListener('change', importData);
        document.getElementById('import-data-input').previousElementSibling.addEventListener('click', () => {
             document.getElementById('import-data-input').click();
        });
    }
    
    // --- イベントハンドラ ---
    function handleSlotClick(slotElement) {
        const team = slotElement.dataset.team;
        const index = parseInt(slotElement.dataset.index, 10);
        const currentHeroId = state[team === 'ally' ? 'allyTeam' : 'enemyTeam'][index];

        if (currentHeroId) {
            // ヒーローがセットされている -> 分析モード起動
            clearAllSuggestions();
            if (team === 'ally') {
                if (index === state.myHeroSlotIndex) { // モード1: 自己分析
                    state.activeAnalysis = { mode: 'Self-Analysis', target: { team, index } };
                } else { // モード2: 味方支援
                    state.activeAnalysis = { mode: 'Ally-Support', target: { team, index } };
                }
            } else { // モード3: 特定脅威排除
                state.activeAnalysis = { mode: 'Threat-Elimination', target: { team, index } };
            }
            runActiveAnalysis();
        } else {
            // ヒーローがいない -> 選択モードへ
            state.activeSelection = { team, index };
            renderActiveSelection();
            switchTab('heroes');
        }
    }

    function handleHeroSelection(heroId) {
        if (state.activeSelection) {
            const { team, index } = state.activeSelection;
            state[team === 'ally' ? 'allyTeam' : 'enemyTeam'][index] = heroId;
            state.activeSelection = null;
            
            triggerAnalysisUpdate();
            renderAll();
        }
    }
    
    function toggleBan(heroId) {
        const index = state.bannedHeroes.indexOf(heroId);
        if (index > -1) {
            state.bannedHeroes.splice(index, 1);
        } else {
            state.bannedHeroes.push(heroId);
        }
        triggerAnalysisUpdate();
        renderBans();
        renderPalettes();
    }
    
    function handleGlobalAnalysis() {
        clearAllSuggestions();
        state.activeAnalysis = { mode: 'Strategic-Optimization', target: null };
        runActiveAnalysis();
    }

    function triggerAnalysisUpdate() {
        // イベント発生時、アクティブな分析があれば再実行
        if (state.activeAnalysis) {
            runActiveAnalysis();
        }
        renderAll();
    }
    
    // --- 状態リセット関数 ---
    function resetAll() {
        if (!confirm('すべての設定と選択をリセットしますか？')) return;
        state.allyTeam.fill(null);
        state.enemyTeam.fill(null);
        state.bannedHeroes = [];
        state.currentMap = 'none';
        state.activeAnalysis = null;
        clearAllSuggestions();
        renderAll();
    }
    function resetHeroes() {
        state.allyTeam.fill(null);
        state.enemyTeam.fill(null);
        state.activeAnalysis = null;
        clearAllSuggestions();
        renderAll();
    }
    function resetBans() {
        state.bannedHeroes = [];
        triggerAnalysisUpdate();
    }

    // --- レンダリング（描画）関数 ---
    function renderAll() {
        renderSlots();
        renderPalettes();
        renderBans();
        renderMapSelector();
        renderSettings();
    }

    function renderSlots() {
        document.querySelectorAll('.hero-slot').forEach(slot => {
            const team = slot.dataset.team;
            const index = parseInt(slot.dataset.index, 10);
            const heroId = state[team === 'ally' ? 'allyTeam' : 'enemyTeam'][index];
            if (heroId) {
                slot.textContent = getHeroName(heroId);
                slot.classList.add('selected');
            } else {
                slot.textContent = `スロット ${index + 1}`;
                slot.classList.remove('selected');
            }
        });
        renderActiveSelection();
    }

    function renderActiveSelection() {
        document.querySelectorAll('.hero-slot').forEach(s => s.classList.remove('active-selection'));
        if (state.activeSelection) {
            const { team, index } = state.activeSelection;
            document.querySelector(`.hero-slot[data-team="${team}"][data-index="${index}"]`).classList.add('active-selection');
        }
    }

    function renderPalettes() {
        const pickedHeroes = [...state.allyTeam, ...state.enemyTeam].filter(Boolean);
        document.querySelectorAll('#hero-palette .hero-card, #ban-palette .hero-card').forEach(card => {
            const heroId = card.dataset.heroId;
            card.classList.remove('picked', 'banned');
            if (pickedHeroes.includes(heroId)) {
                card.classList.add('picked');
            }
            if (state.bannedHeroes.includes(heroId)) {
                card.classList.add('banned');
            }
        });
    }
    
    function renderBans() {
        bannedListContainer.innerHTML = '';
        state.bannedHeroes.forEach(heroId => {
           bannedListContainer.innerHTML += `<div class="banned-hero-item" data-hero-id="${heroId}">${getHeroName(heroId)}</div>`;
        });
        document.querySelectorAll('#ban-palette .hero-card').forEach(card => {
            const heroId = card.dataset.heroId;
            card.style.backgroundColor = state.bannedHeroes.includes(heroId) ? 'var(--enemy-color)' : '';
        });
    }

    function renderMapSelector() {
        mapSelector.value = state.currentMap;
    }

    function renderSettings() {
        document.getElementById('suggestion-count').value = state.settings.suggestionCount;
        document.querySelectorAll('#hero-pool-checklist input').forEach(checkbox => {
            checkbox.checked = state.settings.heroPool.includes(checkbox.dataset.heroId);
        });
    }

    function clearAllSuggestions() {
        document.querySelectorAll('.suggestion').forEach(el => {
            el.innerHTML = ''; // h4タグも含めてクリア
            el.classList.remove('show');
        });
    }

    // --- 分析ロジック ---
    function runActiveAnalysis() {
        if (!state.activeAnalysis) return;

        const { mode, target } = state.activeAnalysis;
        let scores, suggestions;

        // 1. 全ヒーローのスコアを計算
        scores = calculateAllHeroScores(mode, target);

        // 2. 提案を選出・分類
        suggestions = generateSuggestions(scores);
        
        // 3. 提案を表示
        clearAllSuggestions();
        
        // 提案は常に自分のスロットに表示する
        const mySlotWrapper = document.querySelector(`.hero-slot-wrapper[data-team="ally"][data-index="${state.myHeroSlotIndex}"]`);
        
        if (mySlotWrapper) {
            displaySuggestions(mySlotWrapper, suggestions);
        }
    }

    function calculateAllHeroScores(mode, target) {
        const scores = [];
        // 提案候補から自分自身を除外する（ヒーロー変更が前提のため）
        const myCurrentHeroId = state.allyTeam[state.myHeroSlotIndex];
        const pickedHeroes = [...state.allyTeam, ...state.enemyTeam].filter(h => h && h !== myCurrentHeroId);

        for (const candidateHero of heroesData) {
            // 提案候補ヒーローがBAN/ピック済み/自分自身なら除外
            if (state.bannedHeroes.includes(candidateHero.id) || pickedHeroes.includes(candidateHero.id) || candidateHero.id === myCurrentHeroId) {
                continue;
            }

            // --- 各スコアの計算 ---
            const myTeam = state.allyTeam.filter(h => h && h !== myCurrentHeroId); // 自分以外の味方
            const enemyTeam = state.enemyTeam.filter(Boolean);

            // 1. 対ヒーロースコア (分析モードにより変動)
            let counterScore = 0;
            switch(mode) {
                case 'Self-Analysis': {
                    const myHeroId = state.allyTeam[target.index];
                    if (!myHeroId) break;
                    const threats = enemyTeam.filter(enemyId => getCounterScore(myHeroId, enemyId) < 0);
                    counterScore = threats.reduce((sum, threatId) => sum + getCounterScore(candidateHero.id, threatId), 0);
                    break;
                }
                case 'Ally-Support': {
                    const allyHeroId = state.allyTeam[target.index];
                    if (!allyHeroId) break;
                    const threats = enemyTeam.filter(enemyId => getCounterScore(allyHeroId, enemyId) < 0);
                    counterScore = threats.reduce((sum, threatId) => sum + getCounterScore(candidateHero.id, threatId), 0);
                    break;
                }
                case 'Threat-Elimination': {
                    const enemyHeroId = state.enemyTeam[target.index];
                    if (!enemyHeroId) break;
                    counterScore = getCounterScore(candidateHero.id, enemyHeroId);
                    break;
                }
                case 'Strategic-Optimization': {
                    counterScore = enemyTeam.reduce((sum, enemyId) => sum + getCounterScore(candidateHero.id, enemyId), 0);
                    break;
                }
            }

            // 2. マップ相性スコア
            const mapScore = getMapScore(candidateHero.id, state.currentMap);

            // 3. 構成シナジースコア (自分以外の味方とのシナジー)
            const synergyScore = myTeam.reduce((sum, allyId) => sum + getSynergyScore(candidateHero.id, allyId), 0);
            
            const returnScore = counterScore + mapScore + synergyScore;

            // --- リスクと特化度の計算 ---
            const counterScoresVsEnemies = enemyTeam.map(enemyId => getCounterScore(candidateHero.id, enemyId));

            const riskScore = counterScoresVsEnemies.filter(s => s < 0).reduce((sum, s) => sum + Math.abs(s), 0);
            
            const specializationScore = calculateStandardDeviation(counterScoresVsEnemies);
            
            scores.push({
                heroId: candidateHero.id,
                return: returnScore,
                risk: riskScore,
                specialization: specializationScore
            });
        }
        return scores;
    }
    
    function generateSuggestions(scores) {
        if (scores.length === 0) return { highRisk: [], lowRisk: [] };

        const topCandidates = scores.sort((a, b) => b.return - a.return).slice(0, 6);
        if (topCandidates.length === 0) return { highRisk: [], lowRisk: [] };

        const riskMedian = calculateMedian(topCandidates.map(c => c.risk));
        const specMedian = calculateMedian(topCandidates.map(c => c.specialization));
        
        const highRisk = [];
        const lowRisk = [];

        for (const candidate of topCandidates) {
            const isLowRisk = candidate.risk <= riskMedian && candidate.specialization <= specMedian;
            if (isLowRisk) {
                lowRisk.push(candidate);
            } else {
                highRisk.push(candidate);
            }
        }
        
        highRisk.sort((a,b) => b.return - a.return);
        lowRisk.sort((a,b) => b.return - a.return);

        return { highRisk, lowRisk };
    }
    
    function displaySuggestions(slotWrapper, suggestions) {
        const { highRisk, lowRisk } = suggestions;
        const count = state.settings.suggestionCount;

        const highRiskArea = slotWrapper.querySelector('.suggestion.high-risk');
        const lowRiskArea = slotWrapper.querySelector('.suggestion.low-risk');
        
        let highRiskHTML = '<h4>【ハイリスク案】</h4>';
        highRisk.slice(0, count).forEach(s => {
            const heroName = getHeroName(s.heroId);
            const isGreyedOut = state.settings.heroPool.includes(s.heroId) ? 'greyed-out' : '';
            highRiskHTML += `<div class="${isGreyedOut}">${heroName}</div>`;
        });
        highRiskArea.innerHTML = highRiskHTML;

        let lowRiskHTML = '<h4>【ローリスク案】</h4>';
        lowRisk.slice(0, count).forEach(s => {
            const heroName = getHeroName(s.heroId);
            const isGreyedOut = state.settings.heroPool.includes(s.heroId) ? 'greyed-out' : '';
            lowRiskHTML += `<div class="${isGreyedOut}">${heroName}</div>`;
        });
        lowRiskArea.innerHTML = lowRiskHTML;
        
        if (highRisk.length > 0) highRiskArea.classList.add('show');
        if (lowRisk.length > 0) lowRiskArea.classList.add('show');
    }

    // --- データアクセス＆計算ヘルパー ---
    function getHeroName(heroId) {
        const hero = heroesData.find(h => h.id === heroId);
        return hero ? hero.name : '不明';
    }

    function getCounterScore(heroA, heroB) {
        if (countersData[heroA] && countersData[heroA][heroB] !== undefined) {
            return countersData[heroA][heroB];
        }
        if (countersData[heroB] && countersData[heroB][heroA] !== undefined) {
            return -countersData[heroB][heroA];
        }
        return 0;
    }

    function getSynergyScore(heroA, heroB) {
        if (synergyData[heroA] && synergyData[heroA][heroB] !== undefined) {
            return synergyData[heroA][heroB];
        }
        if (synergyData[heroB] && synergyData[heroB][heroA] !== undefined) {
            return synergyData[heroB][heroA];
        }
        return 0;
    }

    function getMapScore(heroId, mapId) {
        if (mapsData[mapId] && mapsData[mapId].heroAffinity && mapsData[mapId].heroAffinity[heroId] !== undefined) {
            return mapsData[mapId].heroAffinity[heroId];
        }
        return 0;
    }
    
    function calculateMedian(arr) {
        if (arr.length === 0) return 0;
        const sorted = [...arr].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    }
    
    function calculateStandardDeviation(arr) {
        if (arr.length < 2) return 0;
        const n = arr.length;
        const mean = arr.reduce((a, b) => a + b) / n;
        const variance = arr.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
        return Math.sqrt(variance);
    }
    
    // --- パーソナライズ機能 ---
    function saveSettings() {
        localStorage.setItem('owAnalyzerSettings', JSON.stringify(state.settings));
    }

    function loadSettings() {
        const saved = localStorage.getItem('owAnalyzerSettings');
        if (saved) {
            state.settings = JSON.parse(saved);
        }
    }

    function switchTab(tabId) {
        document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
        document.querySelectorAll('.tab-link').forEach(l => l.classList.remove('active'));
        document.getElementById(`${tabId}-tab`).classList.add('active');
        document.querySelector(`.tab-link[data-tab="${tabId}"]`).classList.add('active');
    }
    
    function exportData() {
        const dataToExport = {
            counters: countersData,
            synergy: synergyData,
            maps: mapsData
        };
        const dataStr = JSON.stringify(dataToExport, null, 2);
        const blob = new Blob([dataStr], {type: "application/json"});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'ow_analyzer_data.json';
        a.click();
        URL.revokeObjectURL(url);
    }

    function importData(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const importedData = JSON.parse(e.target.result);
                if (importedData.counters && importedData.synergy && importedData.maps) {
                    if (confirm('現在の相性・シナジー・マップデータをインポートしたデータで上書きしますか？')) {
                        countersData = importedData.counters;
                        synergyData = importedData.synergy;
                        mapsData = importedData.maps;
                        // UI再描画
                        populateMapSelector();
                        triggerAnalysisUpdate();
                        alert('データのインポートが完了しました。');
                    }
                } else {
                    alert('無効なファイル形式です。');
                }
            } catch (error) {
                alert('ファイルの読み込みに失敗しました: ' + error.message);
            }
        };
        reader.readAsText(file);
        event.target.value = '';
    }

    // --- アプリケーション起動 ---
    initializeApp();
});
