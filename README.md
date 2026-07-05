# PrivatePicApp

Android 私密相簿 App，使用 Expo SDK 56 / React Native 0.85.3 開發。

## 功能概覽

### 已完成

#### 🔐 身份驗證
- 6 位數 PIN 碼設定與驗證
- 生物辨識解鎖（指紋 / 臉部）
- 背景超過 30 秒自動鎖定（`AppState` 監聽）
- `AuthGuard`：root layout 層統一管理導航，防止 Tabs 內 `router.replace` 造成 navigation state 錯亂

#### 📥 匯入
- 從系統相簿多選照片 / 影片
- 匯入前選擇目標資料夾（可不分類）
- 可選擇匯入後刪除相簿原始檔案
  - Android 13+ 透過 `MediaStore.createDeleteRequest` 觸發系統確認對話框
  - 從 picker 檔名（如 `1000009163.jpg`）直接提取 MediaStore ID，不依賴 `getAssetsAsync`
  - 避免呼叫 `requestPermissionsAsync(true)` 以防權限降級為 `READ_MEDIA_VISUAL_USER_SELECTED`

#### 🗂 資料夾管理
- 建立 / 重新命名 / 刪除資料夾
- 主畫面顯示 2 欄資料夾圖示 grid（點開進入、長按管理）
- 固定「全部」卡片（顯示所有檔案）
- 匯入時可指定目標資料夾
- 長按照片 / 影片可移動至其他資料夾或移出資料夾
- 刪除資料夾時，其中的檔案自動移至「全部」

#### 🖼 相簿 Gallery
- 3 欄縮圖 grid
- 照片：AES-256-GCM 解密後顯示縮圖
- 影片：`expo-video-thumbnails` 擷取第 1 秒畫面作為縮圖（需 rebuild 才能啟用 native module）
- 影片縮圖左下角顯示 ▶ 角標
- 長按縮圖：移至資料夾 / 刪除

#### 🔍 照片 / 影片檢視
- 照片：支援 pinch-to-zoom、雙擊放大/還原、拖曳平移
  - `GestureHandlerRootView` 放在 Modal 內部（Modal 在 Android 建立獨立 React root）
  - `Animated.View` + `StyleSheet.absoluteFill` 作為 `GestureDetector` 子元件
- 影片：`expo-video` 播放器，支援全螢幕
- 底部 action bar：「🗑 刪除」+ 「↗ 還原到相簿」

#### ↩ 還原到相簿
- 透過 `expo-media-library` 的 `saveToLibraryAsync` 還原
- 可選擇「還原並保留」或「還原並刪除（從私密相簿移除）」

#### ⚙️ 設定
- 變更 PIN 碼
- 生物辨識解鎖開關
- 清除解密暫存
- 說明：移至背景 30 秒後自動鎖定

---

## 技術架構

```
app/
├── _layout.tsx          # Root Stack + AuthGuard（自動鎖定 & 導航守衛）
├── index.tsx            # 初始路由（依 isAuthenticated 重導向）
├── (auth)/
│   ├── _layout.tsx
│   └── unlock.tsx       # PIN 輸入 / 設定 / 生物辨識
└── (main)/
    ├── _layout.tsx      # Tabs 導航
    ├── gallery.tsx      # 資料夾 grid + 媒體 grid + 檢視器
    ├── import.tsx       # 照片 / 影片匯入
    └── settings.tsx     # 設定頁

src/
├── crypto/
│   └── encryption.ts   # AES-256-GCM（@noble/ciphers）+ PBKDF2 金鑰派生
├── store/
│   ├── authStore.ts    # Zustand：PIN 驗證、生物辨識、鎖定
│   └── mediaStore.ts   # Zustand：媒體 CRUD、資料夾 CRUD、縮圖
└── hooks/
    └── useBiometrics.ts
```

## 加密機制

- 演算法：AES-256-GCM（`@noble/ciphers`）
- 金鑰派生：PBKDF2-SHA256，10,000 次迭代，salt 存於 `expo-secure-store`
- 每個加密檔案格式：`[12 bytes IV][ciphertext + 16 bytes GCM tag]`
- 影片不加密（存於 App 私有目錄，系統相簿不可見）
- 解密暫存目錄：`cacheDirectory/vault_temp/`，可手動或自動清除

## 資料儲存

| 項目 | 路徑 |
|---|---|
| 加密照片 | `documentDirectory/vault/{uuid}.enc` |
| 影片 | `documentDirectory/vault/{uuid}.mp4` |
| 影片縮圖 | `documentDirectory/vault_thumbs/{uuid}.jpg` |
| 媒體索引 | `documentDirectory/vault_index.json` |
| 資料夾索引 | `documentDirectory/vault_folders.json` |
| PIN / Salt | `expo-secure-store` |

## 已知問題 / 待辦

- [x] **影片縮圖**：`expo-video-thumbnails` 已啟用（需 `npx expo run:android` rebuild 一次）
- [ ] 影片目前不加密，依賴 Android App 私有目錄隔離
- [ ] 大量照片時縮圖載入無進度提示

## 開發環境

```
Expo SDK       56.0.x
React Native   0.85.3
Node.js        (建議 18+)
Java           JBR（Android Studio 內附）
```

### 執行方式

```powershell
# 首次 / 新增 native 套件後
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"
npx expo run:android

# JS 異動只需重新載入
npx expo start
```

## 主要依賴

| 套件 | 用途 |
|---|---|
| `expo-router` | 檔案路由 |
| `expo-media-library/legacy` | 相簿存取 / 刪除 / 還原 |
| `expo-image-picker` | 多選照片 / 影片 |
| `expo-video` | 影片播放 |
| `expo-video-thumbnails` | 影片縮圖（需 rebuild）|
| `expo-file-system/legacy` | 檔案讀寫 |
| `expo-secure-store` | PIN / Salt 安全儲存 |
| `expo-local-authentication` | 生物辨識 |
| `expo-crypto` | 隨機 UUID / 亂數 |
| `@noble/ciphers` | AES-256-GCM |
| `@noble/hashes` | PBKDF2-SHA256 |
| `react-native-gesture-handler` | Pinch / Pan / Tap 手勢 |
| `react-native-reanimated` | 縮放動畫 |
| `zustand` | 全域狀態管理 |
