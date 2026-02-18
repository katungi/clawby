const isTauri = () => '__TAURI__' in window;

export async function setSettingsMode() {
  if (!isTauri()) return;

  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  const { LogicalSize } = await import('@tauri-apps/api/dpi');
  const win = getCurrentWindow();

  await win.setAlwaysOnTop(false);
  await win.setSkipTaskbar(false);
  await win.setResizable(true);
  await win.setSize(new LogicalSize(500, 650));
  await win.center();
  await win.show();
  await win.setFocus();
}

export async function setOrbMode() {
  if (!isTauri()) return;

  const { getCurrentWindow, currentMonitor } = await import('@tauri-apps/api/window');
  const { LogicalSize, LogicalPosition } = await import('@tauri-apps/api/dpi');
  const win = getCurrentWindow();

  await win.setAlwaysOnTop(true);
  await win.setSkipTaskbar(true);
  await win.setResizable(false);
  await win.setSize(new LogicalSize(280, 360));

  // Position in top-right area of screen
  const monitor = await currentMonitor();
  if (monitor) {
    const sf = monitor.scaleFactor;
    const screenW = monitor.size.width / sf;
    const x = screenW - 300;
    await win.setPosition(new LogicalPosition(x, 80));
  }

  await win.show();
  await win.setFocus();
}

export async function hideWindow() {
  if (!isTauri()) return;
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  await getCurrentWindow().hide();
}

export async function showWindow() {
  if (!isTauri()) return;
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  const win = getCurrentWindow();
  await win.show();
  await win.setFocus();
}
