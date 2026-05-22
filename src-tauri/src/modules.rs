//! modules.rs
//! 모듈 설치/제거를 담당한다.
//!
//! 기획서 규칙:
//!   - 미설치 모듈은 module/ 폴더에 압축(zip)으로 보관된다.
//!   - 설치하면 압축을 풀어 적용하고, module/ 폴더의 해당 압축은 삭제한다.
//!   - 제거하면 다시 압축해 module/ 폴더로 되돌릴 수 있다.
//!   - 안 쓰는 모듈은 메모리/성능에 영향을 주면 안 되므로,
//!     설치 여부 자체를 app/installed.json 으로 관리하고
//!     프론트엔드는 설치된 모듈의 코드만 동적 로드한다(lib/core/modules.js 참고).

use serde::{Deserialize, Serialize};
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::Path;

use crate::paths;

#[derive(Serialize, Deserialize, Clone)]
pub struct ModuleState {
    pub key: String,       // "note", "card", ...
    pub installed: bool,
}

/// 설치 목록 파일 경로(app/installed.json).
fn installed_path(app: &tauri::AppHandle) -> std::path::PathBuf {
    paths::data_root(app).join("app").join("installed.json")
}

/// 설치 상태 목록을 읽는다. 없으면 빈 목록.
#[tauri::command]
pub fn list_modules(app: tauri::AppHandle) -> Result<Vec<ModuleState>, String> {
    let p = installed_path(&app);
    if !p.exists() {
        return Ok(vec![]);
    }
    let raw = fs::read_to_string(&p).map_err(|e| e.to_string())?;
    serde_json::from_str(&raw).map_err(|e| e.to_string())
}

/// 설치 상태 목록을 저장한다.
fn save_states(app: &tauri::AppHandle, states: &[ModuleState]) -> Result<(), String> {
    let p = installed_path(app);
    if let Some(parent) = p.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let raw = serde_json::to_string_pretty(states).map_err(|e| e.to_string())?;
    fs::write(&p, raw).map_err(|e| e.to_string())
}

/// 모듈을 "설치됨"으로 표시한다.
/// module/<key>.zip 이 있으면 풀어서 적용한 뒤 그 zip을 삭제한다.
/// (alpha 단계에서는 모듈 코드가 앱에 번들되므로, 여기서는 데이터 폴더 준비 + 상태 갱신이 핵심.)
#[tauri::command]
pub fn install_module(app: tauri::AppHandle, key: String) -> Result<(), String> {
    let root = paths::data_root(&app);
    // 모듈 전용 데이터 폴더 보장
    fs::create_dir_all(paths::module_dir(&root, &key)).map_err(|e| e.to_string())?;

    // module/<key>.zip 이 있으면 데이터 루트에 풀고 삭제
    let archive = root.join("module").join(format!("{key}.zip"));
    if archive.exists() {
        unzip_into(&archive, &root).map_err(|e| e.to_string())?;
        fs::remove_file(&archive).map_err(|e| e.to_string())?;
    }

    let mut states = list_modules(app.clone())?;
    upsert(&mut states, &key, true);
    save_states(&app, &states)
}

/// 모듈을 제거한다. 데이터 폴더를 module/<key>.zip 으로 압축 보관 후 폴더를 비운다.
#[tauri::command]
pub fn uninstall_module(app: tauri::AppHandle, key: String) -> Result<(), String> {
    let root = paths::data_root(&app);
    let dir = paths::module_dir(&root, &key);
    if dir.exists() {
        let archive = root.join("module").join(format!("{key}.zip"));
        zip_dir(&dir, &archive).map_err(|e| e.to_string())?;
        fs::remove_dir_all(&dir).map_err(|e| e.to_string())?;
    }
    let mut states = list_modules(app.clone())?;
    upsert(&mut states, &key, false);
    save_states(&app, &states)
}

/// 상태 목록에서 key를 찾아 갱신하거나 새로 추가한다.
fn upsert(states: &mut Vec<ModuleState>, key: &str, installed: bool) {
    if let Some(s) = states.iter_mut().find(|s| s.key == key) {
        s.installed = installed;
    } else {
        states.push(ModuleState { key: key.into(), installed });
    }
}

// --- 압축 헬퍼 (최소 구현) ---

/// 폴더를 통째로 zip으로 묶는다(평면적, 하위 1단계 기준의 단순 구현).
fn zip_dir(src: &Path, dst: &Path) -> std::io::Result<()> {
    let file = File::create(dst)?;
    let mut zip = zip::ZipWriter::new(file);
    let opts: zip::write::FileOptions =
        zip::write::FileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    add_recursive(&mut zip, src, src, &opts)?;
    zip.finish()?;
    Ok(())
}

fn add_recursive(
    zip: &mut zip::ZipWriter<File>,
    base: &Path,
    cur: &Path,
    opts: &zip::write::FileOptions,
) -> std::io::Result<()> {
    for entry in fs::read_dir(cur)? {
        let entry = entry?;
        let path = entry.path();
        let name = path.strip_prefix(base).unwrap().to_string_lossy().replace('\\', "/");
        if path.is_dir() {
            add_recursive(zip, base, &path, opts)?;
        } else {
            zip.start_file(name, *opts)?;
            let mut f = File::open(&path)?;
            let mut buf = Vec::new();
            f.read_to_end(&mut buf)?;
            zip.write_all(&buf)?;
        }
    }
    Ok(())
}

/// zip을 대상 폴더에 푼다.
fn unzip_into(archive: &Path, dst: &Path) -> std::io::Result<()> {
    let file = File::open(archive)?;
    let mut zip = zip::ZipArchive::new(file)?;
    for i in 0..zip.len() {
        let mut entry = zip.by_index(i)?;
        let out = dst.join(entry.name());
        if entry.is_dir() {
            fs::create_dir_all(&out)?;
        } else {
            if let Some(p) = out.parent() {
                fs::create_dir_all(p)?;
            }
            let mut buf = Vec::new();
            entry.read_to_end(&mut buf)?;
            fs::write(&out, buf)?;
        }
    }
    Ok(())
}
