# Leonida Notes

Cuaderno de viaje **no oficial** para GTA VI, para uso personal y familiar. Toma la idea de las apps compañeras de juegos de mundo abierto: navegación con voz, medallas, bono diario, fotos y memorias. No está afiliada con Rockstar Games, Take-Two, Nintendo ni IGN.

## Funciones

| Función | Qué hace |
|---|---|
| **Navegación** | Tu mapa (captura del juego o cuadrícula) con pines en 11 categorías. Marcas tu posición y eliges "lo más cercano" (todo o por categoría): la app traza la ruta, da distancia y rumbo, y la **guía de voz** te indica. Al tocar **Llegué** ganas XP y te propone el siguiente lugar. También muestra tu progreso de descubrimiento por categoría. |
| **Mapa IGN** | Abre el mapa interactivo de IGN dentro de la app. |
| **Memorias de voz** | Grabas audios o escribes memorias para que la guía las narre. Si las vinculas a un pin, suenan al llegar. |
| **Estudio de fotos** | 7 filtros, 6 marcos (Postal, Instantánea, Neón, Cine, Revista), stickers que se pueden arrastrar, textos y fecha estilo cámara. Álbum y opción de compartir. |
| **Compartir QR** | Pasas un lugar, una lista o tu perfil a otro teléfono con un código QR, sin internet. Incluye escáner con la cámara o desde una imagen. |
| **Mis datos** | Nivel, XP, títulos, 12 medallas con 4 rangos (Bronce, Plata, Oro y Maestro) y estadísticas. |
| **Datos familiares** | Podio y comparación entre los perfiles de la familia. |
| **Bono diario** | Una ruleta al día: XP directo, XP doble o un reto con premio. |
| **Checklists, Bitácora y Sesiones** | Listas pegables, notas y cronómetro de juego con historial semanal. |

## Compilar el APK (GitHub Actions)

1. En el repo, ve a **Settings → Secrets and variables → Actions** y crea dos secretos:
   - `KEYSTORE_BASE64`: el contenido de `KEYSTORE_BASE64.txt`
   - `KEYSTORE_PASSWORD`: el contenido de `KEYSTORE_PASSWORD.txt`
2. Cada push a `main` compila el APK. También puedes ir a **Actions → Compilar APK → Run workflow**.
3. El APK queda en **Releases**. Descárgalo en el teléfono e instálalo (permite "instalar apps desconocidas").

Las versiones nuevas se instalan encima sin perder datos, siempre que uses la misma llave.

## Desarrollo

```bash
npm install
npm run serve   # prueba en el navegador: http://localhost:8765
npm run sync    # compila la web y la copia al proyecto Android
```

Código: `src/` (módulos por vista) y `www/css/app.css`.
