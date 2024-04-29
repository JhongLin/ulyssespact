---
title: "POE に基づく IP Cam の RTSP リアルタイムストリームの変換"
description: ffmpegやnginxを用いてブラウザで監視カメラの画面が配信できるようにやってみた。
date: 2024-04-18
tags:
    - ja_posts
    - nginx
    - flv
    - rtsp
    - stream
---
<style>
    pre {
        background-color: #272822;
    }
</style>
&emsp;&emsp;
少し前に 2 年間楽に働ける職場から抜け出しました。自分が試してみたいプログラムがいくつかあったので、次の仕事を急いで探すことはありませんでした。ぬくぬくのんびりと暮らした生活を再び味わうと同時に、近視レーザー手術「パーク」もすぐに受けに行きました。パークの回復期間が本当に長いと言わざるを得ません。仕事と目の休養をどうやって同時にうまくやるのかを想像するだけで難しいと感じる。
<p align="center" width="100%">
    <img width=20% src="https://static-resource.jhongwashere.com/hikvision_ip_cam.jpg">
</p>
<p align="center">
    ▲ Hikvision POE IP Cam
</p>
&emsp;&emsp;
数年前、家には Hikvision の機器が設置され、天使になった番犬たちを代替しました 4 台の POE IP Cam に接続されています。POE は Power Over Ethernet の略で、こういう監視カメラはただ一本の LAN ケーブルだけで電源供給とインターネット接続が同時にできます。「え？ LAN ケーブルで電力供給ができるの？」と思いましたが、以前自作した LAN ケーブルは細くすぎでうっかりと切り離すのがかもしれません…。調べてみると、通過電流の上限がそれほど高くないことがわかりました。それはそうですね。そして IP Cam とは、この監視カメラがネットワーク接続を通じて映像情報を取得できることを意味します。
<br/>
&emsp;&emsp;
まぁ、ネットワークを通じてカメラ映像を取得できることであれば、私みたいな Web 開発者には多くの応用があり得るも言えますね。

## 理想は素晴らしい
&emsp;&emsp;
まず第一歩として、4 台の監視カメラの映像を自宅サーバを通じてインターネットに接続し、外出中でもスマートフォンで家の状況を確認できるようにします。さらに、人影を検出した警報機能を利用してを LINE bot で通知することもあり、さらに機械学習を用いてどの家族メンバーが何時に出かけたり帰宅したりしたのか、または不審者を検出するなどの機能も可能です。まとめしますと：
- スマートフォンのブラウザから現時家の監視カメラ映像を見ることができます
- 映像検出機能があり、特定の条件下で LINE bot を使用して警報を発することができます
- 人物検出機能があり、誰が何時にどのカメラの画面に現れたかを記録することができます
<p align="center" width="100%">
    <img width=40% src="https://static-resource.jhongwashere.com/initial-monitor.jpg">
</p>
<p align="center">
    ▲ 元の監視カメラの画面
</p>


## 現実は厳しい
<p align="center" width="100%">
    <img width=40% src="https://static-resource.jhongwashere.com/hikvision-NVR-7804N-F14P(B).jpg">
</p>
<p align="center">
    ▲ Hikvision NVR DS-7804N-F1/4P(B)
</p>
&emsp;&emsp;
家にあったのは Hikvision の NVR（Network Video Recorder）のモデル DS-7804N-F1/4P(B) があり、最大で 4 台 Hikvision の POE IP Cam に接続できます。各 IP Camは 2304*1296 の映像を提供できますが、通常使用時には、この NVR から出されるのは一つの FHD 画面で 4 台の IP Cam の画面を 4 当分割して収めます。 
<br/>
&emsp;&emsp;
Hikvision は、中国のインターネットサービス会社である萤石と提携しており、Hikvision の監視カメラシステムを設置する際には、NVR にネットワーク接続を提供するだけで、萤石のクラウドアプリ上で自宅の監視カメラの映像を見ることができます。つまり、上述の一つ目の要求を直接満たすことができます。しかしながら、萤石のクラウドアプリを使用すると、使用量に制限があります。さらに、このサービスを利用するためには、中国人の実名登録の必要があります。私たちのように海外から中国製品を購入しただけの人々にとっては、価格が安いということが唯一の利点と言えます。

### IP Cam の API を見えずに DIY も失敗
&emsp;&emsp;
NVR の端末から機器の操作 UI にログインしたとき、4 台の POE IP Cam に直接接続できる IP アドレスやポート番号があると思いきや、操作可能なリストをすべて見ても、まったく手がかりがありませんでした。
<p align="center" width="100%">
    <img width=40% src="https://static-resource.jhongwashere.com/Pi4+C790.jpg">
</p>
<p align="center">
    ▲ Raspberry Pi 4B + C790
</p>
&emsp;&emsp;
NVR の設定を調べるの時間を費やした後、代案としての Raspberry Pi 4 + HDMI IN to CSI-2 の方に移りしました。これにより、NVR から出される画面信号を Raspberry Pi のモジュールで捕捉し、それを Raspberry Pi から通じて自宅サーバーにストリーミングすることができますでしょう。実際にこれは非常に良くない方法です。なぜなら、NVR がモニター画面に出力した後の解像度は 1920*1080 しかなく、さらに単一の監視カメラが提供できる原生解像度よりも遥かに低いからです。この状況になると、各監視カメラの画面解像度は 960*540 にしかなりません。
<br/>
&emsp;&emsp;
組み込みシステムについての知識が限られているため、HDMI シグナル変換モジュール C790 が古いバージョンの Dedian Bullseye OS でしか動作しないことを理解するのはもうかなりの時間がかかりました。その後、raspistill と raspivid という 2 つのコマンドを使用して、私の PC からのHDMI信号を正常に録画できるようになりました。ついに大成功を収めると思ったところで…
<p align="center" width="100%">
    <img width=40% src="https://static-resource.jhongwashere.com/broken_signal.jpg">
</p>
<p align="center">
    ▲ C790 で NVR から HDMI シグナルを変換する結果
</p>
&emsp;&emsp;
画面が乱れる現象が発生しました！何度も調査した結果、NVR からの出力信号だけがこの問題を引き起こすようです。NVR からモニター画面への出力は問題ありませんが、Piへの出力では画面が乱れます。その後、HDMI信号複製器を購入しましたが、状況もまた変わりませんでした。
<br/>
&emsp;&emsp;
あー、もうだめです、このプロジェクトは失敗に終わるかもしれません。


### Some indian guy on YouTube
<p align="center" width="100%">
    <img width=40% src="https://static-resource.jhongwashere.com/my-code-stack.jpg">
</p>
&emsp;&emsp;
一週間フルタイムに努力したでもかかわらず、結果が出なかった後、このプログラムが再び実行できるの可能性があるとは思いませんでした。
<p align="center" width="100%">
    <img width=50% src="https://static-resource.jhongwashere.com/VLC_rtsp.png">
</p>
<p align="center">
    ▲ VLC Player は LAN で POE IP Cam から直接にリンクして得た画面
</p>
&emsp;&emsp;
Hikvision について大量に検索した結果かどうかはわかりませんが、YouTube のホームページには、Hikvision の監視カメラに関連する多くのオススメ動画がいくつか表示されました。その中の一つ<a herf="https://youtu.be/5afBalwuSDE">インド英語で喋る動画</a>では、Hikvision の監視カメラからのリアルタイムビデオを VLC Player で再生する方法、および Hikvision の NVR が使用する RTSP（ストリーミング信号を転送する通信プロトコル）の URL などが紹介されていました。これにより、ついに LAN を通じて POE IP Cam の原生画質にアクセスすることができました。

### RTSP to FLV
<p align="center" width="100%">
    <img width=50% src="https://static-resource.jhongwashere.com/flv_demo_page.png">
</p>
<p align="center">
    ▲ 簡単なリアタイ flv 再生のページを作成した
</p>
&emsp;&emsp;
ブラウザのウェブページは RTSP ソースの直接再生のサポートはないのため、再生できるストリーミング規格に変換する必要があります。ここでは、以下の理由から flv という規格をやってみる目標として選択しました：
<ul>
<li>軽量で低遅延</li>
<li>bilibili のオープンソースである flv.js が提供する既製の flv プレーヤー</li>
</ul>

&emsp;&emsp;
まず、自宅サーバーの上で ffmpeg コマンドを使用して Hikvision NVR の信号を RTMP に変換します：
```bash
ffmpeg -rtsp_transport tcp -i rtsp://<account>:<password>@<NVRのLANアドレス>/Streaming/Channels/<camera_number> -g 25 -c copy -preset:v ultrafast -tune:v zerolatency -f flv -flvflags no_duration_filesize -an rtmp://<stream_ip_or_domain>:<stream_port>/camera01/stream
```
&emsp;&emsp;
そして、<a href="https://github.com/winshining/nginx-http-flv-module">nginxのnginx-http-flv-module</a> を通じてこの信号源を転送します：
```
location /live {
    flv_live on;
    chunked_transfer_encoding on;
    add_header 'Access-Control-Allow-Origin' '*';
    add_header 'Access-Control-Allow-Credentials' 'true';
    add_header 'Cache-Control' 'no-cache';
}

rtmp {
    server {
        listen <stream_port>;
        chunk_size 8192;

        application camera01 {
            live on;
            meta off;
            record off;
            allow play all;
        }
    }
}
```
&emsp;&emsp;
最後に、この信号源にアクセスするウェブページを提供すれば良いです：
```html
<div class="mainContainer">
    <video class="centeredVideo" id="videoElement" controls autoplay muted></video>
</div>
<script src="./flv.js"></script>
<script>
    let flvPlayer;
    if (flvjs.isSupported()) {
        startVideo1();
    }

    function startVideo1() {
        var videoElement = document.getElementById('videoElement');
        flvPlayer = flvjs.createPlayer({
            type: 'flv',
            enableWorker: true,
            isLive: true,
            hasAudio: false,
            hasVideo: true,
            stashInitialSize: 128,
            enableStashBuffer: false,
            url: 'https://<stream_ip_or_domain>/live?port=<stream_port>&app=camera01&stream=stream'
        });
        flvPlayer.attachMediaElement(videoElement1);
        flvPlayer.load();
        flvPlayer.play();

        // Avoid stream delay
        setInterval(function () {
            if (!flvPlayer.buffered.length) {
                return;
            }
            var end = flvPlayer.buffered.end(0);
            var diff = end - flvPlayer.currentTime;
            if (diff >= 5) {
                flvPlayer.currentTime = parseInt(end);
            }
        }, 3000)
    }
</script>
```
### ついに成し遂げる

&emsp;&emsp;
**じゃねぇ**。
<br>
<br>
&emsp;&emsp;
調べると、iPad や iPhone でこのページを開くと、再生が重いにした際に flv プレーヤーが直接停止し、手動で再生ボタンを押す必要があります。さらに、この一時停止の頻度は高く、視聴体験が非常に悪いです。iPhone ではさらに悪く、flv プレーヤーを正常に使用することができず、画面が全く見えません。
<br/>
&emsp;&emsp;
まぁまぁ、これを解決するのも簡単、皆さんが私と同じに Android 搭載したスマホに切り替えることで済みますよ。
<br/>
<br/>
<p align="center" width="100%">
    <img src="https://static-resource.jhongwashere.com/cat_meme_huh.gif">
</p>
<br/>
<br/>
&emsp;&emsp;
冗談、上記の作業にかなりの時間を費やしたため、気持ちはもうすでに崩壊しています。さらに、私が使う場合（Windows PC と Pixel 4）では問題がないの故、次のプログラムに移ることにしました。これから作りたいものが完成するかどうか次第で、再度この問題を見直すことにしましょう。
