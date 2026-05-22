//! storage.rs
//! 파일 입출력과 탭 세션 영속화를 담당한다.
//!
//! 탭 영속화 개념(기획서):
//!   - 활성 탭: 최근 사용되어 메모리(프론트엔드 상태)에 올라간 탭
//!   - 비활성 탭: 일정 시간 미사용 또는 종료 시점의 탭 → 디스크에 내려간다
//!   - 따라서 재실행 시 이전 탭 상태가 그대로 복원된다
//! 여기서는 "세션 스냅샷"(열린 탭 목록 + 활성 여부 + 각 탭의 가벼운 상태)을
//! app/session.json 에 저장/복원하는 책임만 가진다.
//! 무거운 본문(노트 내용 등)은 각 모듈이 자기 폴더에 따로 저장한다.

use std::fs;
use std::path::PathBuf;

use crate::paths;

/// 데이터 루트 하위의 임의 경로를 안전하게 합성한다.
/// `..` 같은 상위 탈출을 막아 데이터 루트 밖으로 나가지 못하게 한다.
fn resolve_within(app: &tauri::AppHandle, rel: &str) -> Result<PathBuf, String> {
    let root = paths::data_root(app);
    let candidate = root.join(rel);
    // 정규화 후 루트 하위인지 확인 (경로 탈출 방지)
    let normalized = normalize(&candidate);
    if !normalized.starts_with(&root) {
        return Err("데이터 루트를 벗어나는 경로입니다".into());
    }
    Ok(normalized)
}

/// 실제 파일시스템 접근 없이 `.`/`..` 요소를 정리한다.
fn normalize(p: &std::path::Path) -> PathBuf {
    let mut out = PathBuf::new();
    for comp in p.components() {
        use std::path::Component::*;
        match comp {
            ParentDir => {
                out.pop();
            }
            CurDir => {}
            other => out.push(other.as_os_str()),
        }
    }
    out
}

/// 최초 실행 시 폴더 구조를 보장하고 데이터 루트 문자열을 돌려준다.
#[tauri::command]
pub fn init_storage(app: tauri::AppHandle) -> Result<String, String> {
    let root = paths::data_root(&app);
    paths::ensure_structure(&root).map_err(|e| e.to_string())?;
    Ok(root.to_string_lossy().into_owned())
}

/// 데이터 루트 기준 상대경로의 텍스트 파일을 읽는다.
#[tauri::command]
pub fn read_text(app: tauri::AppHandle, rel: String) -> Result<String, String> {
    let path = resolve_within(&app, &rel)?;
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

/// 데이터 루트 기준 상대경로에 텍스트 파일을 쓴다(상위 폴더 자동 생성).
#[tauri::command]
pub fn write_text(app: tauri::AppHandle, rel: String, contents: String) -> Result<(), String> {
    let path = resolve_within(&app, &rel)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&path, contents).map_err(|e| e.to_string())
}

/// 세션 스냅샷(JSON 문자열)을 app/session.json 에 저장한다.
#[tauri::command]
pub fn save_session(app: tauri::AppHandle, json: String) -> Result<(), String> {
    write_text(app, "app/session.json".into(), json)
}

/// 세션 스냅샷을 읽는다. 없으면 빈 문자열을 돌려준다(최초 실행).
#[tauri::command]
pub fn load_session(app: tauri::AppHandle) -> Result<String, String> {
    match read_text(app, "app/session.json".into()) {
        Ok(s) => Ok(s),
        Err(_) => Ok(String::new()),
    }
}

/// 데이터 루트 기준 상대 폴더의 항목들을 나열한다.
/// 반환: [{name, is_dir}] (숨김/시스템 파일 제외는 호출 측에서).
#[tauri::command]
pub fn list_dir(app: tauri::AppHandle, rel: String) -> Result<Vec<serde_json::Value>, String> {
    let path = resolve_within(&app, &rel)?;
    if !path.exists() {
        return Ok(vec![]);
    }
    let mut out = vec![];
    for entry in std::fs::read_dir(&path).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let name = entry.file_name().to_string_lossy().into_owned();
        let is_dir = entry.path().is_dir();
        out.push(serde_json::json!({ "name": name, "is_dir": is_dir }));
    }
    Ok(out)
}

/// 데이터 루트 기준 상대경로의 파일 또는 폴더를 삭제한다(폴더는 재귀).
#[tauri::command]
pub fn delete_path(app: tauri::AppHandle, rel: String) -> Result<(), String> {
    let path = resolve_within(&app, &rel)?;
    if !path.exists() {
        return Ok(());
    }
    if path.is_dir() {
        std::fs::remove_dir_all(&path).map_err(|e| e.to_string())
    } else {
        std::fs::remove_file(&path).map_err(|e| e.to_string())
    }
}

/// PNG 데이터URL("data:image/png;base64,....")을 디코드하여
/// 사용자가 저장 대화상자로 고른 경로에 저장한다.
/// 그래프 다이어그램/시트의 "이미지로 내보내기"에 쓰인다.
#[tauri::command]
pub fn save_png(
    app: tauri::AppHandle,
    data_url: String,
    name: Option<String>,
) -> Result<String, String> {
    // 헤더 제거 후 base64 본문만 추출
    let b64 = data_url
        .split_once(',')
        .map(|(_, body)| body)
        .ok_or("올바른 데이터URL이 아닙니다")?;
    let bytes = base64_decode(b64).map_err(|e| e.to_string())?;

    // 저장 대화상자(동기 호출). 사용자가 취소하면 빈 결과.
    let default_name = name.unwrap_or_else(|| "export.png".into());
    let path = tauri::api::dialog::blocking::FileDialogBuilder::new()
        .set_file_name(&default_name)
        .add_filter("PNG 이미지", &["png"])
        .save_file();

    match path {
        Some(p) => {
            std::fs::write(&p, bytes).map_err(|e| e.to_string())?;
            // app_data 미사용: 사용자가 고른 임의 위치이므로 그대로 둔다.
            let _ = &app;
            Ok(p.to_string_lossy().into_owned())
        }
        None => Err("저장이 취소되었습니다".into()),
    }
}

/// 외부 크레이트 없이 표준 base64 디코딩(의존 최소화).
fn base64_decode(s: &str) -> Result<Vec<u8>, String> {
    const TABLE: &[u8; 64] =
        b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    // 역매핑 테이블
    let mut rev = [255u8; 256];
    for (i, &c) in TABLE.iter().enumerate() {
        rev[c as usize] = i as u8;
    }
    let mut out = Vec::with_capacity(s.len() / 4 * 3);
    let mut buf = 0u32;
    let mut bits = 0u32;
    for &c in s.as_bytes() {
        if c == b'=' || c == b'\n' || c == b'\r' {
            continue;
        }
        let v = rev[c as usize];
        if v == 255 {
            return Err("base64 형식 오류".into());
        }
        buf = (buf << 6) | v as u32;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push((buf >> bits) as u8);
        }
    }
    Ok(out)
}
