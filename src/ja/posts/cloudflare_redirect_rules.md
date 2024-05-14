---
title: Cloudflare Rulesを使って、多言語ブログのリクエストを効率的に転送する方法
description: IPを基に、どうやってCloudflareのサービスを使ってリクエストを転送するかの説明
date: 2024-05-11
tags:
    - ja_posts
    - 11ty
    - i18n
    - cloudflare
---

## 結論

- [eleventy-i18n](https://github.com/madrilene/eleventy-i18n) をテンプレートとして、そして多言語へのルーティングの切り替えとして使用します
- [Cloudflare Rules](https://developers.cloudflare.com/rules/) を利用して、メインドメインへのアクセスを各言語のサブドメインへのリクエストに転換します

## 背景

&emsp;&emsp;
ブログを始めた最初の理由は、個人の履歴書の一部として考えていました。目標は日本で働くことなので、ブログは多言語形式であることを望んでおり、様々な雇用者には見えると思います。フロントエンドの関連経験が不足しているため、過程で多くの困難に直面しましたが、幸いにそれぞれは時間をかければ解決できました。したがって、この記事では、Cloudflare のサービスを通じて多言語ブログの一部の設定を達成する方法を共有したいと思います。

<p align="center" width="100%">
    <img width=80% src="https://static-resource.jhongwashere.com/cloudflare_rules_overview.jpg" alt="cloudflare_rules_overview">
</p>
<p align="center">
    ▲ Cloudflare redirect rules
</p>

&emsp;&emsp;ちなみに、このような設定の前提条件は、ドメインがCloudflareの管理下の必要があります。ここでは、合計で 4 つのルールが追加されています。それぞれを見ていきましょう。

## 所在地に基づいて相応なリソースのパスに転送

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
Cloudflare Rules の Redirect Rulesでは、上の図のような条件でリダイレクトが可能です。ここでは、多言語ブログの root domain（ulyssespact.jhongwashere.com）に設定しています。root domain にアクセスしたときに、IP の地域が日本であるかどうかを判断し、日本であれば `/ja` のサブパスに、そうでなければ `/zh` のサブパスにリダイレクトします。非常にシンプルです。

&emsp;&emsp;
これにより、日本のユーザーがこのブログにアクセスすると、日本語のコンテンツを見ることができます！

## カスタム 404 ページにリダイレクトのルール

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
適用したテンプレートには既に 404 ページがあるため、ブログ内で該当パスのリソースがない場合には、Cloudflare のデフォルトの 404 ページではなく、カスタム 404 ページにリダイレクトする機能を作りたいと思っています。通常のアクセスでは発生しない状況ですが、多言語ブログでは記事を切り替えるときに他の言語に対応する記事がない場合があります。

&emsp;&emsp;
この機能は少し時間がかかりました。最初にグーグルを探し、得られた方法は大半は Cloudflare Workers を通じて転送するものでしたが、実装上は期待した効果を得られませんでした。その後、Cloudflare の [說明](https://developers.cloudflare.com/pages/configuration/serving-pages/#not-found-behavior) を見ました：

> You can define a custom page to be displayed when Pages cannot find a requested file by creating a 404.html file. Pages will then attempt to find the closest 404 page. If one is not found in the same directory as the route you are currently requesting, it will continue to look up the directory tree for a matching 404.html file, ending in /404.html. This means that you can define custom 404 paths for situations like /blog/404.html and /404.html, and Pages will automatically render the correct one depending on the situation.

現在のパス下でリソースが見つからない場合、まず現在のパス下に `404.html` ファイルがあるかどうかを優先的に探します。もしあれば表示し、なければ一つ上のパスを続けて探します。

&emsp;&emsp;
このルールを知っていれば、可能な解答が浮き上がります。まず、root directory 下に `/404.html` ページを作成し、root directory 下でリソースが見つからないすべてをこのページにリダイレクトします。さらに、sub directory 下にも `/ja/404.html` と `/zh/404.html` の 2 つのページを作成しました。そして、上記の画像のルールに従って、`/404.html` にリダイレクトされたユーザーを再度 IP に基づいて sub directory 下のカスタム 404 ページにリダイレクトします。これでこの機能が完成しました。
