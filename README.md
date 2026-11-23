# Leonida Companion

App compañera **no oficial** para GTA VI, para uso personal y familiar. No está afiliada con Rockstar Games, Take-Two ni IGN.

## Qué hace

- **Mapa IGN**: abre el mapa interactivo de IGN (https://www.ign.com/maps/gta-6/leonida) dentro de la app. Tu sesión de IGN se mantiene.
- **Mi mapa**: carga una captura del mapa del juego y ponle tus propios pines (11 categorías, notas, visitado/no visitado, filtros, búsqueda, mover pines). Mantén presionado para soltar un pin rápido.
- **Progreso**: checklists (misiones, coleccionables, vehículos, etc.). Puedes pegar listas enteras desde cualquier guía y compartirlas como texto por WhatsApp.
- **Notas**: bitácora con búsqueda y notas fijadas.
- **Sesiones**: cronómetro de juego e historial por perfil.
- **Perfiles**: cada persona de la familia lleva su propio progreso en el mismo teléfono.
- **Respaldo**: exporta o importa tu perfil o todo. Sirve para pasar pines y listas entre teléfonos.

## Compilar el APK (automático con GitHub Actions)

1. Sube este proyecto a un repositorio de GitHub (rama `main`).
2. En el repo, ve a **Settings → Secrets and variables → Actions → New repository secret** y crea:
   - `KEYSTORE_BASE64`: el contenido del archivo `KEYSTORE_BASE64.txt`
   - `KEYSTORE_PASSWORD`: el contenido del archivo `KEYSTORE_PASSWORD.txt`
3. En la pestaña **Actions**, abre "Compilar APK" y pulsa **Run workflow**. Cada push a `main` también lo ejecuta.
4. Al terminar (unos 5 minutos), el APK queda en **Releases**. Descárgalo en el teléfono, ábrelo y permite "instalar apps desconocidas".

Las nuevas versiones se instalan encima de la anterior sin perder datos, siempre que uses la misma llave (los secretos).

## Desarrollo

```bash
npm install
npm run serve          # prueba en el navegador: http://localhost:8765
npm run sync           # compila la web y la copia al proyecto Android
```

El código de la app está en `src/main.js` y `www/css/app.css`.
