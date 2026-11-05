# Gym Ana コード設計書

## 1. 対象と方針

本書はPWA版v38の実装構造を、ソースコードの責務、状態、データフロー、試験境界の観点で記述する。物理・観測モデルの数式と要求仕様は`SYSTEM_DESIGN.md`を正とし、本書はコードを変更するときの案内図とする。

設計上の優先順位は次の通りである。

1. 発進・停止の誤検知を避ける。
2. 走行データを端末内へ確実に保存する。
3. 端末角度、車体振動、GPS周期差を吸収する。
4. 実データへ係数を過適合させず、未知の日・車両・端末へ一般化する。

## 2. 配置構造

| パス | 責務 |
|---|---|
| `index.html` | 操作、計測値、グラフ、保存履歴のDOM |
| `styles.css` | iPhoneを主対象とした表示 |
| `app.js` | センサー取得、較正、状態推定、イベント検出、保存、出力 |
| `sw.js` | アプリシェルのキャッシュとオフライン起動 |
| `manifest.webmanifest` | PWAメタデータ |
| `tests/app-simulation-harness.mjs` | 本番`app.js`を仮想DOM、IMU、GPS、IndexedDB上で実行 |
| `tests/*.test.mjs` | 単体、合成時系列、耐性、耐久、実走回帰試験 |
| `scripts/lib/speed_filters.mjs` | オフライン比較用EKF、UKF、粒子フィルタ群 |
| `scripts/lib/model_selection.mjs` | 日単位の過学習防止・候補採否判定 |
| `scripts/evaluate_existing_runs.mjs` | 現行係数とグリッド候補の既存ログ評価 |
| `scripts/compare_speed_filters.mjs` | フィルタ方式間の同一条件比較 |
| `scripts/release_gate.mjs` | 製品ゲート実行とJSON/Markdown証跡生成 |
| `docs/generated/` | 再生成可能な評価・リリース判定結果 |

ブラウザー配布物にはビルド工程がなく、`index.html`から`app.js`を直接読み込む。解析スクリプトとテストはNode.jsでのみ実行し、iPhoneへは配布しない。

## 3. 実行時アーキテクチャ

```text
DeviceMotion / DeviceOrientation / Geolocation
                    |
                    v
        入力検証・時刻差・欠測検出
                    |
                    v
   静止較正 -> 低域通過 -> 車体座標投影
                    |
                    v
             MotionEkf (5状態)
             |             |
             v             v
       START/STOP検出   表示・グラフ
             |
             v
    prestart / run / poststop サンプル
             |
             v
        IndexedDB runs store
             |
             v
          CSV / JSON出力
```

`app.js`は単一モジュールである。実クラスは`MotionEkf`だけで、画面制御、状態機械、保存は関数群と共有`state`オブジェクトで構成する。処理周期の主導権は`devicemotion`イベントにあり、GPSは非同期観測としてEKFと停止根拠へ入力される。

## 4. 主要コード責務

| 領域 | 主な関数・クラス | 入出力・副作用 |
|---|---|---|
| 状態推定 | `MotionEkf.predict/correct/updateGpsSpeed/zeroSpeed` | 速度、前後G、左右G、ヨー、バンクと共分散を更新 |
| センサー寿命 | `requestSensors`、`enableSensors`、`disableSensors` | iOS許可、リスナー、GPS watchを管理 |
| IMU入口 | `onDeviceMotion`、`onDeviceOrientation` | 欠測検出、較正、投影、状態更新、保存を駆動 |
| 較正 | `startCalibration`、`collectCalibrationSample`、`evaluateCalibration`、`finishCalibration` | バイアス、重力軸、振動プロファイルを生成 |
| 車体座標 | `calibrateAndProjectSample`、`maybeLockForwardAxis` | 端末3軸を前後・左右・鉛直へ投影 |
| 振動抑制 | `filterEngineVibration`、`applyDeadband` | 一次低域通過と個体別不感帯を適用 |
| 計測状態 | `armTimer`、`startRun`、`stopRun`、`detectEvents` | `sensor-on`、`armed`、`running`、`stopped`を遷移 |
| GPS | `startGps`、`onGpsPosition`、`gpsStopEvidence`、`resyncSpeedFromGps` | 新鮮度、重複時刻、速度外れ値、位置滞留を判定 |
| サンプル | `buildRawSample`、`storePreStartSample`、`storeRawSample`、`capturePostStopSamples` | 診断区間を含むschema 8行を生成 |
| 品質判定 | `assessRunQuality` | GPS、IMU周期、欠測、較正、外れ値から走行品質を判定 |
| 永続化 | `openDb`、`runDbOperation`、`queueRunSave`、`checkpointCurrentRun`、`dbPutMany` | IndexedDB再接続、直列保存、走行中チェックポイント、復元の一括保存 |
| 履歴・出力 | `loadRuns`、`renderHistory`、`selectedRuns`、`runsToCsv`、JSON出力関数 | 選択走行の出力・削除 |
| 中断 | `handleAppBackground` | PWA実行停止前に走行または待機診断を保存 |

## 5. 状態モデル

`state`は実行時の唯一の共有状態であり、次の領域に分かれる。

| 領域 | 代表フィールド |
|---|---|
| 状態機械 | `mode`、`measurementMode`、`autoMeasurementEnabled`、`startedAt`、`stoppedAt` |
| 較正・座標 | `calibrationState`、`gravityVector`、`forwardVector`、`lateralVector`、`bikeProfile` |
| 推定値 | `speedMs`、`longG`、`latG`、`yawRate`、`bankDeg`、`kalmanVariance` |
| GPS | `gpsSpeedMs`、`gpsAccuracyM`、`gpsTimestampMs`、`gpsObservationSequence`、`gpsObservations` |
| STOP根拠 | `gpsStopEvidence`、`gpsStopDwellMs`、`gpsStopDisplacementM`、`gpsStopLatch` |
| 記録 | `preStartSamples`、`rawSamples`、`events`、`postStopCaptures`、`currentRunId` |
| 保存 | `savedRuns`、`storageAvailable`、`selectedRunIds`、`lastCheckpointAt` |

状態遷移は次の不変条件を守る。

- `sensor-on`では推定速度を積分せず、走行サンプルも作らない。
- `armed`は較正完了かつ新鮮なGPS静止確認後だけSTART可能となる。
- `running`の自動STOPには低運動、直前の減速、複数GPS観測、位置滞留を要求する。
- Sensor OFFまたは画面中断では進行中データを保存してから取得を止める。
- STOP後診断は走行集計へ混ぜず、最大5秒を別phaseで追記する。

## 6. 推定器インターフェース

`MotionEkf`の状態ベクトルは`[speedMs, longG, latG, yawRate, bankDeg]`である。`predict(dt, measurement)`が物理モデルを進め、`correct(measurement)`がIMUを観測更新し、`updateGpsSpeed(speedMs, accuracyM, derived)`がGPS速度をスカラー更新する。

外れ値はinnovation gateで残差を制限し、共分散はJoseph形式で更新する。GPS欠測時はIMUで予測を継続するが、センサー間隔が0.5秒を超えた場合は積分を連結せず、次の有効GPSで再同期する。停止時は`zeroSpeed()`で速度を0へ拘束する。

UKF、バイアスEKF、粒子フィルタは比較用実装であり、本番経路には入っていない。未知データへの改善が証明されるまで、計算量の大きい方式へ置換しない。

## 7. データ設計

走行オブジェクトはID、版、開始・終了時刻、計測方式、較正品質、イベント、サンプルを保持する。サンプルは`prestart`、`run`、`poststop`のphaseを持ち、走行開始前後の判定根拠を同じschemaで監査できる。

v37の走行オブジェクトは`quality`に`good`、`review`、`invalid`、`diagnostic`の状態、0〜100点、理由コード、品質指標を保持する。判定対象は走行中サンプルだけとし、GPS被覆率、GPS観測数と精度、IMU周期P95、センサー欠測、較正結果、GPS/IMU外れ値率、正常終了を評価する。品質が低くても原本は削除せず、解析・学習へ投入する前の選別情報として扱う。品質点は入力データの健全性であり、タイムや速度の正確さを保証する精度点ではない。

保存は`queueRunSave`で直列化し、同じ走行のSTOP保存とSTOP後追記の競合を防ぐ。15秒ごとのチェックポイントはSafari中断時の損失範囲を制限する。最大サンプル数は1走20,000件で、容量はIndexedDBと端末空き容量に依存する。

v38のJSONバックアップは`backupVersion`、アプリ版、schema版、出力日時、走行配列を持つ。復元時はJSON構造、日時、計測時間、schema版、走行数、サンプル数を検証し、同じ走行IDは既存データを優先してスキップする。複数走行は1つのIndexedDBトランザクションで保存し、未来schemaは解釈せず拒否する。Storage Estimate APIが利用可能な場合は、オリジン全体の使用量と上限を履歴欄へ表示する。

CSV/JSONには位置情報を含み得る。ブラウザーからサーバーへ自動送信はしないが、公開リポジトリへ実走原本を登録しない。回帰試験には絶対時刻と座標を除いた匿名fixtureだけを使う。

## 8. 過学習防止設計

候補モデルの採用単位はサンプル行ではなく走行日である。同一日の連続点を訓練と評価へ無作為分割すると、道路、取付、GPS状態が重複して精度を過大評価するためである。

`evaluateGeneralization`は次をすべて満たした候補だけを採用する。

1. 5日以上かつ12走以上の評価データがある。
2. 全データで現行よりRMSEを10%以上改善する。
3. 最終的に配布する同一候補が、どの日も悪化させない。
4. 日付leave-one-outの入れ子評価で5%以上改善し、悪化日がない。
5. 最新20%の日付を完全に隔離した時系列ホールドアウトで改善する。
6. 日付単位2,000回ブートストラップの改善率95%下限が0を超える。入力には、各日を隠して選択した候補のout-of-fold結果だけを使う。

候補探索と評価を分離するため、leave-one-date-outでは各foldの訓練日のみで候補を選ぶ。最終候補の全日評価も別に保持し、foldごとに異なる都合のよい候補と混同しない。ブートストラップもこのout-of-fold列を日付単位で再標本化するため、全データで選んだ候補を同じデータで再評価する選択バイアスを持ち込まない。乱数seedは固定し、同じ入力から同じ判定を生成する。

2026-11-03時点の26走・8日評価では、EKF係数候補、UKF、物理UKF、バイアスEKF、粒子フィルタの全候補がこのゲートを通過しなかった。したがって本番は現行`MotionEkf`を維持する。

## 9. 試験境界

| 試験 | 保証する範囲 |
|---|---|
| `motion-model.test.mjs` | 数値安定性、較正、schema、主要モデル回帰 |
| `model-selection.test.mjs` | 汎化改善候補の採用、最新日悪化候補とデータ不足の拒否 |
| `automatic-timing.simulation.test.mjs` | 本番コードの状態遷移と主要異常系 |
| robustness / endurance | 周期・振動・GPS条件分布と連続保存 |
| `recorded-log-regression.test.mjs` | 匿名実走ログの固定回帰 |
| 既存ログ再評価 | 日をまたぐ速度精度と方式比較 |
| iPhone閉鎖コース試験 | 実GPS、取付共振、iOS中断、操作性 |

合成試験合格は実機品質の代替ではない。リリース状態はソフトウェアゲートとフィールドゲートを分離して表示する。

## 10. 変更手順

推定係数またはフィルタ方式を変更するときは、次の順序を守る。

1. 新候補を本番とは別の解析モジュールへ実装する。
2. 単体試験と固定seed合成試験を追加する。
3. 既存全ログを日単位で評価し、四重の汎化ゲートを通す。
4. 本番`app.js`へ最小変更で移植する。
5. `npm test`と`npm run test:product`を実行する。
6. 閉鎖コースで連続3走し、START、STOP、保存、再待機を確認する。

## 11. 既知の設計負債

- `app.js`がセンサー、推定、UI、保存を含むため変更影響が広い。次の大規模改修では、純粋な推定器、状態機械、保存adapter、UI controllerへ分割する。
- PWAはiOSバックグラウンド継続を保証できない。製品版はSwift/SwiftUI、Core Motion、Core Locationへ移植する。
- 現在のデータは主に1台のバイクと限られた端末・取付条件である。係数の追加調整より先に車両差・端末差の検証を増やす。
- GPSを正解値として使うため、急旋回やマルチパスでは正解側にも誤差がある。最終的な時刻精度評価には動画または外部計時基準を併用する。
