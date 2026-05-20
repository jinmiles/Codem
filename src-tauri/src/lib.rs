mod usage;

use std::sync::Mutex;
use std::time::Duration;

use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Emitter, Manager, State, Window, WindowEvent};
use usage::{
    build_error_snapshot, build_loading_snapshot, fetch_usage_snapshot, UsageSnapshot,
    TRAY_LOADING_TITLE,
};

const POLL_SECONDS: u64 = 60;
const TRAY_ID: &str = "main";
const TRAY_TOOLTIP: &str = "Codem";

struct SharedState {
    client: reqwest::Client,
    snapshot: Mutex<UsageSnapshot>,
}

impl SharedState {
    fn new() -> Self {
        Self {
            client: reqwest::Client::new(),
            snapshot: Mutex::new(build_loading_snapshot()),
        }
    }
}

#[tauri::command]
fn get_snapshot(state: State<'_, SharedState>) -> UsageSnapshot {
    state.snapshot
        .lock()
        .expect("snapshot lock poisoned")
        .clone()
}

#[tauri::command]
async fn refresh_now(app: AppHandle) -> UsageSnapshot {
    refresh_and_publish(&app).await
}

pub fn run_self_test() -> Result<(), String> {
    usage::run_self_test()
}

pub fn run() {
    tauri::Builder::default()
        .manage(SharedState::new())
        .invoke_handler(tauri::generate_handler![get_snapshot, refresh_now])
        .setup(|app| {
            configure_tray(app)?;
            let app_handle = app.handle().clone();
            start_polling(app_handle);
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                hide_window(window);
                api.prevent_close();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running Codem");
}

fn configure_tray(app: &mut tauri::App) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "Show Codem", true, None::<&str>)?;
    let refresh = MenuItem::with_id(app, "refresh", "Refresh", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit Codem", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &refresh, &quit])?;

    TrayIconBuilder::with_id(TRAY_ID)
        .icon(tray_icon())
        .menu(&menu)
        .show_menu_on_left_click(true)
        .title(TRAY_LOADING_TITLE)
        .tooltip(TRAY_TOOLTIP)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => show_main_window(app),
            "refresh" => {
                let app = app.clone();
                tauri::async_runtime::spawn(async move {
                    refresh_and_publish(&app).await;
                });
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .build(app)?;

    Ok(())
}

fn start_polling(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        refresh_and_publish(&app).await;

        loop {
            tokio::time::sleep(Duration::from_secs(POLL_SECONDS)).await;
            refresh_and_publish(&app).await;
        }
    });
}

async fn refresh_and_publish(app: &AppHandle) -> UsageSnapshot {
    let state = app.state::<SharedState>();
    let client = state.client.clone();
    let next = match fetch_usage_snapshot(&client).await {
        Ok(snapshot) => snapshot,
        Err(error) => build_error_snapshot(error),
    };

    store_snapshot(&state, next.clone());

    update_tray(app, &next);
    let _ = app.emit("usage://updated", &next);
    next
}

fn store_snapshot(state: &SharedState, next: UsageSnapshot) {
    let mut snapshot = state.snapshot.lock().expect("snapshot lock poisoned");
    *snapshot = next;
}

fn update_tray(app: &AppHandle, snapshot: &UsageSnapshot) {
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        let tooltip = snapshot.tooltip();
        let _ = tray.set_title(Some(snapshot.tray_title.as_str()));
        let _ = tray.set_tooltip(Some(tooltip.as_str()));
    }
}

fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn hide_window(window: &Window) {
    let _ = window.hide();
}

fn tray_icon() -> tauri::image::Image<'static> {
    const SIZE: u32 = 18;
    let mut rgba = Vec::with_capacity((SIZE * SIZE * 4) as usize);
    for y in 0..SIZE {
        for x in 0..SIZE {
            let dx = x as i32 - 8;
            let dy = y as i32 - 8;
            let inside = dx * dx + dy * dy <= 64;
            if inside {
                rgba.extend_from_slice(&[26, 158, 95, 255]);
            } else {
                rgba.extend_from_slice(&[0, 0, 0, 0]);
            }
        }
    }
    tauri::image::Image::new_owned(rgba, SIZE, SIZE)
}
