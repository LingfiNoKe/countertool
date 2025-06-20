# Hero Pick Tactical Analyzer

## 1. このツールについて

本ツールは、あらゆるプレイヤーの戦術的思考を支援するために設計された、ブラウザベースの分析プラットフォームです。

*   **初心者の方へ**: 「カウンターは知っているけど、どのタイミングで誰に変えればいいか分からない」という、**ピック選択の複雑なジレンマ**を解決する、頼れるガイドとなります。
*   **中級者・上級者の方へ**: あなたの経験と知識を`json`データとして反映させることで、チーム構成の優劣を数値で議論したり、新しい戦略をシミュレーションしたりするための、**強力な分析ツール（サンドボックス）**となります。

このツールは、単に「答え」を教えるのではなく、あなたの**「意思決定」**そのものを、より深く、より論理的なものへと進化させます。

## 2. ツールが解決する課題

「この敵には、このヒーローがカウンターだ」という1対1の関係は、多くのプレイヤーが知っています。
しかし、実際の試合はもっと複雑です。

*   ある敵へのカウンターとしてヒーローを変更した結果、**別の敵に対して無防備になってしまう。**
*   チーム全体の**シナジーや、マップとの相性**を考慮すると、本当にそのピックが最善手なのか確信が持てない。

本ツールは、これらの複雑な要素をリアルタイムで分析し、各選択肢が持つ**「リターン（有効性）」**と**「リスク（全体への影響）」**を客観的なデータとして提示することで、あなたの戦術的判断を支援します。

## 3. 使い方

1.  **【状況入力】**
    *   **[BAN]** タブでBANヒーローを、画面右上で**マップ**をそれぞれ設定します。
    *   左右のスロットをクリックし、**[キャラ]** タブから味方と敵のヒーローを配置します。

2.  **【提案の確認】**
    *   ヒーローが配置されると、各スロットの隣にリアルタイムで提案が表示されます。提案は常に**「有効性（リターン）」が高い順**に並んでいます。
    *   各提案には、チーム全体への影響を示す**「安定」**または**「挑戦」**のタグが付きます。

3.  **【意思決定】**
    *   ツールが示す客観的なデータを元に、あなたの経験と判断で、最善の一手を選択してください。

## 4. 各分析モードの目的とリターンスコア

各提案の表示順は、**「リターンスコア」**によって決定されます。このスコアは、分析モードごとに異なる計算式で算出されます。

**基本式:** `リターンスコア = カウンタースコア + マップスコア + シナジースコア`

---

#### **自己分析 (Self-Analysis) / 味方支援 (Ally-Support)**
*   **目的**: 対象の味方（自分含む）をカウンターしている**特定の敵グループ**への対策。
*   **カウンタースコアの計算**:
    1.  まず、分析対象の味方をカウンターしている敵を全てリストアップします。
    2.  その**リストアップされた敵全員**に対する、提案候補ヒーローのカウンタースコアを**合計**したものが、このモードの「カウンタースコア」となります。
*   **発動条件**: 対象の味方をカウンターしている敵が1人以上いる場合にのみ、提案が表示されます。

---

#### **特定脅威排除 (Threat-Elimination)**
*   **目的**: **特定の敵ヒーロー1体**への対策。
*   **カウンタースコアの計算**:
    1.  分析対象の敵ヒーロー、ただ1体に対する提案候補ヒーローのカウンタースコアが、そのままこのモードの「カウンタースコア」となります。

---

#### **戦略的最適化 (Strategic-Optimization)**
*   **目的**: **敵チーム全体**への対策。
*   **カウンタースコアの計算**:
    1.  **敵チームの全ヒーロー**それぞれに対する、提案候補ヒーローのカウンタースコアを**合計**したものが、このモードの「カウンタースコア」となります。

---

## 5. 提案の補足情報と最終順位

#### 「安定／挑戦」タグの判定
提案の横に表示されるタグは、そのピックがチーム全体に与える影響を示します。この判定は、チーム間の全体的な力関係を示す**「戦力差スコア」**に基づいて行われます。

*   **チーム総合力の算出**
    まず、各チームの総合的な戦闘力を、以下の式で数値化します。
    `チーム総合力 = (チーム内シナジーの合計) + (チームのマップ適性の合計) + (敵チーム全員に対するカウンタースコアの合計)`

*   **戦力差スコアの算出**
    次に、両チームの総合力の差を計算します。
    `戦力差スコア = (味方チーム総合力) - (敵チーム総合力)`

*   **戦力差スコアの変動値(Delta)の算出**
    あなたがヒーローを変更した場合に、この「戦力差スコア」がどれだけ変動するかを計算します。これがDeltaです。
    `Delta = (変更後の戦力差スコア) - (変更前の戦力差スコア)`

*   **タグの決定**
    *   `Delta >= 0`（戦況が好転、または維持される）場合、その提案は**【安定】**と判定されます。
    *   `Delta < 0`（戦況が悪化する）場合、その提案は**【挑戦】**と判定されます。(注: この場合でも、特定の脅威に対するリターンが非常に高いため、戦術的価値がある可能性があります)

#### 最終的な表示順位の決定
提案リストは、以下の複合的なルールに基づいて、最終的な表示順位が決定されます。

1.  **第一評価軸**: まず、「リターンスコア」が高い順に並べ替えます。
2.  **第二評価軸**: もしリターンスコアが**同点だった場合**に限り、「戦力差スコアの変動値(Delta)」が大きい順（よりチームに貢献する順）に並べ替えられます。

## 6. 戦況の可視化：カウンター関係図

全ヒーローが選択されると、中央パネルが自動的に**「カウンター関係図」**に切り替わります。
チーム間の複雑な有利・不利関係が**矢印**で視覚化され、戦況を一目で把握できます。

## 7. ユーザーによるデータカスタマイズ

本ツールは、分析の根幹となる各種データをユーザー自身が編集・管理することを前提に設計されています。
**[設定]**タブの**「データ管理」**セクションから、以下の4つの`json`ファイルについて、個別のインポート／エクスポートが可能です。

*   **`heroes.json`**: ヒーローの基本情報（ID, 名称, ロール）を定義します。
*   **`counters.json`**: ヒーロー間の有利・不利関係を定義します。
*   **`synergy.json`**: ヒーロー間のシナジーを定義します。
*   **`maps.json`**: マップとヒーローの相性を定義します。

## 8. データファイル仕様

*   **`counters.json` (非対称関係の定義)**
    *   `Score(A vs B)`は、まず`counters.A`内を探し、見つかればその値を採用します。
    *   見つからなければ`counters.B`内を探し、見つかればその値の**符号を反転**させて採用します。
    *   両方に定義すれば、より複雑な非対称関係を表現できます。
*   **`synergy.json` (対称関係の定義)**
    *   `Synergy(A with B)`は、まず`synergy.A`内を探し、見つかればその値を採用します。
    *   見つからなければ`synergy.B`内を探し、見つかればその値を**そのまま（符号は反転せず）**採用します。

## 9. その他の設定項目

**[設定]**タブでは、以下の項目もパーソナライズできます。設定はブラウザのローカルストレージに自動で保存されます。

*   **チーム人数**: 1チームあたりのプレイヤー数を3人から8人の間で設定します。
*   **ロール最大数設定**: 各ロールのチーム内での最大人数を制限します。
*   **ヒーロー選択ルール**: チーム内でのヒーローの重複選択を許可するかどうかを設定します。
*   **提案表示数**: 各提案エリアに表示されるヒーローの最大数を設定します。
*   **ヒーロープール**: 分析から除外したいヒーローを指定します。指定されたヒーローは提案から除外されるのではなく、**順位はそのままにグレーアウト表示**されます。
