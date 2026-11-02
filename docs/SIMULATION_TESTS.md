# 自動計測シミュレーション試験

## 1. 目的

実走前に、自動START・STOPの状態機械とセンサーモデルの回帰を再現可能な条件で検出する。試験は本番の`app.js`を仮想iPhone環境へ読み込み、60 Hzのモーション値とGPS値を時系列で入力する。試験用に複製した判定アルゴリズムは使用しない。

## 2. 実行方法

```powershell
npm test
```

単体回帰だけを実行する場合は`npm run test:unit`、自動計測シミュレーションだけを実行する場合は`npm run test:simulation`を使う。外部CSV、GoPro、ネットワーク、実機は不要である。Assertionが1件でも不成立なら終了コード1となる。

```powershell
npm run test:robustness
npm run test:stop-robustness
npm run test:endurance
npm run test:soak
npm run test:stop-soak
npm run test:recorded
npm run release:gate
```

`test:robustness`は固定seedでSTART 24条件を生成する。サンプリング周期30〜100 Hz、取付方向、アイドリング振動、GPS更新間隔、発進Gを変化させ、誤START 0件、未検知0件、START遅延P95 300 ms以下を要求する。`test:stop-robustness`はSTOP 36条件でGPS 0の3連続バーストと重複、3.2秒のGPS欠測、徐行、位置ノイズ、完全停止、再待機、STOP後保存を検証する。誤STOP、未検知、再待機失敗、保存失敗0件、STOP遅延P95 5.5秒以下が合格条件である。`test:recorded`は位置と絶対時刻を除去した10月18日の実車ログを監査する。

`test:soak`はSTART分布を200条件へ拡大し、`test:stop-soak`はSTOP分布を別seedの120条件へ拡大する。v34のSTOP長時間試験は誤STOP、未検知、再待機失敗、保存失敗0件、STOP遅延P95 2.956秒、最大3.367秒だった。通常のリリースゲートはSTART 24条件とSTOP 36条件を再実行し、長時間結果を追加証跡として読み込む。

`test:endurance`は30、60、100 Hzで各8走、合計24走をボタン再操作なしで連続実行する。走行IDの一意性、IndexedDBの全件保持、自動再待機、次走と重なるSTOP後5秒保存、前走集計への混入がないことを要求する。

## 3. 合成シナリオと合格基準

| シナリオ | 入力 | 合格基準 |
|---|---|---|
| エンジン振動中の静止 | GPS 0、24 Hz振動を5秒 | 誤START 0件、発進待ちを維持 |
| 走行中にAuto ON | GPS 21.6 km/h、加速度あり | 静止確認せずSTARTしない |
| GPS未取得 | 静止IMUを3.2秒 | 発進可能状態にならない |
| GPS重複・逆行 | 同一時刻10回、逆行時刻1回 | EKF速度と観測通番を更新しない |
| 未発進終了 | STARTせずAuto OFF | 直前データを`no-start`として保存し、座標を含めない |
| 通常発進 | 0.28 Gを継続 | START検出300 ms以内 |
| 短時間停止 | GPS 0、低運動500 ms | STOPせず走行を維持 |
| 正式停止 | 複数GPS低速、位置滞留、低運動 | 約2.9〜3.5秒でSTOPし、候補先頭へ終了時刻を戻す |
| GPS 0誤報 | 走行中に3回連続・重複したGPS 0 | 位置移動を根拠にSTOPしない |
| GPS欠測 | 走行中にGPSを3.2秒停止 | IMUだけで誤STOPしない |
| 低速徐行 | GPS 1.8〜2.8 km/h、位置は継続移動 | STOPしない |
| STOP後診断 | STOP後に5秒間センサー継続 | `poststop`保存、走行集計から除外 |
| 連続2走 | STOP後に静止、再発進 | 保存1件、Auto再待機、操作なしで2走目START |
| Sensor OFF | Auto走行中にセンサー停止 | 走行を保存し、Autoを解除して再待機しない |
| 取付方向3種 | 画面上、横向き、縦向き | 全方向でCalibrationとSTARTが成立 |

START検出上限300 msは、100 msの前方向確定と100 msのSTART保持、および60 Hz量子化の余裕を含む。STOPは誤停止防止の950 ms保持を維持し、記録上の終了時刻は停止候補の先頭に戻す。

## 4. 試験の層

| 層 | コマンド・方法 | 確認対象 |
|---|---|---|
| 単体回帰 | `npm run test:unit` | Joseph共分散更新、フィルタ、較正、CSV、イベント |
| 合成時系列 | `npm run test:simulation` | START/STOP状態遷移、振動、GPSガード、連続走行、取付方向 |
| START耐性 | `npm run test:robustness` | 24条件の誤検知、未検知、P95遅延 |
| STOP耐性 | `npm run test:stop-robustness` | 36条件のGPS誤報、徐行、停止、再待機、保存 |
| 連続走行耐久 | `npm run test:endurance` | 3サンプル周期、合計24走の保存競合と再待機 |
| 長時間耐性 | `npm run test:soak`、`npm run test:stop-soak` | START 200条件、STOP 120条件 |
| 匿名実走固定データ | `npm run test:recorded` | 10月18日の正常START/STOP、GPS速度、停止候補 |
| 既存ログ再生 | `npm run evaluate:existing -- --root <データルート> --json <出力JSON>` | 複数日の速度誤差、候補係数の過学習 |
| iPhone実機 | 閉鎖コースで定型手順 | iOS権限、実振動、GPS遅延、取付、保存、画面動作 |

## 5. 限界

合成試験は判定ロジックの再現性を保証するが、iPhone固有のセンサーノイズ、Safari/PWAの停止、GPSマルチパス、取付部の共振は再現しない。したがって製品リリース判定では、合成試験合格に加えて既存ログ再生と実機試験が必要である。

## 6. 実機試験への昇格条件

1. `npm test`が全件合格する。
2. `npm run test:robustness`で誤START・未検知が0件、P95遅延300 ms以下となる。
3. `npm run test:stop-robustness`で誤STOP・未検知・再待機失敗・保存失敗が0件、P95遅延5.5秒以下となる。
4. 匿名実走固定データと既存ログ評価で現行モデルを悪化させない。
5. `npm run test:endurance`で24走すべてが一意に保存される。
6. 実機で静止30秒の誤STARTが0件である。
7. 連続3走すべてでSTART・STOP・再待機・保存が成立する。
8. START時刻を動画または目視基準と比較し、遅延300 ms以内を目標とする。
