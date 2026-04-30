# KITT Scanner StatusBar

Extensión para Visual Studio Code que muestra un escáner estilo KITT en la barra de estado.

## Configuración

La extensión expone estos ajustes:

- `kittScanner.enabled`: muestra u oculta el escáner.
- `kittScanner.color`: color hexadecimal del escáner, por defecto `#FF0000`.
- `kittScanner.speed`: velocidad de la animación en milisegundos por frame. Un valor menor anima más rápido.

## Control externo

Otra extensión puede activar o desactivar el escáner de dos formas:

### 1. Invocando comandos

```ts
await vscode.commands.executeCommand("kittScanner.enable");
await vscode.commands.executeCommand("kittScanner.disable");
await vscode.commands.executeCommand("kittScanner.toggle");
```

Opcionalmente, se puede pasar un `vscode.ConfigurationTarget` para elegir el alcance del cambio.

### 2. Usando la API exportada

```ts
const extension = vscode.extensions.getExtension("local.kitt-scanner-statusbar");
const api = await extension?.activate();

await api?.enable();
await api?.disable(vscode.ConfigurationTarget.Workspace);
const enabled = api?.isEnabled();
```

La API pública expone `enable(target?)`, `disable(target?)`, `toggle(target?)`, `isEnabled()` y `refresh()`.

## Ejemplo

```json
{
  "kittScanner.color": "#00E5FF",
  "kittScanner.speed": 80
}
```

## Desarrollo

```bash
npm test
```
