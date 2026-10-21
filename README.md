# SlideForge

Markdownを原稿として使うスライド編集アプリです。編集用データを `.sf.json` に保存し、PowerPointの読み書きと、ブラウザで見る単一HTMLへの書き出しに対応しています。

## 起動

Node.jsとnpmを用意し、このフォルダで実行します。

```powershell
npm ci
npm start
```

PowerPointの読み込みには別途OfficeCLIが必要です。`bin/README.md` の手順で配置してください。通常の編集と新規作成に必要な画面は `app/` にあります。`samples/` の2件は人工的に作った試験資料です。

## 操作と保存

原稿を入力し、スライド、文字、画像、表、グラフなどを編集します。通常保存の本体は `.sf.json` です。MarkdownやPowerPointを読み込んだ後の保存では、新しい `.sf.json` の保存先を選びます。Markdown、PowerPoint、単一HTMLは交換・配布用の形式です。

## 完成度と制約

元環境で自動確認46件とWindows配布物の組み立てが通った段階です。この公開コピーでは実行確認をしていません。PowerPoint本体での表示比較と保存後の再読込の一連操作には手動確認が残ります。動きや画面切り替え効果はPowerPointへ移さず、静止した内容として出力します。

配布物を作る場合は `npm run build` を使います。OfficeCLIを利用する構成では先に `bin/` へ本体を配置してください。Windows以外の実機確認は未実施です。

## 利用条件と第三者部品

このアプリ独自部分の再利用ライセンスは未指定です。Electron、OfficeCLI、PptxGenJSなどは各作者の成果物で、それぞれの利用条件に従います。元環境の個人情報、実資料、配布物は含めていません。
