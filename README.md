# bpscalculator

Calculadora OTC para cotizar USD/MXN, guardar operaciones y sincronizarlas con Google Sheets.

## Configurar Capa de forma segura

La API key de Capa ya no vive en el frontend. Ahora la app usa un proxy local en `server.js` y la credencial se guarda en `.env`.

### 1. Configura tu `.env`

Abre [/.env](/Users/beto/Documents/GitHub/bpscalculator/.env) y pega tu key:

```env
CAPA_API_KEY=TU_API_KEY_DE_CAPA
CAPA_BASE_URL=https://staging-api.capa.fi
HOST=127.0.0.1
PORT=3000
```

Para producción:

```env
CAPA_BASE_URL=https://production-api.capa.fi
```

`.env` ya está ignorado en git por [/.gitignore](/Users/beto/Documents/GitHub/bpscalculator/.gitignore).

### 2. Levanta la app con servidor local

```bash
npm start
```

Luego abre:

```text
http://localhost:3000
```

## Deploy en Vercel

La app ya puede desplegarse en Vercel usando una Function en [api/capa/fx.js](/Users/beto/Documents/GitHub/bpscalculator/api/capa/fx.js).

Variables que debes configurar en Vercel:

```env
CAPA_API_KEY=TU_API_KEY_DE_CAPA
CAPA_BASE_URL=https://production-api.capa.fi
```

Archivos relevantes para Vercel:

- [vercel.json](/Users/beto/Documents/GitHub/bpscalculator/vercel.json)
- [api/capa/fx.js](/Users/beto/Documents/GitHub/bpscalculator/api/capa/fx.js)
- [index.html](/Users/beto/Documents/GitHub/bpscalculator/index.html)

### 3. Qué cambió

- El navegador ya no manda `partner-api-key` a Capa.
- El frontend consulta `/api/capa/fx`.
- El servidor consulta `GET /api/partner/v2/cross-ramp/quotes` en Capa.

### Archivos nuevos

- [server.js](/Users/beto/Documents/GitHub/bpscalculator/server.js)
- [package.json](/Users/beto/Documents/GitHub/bpscalculator/package.json)
- [/.env.example](/Users/beto/Documents/GitHub/bpscalculator/.env.example)
- [/.env](/Users/beto/Documents/GitHub/bpscalculator/.env)
