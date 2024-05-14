---
title: 使用 Cloudflare Rules 來設定多語言部落格
description: 如何使用 Cloudflare 的服務來根據 IP 跳轉至正確的網址
date: 2024-05-11
tags:
    - zh_posts
    - 11ty
    - i18n
    - cloudflare
---

## 總結

- 以 [eleventy-i18n](https://github.com/madrilene/eleventy-i18n) 作為模板以及切換多語言的路由
- 利用 [Cloudflare Rules](https://developers.cloudflare.com/rules/) 來轉發訪問主網域到各語言子網域的請求

## 背景

&emsp;&emsp;
一開始架部落格的原因是想當作個人履歷的一部份，因為目標是想去日本工作，所以部落格會希望是一個多語言的形式，還可以提供給未來的日本雇主看。  由於前端的相關經驗不足，過程中遇到了不少困難，但還好都是花時間可以解決的問題。因此本文就要來分享一下，如何通過 Cloudflare 的服務來達到多語言部落格的部分設定。

<p align="center" width="100%">
    <img width=80% src="https://static-resource.jhongwashere.com/cloudflare_rules_overview.jpg" alt="cloudflare_rules_overview">
</p>
<p align="center">
    ▲ Cloudflare redirect rules
</p>

&emsp;&emsp;根據上圖，可以看到這樣子設定的先決條件是 domain 處在 Cloudflare 下管理，這裡總共加了 4 條 Rules，讓我們一一來檢視一下。

## 根據地域轉發至對應之資源地址

<p align="center" width="100%">
    <img width=80% src="https://static-resource.jhongwashere.com/cloudflare_rules_in_japan.jpg" alt="cloudflare_rules_in_japan">
</p>
<p align="center">
    ▲ Cloudflare redirect rules (for the IP in Japan)
</p>

<p align="center" width="100%">
    <img width=80% src="https://static-resource.jhongwashere.com/cloudflare_rules_except_japan.jpg" alt="cloudflare_rules_except_japan">
</p>
<p align="center">
    ▲ Cloudflare redirect rules (for the IP outside of Japan)
</p>

&emsp;&emsp;
在 Cloudflare Rules 的 Redirect Rules 可以有像上圖一樣的條件跳轉，這邊是設定在多語言部落格 root domain 上 (ulyssespact.jhongwashere.com)，當存取 root domain 的時候去判斷 IP 的地域是否在日本，是的話就跳轉到 `/ja` 子路徑下，不是的話就跳轉到 `/zh` 子路徑下，非常簡單愜意。

&emsp;&emsp;
如此一來，在日本的用戶進入這個部落格時就可以看到日文的內容！

## 轉發至客製化 404 頁面之規則

<p align="center" width="100%">
    <img width=80% src="https://static-resource.jhongwashere.com/cloudflare_rules_404_in_japan.jpg" alt="cloudflare_rules_404_in_japan">
</p>
<p align="center">
    ▲ Redirect customized 404 page (for the IP in Japan)
</p>

<p align="center" width="100%">
    <img width=80% src="https://static-resource.jhongwashere.com/cloudflare_rules_404_except_japan.jpg" alt="cloudflare_rules_404_except_japan">
</p>
<p align="center">
    ▲ Redirect customized 404 page (for the IP outside of Japan)
</p>

&emsp;&emsp;
由於套用的模板有現成的 404 頁面，因此想要做一個功能，讓在部落格中沒有該路徑下的資源時，統一跳轉至客製化的 404 頁面，而不是來自 Cloudflare 的預設 404 網頁，雖然正常訪問的情況下不會發生此情況，但多語言部落格在切換文章時也許會發生另一個語言沒有對應文章的情況。

&emsp;&emsp;
這個功能就耗費了稍微多一點時間了，一開始爬文，得到的方式都是透過 Cloudflare Workers 來進行轉發，但是實作上都達不到預期的效果，後來根據 Cloudflare 的 [說明](https://developers.cloudflare.com/pages/configuration/serving-pages/#not-found-behavior)：

> You can define a custom page to be displayed when Pages cannot find a requested file by creating a 404.html file. Pages will then attempt to find the closest 404 page. If one is not found in the same directory as the route you are currently requesting, it will continue to look up the directory tree for a matching 404.html file, ending in /404.html. This means that you can define custom 404 paths for situations like /blog/404.html and /404.html, and Pages will automatically render the correct one depending on the situation.

當目前路徑下找不到該資源時，會優先找當前路徑下是否有 404.html 的檔案，有的話則顯示，沒有的話會往上一層的路徑繼續找下去。

&emsp;&emsp;
知道這一點的話就省事多了，首先我先在 root directory 下新增一個 `/404.html` 頁面，讓所有 root directory 下找不到資源的都導向至這個頁面。另外，也在 sub directory 下新增了 `/ja/404.html` 與 `/zh/404.html` 兩個頁面，並按照上述圖片的規則，將被導向到 `/404.html` 的用戶再次根據 IP 導向到 sub directory 下的客製化 404 頁面，大功告成。
