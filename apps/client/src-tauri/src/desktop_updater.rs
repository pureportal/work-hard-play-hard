use std::{
    sync::{
        Mutex,
        atomic::{AtomicU64, Ordering},
    },
    time::{Duration, Instant},
};

use tauri::{AppHandle, State, ipc::Channel};
use tauri_plugin_updater::UpdaterExt;

const RELEASE_BASE: &str = "https://github.com/pureportal/work-hard-play-hard/releases/download";

#[derive(Default)]
pub struct UpdateSession(Mutex<Option<String>>);

impl UpdateSession {
    fn is_current(&self, update_id: &str) -> Result<bool, String> {
        Ok(self.0.lock().map_err(|error| error.to_string())?.as_deref() == Some(update_id))
    }
}

#[derive(Clone, serde::Serialize)]
#[serde(tag = "phase", rename_all = "camelCase")]
pub enum UpdateProgress {
    Downloading { downloaded: u64, total: Option<u64> },
    Installing,
}

#[tauri::command]
pub async fn update_desktop(
    app: AppHandle,
    version: String,
    update_id: String,
    on_progress: Channel<UpdateProgress>,
    session: State<'_, UpdateSession>,
) -> Result<bool, String> {
    let requested = version
        .parse::<semver::Version>()
        .map_err(|_| "The server returned an invalid release version.".to_string())?;
    if !requested.build.is_empty() || requested.to_string() != version {
        return Err("The server returned an invalid release version.".to_string());
    }
    if requested == app.package_info().version {
        return Ok(false);
    }
    *session.0.lock().map_err(|error| error.to_string())? = Some(update_id.clone());

    let endpoint = format!("{RELEASE_BASE}/v{version}/updater.json")
        .parse::<url::Url>()
        .map_err(|error| error.to_string())?;
    let updater = app
        .updater_builder()
        .endpoints(vec![endpoint])
        .map_err(|error| error.to_string())?
        .version_comparator(move |current, release| {
            release.version == requested && release.version != current
        })
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|error| error.to_string())?;
    let mut update = updater
        .check()
        .await
        .map_err(|error| error.to_string())?
        .ok_or_else(|| format!("No desktop package is available for v{version}."))?;
    if !session.is_current(&update_id)? {
        return Err("Update canceled.".to_string());
    }

    update.timeout = Some(Duration::from_secs(15 * 60));
    let downloaded = AtomicU64::new(0);
    let total = AtomicU64::new(0);
    let mut last_sent: Option<Instant> = None;
    let chunk_progress = on_progress.clone();
    let finish_progress = on_progress.clone();
    let bytes = update
        .download(
            |chunk_size, content_length| {
                let received =
                    downloaded.fetch_add(chunk_size as u64, Ordering::Relaxed) + chunk_size as u64;
                total.store(content_length.unwrap_or(0), Ordering::Relaxed);
                if last_sent.is_none_or(|sent| sent.elapsed() >= Duration::from_millis(120)) {
                    let _ = chunk_progress.send(UpdateProgress::Downloading {
                        downloaded: received,
                        total: content_length,
                    });
                    last_sent = Some(Instant::now());
                }
            },
            || {
                let total_bytes = total.load(Ordering::Relaxed);
                let _ = finish_progress.send(UpdateProgress::Downloading {
                    downloaded: downloaded.load(Ordering::Relaxed),
                    total: (total_bytes > 0).then_some(total_bytes),
                });
            },
        )
        .await
        .map_err(|error| error.to_string())?;
    let active = session.0.lock().map_err(|error| error.to_string())?;
    if active.as_deref() != Some(&update_id) {
        return Err("Update canceled.".to_string());
    }
    on_progress
        .send(UpdateProgress::Installing)
        .map_err(|error| error.to_string())?;
    update.install(bytes).map_err(|error| error.to_string())?;
    drop(active);
    app.restart();
}

#[tauri::command]
pub fn cancel_desktop_update(
    update_id: String,
    session: State<'_, UpdateSession>,
) -> Result<(), String> {
    let mut active = session.0.lock().map_err(|error| error.to_string())?;
    if active.as_deref() == Some(&update_id) {
        *active = None;
    }
    Ok(())
}
