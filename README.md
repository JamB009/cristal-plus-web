# Pokémon Cristal+ Web (PWA)

La misma partida y los mismos intercambios por código que la app Android, pero en el navegador: funciona en
iPhone (Safari → «Añadir a pantalla de inicio»), en Android y en escritorio. Sin servidor ni cuentas.

## Qué hay y qué no

| Sí | No (solo en la app Android) |
|---|---|
| Juego completo, sonido, controles táctiles | Pasos que suben de nivel al compañero |
| Guardado automático, exportar/importar `.sav` | Widget y mascota flotante |
| Intercambios por código `PKC1-…`, **compatibles con la app Android** | Logros y trucos |
| Funciona sin conexión una vez cargada | Estados guardados compartidos con Android |

No se incluye ninguna ROM: cada persona elige la suya (Pokémon Cristal inglés `BYTE` o español `BYTS`) y se guarda
solo en su dispositivo.

## Usarla en un iPhone

1. Abre la dirección donde esté alojada en **Safari** (no en el navegador integrado de otra app).
2. Botón **Compartir → Añadir a pantalla de inicio**. Hazlo antes de jugar: una web instalada conserva sus datos
   mucho mejor que una pestaña de Safari (que puede borrarlos tras días sin usarse).
3. Ábrela desde el icono, pulsa **Elegir ROM** y selecciona tu archivo `.gbc`.
4. El sonido empieza tras tu primer toque (regla de iOS).
5. **Haz copias de seguridad**: menú ☰ → exportar el `.sav`. Es el único respaldo si el navegador borra los datos.

## Intercambiar con la app Android

- Menú ☰ → **Intercambiar** → *Enviar un Pokémon* genera un código `PKC1-…` (se copia y se puede compartir).
- *Recibir con un código*: pega el mensaje completo, el código se encuentra solo.
- Un código sale de la app Android y se recibe aquí, y al revés. El Pokémon se guarda en el juego con START → GUARDAR.
- `node tools/decode-code.mjs "<texto con el código>"` muestra qué contiene un código.

## Desarrollo

```bash
cd web
npm install
npm test                  # unitarias (Node): lógica portada, núcleo wasm, almacenamiento, audio…
npm run test:e2e          # Playwright con Chromium emulando un iPhone 14
npm run serve             # http://127.0.0.1:8080/
```

Las pruebas necesitan las ROMs en `web/test/roms/PM_CRYSTAL_BYTE.gbc` y `PM_CRYSTAL_BYTS.gbc` (o `CRYSTAL_ROMS=/ruta`).
Esa carpeta está en `.gitignore`. Copiar desde el teléfono:

```bash
adb pull "/sdcard/Download/Pokemon Crystal.gbc"        web/test/roms/PM_CRYSTAL_BYTE.gbc
adb pull "/sdcard/Download/Pokemon Cristal (Spain).gbc" web/test/roms/PM_CRYSTAL_BYTS.gbc
```

### Pruebas contra el código Java original

`web/test/fixtures/*.json` las genera el **Java original** (`app/src/dev/jam/crystal`, sin modificar):

```bash
bash web/test/java-ref/gen.sh     # necesita javac, jq y el android.jar de la plataforma 36
```

Regenerarlas solo hace falta si cambia la lógica Java de `Trade`, `Mons`, `Party` o `GameData`.

### Compilar el núcleo (gambatte → WebAssembly)

`web/public/wasm/gambatte.{js,wasm}` ya está en el repositorio. Para recompilarlo hace falta emscripten
(`sudo pacman -S emscripten`, o un clon de `emsdk`):

```bash
EMSDK_ENV=/ruta/a/emsdk/emsdk_env.sh bash web/core/build.sh
```

El script baja gambatte-libretro en el commit fijado en `web/core/GAMBATTE_COMMIT`. Licencia: ver
`web/core/LICENSE-NOTE.md` (GPL v2: quien reciba la web debe poder obtener este código fuente).

### Safari / WebKit

Las pruebas e2e usan Chromium con la emulación de un iPhone (pantalla, táctil, DPR 3, user-agent de iOS).
Playwright también puede lanzar WebKit (`PW_WEBKIT=1 npm run test:e2e`), pero en algunos Linux faltan librerías del
sistema y no arranca. **Lo que solo se ve en Safari real (audio tras interrupciones, instalación, almacenamiento) hay
que comprobarlo en un iPhone**; lista abajo.

## Alojarla

Es un sitio estático: sirve la carpeta `web/public/` por HTTPS (GitHub Pages, Netlify, Cloudflare Pages…). No hacen
falta cabeceras especiales. Aviso: la dirección es pública si no la proteges; no contiene ROMs ni imágenes del juego,
solo el emulador y los nombres de las especies.

Al publicar una nueva versión, el service worker (`public/sw.js`) usa la red primero, así que los cambios llegan solos.
Si añades o quitas archivos de `public/`, actualiza `ASSETS` en `sw.js` (una prueba lo comprueba) y sube el número de `CACHE`.

## Comprobaciones en un iPhone real

1. Instalar en la pantalla de inicio y abrir desde el icono (pantalla completa, sin barras de Safari).
2. Elegir la ROM, ver el juego y los controles táctiles en vertical y horizontal.
3. Tocar la pantalla: se oye el sonido. Bloquear el teléfono, desbloquear, tocar: el sonido vuelve.
4. Guardar en el juego, cerrar la app del todo y reabrir: la partida sigue ahí.
5. Menú → exportar `.sav` e importarlo de vuelta.
6. Enviar un Pokémon (Compartir) y recibir uno desde la app Android, y al revés.

## Prueba rápida en el S24 (Chrome de Android)

```bash
node web/tools/serve.mjs --dev-roms &          # sirve también las ROMs locales, solo en 127.0.0.1
adb reverse tcp:8080 tcp:8080
adb shell am start -a android.intent.action.VIEW \
  -d "http://localhost:8080/?test=1\&testrom=/__dev/roms/PM_CRYSTAL_BYTS.gbc"
adb exec-out screencap -p > s24.png            # ¿se ve el juego y los controles?
adb reverse --remove-all; kill %1
```
