# Mock Service Worker (MSW) Setup

Bu klasör, geliştirme sırasında backend API'lerini mock etmek için MSW (Mock Service Worker) kullanır.

## 📁 Klasör Yapısı

```
mocks/
├── handlers.ts          # API endpoint handler'ları
├── browser.ts           # Browser için MSW worker setup
├── server.ts            # Node.js (test) için MSW server setup
├── public/
│   └── mockServiceWorker.js  # Service Worker dosyası
└── README.md
```

## 🚀 Kullanım

### Development Mode

Vue app development modunda çalıştığında MSW otomatik olarak aktif olur:

```bash
cd examples/vue-app
npm run dev
```

MSW, tüm HTTP isteklerini yakalar ve `handlers.ts` içindeki mock handler'ları kullanır.

### Mock Dosyaları

Mock response'lar `docs/sample-service-responses/` klasöründen okunur:

- `environments.json` - Environment/stage listesi
- `client-function-config.json` - Client config
- `navigation-device.json` - Device token navigation
- `navigation-1fa.json` - 1FA token navigation
- `navigation-2fa.json` - 2FA token navigation

## 📝 Handler'ları Güncelleme

`handlers.ts` dosyasını düzenleyerek yeni endpoint'ler ekleyebilir veya mevcut handler'ları güncelleyebilirsiniz:

```typescript
import { http, HttpResponse } from 'msw';

export const handlers = [
  http.get('/api/example', () => {
    return HttpResponse.json({ data: 'mock response' });
  }),
];
```

## 🔧 Mock Token Yönetimi

Handler'lar içinde in-memory token storage kullanılır:

```typescript
let mockTokens: {
  device?: string;
  '1fa'?: string;
  '2fa'?: string;
} = {};
```

Token'lar sadece development sırasında geçerlidir ve sayfa yenilendiğinde sıfırlanır.

## 🧪 Test'lerde Kullanım

Node.js test ortamında `server.ts` kullanılır:

```typescript
import { server } from './mocks/server';

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

## 📚 Daha Fazla Bilgi

- [MSW Documentation](https://mswjs.io/)
- [MSW GitHub](https://github.com/mswjs/msw)
