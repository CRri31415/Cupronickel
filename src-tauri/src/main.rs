// Cupronickel — Tauri 백엔드 진입점
// 윈도우/우분투용 PC 소프트웨어. 오프라인 우선.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod paths;
mod storage;
mod modules;

fn main() {
    tauri::Builder::default()
        // 앱 시작 시 데이터 폴더 구조를 보장한다.
        .setup(|app| {
            let root = paths::data_root(&app.handle());
            paths::ensure_structure(&root)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            storage::init_storage,
            storage::read_text,
            storage::write_text,
            storage::save_session,
            storage::load_session,
            storage::save_png,
            modules::list_modules,
            modules::install_module,
            modules::uninstall_module,
        ])
        .run(tauri::generate_context!())
        .expect("Cupronickel 실행 중 오류");
}
