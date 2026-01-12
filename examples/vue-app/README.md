# VNext Vue Example Application

Bu proje, VNext TypeScript Core SDK ve Vue adapter'ını kullanan örnek bir Vue 3 uygulamasıdır.

## 🚀 Hızlı Başlangıç

### Ön Gereksinimler

- Node.js >= 18.0.0
- npm >= 9.0.0

### Kurulum

1. **Root dizinde bağımlılıkları yükle:**
   ```bash
   cd /path/to/vnext-client-sdk-core
   npm install
   ```

2. **Mock server'ı başlat (ayrı terminal):**
   ```bash
   npm run mock:server
   ```
   Mock server `http://localhost:3001` adresinde çalışacak.

3. **Vue uygulamasını başlat:**
   ```bash
   cd examples/vue-app
   npm run dev
   ```
   Uygulama `http://localhost:5173` adresinde çalışacak.

## 📋 Kullanım

### Mock Server

Mock server, geliştirme sırasında backend API'lerini mock etmek için kullanılır.

**Başlatma:**
```bash
npm run mock:server
```

**Endpoint'leri görmek için:**
```bash
curl http://localhost:3001/
```

**Test endpoint'leri:**
```bash
# Environment listesi
curl http://localhost:3001/api/v1/discovery/workflows/enviroment/instances/web-app/functions/enviroment

# Client config
curl http://localhost:3001/api/v1/morph-idm/workflows/client/instances/web-app/functions/client

# Features
curl http://localhost:3001/features
```

### Vue Uygulaması

**Development modunda çalıştırma:**
```bash
cd examples/vue-app
npm run dev
```

**Build:**
```bash
npm run build
```

**Preview (build sonrası):**
```bash
npm run preview
```

## 🔧 Yapılandırma

### Environment Variables

Vue uygulaması aşağıdaki environment variable'ları destekler:

- `VITE_ENVIRONMENT_ENDPOINT`: Environment endpoint URL'i (opsiyonel)
- `VITE_APP_KEY`: Uygulama/client key (opsiyonel)
- `VITE_DEFAULT_STAGE`: Default stage seçimi (opsiyonel)
- `VITE_DEBUG`: Debug mode aktif etmek için `true` (opsiyonel)

**Örnek `.env` dosyası:**
```env
VITE_ENVIRONMENT_ENDPOINT=http://localhost:3001/api/v1/discovery/workflows/enviroment/instances/web-app/functions/enviroment
VITE_APP_KEY=web-app
VITE_DEFAULT_STAGE=localhost
VITE_DEBUG=true
```

### SDK Initialization

Vue uygulaması, SDK'yı sadece 2 parametre ile initialize eder:

```typescript
app.use(VNextVuePlugin, {
  environmentEndpoint: 'http://localhost:3001/api/v1/discovery/workflows/enviroment/instances/web-app/functions/enviroment',
  appKey: 'web-app',
  debug: true, // Opsiyonel: Verbose logging için
});
```

Core SDK gerisini halleder:
1. Environment listesini çeker
2. Default stage'i seçer (veya `defaultStage` parametresini kullanır)
3. Client config'i çeker
4. Feature'ları initialize eder
5. WebSocket bağlantısını kurar (eğer enabled ise)

## 📊 Log Prefix'leri

Console'da hangi katmanın log attığını ayırt edebilirsin:

- `[VueApp]` - Vue uygulaması logları
- `[VueAdapter]` - Vue adapter logları (mor renk)
- `[CoreSDK]` - Core SDK logları (mavi renk, timestamp'li)

## 🐛 Debug Mode

Debug mode aktif olduğunda, SDK tüm initialization adımlarını detaylı olarak loglar:

```
[CoreSDK] [INFO] 🚀 Initializing CoreSDK...
[CoreSDK] [INFO] Step 1/7: Fetching environments...
[CoreSDK] [DEBUG] Environments fetched: {...}
[CoreSDK] [INFO] Step 2/7: Selecting stage...
[CoreSDK] [INFO] Stage selected: {id: 'localhost', ...}
...
[CoreSDK] [INFO] ✅ SDK initialization completed successfully!
```

## 📁 Proje Yapısı

```
examples/vue-app/
├── src/
│   ├── main.ts              # Vue app entry point, SDK initialization
│   ├── App.vue              # Main app component
│   ├── router.ts            # Vue Router configuration
│   ├── components/          # Vue components
│   └── views/               # Vue views/pages
│       ├── Login.vue        # Login examples
│       ├── Dashboard.vue    # Dashboard view
│       ├── WebSocket.vue    # WebSocket test
│       ├── Workflow.vue     # Workflow examples
│       └── View.vue         # View examples
├── public/                  # Static files
│   └── mockServiceWorker.js # MSW service worker
├── package.json
└── README.md
```

## 🔍 Troubleshooting

### Log prefix'leri görünmüyor

1. Hard refresh yap: `Cmd+Shift+R` (Mac) veya `Ctrl+Shift+R` (Windows)
2. Browser cache'i temizle: DevTools > Application > Clear storage
3. Vite cache'i temizle: `rm -rf node_modules/.vite`

### Mock server çalışmıyor

1. Port 3001'in kullanılabilir olduğundan emin ol:
   ```bash
   lsof -i :3001
   ```
2. Mock server'ı yeniden başlat:
   ```bash
   npm run mock:server
   ```

### CORS hatası

Mock server CORS header'larını otomatik olarak ekler. Eğer hala CORS hatası görüyorsan:

1. Mock server'ın çalıştığından emin ol
2. Browser'ı yenile
3. Network tab'ında request'in mock server'a gittiğini kontrol et

### SDK initialization hatası

1. Console'da hata mesajlarını kontrol et
2. Mock server'ın çalıştığından emin ol
3. Environment endpoint'in doğru olduğundan emin ol
4. Network tab'ında request'lerin başarılı olduğunu kontrol et

## 📚 Daha Fazla Bilgi

- [Core SDK Documentation](../../docs/)
- [Vue Adapter Documentation](../../adapters/vue/)
- [Mock Server Documentation](../../mocks/README.md)
