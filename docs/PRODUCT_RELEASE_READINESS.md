# 製品化判定

## 現在の判定

|提供形態|判定|理由|
|---|---|---|
|開発者自身の実走試験|可|ソフトウェア試験合格、ログ保存と解析が可能|
|少人数の閉鎖コース限定ベータ|条件付き可|v28で連続3走の実機ゲート合格後|
|一般向け有料PWA|不可|バックグラウンド継続、保存保証、端末差の検証が不足|
|App Store製品版|不可|ネイティブiOS版、申請資料、プライバシー対応が未実装|

自動START/STOPの中核ロジックは製品候補まで進んでいる。しかし、2026-10-19の最新実走は旧形式で記録され、v28の発進前診断、GPS外れ値保護、連続再待機、保存ゲートはまだ実車確認されていない。したがって、現時点で一般販売開始とは判定しない。

## 合格済み

- 決定論シナリオ10件。エンジン振動、保存不可、走行中Auto、GPSなし、古いGPS、連続2走、3方向取付を含む。
- 200条件耐性試験。誤START 0件、未検知0件、START遅延P95 289 ms。
- 10月19日実走のSTART時GoPro GPS 0.32 km/h、STOP時0.20 km/h。
- 5日分9走行の再シミュレーションで、現行係数を超える再現可能な候補なし。
- v28で走行前ゲート、GPS観測時刻検査、GPS外れ値保護、端末保存検査、実行版表示を追加。

## 一般販売前の必須ゲート

1. v28を表示したiPhoneで閉鎖コースを連続3走する。
2. 3走すべてでSTART、STOP、自動再待機、IndexedDB保存を成功させる。
3. 各CSVで`app_version=v28`、`schema_version=3`、発進前サンプル約300件、センサー欠測0件を確認する。
4. 異なる取付方向2種類、異なる車両または振動条件2種類、iPhone機種2種類以上で再現する。
5. 30分静止試験で誤START 0件、20走で未検知0件、START誤差P95 300 ms以内を確認する。
6. 容量不足、権限拒否、GPS不良、電話着信、画面ロック、アプリ中断からの復帰を実機確認する。

## App Store版の実装方針

PWAは画面切替時にJavaScript実行が停止し得るため、ナビ併用を保証できない。製品版はSwift/SwiftUIでCore MotionとCore Locationを使用し、既存の判定モデルとCSV/JSON形式を移植する。単純なWebView包装では、バックグラウンド動作の改善にならず、App Storeの最低機能要件にも弱い。

ネイティブ版で必要な機能:

- Core Motionによる一定周期の加速度・ジャイロ・姿勢取得。
- Core LocationによるGPS速度、精度、観測時刻の取得。
- 走行中断、バックグラウンド、権限変更、端末温度・電池消費の管理。
- Core Dataまたはファイルによる原子的保存、共有シート出力、容量管理。
- 初回説明、安全注意、閉鎖コース用途、プライバシーポリシー、問い合わせ先。
- TestFlight配布、クラッシュ収集、対応iPhoneとiOS版の試験表。

Appleは通常バックグラウンド中のアプリを停止し、許可された用途だけにBackground Modesを認めている。位置情報バックグラウンドを使う場合も用途の正当性、電池消費、権限説明が必要である。またApp Store申請にはプライバシーポリシーURLとデータ取扱い申告が必要で、単なる再包装Webサイトではなく十分なアプリ機能が求められる。

参考:

- [Apple: Configuring background execution modes](https://developer.apple.com/documentation/Xcode/configuring-background-execution-modes)
- [Apple: Core Motion](https://developer.apple.com/documentation/coremotion/)
- [Apple: App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [Apple: Manage app privacy](https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy/)

## 最短の販売順序

1. v28実機ゲートを完了し、無料の招待制PWAベータを開始する。
2. 5から10人の競技利用者から20走以上を収集し、端末差と車両差を固定試験へ追加する。
3. 同時にネイティブiOS MVPを作り、TestFlightで有料化前の品質確認を行う。
4. 誤計測率、未検知率、データ消失率を受入基準内にした後、買い切りまたはサブスクリプションを決めてApp Store申請する。

現実的な目安は、閉鎖ベータ開始まで1から2回の走行日、ネイティブMVPまで4から8週間、その後の複数端末試験と申請準備に2から4週間である。これは開発工数の目安であり、App Review期間は含まない。
