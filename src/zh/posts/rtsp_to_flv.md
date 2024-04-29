---
title: "轉換基於 POE 部署之 IP Cam 的 RTSP 實時串流"
description: 使用ffmpeg與nginx等等的工具實現能在瀏覽器網頁上實時觀看監視器畫面的嘗試
date: 2024-04-18
tags:
    - zh_posts
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
前一陣子從窩了 2 年的舒適圈跑了出來，因為有幾個自己想嘗試的專案，就不急著找下一份工作。  重溫自由空氣的同時，也馬上去做了近視雷射，不得不說 TPRK 的恢復期真的很長，很難想像如果在職時怎麼同時應付工作跟眼睛的休養。
<p align="center" width="100%">
    <img width=20% src="https://static-resource.jhongwashere.com/hikvision_ip_cam.jpg">
</p>
<p align="center">
    ▲ 海康 POE IP Cam
</p>
&emsp;&emsp;
在幾年前家裡裝了一台海康威視 (Hikvision) 的機子來取代走掉的看門狗勾們，連接 4 台 POE IP Cam，POE 是 Power Over Ethernet 的縮寫，就是代表這台監視器可以只用一條網路線就達到供電與數據傳輸的功能，「啥？網路線能給電器供電？」腦海中閃過以前壓製過的網路線都細到剝線時都容易把線給直接切斷...，查了之後才發現原來是有不高的功耗上限，也合理。IP Cam 則是說這台監視器是可以透過網路連接來得到畫面資訊的。
<br/>
&emsp;&emsp;
既然規格上都可以透過網路來取得畫面，那我這個 Web 仔不就有很多空間可以發揮嗎？

## 理想非常豐滿
&emsp;&emsp;
首先第一步當然就是把這 4 台監視器的畫面利用 home server 傳送到網路上，讓出門在外都還能透過手機來看到家裡的狀況，再利用告警功能讓 LINE bot 傳通知表示監視器有照到人影，甚至還可以用機器學習的方法來辨識是哪一位家人在哪個時間點出門或回家，或是偵測陌生人等等的功能，總結一下：
- 用手機上的瀏覽器網頁可以看到目前家裡的監視器畫面
- 具畫面偵測功能，並在特定條件下利用 LINE bot 告警
- 具人相偵測，可以記錄誰在什麼時間點出現在哪個鏡頭下
<p align="center" width="100%">
    <img width=40% src="https://static-resource.jhongwashere.com/initial-monitor.jpg">
</p>
<p align="center">
    ▲ 原本的輸出畫面
</p>


## 現實非常骨感
<p align="center" width="100%">
    <img width=40% src="https://static-resource.jhongwashere.com/hikvision-NVR-7804N-F14P(B).jpg">
</p>
<p align="center">
    ▲ Hikvision NVR DS-7804N-F1/4P(B)
</p>
&emsp;&emsp;
家裡這台海康的 NVR (Network Video Recorder) 的型號是 DS-7804N-F1/4P(B)，最多連接 4 台海康自家的 POE IP Cam，每一台 IP Cam 都可以提供 2304*1296 的影音，不過一般使用時從該 NVR 接出來的螢幕會在 FHD 的解析度下把 4 台 IP Cam 的畫面切割成 4 份塞進這個螢幕。
<br/>
&emsp;&emsp;
海康有跟萤石，一家中國的網路服務公司合作，架設海康監視器系統時，只要給機器連網，就可以在萤石雲的 app 上看到自家的監視器畫面，可以說是直接符合了上述的第一點需求。  但，使用萤石雲的 app 會有額度上的限制。再者，要使用這個服務還會需要實名註冊該平台的帳號，對僅僅是海外淘過來的我們來說，就把價格便宜當作唯一好處就行。

### 從找不到 API 到 DIY 失敗
&emsp;&emsp;
當我從 NVR 端登入機器的操作介面後，預期要有可以直連這 4 台 POE IP Cam 的地址或甚至埠號，但我在可以操作的清單中翻了個遍，不能說是大海撈針，只能說是毫無線索。
<p align="center" width="100%">
    <img width=40% src="https://static-resource.jhongwashere.com/Pi4+C790.jpg">
</p>
<p align="center">
    ▲ Raspberry Pi 4B + C790
</p>
&emsp;&emsp;
花了一些時間調整 NVR 設定無果後，決定採用備案，也就是使用 Raspberry Pi 4 + HDMI IN to CSI-2 的 DIY 方案，將 NVR 透過給螢幕的訊號利用樹梅派的外掛模組擷取下來，再由樹梅派向 home server 串流。實際上這是一個非常不好的作法，因為 NVR 輸出到螢幕後，僅有 1920*1080 的解析度，甚至都比單一監視器所能提供的原生解析度還來的小，在這個前提下，每一個監視器的畫面解析度就僅剩下 960*540。
<br/>
&emsp;&emsp;
因我對嵌入式裝置的知識有限，在搞清楚這個 HDMI 的外掛轉接器 C790 只能在舊版 Bullseye OS 上面運行時，已經花了我不少時間，後來利用 `raspistill` `raspivid` 這兩個命令，已經可以正常錄製我的電腦 HDMI 訊號了。原本以為終於要大功告成的時候...
<p align="center" width="100%">
    <img width=40% src="https://static-resource.jhongwashere.com/broken_signal.jpg">
</p>
<p align="center">
    ▲ C790 接 NVR 的 HDMI 輸出所錄製的畫面
</p>
&emsp;&emsp;
竟然出現了花屏！ 幾經排查好像就只有 NVR 輸出的訊號會有這個問題，NVR 輸出到螢幕是沒問題的，但輸出到 Pi 上就是花屏，後來甚至買了 HDMI 訊號複製器也沒有變化。
<br/>
&emsp;&emsp;
唉，我太難了，這個專案感覺要胎死腹中了。


### Some indian guy on YouTube
<p align="center" width="100%">
    <img width=40% src="https://static-resource.jhongwashere.com/my-code-stack.jpg">
</p>
&emsp;&emsp;
自前一波耗費約一週的全職時光都無果後，沒想到這個專案還有死灰復燃的機會。
<p align="center" width="100%">
    <img width=50% src="https://static-resource.jhongwashere.com/VLC_rtsp.png">
</p>
<p align="center">
    ▲ VLC Player 透過區域網路直接連 POE IP Cam 得到的畫面
</p>
&emsp;&emsp;
不曉得是不是過程中大量搜尋海康，在 YouTube 首頁上也出現了許多跟海康監視器相關的影片，其中一部<a href="https://youtu.be/5afBalwuSDE">口音非常印度的推薦影片</a>裡面提到如何透過 VLC Player 播放來自海康監視器的即時錄像，包含各種海康 NVR 可能使用的 RTSP (一種傳輸串流訊號的通訊協定) 網址，終於讓我可以透過區域網路來訪問原生畫質的 POE IP Cam。

### RTSP to FLV
<p align="center" width="100%">
    <img width=50% src="https://static-resource.jhongwashere.com/flv_demo_page.png">
</p>
<p align="center">
    ▲ 最後弄一個陽春的頁面來放 flv player
</p>
&emsp;&emsp;
由於瀏覽器網頁不支援直接播放 RTSP 來源，所以必須要轉換為瀏覽器支援的串流規格才行，這邊我選擇了 flv 來作為實作目標，主要是因為:
<ul>
<li>輕量與低延遲</li>
<li>bilibili 開源的 flv.js 所提供的現成 flv player</li>
</ul>
&emsp;&emsp;
首先，在 home server 上利用 `ffmpeg` 工具將海康 NVR 的訊號轉換為 RTMP:

```bash
ffmpeg -rtsp_transport tcp -i rtsp://<account>:<password>@<NVR區網地址>/Streaming/Channels/<camera_number> -g 25 -c copy -preset:v ultrafast -tune:v zerolatency -f flv -flvflags no_duration_filesize -an rtmp://<stream_ip_or_domain>:<stream_port>/camera01/stream
```

&emsp;&emsp;
並且透過 nginx 的 [nginx-http-flv-module](https://github.com/winshining/nginx-http-flv-module) 轉發這個訊號源:

```nginx
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
最後在提供一個網頁來訪問這個訊號源就好:
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
### 大功告成
&emsp;&emsp;
才怪，我發現在 iPad 上面開這個網頁的時候，播放器在遇到掉封包的時候會直接暫停，需要手動再去按播放的按鈕，而且這個暫停的頻率不低，導致觀看體驗超級差，iPhone 更慘，直接沒辦法正常使用 flv player，完全看不到畫面。
<br/>
&emsp;&emsp;
解決方法就是，大家都跟我一樣換拿 Android 手機就可以了。
<br/>
<br/>
<p align="center" width="100%">
    <img src="https://static-resource.jhongwashere.com/cat_meme_huh.gif">
</p>
<br/>
<br/>
&emsp;&emsp;
好啦，因為在上面花的時間實在太長，我的心態已經崩得差不多了，況且我的使用情境 (Windows PC 跟我的 Pixel 4) 在使用上都沒有問題，先讓我轉戰下一個專案先，以後想弄的東西差不多了之後再回來看看要怎麼辦。
