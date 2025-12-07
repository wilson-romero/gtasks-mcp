# GTasks MCP - Documentación Técnica

**Servidor MCP para Google Tasks**

*Fecha: 7 de Diciembre, 2025*

---

## 1. Resumen

Este documento describe las correcciones y mejoras realizadas al servidor MCP (Model Context Protocol) de Google Tasks, así como las instrucciones de instalación y configuración para Claude Desktop.

---

## 2. Bugs Corregidos

### 2.1 Bug en método search() - Tasks.ts

**Problema:** El mensaje de resultado mostraba el conteo total de tareas en lugar del conteo de tareas filtradas.

```typescript
// Antes (incorrecto)
text: `Found ${allTasks.length} tasks:\n${taskList}`

// Después (correcto)
text: `Found ${filteredItems.length} tasks:\n${taskList}`
```

### 2.2 Bug en método update() - Tasks.ts

**Problema:** Se usaba `taskUri` en lugar de `taskId` para el parámetro task de la API.

```typescript
// Antes (incorrecto)
task: taskUri,

// Después (correcto)
task: taskId,
```

### 2.3 Variables no utilizadas

- `taskStatus` en `create()` - eliminada
- `taskUri` en `update()` - eliminada junto con su validación

### 2.4 Mensaje de error incorrecto en delete()

**Problema:** El mensaje decía "Task URI is required" cuando debía decir "Task ID is required".

### 2.5 Schema de update en index.ts

**Problema:** El campo "uri" estaba en `required` pero ya no se usaba.

**Solución:** Se eliminó `uri` del schema y de los campos requeridos.

### 2.6 Bug en campo `due` (fecha de vencimiento) - Tasks.ts

**Problema:** No se podían crear ni actualizar tareas con fecha de vencimiento (`due`). Las tareas se creaban pero sin la fecha, impidiendo que aparecieran correctamente en el calendario.

**Causa:** La API de Google Tasks requiere el campo `due` en formato **RFC 3339** (`YYYY-MM-DDTHH:MM:SS.000Z`), pero el código pasaba el valor directamente sin conversión.

**Solución:** Se agregó la función `parseDueDate()` que convierte automáticamente múltiples formatos de fecha al formato RFC 3339:

```typescript
private static parseDueDate(dateInput: string | undefined): string | undefined {
  // Acepta: 2025-12-15, 12/15/2025, 2025-12-15T00:00:00Z, etc.
  // Retorna: 2025-12-15T00:00:00.000Z
}
```

**Formatos soportados:**

| Formato | Ejemplo |
|---------|---------|
| ISO | `2025-12-15` |
| RFC 3339 | `2025-12-15T00:00:00Z` |
| US (MM/DD/YYYY) | `12/15/2025` |
| EU (DD-MM-YYYY) | `15-12-2025` |
| YYYY/MM/DD | `2025/12/15` |
| Texto natural | `December 15, 2025` |

**Archivos modificados:**
- `src/Tasks.ts`: Agregada función `parseDueDate()`, modificados métodos `create()` y `update()`
- `src/index.ts`: Actualizada descripción del campo `due` en schemas de `create` y `update`

---

## 3. Mejoras Implementadas

### 3.1 Auto-refresh de tokens OAuth

Se modificó `loadCredentialsAndRunServer()` para refrescar automáticamente el access_token cuando expire.

```typescript
// Cargar client_id y client_secret desde gcp-oauth.keys.json
const keys = JSON.parse(fs.readFileSync(keysPath, 'utf-8'));
const { client_id, client_secret } = keys.installed || keys.web;

// Crear OAuth2 con credenciales completas
const auth = new google.auth.OAuth2(client_id, client_secret);
auth.setCredentials(credentials);

// Auto-refresh y guardar nuevos tokens
auth.on("tokens", (newTokens) => {
  const updated = { ...credentials, ...newTokens };
  fs.writeFileSync(credentialsPath, JSON.stringify(updated));
});
```

### 3.2 Nueva herramienta: listTaskLists

Permite listar todas las listas de tareas disponibles en la cuenta de Google.

### 3.3 Filtro por lista en list()

Ahora el método `list()` acepta un parámetro opcional `taskListId` para listar tareas de una lista específica.

---

## 4. Estructura de Archivos

| Archivo | Descripción |
|---------|-------------|
| `src/index.ts` | Servidor MCP, definición de herramientas y handlers |
| `src/Tasks.ts` | Clases TaskResources y TaskActions con la lógica de negocio |
| `dist/index.js` | Código compilado del servidor |
| `dist/Tasks.js` | Código compilado de las clases de tareas |
| `gcp-oauth.keys.json` | Credenciales OAuth de Google Cloud (client_id, client_secret) |
| `.gtasks-server-credentials.json` | Tokens de acceso del usuario (access_token, refresh_token) |

---

## 5. Instalación en Claude Desktop

### 5.1 Requisitos previos

- Node.js 18 o superior
- Claude Desktop instalado
- Proyecto en Google Cloud Console con Google Tasks API habilitada
- Credenciales OAuth 2.0 descargadas (tipo Desktop App)

### 5.2 Pasos de instalación

1. **Clonar o copiar el proyecto:**
   ```bash
   git clone https://github.com/wilson-romero/gtasks-mcp.git
   cd gtasks-mcp
   ```

2. **Instalar dependencias:**
   ```bash
   npm install
   ```

3. **Configurar credenciales OAuth:**
   
   Renombrar el archivo de credenciales descargado de Google Cloud a `gcp-oauth.keys.json` y colocarlo en la raíz del proyecto.

4. **Compilar el proyecto:**
   ```bash
   npm run build
   ```

5. **Autenticarse con Google:**
   ```bash
   node dist/index.js auth
   ```
   Esto abrirá el navegador para autorizar la aplicación.

6. **Copiar a Claude Extensions:**
   
   Copiar todo el proyecto a:
   ```
   %APPDATA%\Claude\Claude Extensions\local.unpacked.zcaceres.gtasks-mcp
   ```

7. **Reiniciar Claude Desktop**

---

## 6. Herramientas Disponibles

| Herramienta | Descripción |
|-------------|-------------|
| `listTaskLists` | Lista todas las listas de tareas disponibles |
| `list` | Lista tareas (opcionalmente filtradas por taskListId) |
| `search` | Busca tareas por título o notas |
| `create` | Crea una nueva tarea |
| `update` | Actualiza una tarea existente |
| `delete` | Elimina una tarea |
| `clear` | Limpia tareas completadas de una lista |

---

## 7. Notas Importantes

- **Formato de fechas:** Las fechas se convierten automáticamente a RFC 3339. Puedes usar: `2025-12-15`, `12/15/2025`, `2025-12-15T00:00:00Z`, o texto natural como `December 15, 2025`

- **Ubicación de Claude Extensions:** Claude Desktop usa los archivos en `%APPDATA%\Claude\Claude Extensions\`, no el directorio de desarrollo

- **Re-autenticación:** Si los tokens expiran completamente (después de ~7 días sin uso), ejecutar `node dist/index.js auth` nuevamente

- **Logs:** Los logs del MCP se encuentran en `%APPDATA%\Claude\logs\mcp-server-gtasks-mcp.log`

---

## 8. Configuración de Google Cloud

1. Ir a [Google Cloud Console](https://console.cloud.google.com/)
2. Crear un nuevo proyecto o seleccionar uno existente
3. Habilitar la **Google Tasks API**
4. Ir a **APIs & Services > Credentials**
5. Crear credenciales **OAuth 2.0 Client ID** tipo **Desktop App**
6. Descargar el JSON y renombrarlo a `gcp-oauth.keys.json`
