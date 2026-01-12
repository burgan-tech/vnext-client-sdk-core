# VNext Client SDK Core

Low-code platform için TypeScript ve Flutter core SDK'ları ile Vue adaptörü içeren monorepo yapısı.

## 🚀 Hızlı Başlangıç

### Ön Gereksinimler

- Node.js >= 18.0.0
- npm >= 9.0.0

### Kurulum

1. **Bağımlılıkları yükle:**
   ```bash
   npm install
   ```

2. **Mock server'ı başlat (ayrı terminal):**
   ```bash
   npm run mock:server
   ```
   Mock server `http://localhost:3001` adresinde çalışacak.

3. **Vue örnek uygulamasını başlat:**
   ```bash
   cd examples/vue-app
   npm run dev
   ```
   Uygulama `http://localhost:5173` adresinde çalışacak.

## 📋 Proje Yapısı

```
vnext-client-sdk-core/
├── core/
│   ├── core-ts/          # TypeScript Core SDK
│   └── core-flutter/      # Flutter Core SDK (placeholder)
├── adapters/
│   └── vue/              # Vue 3 Adapter
├── examples/
│   └── vue-app/          # Vue örnek uygulaması
├── mocks/                # Mock server (MSW + Express)
└── docs/                 # Dokümantasyon
```

## 🔧 Mock Server

Mock server, geliştirme sırasında backend API'lerini mock etmek için kullanılır.

**Başlatma:**
```bash
npm run mock:server
```

**Endpoint listesini görmek için:**
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

## 📚 Dokümantasyon

- [Lifecycle Events](docs/lifecycle.md) - Platform-agnostic lifecycle events
- [Data Manager](docs/data-manager.md) - Centralized state management
- [Navigation](docs/navigation.md) - Backend-driven navigation system
- [Router](docs/router.md) - Router management (SDI/MDI modes)
- [Authentication](docs/authantication.md) - Authentication flows and token management
- [View Managers](docs/view-managers/) - View rendering managers
- [Vue App README](examples/vue-app/README.md) - Vue example app setup and usage

## 🛠️ Development

### Build

```bash
# Tüm paketleri build et
npm run build

# Belirli bir paketi build et
cd core/core-ts && npm run build
cd adapters/vue && npm run build
```

### Clean

```bash
npm run clean
```

### Test

```bash
npm run test
```

## 📝 Vue Uygulaması Kullanımı

Detaylı kullanım için [Vue App README](examples/vue-app/README.md) dosyasına bakın.

**Kısa özet:**
1. Mock server'ı başlat: `npm run mock:server`
2. Vue app'i başlat: `cd examples/vue-app && npm run dev`
3. Browser'da aç: `http://localhost:5173`

## 🔍 Log Prefix'leri

SDK logları prefix'lerle ayrılmıştır:

- `[CoreSDK]` - Core SDK logları (mavi, timestamp'li)
- `[VueAdapter]` - Vue adapter logları (mor)
- `[VueApp]` - Vue app logları (normal console.log)

## 📦 Paketler

### Core SDK'lar

- **@vnext/core-ts**: TypeScript core SDK - Framework-agnostic core library
- **@vnext/core-flutter**: Flutter core SDK - Dart/Flutter için core library (placeholder)

### Adapters

- **@vnext/vue**: Vue 3 Composition API hooks ve plugin

### Examples

- **vue-app**: Vue SDK'yı tüketen örnek uygulama

## 📄 Lisans

Private
