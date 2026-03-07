use tauri::{ActivationPolicy, Manager};

mod notch_plugin;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(notch_plugin::init())
        .setup(|app| {
            // Hide from Dock — notch overlay doesn't need a Dock icon
            app.set_activation_policy(ActivationPolicy::Accessory);

            // ── Global Shortcut Plugin ──
            #[cfg(desktop)]
            {
                use tauri::Emitter;
                use tauri_plugin_global_shortcut::{
                    Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState,
                };

                let shortcut = Shortcut::new(
                    Some(Modifiers::SUPER | Modifiers::SHIFT),
                    Code::Space,
                );

                app.handle().plugin(
                    tauri_plugin_global_shortcut::Builder::new()
                        .with_handler(move |app, _shortcut, event| {
                            if event.state() == ShortcutState::Pressed {
                                let _ = app.emit("activate", "hotkey");
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

                    #[cfg(target_os = "macos")]
                    tray.set_show_menu_on_left_click(false)?;

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

                    let app_handle = app.handle().clone();
                    tray.on_tray_icon_event(move |_tray, event| {
                        use tauri::tray::MouseButton;
                        if let TrayIconEvent::Click { button: MouseButton::Left, .. } = event {
                            let _ = app_handle.emit("activate", "tray");
                        }
                    });
                }
            }

            // ── Configure and position on the built-in display ──
            // Native setup: window level, collection behavior, transparency,
            // and positioning on the built-in screen (the one with the notch).
            let window = app.get_webview_window("main").unwrap();
            notch_plugin::configure_window(&window);

            window.set_focusable(false)?;
            window.set_ignore_cursor_events(true)?;
            window.set_visible_on_all_workspaces(true)?;
            window.show()?;



            // #[cfg(debug_assertions)]
            // window.open_devtools();

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
