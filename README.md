# Figma to Word/PDF

Plugin de Figma para generar un documento exportable desde los frames seleccionados.
El flujo cubre:

1. Abrir el plugin y ver la indicacion de seleccionar frames.
2. Seleccionar uno o varios frames en Figma.
3. Pulsar **Generar** para crear una previsualizacion.
4. Revisar un documento con captura visual, textos copiables, imagenes detectadas y tablas inferidas.
5. Definir el nombre del archivo.
6. Pulsar **Exportar** para descargar PDF o Word (`.docx`).

## Que exporta

- Una captura visual de cada frame seleccionado.
- Capas de texto como texto real en PDF/Word para que desarrollo pueda copiar y pegar.
- Imagenes detectadas a partir de capas con relleno de imagen.
- Tablas inferidas cuando una capa contenedora se llama `tabla` o `table`; sus textos se ordenan por posicion.

## Desarrollo

Instala dependencias:

```bash
npm install
```

Genera los archivos del plugin:

```bash
npm run build
```

Para desarrollo continuo:

```bash
npm run watch
```

> Si modificas `src/ui.html` mientras usas `watch`, vuelve a ejecutar `npm run build`
> para copiar el HTML a `dist/`.

## Cargar en Figma

1. Ejecuta `npm run build`.
2. En Figma, ve a **Plugins > Development > Import plugin from manifest...**.
3. Selecciona `manifest.json` en la raiz del repositorio.
4. Abre el plugin desde **Plugins > Development > Figma to Word/PDF**.

## Scripts

- `npm run build`: compila el codigo principal y la UI en `dist/`.
- `npm run watch`: recompila TypeScript al cambiar archivos.
- `npm run typecheck`: valida tipos con TypeScript.
- `npm test`: ejecuta typecheck y build.