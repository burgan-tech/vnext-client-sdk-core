# VNext Client SDK Core

Low-code platform için TypeScript ve Flutter core SDK'ları ile Vue adaptörü içeren monorepo yapısı.

## Proje Yapısı

```
vnext-client-sdk-core/
├── core/
│   ├── core-ts/           # TypeScript core SDK
│   └── core-flutter/      # Flutter core SDK
├── adapters/
│   └── vue/               # Vue 3 adaptörü
├── examples/
│   └── vue-app/           # Örnek Vue uygulaması
└── package.json           # Root package.json (workspaces)
```

## Kurulum

```bash
npm install
```

## Build

```bash
npm run build
```

## Geliştirme

Her workspace kendi bağımsız paketi olarak çalışır:

```bash
# Tüm paketleri build et
npm run build

# Belirli bir paketi build et
cd core/core-ts && npm run build
```

## Paketler

### Core SDK'lar

- **core-ts**: TypeScript core SDK - Framework-agnostic core library
- **core-flutter**: Flutter core SDK - Dart/Flutter için core library

### Adapters

- **vue**: Vue 3 Composition API hooks ve plugin

### Examples

- **vue-app**: Vue SDK'yı tüketen örnek uygulama

## Lisans

Private

