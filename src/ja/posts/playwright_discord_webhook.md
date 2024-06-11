---
title: 当日の新作アニメの放送情報を Playwright で解析し、Discord へ送信します
description: Python を使って Playwright パッケージを利用し、アニメ放送情報を解析して Discord の Webhook 機能を使って送信する方法。
date: 2024-06-11
tags:
    - ja_posts
    - discord
    - webhook
    - playwright
    - web_crawler
---

## 効果

<p align="center" width="100%">
    <img width=100% src="https://static-resource.jhongwashere.com/Discord-anime-infomation.gif" alt="master_switch_problem">
</p>
<p align="center">
    ▲ The effect on Discord when the program executed
</p>

&emsp;&emsp;毎日は当日の新作アニメの放送情報を Discord でメッセージとして送信ことができます！

## 背景

&emsp;&emsp;毎朝起きて、その日の新作アニメの放送情報を受け取れたら便利だと思いませんか？

&emsp;&emsp;私は新作アニメを見るとき、放送が終了してから一気に全話を視聴するのが好きです。しかし、放送終了の情報を得るためには自分でグーグル検索をしたり、アニメ情報サイトを見に行く必要があります。すべての新作アニメが同じ日に放送終了するわけではないため、このプロセスは毎シーズン面倒に感じていました。そこで、自宅サーバーの上でクローラープログラムを作成し、毎日自動的に情報を受け取ることを思いつきました。

## Discord のテキストチャンネルの Webhook URL の取得

&emsp;&emsp;ここでは、使いやすい通信ツールとして Discord を選びます。まず、新しいテキストチャンネルを作成し、下記の図の操作手順に従って BOT の Webhook URL を取得します：

<p align="center" width="100%">
    <img width=80% src="https://static-resource.jhongwashere.com/Discord-edit-text-channel.jpg" alt="Discord-edit-text-channel">
</p>
<p align="center">
    ▲ Edit Text Channel on Discord
</p>

<p align="center" width="100%">
    <img width=100% src="https://static-resource.jhongwashere.com/Discord-integrations-webhook.jpg" alt="Discord-integrations-webhook">
</p>
<p align="center">
    ▲ How to view webhooks on the text channel
</p>

<p align="center" width="100%">
    <img width=100% src="https://static-resource.jhongwashere.com/Discord-integrations-new-webhook.jpg" alt="Discord-integrations-new-webhook">
</p>
<p align="center">
    ▲ How to copy webhook's URL
</p>

## Python で Playwright を使ったプログラムの作成

&emsp;&emsp;コードは[こちら](https://github.com/JhongLin/anime-launch-info/blob/97d0e9e0676fbcb4b188c01ac5be1579319211e5/main.py)。

&emsp;&emsp;取得した Webhook URL をコード内の `your_webhook_url` に置き換えるだけで利用できます。毎朝通知を受け取りたい場合は、サーバーの上で `cron` を使って script を実行することができます。私は毎朝七時に設定しました：

```bash
0 7 * * * user bash your_script.sh
```

### Playwright パッケージのインストール

- `pip install pytest-playwright`
- `playwright install`

### コードの説明

#### 関数 send_discord_message

&emsp;&emsp;Discord の Webhook を利用して BOT に発言させたのは簡単です。　Webhook の URL を使用して POST リクエストを送り、メッセージの内容は JSON 形式でリクエストの Body に含めます。この JSON の書き方については、この[サイト](https://discohook.org/)の JSON Data Editor で確認できます。

<p align="center" width="100%">
    <img width=100% src="https://static-resource.jhongwashere.com/Discohook-2.jpg" alt="Discohook">
</p>
<p align="center">
    ▲ Check the format of JSON data
</p>

#### 関数 main

ここは[コード](https://github.com/JhongLin/anime-launch-info/blob/97d0e9e0676fbcb4b188c01ac5be1579319211e5/main.py)内のコメント番号に従って説明します：

1. Playwright のブラウザを使って[アニメ放送情報のサイト](https://www.posite-c.com/anime/weekly/)にアクセス。
2. 画面に表示されたテーブルデーターを選択します。
3. テーブルデーター内のアニメを解析します。

&emsp;&emsp;3.1. 同じアニメが複数の放送局で放送されてい場合、それぞれを同じアニメの下にまとめます。

&emsp;&emsp;3.2. そのアニメが再放送かどうかを確認。

&emsp;&emsp;3.3. そのアニメが新作かどうかを確認。

&emsp;&emsp;3.4. 最速放送時間と放送期間を確認。

&emsp;&emsp;3.5. 解析したデーターをメッセージにまとめます。

4. 取得したメッセージを Discord に送信します。

#### 補足

コードのライン 103：当日放送されたアニメが何話目を計算します。

コードのライン 112：放送終了日には、メッセージの最後に `(THE END)` を付けます。

最後に、一つのコツとして、ブラウザの開発者ツールで特定 element の selector をコピーすることができます：

<p align="center" width="100%">
    <img width=100% src="https://static-resource.jhongwashere.com/copy-selector.gif" alt="copy-selector">
</p>
<p align="center">
    ▲ How to copy the selector for using in Playwright
</p>

これを早く知っていれば、たくさんの時間を節約できたのにね。
