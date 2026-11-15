# CI/CD・ログ設計

更新日: 2026-11-09
対象: Moto Gym Ana v44 / ログ schema 11

## 結論

| 領域 | 状態 | 内容 |
|---|---|---|
| ローカル自動試験 | 構築済み | 単体、決定論シミュレーション、耐性、実走回帰、製品ゲート |
| GitHub CI | 構築済み | push / pull requestで`pnpm test`と`pnpm run test:product`を実行 |
| GitHub Pages CD | 構築済み | mainの製品ゲート合格後だけPWAを配信 |
| 走行・センサーログ | 構築済み | IndexedDB、CSV/JSON出力、品質評価、診断区間 |
| CI証跡 | 構築済み | リリース判定JSON/Markdownを30日間Artifact保存 |
| 遠隔クラッシュ監視 | 未構築 | PWA単体ではiOSバックグラウンド終了を確実に収集できない |
| サーバー集中ログ | 意図的に未構築 | 現版はオフライン優先で、位置・走行データを外部送信しない |

## CI

`.github/workflows/ci.yml`が次を実行する。

1. Node.js 22とpnpm 10を準備する。
2. lockfile固定で依存関係を導入する。
3. 単体、シミュレーション、実走固定回帰を実行する。
4. 製品リリースゲートを実行する。
5. 判定JSONとMarkdownをGitHub Actions Artifactへ保存する。

CI合格は、ソフトウェア回帰がないことを示す。iOSのバックグラウンド停止、GPSマルチパス、取付共振は再現できないため、実機フィールドゲートは別に残す。

## CD

`.github/workflows/pages.yml`はmain更新時に同じ製品ゲートを再実行する。合格した場合だけ、次のPWAファイルをGitHub Pagesへ公開する。

- `index.html`
- `styles.css`
- `app.js`
- `manifest.webmanifest`
- `icon.svg`
- `sw.js`

GitHubリポジトリのSettings > Pages > Build and deploymentでSourceを**GitHub Actions**に設定する必要がある。配信先は`https://anyspoc.github.io/motogym_ana/`である。

## アプリログ

アプリは1走行を1つの構造化オブジェクトとしてIndexedDBの`runs`へ保存する。

| 区分 | 主な内容 |
|---|---|
| 識別 | run ID、開始・終了UTC、アプリ版、schema版 |
| 較正 | 重力方向、前後・左右軸、ジャイロbias、車体振動profile、較正品質 |
| events | ARM、START、STOP、ACCEL、BRAKE、TURN、BANK、GAP、SYNC、SAVE、INTERRUPT |
| samples | G、速度、GPS、姿勢、角速度、分散、振動、innovation clipping、観測時刻 |
| diagnostics | START確定遅延、preflight、発進前5秒、STOP後5秒、保存状態 |
| quality | good / review / invalid / diagnostic、0〜100点、理由コード、品質指標 |

走行中は15秒ごとにcheckpoint保存し、STOP時は即時保存した後に5秒の診断tailを追記する。保存処理は直列queue化し、IndexedDB接続失敗時は1回再接続する。

## 保持とプライバシー

- 1走行あたり最大20,000 raw samples。
- 約30 Hzなら約11分相当。
- iOSの容量逼迫時にWebストレージが消える可能性がある。
- 重要な走行は選択JSONまたはCSVで端末外へバックアップする。
- 発進待ち中の位置座標は保存しない。
- GitHubへraw CSV、GPX、MP4、位置情報を登録しない。

## 未実装の運用監視

現在のログは解析・再現用であり、製品運用の遠隔監視ではない。App Store版では次を別途設計する。

1. Apple MetricKit / OSLogによるクラッシュ・ハング・電力診断。
2. 利用者同意を前提にした匿名エラーコード送信。
3. 位置・rawセンサーを既定で送信しないprivacy設計。
4. schema移行、保持期間、削除要求、暗号化、アクセス監査。
5. リリース版、iOS版、端末機種ごとの成功率ダッシュボード。

## ローカル確認

```powershell
cd C:\app\gym_ana\repo
pnpm test
pnpm run test:product
node server.mjs
```

解説画面:

```text
http://127.0.0.1:4173/docs/architecture_explorer.html
```

Notebookは`notebooks/gym_ana_architecture.ipynb`をVS CodeまたはJupyterで開く。
