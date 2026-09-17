#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|_app| {
            #[cfg(target_os = "linux")]
            {
                use tauri::Manager;
                use webkit2gtk::{CookieManagerExt, WebContextExt, WebViewExt};

                _app.get_webview_window("main")
                    .expect("main window is missing")
                    .with_webview(|webview| {
                        webview
                            .inner()
                            .context()
                            .expect("webview context is missing")
                            .cookie_manager()
                            .expect("cookie manager is missing")
                            .set_accept_policy(webkit2gtk::CookieAcceptPolicy::Always);
                    })?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("failed to run Northstar");
}
