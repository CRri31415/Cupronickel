//! window.rs
//! 창 크기 제어. 설정의 "창 크기"(1600x900 / 1920x1080)를 실제 창에 반영한다.
//!
//! 주의(DPI): Windows에서 디스플레이 배율(125% 등)이 켜져 있으면 논리 픽셀과
//! 물리 픽셀이 달라진다. 기획서가 말하는 1600x900 등은 물리 픽셀 기준이므로
//! PhysicalSize로 설정해 배율 영향을 받지 않게 한다. 그 뒤 화면 중앙에 배치한다.

use tauri::{PhysicalSize, PhysicalPosition};

#[tauri::command]
pub fn set_window_size(window: tauri::Window, width: u32, height: u32) -> Result<(), String> {
    // 물리 픽셀 크기로 고정
    window
        .set_size(PhysicalSize::new(width, height))
        .map_err(|e| e.to_string())?;

    // 현재 모니터 기준 화면 중앙으로 이동
    if let Ok(Some(monitor)) = window.current_monitor() {
        let screen = monitor.size(); // 물리 픽셀
        let x = ((screen.width as i32) - (width as i32)) / 2;
        let y = ((screen.height as i32) - (height as i32)) / 2;
        let _ = window.set_position(PhysicalPosition::new(x.max(0), y.max(0)));
    }
    Ok(())
}
