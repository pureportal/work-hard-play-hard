#[cfg(desktop)]
mod desktop_updater;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default().plugin(tauri_plugin_opener::init());
    #[cfg(desktop)]
    let builder = builder
        .manage(desktop_updater::UpdateSession::default())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            desktop_updater::update_desktop,
            desktop_updater::cancel_desktop_update
        ]);

    builder
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
