# 霧灣垂釣 · Mistwater Fishing

沿環湖步道探索松影湖，在松木棧橋、蘆葦淺灣、岩岸深潭、北岸松林或其他可到達的岸邊垂釣。你也可以走進水深 0.65 公尺以內的淺灘。魚種、咬鉤時間和拉力會隨水深與釣點改變。漁獲日誌會記在目前瀏覽器。

- [線上遊玩](https://tke1vin.github.io/mistwater-fishing/)
- [初版實機示範影片（MP4）](https://tke1vin.github.io/mistwater-fishing/downloads/mistwater-fishing-demo.mp4)
- [離線遊戲（ZIP）](https://tke1vin.github.io/mistwater-fishing/downloads/mistwater-fishing-offline.zip)。解壓縮後，用瀏覽器開啟其中的 HTML。

## 操作

| 操作 | 操控 |
| --- | --- |
| 走動 | W、A、S、D。按住 Shift 在陸地快跑 |
| 滑鼠環視 | 點「開始垂釣」後移動滑鼠。按 Esc 釋放游標，點遊戲畫面重新控制視角 |
| 其他環視方式 | 方向鍵、按住滑鼠右鍵拖曳、在觸控畫面滑動 |
| 拋竿 | 朝向水面，按住空白鍵或滑鼠左鍵蓄力，鬆開拋出 |
| 揚竿 | 等浮標往下沉，出現「魚上鉤了」時立刻按一下 |
| 收線 | 按住空白鍵或滑鼠左鍵收線。張力進入橘區就先鬆手，等下降後再收 |
| 收回釣組 | R |

觸控可滑動遊戲畫面轉視角，使用左下按鍵移動、右下魚圖示操作釣竿。

## 本機執行

需 Node.js 22。安裝後啟動開發伺服器，開啟終端機顯示的網址。

```sh
npm ci
npm run dev
```

Windows 與 macOS 建議使用支援 WebGL 2 的 Chrome、Edge 或 Firefox。執行 `npm run build` 可將靜態版輸出到 `dist/`，再用 `npm run preview` 預覽。

## GitHub Pages

把專案放進 GitHub 儲存庫的 `main` 分支。在 **Settings → Pages → Build and deployment → Source** 選擇 **GitHub Actions**，然後在 **Actions → Deploy game to GitHub Pages** 執行工作流程。之後推送到 `main` 會自動部署。專案使用相對路徑，可直接部署到使用者網站的儲存庫子目錄。

## 放入 Tripo 道具

這一版使用 Three.js。湖面、山林、釣竿和魚由程式產生。可以把在 Tripo Studio 生成的釣具箱放進棧橋場景。

1. 在 Tripo Studio 選 **Model → Text → Generate**。可使用下方提示詞。
2. 匯出含材質的 GLB，將檔案命名為 `tripo-tackle-box.glb`。
3. 放在 `src/models/tripo-tackle-box.glb`。重新啟動本機開發伺服器，釣具箱會顯示在棧橋左側。部署版需重新建置。

> 為山林湖泊的低多邊形 3D 釣魚遊戲製作一個舊式深橄欖綠釣具箱。箱蓋關閉，有黃銅扣、提把與磨損邊緣。比例寫實，搭配柔和手繪材質。底面平坦，Y 軸朝上，單一獨立道具，無地面、背景、文字或標誌。

如果老師指定 Unity，可把相同 Tripo 模型匯出為 FBX，連同貼圖加入 Unity 的 `Assets/`。這份網頁版的玩法程式需另外改寫為 Unity 專案。

[Tripo GLB 與 FBX 匯出說明](https://www.tripo3d.ai/product-doc/export-and-integration/export-dcc)
