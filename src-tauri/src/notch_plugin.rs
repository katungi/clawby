use tauri::{
    plugin::{Builder, TauriPlugin},
    Runtime, Window,
};

#[cfg(target_os = "macos")]
mod macos {
    use cocoa::appkit::NSWindowCollectionBehavior;
    use cocoa::base::{id, NO, YES};
    use objc::{class, msg_send, sel, sel_impl};
    use tauri::Window;

    /// Configure native window properties that Tauri can't set via its API:
    /// - Window level above menu bar (.statusBar = 25)
    /// - Collection behavior (all spaces, stationary, fullscreen auxiliary)
    /// - Prevents activation (doesn't steal focus)
    /// - Transparent background
    ///
    /// Positioning is handled by Tauri's own APIs — NOT by objc setFrame.
    pub fn configure_notch_window<R: tauri::Runtime>(window: &Window<R>) {
        let ns_window = window.ns_window().unwrap() as id;

        unsafe {
            // Window level .statusBar = 25, above .mainMenu = 24
            // This is what boring.notch uses to overlay the notch area
            let _: () = msg_send![ns_window, setLevel: 25_i64];

            // Borderless — no title bar, no traffic lights
            let _: () = msg_send![ns_window, setStyleMask: 0_u64];

            // Prevent activation — private API workaround since Tauri gives NSWindow not NSPanel
            let _: () = msg_send![ns_window, _setPreventsActivation: YES];

            // Collection behavior from boring.notch:
            // canJoinAllSpaces + stationary + fullScreenAuxiliary
            let behavior = NSWindowCollectionBehavior::NSWindowCollectionBehaviorCanJoinAllSpaces
                | NSWindowCollectionBehavior::NSWindowCollectionBehaviorStationary
                | NSWindowCollectionBehavior::NSWindowCollectionBehaviorFullScreenAuxiliary;
            let _: () = msg_send![ns_window, setCollectionBehavior: behavior];

            // Transparency
            let clear_color: id = msg_send![class!(NSColor), clearColor];
            let _: () = msg_send![ns_window, setBackgroundColor: clear_color];
            let _: () = msg_send![ns_window, setOpaque: NO];
            let _: () = msg_send![ns_window, setHasShadow: NO];

            // Don't hide when app loses focus
            let _: () = msg_send![ns_window, setHidesOnDeactivate: NO];
            let _: () = msg_send![ns_window, setReleasedWhenClosed: NO];
        }
    }
}

// ── Tauri Commands ──

#[tauri::command]
async fn setup_notch<R: Runtime>(window: Window<R>) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    macos::configure_notch_window(&window);
    Ok(())
}

/// Returns the cursor position in screen coordinates (top-left origin, logical points).
#[tauri::command]
async fn get_cursor_position() -> Result<(f64, f64), String> {
    #[cfg(target_os = "macos")]
    {
        use cocoa::base::id;
        use cocoa::foundation::{NSPoint, NSRect};
        use objc::{class, msg_send, sel, sel_impl};

        unsafe {
            let mouse_loc: NSPoint = msg_send![class!(NSEvent), mouseLocation];
            let main_screen: id = msg_send![class!(NSScreen), mainScreen];
            let frame: NSRect = msg_send![main_screen, frame];
            Ok((mouse_loc.x, frame.size.height - mouse_loc.y))
        }
    }
    #[cfg(not(target_os = "macos"))]
    Ok((0.0, 0.0))
}

/// Register as Tauri plugin.
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("notch")
        .invoke_handler(tauri::generate_handler![setup_notch, get_cursor_position])
        .build()
}
