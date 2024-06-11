---
title: 使用 Playwright 來爬蟲當天播出的動畫新番列表，並透過 Discord 傳送資訊
description: 利用 Python 上的 Playwright package 來解析動畫新番的播出資訊，並使用 Discord 的 Webhook 來傳送訊息。
date: 2024-06-11
tags:
    - zh_posts
    - discord
    - webhook
    - playwright
    - web_crawler
---

## 效果

<p align="center" width="100%">
    <img width=100% src="https://static-resource.jhongwashere.com/Discord-anime-infomation.gif" alt="master_switch_problem">
</p>
<p align="center">
    ▲ The effect on Discord when the program executed
</p>

&emsp;&emsp;每天都能在 Discord 上看到當天動畫新番的播出資訊！

## 背景

&emsp;&emsp;每天起床就可以看到當天播出的動畫新番情報，不就覺得當天有個希望跟期待嗎？

&emsp;&emsp;我自己在看動畫新番的時候，都會等到整季播畢再一次把全部集數給看完，但是動畫播畢的資訊都要再手動上網找資料，久而久之就覺得有點麻煩，於是就想到利用 Home server 來跑爬蟲程式，並每天自動把這些資訊傳給自己，如此一來就可以省去很多麻煩了。

## Discord 文字頻道的 Webhook URL 的取得方式

&emsp;&emsp;這邊就使用容易操作的 Discord 來作為傳送通知的媒介。首先，先創建一個文字頻道，然後按照下圖的操作順序來取得該文字頻道機器人的 Webhook URL：

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

## 利用 Python 的 Playwright 套件來撰寫程式

&emsp;&emsp;原始碼在[這](https://github.com/JhongLin/anime-launch-info/blob/97d0e9e0676fbcb4b188c01ac5be1579319211e5/main.py)。

&emsp;&emsp;將上一步取得的 Webhook URL 替換原始碼中的 `your_webhook_url` 就可以輕鬆使用這個程式了。若想要每天早上執行這個程式的話，可以在 Home server 中使用 `cron` 工具來設定例行執行時間，我的話是設定在每天早上 7 點：

```bash
0 7 * * * user bash your_script.sh
```

### Playwright 套件安裝

- `pip install pytest-playwright`
- `playwright install`

### Code 說明

#### 函數 send_discord_message

&emsp;&emsp;利用 Discord 的 Webhook 讓 BOT 自動發言的作法很簡單，首先利用 POST Request 發送到剛獲得的 Webhook URL 上，Request Body 則是傳送訊息包含在內的 JSON 格式。若想確認這個 JSON 格式的訊息的話，可以參考[這個網站](https://discohook.org/)下的 JSON Data Editor 功能。

<p align="center" width="100%">
    <img width=100% src="https://static-resource.jhongwashere.com/Discohook-2.jpg" alt="Discohook">
</p>
<p align="center">
    ▲ Check the format of JSON data
</p>

#### 函數 main

這邊說明一下[原始碼](https://github.com/JhongLin/anime-launch-info/blob/97d0e9e0676fbcb4b188c01ac5be1579319211e5/main.py)，按照註解的順序解釋：

1. 利用 Playwright 創建的瀏覽器來開啟[動畫播出資訊的網站](https://www.posite-c.com/anime/weekly/)。
2. 讀取這個網站的主資訊表格。
3. 解析表格資料中的各個動畫。

&emsp;&emsp;3.1. 同一個動畫可能有很多不同的播送電視台，將這些電視台的播出資訊一一整理到該動畫底下。

&emsp;&emsp;3.2. 檢查這個動畫是否為重播。

&emsp;&emsp;3.3. 檢查這個動畫是否為新番。

&emsp;&emsp;3.4. 解析最快的播出時間跟整季的播放期間。

&emsp;&emsp;3.5. 將得到的資訊包在欲傳送的訊息中。

4. 將欲傳送的訊息們包裝在 JSON 格式中，並透過 Discord 傳送。

#### 補充

原始碼 Line 103：計算當天播出的動畫新番是第幾集。

原始碼 Line 112：若是當天播出完結篇，則訊息尾加上 `(THE END)`。

最後還有一個小訣竅：使用瀏覽器的開發者工具，可以將特定內容的 Selector 複製起來用在 Playwright 的 code 中：

<p align="center" width="100%">
    <img width=100% src="https://static-resource.jhongwashere.com/copy-selector.gif" alt="copy-selector">
</p>
<p align="center">
    ▲ How to copy the selector for using in Playwright
</p>

如果早一點知道這個方法的話，應該還能在省一些實作的時間。
