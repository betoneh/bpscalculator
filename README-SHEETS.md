# Integración con Google Sheets

La BPS Calculator puede sincronizar cada log de cotización a un Google Sheet. Esto es opcional: si no configuras la URL, la app funciona normal usando solo localStorage.

## Cómo funciona

- Cada vez que creas un log (al enviar por WhatsApp o al tocar "Guardar"), la app hace un POST silencioso a un webhook de Google Apps Script.
- Cuando cambias el estado de un log (Completado / Rechazado) o editas el nombre del cliente, también se sincroniza.
- La fuente de verdad local sigue siendo el localStorage. Si el sheet está caído o sin internet, la app sigue funcionando.

## Setup — Una sola vez

### Paso 1: Crear el Google Sheet

1. Ve a https://sheets.google.com y crea un nuevo sheet en blanco.
2. Dale un nombre (ej. "BPS Calculator Logs").
3. No necesitas agregar headers manualmente — el script lo hará la primera vez.

### Paso 2: Abrir Apps Script

1. En el sheet abierto, ve a menú **Extensions → Apps Script**.
2. Se abre una ventana nueva con un editor de código.
3. Borra el código de ejemplo que trae (`function myFunction() {}`).

### Paso 3: Pegar el código

1. Abre el archivo `sheets-webhook.gs` de este repo.
2. Copia todo su contenido.
3. Pégalo en el editor de Apps Script, reemplazando lo que borraste.
4. Arriba a la izquierda, cambia el nombre del proyecto de "Sin título" a algo como "BPS Webhook".
5. Guarda con `Ctrl+S` (o `Cmd+S` en Mac).

### Paso 4: Desplegar como Web App

1. Arriba a la derecha, haz click en **Deploy → New deployment**.
2. Click en el ícono de engrane ⚙️ junto a "Select type" y elige **Web app**.
3. Llena los campos:
   - **Description**: "BPS Calculator webhook" (lo que quieras)
   - **Execute as**: **Me (tu email)** ← importante
   - **Who has access**: **Anyone** ← importante (sin autenticación)
4. Click en **Deploy**.
5. Google te va a pedir autorizar el script:
   - Click en "Authorize access"
   - Elige tu cuenta de Google
   - Puede aparecer "Google hasn't verified this app" — click en **Advanced → Go to [nombre] (unsafe)**. Es seguro porque es tu propio código.
   - Click en **Allow**.
6. Al final te va a mostrar una **Web app URL**. Se ve así:
   ```
   https://script.google.com/macros/s/AKfycbx.../exec
   ```
   **Cópiala.**

### Paso 5: Pegarla en la app

1. Abre `index.html` en tu editor.
2. Busca la línea:
   ```js
   const SHEETS_WEBHOOK_URL = '';
   ```
3. Pega tu URL entre las comillas:
   ```js
   const SHEETS_WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbx.../exec';
   ```
4. Guarda y haz push al repo.

## Probar que funciona

1. Abre la app en el navegador (en local o producción).
2. Crea una cotización y toca "Guardar" o el botón de WhatsApp.
3. Abre tu Google Sheet — debería aparecer una fila nueva en segundos.
4. Cambia el estado del log a "Completado" — la fila del sheet debería actualizarse.

## Troubleshooting

**No aparece nada en el sheet**
- Abre las DevTools del navegador (F12) y revisa la consola. Si ves `[Sheets sync] fallo silencioso`, la URL está mal o el deployment expiró.
- Verifica que la URL termine en `/exec` y no en `/dev`.
- Revisa en Apps Script → **Executions** (menú izquierdo) si hay errores en el script.

**Los updates no actualizan, siempre crean filas nuevas**
- Verifica que la columna **ID** (la última) tenga valores numéricos largos. Si el sheet está formateando los IDs como notación científica (ej. `1.74E+12`), cambia el formato de la columna J a "Texto plano" (Format → Number → Plain text).

**El sheet se está saturando**
- El script no borra filas viejas. Si quieres un rollover, puedes agregar lógica al `.gs`, o simplemente archivar manualmente de vez en cuando.

## Actualizar el script

Si cambias el código del `sheets-webhook.gs`:
1. Pega la nueva versión en el editor de Apps Script y guarda.
2. Ve a **Deploy → Manage deployments**.
3. Click en el ícono de lápiz ✏️ del deployment existente.
4. En "Version" elige **New version**.
5. Click **Deploy**.
6. La URL se mantiene igual, no necesitas actualizarla en `index.html`.
