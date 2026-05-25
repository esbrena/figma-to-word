# UI Translation Exporter

Plugin de Figma para generar documentos de traducciones de pantallas UI.
El flujo cubre:

1. Abrir el plugin y seleccionar una pantalla PNG o frame de Figma.
2. En el bloque principal, pulsar **Capturar pantalla seleccionada**.
3. Seleccionar una tabla editable con traducciones.
4. En el mismo bloque, pulsar **Capturar tabla seleccionada**.
5. Pulsar **Anadir otra pantalla** para crear otro bloque y repetir el proceso.
6. Revisar en la sidebar el numero de pantallas, columnas detectadas y resumen.
7. Definir el nombre del archivo y descargar PDF o Word (`.docx`).

## Que exporta

- Nombre del archivo y fecha de generacion.
- Una captura JPG de cada pantalla seleccionada.
- Al lado de cada pantalla, una tabla Word/PDF con las mismas columnas detectadas en Figma.
- Tablas de traducciones extraidas desde capas de texto editables.
- Headers con texto + bandera/texto auxiliar agrupados como una unica columna.

Si la seleccion no parece una tabla valida, el plugin muestra un error. Tambien
incluye un boton para importar una tabla plantilla editable en Figma con el
diseño de cabecera gris y filas blancas. Las columnas de la plantilla se pueden
configurar antes de importarla y despues se pueden editar directamente en Figma.

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

1. Descarga o clona el repositorio completo.
2. En Figma, ve a **Plugins > Development > Import plugin from manifest...**.
3. Selecciona `manifest.json` en la raiz del repositorio.
4. Abre el plugin desde **Plugins > Development > UI Translation Exporter**.

El repositorio incluye los archivos compilados en `dist/` para poder cargar el
plugin directamente. Si modificas el codigo fuente, ejecuta `npm run build`
antes de volver a importarlo o ejecutarlo en Figma.

## Scripts

- `npm run build`: compila el codigo principal y la UI en `dist/`.
- `npm run watch`: recompila TypeScript al cambiar archivos.
- `npm run typecheck`: valida tipos con TypeScript.
- `npm test`: ejecuta typecheck y build.