use tauri::{
    plugin::{Builder, TauriPlugin},
    Runtime, WebviewWindow, Window,
};

#[cfg(target_os = "macos")]
mod macos {
    use cocoa::appkit::NSWindowCollectionBehavior;
    use cocoa::base::{id, nil, NO, YES};
    use cocoa::foundation::{NSRect, NSString};
    use objc::{class, msg_send, sel, sel_impl};

    extern "C" {
        fn CGDisplayIsBuiltin(display: u32) -> i32;
    }

    /// Find the NSScreen for the built-in display (the one with the notch).
    /// Falls back to mainScreen if no built-in display is found (e.g. clamshell mode).
    unsafe fn find_builtin_screen() -> id {
        let screens: id = msg_send![class!(NSScreen), screens];
        let count: usize = msg_send![screens, count];

        for i in 0..count {
            let screen: id = msg_send![screens, objectAtIndex: i];
            let desc: id = msg_send![screen, deviceDescription];
            let key: id = NSString::alloc(nil).init_str("NSScreenNumber");
            let screen_num: id = msg_send![desc, objectForKey: key];
            let display_id: u32 = msg_send![screen_num, unsignedIntValue];

            if CGDisplayIsBuiltin(display_id) != 0 {
                return screen;
            }
        }

        // Fallback: main screen (e.g. clamshell mode with external monitor)
        msg_send![class!(NSScreen), mainScreen]
    }

    /// Configure native window properties and position on the built-in display.
    /// Takes a raw NSWindow pointer so it works with both Window and WebviewWindow.
    pub unsafe fn configure_ns_window(ns_window: id) {
        // Window level .statusBar = 25, above .mainMenu = 24
        let _: () = msg_send![ns_window, setLevel: 25_i64];

        // Borderless — no title bar, no traffic lights
        let _: () = msg_send![ns_window, setStyleMask: 0_u64];

        // Prevent activation — private API workaround since Tauri gives NSWindow not NSPanel
        let _: () = msg_send![ns_window, _setPreventsActivation: YES];

        // Collection behavior:
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

        // Position window to fill the built-in display
        let target_screen = find_builtin_screen();
        let frame: NSRect = msg_send![target_screen, frame];
        let _: () = msg_send![ns_window, setFrame: frame display: YES];
    }

    /// Get cursor position relative to the given NSWindow (top-left origin, logical points).
    pub unsafe fn cursor_position_relative_to(ns_window: id) -> (f64, f64) {
        use cocoa::foundation::NSPoint;

        let mouse_loc: NSPoint = msg_send![class!(NSEvent), mouseLocation];
        let win_frame: NSRect = msg_send![ns_window, frame];

        let x = mouse_loc.x - win_frame.origin.x;
        let y = (win_frame.origin.y + win_frame.size.height) - mouse_loc.y;
        (x, y)
    }
}

// ── Public API for lib.rs ──

/// Configure native window properties and position on the built-in display.
/// Called from setup before showing the window to avoid flicker.
pub fn configure_window<R: Runtime>(window: &WebviewWindow<R>) {
    #[cfg(target_os = "macos")]
    unsafe {
        let ns_window = window.ns_window().unwrap() as cocoa::base::id;
        macos::configure_ns_window(ns_window);
    }
}

// ── Tauri Commands ──

#[tauri::command]
async fn setup_notch<R: Runtime>(window: Window<R>) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    unsafe {
        let ns_window = window.ns_window().unwrap() as cocoa::base::id;
        macos::configure_ns_window(ns_window);
    }
    Ok(())
}

/// Returns the cursor position relative to the calling window (top-left origin, logical points).
/// This matches the web view's coordinate system (getBoundingClientRect).
#[tauri::command]
async fn get_cursor_position<R: Runtime>(window: Window<R>) -> Result<(f64, f64), String> {
    #[cfg(target_os = "macos")]
    {
        unsafe {
            let ns_window = window.ns_window().unwrap() as cocoa::base::id;
            let (x, y) = macos::cursor_position_relative_to(ns_window);
            return Ok((x, y));
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
