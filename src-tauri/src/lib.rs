use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // ── Global Shortcut Plugin ──
            #[cfg(desktop)]
            {
                use tauri::Emitter;
                use tauri_plugin_global_shortcut::{
                    Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState,
                };

                // Cmd+Shift+Space (Mac) / Ctrl+Shift+Space (Windows/Linux)
                let shortcut = Shortcut::new(
                    Some(Modifiers::SUPER | Modifiers::SHIFT),
                    Code::Space,
                );

                app.handle().plugin(
                    tauri_plugin_global_shortcut::Builder::new()
                        .with_handler(move |app, _shortcut, event| {
                            if event.state() == ShortcutState::Pressed {
                                let _ = app.emit("global-shortcut", "toggle");
                            }
                        })
                        .build(),
                )?;

                app.global_shortcut().register(shortcut)?;
            }

            // ── System Tray Menu ──
            {
                use tauri::menu::{MenuBuilder, MenuItemBuilder};
                use tauri::tray::TrayIconEvent;
                use tauri::Emitter;

                let settings_item = MenuItemBuilder::with_id("settings", "Settings").build(app)?;
                let quit_item = MenuItemBuilder::with_id("quit", "Quit").build(app)?;

                let menu = MenuBuilder::new(app)
                    .item(&settings_item)
                    .separator()
                    .item(&quit_item)
                    .build()?;

                if let Some(tray) = app.tray_by_id("main-tray") {
                    tray.set_menu(Some(menu))?;

                    tray.on_menu_event(move |app, event| {
                        match event.id().as_ref() {
                            "settings" => {
                                let _ = app.emit("tray-settings", ());
                                if let Some(win) = app.get_webview_window("main") {
                                    let _ = win.show();
                                    let _ = win.set_focus();
                                }
                            }
                            "quit" => {
                                app.exit(0);
                            }
                            _ => {}
                        }
                    });

                    tray.on_tray_icon_event(|tray, event| {
                        if let TrayIconEvent::Click { .. } = event {
                            if let Some(win) = tray.app_handle().get_webview_window("main") {
                                let _ = win.show();
                                let _ = win.set_focus();
                            }
                        }
                    });
                }
            }

            // Window starts in settings mode (centered, large).
            // JS side switches to orb mode after config is loaded.

            Ok(())
        })
        .on_window_event(|window, event| {
            // Hide instead of close when user clicks X or Escape
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
